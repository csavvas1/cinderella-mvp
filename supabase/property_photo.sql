-- ============================================================================
-- Cover photo for a property. Stored as a public URL into the existing `proofs`
-- storage bucket (owner uploads via the property editor). Run once in the SQL
-- Editor. Existing member/owner RLS on `addresses` already governs read/write,
-- so no policy changes are needed for this column.
-- ============================================================================
alter table addresses add column if not exists photo_url text;
