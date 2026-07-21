-- Golai — Migration 0013: item_type (product grouping)
-- Clients often classify products by a broad type/"definition" (Thread, Foam,
-- Fabric, Wood…) above category. Store it so users can search a whole group.

alter table items add column if not exists item_type text;

create index if not exists items_tenant_type_idx on items (tenant_id, item_type);
