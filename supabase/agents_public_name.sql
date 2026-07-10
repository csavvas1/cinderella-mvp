-- ============================================================================
-- Add the agent's real name to the public_agents view so the browsable cleaner
-- list shows their full name instead of falling back to "Cleaner". Only exposes
-- the display name — no email/phone/payout. Run once in the SQL Editor.
-- ============================================================================
-- Drop first: `create or replace view` can't reorder/insert columns of an
-- existing view (Postgres errors trying to rename a column). A view holds no
-- data, so dropping + recreating is safe.
drop view if exists public_agents;

create view public_agents as
  select id, name, agent_profile, customer_rating, customer_reviews_count, account_no
  from users
  where is_agent = true;

grant select on public_agents to authenticated;
