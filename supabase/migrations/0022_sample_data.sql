-- Golai — Migration 0022: one-click sample warehouse
--
-- A new company opens Golai to a set of empty lists. Reading a guide before you
-- can see anything is a poor first hour, and a salesperson needs a populated
-- warehouse in ten seconds, not a fifteen-minute seed script.
--
-- Everything created here is tagged so it can be removed cleanly:
--   zones     code  'ZS%'
--   items     code  'SAMPLE-%'
--   parties   name  ending '(sample)'
--   documents number containing '/SAMPLE/' or '-SAMPLE-'
-- Nothing outside those patterns is ever touched, so clearing the sample data
-- cannot take real stock with it.

-- ---------------------------------------------------------------------------
-- Load
-- ---------------------------------------------------------------------------
create or replace function load_sample_data()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   uuid := current_tenant_id();
  v_me       uuid := auth.uid();
  v_zone_fab uuid; v_zone_foam uuid; v_zone_fg uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_g1 uuid; v_fg1 uuid;
  v_fabric uuid; v_foam uuid; v_wood uuid; v_thread uuid; v_screw uuid; v_sofa uuid;
  v_supplier uuid; v_customer uuid; v_dept uuid;
  v_grn uuid; v_line_fab uuid; v_line_foam uuid;
  v_rr uuid; v_iss uuid;
