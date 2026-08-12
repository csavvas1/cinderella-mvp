-- ============================================================================
-- Collapse chat to one thread per (customer, cleaner) pair — Messenger-style.
-- Previously message_threads was unique on (customer_id, cleaner_id, job_id),
-- so every job spawned a separate thread for the same two people. This:
--   1. picks the SURVIVING thread per pair (the oldest by created_at),
--   2. repoints all messages from duplicate threads onto the survivor,
--   3. carries the latest last_message_at onto the survivor,
--   4. deletes the now-empty duplicate threads,
--   5. swaps the unique constraint to (customer_id, cleaner_id).
-- Safe to re-run; after the constraint swap there are no dups left to merge.
-- Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================

-- 1+2: repoint messages from duplicate threads onto the oldest thread per pair.
with survivor as (
  select distinct on (customer_id, cleaner_id)
         id as keep_id, customer_id, cleaner_id
  from message_threads
  order by customer_id, cleaner_id, created_at asc, id asc
),
dupes as (
  select t.id as dup_id, s.keep_id
  from message_threads t
  join survivor s
    on s.customer_id = t.customer_id
   and s.cleaner_id  = t.cleaner_id
  where t.id <> s.keep_id
)
update messages m
set thread_id = d.keep_id
from dupes d
where m.thread_id = d.dup_id;

-- 3: carry newest activity onto survivors.
update message_threads keep
set last_message_at = greatest(
  keep.last_message_at,
  coalesce((select max(m.created_at) from messages m where m.thread_id = keep.id), keep.last_message_at)
);

-- 4: delete duplicate (non-survivor) threads.
with survivor as (
  select distinct on (customer_id, cleaner_id)
         id as keep_id, customer_id, cleaner_id
  from message_threads
  order by customer_id, cleaner_id, created_at asc, id asc
)
delete from message_threads t
using survivor s
where s.customer_id = t.customer_id
  and s.cleaner_id  = t.cleaner_id
  and t.id <> s.keep_id;

-- 5: swap the unique constraint. Drop any unique key covering exactly
-- (customer_id, cleaner_id, job_id), then add the pair uniqueness.
do $$
declare cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'message_threads'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(customer_id, cleaner_id, job_id)%';
  if cname is not null then
    execute format('alter table message_threads drop constraint %I', cname);
  end if;
end $$;

alter table message_threads
  drop constraint if exists message_threads_customer_id_cleaner_id_key;
alter table message_threads
  add constraint message_threads_customer_id_cleaner_id_key
  unique (customer_id, cleaner_id);
