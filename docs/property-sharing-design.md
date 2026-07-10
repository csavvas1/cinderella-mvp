# Property Sharing (Partners) — Design

**Goal:** Let a property owner invite a partner (via invite code) to co-own a specific property. The partner sees that property's full calendar (Airbnb + Booking + manual stays) and can book cleaners, add manual bookings, and edit the property — like the owner. Matches the "brother + partner share one listing" case.

**Rights (decided):** Full co-owner — book cleaners, add/edit stays, view calendar.
**Invite (decided):** Invite code/link. Owner generates a code; partner enters it to join.

---

## 1. Data model

### New table: `property_members`
```sql
create table property_members (
  id           uuid primary key default gen_random_uuid(),
  address_id   uuid not null references addresses(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,  -- the member (partner)
  role         text not null default 'partner',   -- 'owner' | 'partner'
  created_at   timestamptz not null default now(),
  unique (address_id, user_id)
);
```
- The original owner is implicitly `addresses.user_id` (unchanged). Partners are rows here.
- An `invite_code` lives on the **address** (reuse pattern of export_token): add `share_code text` to addresses (random). Partner submits it to join.

### The access problem
Today every table is `user_id = auth.uid()`. A partner's `auth.uid()` ≠ the owner's `user_id`, so RLS blocks them. We widen the policies to also allow rows tied to a property the user is a MEMBER of.

Helper (SQL function, SECURITY DEFINER) to avoid RLS recursion:
```sql
create or replace function is_property_member(addr uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from property_members m
    where m.address_id = addr and m.user_id = auth.uid()
  );
$$;
```

---

## 2. RLS changes (the security-sensitive part)

For each shared resource, ADD a member path alongside the existing owner path.

**addresses** — member can read + update a property they belong to (not delete; only owner deletes):
```sql
create policy "member reads address" on addresses
  for select using (auth.uid() = user_id or is_property_member(id));
create policy "member updates address" on addresses
  for update using (auth.uid() = user_id or is_property_member(id));
```
(Keep the existing "own addresses" for insert/delete by the owner.)

**connected_listings** (tied to address_id) — member can read/write:
```sql
create policy "member listings" on connected_listings
  for all using (auth.uid() = user_id or is_property_member(address_id))
  with check (auth.uid() = user_id or is_property_member(address_id));
```

**external_bookings** (tied to address_id) — member can read/write (add manual stays):
```sql
create policy "member ext_books" on external_bookings
  for all using (auth.uid() = user_id or is_property_member(address_id))
  with check (auth.uid() = user_id or is_property_member(address_id));
```

**bookings** (cleaner bookings) — bookings store `address_nickname`, NOT address_id. To share safely we must add `address_id uuid` to bookings so membership can be checked. Then:
```sql
create policy "member bookings" on bookings
  for all using (auth.uid() = user_id or is_property_member(address_id))
  with check (auth.uid() = user_id or is_property_member(address_id));
```
NOTE: this is a schema change to bookings (add address_id, backfill from nickname where possible).

**property_members** — a user sees their own memberships; the property owner sees/*manages* members of their property:
```sql
alter table property_members enable row level security;
create policy "see own membership" on property_members
  for select using (user_id = auth.uid()
    or exists(select 1 from addresses a where a.id = address_id and a.user_id = auth.uid()));
create policy "owner manages members" on property_members
  for all using (exists(select 1 from addresses a where a.id = address_id and a.user_id = auth.uid()))
  with check (exists(select 1 from addresses a where a.id = address_id and a.user_id = auth.uid()));
-- a partner joins themselves via an Edge Function (service role) after code check,
-- so no self-insert policy is needed (safer).
```

---

## 3. Join flow (Edge Function — safest)

Partner submits a share code. RLS can't let them read someone else's address by code, so a `join-property` Edge Function (service role) does:
1. Verify caller JWT (must be signed in).
2. Look up address by `share_code`.
3. Insert `property_members(address_id, user_id=caller, role='partner')` (dedup).
4. Return the property summary.

Owner "Share" UI just shows the `share_code` + copy button (like export_token).

---

## 4. Client changes

- **Load shared properties**: on hydrate, also fetch `property_members` for the user → then fetch those addresses + their external_bookings + listings + bookings. Merge into the account's lists (tag as shared, so UI can show a "Shared" badge + hide destructive controls for non-owners).
- **Share UI**: property edit → "Share with a partner" → show share code + copy.
- **Join UI**: Account or Calendar → "Join a shared property" → enter code → calls join-property function → property appears.
- **Booking a cleaner for a shared property**: already works once bookings carry address_id + RLS allows members.

---

## 5. Migration steps (user runs)
1. SQL: create property_members + is_property_member() + add share_code to addresses + add address_id to bookings (backfill) + all the new policies.
2. Deploy `join-property` Edge Function (verify_jwt off; verifies JWT itself).

---

## 6. Edge cases
- Owner deletes property → cascade removes members (FK on delete cascade). Good.
- Partner leaves → delete their property_members row (owner-managed, or a "leave" button → function).
- A booking's address_id must be set going forward (Book flow already knows the address → set it).
- Don't leak: the join function returns only the joined property, nothing else.

---

## Open question for you
Bookings currently key off `address_nickname`, not `address_id`. Sharing needs `address_id` on bookings for RLS. Adding it + backfilling is required. OK to add `address_id` to the bookings table (backfill existing rows by matching nickname to the owner's addresses)?
