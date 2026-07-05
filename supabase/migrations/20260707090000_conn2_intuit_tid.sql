-- CONN-2 — capture the intuit_tid response header on QBO API calls so it can be
-- produced for Intuit support when troubleshooting (their recommended practice).
-- Diagnostic-only column; service_role only (edge functions write it, no client
-- surface needs it) — same column-grant discipline as the OAuth token columns.

alter table external_connections add column last_intuit_tid text;

comment on column external_connections.last_intuit_tid is
  'Last intuit_tid response header seen on a QBO API call for this connection (success or error) — Intuit''s recommended support-trace field.';
