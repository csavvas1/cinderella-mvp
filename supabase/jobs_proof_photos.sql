-- Persist before/after proof photo URLs on the job (public URLs in the `proofs`
-- Storage bucket). Saved as the cleaner captures them so the evidence is
-- permanently attached to the job (visible to the cleaner and the customer).
-- Run once in the Supabase SQL Editor.
alter table jobs add column if not exists before_photos text[] not null default '{}';
alter table jobs add column if not exists after_photos  text[] not null default '{}';
