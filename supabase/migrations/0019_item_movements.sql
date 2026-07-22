-- Golai — Migration 0019: item movement history (the "stock card")
--
-- Every movement type already exists in its own table; nothing joins them, so
-- a manager cannot answer "what came in, what went out, and what's left" for a
-- single product. This adds one view that unions them all.
--
-- Building it exposed two gaps, both fixed here:
--   1. entries.qty stores the number the storekeeper TYPED, not the change to
--      stock. In 'set' mode (recount) the two differ, so a ledger built on
--      entries.qty would be wrong. Adds entries.qty_delta.
--   2. assign_placements wrote stock_balances directly and left no record, so
--      the mapping walk was invisible in history. Adds a placements table.

-- ---------------------------------------------------------------------------
-- 1. Capture: record the actual change to stock, not the typed quantity
-- ---------------------------------------------------------------------------
alter table entries add column if not exists qty_delta numeric;

-- Existing rows: 'add' captures (the overwhelming majority) had delta = qty.
-- 'set' captures cannot be reconstructed, so this is the best available value.
update entries set qty_delta = qty where qty_delta is null;

create or replace function capture_entry_impl(
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

  insert into entries (tenant_id, shelf_id, item_id, qty, qty_delta, photo_urls, captured_by, locked_until)
  values (
    current_tenant_id(), p_shelf_id, p_item_id, p_qty, v_delta, p_photo_urls, auth.uid(),
    now() + make_interval(hours => coalesce(p_lock_hours, 24))
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Placements: an audit trail for the mapping walk
-- ---------------------------------------------------------------------------
create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  shelf_id uuid not null references shelves (id),
  item_id uuid not null references items (id),
  qty_before numeric not null default 0,
  qty_after numeric not null,
  assigned_by uuid not null references profiles (id),
  assigned_at timestamptz not null default now()
);

create index if not exists placements_tenant_item_idx on placements (tenant_id, item_id);

alter table placements enable row level security;

drop policy if exists placements_read on placements;
create policy placements_read on placements for select
  using (tenant_id = current_tenant_id());
-- No write policy: rows are inserted only by assign_placements_impl, which is
-- security definer and therefore bypasses RLS. A crafted API call cannot write.

create or replace function assign_placements_impl(
  p_shelf_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_before numeric;
  v_count integer := 0;
begin
  if current_user_role() not in ('storekeeper', 'manager', 'admin') then
    raise exception 'You do not have permission to assign locations';
  end if;

  if not exists (
    select 1 from shelves
    where id = p_shelf_id and tenant_id = current_tenant_id() and deleted_at is null
  ) then
    raise exception 'Location not found';
  end if;

  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    raise exception 'Nothing to assign';
  end if;

  for v_line in select * from jsonb_array_elements(p_rows)
  loop
    v_item_id := (v_line->>'item_id')::uuid;
    v_qty := coalesce(nullif(v_line->>'qty', '')::numeric, 0);
    if v_qty < 0 then
      raise exception 'Quantity cannot be negative';
    end if;

    select coalesce(qty_on_hand, 0) into v_before
    from stock_balances
    where item_id = v_item_id and shelf_id = p_shelf_id;
    v_before := coalesce(v_before, 0);

    -- Purely additive mapping: sets the balance for this item at this location.
    -- Re-assigning the same item updates the quantity rather than duplicating.
    insert into stock_balances (tenant_id, item_id, shelf_id, qty_on_hand, last_movement_at)
    values (current_tenant_id(), v_item_id, p_shelf_id, v_qty, now())
    on conflict (item_id, shelf_id) do update
      set qty_on_hand = excluded.qty_on_hand,
          last_movement_at = now();

    insert into placements (tenant_id, shelf_id, item_id, qty_before, qty_after, assigned_by)
    values (current_tenant_id(), p_shelf_id, v_item_id, v_before, v_qty, auth.uid());

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The ledger
--
-- One row per stock movement, signed: positive came in, negative went out.
-- Security: this is a plain view over RLS-protected tables, created without
-- security_invoker, so it would run as its owner and leak across tenants —
-- hence security_invoker = true, which makes each underlying table's RLS apply
-- to the caller. Every row also carries tenant_id so callers can filter too.
-- ---------------------------------------------------------------------------
drop view if exists item_movements;

create view item_movements with (security_invoker = true) as

-- Goods received and put away
select
  gp.tenant_id, gl.item_id, gp.shelf_id,
  gp.putaway_at            as moved_at,
  'grn'::text              as kind,
  gp.qty                   as qty,
  g.grn_number             as reference,
  g.id                     as reference_id,
  gp.putaway_by            as person_id,
  g.po_ref                 as note
from grn_putaways gp
join grn_lines gl on gl.id = gp.grn_line_id
join grns g on g.id = gl.grn_id

union all

-- Capture (discovery scan). qty_delta is the change to stock; a recount that
-- lowered the count shows as negative, which is correct.
select
  e.tenant_id, e.item_id, e.shelf_id,
  e.captured_at, 'capture', coalesce(e.qty_delta, e.qty),
  null, e.id, e.captured_by, null
from entries e
where e.status = 'active' and coalesce(e.qty_delta, e.qty) <> 0

union all

-- Internal transfer: two halves, so both locations show the movement
select
  t.tenant_id, t.item_id, t.source_shelf_id,
  t.transferred_at, 'transfer_out', -t.qty,
  null, t.id, t.transferred_by, t.reason
from transfers t

union all

select
  t.tenant_id, t.item_id, t.destination_shelf_id,
  t.transferred_at, 'transfer_in', t.qty,
  null, t.id, t.transferred_by, t.reason
from transfers t

union all

-- Issued to production
select
  il.tenant_id, il.item_id, il.shelf_id,
  i.issued_at, 'issue', -il.qty,
  i.iss_number, i.id, i.storekeeper_id, i.so_ref
from issuance_lines il
join issuances i on i.id = il.issuance_id

union all

-- Returned from production / customer
select
  rl.tenant_id, rl.item_id, rl.shelf_id,
  r.returned_at, 'return', rl.qty,
  r.ret_number, r.id, r.returned_by, r.reason_code
from return_lines rl
join returns r on r.id = rl.return_id

union all

-- Dispatched to a customer. Stock leaves at picking; a rejected dispatch puts
-- it straight back, so those never happened as far as the ledger is concerned.
select
  dl.tenant_id, dl.item_id, dl.shelf_id,
  d.created_at, 'dispatch', -dl.qty,
  d.dc_number, d.id, d.picked_by, d.so_ref
from dispatch_lines dl
join dispatches d on d.id = dl.dispatch_id
where d.status <> 'REJECTED'

union all

-- Approved corrections only — a pending adjustment has not moved anything
select
  a.tenant_id, a.item_id, a.shelf_id,
  a.updated_at, 'adjust', a.qty_change,
  null, a.id, coalesce(a.approved_by, a.adjusted_by), a.reason_code
from adjustments a
where a.status = 'APPROVED'

union all

-- Released from QC hold back into usable stock
select
  q.tenant_id, q.item_id, q.shelf_id,
  q.decided_at, 'qc_release', q.qty,
  null, q.id, q.inspected_by, q.reason
from qc_holds q
where q.decision = 'RELEASE' and q.shelf_id is not null and q.decided_at is not null

union all

-- The mapping walk: recorded where a product sits, and set its count
select
  p.tenant_id, p.item_id, p.shelf_id,
  p.assigned_at, 'placement', p.qty_after - p.qty_before,
  null, p.id, p.assigned_by, null
from placements p;

comment on view item_movements is
  'Every stock movement, signed (+ in / - out), across all modules. Powers the '
  'item movement history and the manager stock dashboard.';

grant select on item_movements to authenticated;
grant select on placements to authenticated;
