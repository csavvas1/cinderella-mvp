-- ============================================================================
-- Cinderella — Phase 1 schema (Postgres / Supabase)
-- Run this in the Supabase SQL Editor. Mirrors src/types.ts.
-- One person = one row in `users` (both customer + agent, via is_agent flag).
-- RLS is enabled + policies added at the bottom so the anon/publishable key is
-- safe in the browser (each user only sees their own rows).
-- ============================================================================

-- ---- enums -----------------------------------------------------------------
create type booking_status  as enum ('confirmed','awaiting','upcoming','completed','cancelled','declined');
create type job_status      as enum ('pending','approved','declined','completed','cancelled','modified');
create type job_type        as enum ('Residential','Office','Short-let');
create type property_type   as enum ('apartment','house');
create type recurrence_kind as enum ('none','weekly','biweekly');
create type notif_audience  as enum ('customer','agent');
create type cancelled_by    as enum ('customer','cleaner');
create type listing_platform as enum ('airbnb','booking','vrbo','other');

-- ---- users -----------------------------------------------------------------
-- id matches the Supabase Auth user id (auth.uid()). agent_profile kept as jsonb
-- for now (rate/schedule/payout) — can be normalised later if needed.
create table users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  name                  text not null default '',
  email                 text,
  phone                 text,
  is_agent              boolean not null default false,
  launch_side           text not null default 'customer',
  customer_rating       numeric not null default 0,
  customer_reviews_count int   not null default 0,
  customer_cancellations int   not null default 0,
  referral_code         text,
  referred_by_code      text,
  agent_profile         jsonb,
  supply_warning_ack_version int,
  created_at            timestamptz not null default now()
);

-- ---- addresses -------------------------------------------------------------
create table addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  nickname       text not null,
  address        text not null,
  property_type  property_type not null default 'apartment',
  apartment_number text,
  floor          text,
  bedrooms       int not null default 0,
  bathrooms      int not null default 0,
  kitchens       int not null default 0,
  common_rooms   int not null default 0,
  linked_card_id uuid,
  created_at     timestamptz not null default now()
);
create index on addresses (user_id);

-- ---- cards -----------------------------------------------------------------
-- NEVER store a raw PAN. Only the opaque JCC token + display fields.
create table cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  nickname   text not null,
  last4      text not null,
  brand      text not null,
  jcc_token  text,
  created_at timestamptz not null default now()
);
create index on cards (user_id);

-- ---- bookings --------------------------------------------------------------
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,  -- the customer
  cleaner_id       text not null,
  cleaner_name     text not null,
  cleaner_photo    text,
  address_nickname text not null,
  address          text not null,
  date             date not null,
  time             text not null,
  duration_hours   numeric not null,
  rate_per_hour    numeric not null,
  total            numeric not null,
  commission       numeric,
  cleaner_pay      numeric,
  scope            text not null default 'whole',
  status           booking_status not null default 'awaiting',
  job_id           uuid,
  external_booking_id uuid,
  recurring        boolean not null default false,
  recurrence       recurrence_kind not null default 'none',
  recur_days       text[],
  series_id        uuid,
  card_id          uuid,
  rating           numeric,
  review_text      text,
  tip              numeric,
  urgent           boolean,
  cancelled_by     cancelled_by,
  cancelled_at     timestamptz,
  dismissed_by_customer boolean not null default false,
  refund           jsonb,
  created_at       timestamptz not null default now()
);
create index on bookings (user_id);
create index on bookings (series_id);
create index on bookings (status);

