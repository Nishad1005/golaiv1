-- Aksure v1.0 — Migration 0006: GRN 3-stage workflow RPCs (PRD 4.3)
-- Stage 1 gate entry → Stage 2 storekeeper verification → Stage 3 putaway.

-- Move quantity in/out of the QC-hold bucket on a shelf.
create or replace function move_stock_hold(
  p_item_id uuid,
  p_shelf_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into stock_balances (tenant_id, item_id, shelf_id, qty_on_hand, qty_on_hold, last_movement_at)
  values (current_tenant_id(), p_item_id, p_shelf_id, 0, greatest(p_delta, 0), now())
  on conflict (item_id, shelf_id) do update
    set qty_on_hold = stock_balances.qty_on_hold + p_delta,
        last_movement_at = now();

  if (select qty_on_hold from stock_balances
      where item_id = p_item_id and shelf_id = p_shelf_id) < 0 then
    raise exception 'Insufficient held stock on shelf';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage 1 — Security gate entry. Creates GRN (DRAFT) + gate entry record,
-- allocates GRN/YYYY-MM/NNNN, notifies storekeepers via alerts.
-- ---------------------------------------------------------------------------
create or replace function create_grn_gate_entry(
  p_supplier_id uuid,
  p_supplier_name_freetext text,
  p_po_ref text,
  p_material_type text,
  p_cartons integer,
  p_vehicle_number text,
  p_vehicle_photos jsonb,
  p_driver_name text,
  p_driver_phone text,
  p_driver_license text,
  p_driver_photos jsonb,
  p_transporter text,
  p_document_photos jsonb
)
returns table (grn_id uuid, grn_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grn_id uuid;
  v_number text;
begin
  if jsonb_array_length(coalesce(p_document_photos, '[]'::jsonb)) = 0 then
    raise exception 'At least one document photo (invoice / e-way bill / LR) is mandatory';
  end if;

  v_number := 'GRN/' || to_char(now(), 'YYYY-MM') || '/' || lpad(next_sequence('grn')::text, 4, '0');

  insert into grns (
    tenant_id, grn_number, supplier_id, supplier_name_freetext, po_ref,
    status, total_cartons_declared, material_type_declared, created_by
  )
  values (
    current_tenant_id(), v_number, p_supplier_id, p_supplier_name_freetext, p_po_ref,
    'DRAFT', p_cartons, p_material_type, auth.uid()
  )
  returning id into v_grn_id;

  insert into grn_gate_entries (
    tenant_id, grn_id, vehicle_number, vehicle_photos, driver_name, driver_phone,
    driver_license, driver_photos, transporter, document_photos, security_guard_id
  )
  values (
    current_tenant_id(), v_grn_id, p_vehicle_number, coalesce(p_vehicle_photos, '[]'),
    p_driver_name, p_driver_phone, p_driver_license, coalesce(p_driver_photos, '[]'),
    p_transporter, p_document_photos, auth.uid()
  );

  insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
  values (
    current_tenant_id(), 'grn_pending_verification', 'info', 'grn', v_grn_id,
    'Vehicle at gate: ' || v_number || ' from ' ||
    coalesce(p_supplier_name_freetext, 'supplier') || ' awaiting verification'
  );

  return query select v_grn_id, v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage 2 — Verification. Lines passed as jsonb array:
-- [{item_id, qty_received, qty_invoice, qty_po, variance_reason, qc_status,
--   damage_photos, notes}]
-- ---------------------------------------------------------------------------
create or replace function verify_grn(
  p_grn_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status grn_status;
  v_line jsonb;
begin
  select status into v_status from grns
  where id = p_grn_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'GRN not found';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'GRN is not in DRAFT status';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line is required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if coalesce((v_line->>'qty_received')::numeric, -1) < 0 then
      raise exception 'Received quantity missing or negative';
    end if;
    -- Short/excess receipts require a typed reason (PRD smart validation)
    if (v_line->>'qty_invoice') is not null
       and (v_line->>'qty_received')::numeric <> (v_line->>'qty_invoice')::numeric
       and coalesce(trim(v_line->>'variance_reason'), '') = '' then
      raise exception 'Variance between invoice and received qty requires a reason';
    end if;

    insert into grn_lines (
      tenant_id, grn_id, item_id, qty_received, qty_invoice, qty_po,
      variance_reason, qc_status, damage_photos, notes
    )
    values (
      current_tenant_id(), p_grn_id,
      (v_line->>'item_id')::uuid,
      (v_line->>'qty_received')::numeric,
      nullif(v_line->>'qty_invoice', '')::numeric,
      nullif(v_line->>'qty_po', '')::numeric,
      nullif(trim(coalesce(v_line->>'variance_reason', '')), ''),
      coalesce(nullif(v_line->>'qc_status', ''), 'OK')::qc_line_status,
      coalesce(v_line->'damage_photos', '[]'::jsonb),
      nullif(trim(coalesce(v_line->>'notes', '')), '')
    );
  end loop;

  update grns set status = 'VERIFIED', updated_at = now() where id = p_grn_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage 3 — Putaway. Can be called per line multiple times (split shelves).
-- OK lines add to qty_on_hand; HOLD lines add to qty_on_hold and open a QC
-- hold record; REJECT lines are never putaway. When every OK/HOLD line is
-- fully placed, the GRN flips to COMPLETED.
-- ---------------------------------------------------------------------------
create or replace function putaway_grn_line(
  p_grn_line_id uuid,
  p_shelf_id uuid,
  p_qty numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line grn_lines%rowtype;
  v_placed numeric;
  v_remaining_total numeric;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_line from grn_lines
  where id = p_grn_line_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'GRN line not found';
  end if;
  if v_line.qc_status = 'REJECT' then
    raise exception 'Rejected lines are not putaway (process as RTV)';
  end if;

  select coalesce(sum(qty), 0) into v_placed
  from grn_putaways where grn_line_id = p_grn_line_id;

  if v_placed + p_qty > v_line.qty_received then
    raise exception 'Putaway exceeds received quantity (% of % already placed)',
      v_placed, v_line.qty_received;
  end if;

  insert into grn_putaways (tenant_id, grn_line_id, shelf_id, qty, putaway_by)
  values (current_tenant_id(), p_grn_line_id, p_shelf_id, p_qty, auth.uid());

  if v_line.qc_status = 'HOLD' then
    perform move_stock_hold(v_line.item_id, p_shelf_id, p_qty);
    insert into qc_holds (tenant_id, item_id, shelf_id, qty, source_grn_line_id)
    values (current_tenant_id(), v_line.item_id, p_shelf_id, p_qty, p_grn_line_id);
  else
    perform move_stock(v_line.item_id, p_shelf_id, p_qty);
  end if;

  -- Completed when nothing placeable remains across the whole GRN
  select coalesce(sum(l.qty_received), 0) - coalesce((
    select sum(p.qty) from grn_putaways p
    join grn_lines l2 on l2.id = p.grn_line_id
    where l2.grn_id = v_line.grn_id
  ), 0)
  into v_remaining_total
  from grn_lines l
  where l.grn_id = v_line.grn_id and l.qc_status <> 'REJECT';

  if v_remaining_total <= 0 then
    update grns set status = 'COMPLETED', updated_at = now() where id = v_line.grn_id;
  end if;
end;
$$;
