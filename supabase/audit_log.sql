-- ============================================================================
-- Universal append-only audit log. One immutable table that records every
-- meaningful change (insert/update) on the watched tables via DB triggers, so
-- history is never lost and the app cannot forget or bypass logging. A row is
-- NEVER updated or deleted. Run once in the SQL Editor.
--
-- Each entity keeps its "current state" row in its own table (fast reads); the
-- audit_log is the immutable truth (when an order came in, when it was accepted,
-- who did it, what changed). New tables become auditable by adding one trigger.
-- ============================================================================

create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  entity_type text not null,                 -- 'job','booking','user','address',...
  entity_id   text not null,                 -- the row's id
  action      text not null,                 -- 'created' | 'updated'
  actor_uid   uuid,                          -- auth.uid() of whoever caused it (null = system)
  at          timestamptz not null default now(),
  changed     text[],                        -- column names that changed (updates only)
  old_data    jsonb,                         -- previous row (updates only)
  new_data    jsonb                          -- new/current row
);
create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id, at);
create index if not exists audit_log_at_idx on audit_log (at);

-- ---- immutability: insert + select only, never update/delete -----------------
alter table audit_log enable row level security;
-- a user can read audit rows they caused OR that are about their own account id.
-- (Widen later if you build an admin panel.)
drop policy if exists "read own audit" on audit_log;
create policy "read own audit" on audit_log
  for select using (actor_uid = auth.uid() or entity_id = auth.uid()::text);
-- NO insert/update/delete policies for normal users: writes happen only through
-- the SECURITY DEFINER trigger below; nobody can update or delete a logged row.

-- ---- generic trigger function ----------------------------------------------
create or replace function audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_id text;
  k text;
begin
  if (tg_op = 'INSERT') then
    v_new := to_jsonb(new);
    v_id := coalesce(v_new ->> 'id', '');
    insert into audit_log (entity_type, entity_id, action, actor_uid, new_data)
      values (tg_argv[0], v_id, 'created', auth.uid(), v_new);
    return new;
  elsif (tg_op = 'UPDATE') then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id := coalesce(v_new ->> 'id', '');
    -- collect changed column names
    v_changed := array(
      select key from jsonb_each(v_new)
      where v_new -> key is distinct from v_old -> key
    );
    -- skip no-op updates
    if array_length(v_changed, 1) is null then return new; end if;
    insert into audit_log (entity_type, entity_id, action, actor_uid, changed, old_data, new_data)
      values (tg_argv[0], v_id, 'updated', auth.uid(), v_changed, v_old, v_new);
    return new;
  end if;
  return null;
end;
$$;

-- ---- attach to every lifecycle table ---------------------------------------
-- helper: (re)create an after-insert/update trigger for a table with its label.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('users','user'),
      ('addresses','address'),
      ('cards','card'),
      ('bookings','booking'),
      ('jobs','job'),
      ('reviews','review'),
      ('connected_listings','listing'),
      ('external_bookings','external_booking'),
      ('consents','consent'),
      ('notifications','notification'),
      ('property_members','property_member'),
      ('webauthn_credentials','webauthn_credential')
    ) as x(tbl, label)
  loop
    -- only if the table exists
    if to_regclass('public.'||t.tbl) is not null then
      execute format('drop trigger if exists audit_%1$s on %1$s', t.tbl);
      execute format(
        'create trigger audit_%1$s after insert or update on %1$s
         for each row execute function audit_row_change(%2$L)',
        t.tbl, t.label
      );
    end if;
  end loop;
end $$;

-- ============================================================================
-- Going forward: to make a NEW table auditable, add one trigger:
--   create trigger audit_<table> after insert or update on <table>
--     for each row execute function audit_row_change('<label>');
-- ============================================================================
