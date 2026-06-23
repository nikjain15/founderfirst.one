-- =============================================================================
-- Signals — one-time data reset (run in Supabase Dashboard → SQL editor)
-- =============================================================================
-- Wipes collected/scored pipeline data so you start fresh under the new
-- exclude/role/geo logic. KEEPS your config: sources, keywords, ICP examples,
-- settings. Backs up to timestamped tables first, so it is reversible.
--
-- Run each step in order. Read step 1's output before running step 3.
-- =============================================================================

-- STEP 1 — see exactly what you're about to remove.
select
  (select count(*) from sig_items)        as items,
  (select count(*) from sig_scores)       as scores,
  (select count(*) from sig_leads)        as leads,
  (select count(*) from sig_lead_events)  as lead_events;

-- STEP 2 — back up (reversible). Safe to skip only if step 1 shows all zeros.
create table if not exists sig_items_backup_20260622       as select * from sig_items;
create table if not exists sig_scores_backup_20260622      as select * from sig_scores;
create table if not exists sig_leads_backup_20260622       as select * from sig_leads;
create table if not exists sig_lead_events_backup_20260622 as select * from sig_lead_events;

-- STEP 3 — wipe. Deleting items cascades to scores, leads, and lead_events.
-- (sig_sources / sig_keywords / sig_icp_examples / sig_settings are untouched.)
delete from sig_items;

-- STEP 4 — confirm empty + sources ready to re-poll.
select
  (select count(*) from sig_items)  as items_remaining,
  (select count(*) from sig_leads)  as leads_remaining,
  (select count(*) from sig_sources where captured_via='api_direct' and enabled) as active_sources;

-- To restore later if needed:
--   insert into sig_items       select * from sig_items_backup_20260622;
--   insert into sig_scores      select * from sig_scores_backup_20260622;
--   insert into sig_leads       select * from sig_leads_backup_20260622;
--   insert into sig_lead_events select * from sig_lead_events_backup_20260622;
-- Then drop the *_backup_20260622 tables once you're confident.
