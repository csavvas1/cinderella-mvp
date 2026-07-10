-- ============================================================================
-- Add the agent's real name to the public_agents view so the browsable cleaner
-- list shows their full name instead of falling back to "Cleaner". Only exposes
-- the display name — no email/phone/payout. Run once in the SQL Editor.
-- ============================================================================
create or replace view public_agents as
  select id, name, agent_profile, customer_rating, customer_reviews_count, account_no
  from users
  where is_agent = true;

grant select on public_agents to authenticated;
