-- ============================================================================
-- Friendly, human-readable account number alongside the UUID id.
-- The UUID stays the real primary key + FK target + RLS anchor; account_no is
-- display/support only. Starts at 1001. Run once in the SQL Editor.
-- ============================================================================

-- sequence starting at 1001
create sequence if not exists users_account_no_seq start with 1001;

-- add the column, defaulting to the next sequence value for new rows
alter table users
  add column if not exists account_no bigint unique default nextval('users_account_no_seq');

-- backfill any existing rows that don't have one yet (ordered by signup time)
do $$
declare r record;
begin
  for r in select id from users where account_no is null order by created_at loop
    update users set account_no = nextval('users_account_no_seq') where id = r.id;
  end loop;
end $$;
