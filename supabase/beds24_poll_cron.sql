-- ============================================================================
-- Schedule the beds24-poll edge function hourly via pg_cron + pg_net.
-- APPLIED to project cpudfwfepexswgmqdbnm (job "beds24-poll-hourly", '7 * * * *').
--
-- Prereqs (also applied): the pg_cron and pg_net extensions.
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- The Authorization bearer is the project SERVICE ROLE key. Do NOT commit the
-- real key — fetch it from the dashboard (Settings → API) or the Management API
-- and substitute below when (re)applying. The live job already carries it.
-- ============================================================================
select cron.schedule('beds24-poll-hourly', '7 * * * *', $$
  select net.http_post(
    url := 'https://cpudfwfepexswgmqdbnm.functions.supabase.co/beds24-poll',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    )
  )
$$);

-- Inspect / manage:
--   select jobname, schedule, active from cron.job where jobname = 'beds24-poll-hourly';
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select cron.unschedule(jobid) from cron.job where jobname = 'beds24-poll-hourly';
