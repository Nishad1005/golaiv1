-- Golai — Migration 0029: set a product's unit from the quantity screens
--
-- A product's unit (items.uom) should be pickable exactly where a quantity is
-- entered — Assign Location, Capture, Adjust, Stock Counts — so nobody has to
-- go to the Items master first. But 0017 revoked direct item writes from
-- everyone except admins (admin_items), so a storekeeper cannot update it.
--
-- This adds a narrow, guarded wrapper that changes ONLY items.uom, callable by
-- anyone who legitimately records a quantity. Same pattern as next_item_code
-- (0024): a security-definer function gated on the modules that need it.

create or replace function set_item_uom(p_item_id uuid, p_uom text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    has_module('capture') or has_module('assign') or has_module('adjust')
    or has_module('counts') or has_module('admin_items')
  ) then
    raise exception 'You do not have permission to change a product''s unit';
  end if;

  if coalesce(trim(p_uom), '') = '' then
    raise exception 'Unit is required';
  end if;

  update items
     set uom = trim(p_uom), updated_at = now()
   where id = p_item_id and tenant_id = current_tenant_id();
  if not found then raise exception 'Product not found in your company'; end if;
end;
$$;

revoke all on function set_item_uom(uuid, text) from public, anon;
grant execute on function set_item_uom(uuid, text) to authenticated;

comment on function set_item_uom(uuid, text) is
  'Updates only items.uom, for callers who enter quantities (capture/assign/'
  'adjust/counts/admin_items). Relabels existing quantities; does not convert.';
