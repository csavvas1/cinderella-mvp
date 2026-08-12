-- One row per (booking, audience) reminder sent, so each fires at most once.
-- audience 'customer' = 2h-before nudge, 'agent' = 1h-before nudge.
-- Apply to project cpudfwfepexswgmqdbnm.
create table if not exists booking_reminders (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  audience   text not null check (audience in ('customer', 'agent')),
  sent_at    timestamptz not null default now(),
  unique (booking_id, audience)
);
create index if not exists booking_reminders_booking_idx on booking_reminders (booking_id);

alter table booking_reminders enable row level security;
drop policy if exists "own booking reminders readable" on booking_reminders;
create policy "own booking reminders readable" on booking_reminders for select using (
  exists (select 1 from bookings b where b.id = booking_reminders.booking_id and b.user_id = auth.uid())
);
