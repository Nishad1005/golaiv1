-- Golai — U&M Designs tenant onboarding seed
-- Run ONCE in the Supabase SQL Editor, AFTER:
--   1. Migration 0011 has been applied
--   2. An auth user for merchant@uandm.co.in exists (Authentication → Users)
--      → paste its UUID below where marked.
--
-- Creates: the U&M tenant, its admin profile, and the 13 confirmed zones from
-- the "U&M Designs — Warehouse Zone Master V2" (23-Jun-2026, Store Tanawada).
-- Storage places (shelves/ghodas) are added by U&M in-app per zone.

with new_tenant as (
  insert into tenants (name, address)
  values ('U&M Designs Pvt Ltd', 'Store Tanawada, Jodhpur')
  returning id
),
admin_profile as (
  insert into profiles (id, tenant_id, email, full_name, role)
  select
    '3fd66271-ae60-4e99-b599-178c4a940917',  -- merchant@uandm.co.in
    new_tenant.id,
    'merchant@uandm.co.in',
    'U&M Admin',
    'admin'
  from new_tenant
  returning id
)
insert into zones (tenant_id, code, name, default_category, description)
select new_tenant.id, z.code, z.name, z.category, z.notes
from new_tenant,
(values
  ('Z01', 'Main Store (Hardware)',                        'Raw Material',                'Hardware items — main storage'),
  ('Z02', 'Fabric / Leather',                             'Raw Material',                'Soft goods — upholstery raw material'),
  ('Z03', 'Foam',                                         'Raw Material',                'Foam blocks / sheets'),
  ('Z04', 'Wood',                                         'Raw Material',                'Timber / boards / wooden components'),
  ('Z05', 'Packaging',                                    'Raw Material / Consumables',  'Cartons, wraps, packing materials'),
  ('Z06', 'Chemical',                                     'Raw Material / Consumables',  'Adhesives, finishes, chemicals'),
  ('Z07', 'Tools / Factory Assets',                       'Assets',                      'Tools and factory-owned equipment'),
  ('Z08', 'Dead Stock',                                   'Non-Active Inventory',        'Obsolete / unused stock — pending disposition'),
  ('Z09', 'Receiving Material',                           'Operations — Inbound',        'Goods received, pending QC / putaway'),
  ('Z10', 'Dispatches',                                   'Operations — Outbound',       'Goods ready for or in dispatch'),
  ('Z11', 'Service (Repair & Maintenance)',               'Operations',                  'Items under repair / maintenance'),
  ('Z12', 'Red Bin Areas',                                'Quality / Rejection',         'Rejected / quarantined items'),
  ('Z13', 'Sample Hold + Finished Goods / Showroom Stock','Finished Goods & Samples',    'Combined zone — samples on hold and finished/showroom stock')
) as z(code, name, category, notes);

-- Verify:
--   select t.name, count(z.id) zones from tenants t
--   join zones z on z.tenant_id = t.id
--   where t.name like 'U&M%' group by t.name;   → 13 zones