-- ---- jobs ------------------------------------------------------------------
-- The agent-side view of a booking. cleaner_id references the user acting as
-- the cleaner (nullable for seed/demo jobs with no real account yet).
create table jobs (
  id                 uuid primary key default gen_random_uuid(),
  cleaner_id         uuid references users(id) on delete set null,
  booking_id         uuid references bookings(id) on delete set null,
  customer_name      text not null,
  type               job_type not null default 'Residential',
  property_type      property_type,
  apartment_number   text,
  floor              text,
  address            text not null,
  date               date not null,
  time               text not null,
  duration_hours     numeric not null,
  rate_per_hour      numeric not null,
  cleaner_pay        numeric,
  bedrooms           int not null default 0,
  bathrooms          int not null default 0,
  kitchens           int not null default 0,
  common_rooms       int not null default 0,
  distance_from_home_km numeric not null default 0,
  distance_from_prev_km numeric,
  status             job_status not null default 'pending',
  auto_accepted      boolean,
  customer_rating    numeric,
  customer_reviews_count int,
  customer_cancellations int,
  agent_rating_of_customer numeric,
  agent_rating_note  text,
  -- cancellation / modification tracking (mirrors types.ts)
  dismissed_by_agent boolean not null default false,
  cancelled_at       timestamptz,
  cleaner_cancelled_at timestamptz,
  prev_status        job_status,
  modified_at        timestamptz,
  modified_note      text,
  prev_date          date,
  prev_time          text,
  prev_duration_hours numeric,
  created_at         timestamptz not null default now()
);
create index on jobs (cleaner_id);
create index on jobs (booking_id);
create index on jobs (status);

-- ---- reviews ---------------------------------------------------------------
create table reviews (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid references users(id) on delete set null,  -- who wrote it
  cleaner_id text not null,                                  -- who it's about
  author     text not null,
  rating     numeric not null,
  text       text not null default '',
  date       date not null default now(),
  created_at timestamptz not null default now()
);
create index on reviews (cleaner_id);

-- ---- notifications ---------------------------------------------------------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  audience   notif_audience not null,
  kind       text not null,
  title      text not null,
  body       text not null,
  read       boolean not null default false,
  booking_id uuid,
  job_id     uuid,
  created_at timestamptz not null default now()
);
create index on notifications (user_id);

-- ---- consents (legal acceptance proof) -------------------------------------
create table consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  doc_id      text not null,
  version     int not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, doc_id)
);
create index on consents (user_id);

-- ---- channel manager (short-let sync) --------------------------------------
create table connected_listings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  platform   listing_platform not null,
  name       text not null,
  ical_url   text not null,
  address_id uuid references addresses(id) on delete set null,
  connected_at timestamptz not null default now()
);
create index on connected_listings (user_id);

create table external_bookings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  listing_id uuid references connected_listings(id) on delete cascade,
  platform   listing_platform not null,
  guest      text not null,
  check_in   date not null,
  check_out  date not null,
  address_id uuid references addresses(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on external_bookings (user_id);

-- ============================================================================
-- Row-Level Security. Enable on every table, then allow a user to touch only
-- their own rows. Without this the anon key could read everyone's data.
-- ============================================================================
alter table users               enable row level security;
alter table addresses           enable row level security;
alter table cards               enable row level security;
alter table bookings            enable row level security;
alter table jobs                enable row level security;
alter table reviews             enable row level security;
alter table notifications       enable row level security;
alter table consents            enable row level security;
alter table connected_listings  enable row level security;
alter table external_bookings   enable row level security;

-- users: read/update only your own row
create policy "own user row" on users
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- generic owner policies (user_id = auth.uid())
create policy "own addresses"  on addresses          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cards"      on cards              for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own bookings"   on bookings           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notifs"     on notifications      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own consents"   on consents           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own listings"   on connected_listings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own ext_books"  on external_bookings  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- jobs: the cleaner assigned to the job owns it
create policy "own jobs" on jobs
  for all using (auth.uid() = cleaner_id) with check (auth.uid() = cleaner_id);

-- reviews: anyone signed in may READ (public reputation); only the author writes
create policy "reviews readable" on reviews for select using (auth.role() = 'authenticated');
create policy "write own reviews" on reviews for insert with check (auth.uid() = author_id);
