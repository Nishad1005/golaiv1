-- Golai — Migration 0031: direct Issuance module + custom (named) roles
--
-- ADDITIVE ONLY. New tables, functions, one module row, one nullable-friendly
-- view rebuild. Nothing touches the user_role enum, the 32 RLS policies, or the
-- screens U&M is using for their stock take.

-- ===========================================================================
-- PART A — Issuance: issue stock straight out of a location
-- ===========================================================================
-- A quick counter issue (work order, department, recipient, product, qty) that
-- decrements stock immediately — distinct from the formal Release Request →
-- Issuance flow (0007). Stock only ever moves through move_stock(), so an issue
-- names a source location, and it joins item_movements so it shows on the stock
-- card and the dashboard.

create table if not exists stock_issues (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  issue_number  text not null,                 -- ISU-YYYY-MM-NNNN
  work_order_no text,
  department_id uuid references departments (id),
  issued_to     text,                          -- recipient name (free text)
  issued_by     uuid not null references profiles (id),
  created_at    timestamptz not null default now()
);

create table if not exists stock_issue_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  stock_issue_id uuid not null references stock_issues (id) on delete cascade,
  item_id        uuid not null references items (id),
  shelf_id       uuid not null references shelves (id),
  qty            numeric not null check (qty > 0)
);

create index if not exists stock_issues_tenant_idx on stock_issues (tenant_id, created_at desc);
create index if not exists stock_issue_lines_item_idx on stock_issue_lines (tenant_id, item_id);

alter table stock_issues enable row level security;
alter table stock_issue_lines enable row level security;

drop policy if exists stock_issues_read on stock_issues;
create policy stock_issues_read on stock_issues for select
  using (tenant_id = current_tenant_id() and has_module('issuance'));

drop policy if exists stock_issue_lines_read on stock_issue_lines;
create policy stock_issue_lines_read on stock_issue_lines for select
  using (tenant_id = current_tenant_id() and has_module('issuance'));
-- No write policies: rows are written only by issue_stock() (security definer).

grant select on stock_issues, stock_issue_lines to authenticated;

