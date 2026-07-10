-- ============================================================================
-- Persist a customer's saved cleaners (favourites) on their users row.
-- Stored as a jsonb array of cleaner ids. RLS already restricts users to their
-- own row, so no extra policy is needed. Run once in the SQL Editor.
-- ============================================================================
alter table users
  add column if not exists favourites jsonb not null default '[]'::jsonb;
