-- Golai v1.0 — Migration 0003: GRN/receiving, release requests, issuances,
-- returns, dispatch. PRD sections 5.4, 5.5, 5.6.
-- SO/PO references are ALWAYS free text — no sales_orders/purchase_orders tables.

create type grn_status as enum ('DRAFT', 'VERIFIED', 'COMPLETED', 'REJECTED');
create type qc_line_status as enum ('OK', 'HOLD', 'REJECT');
create type rr_status as enum ('DRAFT', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');
create type return_type as enum ('PRODUCTION', 'RTV', 'RMA');
create type dispatch_status as enum ('PICKED', 'READY', 'DISPATCHED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- GRN / Receiving (3-stage: gate → verification → putaway)
-- ---------------------------------------------------------------------------
create table grns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  grn_number text not null,          -- GRN/YYYY-MM/NNNN
  supplier_id uuid references suppliers (id),
  supplier_name_freetext text,       -- fallback when supplier not in master
  po_ref text,                       -- free text reference only
  status grn_status not null default 'DRAFT',
  total_cartons_declared integer,
  material_type_declared text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, grn_number)
);

create table grn_gate_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  grn_id uuid not null references grns (id) on delete cascade,
  vehicle_number text not null,
  vehicle_photos jsonb not null default '[]',
  driver_name text not null,
  driver_phone text not null,
  driver_license text not null,
  driver_photos jsonb not null default '[]',
  transporter text,
  document_photos jsonb not null default '[]', -- invoice, e-way bill, LR, packing list
  arrival_at timestamptz not null default now(),
  security_guard_id uuid not null references profiles (id)
);

create table grn_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  grn_id uuid not null references grns (id) on delete cascade,
  item_id uuid not null references items (id),
  qty_received numeric not null check (qty_received >= 0),
  qty_invoice numeric,               -- typed reference, no auto-fetch
  qty_po numeric,                    -- typed reference, no auto-fetch
  variance numeric generated always as (coalesce(qty_received, 0) - coalesce(qty_invoice, 0)) stored,
  variance_reason text,
  qc_status qc_line_status not null default 'OK',
  damage_photos jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now()
);

create table grn_putaways (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  grn_line_id uuid not null references grn_lines (id) on delete cascade,
  shelf_id uuid not null references shelves (id),
  qty numeric not null check (qty > 0),
  putaway_by uuid not null references profiles (id),
  putaway_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Release Requests (planner → manager approval → storekeeper fulfillment)
-- ---------------------------------------------------------------------------
create table release_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  rr_number text not null,           -- RR-YYYY-MM-NNNN
  so_ref text,                       -- free text, stored verbatim
  customer_note text,
  department_id uuid not null references departments (id),
  foreman_id uuid not null references profiles (id),
  required_by date,
  notes text,
  status rr_status not null default 'DRAFT',
  created_by uuid not null references profiles (id),
  approved_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rr_number)
);

create index release_requests_so_ref_idx on release_requests (tenant_id, so_ref);

create table release_request_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  release_request_id uuid not null references release_requests (id) on delete cascade,
  item_id uuid not null references items (id),
  qty_requested numeric not null check (qty_requested > 0),
  qty_issued numeric not null default 0
);

-- ---------------------------------------------------------------------------
-- Issuances (system of record for material leaving the store, SO-tagged)
-- ---------------------------------------------------------------------------
create table issuances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  iss_number text not null,          -- ISS-YYYY-MM-NNNN
  release_request_id uuid not null references release_requests (id),
  so_ref text,
  customer_note text,
  department_id uuid not null references departments (id),
  foreman_id uuid not null references profiles (id),
  foreman_signature_url text,
  storekeeper_id uuid not null references profiles (id),
  photo_urls jsonb not null default '[]',
  issued_at timestamptz not null default now(),
  unique (tenant_id, iss_number)
);

create index issuances_so_ref_idx on issuances (tenant_id, so_ref);

create table issuance_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  issuance_id uuid not null references issuances (id) on delete cascade,
  item_id uuid not null references items (id),
  shelf_id uuid not null references shelves (id), -- source shelf, auto-recorded on scan
  qty numeric not null check (qty > 0),
  label_printed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Returns (production surplus / RTV / RMA — same form, reason distinguishes)
-- ---------------------------------------------------------------------------
create table returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  ret_number text not null,          -- RET-YYYY-MM-NNNN
  source_issuance_id uuid references issuances (id),
  so_ref text,
  return_type return_type not null default 'PRODUCTION',
  reason_code text not null,         -- surplus / wrong_item / damaged / production_cancelled / quality_fail / other
  photo_urls jsonb not null default '[]',
  returned_by uuid not null references profiles (id),
  returned_at timestamptz not null default now(),
  unique (tenant_id, ret_number)
);

