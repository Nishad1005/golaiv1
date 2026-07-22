-- Golai — Migration 0020: manager stock overview
--
-- The manager home showed activity (GRNs today, pending approvals) but nothing
-- about stock itself — the first question any owner asks is "how much do I
-- have?". Aggregating this in the browser would mean shipping every
-- stock_balances row to the phone on each home load, so it is one view that
-- returns a single row.
--
-- security_invoker = true so each underlying table's RLS decides what this
-- user can see; without it the view would run as its owner and count every
-- tenant's stock.

create or replace view stock_overview with (security_invoker = true) as
with balances as (
  select
    item_id,
    sum(qty_on_hand)      as on_hand,
    sum(qty_on_hold)      as on_hold,
    max(last_movement_at) as last_movement_at
  from stock_balances
  group by item_id
),
live_items as (
  select i.id, i.reorder_point
  from items i
  where i.status = 'active' and i.deleted_at is null
)
select
  (select count(*) from live_items) as items_total,

  (select count(*) from live_items li join balances b on b.item_id = li.id
    where b.on_hand > 0) as items_in_stock,

  -- "Nothing on the shelf" — includes items never located at all
  (select count(*) from live_items li left join balances b on b.item_id = li.id
    where coalesce(b.on_hand, 0) = 0) as items_out_of_stock,

  -- At or below the reorder point, but not yet empty
  (select count(*) from live_items li join balances b on b.item_id = li.id
    where li.reorder_point is not null
      and b.on_hand > 0 and b.on_hand <= li.reorder_point) as items_low_stock,

  -- Sitting untouched for 90 days while still holding stock (PRD 8.4)
  (select count(*) from live_items li join balances b on b.item_id = li.id
    where b.on_hand > 0
      and b.last_movement_at < now() - interval '90 days') as items_dead_stock,

  (select coalesce(sum(on_hold), 0) from balances) as qty_on_hold,

  (select count(*) from shelves where deleted_at is null) as locations_total,

  (select count(distinct shelf_id) from stock_balances
    where qty_on_hand > 0) as locations_used;

comment on view stock_overview is
  'One row of live stock counts for the manager dashboard. Quantities only, '
  'never values — valuation stays in the ERP.';

grant select on stock_overview to authenticated;
