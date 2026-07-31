-- Golai — Migration 0035: blocks for the pallet grid
--
-- A pallet area is several blocks of pallets separated by roads (aisles) — each
-- block its own grid. A pallet is addressed Block · Row · Col. Roads are drawn
-- automatically between blocks, so nothing about them is stored — the layout is
-- reconstructed from the pallets grouped by block.
--
-- ADDITIVE ONLY: one nullable column on shelves, beside pallet_row/pallet_col
-- (0033). Null for every ordinary shelf. aisle_after (0034) is now unused but
-- left in place — dropping a shipped column would be destructive. No RLS, no
-- function, no data change.

alter table shelves add column if not exists pallet_block integer;

comment on column shelves.pallet_block is
  'Car-park layout: which block (bay) this pallet sits in; roads are drawn between blocks. Null for non-grid locations.';
