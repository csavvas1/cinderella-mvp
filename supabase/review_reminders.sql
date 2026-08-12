-- ============================================================================
-- review_reminders — ledger of review-nudge sends, one row per (booking, stage).
-- Written ONLY by the service role (the review-reminders edge function). The
-- unique (booking_id, stage) key makes each reminder fire at most once even if
-- the cron overlaps or retries.
--   stage 1 = same-day nudge, stage 2 = +2 day follow-up.
-- Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================
create table if not exists review_reminders (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  stage      smallint not null check (stage in (1, 2)),
  sent_at    timestamptz not null default now(),
  unique (booking_id, stage)
);
create index if not exists review_reminders_booking_idx on review_reminders (booking_id);

alter table review_reminders enable row level security;

-- Customers may read their own reminder history (their booking); nobody writes
-- from the client. The service role bypasses RLS, so the function can insert.
drop policy if exists "own review reminders readable" on review_reminders;
create policy "own review reminders readable" on review_reminders
  for select using (
    exists (
      select 1 from bookings b
      where b.id = review_reminders.booking_id
        and b.user_id = auth.uid()
    )
  );
