-- Golai — Migration 0030: costing template corrections
--
-- Two client corrections to the seeded costing categories:
--   1. "Hessian / Jute fabric" → "Hassain / Jute fabric" (their spelling).
--   2. Wood Length is measured in FEET, not inches. The volume_rate maths
--      (L × W × T ÷ 144 × qty) already assumes length in feet with width and
--      thickness in inches — the chair proves it (2.75 ft × 3 in × 2.5 in ÷ 144
--      × 5 = 0.716 cft) — so only the field's unit LABEL was wrong. No formula
--      change; this just relabels "in" → "ft".
--
-- Categories are per-tenant DATA seeded from a template, so we (a) fix rows
-- already seeded for existing tenants and (b) redefine the template so new
-- tenants seed correctly. Safe: UPDATEs hit 0 rows for any tenant without
-- costing, and this touches only costing_* — nothing on the warehouse floor.

-- ---------------------------------------------------------------------------
-- 1. Fix rows already seeded
-- ---------------------------------------------------------------------------
update costing_categories
   set name = 'Hassain / Jute fabric'
 where key = 'hessian' and name = 'Hessian / Jute fabric';

update costing_category_fields f
   set unit = 'ft'
  from costing_categories c
 where f.category_id = c.id
   and c.key = 'wood'
   and f.key = 'length'
   and f.unit is distinct from 'ft';

