-- Aksure v1.0 — Migration 0007: Release Request → Issuance → Returns RPCs
-- (PRD 4.4–4.6). The central v1.0 flow: planner requests against an SO ref,
-- manager approves, storekeeper fulfills (stock moves, labels print),
-- unused material returns against the original issuance.

-- ---------------------------------------------------------------------------
-- Create release request (planner). Lines: [{item_id, qty_requested}]
-- ---------------------------------------------------------------------------
create or replace function create_release_request(
  p_so_ref text,
  p_customer_note text,
  p_department_id uuid,
  p_foreman_id uuid,
  p_required_by date,
  p_notes text,
  p_lines jsonb
)
returns table (rr_id uuid, rr_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rr_id uuid;
  v_number text;
  v_line jsonb;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'At least one item line is required';
  end if;

  v_number := 'RR-' || to_char(now(), 'YYYY-MM') || '-' || lpad(next_sequence('rr')::text, 4, '0');

  insert into release_requests (
    tenant_id, rr_number, so_ref, customer_note, department_id, foreman_id,
    required_by, notes, status, created_by
  )
  values (
    current_tenant_id(), v_number, nullif(trim(coalesce(p_so_ref, '')), ''),
    nullif(trim(coalesce(p_customer_note, '')), ''), p_department_id, p_foreman_id,
    p_required_by, nullif(trim(coalesce(p_notes, '')), ''), 'DRAFT', auth.uid()
  )
  returning id into v_rr_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if coalesce((v_line->>'qty_requested')::numeric, 0) <= 0 then
      raise exception 'Requested quantity must be greater than zero';
    end if;
    insert into release_request_lines (tenant_id, release_request_id, item_id, qty_requested)
    values (current_tenant_id(), v_rr_id, (v_line->>'item_id')::uuid,
            (v_line->>'qty_requested')::numeric);
  end loop;

  insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
  values (current_tenant_id(), 'rr_pending_approval', 'info', 'release_request', v_rr_id,
          'Release request ' || v_number || ' awaiting manager approval');

  return query select v_rr_id, v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manager approves or cancels a DRAFT release request.
-- ---------------------------------------------------------------------------
create or replace function decide_release_request(
  p_rr_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status rr_status;
  v_number text;
begin
  if current_user_role() not in ('manager', 'admin') then
    raise exception 'Only manager or admin can approve release requests';
  end if;

  select status, rr_number into v_status, v_number from release_requests
  where id = p_rr_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Release request not found';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'Release request already decided';
  end if;

  update release_requests
  set status = case when p_approve then 'APPROVED'::rr_status else 'CANCELLED'::rr_status end,
      approved_by = auth.uid(),
      updated_at = now()
  where id = p_rr_id;

  if p_approve then
    insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
    values (current_tenant_id(), 'rr_to_fulfill', 'info', 'release_request', p_rr_id,
            'Release request ' || v_number || ' approved — ready to fulfill');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fulfill an approved RR → creates the Issuance, moves stock off shelves.
-- Lines: [{rr_line_id, item_id, shelf_id, qty}]
-- ---------------------------------------------------------------------------
create or replace function fulfill_release_request(
  p_rr_id uuid,
  p_lines jsonb,
  p_photo_urls jsonb,
  p_signature_url text
)
returns table (issuance_id uuid, iss_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rr release_requests%rowtype;
  v_iss_id uuid;
  v_number text;
  v_line jsonb;
  v_qty numeric;
  v_requested numeric;
  v_already numeric;
  v_all_fulfilled boolean;
begin
  select * into v_rr from release_requests
  where id = p_rr_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Release request not found';
  end if;
  if v_rr.status not in ('APPROVED', 'PARTIALLY_FULFILLED') then
    raise exception 'Release request is not approved for fulfillment';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Nothing to issue';
  end if;

  v_number := 'ISS-' || to_char(now(), 'YYYY-MM') || '-' || lpad(next_sequence('iss')::text, 4, '0');

  insert into issuances (
    tenant_id, iss_number, release_request_id, so_ref, customer_note,
    department_id, foreman_id, foreman_signature_url, storekeeper_id, photo_urls
  )
  values (
    current_tenant_id(), v_number, p_rr_id, v_rr.so_ref, v_rr.customer_note,
    v_rr.department_id, v_rr.foreman_id, p_signature_url, auth.uid(),
    coalesce(p_photo_urls, '[]')
  )
  returning id into v_iss_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty')::numeric;
    if v_qty <= 0 then
      raise exception 'Issue quantity must be greater than zero';
    end if;

    -- Guard against over-issuing a request line
    select qty_requested, qty_issued into v_requested, v_already
    from release_request_lines
    where id = (v_line->>'rr_line_id')::uuid and release_request_id = p_rr_id
    for update;
    if not found then
      raise exception 'Release request line not found';
    end if;
    if v_already + v_qty > v_requested then
      raise exception 'Issuing % exceeds remaining requested quantity (% of % already issued)',
        v_qty, v_already, v_requested;
    end if;

    perform move_stock((v_line->>'item_id')::uuid, (v_line->>'shelf_id')::uuid, -v_qty);

    insert into issuance_lines (tenant_id, issuance_id, item_id, shelf_id, qty, label_printed_at)
    values (current_tenant_id(), v_iss_id, (v_line->>'item_id')::uuid,
            (v_line->>'shelf_id')::uuid, v_qty, now());

    update release_request_lines
    set qty_issued = qty_issued + v_qty
    where id = (v_line->>'rr_line_id')::uuid;
  end loop;

  select bool_and(qty_issued >= qty_requested) into v_all_fulfilled
  from release_request_lines where release_request_id = p_rr_id;

  update release_requests
  set status = case when v_all_fulfilled then 'FULFILLED'::rr_status
                    else 'PARTIALLY_FULFILLED'::rr_status end,
      updated_at = now()
  where id = p_rr_id;

  return query select v_iss_id, v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Return against an issuance. Lines: [{item_id, shelf_id, qty}]
-- Validates qty ≤ issued minus already returned, per item.
-- ---------------------------------------------------------------------------
create or replace function create_return(
  p_issuance_id uuid,
  p_return_type return_type,
  p_reason_code text,
  p_photo_urls jsonb,
  p_lines jsonb
)
returns table (return_id uuid, ret_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iss issuances%rowtype;
  v_ret_id uuid;
  v_number text;
  v_line jsonb;
  v_qty numeric;
  v_issued numeric;
  v_returned numeric;
begin
  select * into v_iss from issuances
  where id = p_issuance_id and tenant_id = current_tenant_id();

  if not found then
    raise exception 'Issuance not found';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Nothing to return';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'Reason code is mandatory';
  end if;

  v_number := 'RET-' || to_char(now(), 'YYYY-MM') || '-' || lpad(next_sequence('ret')::text, 4, '0');

  insert into returns (
    tenant_id, ret_number, source_issuance_id, so_ref, return_type,
    reason_code, photo_urls, returned_by
  )
  values (
    current_tenant_id(), v_number, p_issuance_id, v_iss.so_ref, p_return_type,
    p_reason_code, coalesce(p_photo_urls, '[]'), auth.uid()
  )
  returning id into v_ret_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty')::numeric;
    if v_qty <= 0 then
      raise exception 'Return quantity must be greater than zero';
    end if;

    select coalesce(sum(qty), 0) into v_issued
    from issuance_lines
    where issuance_id = p_issuance_id and item_id = (v_line->>'item_id')::uuid;

    select coalesce(sum(rl.qty), 0) into v_returned
    from return_lines rl
    join returns r on r.id = rl.return_id
    where r.source_issuance_id = p_issuance_id
      and rl.item_id = (v_line->>'item_id')::uuid
      and rl.return_id <> v_ret_id;

    if v_qty > v_issued - v_returned then
      raise exception 'Return of % exceeds outstanding issued quantity (%)',
        v_qty, v_issued - v_returned;
    end if;

    perform move_stock((v_line->>'item_id')::uuid, (v_line->>'shelf_id')::uuid, v_qty);

    insert into return_lines (tenant_id, return_id, item_id, shelf_id, qty)
    values (current_tenant_id(), v_ret_id, (v_line->>'item_id')::uuid,
            (v_line->>'shelf_id')::uuid, v_qty);
  end loop;

  return query select v_ret_id, v_number;
end;
$$;