create table return_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  return_id uuid not null references returns (id) on delete cascade,
  item_id uuid not null references items (id),
  shelf_id uuid not null references shelves (id), -- destination shelf for putback
  qty numeric not null check (qty > 0)
);

-- ---------------------------------------------------------------------------
-- Dispatch / DC (3-stage: pick → manager approval → security gate-out)
-- ---------------------------------------------------------------------------
create table dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  dc_number text not null,           -- DC/YYYY-MM/NNNN
  so_ref text,
  customer_id uuid references customers (id),
  customer_note text,
  status dispatch_status not null default 'PICKED',
  reject_reason text,
  picked_by uuid not null references profiles (id),
  approved_by uuid references profiles (id),
  photo_urls jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, dc_number)
);

create index dispatches_so_ref_idx on dispatches (tenant_id, so_ref);

create table dispatch_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  dispatch_id uuid not null references dispatches (id) on delete cascade,
  item_id uuid not null references items (id),
  shelf_id uuid not null references shelves (id), -- source shelf
  qty numeric not null check (qty > 0),
  carton_barcode text
);

create table dispatch_gate_exits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  dispatch_id uuid not null references dispatches (id) on delete cascade,
  vehicle_number text not null,
  vehicle_photos jsonb not null default '[]',
  driver_name text,
  driver_license text,
  lr_number text,
  lr_photo text,
  eway_bill_photo text,
  departure_photo text,
  departed_at timestamptz not null default now(),
  security_guard_id uuid not null references profiles (id)
);

-- ---------------------------------------------------------------------------
-- RLS — tenant isolation on all transaction tables; write roles per permission
-- matrix (PRD 3.1). Stage-level rules (e.g. only security can create gate
-- entries) are enforced in policies below; finer flow rules live app-side.
-- ---------------------------------------------------------------------------
alter table grns enable row level security;
alter table grn_gate_entries enable row level security;
alter table grn_lines enable row level security;
alter table grn_putaways enable row level security;
alter table release_requests enable row level security;
alter table release_request_lines enable row level security;
alter table issuances enable row level security;
alter table issuance_lines enable row level security;
alter table returns enable row level security;
alter table return_lines enable row level security;
alter table dispatches enable row level security;
alter table dispatch_lines enable row level security;
alter table dispatch_gate_exits enable row level security;

create policy grns_read on grns for select using (tenant_id = current_tenant_id());
create policy grns_write on grns for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('security', 'storekeeper', 'manager', 'admin'));

create policy grn_gate_read on grn_gate_entries for select using (tenant_id = current_tenant_id());
create policy grn_gate_write on grn_gate_entries for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('security', 'manager', 'admin'));

create policy grn_lines_read on grn_lines for select using (tenant_id = current_tenant_id());
create policy grn_lines_write on grn_lines for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy grn_putaways_read on grn_putaways for select using (tenant_id = current_tenant_id());
create policy grn_putaways_write on grn_putaways for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy rr_read on release_requests for select using (tenant_id = current_tenant_id());
create policy rr_write on release_requests for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('planner', 'storekeeper', 'manager', 'admin'));

create policy rr_lines_read on release_request_lines for select using (tenant_id = current_tenant_id());
create policy rr_lines_write on release_request_lines for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('planner', 'storekeeper', 'manager', 'admin'));

create policy issuances_read on issuances for select using (tenant_id = current_tenant_id());
create policy issuances_write on issuances for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy issuance_lines_read on issuance_lines for select using (tenant_id = current_tenant_id());
create policy issuance_lines_write on issuance_lines for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy returns_read on returns for select using (tenant_id = current_tenant_id());
create policy returns_write on returns for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'planner', 'manager', 'admin'));

create policy return_lines_read on return_lines for select using (tenant_id = current_tenant_id());
create policy return_lines_write on return_lines for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'planner', 'manager', 'admin'));

create policy dispatches_read on dispatches for select using (tenant_id = current_tenant_id());
create policy dispatches_write on dispatches for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'security', 'manager', 'admin'));

create policy dispatch_lines_read on dispatch_lines for select using (tenant_id = current_tenant_id());
create policy dispatch_lines_write on dispatch_lines for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy dispatch_gate_read on dispatch_gate_exits for select using (tenant_id = current_tenant_id());
create policy dispatch_gate_write on dispatch_gate_exits for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('security', 'manager', 'admin'));
