-- W1.2 — report exports leave an audit trail.
--
-- Report exports (TB / P&L / BS / GL detail → CSV/PDF) are recorded as a
-- `report.export` row in the existing tenant-scoped ledger_audit table
-- (20260630080000). The file itself is built + downloaded client-side from the
-- RLS-scoped, fully-paginated entry list; the report-export edge function writes
-- ONE audit row per export, gated by can_access_org (read capability) with the
-- actor taken from the verified JWT — a read-only CPA can export and is audited,
-- but this path mutates nothing in the books.
--
-- No new table or column: ledger_audit.action is free text and already accepts
-- this value; the insert grant to service_role is already in place. This
-- migration only (a) documents the action value in the schema, and (b) adds a
-- partial index so "show me every export for this org" (CPA handoff review) does
-- not scan the whole audit table. ADDITIVE + idempotent — no data change.

comment on column public.ledger_audit.action is
  'entry.post | entry.reverse | entry.recategorize | period.close | period.reopen | report.export';

-- Export events are a small slice of ledger_audit; a partial index keeps the
-- "exports for this org, newest first" lookup off a full scan as the trail grows.
create index if not exists ledger_audit_exports
  on public.ledger_audit (org_id, at desc)
  where action = 'report.export';
