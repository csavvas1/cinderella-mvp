-- ============================================================================
-- Auto-create a public.users profile row whenever someone signs up via Supabase
-- Auth. Runs server-side (SECURITY DEFINER) so it can't be skipped by the client.
-- Run this in the SQL Editor AFTER schema.sql.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),  -- name passed at signup (optional)
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- fire once per new auth user
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
