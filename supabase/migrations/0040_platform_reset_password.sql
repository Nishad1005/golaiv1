-- Golai — Migration 0040: let DBBS reset a company admin's password
--
-- When a company is provisioned, its admin's temp password is shown once and
-- handed over. If it is lost, the whole company is locked out — and DBBS had no
-- way to help, because reset-password is same-tenant/admin-only and DBBS lives
-- in a different tenant. The platform console needs the target admin's auth user
-- id to call the new platform-reset-password edge function; every cross-tenant
-- read in this app goes through a security-definer RPC that refuses non-DBBS.
--
-- This RPC lists a company's admins (id, name, login, status) for the console.
-- The password change itself happens in the edge function (service role); this
-- only exposes who can be reset. Modelled exactly on platform_tenant_modules
-- (migration 0025): platform admins only, that check is the security boundary.
--
-- ADDITIVE ONLY: one new function. No existing table, policy or function changes.

create or replace function platform_tenant_admins(p_tenant_id uuid)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  status record_status
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
  select p.id, p.full_name, p.email, p.phone, p.status
    from profiles p
   where p.tenant_id = p_tenant_id
     and p.role = 'admin'
   order by p.full_name;
end;
$$;

revoke all on function platform_tenant_admins(uuid) from public, anon;
grant execute on function platform_tenant_admins(uuid) to authenticated;

comment on function platform_tenant_admins(uuid) is
  'Lists a company''s admin logins (id, name, email, phone, status) for the '
  'platform console, so DBBS can reset a locked-out admin''s password. Platform '
  'admins only (is_platform_admin); the reset itself runs in the '
  'platform-reset-password edge function.';
