-- Golai — Migration 0034: aisle markers for the pallet grid
--
-- A pallet area is one 2-D grid (rows × columns). Aisles run between only
-- *some* rows, so the map needs to know where. This marks the pallets of a row
-- that has an aisle after it, purely so the car-park map draws the gap in the
-- right place.
--
-- ADDITIVE ONLY: one nullable column on shelves, alongside pallet_row/pallet_col
-- from 0033. Null for every ordinary shelf and for pallet rows with no aisle. No
-- RLS, no function, no data change.

alter table shelves add column if not exists aisle_after boolean;

comment on column shelves.aisle_after is
  'Car-park layout: true on pallets of a row that has an aisle after it, so the map draws the gap. Null otherwise.';
