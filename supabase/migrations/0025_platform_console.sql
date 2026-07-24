-- Golai — Migration 0025: module licences + the DBBS platform console
--
-- Two things that belong together:
--
--   1. tenant_modules — which COMPANY holds which licensed module. This is the
--      layer above the existing per-user module_access: a user can only be given
--      what their company actually has. It is how Basic vs Plus becomes a row
--      instead of a code branch, and how a module can be proven on the demo
--      tenant without any client being able to reach it.
--
--   2. The platform console — DBBS needs to see every client, grant licences and
--      suspend an account. That means reading ACROSS tenants, which every RLS
--      policy in the app deliberately forbids.
--
-- ADDITIVE ONLY. Nothing here alters an existing table, policy or function.
-- Cross-tenant reads are served by new security-definer RPCs that check
-- is_platform_admin() first — the existing policies stay exactly as they are,
-- so no client-facing code path changes behaviour.

-- ---------------------------------------------------------------------------
-- Who is DBBS
-- ---------------------------------------------------------------------------
create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_platform_admin from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Module licences
-- ---------------------------------------------------------------------------
create table if not exists tenant_modules (
  tenant_id  uuid not null references tenants (id) on delete cascade,
  module_key text not null,
  enabled    boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references profiles (id),
  note       text,                       -- "bundled", "paid add-on", "trial to 31-Mar"
  primary key (tenant_id, module_key)
);

alter table tenant_modules enable row level security;

-- A company may see what it holds. Nobody may write it from the app: licences
-- are granted by DBBS through the guarded RPC below, never self-served.
drop policy if exists tenant_modules_read on tenant_modules;
create policy tenant_modules_read on tenant_modules for select
  using (tenant_id = current_tenant_id() or is_platform_admin());

grant select on tenant_modules to authenticated;

/**
 * Does the caller's company hold this module?
 *
 * Deliberately NOT wired into has_module(). That function guards every write
 * path in the app (migration 0017) and changing it would put every existing
 * workflow at risk for the sake of one new module. Licensed modules call this
 * directly; the two are unified later as a separate, separately-tested change.
 */
create or replace function tenant_has_module(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_modules
    where tenant_id = current_tenant_id()
      and module_key = p_key
      and enabled
  );
$$;

grant execute on function tenant_has_module(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The console: cross-tenant reads, platform admins only
--
-- Every function below is security definer (so it can see past RLS) and every
-- one starts by refusing anybody who is not DBBS. That check is the entire
-- security boundary for this file — it must never be removed.
-- ---------------------------------------------------------------------------
create or replace function platform_tenants()
returns table (
  id uuid,
  name text,
  plan text,
  status record_status,
  created_at timestamptz,
  contact_email text,
  contact_phone text,
  admin_names text,
  user_count bigint,
  active_user_count bigint,
  item_count bigint,
  zone_count bigint,
  location_count bigint,
  located_count bigint,
  module_keys text[],
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Platform administrators only';
  end if;

  return query
  select
    t.id, t.name, t.plan, t.status, t.created_at, t.contact_email, t.contact_phone,
    (select string_agg(p.full_name, ', ' order by p.full_name)
       from profiles p where p.tenant_id = t.id and p.role = 'admin')            as admin_names,
    (select count(*) from profiles p where p.tenant_id = t.id)                   as user_count,
    (select count(*) from profiles p
      where p.tenant_id = t.id and p.status = 'active')                          as active_user_count,
    (select count(*) from items i
      where i.tenant_id = t.id and i.deleted_at is null)                         as item_count,
    (select count(*) from zones z
      where z.tenant_id = t.id and z.deleted_at is null)                         as zone_count,
    (select count(*) from shelves s
      where s.tenant_id = t.id and s.deleted_at is null)                         as location_count,
    (select count(distinct sb.item_id) from stock_balances sb
      where sb.tenant_id = t.id)                                                 as located_count,
    coalesce((select array_agg(tm.module_key order by tm.module_key)
       from tenant_modules tm where tm.tenant_id = t.id and tm.enabled), '{}')   as module_keys,
    (select max(a.created_at) from activity_log a where a.tenant_id = t.id)      as last_activity_at
  from tenants t
  order by t.created_at desc;
end;
$$;

create or replace function platform_summary()
returns table (
  tenant_count bigint,
  active_tenant_count bigint,
  user_count bigint,
  item_count bigint,
  actions_7d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Platform administrators only';
  end if;

  return query
  select
    (select count(*) from tenants),
    (select count(*) from tenants where status = 'active'),
    (select count(*) from profiles),
    (select count(*) from items where deleted_at is null),
    (select count(*) from activity_log where created_at > now() - interval '7 days');
end;
$$;

-- Grant or revoke a module for one company.
create or replace function platform_set_tenant_module(
  p_tenant_id uuid,
  p_module_key text,
  p_enabled boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Platform administrators only';
  end if;
  if coalesce(trim(p_module_key), '') = '' then
    raise exception 'Module key is required';
  end if;

  insert into tenant_modules (tenant_id, module_key, enabled, granted_by, note)
  values (p_tenant_id, trim(p_module_key), coalesce(p_enabled, true), auth.uid(), p_note)
  on conflict (tenant_id, module_key) do update
    set enabled    = excluded.enabled,
        granted_by = excluded.granted_by,
        granted_at = now(),
        note       = coalesce(excluded.note, tenant_modules.note);
end;
$$;

-- Suspend or reactivate a whole company. Their data is untouched; their people
-- simply stop being able to work until it is switched back on.
create or replace function platform_set_tenant_status(
  p_tenant_id uuid,
  p_status record_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Platform administrators only';
  end if;

  update tenants set status = p_status, updated_at = now() where id = p_tenant_id;
  if not found then raise exception 'Company not found'; end if;
end;
$$;

revoke all on function platform_tenants()                                from public, anon;
revoke all on function platform_summary()                                from public, anon;
revoke all on function platform_set_tenant_module(uuid, text, boolean, text) from public, anon;
revoke all on function platform_set_tenant_status(uuid, record_status)   from public, anon;
grant execute on function platform_tenants()                                to authenticated;
grant execute on function platform_summary()                                to authenticated;
grant execute on function platform_set_tenant_module(uuid, text, boolean, text) to authenticated;
grant execute on function platform_set_tenant_status(uuid, record_status)   to authenticated;

comment on table tenant_modules is
  'Which company holds which licensed module. Sits above the per-user '
  'module_access: a user can only be given what their company has. Written '
  'only by platform_set_tenant_module().';
