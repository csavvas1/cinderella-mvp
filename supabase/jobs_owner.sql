-- ============================================================================
-- Jobs ownership bridge: jobs are created by the customer's booking flow and
-- assigned to mock cleaner ids (not real accounts yet). To persist them under
-- RLS today, the BOOKER owns the job via customer_uid. Cleaner-side ownership
-- comes later when cleaners are real accounts.
-- Run once in the SQL Editor (after schema.sql).
-- ============================================================================

alter table jobs
  add column if not exists customer_uid uuid references users(id) on delete cascade;

create index if not exists jobs_customer_uid_idx on jobs (customer_uid);

-- replace the cleaner-based policy with a booker-based one
drop policy if exists "own jobs" on jobs;
drop policy if exists "own jobs by customer" on jobs;
create policy "own jobs by customer" on jobs
  for all using (auth.uid() = customer_uid) with check (auth.uid() = customer_uid);
