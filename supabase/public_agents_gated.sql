-- ============================================================================
-- Gate the bookable-agent directory. An agent only appears in search once their
-- profile is COMPLETE + their identity is verified:
--   1. weekday + weekend rate both > 0
--   2. at least one service city
--   3. at least one scheduled day with a time slot (agent_profile.daySchedule)
--   4. a payout method set (agent_profile.payoutType non-empty)
--   5. an approved identity verification row
-- Apply to project cpudfwfepexswgmqdbnm.
-- ============================================================================
create or replace view public_agents as
select
  u.id,
  u.name,
  u.agent_profile,
  u.customer_rating,
  u.customer_reviews_count,
  u.account_no
from users u
where u.is_agent = true
  -- rates
  and coalesce((u.agent_profile ->> 'rateWeekday')::numeric, 0) > 0
  and coalesce((u.agent_profile ->> 'rateWeekend')::numeric, 0) > 0
  -- at least one service city
  and jsonb_typeof(u.agent_profile -> 'serviceCities') = 'array'
  and jsonb_array_length(u.agent_profile -> 'serviceCities') > 0
  -- at least one day in daySchedule has a non-empty slot array
  and exists (
    select 1
    from jsonb_each(coalesce(u.agent_profile -> 'daySchedule', '{}'::jsonb)) d
    where jsonb_typeof(d.value) = 'array' and jsonb_array_length(d.value) > 0
  )
  -- a payout method is set
  and coalesce(u.agent_profile ->> 'payoutType', '') <> ''
  -- identity verified
  and exists (
    select 1 from identity_verifications iv
    where iv.user_id = u.id and iv.status = 'verified'
  );
