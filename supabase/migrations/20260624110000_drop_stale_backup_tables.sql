-- Drop stale signals backup tables.
--
-- sig_items_backup_20260622 and sig_scores_backup_20260622 were one-off
-- snapshots taken as a safety net during the 22 Jun 2026 signals migration.
-- That migration succeeded; the live tables (sig_items, sig_scores) are intact
-- and current, and these snapshots are now stale (partial row counts) and only
-- consume ~5 MB. Routine cleanup — no live data depends on them.
--
-- IF NOT EXISTS guards keep this safe/idempotent.
drop table if exists public.sig_items_backup_20260622;
drop table if exists public.sig_scores_backup_20260622;
