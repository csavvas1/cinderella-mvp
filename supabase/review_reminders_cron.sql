-- ============================================================================
-- Schedule review-reminders every 15 minutes via pg_cron + pg_net.
-- Mirrors beds24_poll_cron.sql. Prereqs already applied:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
-- The bearer is the project SERVICE ROLE key — do NOT commit the real value;
-- substitute it when applying. Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================
select cron.schedule('review-reminders-15min', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://cpudfwfepexswgmqdbnm.functions.supabase.co/review-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    )
  )
$$);

-- Inspect / manage:
--   select jobname, schedule, active from cron.job where jobname = 'review-reminders-15min';
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select cron.unschedule(jobid) from cron.job where jobname = 'review-reminders-15min';
