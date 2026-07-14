-- Identity verification submissions. One row per user (latest submission).
-- Photo URLs point at the private-ish `proofs` bucket (id/ folder).
-- Run once in the Supabase SQL Editor.
create table if not exists identity_verifications (
  user_id     uuid primary key references users(id) on delete cascade,
  doc_type    text not null,                 -- 'id' | 'passport'
  doc_number  text,
  expiry      text,                          -- MM/YY as entered
  photos      text[] not null default '{}',  -- document photo URLs
  status      text not null default 'submitted', -- 'submitted' | 'verified' | 'rejected'
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table identity_verifications enable row level security;

-- a user reads + writes only their own verification row
drop policy if exists "own verification" on identity_verifications;
create policy "own verification" on identity_verifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
