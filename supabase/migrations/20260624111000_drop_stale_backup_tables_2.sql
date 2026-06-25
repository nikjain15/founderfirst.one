-- Drop the remaining stale signals backup tables from the 22 Jun 2026 snapshot.
--
-- Companions to sig_items_backup_20260622 / sig_scores_backup_20260622 (dropped
-- in 20260624110000). Same one-off safety-net snapshots; live sig_leads /
-- sig_lead_events are intact and current. Routine cleanup, idempotent.
drop table if exists public.sig_leads_backup_20260622;
drop table if exists public.sig_lead_events_backup_20260622;
