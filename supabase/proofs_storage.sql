-- Storage bucket for proof / evidence photos (job before/after, identity
-- verification, dispute evidence). Objects are stored under a per-user folder:
--   proofs/<user_id>/<folder>/<file>.jpg
--
-- The bucket is PUBLIC for reads so a customer can view the cleaner's before/
-- after proof (and vice-versa for disputes) via a plain public URL. Writes are
-- restricted: a user may only upload into their OWN <user_id>/ prefix.
-- Run once in the Supabase SQL Editor.

-- 1. create the bucket (public read)
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do update set public = true;

-- 2. write policies: only into your own <uid>/ folder ----------------------
drop policy if exists "proofs owner insert" on storage.objects;
create policy "proofs owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "proofs owner update" on storage.objects;
create policy "proofs owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "proofs owner delete" on storage.objects;
create policy "proofs owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. reads: bucket is public, so getPublicUrl works for everyone. (No extra
--    select policy needed for a public bucket.)
