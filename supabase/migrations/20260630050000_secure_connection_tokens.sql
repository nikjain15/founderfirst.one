-- P0 fix — OAuth integration tokens must NEVER be client-readable (ARCHITECTURE §9).
--
-- WHY: external_connections.access_token / refresh_token / state held live Xero/QBO
-- credentials, and the audit PROVED (live) that any org member could read them via
-- PostgREST. The phase3 migration's column-scoped `grant select (non-secret cols)`
-- was a no-op: Supabase's DEFAULT privileges already `grant all on all tables ... to
-- anon, authenticated`, so authenticated held TABLE-level SELECT on EVERY column.
--
-- A column-level GRANT or REVOKE cannot change what a TABLE-level grant covers
-- (LEARNINGS Rule 15 — RLS gates rows, not columns). So we must REVOKE the
-- table-level SELECT and then re-grant SELECT on ONLY the non-secret columns.

-- 1. drop the table-wide read/write grants that the Supabase default applied.
revoke select, insert, update, delete on public.external_connections from anon, authenticated;

-- 2. re-grant SELECT to authenticated on the non-secret columns only — the
--    connection-status UI needs these; access_token/refresh_token/state are omitted
--    so they can never reach a client. RLS (ec_select) still row-gates to org members.
grant select (id, org_id, provider, realm_id, tenant_name, scope, status, last_error, connected_by, created_at, updated_at)
  on public.external_connections to authenticated;

-- service_role (used by the OAuth/refresh edge functions) keeps full access; it was
-- granted explicitly in the phase3 migration and is unaffected by the revokes above.
-- Client row writes were already denied by the ec_nowrite RLS policy.

-- NOTE (tracked, follow-up): tokens are still PLAINTEXT at rest. Before GA, move
-- access_token/refresh_token into Supabase Vault (vault.secrets) or pgsodium and
-- store only a secret reference id here. This migration closes the client-read
-- exposure; encryption-at-rest is the remaining defense-in-depth layer.
