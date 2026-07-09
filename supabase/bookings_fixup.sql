-- ============================================================================
-- Fixups discovered during the bookings/jobs migration. Run once in SQL Editor.
-- 1. payment_method: card_id is uuid, but bookings can pay via a sentinel
--    ("applepay", "googlepay", "cash") that isn't a saved card. Store those here.
-- 2. Drop jobs.booking_id FK: a job is inserted right after its booking; the FK
--    caused insert-order race failures (23503). booking_id stays a plain uuid ref.
-- ============================================================================

alter table bookings add column if not exists payment_method text;

alter table jobs drop constraint if exists jobs_booking_id_fkey;

-- 3. seen_by_agent: an auto-accepted job is NEW to the agent until they open it;
--    this flag drives the "New" badge on the Jobs/agent tabs.
alter table jobs add column if not exists seen_by_agent boolean not null default false;

-- 4. audit / SLA timeline columns
alter table jobs add column if not exists alerted_at timestamptz;
alter table jobs add column if not exists responded_at timestamptz;
alter table jobs add column if not exists response text;      -- 'accepted' | 'declined'
alter table jobs add column if not exists outcome text;        -- 'completed' | 'cancelled' | 'declined'
alter table jobs add column if not exists outcome_at timestamptz;
alter table bookings add column if not exists confirmed_at timestamptz;
