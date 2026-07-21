-- Golai — Migration 0016: per-user module access overrides
--
-- Roles set the sensible default for each of the five job types. This column
-- holds per-person exceptions on top of that — e.g. {"dispatch": false} for a
-- storekeeper who must not run dispatches, or {"assign": true} to let a planner
-- record locations. Absent key = use the role default.

alter table profiles
  add column if not exists module_access jsonb not null default '{}'::jsonb;
