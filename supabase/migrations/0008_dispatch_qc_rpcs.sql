-- Aksure v1.0 — Migration 0008: Dispatch 3-stage workflow + QC hold decisions
-- (PRD 4.7, 4.8). Pick → manager approval → security gate-out.

-- ---------------------------------------------------------------------------
-- Stage 1 — Picking. Lines: [{item_id, shelf_id, qty, carton_barcode}]
-- Stock is decremented at pick time (material physically leaves shelves).
-- ---------------------------------------------------------------------------
create or replace function create_dispatch(
  p_so_ref text,
  p_customer_id uuid,
  p_customer_note text,
  p_photo_urls jsonb,
  p_lines jsonb
)
returns table (dispatch_id uuid, dc_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc_id uuid;
  v_number text;
  v_line jsonb;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'At least one picked line is required';
  end if;

  v_number := 'DC/' || to_char(now(), 'YYYY-MM') || '/' || lpad(next_sequence('dc')::text, 4, '0');

  insert into dispatches (
    tenant_id, dc_number, so_ref, customer_id, customer_note, status, picked_by, photo_urls
  )
  values (
    current_tenant_id(), v_number, nullif(trim(coalesce(p_so_ref, '')), ''),
    p_customer_id, nullif(trim(coalesce(p_customer_note, '')), ''), 'PICKED',
    auth.uid(), coalesce(p_photo_urls, '[]')
  )
  returning id into v_dc_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if coalesce((v_line->>'qty')::numeric, 0) <= 0 then
      raise exception 'Pick quantity must be greater than zero';
    end if;
    perform move_stock((v_line->>'item_id')::uuid, (v_line->>'shelf_id')::uuid,
                       -((v_line->>'qty')::numeric));
    insert into dispatch_lines (tenant_id, dispatch_id, item_id, shelf_id, qty, carton_barcode)
    values (current_tenant_id(), v_dc_id, (v_line->>'item_id')::uuid,
            (v_line->>'shelf_id')::uuid, (v_line->>'qty')::numeric,
            nullif(v_line->>'carton_barcode', ''));
  end loop;

  insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
  values (current_tenant_id(), 'dc_pending_approval', 'info', 'dispatch', v_dc_id,
          'Dispatch ' || v_number || ' picked — awaiting manager approval');

  return query select v_dc_id, v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage 2 — Manager approval. Reject restores picked stock to its shelves
-- ("returns to picking", PRD step 52).
-- ---------------------------------------------------------------------------
create or replace function decide_dispatch(
  p_dispatch_id uuid,
  p_approve boolean,
  p_reject_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc dispatches%rowtype;
  v_line record;
begin
  if current_user_role() not in ('manager', 'admin') then
    raise exception 'Only manager or admin can approve dispatches';
  end if;

  select * into v_dc from dispatches
  where id = p_dispatch_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Dispatch not found';
  end if;
  if v_dc.status <> 'PICKED' then
    raise exception 'Dispatch is not awaiting approval';
  end if;

  if p_approve then
    update dispatches
    set status = 'READY', approved_by = auth.uid(), updated_at = now()
    where id = p_dispatch_id;

    insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
    values (current_tenant_id(), 'dc_ready_gate_out', 'info', 'dispatch', p_dispatch_id,
            'Dispatch ' || v_dc.dc_number || ' approved — ready for gate-out');
  else
    if coalesce(trim(p_reject_reason), '') = '' then
      raise exception 'Rejection requires a reason';
    end if;
    for v_line in select item_id, shelf_id, qty from dispatch_lines
                  where dispatch_id = p_dispatch_id
    loop
      perform move_stock(v_line.item_id, v_line.shelf_id, v_line.qty);
    end loop;
    update dispatches
    set status = 'REJECTED', approved_by = auth.uid(),
        reject_reason = p_reject_reason, updated_at = now()
    where id = p_dispatch_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stage 3 — Security gate-out. Every sealed carton must have been scanned;
-- the scanned set must exactly cover the DC's carton barcodes.
-- ---------------------------------------------------------------------------
create or replace function gate_out_dispatch(
  p_dispatch_id uuid,
  p_vehicle_number text,
  p_vehicle_photos jsonb,
  p_driver_name text,
  p_driver_license text,
  p_lr_number text,
  p_lr_photo text,
  p_eway_bill_photo text,
  p_departure_photo text,
  p_scanned_cartons jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc dispatches%rowtype;
  v_expected text[];
  v_scanned text[];
begin
  select * into v_dc from dispatches
  where id = p_dispatch_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Dispatch not found';
  end if;
  if v_dc.status <> 'READY' then
    raise exception 'Dispatch is not approved for gate-out';
  end if;

  select array_agg(distinct carton_barcode) into v_expected
  from dispatch_lines
  where dispatch_id = p_dispatch_id and carton_barcode is not null;

  select array_agg(distinct value) into v_scanned
  from jsonb_array_elements_text(coalesce(p_scanned_cartons, '[]'::jsonb));

  if v_expected is not null and (
       v_scanned is null
       or not (v_expected <@ v_scanned and v_scanned <@ v_expected)
     ) then
    raise exception 'Scanned cartons do not match this DC — every sealed carton must be scanned';
  end if;

  insert into dispatch_gate_exits (
    tenant_id, dispatch_id, vehicle_number, vehicle_photos, driver_name,
    driver_license, lr_number, lr_photo, eway_bill_photo, departure_photo,
    security_guard_id
  )
  values (
    current_tenant_id(), p_dispatch_id, p_vehicle_number,
    coalesce(p_vehicle_photos, '[]'), p_driver_name, p_driver_license,
    p_lr_number, p_lr_photo, p_eway_bill_photo, p_departure_photo, auth.uid()
  );

  update dispatches set status = 'DISPATCHED', updated_at = now()
  where id = p_dispatch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- QC hold decision (PRD 4.8): RELEASE moves qty from hold to general stock on
-- the same shelf; REJECT removes it from hold (leaves as scrap/RTV, out of
-- available stock either way).
-- ---------------------------------------------------------------------------
create or replace function decide_qc_hold(
  p_qc_hold_id uuid,
  p_decision qc_decision,
  p_reason text,
  p_photo_urls jsonb default '[]'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold qc_holds%rowtype;
begin
  if current_user_role() not in ('manager', 'admin') then
    raise exception 'Only manager or admin can decide QC holds';
  end if;

  select * into v_hold from qc_holds
  where id = p_qc_hold_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'QC hold not found';
  end if;
  if v_hold.decision is not null then
    raise exception 'QC hold already decided';
  end if;
  if v_hold.shelf_id is null then
    raise exception 'QC hold has no shelf — put the material away first';
  end if;

  perform move_stock_hold(v_hold.item_id, v_hold.shelf_id, -v_hold.qty);
  if p_decision = 'RELEASE' then
    perform move_stock(v_hold.item_id, v_hold.shelf_id, v_hold.qty);
  end if;

  update qc_holds
  set decision = p_decision,
      reason = p_reason,
      photo_urls = coalesce(p_photo_urls, '[]'),
      inspected_by = auth.uid(),
      decided_at = now()
  where id = p_qc_hold_id;
end;
$$;