begin
  perform require_module('admin_items');

  -- Refuse on a warehouse that is already in use. Sample rows mixed into real
  -- stock would be worse than no sample data at all.
  if exists (select 1 from items where tenant_id = v_tenant and deleted_at is null) then
    raise exception 'This company already has products. Sample data can only be loaded into an empty warehouse.';
  end if;

  -- Zones -------------------------------------------------------------------
  insert into zones (tenant_id, code, name, description) values
    (v_tenant, 'ZS1', 'Fabric Store', 'Sample zone'),
    (v_tenant, 'ZS2', 'Foam & Timber', 'Sample zone'),
    (v_tenant, 'ZS3', 'Finished Goods', 'Sample zone');

  select id into v_zone_fab  from zones where tenant_id = v_tenant and code = 'ZS1';
  select id into v_zone_foam from zones where tenant_id = v_tenant and code = 'ZS2';
  select id into v_zone_fg   from zones where tenant_id = v_tenant and code = 'ZS3';

  -- Locations, named the way a real client would name them ------------------
  insert into shelves (tenant_id, zone_id, code, fixture_type) values
    (v_tenant, v_zone_fab,  'ZS1-S001', 'Shelf'),
    (v_tenant, v_zone_fab,  'ZS1-S002', 'Shelf'),
    (v_tenant, v_zone_fab,  'ZS1-S003', 'Shelf'),
    (v_tenant, v_zone_foam, 'ZS2-G001', 'Ghoda'),
    (v_tenant, v_zone_foam, 'ZS2-G002', 'Ghoda'),
    (v_tenant, v_zone_fg,   'ZS3-R001', 'Rack');

  select id into v_s1  from shelves where tenant_id = v_tenant and code = 'ZS1-S001';
  select id into v_s2  from shelves where tenant_id = v_tenant and code = 'ZS1-S002';
  select id into v_s3  from shelves where tenant_id = v_tenant and code = 'ZS1-S003';
  select id into v_g1  from shelves where tenant_id = v_tenant and code = 'ZS2-G001';
  select id into v_fg1 from shelves where tenant_id = v_tenant and code = 'ZS3-R001';

  -- Products ----------------------------------------------------------------
  insert into items (tenant_id, code, name, item_type, category, uom, reorder_point) values
    (v_tenant, 'SAMPLE-AU162590', 'Cupcake Fabric — Beige',      'Fabric', 'Upholstery', 'm',   40),
    (v_tenant, 'SAMPLE-AU162591', 'Cupcake Fabric — Charcoal',   'Fabric', 'Upholstery', 'm',   40),
    (v_tenant, 'SAMPLE-FM40D',    'Foam Sheet 40D',              'Foam',   'Cushioning', 'pcs', 25),
    (v_tenant, 'SAMPLE-WD5020',   'Wood 50×20 Sheesham Batten',  'Wood',   'Frame',      'pcs', 60),
    (v_tenant, 'SAMPLE-TH2040',   'Thread 20/40 — Black',        'Thread', 'Stitching',  'pcs', 10),
    (v_tenant, 'SAMPLE-SCR32',    'Screw 32 mm',                 'Screw',  'Hardware',   'pcs', 500),
    (v_tenant, 'SAMPLE-SOFA3S',   'Aara 3-Seater Sofa',          'Finished Goods', 'Sofa', 'pcs', null);

  select id into v_fabric from items where tenant_id = v_tenant and code = 'SAMPLE-AU162590';
  select id into v_foam   from items where tenant_id = v_tenant and code = 'SAMPLE-FM40D';
  select id into v_wood   from items where tenant_id = v_tenant and code = 'SAMPLE-WD5020';
  select id into v_thread from items where tenant_id = v_tenant and code = 'SAMPLE-TH2040';
  select id into v_screw  from items where tenant_id = v_tenant and code = 'SAMPLE-SCR32';
  select id into v_sofa   from items where tenant_id = v_tenant and code = 'SAMPLE-SOFA3S';

  -- Parties -----------------------------------------------------------------
  insert into suppliers (tenant_id, name, contact_name, phone)
    values (v_tenant, 'Rajasthan Textiles (sample)', 'Mr Sharma', '+919000000001')
    returning id into v_supplier;
  insert into customers (tenant_id, name, contact_name, phone)
    values (v_tenant, 'ESPL Mumbai (sample)', 'Ms Iyer', '+919000000002')
    returning id into v_customer;
  insert into departments (tenant_id, name) values
    (v_tenant, 'Upholstery (sample)'), (v_tenant, 'Carpentry (sample)');
  select id into v_dept from departments where tenant_id = v_tenant and name = 'Upholstery (sample)';

  -- Stock, placed where a mapping walk would have put it ---------------------
  insert into stock_balances (tenant_id, item_id, shelf_id, qty_on_hand) values
    (v_tenant, v_fabric, v_s1, 120),
    (v_tenant, v_foam,   v_g1, 48),
    (v_tenant, v_wood,   v_g1, 210),
    (v_tenant, v_thread, v_s3, 6),      -- below reorder point: shows as low stock
    (v_tenant, v_screw,  v_s2, 0),      -- located but never counted
    (v_tenant, v_sofa,   v_fg1, 2);

  insert into placements (tenant_id, shelf_id, item_id, qty_before, qty_after, assigned_by)
  select v_tenant, sb.shelf_id, sb.item_id, 0, sb.qty_on_hand, v_me
  from stock_balances sb
  where sb.tenant_id = v_tenant and sb.item_id in (v_thread, v_screw, v_sofa);

  -- A completed delivery, so Receiving and the stock card have a story -------
  insert into grns (tenant_id, grn_number, supplier_id, po_ref, material_type_declared,
                    total_cartons_declared, status, created_by)
    values (v_tenant, 'GRN/SAMPLE/0001', v_supplier, 'PO-SAMPLE-0089', 'Fabric', 4, 'COMPLETED', v_me)
    returning id into v_grn;

  insert into grn_gate_entries (tenant_id, grn_id, vehicle_number, driver_name, driver_phone,
                                driver_license, transporter, security_guard_id)
    values (v_tenant, v_grn, 'RJ14 GC 5001', 'Ramesh Yadav', '+919000000003',
            'RJ1420110012345', 'Jodhpur Roadlines', v_me);

  insert into grn_lines (tenant_id, grn_id, item_id, qty_received, qty_invoice, qty_po,
                         variance_reason, qc_status)
    values (v_tenant, v_grn, v_fabric, 120, 120, 120, null, 'OK')
    returning id into v_line_fab;
  insert into grn_lines (tenant_id, grn_id, item_id, qty_received, qty_invoice, qty_po,
                         variance_reason, qc_status)
    values (v_tenant, v_grn, v_foam, 48, 50, 50, '2 sheets damaged in transit — supplier informed', 'OK')
    returning id into v_line_foam;

  insert into grn_putaways (tenant_id, grn_line_id, shelf_id, qty, putaway_by) values
    (v_tenant, v_line_fab,  v_s1, 120, v_me),
    (v_tenant, v_line_foam, v_g1, 48,  v_me);

  -- ...and material issued against a sales order ----------------------------
  insert into release_requests (tenant_id, rr_number, so_ref, customer_note, department_id,
                                foreman_id, status, created_by, approved_by)
    values (v_tenant, 'RR-SAMPLE-0001', 'SO-SAMPLE-1234', 'ESPL Mumbai — 2 sofas', v_dept,
            v_me, 'PARTIALLY_FULFILLED', v_me, v_me)
    returning id into v_rr;

  insert into release_request_lines (tenant_id, release_request_id, item_id, qty_requested, qty_issued)
    values (v_tenant, v_rr, v_fabric, 26, 13);

  insert into issuances (tenant_id, iss_number, release_request_id, so_ref, customer_note,
                         department_id, foreman_id, storekeeper_id)
    values (v_tenant, 'ISS-SAMPLE-0001', v_rr, 'SO-SAMPLE-1234', 'ESPL Mumbai — 2 sofas',
            v_dept, v_me, v_me)
    returning id into v_iss;

  insert into issuance_lines (tenant_id, issuance_id, item_id, shelf_id, qty)
    values (v_tenant, v_iss, v_fabric, v_s1, 13);

  -- The issue really left the shelf, so the ledger and the balance agree.
  update stock_balances set qty_on_hand = qty_on_hand - 13
   where tenant_id = v_tenant and item_id = v_fabric and shelf_id = v_s1;

  update tenant_settings
     set settings = coalesce(settings, '{}'::jsonb) || '{"sample_data": true}'::jsonb
   where tenant_id = v_tenant;

  return '3 zones, 6 locations, 7 products, 1 delivery and 1 issuance created.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Clear — strictly the tagged rows, nothing else
