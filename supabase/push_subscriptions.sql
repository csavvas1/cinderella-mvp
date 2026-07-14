-- Web Push subscriptions. One row per device/browser subscription for a user.
-- The send-push Edge Function reads these (service role) to deliver pushes.
-- Run once in the Supabase SQL Editor.
create table if not exists push_subscriptions (
  endpoint    text primary key,          -- the push endpoint URL (unique per sub)
  user_id     uuid not null references users(id) on delete cascade,
  p256dh      text not null,             -- client public key (from the subscription)
  auth        text not null,             -- client auth secret (from the subscription)
  created_at  timestamptz not null default now()
);
create index if not exists push_subs_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- a user manages only their own subscriptions
drop policy if exists "own push subs" on push_subscriptions;
create policy "own push subs" on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