-- ---------------------------------------------------------------------------
-- 2. Redefine the template so new tenants seed with the corrections
--    (identical to 0027 except wood length "u":"ft" and the Hassain name)
-- ---------------------------------------------------------------------------
create or replace function seed_costing_template()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_cat    jsonb;
  v_field  jsonb;
  v_cat_id uuid;
  v_n      integer := 0;
  v_i      integer;
  v_template jsonb := '[
    {"key":"wood","name":"Wood","kind":"volume_rate","fields":[
      {"k":"type","l":"Type","t":"text"},{"k":"length","l":"Length","t":"number","u":"ft"},
      {"k":"width","l":"Width","t":"number","u":"in"},{"k":"thickness","l":"Thickness","t":"number","u":"in"},
      {"k":"qty","l":"Qty","t":"number"},{"k":"rate","l":"Price / cft","t":"number"}]},
    {"key":"plywood","name":"Plywood","kind":"area_yield","fields":[
      {"k":"cutting_size","l":"Cutting size","t":"text"},{"k":"thickness","l":"Thickness","t":"number","u":"mm"},
      {"k":"qty","l":"Qty","t":"number"},{"k":"sheet_size","l":"Plywood size","t":"text"},
      {"k":"area","l":"Sq feet","t":"number"},{"k":"per_sheet","l":"Pcs / plywood","t":"number"},
      {"k":"rate","l":"Price / sq ft","t":"number"}]},
    {"key":"metal","name":"Metal","kind":"qty_rate","fields":[
      {"k":"size","l":"Size","t":"text"},{"k":"thickness","l":"Thickness","t":"number"},
      {"k":"qty","l":"Weight (kg)","t":"number"},{"k":"rate","l":"Price / kg","t":"number"}]},
    {"key":"spring","name":"Spring","kind":"length_rate","fields":[
      {"k":"position","l":"Seat / back","t":"text"},{"k":"code","l":"Code","t":"text"},
      {"k":"length","l":"Length","t":"number","u":"ft"},{"k":"qty","l":"Qty","t":"number"},
      {"k":"rate","l":"Price / ft","t":"number"}]},
    {"key":"belt","name":"Belt","kind":"qty_rate","fields":[
      {"k":"position","l":"Seat / back","t":"text"},{"k":"code","l":"Code","t":"text"},
      {"k":"qty","l":"Length","t":"number","u":"m"},{"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"spring_clips","name":"Spring clips","kind":"qty_rate","fields":[
      {"k":"qty","l":"Qty","t":"number"},{"k":"rate","l":"Price","t":"number"}]},
    {"key":"tie_wire","name":"Spring tie paper wire","kind":"qty_rate","fields":[
      {"k":"qty","l":"Length","t":"number","u":"m"},{"k":"rate","l":"Price","t":"number"}]},
    {"key":"hessian","name":"Hassain / Jute fabric","kind":"qty_rate","fields":[
      {"k":"qty","l":"Metres","t":"number","u":"m"},{"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"satin","name":"Satin / Dacking fabric","kind":"qty_rate","fields":[
      {"k":"qty","l":"Metres","t":"number","u":"m"},{"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"non_woven","name":"Non woven","kind":"qty_rate","fields":[
      {"k":"colour","l":"Colour","t":"text"},{"k":"gsm","l":"GSM","t":"number"},
      {"k":"qty","l":"Consumption / pc","t":"number","u":"m"},{"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"foam","name":"Foam","kind":"sheet_yield","fields":[
      {"k":"colour","l":"Colour","t":"text"},{"k":"length","l":"Length","t":"number","u":"in"},
      {"k":"width","l":"Width","t":"number","u":"in"},{"k":"qty","l":"Qty","t":"number"},
      {"k":"per_sheet","l":"Pieces / sheet","t":"number"},
      {"k":"sheet_size","l":"Sheet size","t":"rate_lookup"}]},
    {"key":"fibre_wadding","name":"Fibre wadding","kind":"qty_rate","fields":[
      {"k":"gsm","l":"GSM","t":"number"},{"k":"qty","l":"Metres","t":"number","u":"m"},
      {"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"poly_fibre","name":"Poly fibre","kind":"qty_rate","fields":[
      {"k":"qty","l":"Weight","t":"number","u":"g"},{"k":"rate","l":"Price / g","t":"number"}]},
    {"key":"thread","name":"Thread","kind":"fixed","fields":[
      {"k":"type","l":"Type","t":"text"},{"k":"code","l":"Code","t":"text"},
      {"k":"amount","l":"Total price","t":"number"}]},
    {"key":"fabric","name":"Fabric","kind":"qty_rate","fields":[
      {"k":"code","l":"Code","t":"text"},{"k":"width","l":"Width","t":"number"},
      {"k":"qty","l":"Consumption / pc","t":"number","u":"m"},{"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"piping","name":"Piping","kind":"qty_rate","fields":[
      {"k":"code","l":"Code","t":"text"},{"k":"size_mm","l":"Size","t":"number","u":"mm"},
      {"k":"qty","l":"Length","t":"number","u":"m"},{"k":"rate","l":"Price / m","t":"number"}]},
    {"key":"button","name":"Button","kind":"qty_rate","fields":[
      {"k":"code","l":"Code","t":"text"},{"k":"size","l":"Size","t":"text"},
      {"k":"qty","l":"Pcs","t":"number"},{"k":"rate","l":"Price / pc","t":"number"}]},
    {"key":"chain","name":"Chain","kind":"qty_rate","fields":[
      {"k":"code","l":"Code","t":"text"},{"k":"qty","l":"Consumption","t":"number","u":"ft"},
      {"k":"rate","l":"Price / ft","t":"number"}]},
    {"key":"chain_puller","name":"Chain puller","kind":"qty_rate","fields":[
      {"k":"code","l":"Code","t":"text"},{"k":"qty","l":"Qty","t":"number"},
      {"k":"rate","l":"Price","t":"number"}]},
    {"key":"brass_cup","name":"Brass cup for leg","kind":"qty_rate","fields":[
      {"k":"size","l":"Size","t":"text"},{"k":"qty","l":"Qty","t":"number"},
      {"k":"rate","l":"Price / pc","t":"number"}]},
    {"key":"carton","name":"Carton box","kind":"qty_rate","fields":[
      {"k":"type","l":"Type","t":"text"},{"k":"length","l":"Length","t":"number","u":"in"},
      {"k":"width","l":"Width","t":"number","u":"in"},{"k":"height","l":"Height","t":"number","u":"in"},
      {"k":"qty","l":"Qty","t":"number"},{"k":"rate","l":"Price","t":"number"}]},
    {"key":"packing","name":"Packing","kind":"fixed","fields":[
      {"k":"amount","l":"Packing price","t":"number"}]},
    {"key":"labour","name":"Labour","kind":"fixed","fields":[
      {"k":"amount","l":"Labour","t":"number"}]},
    {"key":"finishing","name":"Finishing","kind":"fixed","fields":[
      {"k":"amount","l":"Finishing","t":"number"}]},
    {"key":"cnf","name":"CNF","kind":"fixed","fields":[
      {"k":"amount","l":"CNF","t":"number"}]},
    {"key":"misc","name":"Miscellaneous","kind":"fixed","fields":[
      {"k":"amount","l":"Amount","t":"number"}]},
    {"key":"other","name":"Other","kind":"fixed","fields":[
      {"k":"label","l":"Description","t":"text"},{"k":"amount","l":"Amount","t":"number"}]}
  ]'::jsonb;
begin
  perform require_costing();

  v_i := 0;
  for v_cat in select * from jsonb_array_elements(v_template)
  loop
    v_i := v_i + 1;

    select id into v_cat_id from costing_categories
     where tenant_id = v_tenant and key = v_cat->>'key';
    if v_cat_id is not null then
      continue;
    end if;

    insert into costing_categories (tenant_id, key, name, sort_order, formula_kind)
    values (v_tenant, v_cat->>'key', v_cat->>'name', v_i * 10, v_cat->>'kind')
    returning id into v_cat_id;

    for v_field in select * from jsonb_array_elements(v_cat->'fields')
    loop
      insert into costing_category_fields (category_id, key, label, data_type, unit, sort_order)
      values (
        v_cat_id, v_field->>'k', v_field->>'l',
        coalesce(v_field->>'t', 'number'), v_field->>'u',
        coalesce((select count(*)::int from costing_category_fields where category_id = v_cat_id), 0)
      );
    end loop;

    v_n := v_n + 1;
  end loop;

  if not exists (select 1 from costing_rate_tables where tenant_id = v_tenant and key = 'foam_sheet') then
    insert into costing_rate_tables (tenant_id, key, name, note)
    values (v_tenant, 'foam_sheet', 'Foam sheet price',
            'Price per sheet by size. Change here and every sheet reprices.');
  end if;

  return v_n;
end;
$$;

grant execute on function seed_costing_template() to authenticated;
