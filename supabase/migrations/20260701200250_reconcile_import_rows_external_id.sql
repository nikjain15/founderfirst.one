-- [reconcile:cattest] Captured from LIVE prod — repo/prod parity, NOT re-applied here.
--
-- THE DRIFT: the categorization + import stress-test fixes added an `external_id`
-- column to import_rows on prod (provider feeds carry their bank/OFX transaction id,
-- used to build the 'ext:<source>:<id>' idempotency key that stops a re-pull from
-- doubling the books). The reconcile migrations captured the FUNCTIONS that read it
-- (append_import_rows writes import_rows.external_id; commit_import_batch reads
-- v_row.external_id) but NOT the column itself. On a clean rebuild the column is
-- absent, so the first commit_import_batch call fails at runtime with
--   record "v_row" has no field "external_id"
-- and db-tests (phase3_import, phase4_uncategorized) has been red for days.
--
-- FIX: add the column that prod already has. Idempotent (`if not exists`) so it is a
-- no-op on prod and restores repo/prod parity for a fresh replay. Placed just before
-- 20260701200300/200400 so the functions that depend on it reconcile on top of an
-- import_rows that already carries the field. Control tower backfills schema_migrations.

alter table public.import_rows
  add column if not exists external_id text;   -- provider (OFX/bank) transaction id; null for CSV/manual rows
