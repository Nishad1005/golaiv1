-- Golai — Migration 0017: enforce module access in the DATABASE
--
-- Until now module access was a UI guard: the sidebar and routes respected it,
-- but a crafted API call could still reach the data. This migration makes it a
-- real security boundary:
--
--   1. `modules` table holds the default roles per module (DB owns authorization).
--   2. has_module() / require_module() evaluate role default + per-user override,
--      and deny deactivated users outright.
--   3. Every business RPC is renamed to *_impl, revoked from clients, and
--      replaced by a same-signature wrapper that checks the module first.
--      (SECURITY DEFINER functions bypass RLS, so the check must live in them.)
--   4. Direct table writes are removed where the app only ever writes through an
--      RPC, and master-data policies now require the matching module.

-- ---------------------------------------------------------------------------
-- 1. Module registry — mirrors src/lib/modules.ts (keep the two in step)
-- ---------------------------------------------------------------------------
create table if not exists modules (
  key text primary key,
  default_roles user_role[] not null
);

insert into modules (key, default_roles) values
  ('find',           '{storekeeper,planner,manager,admin}'),
  ('assign',         '{storekeeper,manager,admin}'),
  ('capture',        '{storekeeper,manager,admin}'),
  ('transfer',       '{storekeeper,manager,admin}'),
  ('adjust',         '{storekeeper,manager,admin}'),
  ('grn',            '{security,storekeeper,manager,admin}'),
  ('release',        '{planner,storekeeper,manager,admin}'),
  ('returns',        '{storekeeper,planner,manager,admin}'),
  ('dispatch',       '{security,storekeeper,manager,admin}'),
  ('qc',             '{storekeeper,manager,admin}'),
  ('counts',         '{storekeeper,manager,admin}'),
  ('so_movement',    '{manager,admin}'),
  ('export',         '{manager,admin}'),
  ('admin_zones',    '{manager,admin}'),
  ('admin_items',    '{manager,admin}'),
  ('admin_parties',  '{manager,admin}'),
  ('admin_users',    '{admin}'),
  ('admin_company',  '{admin}')
on conflict (key) do update set default_roles = excluded.default_roles;

alter table modules enable row level security;
drop policy if exists modules_read on modules;
create policy modules_read on modules for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Access checks
-- ---------------------------------------------------------------------------
create or replace function has_module(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- per-user override wins
    (select (p.module_access ->> p_key)::boolean
       from profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.module_access ? p_key),
    -- otherwise the role default for this module
    (select p.role = any (m.default_roles)
       from profiles p, modules m
      where p.id = auth.uid()
        and p.status = 'active'
        and m.key = p_key),
    false
  );
$$;

