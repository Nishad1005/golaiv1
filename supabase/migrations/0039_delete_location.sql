-- Golai — Migration 0039: delete an over-created location
--
-- Bulk generators (pallet grids, shelf runs) can create more locations than a
-- warehouse actually has. This lets an admin remove one: the shelf is
-- soft-deleted (deleted_at) so it drops out of every list while its history in
-- the movement ledger still resolves, and its current-stock rows are cleared so
-- the removed location can't keep counting toward item totals. The UI warns and
-- lists what's inside first; this only runs once the admin confirms.
--
-- ADDITIVE ONLY: one new function. stock_balances has no client write policy
-- (0017), so clearing it must go through this guarded wrapper.

create or replace function delete_location(p_shelf_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_module('admin_zones') then
    raise exception 'You do not have permission to delete locations';
  end if;

  -- Clear this location's current stock attribution (the ledger tables — GRN
  -- putaways, transfers, issues, placements — are untouched, and the shelf row
  -- stays, just flagged deleted, so those references still resolve).
  delete from stock_balances
   where shelf_id = p_shelf_id and tenant_id = current_tenant_id();

  update shelves set deleted_at = now(), updated_at = now()
   where id = p_shelf_id and tenant_id = current_tenant_id() and deleted_at is null;
  if not found then raise exception 'Location not found in your company'; end if;
end;
$$;

revoke all on function delete_location(uuid) from public, anon;
grant execute on function delete_location(uuid) to authenticated;

comment on function delete_location(uuid) is
  'Soft-deletes a shelf/location and clears its current stock_balances. Gated on '
  'admin_zones. History (ledger tables) is preserved; the UI warns if occupied.';
