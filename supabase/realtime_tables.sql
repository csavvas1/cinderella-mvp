-- Publish the tables the app subscribes to for live updates (calendar + property
-- list + sharing). Adding a table already in the publication errors harmlessly.
-- Apply to project cpudfwfepexswgmqdbnm.
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table addresses;
alter publication supabase_realtime add table property_members;
