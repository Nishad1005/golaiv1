-- Golai — Migration 0018: staff ID card (photo, employee ID, position)
--
-- My Account becomes a proper identity card. Three new fields on profiles:
--
--   avatar_url    the person's photo (path in the public 'avatars' bucket)
--   employee_id   their company/HR number
--   designation   their job title, e.g. "Assistant Store Manager"
--
-- Who may set what:
--   * the person themselves — photo and employee ID (set_my_profile)
--   * their admin          — employee ID and position (admin_set_user_details)
--   * nobody by direct UPDATE: migration 0017 revoked column privileges on
--     profiles precisely so role/access cannot be self-granted, and the same
--     protection now covers these fields. Position is deliberately NOT
--     self-editable — a person must not be able to promote themselves on
--     paper any more than they can change their role.

alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists employee_id text;
alter table profiles add column if not exists designation text;

-- ---------------------------------------------------------------------------
-- Public 'avatars' bucket. Photos of staff are not sensitive and a public URL
-- avoids re-signing on every page load (same reasoning as company logos in
-- 0015). Writes are confined to <tenant_id>/<user_id>/ so one person cannot
-- overwrite a colleague's photo.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_own_write on storage.objects;
create policy avatars_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = current_tenant_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Guarded writes. Both functions take the full value for each field, so
-- passing null clears it — the caller always sends the state it wants.
-- ---------------------------------------------------------------------------

-- The person's own card: photo and employee ID only. Note there is no
-- p_designation and no p_role — that is the point.
create or replace function set_my_profile(p_avatar_url text, p_employee_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set avatar_url  = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         employee_id = nullif(btrim(coalesce(p_employee_id, '')), '')
   where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end; $$;

-- The admin's view of someone's card: the HR facts, for their company only.
create or replace function admin_set_user_details(
  p_user_id uuid, p_employee_id text, p_designation text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_module('admin_users');
  update profiles
     set employee_id = nullif(btrim(coalesce(p_employee_id, '')), ''),
         designation = nullif(btrim(coalesce(p_designation, '')), '')
   where id = p_user_id and tenant_id = current_tenant_id();
  if not found then raise exception 'User not found in your company'; end if;
end; $$;

revoke all on function set_my_profile(text, text) from public;
revoke all on function admin_set_user_details(uuid, text, text) from public;
grant execute on function set_my_profile(text, text) to authenticated;
grant execute on function admin_set_user_details(uuid, text, text) to authenticated;
