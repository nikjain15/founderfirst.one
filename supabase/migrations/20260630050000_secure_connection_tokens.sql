-- P0 fix — OAuth integration tokens must NEVER be client-readable (ARCHITECTURE §9).
--
-- WHY: external_connections.access_token / refresh_token / state held live Xero/QBO
-- credentials, and the audit PROVED (live) that any org member could read them via
-- PostgREST. The phase3 migration's column-scoped `grant select (non-secret cols)`
-- was a no-op: Supabase's DEFAULT privileges already `grant all on all tables ... to
-- anon, authenticated`, so authenticated held table-level SELECT on EVERY column.
-- A column GRANT cannot subtract from a table GRANT — RLS gates rows, not columns
-- (LEARNINGS Rule 15). The ONLY way to keep a secret column off clients is to REVOKE.
--
-- This REVOKEs SELECT on just the secret columns from anon + authenticated. The
-- non-secret columns (provider/status/tenant_name/realm_id/scope/last_error/…) stay
-- readable by org members (the connection-status UI needs them), and service_role —
-- which the OAuth/refresh edge functions use — is unaffected and still reads tokens.

revoke select (access_token)  on public.external_connections from anon, authenticated;
revoke select (refresh_token) on public.external_connections from anon, authenticated;
revoke select (state)         on public.external_connections from anon, authenticated;

-- Also revoke the (RLS-blocked but over-broad) write privileges on the secret
-- columns so the grant surface matches intent; ec_nowrite already denies row writes.
revoke insert (access_token, refresh_token, state) on public.external_connections from anon, authenticated;
revoke update (access_token, refresh_token, state) on public.external_connections from anon, authenticated;

-- NOTE (tracked, follow-up): tokens are still PLAINTEXT at rest. Before GA, move
-- access_token/refresh_token into Supabase Vault (vault.secrets) or pgsodium and
-- store only a secret reference id here, decrypting solely in the service-role
-- refresh path. This migration closes the client-read exposure; encryption-at-rest
-- is the remaining defense-in-depth layer.
