-- Golai — Migration 0014: flag auto-assigned item codes
-- When an item is imported/created without a client code, Golai assigns an
-- ITM-NNNNN code. This flag marks those so they can be found and replaced with
-- the client's real code later. Rows imported with a client code stay false.

alter table items add column if not exists code_auto_assigned boolean not null default false;

create index if not exists items_tenant_autocode_idx
  on items (tenant_id) where code_auto_assigned;
