-- Golai — Migration 0043: Perishables (batch + expiry tracking)
--
-- A resort client stocks perishables (butter, fruit — with mfg/expiry dates)
-- next to non-perishables (forks, spoons). They want to scan a manufacturer
-- barcode to register/look up an item, record batches with mfg/expiry when goods
-- come in, see an item's batches on a scan, and be flagged as expiry nears.
--
-- This is a NEW OPT-IN MODULE (`expiry`, label "Perishables") that plugs into the
-- shared core rather than a silo: perishables are ordinary `items` (flagged
-- tracks_expiry), inward adds to the shared `stock_balances` via move_stock, and
-- near-expiry raises rows in the shared `alerts`. The only genuinely new object is
-- the `item_batches` dimension table hanging off items + shelves.
--
-- ADDITIVE ONLY. New module row, two nullable/defaulted columns, one table, three
-- RPCs, and a widened alert_roles_for. No existing table/policy/RPC/flow changes —
-- inward_perishable creates items itself (SECURITY DEFINER), so the core
-- items_write policy is untouched.

-- 1. Register the module (opt-in, like costing/gate_out) ---------------------
insert into modules (key, default_roles, requires_license) values
  ('expiry', '{storekeeper,manager,admin}', true)
on conflict (key) do update
  set default_roles = excluded.default_roles,
      requires_license = excluded.requires_license;

-- 2. Item + settings columns -------------------------------------------------
alter table items add column if not exists tracks_expiry boolean not null default false;
comment on column items.tracks_expiry is
  'True for perishables tracked by the Perishables (expiry) module. Set on inward.';

alter table tenant_settings add column if not exists expiry_warn_days integer not null default 7;
comment on column tenant_settings.expiry_warn_days is
  'Near-expiry window (days): batches expiring within this many days are flagged.';

-- 3. The batch/expiry dimension table ---------------------------------------
create table if not exists item_batches (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id),
  item_id      uuid not null references items (id),
  batch_no     text,
  mfg_date     date,
  expiry_date  date not null,
  received_qty numeric,
  shelf_id     uuid references shelves (id),
  status       text not null default 'active',   -- active | finished | removed
  note         text,
  received_by  uuid references profiles (id),
  received_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists item_batches_expiry_idx on item_batches (tenant_id, expiry_date);
create index if not exists item_batches_item_idx on item_batches (tenant_id, item_id, status);

alter table item_batches enable row level security;

-- Read within the tenant; writes go only through the RPCs below.
drop policy if exists item_batches_read on item_batches;
create policy item_batches_read on item_batches for select
  using (tenant_id = current_tenant_id());

grant select on item_batches to authenticated;

comment on table item_batches is
  'Perishable batches (expiry module): one row per received lot with mfg/expiry. '
  'References items + shelves; stock lives in stock_balances as usual. Written '
  'only by inward_perishable / set_item_batch_status.';

