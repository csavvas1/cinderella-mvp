-- ============================================================================
-- Real customer <-> cleaner messaging.
-- Two tables: message_threads (one conversation per customer/cleaner/job) and
-- messages (the individual chat lines). RLS lets ONLY the two parties on a
-- thread read/write it. Realtime is enabled so new messages arrive instantly.
-- Run once in the Supabase SQL Editor.
-- ============================================================================

create table if not exists message_threads (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references users(id) on delete cascade,
  cleaner_id      uuid not null references users(id) on delete cascade,
  job_id          uuid references jobs(id) on delete set null,   -- job context (jobs.id is uuid)
  subject         text not null default '',
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  -- one thread per (customer, cleaner, job) trio. job_id NULL groups as one
  -- general thread per pair.
  unique (customer_id, cleaner_id, job_id)
);
create index if not exists message_threads_customer_idx on message_threads (customer_id);
create index if not exists message_threads_cleaner_idx  on message_threads (cleaner_id);

create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references message_threads(id) on delete cascade,
  from_user_id uuid not null references users(id) on delete cascade,
  body         text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists messages_thread_idx on messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS: a thread (and its messages) is visible/writable ONLY to its two parties.
-- ---------------------------------------------------------------------------
alter table message_threads enable row level security;
drop policy if exists "thread parties" on message_threads;
create policy "thread parties" on message_threads for all
  using (auth.uid() = customer_id or auth.uid() = cleaner_id)
  with check (auth.uid() = customer_id or auth.uid() = cleaner_id);

alter table messages enable row level security;
drop policy if exists "thread messages" on messages;
create policy "thread messages" on messages for all
  using (exists (
    select 1 from message_threads t
    where t.id = messages.thread_id
      and (t.customer_id = auth.uid() or t.cleaner_id = auth.uid())
  ))
  with check (exists (
    select 1 from message_threads t
    where t.id = messages.thread_id
      and (t.customer_id = auth.uid() or t.cleaner_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Realtime: publish inserts/updates so the client subscription fires live.
-- (If a table is already in the publication this errors harmlessly — ignore.)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table message_threads;
