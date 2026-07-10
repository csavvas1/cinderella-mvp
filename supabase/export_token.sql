-- ============================================================================
-- Per-property export token. Guards the public combined-iCal feed URL that
-- Airbnb / Booking.com import (so a cleaning booking on one platform blocks the
-- date on the other). Random, non-guessable; the feed requires it. Run once.
-- ============================================================================
alter table addresses
  add column if not exists export_token text
  default encode(gen_random_bytes(16), 'hex');

-- backfill any existing rows that don't have one
update addresses set export_token = encode(gen_random_bytes(16), 'hex')
where export_token is null;
