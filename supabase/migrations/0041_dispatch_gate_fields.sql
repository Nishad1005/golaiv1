-- Golai — Migration 0041: dispatch gate-out gains the receiving gate-entry fields
--
-- Receiving = gate-IN, dispatch = gate-OUT. The receiving gate entry captures a
-- rich, photo-heavy record (by-vehicle/by-hand mode, driver phone + photos,
-- transporter, material type, a document photo gallery). The dispatch gate-out
-- was leaner. This brings it to parity so the two gates match.
--
-- ADDITIVE ONLY. New nullable/default columns on dispatch_gate_exits, and the
-- gate_out_dispatch RPC is widened to carry them. Existing rows and the
-- pick/approve stages are untouched; legacy photo columns are kept so old
-- gate-out records still render. The new UI stops writing lr_photo/eway_bill_photo
-- (those documents now live in the document_photos gallery, like receiving).

-- 1. New columns (mirror grn_gate_entries) ----------------------------------
alter table dispatch_gate_exits
  add column if not exists driver_phone           text,
  add column if not exists driver_photos          jsonb not null default '[]',
  add column if not exists transporter            text,
  add column if not exists material_type_declared text,
  add column if not exists document_photos        jsonb not null default '[]';

-- 2. Widen gate_out_dispatch -------------------------------------------------
-- A function's identity includes its argument types, so replace the old
-- overloads by dropping then recreating (the drop-then-recreate style used
-- across 0008/0017). The READY-check + carton-match logic is unchanged.
drop function if exists gate_out_dispatch(uuid, text, jsonb, text, text, text, text, text, text, jsonb);
drop function if exists gate_out_dispatch_impl(uuid, text, jsonb, text, text, text, text, text, text, jsonb);

create or replace function gate_out_dispatch_impl(
  p_dispatch_id     uuid,
  p_vehicle_number  text,
  p_vehicle_photos  jsonb,
  p_driver_name     text,
  p_driver_phone    text,
  p_driver_license  text,
  p_driver_photos   jsonb,
  p_transporter     text,
  p_material_type   text,
  p_lr_number       text,
  p_departure_photo text,
  p_document_photos jsonb,
  p_scanned_cartons jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc dispatches%rowtype;
  v_expected text[];
  v_scanned text[];
begin
  select * into v_dc from dispatches
  where id = p_dispatch_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Dispatch not found';
  end if;
  if v_dc.status <> 'READY' then
    raise exception 'Dispatch is not approved for gate-out';
  end if;

  -- At least one document photo (invoice / e-way / LR), like create_grn_gate_entry.
  if coalesce(jsonb_array_length(coalesce(p_document_photos, '[]'::jsonb)), 0) = 0 then
    raise exception 'At least one document photo (invoice / e-way / LR) is required';
  end if;

  select array_agg(distinct carton_barcode) into v_expected
  from dispatch_lines
  where dispatch_id = p_dispatch_id and carton_barcode is not null;

  select array_agg(distinct value) into v_scanned
  from jsonb_array_elements_text(coalesce(p_scanned_cartons, '[]'::jsonb));

  if v_expected is not null and (
       v_scanned is null
       or not (v_expected <@ v_scanned and v_scanned <@ v_expected)
     ) then
    raise exception 'Scanned cartons do not match this DC — every sealed carton must be scanned';
  end if;

  insert into dispatch_gate_exits (
    tenant_id, dispatch_id, vehicle_number, vehicle_photos, driver_name,
    driver_phone, driver_license, driver_photos, transporter,
    material_type_declared, lr_number, departure_photo, document_photos,
    security_guard_id
  )
  values (
    current_tenant_id(), p_dispatch_id, p_vehicle_number,
    coalesce(p_vehicle_photos, '[]'), p_driver_name, p_driver_phone,
    p_driver_license, coalesce(p_driver_photos, '[]'), p_transporter,
    p_material_type, p_lr_number, p_departure_photo,
    coalesce(p_document_photos, '[]'), auth.uid()
  );

  update dispatches set status = 'DISPATCHED', updated_at = now()
  where id = p_dispatch_id;
end;
$$;

-- Module-guard wrapper (require_module before delegating) --------------------
create or replace function gate_out_dispatch(
  p_dispatch_id     uuid,
  p_vehicle_number  text,
  p_vehicle_photos  jsonb,
  p_driver_name     text,
  p_driver_phone    text,
  p_driver_license  text,
  p_driver_photos   jsonb,
  p_transporter     text,
  p_material_type   text,
  p_lr_number       text,
  p_departure_photo text,
  p_document_photos jsonb,
  p_scanned_cartons jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform require_module('dispatch');
  perform gate_out_dispatch_impl(
    p_dispatch_id, p_vehicle_number, p_vehicle_photos, p_driver_name,
    p_driver_phone, p_driver_license, p_driver_photos, p_transporter,
    p_material_type, p_lr_number, p_departure_photo, p_document_photos,
    p_scanned_cartons
  );
end;
$$;

revoke all on function gate_out_dispatch_impl(
  uuid, text, jsonb, text, text, text, jsonb, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function gate_out_dispatch(
  uuid, text, jsonb, text, text, text, jsonb, text, text, text, text, jsonb, jsonb
) to authenticated;

comment on function gate_out_dispatch(
  uuid, text, jsonb, text, text, text, jsonb, text, text, text, text, jsonb, jsonb
) is
  'Dispatch Stage 3 gate-out. Now captures the same details as the receiving gate '
  'entry: by-vehicle/by-hand, driver phone + photos, transporter, material type, '
  'and a document photo gallery. Enforces the carton scan and require_module(dispatch).';
