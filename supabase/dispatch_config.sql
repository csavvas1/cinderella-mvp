-- ============================================================================
-- Auto-dispatch configuration per property (was local-only). Persists the
-- owner's auto-cleaning settings so they survive reload and sync across devices.
-- Run once in the SQL Editor. Existing member/owner RLS on `addresses` already
-- governs read/write, so no policy changes are needed.
-- ============================================================================
alter table addresses add column if not exists auto_dispatch boolean;
alter table addresses add column if not exists dispatch_cleaner_ids text[];
alter table addresses add column if not exists dispatch_time text;
alter table addresses add column if not exists dispatch_hours double precision;
