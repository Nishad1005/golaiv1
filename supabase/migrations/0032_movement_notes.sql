-- Golai — Migration 0032: show each module's note in the movement history
--
-- The stock card (item_movements view) fed its `note` column the coded
-- reason_code for adjustments, so the free-text note a user typed
-- (adjustments.reason_note) never appeared. This rebuilds the view so every
-- module's human note/reason surfaces on the stock card:
--   adjust        reason_code — reason_note
--   grn           variance_reason / notes (PO ref as fallback)
--   issue         so_ref · customer_note
--   direct issue  work_order_no · issued_to
--   dispatch      so_ref · customer_note
--   transfer/qc/return keep their existing reason
--
-- nullif(btrim(x),'') turns blank strings into NULL so concat_ws / coalesce
-- don't leave dangling separators. Read-only view rebuild; no data change,
-- nothing else touched.

drop view if exists item_movements;

create view item_movements with (security_invoker = true) as
select
  gp.tenant_id, gl.item_id, gp.shelf_id, gp.putaway_at as moved_at,
  'grn'::text as kind, gp.qty as qty, g.grn_number as reference,
  g.id as reference_id, gp.putaway_by as person_id,
  coalesce(nullif(btrim(gl.variance_reason), ''), nullif(btrim(gl.notes), ''), g.po_ref) as note
from grn_putaways gp
join grn_lines gl on gl.id = gp.grn_line_id
join grns g on g.id = gl.grn_id
union all
select e.tenant_id, e.item_id, e.shelf_id, e.captured_at, 'capture',
  coalesce(e.qty_delta, e.qty), null, e.id, e.captured_by, null
from entries e
where e.status = 'active' and coalesce(e.qty_delta, e.qty) <> 0
union all
select t.tenant_id, t.item_id, t.source_shelf_id, t.transferred_at, 'transfer_out',
  -t.qty, null, t.id, t.transferred_by, nullif(btrim(t.reason), '')
from transfers t
union all
select t.tenant_id, t.item_id, t.destination_shelf_id, t.transferred_at, 'transfer_in',
  t.qty, null, t.id, t.transferred_by, nullif(btrim(t.reason), '')
from transfers t
union all
select il.tenant_id, il.item_id, il.shelf_id, i.issued_at, 'issue', -il.qty,
  i.iss_number, i.id, i.storekeeper_id,
  nullif(concat_ws(' · ', nullif(btrim(i.so_ref), ''), nullif(btrim(i.customer_note), '')), '')
from issuance_lines il
join issuances i on i.id = il.issuance_id
union all
-- Direct issue (Issuance module): who it went to, against which work order.
select sil.tenant_id, sil.item_id, sil.shelf_id, si.created_at, 'issue', -sil.qty,
  si.issue_number, si.id, si.issued_by,
  nullif(concat_ws(' · ', nullif(btrim(si.work_order_no), ''), nullif(btrim(si.issued_to), '')), '')
from stock_issue_lines sil
join stock_issues si on si.id = sil.stock_issue_id
union all
select rl.tenant_id, rl.item_id, rl.shelf_id, r.returned_at, 'return', rl.qty,
  r.ret_number, r.id, r.returned_by, nullif(btrim(r.reason_code), '')
from return_lines rl
join returns r on r.id = rl.return_id
union all
select dl.tenant_id, dl.item_id, dl.shelf_id, d.created_at, 'dispatch', -dl.qty,
  d.dc_number, d.id, d.picked_by,
  nullif(concat_ws(' · ', nullif(btrim(d.so_ref), ''), nullif(btrim(d.customer_note), '')), '')
from dispatch_lines dl
join dispatches d on d.id = dl.dispatch_id
where d.status <> 'REJECTED'
union all
-- Adjust: show both the coded reason AND the free-text note the user typed.
select a.tenant_id, a.item_id, a.shelf_id, a.updated_at, 'adjust', a.qty_change,
  null, a.id, coalesce(a.approved_by, a.adjusted_by),
  concat_ws(' — ', a.reason_code, nullif(btrim(a.reason_note), ''))
from adjustments a
where a.status = 'APPROVED'
union all
select q.tenant_id, q.item_id, q.shelf_id, q.decided_at, 'qc_release', q.qty,
  null, q.id, q.inspected_by, nullif(btrim(q.reason), '')
from qc_holds q
where q.decision = 'RELEASE' and q.shelf_id is not null and q.decided_at is not null
union all
select p.tenant_id, p.item_id, p.shelf_id, p.assigned_at, 'placement',
  p.qty_after - p.qty_before, null, p.id, p.assigned_by, null
from placements p;

comment on view item_movements is
  'Every stock movement, signed (+ in / - out), across all modules, with each '
  'movement''s human note/reason. Powers the item movement history and dashboard.';

grant select on item_movements to authenticated;