-- The one write path. move_stock() raises if a line would drive a shelf
-- negative, so over-issuing is refused and the whole issue rolls back.
create or replace function issue_stock(
  p_work_order   text,
  p_department_id uuid,
  p_issued_to    text,
  p_lines        jsonb
)
returns table (issue_id uuid, issue_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_number text;
  v_line   jsonb;
  v_qty    numeric;
begin
  perform require_module('issuance');

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Nothing to issue';
  end if;

  v_number := 'ISU-' || to_char(now(), 'YYYY-MM') || '-'
              || lpad(next_sequence('issue')::text, 4, '0');

  insert into stock_issues (tenant_id, issue_number, work_order_no, department_id, issued_to, issued_by)
  values (current_tenant_id(), v_number,
          nullif(btrim(coalesce(p_work_order, '')), ''),
          p_department_id,
          nullif(btrim(coalesce(p_issued_to, '')), ''),
          auth.uid())
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Every line needs a quantity greater than zero';
    end if;

    perform move_stock((v_line->>'item_id')::uuid, (v_line->>'shelf_id')::uuid, -v_qty);

    insert into stock_issue_lines (tenant_id, stock_issue_id, item_id, shelf_id, qty)
    values (current_tenant_id(), v_id, (v_line->>'item_id')::uuid, (v_line->>'shelf_id')::uuid, v_qty);
  end loop;

  return query select v_id, v_number;
end;
$$;

revoke all on function issue_stock(text, uuid, text, jsonb) from public, anon;
grant execute on function issue_stock(text, uuid, text, jsonb) to authenticated;

-- Register the module (base product — no licence needed).
insert into modules (key, default_roles, requires_license) values
  ('issuance', '{storekeeper,manager,admin}', false)
on conflict (key) do update set default_roles = excluded.default_roles;

-- ---------------------------------------------------------------------------
-- Rebuild item_movements to include direct issues (negative, kind 'issue')
-- ---------------------------------------------------------------------------
drop view if exists item_movements;

create view item_movements with (security_invoker = true) as
select
  gp.tenant_id, gl.item_id, gp.shelf_id, gp.putaway_at as moved_at,
  'grn'::text as kind, gp.qty as qty, g.grn_number as reference,
  g.id as reference_id, gp.putaway_by as person_id, g.po_ref as note
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
  -t.qty, null, t.id, t.transferred_by, t.reason
from transfers t
union all
select t.tenant_id, t.item_id, t.destination_shelf_id, t.transferred_at, 'transfer_in',
  t.qty, null, t.id, t.transferred_by, t.reason
from transfers t
union all
select il.tenant_id, il.item_id, il.shelf_id, i.issued_at, 'issue', -il.qty,
  i.iss_number, i.id, i.storekeeper_id, i.so_ref
from issuance_lines il
join issuances i on i.id = il.issuance_id
union all
-- Direct issue (this module): stock straight out against a work order.
select sil.tenant_id, sil.item_id, sil.shelf_id, si.created_at, 'issue', -sil.qty,
  si.issue_number, si.id, si.issued_by, si.work_order_no
from stock_issue_lines sil
join stock_issues si on si.id = sil.stock_issue_id
union all
select rl.tenant_id, rl.item_id, rl.shelf_id, r.returned_at, 'return', rl.qty,
  r.ret_number, r.id, r.returned_by, r.reason_code
from return_lines rl
join returns r on r.id = rl.return_id
union all
select dl.tenant_id, dl.item_id, dl.shelf_id, d.created_at, 'dispatch', -dl.qty,
  d.dc_number, d.id, d.picked_by, d.so_ref
from dispatch_lines dl
join dispatches d on d.id = dl.dispatch_id
where d.status <> 'REJECTED'
union all
select a.tenant_id, a.item_id, a.shelf_id, a.updated_at, 'adjust', a.qty_change,
  null, a.id, coalesce(a.approved_by, a.adjusted_by), a.reason_code
from adjustments a
where a.status = 'APPROVED'
union all
select q.tenant_id, q.item_id, q.shelf_id, q.decided_at, 'qc_release', q.qty,
  null, q.id, q.inspected_by, q.reason
from qc_holds q
where q.decision = 'RELEASE' and q.shelf_id is not null and q.decided_at is not null
union all
select p.tenant_id, p.item_id, p.shelf_id, p.assigned_at, 'placement',
  p.qty_after - p.qty_before, null, p.id, p.assigned_by, null
from placements p;

comment on view item_movements is
  'Every stock movement, signed (+ in / - out), across all modules. Powers the '
  'item movement history and the manager stock dashboard.';

grant select on item_movements to authenticated;

-- ===========================================================================
-- PART B — Custom roles as named module presets
-- ===========================================================================
-- A tenant defines named roles ("Issuance Clerk") that are really a preset of
-- module access. Assigning one to a user applies its module_access and sets
-- their designation to the role name. The user_role enum and every RLS policy
-- are untouched — access is governed by has_module(), which already honours a
-- user's module_access override.

create table if not exists tenant_roles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  name          text not null,
  module_access jsonb not null default '{}',   -- { issuance: true, find: false, … }
  base_role     user_role not null default 'storekeeper',
  created_at    timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table tenant_roles enable row level security;

drop policy if exists tenant_roles_read on tenant_roles;
create policy tenant_roles_read on tenant_roles for select
  using (tenant_id = current_tenant_id());
-- Written only through the guarded RPCs below.

grant select on tenant_roles to authenticated;

create or replace function admin_upsert_role(
  p_id uuid, p_name text, p_module_access jsonb, p_base_role user_role default 'storekeeper'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform require_module('admin_users');
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Role name is required';
  end if;

  if p_id is null then
    insert into tenant_roles (tenant_id, name, module_access, base_role)
    values (current_tenant_id(), btrim(p_name), coalesce(p_module_access, '{}'::jsonb), p_base_role)
    returning id into v_id;
  else
    update tenant_roles
       set name = btrim(p_name),
           module_access = coalesce(p_module_access, '{}'::jsonb),
           base_role = p_base_role
     where id = p_id and tenant_id = current_tenant_id()
    returning id into v_id;
    if v_id is null then raise exception 'Role not found in your company'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function admin_delete_role(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_module('admin_users');
  delete from tenant_roles where id = p_id and tenant_id = current_tenant_id();
end;
$$;

revoke all on function admin_upsert_role(uuid, text, jsonb, user_role) from public, anon;
revoke all on function admin_delete_role(uuid) from public, anon;
grant execute on function admin_upsert_role(uuid, text, jsonb, user_role) to authenticated;
grant execute on function admin_delete_role(uuid) to authenticated;

comment on table tenant_roles is
  'Named per-tenant role presets: a name + a module_access map. Applying one to '
  'a user sets their module_access and designation. Does not change the '
  'user_role enum or any RLS policy.';
