-- ============================================================================
-- Auto-complete past cleanings. Once a cleaning's day has passed, an accepted
-- booking/job flips to 'completed' so it drives earnings, the customer review
-- flow, and the review reminders. Pure SQL on pg_cron — no edge function.
--
-- Runs daily just after local midnight (Cyprus UTC+2/3). '20 22 * * *' UTC
-- ≈ 00:20-01:20 Cyprus, i.e. shortly after a day ends.
--
-- Idempotent: the WHERE clauses only touch still-active past rows, so re-runs
-- are no-ops. Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================

-- one-off catch-up + the scheduled body share this logic; define once as a fn.
create or replace function auto_complete_past_cleanings()
returns void language sql as $$
  update jobs
     set status = 'completed', outcome = 'completed', outcome_at = now()
   where status in ('approved', 'modified')
     and date < (now() at time zone 'Europe/Nicosia')::date;

  update bookings
     set status = 'completed'
   where status in ('confirmed', 'awaiting', 'upcoming')
     and date < (now() at time zone 'Europe/Nicosia')::date;
$$;

-- run once now to backfill existing past-but-active rows.
select auto_complete_past_cleanings();

-- schedule daily. Drop any prior job of the same name first (idempotent apply).
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'auto-complete-past-daily';
exception when others then null; end $$;

select cron.schedule('auto-complete-past-daily', '20 22 * * *', $$
  select auto_complete_past_cleanings();
$$);

-- Inspect:
--   select jobname, schedule, active from cron.job where jobname='auto-complete-past-daily';
