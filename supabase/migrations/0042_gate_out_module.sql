-- Golai — Migration 0042: standalone "Gate Out" module (outbound gate log)
--
-- Some clients (U&M) don't want the multi-stage Dispatch DC flow (pick → approve
-- → gate-out) for everyday outbound. They want the SAME single standalone form as
-- Receiving's gate entry, but for goods leaving: a guard logs the departure —
-- vehicle or by-hand, driver, transporter, material, declared cartons, customer,
-- and all the photos — in one screen. Receiving = standalone gate-IN log; this is
-- the standalone gate-OUT log. It records the departure with proof photos; it does
-- NOT move stock (exactly like the receiving gate entry) and has no item lines.
--
-- ADDITIVE ONLY. New module row + new table + new RPC. The existing Dispatch DC
-- flow (dispatches / dispatch_gate_exits / gate_out_dispatch) and Receiving are
-- untouched.
--
-- Registered as an OPT-IN module (requires_license = true, like costing) so it
-- stays hidden until DBBS grants it to a company in the Platform Console — it does
-- not auto-appear for every existing tenant.

-- 1. Register the module -----------------------------------------------------
insert into modules (key, default_roles, requires_license) values
  ('gate_out', '{security,storekeeper,manager,admin}', true)
on conflict (key) do update
  set default_roles = excluded.default_roles,
      requires_license = excluded.requires_license;

-- 2. The gate-out log table (one row per departure) --------------------------
create table if not exists gate_outs (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references tenants (id),
  gate_out_number        text not null,               -- GO/YYYY-MM/NNNN
  customer_id            uuid references customers (id),
  customer_freetext      text,
  reference              text,                         -- SO / DC / invoice ref
  goods_description       text,                        -- free text: what is leaving
  material_type_declared text,
  cartons_declared       integer,
  vehicle_number         text not null,               -- '' marks a hand collection
  vehicle_photos         jsonb not null default '[]',
  driver_name            text,
  driver_phone           text,
  driver_license         text,
  driver_photos          jsonb not null default '[]',
  transporter            text,
  lr_number              text,
  document_photos        jsonb not null default '[]',  -- invoice / e-way / LR
  departure_photo        text,
  note                   text,
  departed_at            timestamptz not null default now(),
  security_guard_id      uuid not null references profiles (id),
  created_at             timestamptz not null default now(),
  unique (tenant_id, gate_out_number)
);

create index if not exists gate_outs_tenant_idx on gate_outs (tenant_id, departed_at desc);

alter table gate_outs enable row level security;

-- Read within the tenant; writes go only through create_gate_out (0017 convention).
drop policy if exists gate_outs_read on gate_outs;
create policy gate_outs_read on gate_outs for select
  using (tenant_id = current_tenant_id());

grant select on gate_outs to authenticated;

-- 3. create_gate_out — mirrors create_grn_gate_entry, log only (no stock move) --
create or replace function create_gate_out(
  p_customer_id     uuid,
  p_customer_freetext text,
  p_reference       text,
  p_goods_description text,
  p_material_type   text,
  p_cartons         integer,
  p_vehicle_number  text,
  p_vehicle_photos  jsonb,
  p_driver_name     text,
  p_driver_phone    text,
  p_driver_license  text,
  p_driver_photos   jsonb,
  p_transporter     text,
  p_lr_number       text,
  p_document_photos jsonb,
  p_departure_photo text,
  p_note            text
)
returns table (gate_out_id uuid, gate_out_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
begin
  perform require_module('gate_out');

  if jsonb_array_length(coalesce(p_document_photos, '[]'::jsonb)) = 0 then
    raise exception 'At least one document photo (invoice / e-way bill / LR) is mandatory';
  end if;

  v_number := 'GO/' || to_char(now(), 'YYYY-MM') || '/' || lpad(next_sequence('gate_out')::text, 4, '0');

  insert into gate_outs (
    tenant_id, gate_out_number, customer_id, customer_freetext, reference,
    goods_description, material_type_declared, cartons_declared, vehicle_number,
    vehicle_photos, driver_name, driver_phone, driver_license, driver_photos,
    transporter, lr_number, document_photos, departure_photo, note, security_guard_id
  )
  values (
    current_tenant_id(), v_number, p_customer_id, p_customer_freetext, p_reference,
    p_goods_description, p_material_type, p_cartons, p_vehicle_number,
    coalesce(p_vehicle_photos, '[]'), p_driver_name, p_driver_phone, p_driver_license,
    coalesce(p_driver_photos, '[]'), p_transporter, p_lr_number,
    coalesce(p_document_photos, '[]'), p_departure_photo, p_note, auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_number;
end;
$$;

revoke all on function create_gate_out(
  uuid, text, text, text, text, integer, text, jsonb, text, text, text, jsonb,
  text, text, jsonb, text, text
) from public, anon;

grant execute on function create_gate_out(
  uuid, text, text, text, text, integer, text, jsonb, text, text, text, jsonb,
  text, text, jsonb, text, text
) to authenticated;

comment on table gate_outs is
  'Standalone outbound gate log (module gate_out). Mirrors the receiving gate '
  'entry for goods leaving; records vehicle/hand, driver, docs and photos. Log '
  'only — no stock movement, no item lines. Written only by create_gate_out().';
