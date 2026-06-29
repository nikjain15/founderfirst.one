-- Phase 3 — external accounting connections (ARCHITECTURE.md §6.4, §6.6, §9).
-- QBO/Xero are adapters behind the import interface: an OAuth connection is stored
-- here, then `*-import` pulls the chart of accounts + transactions into an
-- import_batch and commits through the SAME verified ledger path (commit_import_batch).
--
-- Security: integration tokens must NEVER reach the browser. Two defenses:
--   • RLS row-gate (can_access_org) — you only see your org's connections.
--   • COLUMN-level grants — `authenticated` can read status/tenant metadata but NOT
--     the token columns or the OAuth state nonce. Only the service-role edge
--     functions (which bypass RLS) read/refresh tokens.
-- (Tokens are plaintext for the pilot; graduate to Supabase Vault/pgsodium before
--  GA — tracked. The column-grant wall already keeps them off every client read.)

create type external_provider    as enum ('qbo', 'xero');
create type external_conn_status as enum ('pending', 'active', 'revoked', 'error');

create table external_connections (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  provider         external_provider not null,
  state            text,                         -- OAuth CSRF nonce; set while 'pending'
  realm_id         text,                         -- QBO realmId / Xero tenantId
  tenant_name      text,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  scope            text,
  status           external_conn_status not null default 'pending',
  last_error       text,
  connected_by     uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index external_connections_org_idx on external_connections (org_id);
create unique index external_connections_state_uidx
  on external_connections (state) where state is not null;
create unique index external_connections_realm_uidx
  on external_connections (org_id, provider, realm_id) where realm_id is not null;

-- ── RLS row-gate + column-level grants ──────────────────────────────────────
alter table external_connections enable row level security;
create policy ec_select  on external_connections for select using ( can_access_org(org_id) );
create policy ec_nowrite on external_connections for all using (false) with check (false);

-- authenticated: only the safe (non-secret) columns. NOT access_token / refresh_token / state.
grant select (id, org_id, provider, realm_id, tenant_name, scope, status, last_error, connected_by, created_at, updated_at)
  on external_connections to authenticated;
-- service-role edge functions: full access (and they bypass RLS) to read/refresh tokens.
grant select, insert, update, delete on external_connections to service_role;

-- the edge functions authorize the caller with the JWT-verified actor before any
-- connection write; expose the predicate to the service role for that check.
grant execute on function can_write_org_as(uuid, uuid) to service_role;
