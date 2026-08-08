-- Golai — Migration 0045: per-item stock view for the Items list filters
--
-- The dashboard tiles "Items in stock" and "Nothing on shelf" both linked to the
-- full item master, so drilling in showed all products rather than the found /
-- not-found subset. This view adds each item's total on_hand so the Items screen
-- can filter to in-stock (on_hand > 0) or not-on-shelf (on_hand = 0) — matching
-- the counts in stock_overview (0020).
--
-- security_invoker so the caller's RLS on items + stock_balances applies (a view
-- would otherwise run as owner and cross tenants). ADDITIVE ONLY: one view; no
-- table, RPC, or policy change.

create or replace view item_stock with (security_invoker = true) as
select i.*, coalesce(b.on_hand, 0) as on_hand
from items i
left join (
  select item_id, sum(qty_on_hand) as on_hand
  from stock_balances
  group by item_id
) b on b.item_id = i.id;

grant select on item_stock to authenticated;

comment on view item_stock is
  'Each item with its total on_hand (0 when never located). Powers the Items '
  'screen In-stock / Not-on-shelf filters. Quantities only, never value.';
