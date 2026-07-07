-- Aksure v1.0 — Migration 0002: stock balances, capture entries, transfers, adjustments
-- PRD section 5.3 (Stock). stock_balances.qty_on_hand is the source of truth.

create type adjustment_status as enum ('PENDING', 'APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- Stock balances — one row per (item, shelf). THE source of truth for
-- "where is this item and how much" — powers the item locator search.
-- ---------------------------------------------------------------------------
create table stock_balances (
  tenant_id uuid not null references tenants (id),
  item_id uuid not null references items (id),
  shelf_id uuid not null references shelves (id),
  qty_on_hand numeric not null default 0 check (qty_on_hand >= 0),
  qty_on_hold numeric not null default 0 check (qty_on_hold >= 0), -- QC hold
  last_movement_at timestamptz not null default now(),
  primary key (item_id, shelf_id)
);

create index stock_balances_tenant_item_idx on stock_balances (tenant_id, item_id);
create index stock_balances_shelf_idx on stock_balances (shelf_id);

-- Atomic stock movement. Positive delta adds, negative removes.
-- All modules (capture, transfer, GRN putaway, issuance, return, dispatch,
-- adjustment) MUST move stock through this function only.
create or replace function move_stock(
  p_item_id uuid,
  p_shelf_id uuid,
  p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into stock_balances (tenant_id, item_id, shelf_id, qty_on_hand, last_movement_at)
  values (current_tenant_id(), p_item_id, p_shelf_id, greatest(p_delta, 0), now())
  on conflict (item_id, shelf_id) do update
    set qty_on_hand = stock_balances.qty_on_hand + p_delta,
        last_movement_at = now();

  if (select qty_on_hand from stock_balances
      where item_id = p_item_id and shelf_id = p_shelf_id) < 0 then
    raise exception 'Insufficient stock on shelf for this item';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Capture entries (discovery scans)
-- ---------------------------------------------------------------------------
create table entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  shelf_id uuid not null references shelves (id),
  item_id uuid not null references items (id),
  qty numeric not null check (qty > 0),
  photo_urls jsonb not null default '[]',
  captured_by uuid not null references profiles (id),
  captured_at timestamptz not null default now(),
  locked_until timestamptz,          -- edit lock window (default 24h, configurable)
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entries_tenant_shelf_idx on entries (tenant_id, shelf_id);

-- ---------------------------------------------------------------------------
-- Internal transfers
-- ---------------------------------------------------------------------------
create table transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  source_shelf_id uuid not null references shelves (id),
  destination_shelf_id uuid not null references shelves (id),
  item_id uuid not null references items (id),
  qty numeric not null check (qty > 0),
  reason text,
  photo_urls jsonb not null default '[]',
  transferred_by uuid not null references profiles (id),
  transferred_at timestamptz not null default now(),
  manual_entry boolean not null default false, -- true when shelf codes typed, not scanned (password-gated)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Adjustments (qty edits with mandatory reason + manager approval)
-- ---------------------------------------------------------------------------
create table adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  item_id uuid not null references items (id),
  shelf_id uuid not null references shelves (id),
  qty_change numeric not null check (qty_change <> 0),
  reason_code text not null,        -- theft / miscount / damage / unknown / system_error / other
  reason_note text,
  photo_urls jsonb not null default '[]',
  adjusted_by uuid not null references profiles (id),
  approved_by uuid references profiles (id),
  status adjustment_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table stock_balances enable row level security;
alter table entries enable row level security;
alter table transfers enable row level security;
alter table adjustments enable row level security;

create policy stock_read on stock_balances for select using (tenant_id = current_tenant_id());
create policy stock_write on stock_balances for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy entries_read on entries for select using (tenant_id = current_tenant_id());
create policy entries_write on entries for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy transfers_read on transfers for select using (tenant_id = current_tenant_id());
create policy transfers_write on transfers for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));

create policy adjustments_read on adjustments for select using (tenant_id = current_tenant_id());
create policy adjustments_write on adjustments for all
  using (tenant_id = current_tenant_id() and current_user_role() in ('storekeeper', 'manager', 'admin'));
