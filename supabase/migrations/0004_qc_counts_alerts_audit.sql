-- Golai v1.0 — Migration 0004: QC holds, stock counts, alerts, attachments,
-- settings, and the append-only audit trail. PRD sections 5.7, 4.12.

create type qc_decision as enum ('RELEASE', 'REJECT');
create type count_status as enum ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'APPROVED');
create type alert_status as enum ('UNREAD', 'READ', 'RESOLVED');

-- ---------------------------------------------------------------------------
-- QC Hold / Quarantine
-- ---------------------------------------------------------------------------
create table qc_holds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  item_id uuid not null references items (id),
  shelf_id uuid references shelves (id),
  qty numeric not null check (qty > 0),
  source_grn_line_id uuid references grn_lines (id),
  inspected_by uuid references profiles (id),
  decision qc_decision,
  reason text,
  photo_urls jsonb not null default '[]',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Stock counts / cycle counts (units only, never value)
-- ---------------------------------------------------------------------------
create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  count_number text not null,
  plan_name text not null,
  scope jsonb not null default '{}',   -- { shelves: [...], items: [...] }
  assigned_to uuid references profiles (id),
  status count_status not null default 'DRAFT',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, count_number)
);

create table stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  stock_count_id uuid not null references stock_counts (id) on delete cascade,
  shelf_id uuid not null references shelves (id),
  item_id uuid not null references items (id),
  system_qty numeric not null default 0,
  physical_qty numeric,
  variance numeric generated always as (coalesce(physical_qty, 0) - coalesce(system_qty, 0)) stored,
  reason_code text                      -- theft / miscount / damage / unknown / system_error
);

-- ---------------------------------------------------------------------------
-- Alerts & notifications
-- ---------------------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  alert_type text not null,            -- low_stock / out_of_stock / grn_sla / rr_sla / dc_sla / high_value_adjustment / qc_sla / count_variance / failed_logins / after_hours_gate / dead_stock
  severity text not null default 'info',
  entity_type text,
  entity_id uuid,
  message text not null,
  status alert_status not null default 'UNREAD',
  notified_users jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index alerts_tenant_status_idx on alerts (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Attachments (photos / PDFs against any transaction)
-- ---------------------------------------------------------------------------
create table attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  entity_type text not null,
  entity_id uuid not null,
  file_url text not null,
  file_type text,
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now()
);

create index attachments_entity_idx on attachments (tenant_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Tenant settings (edit-lock window, approval thresholds, working hours, ...)
-- ---------------------------------------------------------------------------
create table tenant_settings (
  tenant_id uuid primary key references tenants (id),
  edit_lock_hours integer not null default 24,        -- 1/6/12/24/48/168
  approval_qty_threshold numeric,                     -- high-qty transactions requiring manager sign-off
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '19:00',
  photo_retention_days integer not null default 730,
  settings jsonb not null default '{}',               -- everything else, schema-flexible
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit trail — append-only, immutable, 7-year retention
-- ---------------------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  user_id uuid references profiles (id),
  user_role text,                      -- snapshot at time of action
  action text not null,                -- e.g. create.entry, approve.release
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip text,
  device text,
  geo text,
  created_at timestamptz not null default now()        -- server-set, never client
);

create index activity_log_tenant_idx on activity_log (tenant_id, created_at desc);
create index activity_log_entity_idx on activity_log (entity_type, entity_id);

-- Enforce append-only at the database level (PRD invariant: even Admin cannot
-- edit or delete; verified in acceptance by attempted UPDATE which must fail).
create or replace function reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activity_log is append-only: % not allowed', tg_op;
end;
$$;

create trigger activity_log_no_update
  before update or delete on activity_log
  for each row execute function reject_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table qc_holds enable row level security;
alter table stock_counts enable row level security;
alter table stock_count_lines enable row level security;
alter table alerts enable row level security;
alter table attachments enable row level security;
alter table tenant_settings enable row level security;
alter table activity_log enable row level security;

create policy qc_read on qc_holds for select using (tenant_id = current_tenant_id());
create policy qc_write on qc_holds for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy counts_read on stock_counts for select using (tenant_id = current_tenant_id());
create policy counts_write on stock_counts for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy count_lines_read on stock_count_lines for select using (tenant_id = current_tenant_id());
create policy count_lines_write on stock_count_lines for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy alerts_read on alerts for select using (tenant_id = current_tenant_id());
create policy alerts_update on alerts for update using (tenant_id = current_tenant_id());
create policy alerts_insert on alerts for insert with check (tenant_id = current_tenant_id());

create policy attachments_read on attachments for select using (tenant_id = current_tenant_id());
create policy attachments_insert on attachments for insert with check (tenant_id = current_tenant_id());

create policy settings_read on tenant_settings for select using (tenant_id = current_tenant_id());
create policy settings_write on tenant_settings for all
  using (tenant_id = current_tenant_id() and current_user_role() = 'admin');

-- Audit log: any authenticated tenant member can append; only manager/admin read
create policy audit_insert on activity_log for insert
  with check (tenant_id = current_tenant_id());
create policy audit_read on activity_log for select
  using (tenant_id = current_tenant_id() and current_user_role() in ('manager', 'admin'));
