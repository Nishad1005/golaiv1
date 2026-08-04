-- Golai — Migration 0037: Requisitions (work an ERP pick-list inside Issuance)
--
-- U&M's own ERP produces requisition (PR) lists — a PDF of products to issue
-- against a work order. This brings that requisition into the Issuance module:
-- upload the PDF (reference) + the lines (CSV-imported), then the issuer works a
-- filterable tick-list that shows where each product sits and ISSUES the stock
-- as each line is ticked. Fully additive to the direct-Issuance tables (0031).
--
-- ADDITIVE ONLY: two new tables, one nullable column on stock_issues, one new
-- RPC. No existing table/policy/RPC or the Issue/History flows change.

-- ---------------------------------------------------------------------------
-- Requisition = the uploaded PR: a reference number + the PDF + its lines.
-- ---------------------------------------------------------------------------
create table if not exists requisitions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  ref_no       text,                              -- the PR number / a name
  pdf_url      text,                              -- storage path of the uploaded PDF
  note         text,
  status       text not null default 'open' check (status in ('open', 'completed')),
  created_by   uuid not null references profiles (id),
  created_at   timestamptz not null default now(),
  completed_by uuid references profiles (id),
  completed_at timestamptz
);

create table if not exists requisition_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  requisition_id uuid not null references requisitions (id) on delete cascade,
  item_id        uuid references items (id),      -- null until matched to the master
  raw_product    text,                            -- the product text from the CSV
  requested_qty  numeric not null check (requested_qty > 0),
  issued_qty     numeric not null default 0 check (issued_qty >= 0),
  pr_no          text,                            -- the ERP requisition number for this line
  department     text,                            -- requesting department (free text)
  work_order_no  text,
  created_at     timestamptz not null default now()
);

create index if not exists requisitions_tenant_idx on requisitions (tenant_id, created_at desc);
create index if not exists requisition_lines_req_idx on requisition_lines (tenant_id, requisition_id);
create index if not exists requisition_lines_item_idx on requisition_lines (tenant_id, item_id);

alter table requisitions enable row level security;
alter table requisition_lines enable row level security;

-- The issuance holder manages requisitions directly (CSV import writes the lines);
-- the actual stock move still only happens through the guarded RPC below.
drop policy if exists requisitions_all on requisitions;
create policy requisitions_all on requisitions for all
  using (tenant_id = current_tenant_id() and has_module('issuance'))
  with check (tenant_id = current_tenant_id() and has_module('issuance'));

drop policy if exists requisition_lines_all on requisition_lines;
create policy requisition_lines_all on requisition_lines for all
  using (tenant_id = current_tenant_id() and has_module('issuance'))
  with check (tenant_id = current_tenant_id() and has_module('issuance'));

grant select, insert, update, delete on requisitions, requisition_lines to authenticated;

-- Link a stock issue back to its requisition (nullable; existing issues stay null).
alter table stock_issues add column if not exists requisition_id uuid references requisitions (id);

-- ---------------------------------------------------------------------------
-- Issue one requisition line: decrement stock (move_stock guards negatives),
-- record it as a normal stock issue (so it shows on the stock card + History,
-- carrying the line's work order), and advance the line's fulfilled quantity.
-- ---------------------------------------------------------------------------
create or replace function issue_requisition_line(
  p_line_id  uuid,
  p_shelf_id uuid,
  p_qty      numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line   requisition_lines%rowtype;
  v_id     uuid;
  v_number text;
begin
  perform require_module('issuance');

  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity to issue must be greater than zero';
  end if;

  select * into v_line from requisition_lines
  where id = p_line_id and tenant_id = current_tenant_id()
  for update;
  if not found then raise exception 'Requisition line not found'; end if;
  if v_line.item_id is null then
    raise exception 'This line is not matched to a product yet';
  end if;

  v_number := 'ISU-' || to_char(now(), 'YYYY-MM') || '-'
              || lpad(next_sequence('issue')::text, 4, '0');

  insert into stock_issues (tenant_id, issue_number, work_order_no, issued_by, requisition_id)
  values (current_tenant_id(), v_number, nullif(btrim(coalesce(v_line.work_order_no, '')), ''),
          auth.uid(), v_line.requisition_id)
  returning id into v_id;

  perform move_stock(v_line.item_id, p_shelf_id, -p_qty);

  insert into stock_issue_lines (tenant_id, stock_issue_id, item_id, shelf_id, qty)
  values (current_tenant_id(), v_id, v_line.item_id, p_shelf_id, p_qty);

  update requisition_lines set issued_qty = issued_qty + p_qty where id = p_line_id;

  return v_number;
end;
$$;

revoke all on function issue_requisition_line(uuid, uuid, numeric) from public, anon;
grant execute on function issue_requisition_line(uuid, uuid, numeric) to authenticated;

comment on table requisitions is
  'An ERP requisition (PR) brought into Issuance: a reference + the uploaded PDF + '
  'its lines. Worked as a filterable tick-list; each tick issues stock.';
