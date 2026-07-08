-- Golai v1.0 — Migration 0001: identity, multi-tenancy, master data
-- PRD section 5.1 (Identity & Multi-tenancy) and 5.2 (Master Data)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('security', 'storekeeper', 'planner', 'manager', 'admin');
create type record_status as enum ('active', 'inactive');
create type fixture_type as enum ('S', 'G', 'P', 'R'); -- Shelf, Ghoda, Pallet, Rack

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gst_number text,
  address text,
  contact_email text,
  contact_phone text,
  plan text not null default 'pilot',
  status record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (app users). Mirrors auth.users 1:1; role drives home screen + RLS.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references tenants (id),
  email text,
  phone text,
  full_name text not null,
  role user_role not null default 'storekeeper',
  status record_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_tenant_idx on profiles (tenant_id);

-- Helper: current user's tenant (used by every RLS policy)
create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid();
$$;

-- Helper: current user's role
create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------
create table zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  code text not null,               -- e.g. Z01
  name text not null,
  description text,
  default_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create table shelves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  zone_id uuid not null references zones (id),
  code text not null,               -- e.g. Z02-S012, validated app-side: /^Z(\d+)-([SGPR])(\d+)$/i
  fixture_type fixture_type not null default 'S',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index shelves_zone_idx on shelves (zone_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  code text not null,               -- pre-assigned client code OR auto-assigned ITM-NNNNN
  barcode text,                     -- physical barcode scanned on the item, if different from code
  name text not null,
  description text,
  category text,
  sub_category text,
  uom text not null default 'pcs', -- unit of measure: pcs / m / kg / set ... (quantities only, never value)
  reorder_point numeric,
  reorder_qty numeric,
  default_zone_id uuid references zones (id),
  status record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code)
);

create index items_tenant_name_idx on items (tenant_id, name);
create index items_tenant_barcode_idx on items (tenant_id, barcode);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  gst_number text,                  -- text only, no validation (ERP owns compliance)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  delivery_address text,
  gst_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null,               -- Carpentry, Upholstery, Finishing, Polish, Packing, ...
  default_zone_id uuid references zones (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);

-- ---------------------------------------------------------------------------
-- Sequences (GRN / DC / ISS / RR / RET / item_code) with row-level locking
-- ---------------------------------------------------------------------------
create table sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  sequence_name text not null,      -- grn / dc / iss / rr / ret / item_code / count
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, sequence_name)
);

-- Atomically allocate the next number for a named sequence.
-- Row lock (FOR UPDATE via UPDATE ... RETURNING) prevents duplicates under concurrency.
create or replace function next_sequence(seq_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val bigint;
begin
  insert into sequences (tenant_id, sequence_name, current_value)
  values (current_tenant_id(), seq_name, 0)
  on conflict (tenant_id, sequence_name) do nothing;

  update sequences
  set current_value = current_value + 1,
      updated_at = now()
  where tenant_id = current_tenant_id()
    and sequence_name = seq_name
  returning current_value into next_val;

  return next_val;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: tenant isolation on every table
-- ---------------------------------------------------------------------------
alter table tenants enable row level security;
alter table profiles enable row level security;
alter table zones enable row level security;
alter table shelves enable row level security;
alter table items enable row level security;
alter table suppliers enable row level security;
alter table customers enable row level security;
alter table departments enable row level security;
alter table sequences enable row level security;

create policy tenants_self on tenants
  for select using (id = current_tenant_id());

create policy profiles_same_tenant_read on profiles
  for select using (tenant_id = current_tenant_id());
create policy profiles_self_update on profiles
  for update using (id = auth.uid());
create policy profiles_admin_all on profiles
  for all using (tenant_id = current_tenant_id() and current_user_role() = 'admin');

-- Masters: everyone in tenant can read; only admin (and manager, limited app-side) can write
create policy zones_read on zones for select using (tenant_id = current_tenant_id());
create policy zones_write on zones for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin', 'manager'));

create policy shelves_read on shelves for select using (tenant_id = current_tenant_id());
create policy shelves_write on shelves for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin', 'manager'));

create policy items_read on items for select using (tenant_id = current_tenant_id());
-- storekeeper included: scan-first flow may auto-create a NEW item at the shelf
create policy items_write on items for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin', 'manager', 'storekeeper'));

create policy suppliers_read on suppliers for select using (tenant_id = current_tenant_id());
create policy suppliers_write on suppliers for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin', 'manager'));

create policy customers_read on customers for select using (tenant_id = current_tenant_id());
create policy customers_write on customers for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin', 'manager'));

create policy departments_read on departments for select using (tenant_id = current_tenant_id());
create policy departments_write on departments for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('admin', 'manager'));

create policy sequences_read on sequences for select using (tenant_id = current_tenant_id());
