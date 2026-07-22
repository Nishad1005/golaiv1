-- Golai — Migration 0021: make tenant_settings real, and use it for undo
--
-- tenant_settings has existed since 0004 with no UI and nothing reading it, so
-- edit_lock_hours was dead: capture_entry was called with a hard-coded 24 and
-- entries.locked_until was written but never enforced anywhere.
--
-- This makes the edit-lock window mean something. A storekeeper who scans the
-- wrong shelf can undo their own entry inside the window; after it closes the
-- only route is an Adjust with a reason and manager approval, which is the
-- behaviour the PRD describes.

-- Every tenant gets a settings row so the app never has to handle "missing".
insert into tenant_settings (tenant_id)
select id from tenants
on conflict (tenant_id) do nothing;

-- The Settings screen is a module like any other. `modules` is authoritative
-- for access, so it has to learn about this one (mirrors src/lib/modules.ts).
insert into modules (key, default_roles) values
  ('admin_settings', '{admin}')
on conflict (key) do update set default_roles = excluded.default_roles;

-- ---------------------------------------------------------------------------
-- The configured edit window, with the old hard-coded default as the fallback
-- ---------------------------------------------------------------------------
create or replace function tenant_edit_lock_hours()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select edit_lock_hours from tenant_settings where tenant_id = current_tenant_id()),
    24
  );
$$;

-- ---------------------------------------------------------------------------
-- Undo a capture inside the edit window
--
-- Reverses the stock movement and marks the entry 'reversed'. item_movements
-- (0019) only reads status = 'active', so an undone capture leaves the ledger
-- entirely rather than showing as a pair of cancelling rows — the balance stays
-- correct either way, and the audit log still records that it happened.
-- ---------------------------------------------------------------------------
create or replace function undo_capture_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry entries%rowtype;
begin
  perform require_module('capture');

  select * into v_entry
  from entries
  where id = p_entry_id and tenant_id = current_tenant_id();

  if not found then
    raise exception 'That entry no longer exists';
  end if;

  if v_entry.status <> 'active' then
    raise exception 'This entry has already been undone';
  end if;

  -- Your own mistake is yours to fix; anyone else's needs a manager.
  if v_entry.captured_by <> auth.uid()
     and current_user_role() not in ('manager', 'admin') then
    raise exception 'You can only undo entries you recorded yourself';
  end if;

  if v_entry.locked_until is not null and now() > v_entry.locked_until then
    raise exception 'The edit window for this entry has closed — use Adjust instead';
  end if;

  -- Fails loudly if the stock has already moved on: undoing would drive the
  -- shelf negative, so an Adjust with a reason is the honest correction.
  perform move_stock(v_entry.item_id, v_entry.shelf_id, -coalesce(v_entry.qty_delta, v_entry.qty));

  update entries
     set status = 'reversed', updated_at = now()
   where id = p_entry_id;
end;
$$;

comment on function undo_capture_entry(uuid) is
  'Reverses a capture inside the tenant edit-lock window. Outside it, the only '
  'correction is an Adjust with a reason and manager approval.';
