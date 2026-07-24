-- Golai — Migration 0028: seed the foam sheet price grid
--
-- Their spreadsheet hides a simple rule inside a VLOOKUP table: for a 72×36
-- sheet the price is thickness_mm × 21, and a 72×48 sheet is the same scaled by
-- 24/18. Twelve rows, and it is the one real lookup in the whole workbook.
--
-- Seeded so foam costing works against their actual numbers on day one instead
-- of an empty dropdown. Idempotent and non-destructive: it fills the table only
-- when it is empty, so a rate the client has since corrected is never
-- overwritten.

create or replace function seed_costing_foam_rates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   uuid := current_tenant_id();
  v_table_id uuid;
  v_base     numeric := 21;      -- their BS26
  v_mm       integer;
  v_n        integer := 0;
begin
  perform require_costing();

  select id into v_table_id
    from costing_rate_tables
   where tenant_id = v_tenant and key = 'foam_sheet';

  if v_table_id is null then
    insert into costing_rate_tables (tenant_id, key, name, note)
    values (v_tenant, 'foam_sheet', 'Foam sheet price',
            'Price per sheet by size. Change a rate here and every costing sheet reprices.')
    returning id into v_table_id;
  end if;

  -- Never touch a table the client has already populated or corrected.
  if exists (select 1 from costing_rate_entries where rate_table_id = v_table_id) then
    return 0;
  end if;

  foreach v_mm in array array[6, 10, 25, 50, 75, 100]
  loop
    insert into costing_rate_entries
      (rate_table_id, tenant_id, lookup_key, attributes, rate)
    values
      (v_table_id, v_tenant, '72x36x' || v_mm,
       jsonb_build_object('sheet', '72x36', 'thickness_mm', v_mm),
       v_mm * v_base),
      (v_table_id, v_tenant, '72x48x' || v_mm,
       jsonb_build_object('sheet', '72x48', 'thickness_mm', v_mm),
       round((v_mm * v_base / 18) * 24, 2));
    v_n := v_n + 2;
  end loop;

  return v_n;
end;
$$;

grant execute on function seed_costing_foam_rates() to authenticated;

comment on function seed_costing_foam_rates() is
  'Fills the foam sheet price grid from the client''s own rule '
  '(thickness_mm x 21 for 72x36, scaled 24/18 for 72x48). Only runs on an '
  'empty table.';
