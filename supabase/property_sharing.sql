-- ============================================================================
-- Property sharing (partners). A partner joins a specific property via a share
-- code and becomes a full co-owner of THAT property: sees its calendar, adds
-- stays, books cleaners. RLS is widened with an "owner OR member" path.
-- Run once in the SQL Editor.
-- ============================================================================

-- 1. membership table -------------------------------------------------------
create table if not exists property_members (
  id          uuid primary key default gen_random_uuid(),
  address_id  uuid not null references addresses(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null default 'partner',   -- 'owner' | 'partner'
  created_at  timestamptz not null default now(),
  unique (address_id, user_id)
);
create index if not exists property_members_user_idx on property_members (user_id);
create index if not exists property_members_addr_idx on property_members (address_id);

-- 2. share code on the property (the invite) --------------------------------
alter table addresses
  add column if not exists share_code text default encode(gen_random_bytes(6), 'hex');
update addresses set share_code = encode(gen_random_bytes(6), 'hex') where share_code is null;

-- 3. bookings need address_id for membership checks (they key off nickname
--    today). Add it + backfill by matching the owner's address nickname.
alter table bookings add column if not exists address_id uuid references addresses(id) on delete set null;
update bookings b set address_id = a.id
  from addresses a
  where b.address_id is null and a.user_id = b.user_id and a.nickname = b.address_nickname;

-- 4. membership helper (SECURITY DEFINER avoids RLS recursion) ---------------
create or replace function is_property_member(addr uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(
    select 1 from property_members m
    where m.address_id = addr and m.user_id = auth.uid()
  );
$$;

-- 5. widen RLS: owner OR member -------------------------------------------------
-- addresses: members read + update (only the owner inserts/deletes)
drop policy if exists "member reads address" on addresses;
create policy "member reads address" on addresses
  for select using (auth.uid() = user_id or is_property_member(id));
drop policy if exists "member updates address" on addresses;
create policy "member updates address" on addresses
  for update using (auth.uid() = user_id or is_property_member(id))
  with check (auth.uid() = user_id or is_property_member(id));

-- connected_listings (address_id)
drop policy if exists "member listings" on connected_listings;
create policy "member listings" on connected_listings
  for all using (auth.uid() = user_id or is_property_member(address_id))
  with check (auth.uid() = user_id or is_property_member(address_id));

-- external_bookings (address_id)
drop policy if exists "member ext_books" on external_bookings;
create policy "member ext_books" on external_bookings
  for all using (auth.uid() = user_id or is_property_member(address_id))
  with check (auth.uid() = user_id or is_property_member(address_id));

-- bookings (address_id)
drop policy if exists "member bookings" on bookings;
create policy "member bookings" on bookings
  for all using (auth.uid() = user_id or is_property_member(address_id))
  with check (auth.uid() = user_id or is_property_member(address_id));

-- 6. property_members policies ------------------------------------------------
alter table property_members enable row level security;
-- a user sees their own memberships; the property owner sees members of theirs
drop policy if exists "see membership" on property_members;
create policy "see membership" on property_members
  for select using (
    user_id = auth.uid()
    or exists(select 1 from addresses a where a.id = address_id and a.user_id = auth.uid())
  );
-- only the property owner can add/remove members directly; partners join via the
-- join-property Edge Function (service role), and can delete their OWN row (leave)
drop policy if exists "owner manages members" on property_members;
create policy "owner manages members" on property_members
  for all using (exists(select 1 from addresses a where a.id = address_id and a.user_id = auth.uid()))
  with check (exists(select 1 from addresses a where a.id = address_id and a.user_id = auth.uid()));
drop policy if exists "member leaves" on property_members;
create policy "member leaves" on property_members
  for delete using (user_id = auth.uid());
