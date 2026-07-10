-- ============================================================================
-- Real Face ID / Touch ID via WebAuthn (2nd-factor unlock, cross-device).
-- Two tables:
--   webauthn_credentials — one row per registered device authenticator, holding
--     the public key we verify future logins against. RLS: a user sees only
--     their own credentials. The Edge Function uses the service role to read
--     them during authentication (before a session exists), so it bypasses RLS.
--   webauthn_challenges — short-lived challenges issued during the two-step
--     register/authenticate handshake. Written + read by the Edge Function
--     (service role); never touched by the browser, so no client policy.
-- Run once in the Supabase SQL Editor.
-- ============================================================================

create table if not exists webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  credential_id text not null unique,         -- base64url credential id
  public_key    text not null,                -- base64url COSE public key
  counter       bigint not null default 0,    -- signature counter (clone detection)
  transports    text,                         -- csv: "internal","hybrid",...
  device_label  text,                         -- optional friendly name
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists webauthn_credentials_user_idx on webauthn_credentials (user_id);

alter table webauthn_credentials enable row level security;
drop policy if exists "own credentials" on webauthn_credentials;
create policy "own credentials" on webauthn_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Short-lived challenges. `key` is the user id (registration, we know who) or a
-- lookup value for authentication. Rows older than a few minutes are stale.
create table if not exists webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,                   -- user_id (register) or email (auth)
  kind       text not null,                   -- 'register' | 'auth'
  challenge  text not null,                   -- base64url challenge
  created_at timestamptz not null default now()
);
create index if not exists webauthn_challenges_key_idx on webauthn_challenges (key, kind);

alter table webauthn_challenges enable row level security;
-- no client policy on purpose: only the Edge Function (service role) uses this.
