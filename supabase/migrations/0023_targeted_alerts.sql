-- Golai — Migration 0023: send each alert only to the people it concerns
--
-- Every alert was visible to everyone in the company: the gate guard saw
-- low-stock warnings, the planner saw gate-out notices, and a manager marking
-- one read hid it from the other managers. A bell that is mostly noise stops
-- being read at all, which defeats the point of having one.
--
-- Targeting is applied by a trigger rather than by editing the eight RPCs that
-- raise alerts. Those functions live across four migrations and several were
-- renamed by 0017; touching them all again would risk the write paths for a
-- change that belongs in one place anyway. Any future alert source gets the
-- right audience for free.

alter table alerts add column if not exists target_roles user_role[];
alter table alerts add column if not exists target_user_id uuid references profiles (id);

-- ---------------------------------------------------------------------------
-- Who needs to act on each kind of alert
--
-- The rule is "who does something about it", not "who might be curious".
-- Admin is on everything because it is the account that owns the warehouse.
-- ---------------------------------------------------------------------------
create or replace function alert_roles_for(p_type text)
returns user_role[]
language sql
immutable
as $$
  select case p_type
    -- A truck is at the gate; the storekeeper verifies it
    when 'grn_pending_verification' then '{storekeeper,manager,admin}'::user_role[]
    -- Waiting on an approval only a manager can give
    when 'rr_pending_approval'      then '{manager,admin}'::user_role[]
    when 'dc_pending_approval'      then '{manager,admin}'::user_role[]
    when 'count_review'             then '{manager,admin}'::user_role[]
    -- Approved and now someone must physically do it
    when 'rr_to_fulfill'            then '{storekeeper,manager,admin}'::user_role[]
    when 'dc_ready_gate_out'        then '{security,manager,admin}'::user_role[]
    -- Running out affects two people: the manager reorders, and the planner
    -- has to stop promising material they cannot get.
    when 'low_stock'                then '{planner,manager,admin}'::user_role[]
    when 'out_of_stock'             then '{planner,manager,admin}'::user_role[]
    -- Assigned work: narrowed further to the named person by the trigger
    when 'count_assigned'           then '{storekeeper,manager,admin}'::user_role[]
    -- Anything not yet classified stays visible rather than silently vanishing
    else '{security,storekeeper,planner,manager,admin}'::user_role[]
  end;
$$;

create or replace function set_alert_targets()
returns trigger
language plpgsql
as $$
begin
  if new.target_roles is null then
    new.target_roles := alert_roles_for(new.alert_type);
  end if;

  -- Work assigned to one person goes to that person, not to their whole role.
  -- create_stock_count already records the assignee in notified_users.
  if new.target_user_id is null
     and jsonb_typeof(new.notified_users) = 'array'
     and jsonb_array_length(new.notified_users) = 1
     and new.notified_users->>0 is not null then
    begin
      new.target_user_id := (new.notified_users->>0)::uuid;
    exception when others then
      new.target_user_id := null;  -- not a uuid; fall back to role targeting
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists alerts_set_targets on alerts;
create trigger alerts_set_targets
  before insert on alerts
  for each row execute function set_alert_targets();

-- Existing alerts get the same treatment, so the bell settles down immediately
-- rather than after the next event.
update alerts
   set target_roles = alert_roles_for(alert_type)
 where target_roles is null;

update alerts
   set target_user_id = (notified_users->>0)::uuid
 where target_user_id is null
   and jsonb_typeof(notified_users) = 'array'
   and jsonb_array_length(notified_users) = 1
   and (notified_users->>0) ~ '^[0-9a-f-]{36}$';

-- ---------------------------------------------------------------------------
-- Only show people what concerns them
--
-- A named recipient sees their own alert whatever their role; everyone else
-- sees it only if their role is in the target list. Marking as read is limited
-- to the same set, so nobody can clear a notice they never saw.
-- ---------------------------------------------------------------------------
drop policy if exists alerts_read on alerts;
create policy alerts_read on alerts for select
  using (
    tenant_id = current_tenant_id()
    and (
      target_user_id = auth.uid()
      or (
        target_user_id is null
        and (target_roles is null or current_user_role() = any (target_roles))
      )
    )
  );

drop policy if exists alerts_update on alerts;
create policy alerts_update on alerts for update
  using (
    tenant_id = current_tenant_id()
    and (
      target_user_id = auth.uid()
      or (
        target_user_id is null
        and (target_roles is null or current_user_role() = any (target_roles))
      )
    )
  );

create index if not exists alerts_target_idx on alerts (tenant_id, target_user_id, status);

comment on column alerts.target_roles is
  'Roles that should see this alert. Filled by set_alert_targets() from the '
  'alert type unless the caller sets it explicitly.';
comment on column alerts.target_user_id is
  'A specific recipient (assigned work). Overrides target_roles when set.';
