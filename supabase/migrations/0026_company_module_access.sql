-- Golai — Migration 0026: company-level module access
--
-- 0025 gave DBBS a licence table but nothing enforced it, so revoking a module
-- for a company did nothing. This makes it real: turn a module off for a
-- company and it disappears for EVERY user in that company, whatever their
-- personal access says.
--
-- Two layers now, and both must pass:
--
--   company  — does this company have the module at all?   (tenant_modules)
--   person   — may this user open it?                      (role + module_access)
--
-- SAFETY: this rewrites has_module(), which guards every write path in the app.
-- The semantics are chosen so that with an empty tenant_modules table and no
-- licensed modules, the result is IDENTICAL to before, row for row:
--
--   * base module, no row      → allowed  (`not requires_license` = not false)
--   * base module, row=false   → blocked for the whole company   ← new capability
--   * base module, row=true    → allowed
--   * licensed module, no row  → blocked  (opt-in, e.g. costing)
--   * unknown module           → blocked  (unchanged)
--
-- Nothing else in this file touches an existing object.

-- ---------------------------------------------------------------------------
-- Base product vs paid add-on
-- ---------------------------------------------------------------------------
alter table modules add column if not exists requires_license boolean not null default false;

-- Costing is the first opt-in module. Registered now so it can be granted from
-- the console; it has no screens until the module itself is built, so granting
-- it today changes nothing a user can see.
insert into modules (key, default_roles, requires_license) values
  ('costing', '{manager,admin}', true)
on conflict (key) do update
  set default_roles = excluded.default_roles,
      requires_license = excluded.requires_license;

-- ---------------------------------------------------------------------------
-- Company gate
-- ---------------------------------------------------------------------------
create or replace function tenant_has_module(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- an explicit decision for this company wins
    (select tm.enabled
       from tenant_modules tm
      where tm.tenant_id = (select p.tenant_id from profiles p where p.id = auth.uid())
        and tm.module_key = p_key),
    -- otherwise: base product is included, add-ons are not
    not coalesce((select m.requires_license from modules m where m.key = p_key), false)
  );
$$;

grant execute on function tenant_has_module(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The access check every guarded RPC already calls
-- ---------------------------------------------------------------------------
create or replace function has_module(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- 1. does the company have it?
    coalesce(
      (select tm.enabled
         from tenant_modules tm
        where tm.tenant_id = (select p.tenant_id from profiles p where p.id = auth.uid())
          and tm.module_key = p_key),
      not coalesce((select m.requires_license from modules m where m.key = p_key), false)
    )
    -- 2. and may this person open it? (unchanged from 0017)
    and coalesce(
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

comment on function has_module(text) is
  'Company licence AND personal access. Both must pass. Revoking a module for a '
  'company blocks everyone in it regardless of their per-user settings.';

-- ---------------------------------------------------------------------------
-- Console support: the effective company-level map, for any one company
-- ---------------------------------------------------------------------------
create or replace function platform_tenant_modules(p_tenant_id uuid)
returns table (module_key text, requires_license boolean, enabled boolean, is_explicit boolean)
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
    m.key,
    m.requires_license,
    coalesce(tm.enabled, not m.requires_license) as enabled,
    tm.tenant_id is not null                     as is_explicit
  from modules m
  left join tenant_modules tm
    on tm.module_key = m.key and tm.tenant_id = p_tenant_id
  order by m.key;
end;
$$;

revoke all on function platform_tenant_modules(uuid) from public, anon;
grant execute on function platform_tenant_modules(uuid) to authenticated;

-- Clear an explicit decision, letting the module fall back to its default.
create or replace function platform_reset_tenant_module(p_tenant_id uuid, p_module_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Platform administrators only';
  end if;
  delete from tenant_modules
   where tenant_id = p_tenant_id and module_key = p_module_key;
end;
$$;

revoke all on function platform_reset_tenant_module(uuid, text) from public, anon;
grant execute on function platform_reset_tenant_module(uuid, text) to authenticated;
