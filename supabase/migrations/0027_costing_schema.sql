-- Golai — Migration 0027: costing module, schema and template
--
-- Replaces the client's costing spreadsheet. See docs/costing-module-plan.md.
--
-- The boundary this module must never cross: costing CALCULATES an estimated
-- cost. It never values stock and never posts an accounting entry. Tally keeps
-- valuation. Nothing here reads or writes stock_balances.
--
-- ADDITIVE ONLY — new tables and functions. Nothing existing is altered.
-- Every table is gated on the company holding the 'costing' licence (0025/0026)
-- as well as the usual tenant_id + RLS, so a company without it sees nothing
-- even if rows somehow existed.

-- ---------------------------------------------------------------------------
-- Guard: costing licence + personal access, in one call
-- ---------------------------------------------------------------------------
create or replace function require_costing()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_module('costing') then
    raise exception 'Costing is not enabled for your company.'
      using errcode = '42501';
  end if;
end;
$$;

grant execute on function require_costing() to authenticated;

-- ---------------------------------------------------------------------------
-- Categories — the blocks of the sheet (Wood, Plywood, Foam …)
--
-- Per tenant, because the next client will not cost furniture. Seeded from a
-- template so U&M start with their 31 and can diverge later.
-- ---------------------------------------------------------------------------
create table if not exists costing_categories (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  key          text not null,
  name         text not null,
  sort_order   integer not null default 0,
  -- one of the shapes in src/lib/costing/formulas.ts
  formula_kind text not null default 'qty_rate',
  config       jsonb not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists costing_category_fields (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references costing_categories (id) on delete cascade,
  key         text not null,
  label       text not null,
  data_type   text not null default 'number',   -- number | text | rate_lookup
  unit        text,
  sort_order  integer not null default 0,
  is_input    boolean not null default true,    -- false = derived, shown read-only
  required    boolean not null default false,
  unique (category_id, key)
);

-- ---------------------------------------------------------------------------
-- Rate tables — the fix for "the spreadsheet is hard to maintain"
--
-- In their Excel a price change means editing it in twenty places. Here a rate
-- lives once and every sheet that references it reprices. effective_from keeps
-- the history, so a sheet costed in March can still be explained in December.
-- ---------------------------------------------------------------------------
create table if not exists costing_rate_tables (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  key       text not null,
  name      text not null,
  note      text,
  unique (tenant_id, key)
);

create table if not exists costing_rate_entries (
  id             uuid primary key default gen_random_uuid(),
  rate_table_id  uuid not null references costing_rate_tables (id) on delete cascade,
  tenant_id      uuid not null references tenants (id) on delete cascade,
  lookup_key     text not null,                 -- e.g. '72x36x50'
  attributes     jsonb not null default '{}',   -- supplier, FR/non-FR, …
  rate           numeric not null check (rate >= 0),
  effective_from date not null default current_date,
  effective_to   date,
  created_at     timestamptz not null default now()
);

create index if not exists costing_rate_entries_lookup_idx
  on costing_rate_entries (rate_table_id, lookup_key, effective_from desc);

-- ---------------------------------------------------------------------------
-- Sheets and lines
-- ---------------------------------------------------------------------------
create table if not exists costing_sheets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  code         text,
  name         text not null,
  version      integer not null default 1,
  status       text not null default 'draft' check (status in ('draft','final','archived')),
  buyer        text,
  sheet_date   date not null default current_date,
  dimensions   jsonb not null default '{}',     -- D, W, H, seat height, …
  photo_url    text,                            -- the dimensioned drawing
  gst_pct      numeric not null default 0,
  margin_pct   numeric not null default 0,
  -- Snapshot taken when the sheet is finalised: every line amount, every
  -- category total and the rates used. Re-open it in a year and it still says
  -- what it said, even though rates have moved on. Same principle as the
  -- stock-card ledger — a record states what happened, it does not recompute.
  computed     jsonb,
  finalised_at timestamptz,
  created_by   uuid not null references profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists costing_sheets_tenant_idx on costing_sheets (tenant_id, updated_at desc);

create table if not exists costing_lines (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  sheet_id    uuid not null references costing_sheets (id) on delete cascade,
  category_id uuid not null references costing_categories (id),
  -- Optional link to the real item master. This is what lets Golai answer
  -- "which products use this fabric?" — impossible in a spreadsheet — and later
  -- pre-fill a release request. Read-only: costing never writes to items.
  item_id     uuid references items (id),
  label       text,                             -- free text when no item is linked
  sort_order  integer not null default 0,
  inputs      jsonb not null default '{}',
  amount      numeric not null default 0,
  note        text
);

create index if not exists costing_lines_sheet_idx on costing_lines (sheet_id, sort_order);
create index if not exists costing_lines_item_idx  on costing_lines (tenant_id, item_id);

-- ---------------------------------------------------------------------------
-- RLS — tenant scoped AND licence gated
-- ---------------------------------------------------------------------------
alter table costing_categories     enable row level security;
alter table costing_category_fields enable row level security;
alter table costing_rate_tables    enable row level security;
alter table costing_rate_entries   enable row level security;
alter table costing_sheets         enable row level security;
alter table costing_lines          enable row level security;

drop policy if exists costing_categories_all on costing_categories;
create policy costing_categories_all on costing_categories for all
  using (tenant_id = current_tenant_id() and has_module('costing'));

-- Fields hang off a category, so they inherit its tenant and licence check.
drop policy if exists costing_fields_all on costing_category_fields;
create policy costing_fields_all on costing_category_fields for all
  using (exists (
    select 1 from costing_categories c
     where c.id = category_id
       and c.tenant_id = current_tenant_id()
       and has_module('costing')
  ));

drop policy if exists costing_rate_tables_all on costing_rate_tables;
create policy costing_rate_tables_all on costing_rate_tables for all
  using (tenant_id = current_tenant_id() and has_module('costing'));

drop policy if exists costing_rate_entries_all on costing_rate_entries;
create policy costing_rate_entries_all on costing_rate_entries for all
  using (tenant_id = current_tenant_id() and has_module('costing'));

drop policy if exists costing_sheets_all on costing_sheets;
create policy costing_sheets_all on costing_sheets for all
  using (tenant_id = current_tenant_id() and has_module('costing'));

drop policy if exists costing_lines_all on costing_lines;
create policy costing_lines_all on costing_lines for all
  using (tenant_id = current_tenant_id() and has_module('costing'));

grant select, insert, update, delete on costing_categories      to authenticated;
grant select, insert, update, delete on costing_category_fields to authenticated;
grant select, insert, update, delete on costing_rate_tables     to authenticated;
grant select, insert, update, delete on costing_rate_entries    to authenticated;
grant select, insert, update, delete on costing_sheets          to authenticated;
grant select, insert, update, delete on costing_lines           to authenticated;

-- ---------------------------------------------------------------------------
-- Template seeding
--
-- A furniture template, taken from U&M's live sheet. Idempotent: safe to call
-- again, and it never touches a category that already exists (so a client's own
-- edits survive).
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
  -- key, name, formula_kind, [field key, label, type, unit, is_input]
  v_template jsonb := '[
    {"key":"wood","name":"Wood","kind":"volume_rate","fields":[
      {"k":"type","l":"Type","t":"text"},{"k":"length","l":"Length","t":"number","u":"in"},
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
    {"key":"hessian","name":"Hessian / Jute fabric","kind":"qty_rate","fields":[
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

    -- Never overwrite a category the client has already adjusted.
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

  -- The foam sheet-price grid, the one real lookup in their sheet.
  if not exists (select 1 from costing_rate_tables where tenant_id = v_tenant and key = 'foam_sheet') then
    insert into costing_rate_tables (tenant_id, key, name, note)
    values (v_tenant, 'foam_sheet', 'Foam sheet price',
            'Price per sheet by size. Change here and every sheet reprices.');
  end if;

  return v_n;
end;
$$;

grant execute on function seed_costing_template() to authenticated;

comment on function seed_costing_template() is
  'Creates the default furniture costing categories for the caller''s company. '
  'Idempotent and non-destructive — existing categories are left alone.';
