-- Golai — Migration 0012: assign products to a location (the mapping walk)
--
-- Clients whose products carry no barcodes map their warehouse by walking it:
-- scan the location's barcode, search the product by name, tap. This records
-- WHERE a product lives. Unlike capture_entry, a quantity of 0 is valid and
-- expected — "located, not yet counted" — because knowing the location is the
-- first goal; real counts follow later via a stock count.

create or replace function assign_placements(
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
  v_qty numeric;
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
    v_qty := coalesce(nullif(v_line->>'qty', '')::numeric, 0);
    if v_qty < 0 then
      raise exception 'Quantity cannot be negative';
    end if;

    -- Purely additive mapping: sets the balance for this item at this location.
    -- Re-assigning the same item updates the quantity rather than duplicating.
    insert into stock_balances (tenant_id, item_id, shelf_id, qty_on_hand, last_movement_at)
    values (current_tenant_id(), (v_line->>'item_id')::uuid, p_shelf_id, v_qty, now())
    on conflict (item_id, shelf_id) do update
      set qty_on_hand = excluded.qty_on_hand,
          last_movement_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
