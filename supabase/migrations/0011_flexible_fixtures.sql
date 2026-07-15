-- Golai — Migration 0011: storage places are client-named, not a fixed enum.
-- Clients call their storage whatever they use on the floor ("Shelf", "Ghoda",
-- "Rack", anything). fixture_type becomes free text; existing single-letter
-- enum values are expanded to their full names.

alter table shelves
  alter column fixture_type type text
  using (
    case fixture_type::text
      when 'S' then 'Shelf'
      when 'G' then 'Ghoda'
      when 'P' then 'Pallet'
      when 'R' then 'Rack'
      else fixture_type::text
    end
  );

alter table shelves alter column fixture_type set default 'Shelf';

drop type if exists fixture_type;