create or replace function require_module(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_module(p_key) then
    raise exception 'You do not have access to this part of Golai (%).', p_key
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Internal helpers must not be callable from the client — they move stock
--    and allocate numbers, and are only meant to run inside the RPCs.
-- ---------------------------------------------------------------------------
revoke all on function move_stock(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function move_stock_hold(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function next_sequence(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Guarded wrappers around every business RPC
-- ---------------------------------------------------------------------------

-- Renames run once. Guard on *_impl already existing, otherwise a second
-- run would rename the WRAPPER to _impl and create infinite recursion.
do $$
declare f record;
begin
  for f in select * from (values
    ('capture_entry', 'uuid, uuid, numeric, text, jsonb, integer'),
    ('transfer_stock', 'uuid, uuid, uuid, numeric, text, jsonb, boolean'),
    ('decide_adjustment', 'uuid, boolean'),
    ('assign_placements', 'uuid, jsonb'),
    ('create_grn_gate_entry', 'uuid, text, text, text, integer, text, jsonb, text, text, text, jsonb, text, jsonb'),
    ('verify_grn', 'uuid, jsonb'),
    ('putaway_grn_line', 'uuid, uuid, numeric'),
    ('create_release_request', 'text, text, uuid, uuid, date, text, jsonb'),
    ('decide_release_request', 'uuid, boolean'),
    ('fulfill_release_request', 'uuid, jsonb, jsonb, text'),
    ('create_return', 'uuid, return_type, text, jsonb, jsonb'),
    ('create_dispatch', 'text, uuid, text, jsonb, jsonb'),
    ('decide_dispatch', 'uuid, boolean, text'),
    ('gate_out_dispatch', 'uuid, text, jsonb, text, text, text, text, text, text, jsonb'),
    ('decide_qc_hold', 'uuid, qc_decision, text, jsonb'),
    ('create_stock_count', 'text, jsonb, uuid'),
    ('record_count_line', 'uuid, uuid, uuid, numeric, text'),
    ('complete_stock_count', 'uuid'),
    ('decide_stock_count', 'uuid, boolean')
  ) as t(fname, fargs) loop
    if to_regprocedure(f.fname || '_impl(' || f.fargs || ')') is null then
      execute format('alter function %I(%s) rename to %I', f.fname, f.fargs, f.fname || '_impl');
    end if;
  end loop;
end $$;


-- capture ------------------------------------------------------------------
revoke all on function capture_entry_impl(uuid, uuid, numeric, text, jsonb, integer) from public, anon, authenticated;
create or replace function capture_entry(
  p_shelf_id uuid, p_item_id uuid, p_qty numeric,
  p_mode text default 'add', p_photo_urls jsonb default '[]', p_lock_hours integer default 24
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform require_module('capture');
  return capture_entry_impl(p_shelf_id, p_item_id, p_qty, p_mode, p_photo_urls, p_lock_hours);
end; $$;

-- transfer -----------------------------------------------------------------
revoke all on function transfer_stock_impl(uuid, uuid, uuid, numeric, text, jsonb, boolean) from public, anon, authenticated;
create or replace function transfer_stock(
  p_source_shelf_id uuid, p_destination_shelf_id uuid, p_item_id uuid, p_qty numeric,
  p_reason text default null, p_photo_urls jsonb default '[]', p_manual_entry boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform require_module('transfer');
  return transfer_stock_impl(p_source_shelf_id, p_destination_shelf_id, p_item_id, p_qty,
                             p_reason, p_photo_urls, p_manual_entry);
end; $$;

-- adjustments ---------------------------------------------------------------
revoke all on function decide_adjustment_impl(uuid, boolean) from public, anon, authenticated;
create or replace function decide_adjustment(p_adjustment_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('adjust');
  perform decide_adjustment_impl(p_adjustment_id, p_approve);
end; $$;

-- assign location -----------------------------------------------------------
revoke all on function assign_placements_impl(uuid, jsonb) from public, anon, authenticated;
create or replace function assign_placements(p_shelf_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
begin
  perform require_module('assign');
  return assign_placements_impl(p_shelf_id, p_rows);
end; $$;

-- receiving -----------------------------------------------------------------
revoke all on function create_grn_gate_entry_impl(uuid, text, text, text, integer, text, jsonb, text, text, text, jsonb, text, jsonb)
  from public, anon, authenticated;
create or replace function create_grn_gate_entry(
  p_supplier_id uuid, p_supplier_name_freetext text, p_po_ref text, p_material_type text,
  p_cartons integer, p_vehicle_number text, p_vehicle_photos jsonb, p_driver_name text,
  p_driver_phone text, p_driver_license text, p_driver_photos jsonb, p_transporter text,
  p_document_photos jsonb
) returns table (grn_id uuid, grn_number text) language plpgsql security definer set search_path = public as $$
begin
  perform require_module('grn');
  return query select * from create_grn_gate_entry_impl(
    p_supplier_id, p_supplier_name_freetext, p_po_ref, p_material_type, p_cartons,
    p_vehicle_number, p_vehicle_photos, p_driver_name, p_driver_phone, p_driver_license,
    p_driver_photos, p_transporter, p_document_photos);
end; $$;

revoke all on function verify_grn_impl(uuid, jsonb) from public, anon, authenticated;
create or replace function verify_grn(p_grn_id uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('grn');
  perform verify_grn_impl(p_grn_id, p_lines);
end; $$;

revoke all on function putaway_grn_line_impl(uuid, uuid, numeric) from public, anon, authenticated;
create or replace function putaway_grn_line(p_grn_line_id uuid, p_shelf_id uuid, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('grn');
  perform putaway_grn_line_impl(p_grn_line_id, p_shelf_id, p_qty);
end; $$;

-- release requests / issuance ----------------------------------------------
revoke all on function create_release_request_impl(text, text, uuid, uuid, date, text, jsonb) from public, anon, authenticated;
create or replace function create_release_request(
  p_so_ref text, p_customer_note text, p_department_id uuid, p_foreman_id uuid,
  p_required_by date, p_notes text, p_lines jsonb
) returns table (rr_id uuid, rr_number text) language plpgsql security definer set search_path = public as $$
begin
  perform require_module('release');
  return query select * from create_release_request_impl(
    p_so_ref, p_customer_note, p_department_id, p_foreman_id, p_required_by, p_notes, p_lines);
end; $$;

revoke all on function decide_release_request_impl(uuid, boolean) from public, anon, authenticated;
create or replace function decide_release_request(p_rr_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('release');
  perform decide_release_request_impl(p_rr_id, p_approve);
end; $$;

revoke all on function fulfill_release_request_impl(uuid, jsonb, jsonb, text) from public, anon, authenticated;
create or replace function fulfill_release_request(
  p_rr_id uuid, p_lines jsonb, p_photo_urls jsonb, p_signature_url text
) returns table (issuance_id uuid, iss_number text) language plpgsql security definer set search_path = public as $$
begin
  perform require_module('release');
  return query select * from fulfill_release_request_impl(p_rr_id, p_lines, p_photo_urls, p_signature_url);
end; $$;

-- returns -------------------------------------------------------------------
revoke all on function create_return_impl(uuid, return_type, text, jsonb, jsonb) from public, anon, authenticated;
create or replace function create_return(
  p_issuance_id uuid, p_return_type return_type, p_reason_code text, p_photo_urls jsonb, p_lines jsonb
) returns table (return_id uuid, ret_number text) language plpgsql security definer set search_path = public as $$
begin
  perform require_module('returns');
  return query select * from create_return_impl(p_issuance_id, p_return_type, p_reason_code, p_photo_urls, p_lines);
end; $$;

-- dispatch ------------------------------------------------------------------
revoke all on function create_dispatch_impl(text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
create or replace function create_dispatch(
  p_so_ref text, p_customer_id uuid, p_customer_note text, p_photo_urls jsonb, p_lines jsonb
) returns table (dispatch_id uuid, dc_number text) language plpgsql security definer set search_path = public as $$
begin
  perform require_module('dispatch');
  return query select * from create_dispatch_impl(p_so_ref, p_customer_id, p_customer_note, p_photo_urls, p_lines);
end; $$;

revoke all on function decide_dispatch_impl(uuid, boolean, text) from public, anon, authenticated;
create or replace function decide_dispatch(p_dispatch_id uuid, p_approve boolean, p_reject_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('dispatch');
  perform decide_dispatch_impl(p_dispatch_id, p_approve, p_reject_reason);
end; $$;

revoke all on function gate_out_dispatch_impl(uuid, text, jsonb, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
create or replace function gate_out_dispatch(
  p_dispatch_id uuid, p_vehicle_number text, p_vehicle_photos jsonb, p_driver_name text,
  p_driver_license text, p_lr_number text, p_lr_photo text, p_eway_bill_photo text,
  p_departure_photo text, p_scanned_cartons jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('dispatch');
  perform gate_out_dispatch_impl(p_dispatch_id, p_vehicle_number, p_vehicle_photos, p_driver_name,
    p_driver_license, p_lr_number, p_lr_photo, p_eway_bill_photo, p_departure_photo, p_scanned_cartons);
end; $$;

-- QC ------------------------------------------------------------------------
revoke all on function decide_qc_hold_impl(uuid, qc_decision, text, jsonb) from public, anon, authenticated;
create or replace function decide_qc_hold(
  p_qc_hold_id uuid, p_decision qc_decision, p_reason text, p_photo_urls jsonb default '[]'
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('qc');
  perform decide_qc_hold_impl(p_qc_hold_id, p_decision, p_reason, p_photo_urls);
end; $$;

-- stock counts --------------------------------------------------------------
revoke all on function create_stock_count_impl(text, jsonb, uuid) from public, anon, authenticated;
create or replace function create_stock_count(p_plan_name text, p_scope jsonb, p_assigned_to uuid)
returns table (count_id uuid, count_number text) language plpgsql security definer set search_path = public as $$
begin
  perform require_module('counts');
  return query select * from create_stock_count_impl(p_plan_name, p_scope, p_assigned_to);
end; $$;

revoke all on function record_count_line_impl(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
create or replace function record_count_line(
  p_count_id uuid, p_shelf_id uuid, p_item_id uuid, p_physical_qty numeric, p_reason_code text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('counts');
  perform record_count_line_impl(p_count_id, p_shelf_id, p_item_id, p_physical_qty, p_reason_code);
end; $$;

revoke all on function complete_stock_count_impl(uuid) from public, anon, authenticated;
create or replace function complete_stock_count(p_count_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('counts');
  perform complete_stock_count_impl(p_count_id);
end; $$;

revoke all on function decide_stock_count_impl(uuid, boolean) from public, anon, authenticated;
create or replace function decide_stock_count(p_count_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('counts');
  perform decide_stock_count_impl(p_count_id, p_approve);
end; $$;

-- ---------------------------------------------------------------------------
-- 5. Table policies: master data now needs the matching module, and tables the
--    app only ever writes through an RPC lose direct client write access.
-- ---------------------------------------------------------------------------
drop policy if exists zones_write on zones;
create policy zones_write on zones for all
  using (tenant_id = current_tenant_id() and has_module('admin_zones'));

drop policy if exists shelves_write on shelves;
create policy shelves_write on shelves for all
  using (tenant_id = current_tenant_id() and has_module('admin_zones'));

-- items: admins/managers manage the master; storekeepers create items during
-- capture, so either module grants write.
drop policy if exists items_write on items;
create policy items_write on items for all
  using (tenant_id = current_tenant_id() and (has_module('admin_items') or has_module('capture')));

drop policy if exists suppliers_write on suppliers;
create policy suppliers_write on suppliers for all
  using (tenant_id = current_tenant_id() and has_module('admin_parties'));

drop policy if exists customers_write on customers;
create policy customers_write on customers for all
  using (tenant_id = current_tenant_id() and has_module('admin_parties'));

drop policy if exists departments_write on departments;
create policy departments_write on departments for all
  using (tenant_id = current_tenant_id() and has_module('admin_parties'));

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (tenant_id = current_tenant_id() and has_module('admin_users'));

-- CRITICAL: profiles_self_update lets a user edit their own row, which would
-- let anyone grant themselves any role or module. Strip column-level UPDATE
-- from clients entirely and hand back only the harmless push-token columns;
-- role/status/module access now go through the guarded RPCs below.
revoke update on profiles from anon, authenticated;
grant update (push_token, push_token_updated_at) on profiles to authenticated;

create or replace function admin_set_user_role(p_user_id uuid, p_role user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('admin_users');
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  update profiles set role = p_role
   where id = p_user_id and tenant_id = current_tenant_id();
  if not found then raise exception 'User not found in your company'; end if;
end; $$;

create or replace function admin_set_user_status(p_user_id uuid, p_status record_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('admin_users');
  if p_user_id = auth.uid() then
    raise exception 'You cannot deactivate your own account';
  end if;
  update profiles set status = p_status
   where id = p_user_id and tenant_id = current_tenant_id();
  if not found then raise exception 'User not found in your company'; end if;
end; $$;

create or replace function admin_set_module_access(p_user_id uuid, p_access jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('admin_users');
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own access';
  end if;
  update profiles set module_access = coalesce(p_access, '{}'::jsonb)
   where id = p_user_id and tenant_id = current_tenant_id();
  if not found then raise exception 'User not found in your company'; end if;
end; $$;

drop policy if exists tenants_admin_update on tenants;
create policy tenants_admin_update on tenants for update
  using (id = current_tenant_id() and has_module('admin_company'));

-- adjustments are raised directly from the app; approval goes through the RPC
drop policy if exists adjustments_write on adjustments;
create policy adjustments_write on adjustments for all
  using (tenant_id = current_tenant_id() and has_module('adjust'));

-- These are written exclusively by the guarded RPCs above. Removing direct
-- write access means a crafted API call cannot bypass the module check.
drop policy if exists stock_write on stock_balances;
drop policy if exists entries_write on entries;
drop policy if exists transfers_write on transfers;
drop policy if exists grns_write on grns;
drop policy if exists grn_gate_write on grn_gate_entries;
drop policy if exists grn_lines_write on grn_lines;
drop policy if exists grn_putaways_write on grn_putaways;
drop policy if exists rr_write on release_requests;
drop policy if exists rr_lines_write on release_request_lines;
drop policy if exists issuances_write on issuances;
drop policy if exists issuance_lines_write on issuance_lines;
drop policy if exists returns_write on returns;
drop policy if exists return_lines_write on return_lines;
drop policy if exists dispatches_write on dispatches;
drop policy if exists dispatch_lines_write on dispatch_lines;
drop policy if exists dispatch_gate_write on dispatch_gate_exits;
drop policy if exists qc_write on qc_holds;
drop policy if exists counts_write on stock_counts;
drop policy if exists count_lines_write on stock_count_lines;
