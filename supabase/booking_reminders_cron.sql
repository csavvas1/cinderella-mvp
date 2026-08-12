-- ============================================================================
-- Schedule booking-reminders every 15 minutes via pg_cron + pg_net.
-- Mirrors review_reminders_cron.sql. Prereqs (pg_cron, pg_net) already enabled.
-- Substitute the real SERVICE ROLE key at apply time; do NOT commit it.
-- Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================
select cron.schedule('booking-reminders-15min', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://cpudfwfepexswgmqdbnm.functions.supabase.co/booking-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    )
  )
$$);

-- Inspect / manage:
--   select jobname, schedule, active from cron.job where jobname = 'booking-reminders-15min';
--   select cron.unschedule(jobid) from cron.job where jobname = 'booking-reminders-15min';
