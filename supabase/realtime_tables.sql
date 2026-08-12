-- Publish the tables the app subscribes to for live updates (calendar + property
-- list + sharing). Adding a table already in the publication errors harmlessly.
-- Apply to project cpudfwfepexswgmqdbnm.
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table addresses;
alter publication supabase_realtime add table property_members;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table cards;
alter publication supabase_realtime add table identity_verifications;
alter publication supabase_realtime add table reviews;
alter publication supabase_realtime add table connected_listings;
alter publication supabase_realtime add table external_bookings;
alter publication supabase_realtime add table consents;
-- push_subscriptions intentionally NOT published: device-internal, no UI, and
-- self-writes on every session would just cause pointless re-hydrate churn.
