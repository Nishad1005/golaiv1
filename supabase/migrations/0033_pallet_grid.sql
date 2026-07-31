-- Golai — Migration 0033: pallet grid coordinates (car-park layout)
--
-- Some locations are pallets that hold overhanging stock (long wood), so a
-- barcode can't be stuck where it can be scanned. Those pallets are laid out
-- like a car park — bays (rows) off an aisle, each a customisable depth — and
-- found by coordinate ("Row 2 · Col 3"), not by scan.
--
-- ADDITIVE ONLY: two nullable columns on shelves. Ordinary shelves leave them
-- null and behave exactly as before. Storing the coordinate (rather than parsing
-- it out of the code) lets the pallet map render empty positions and sort a
-- ragged grid without brittle string parsing. No RLS, no function, no data
-- change — nothing U&M's live shelf stock-take touches behaves differently.

alter table shelves add column if not exists pallet_row integer;
alter table shelves add column if not exists pallet_col integer;

comment on column shelves.pallet_row is
  'Car-park layout: the bay (row) this pallet sits in. Null for non-grid locations.';
comment on column shelves.pallet_col is
  'Car-park layout: the pallet''s position (depth) within its bay. Null for non-grid locations.';
