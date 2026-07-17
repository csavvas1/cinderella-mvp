-- ============================================================================
-- Beds24 channel-manager billing + sync.
-- Run in the Supabase SQL Editor. Idempotent (safe to re-run).
--
-- Adds:
--   * real Stripe/billing columns on `users` (Pro was previously a mock boolean
--     that only lived in TS types, never in Postgres).
--   * Beds24 property linkage + per-property billing state on `connected_listings`.
--   * `billing_events` audit table.
-- ============================================================================

-- ---- users: Stripe / subscription state -----------------------------------
alter table users add column if not exists pro                   boolean not null default false;
alter table users add column if not exists stripe_customer_id     text;
alter table users add column if not exists stripe_subscription_id text;
alter table users add column if not exists subscription_status    text;   -- active|past_due|canceled|incomplete|...

-- ---- connected_listings: Beds24 link + billing ----------------------------
-- Beds24 listings have no iCal URL, so ical_url must be nullable.
alter table connected_listings alter column ical_url drop not null;

alter table connected_listings add column if not exists beds24_property_id        bigint;
alter table connected_listings add column if not exists beds24_room_id            bigint;
alter table connected_listings add column if not exists billing_active            boolean not null default false;
alter table connected_listings add column if not exists stripe_subscription_item_id text;

create index if not exists connected_listings_beds24_property_idx
  on connected_listings (beds24_property_id);

-- ---- external_bookings: Beds24 source id (idempotent poll upsert) ----------
alter table external_bookings add column if not exists beds24_booking_id bigint;
-- unique so the poller can upsert without creating duplicates
create unique index if not exists external_bookings_beds24_id_uidx
  on external_bookings (beds24_booking_id) where beds24_booking_id is not null;

-- ---- billing_events: audit trail ------------------------------------------
create table if not exists billing_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,        -- checkout|property_connected|property_disconnected|invoice_paid|payment_failed|sub_updated|sub_deleted
  stripe_ref text,                 -- subscription/invoice/item id
  amount     numeric,              -- in EUR, informational
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists billing_events_user_idx on billing_events (user_id);

alter table billing_events enable row level security;

-- own rows only (drop-then-create so re-runs don't error on duplicate policy)
drop policy if exists "own billing_events" on billing_events;
create policy "own billing_events" on billing_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
