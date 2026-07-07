-- Aksure v1.0 — Migration 0005: atomic stock RPCs + photo storage
-- Business transactions and their stock-balance updates must be one atomic
-- unit, so the app calls these functions instead of separate inserts.

-- ---------------------------------------------------------------------------
-- Capture: record what is physically on a shelf.
-- p_mode 'add'  → qty is added on top of current balance (merge)
-- p_mode 'set'  → qty replaces the current balance (recount/replace)
-- ---------------------------------------------------------------------------
create or replace function capture_entry(
  p_shelf_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_mode text default 'add',
  p_photo_urls jsonb default '[]',
  p_lock_hours integer default 24
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_current numeric;
  v_delta numeric;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_mode not in ('add', 'set') then
    raise exception 'Invalid mode %', p_mode;
  end if;

  select coalesce(qty_on_hand, 0) into v_current
  from stock_balances
  where item_id = p_item_id and shelf_id = p_shelf_id
  for update;

  v_current := coalesce(v_current, 0);
  v_delta := case when p_mode = 'set' then p_qty - v_current else p_qty end;

  perform move_stock(p_item_id, p_shelf_id, v_delta);

  insert into entries (tenant_id, shelf_id, item_id, qty, photo_urls, captured_by, locked_until)
  values (
    current_tenant_id(), p_shelf_id, p_item_id, p_qty, p_photo_urls, auth.uid(),
    now() + make_interval(hours => coalesce(p_lock_hours, 24))
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal transfer: decrement source, increment destination, one record.
-- ---------------------------------------------------------------------------
create or replace function transfer_stock(
  p_source_shelf_id uuid,
  p_destination_shelf_id uuid,
  p_item_id uuid,
  p_qty numeric,
  p_reason text default null,
  p_photo_urls jsonb default '[]',
  p_manual_entry boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer_id uuid;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_source_shelf_id = p_destination_shelf_id then
    raise exception 'Source and destination shelves are the same';
  end if;

  perform move_stock(p_item_id, p_source_shelf_id, -p_qty); -- raises if insufficient
  perform move_stock(p_item_id, p_destination_shelf_id, p_qty);

  insert into transfers (
    tenant_id, source_shelf_id, destination_shelf_id, item_id, qty,
    reason, photo_urls, transferred_by, manual_entry
  )
  values (
    current_tenant_id(), p_source_shelf_id, p_destination_shelf_id, p_item_id, p_qty,
    p_reason, p_photo_urls, auth.uid(), p_manual_entry
  )
  returning id into v_transfer_id;

  return v_transfer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adjustment decision: manager approves (stock moves) or rejects.
-- ---------------------------------------------------------------------------
create or replace function decide_adjustment(
  p_adjustment_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj adjustments%rowtype;
begin
  if current_user_role() not in ('manager', 'admin') then
    raise exception 'Only manager or admin can decide adjustments';
  end if;

  select * into v_adj from adjustments
  where id = p_adjustment_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Adjustment not found';
  end if;
  if v_adj.status <> 'PENDING' then
    raise exception 'Adjustment already decided';
  end if;

  if p_approve then
    perform move_stock(v_adj.item_id, v_adj.shelf_id, v_adj.qty_change);
    update adjustments
    set status = 'APPROVED', approved_by = auth.uid(), updated_at = now()
    where id = p_adjustment_id;
  else
    update adjustments
    set status = 'REJECTED', approved_by = auth.uid(), updated_at = now()
    where id = p_adjustment_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Photo storage bucket. Paths are namespaced by tenant: <tenant_id>/<...>.
-- Private bucket; app reads via signed URLs (1h expiry, PRD 8.2).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy photos_tenant_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

create policy photos_tenant_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );
