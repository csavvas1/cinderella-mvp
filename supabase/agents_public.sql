-- ============================================================================
-- Real cleaners: make agent accounts browseable + bookable.
-- 1. public_agents view: exposes ONLY safe agent fields (no email/phone/payout)
--    so a signed-in customer can browse real agents. Customers query this view,
--    never the users table directly (users RLS still locks each row to its owner).
-- 2. jobs.cleaner_uid: when a customer books a real agent, the job routes to that
--    agent. Jobs are visible to the booker OR the assigned cleaner.
-- Run once in the SQL Editor.
-- ============================================================================

-- ---- 1. public agent directory (safe columns only) ----
create or replace view public_agents as
  select id, agent_profile, customer_rating, customer_reviews_count, account_no
  from users
  where is_agent = true;

-- the view runs with the definer's rights; expose it to signed-in users only
grant select on public_agents to authenticated;

-- ---- 2. job ownership: booker OR assigned cleaner ----
alter table jobs
  add column if not exists cleaner_uid uuid references users(id) on delete set null;

create index if not exists jobs_cleaner_uid_idx on jobs (cleaner_uid);

drop policy if exists "own jobs by customer" on jobs;
drop policy if exists "own jobs by customer or cleaner" on jobs;
create policy "own jobs by customer or cleaner" on jobs
  for all
  using (auth.uid() = customer_uid or auth.uid() = cleaner_uid)
  with check (auth.uid() = customer_uid or auth.uid() = cleaner_uid);