-- 4. inward_perishable — record a batch AND add to stock ---------------------
-- Self-contained: creates the item itself when needed (allocating an ITM- code
-- the same way as 0024) so the core items_write policy is never touched.
create or replace function inward_perishable(
  p_item_id     uuid,
  p_new_code    text,
  p_new_name    text,
  p_new_barcode text,
  p_new_uom     text,
  p_shelf_id    uuid,
  p_batch_no    text,
  p_mfg_date    date,
  p_expiry_date date,
  p_qty         numeric,
  p_note        text
)
returns table (batch_id uuid, item_id uuid, item_code text, item_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   items%rowtype;
  v_seq    bigint;
  v_code   text;
  v_batch  uuid;
  v_warn   integer;
  v_sev    text;
  v_msg    text;
begin
  perform require_module('expiry');

  if p_shelf_id is null then
    raise exception 'A destination location is required';
  end if;
  if p_expiry_date is null then
    raise exception 'An expiry date is required';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Enter a quantity greater than zero';
  end if;

  -- Resolve or create the item -------------------------------------------------
  if p_item_id is not null then
    select * into v_item from items
     where id = p_item_id and tenant_id = current_tenant_id() and deleted_at is null;
    if not found then raise exception 'Product not found in your company'; end if;

    update items
       set tracks_expiry = true,
           barcode = case
             when (barcode is null or trim(barcode) = '')
                  and nullif(trim(coalesce(p_new_barcode, '')), '') is not null
             then trim(p_new_barcode) else barcode end,
           updated_at = now()
     where id = v_item.id;
  else
    if nullif(trim(coalesce(p_new_name, '')), '') is null then
      raise exception 'A product name is required for a new item';
    end if;

    -- Client code kept verbatim; otherwise allocate ITM-NNNNN (mirrors 0024).
    if nullif(trim(coalesce(p_new_code, '')), '') is not null then
      v_code := trim(p_new_code);
    else
      insert into sequences (tenant_id, sequence_name, current_value)
      values (current_tenant_id(), 'item_code', 0)
      on conflict (tenant_id, sequence_name) do nothing;

      update sequences set current_value = current_value + 1, updated_at = now()
       where tenant_id = current_tenant_id() and sequence_name = 'item_code'
       returning current_value into v_seq;

      v_code := 'ITM-' || lpad(v_seq::text, 5, '0');
    end if;

    insert into items (
      tenant_id, code, code_auto_assigned, barcode, name, uom, tracks_expiry
    )
    values (
      current_tenant_id(), v_code, nullif(trim(coalesce(p_new_code, '')), '') is null,
      nullif(trim(coalesce(p_new_barcode, '')), ''), trim(p_new_name),
      coalesce(nullif(trim(coalesce(p_new_uom, '')), ''), 'pcs'), true
    )
    returning * into v_item;
  end if;

  -- The batch ------------------------------------------------------------------
  insert into item_batches (
    tenant_id, item_id, batch_no, mfg_date, expiry_date, received_qty, shelf_id,
    received_by, note
  )
  values (
    current_tenant_id(), v_item.id, nullif(trim(coalesce(p_batch_no, '')), ''),
    p_mfg_date, p_expiry_date, p_qty, p_shelf_id, auth.uid(),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_batch;

  -- Add to the shared stock ledger (existing primitive) ------------------------
  perform move_stock(v_item.id, p_shelf_id, p_qty);

  -- Flag if already at/near expiry --------------------------------------------
  select coalesce((select expiry_warn_days from tenant_settings
                    where tenant_id = current_tenant_id()), 7)
    into v_warn;

  if p_expiry_date <= current_date + v_warn then
    if p_expiry_date < current_date then
      v_sev := 'critical';
      v_msg := v_item.name || ' (' || v_item.code || ') has EXPIRED on '
               || to_char(p_expiry_date, 'DD Mon YYYY');
    else
      v_sev := 'warning';
      v_msg := v_item.name || ' (' || v_item.code || ') expires '
               || to_char(p_expiry_date, 'DD Mon YYYY')
               || ' (' || (p_expiry_date - current_date) || ' days)';
    end if;
    insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
    values (current_tenant_id(), 'batch_expiring', v_sev, 'item', v_item.id, v_msg);
  end if;

  return query select v_batch, v_item.id, v_item.code, v_item.name;
end;
$$;

revoke all on function inward_perishable(uuid, text, text, text, text, uuid, text, date, date, numeric, text) from public, anon;
grant execute on function inward_perishable(uuid, text, text, text, text, uuid, text, date, date, numeric, text) to authenticated;

-- 5. set_item_barcode — attach a scanned barcode to an item (mirrors set_item_photo)
create or replace function set_item_barcode(p_item_id uuid, p_barcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    has_module('admin_items') or has_module('capture') or has_module('expiry')
  ) then
    raise exception 'You do not have permission to change a product''s barcode';
  end if;

  update items
     set barcode = nullif(trim(coalesce(p_barcode, '')), ''), updated_at = now()
   where id = p_item_id and tenant_id = current_tenant_id();
  if not found then raise exception 'Product not found in your company'; end if;
end;
$$;

revoke all on function set_item_barcode(uuid, text) from public, anon;
grant execute on function set_item_barcode(uuid, text) to authenticated;

-- 6. set_item_batch_status — mark a batch finished/removed -------------------
create or replace function set_item_batch_status(p_batch_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_module('expiry');
  if p_status not in ('active', 'finished', 'removed') then
    raise exception 'Invalid batch status: %', p_status;
  end if;

  update item_batches set status = p_status
   where id = p_batch_id and tenant_id = current_tenant_id();
  if not found then raise exception 'Batch not found in your company'; end if;
end;
$$;

revoke all on function set_item_batch_status(uuid, text) from public, anon;
grant execute on function set_item_batch_status(uuid, text) to authenticated;

-- 7. Route the new alert type to the right people ----------------------------
create or replace function alert_roles_for(p_type text)
returns user_role[]
language sql
immutable
as $$
  select case p_type
    when 'grn_pending_verification' then '{storekeeper,manager,admin}'::user_role[]
    when 'rr_pending_approval'      then '{manager,admin}'::user_role[]
    when 'dc_pending_approval'      then '{manager,admin}'::user_role[]
    when 'count_review'             then '{manager,admin}'::user_role[]
    when 'rr_to_fulfill'            then '{storekeeper,manager,admin}'::user_role[]
    when 'dc_ready_gate_out'        then '{security,manager,admin}'::user_role[]
    when 'low_stock'                then '{planner,manager,admin}'::user_role[]
    when 'out_of_stock'             then '{planner,manager,admin}'::user_role[]
    when 'count_assigned'           then '{storekeeper,manager,admin}'::user_role[]
    -- Perishables nearing/at expiry: whoever manages the store acts on it
    when 'batch_expiring'           then '{storekeeper,manager,admin}'::user_role[]
    else '{security,storekeeper,planner,manager,admin}'::user_role[]
  end;
$$;
