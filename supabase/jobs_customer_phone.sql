-- Add the customer's phone to jobs so the assigned cleaner can call them on the
-- day of the job. Populated at booking time from the customer's profile.
-- Run once in the Supabase SQL Editor.
alter table jobs add column if not exists customer_phone text;
