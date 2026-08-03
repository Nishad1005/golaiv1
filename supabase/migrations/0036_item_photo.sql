-- Golai — Migration 0036: a product photo for identification
--
-- The stock-take team can't always tell which physical item a name/code means.
-- A photo per product, previewed wherever a product is picked, removes the
-- guesswork. Staff attach it in the flow (Assign / Counts) and on the stock card.
--
-- 0017 restricts direct items writes to admin_items/capture, so counting staff
-- can't set it directly. This adds a narrow, guarded wrapper that changes ONLY
-- items.photo_url — the exact pattern of set_item_uom (0029).
--
-- ADDITIVE ONLY: one nullable column + one new function. No policy or data change.

alter table items add column if not exists photo_url text;

comment on column items.photo_url is
  'Storage path (photos bucket) of a product identification photo; rendered via signed URLs. Null = none.';

create or replace function set_item_photo(p_item_id uuid, p_photo_url text)
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
    raise exception 'You do not have permission to change a product''s photo';
  end if;

  update items
     set photo_url = nullif(trim(coalesce(p_photo_url, '')), ''), updated_at = now()
   where id = p_item_id and tenant_id = current_tenant_id();
  if not found then raise exception 'Product not found in your company'; end if;
end;
$$;

revoke all on function set_item_photo(uuid, text) from public, anon;
grant execute on function set_item_photo(uuid, text) to authenticated;

comment on function set_item_photo(uuid, text) is
  'Updates only items.photo_url, for callers in the stock-take flow (capture/'
  'assign/adjust/counts/admin_items). Pass null/empty to clear.';
