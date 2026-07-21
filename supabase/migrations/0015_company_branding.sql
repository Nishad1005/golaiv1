-- Golai — Migration 0015: company branding + platform admin
--
-- Each tenant (company) can carry its own name + logo, shown in the app for
-- everyone in that company. A separate "platform admin" flag marks DBBS staff
-- who may provision new companies (above any single tenant).

alter table tenants add column if not exists logo_url text;

alter table profiles add column if not exists is_platform_admin boolean not null default false;

-- Tenant admins may update their own company profile (name, logo, contact).
create policy tenants_admin_update on tenants
  for update
  using (id = current_tenant_id() and current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Public 'branding' bucket for company logos (logos are not sensitive, so a
-- public URL is fine and avoids per-load signed URLs). Writes are limited to
-- the tenant's own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy branding_tenant_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

create policy branding_tenant_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );

create policy branding_tenant_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = current_tenant_id()::text
  );