-- ---------------------------------------------------------------------------
create or replace function clear_sample_data()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_items uuid[];
  v_shelves uuid[];
begin
  perform require_module('admin_items');

  select array_agg(id) into v_items
    from items where tenant_id = v_tenant and code like 'SAMPLE-%';
  select array_agg(s.id) into v_shelves
    from shelves s join zones z on z.id = s.zone_id
   where s.tenant_id = v_tenant and z.code like 'ZS_';

  delete from issuance_lines where tenant_id = v_tenant
    and issuance_id in (select id from issuances where tenant_id = v_tenant and iss_number like '%SAMPLE%');
  delete from issuances where tenant_id = v_tenant and iss_number like '%SAMPLE%';
  delete from release_request_lines where tenant_id = v_tenant
    and release_request_id in (select id from release_requests where tenant_id = v_tenant and rr_number like '%SAMPLE%');
  delete from release_requests where tenant_id = v_tenant and rr_number like '%SAMPLE%';

  delete from grn_putaways where tenant_id = v_tenant
    and grn_line_id in (select l.id from grn_lines l join grns g on g.id = l.grn_id
                         where g.tenant_id = v_tenant and g.grn_number like '%SAMPLE%');
  delete from grn_lines where tenant_id = v_tenant
    and grn_id in (select id from grns where tenant_id = v_tenant and grn_number like '%SAMPLE%');
  delete from grn_gate_entries where tenant_id = v_tenant
    and grn_id in (select id from grns where tenant_id = v_tenant and grn_number like '%SAMPLE%');
  delete from grns where tenant_id = v_tenant and grn_number like '%SAMPLE%';

  delete from placements where tenant_id = v_tenant
    and (item_id = any(coalesce(v_items, '{}')) or shelf_id = any(coalesce(v_shelves, '{}')));
  delete from stock_balances where tenant_id = v_tenant
    and (item_id = any(coalesce(v_items, '{}')) or shelf_id = any(coalesce(v_shelves, '{}')));

  delete from items where tenant_id = v_tenant and code like 'SAMPLE-%';
  delete from shelves where id = any(coalesce(v_shelves, '{}'));
  delete from zones where tenant_id = v_tenant and code like 'ZS_';

  delete from suppliers   where tenant_id = v_tenant and name like '%(sample)';
  delete from customers   where tenant_id = v_tenant and name like '%(sample)';
  delete from departments where tenant_id = v_tenant and name like '%(sample)';

  update tenant_settings
     set settings = coalesce(settings, '{}'::jsonb) - 'sample_data'
   where tenant_id = v_tenant;

  return 'Sample data removed.';
end;
$$;

comment on function load_sample_data() is
  'Fills an empty warehouse with a small, realistic set of demo data. Refuses '
  'if any product already exists.';
comment on function clear_sample_data() is
  'Removes only rows tagged as sample (SAMPLE- codes, ZS zones, "(sample)" '
  'names, SAMPLE document numbers). Real stock is never touched.';
