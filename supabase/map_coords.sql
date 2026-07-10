-- ============================================================================
-- Exact map pin for a property: latitude/longitude on the address, carried onto
-- the job so the assigned agent can see the precise location. Run once in the
-- SQL Editor.
-- ============================================================================
alter table addresses add column if not exists lat double precision;
alter table addresses add column if not exists lng double precision;

alter table jobs add column if not exists lat double precision;
alter table jobs add column if not exists lng double precision;
