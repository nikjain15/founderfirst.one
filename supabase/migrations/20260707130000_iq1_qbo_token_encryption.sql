-- IQ-1 — QBO connection hardening: encryption-at-rest for OAuth tokens, plus the
-- centralized config knobs the qbo edge fns read (retry/backoff/state-TTL).
--
-- BACKGROUND
--   20260630050000_secure_connection_tokens.sql closed the client-READ exposure
--   (revoked table-level SELECT, re-granted only non-secret columns). Its own NOTE
--   flagged the remaining gap: access_token / refresh_token are still PLAINTEXT at
--   rest. This migration adds encryption-at-rest as defense-in-depth, so a leaked
--   backup / a compromised service-role read does not directly yield live Intuit
--   credentials.
--
-- MECHANISM (why pgcrypto pgp_sym over Vault or raw pgsodium)
--   • Vault (vault.create_secret / vault.decrypted_secrets) is a registry for a
--     SMALL, mostly-static set of app-wide secrets. These tokens are PER-ROW and
--     rotate on EVERY refresh — one vault secret per connection that churns hourly
--     is an abuse of the registry and leaks vault rows. Not a fit.
--   • pgcrypto's pgp_sym_encrypt/decrypt is symmetric, reversible, and already
--     available (the extension is used elsewhere). The symmetric KEY lives in
--     Vault as ONE named secret ('qbo_token_key') — so the key itself is encrypted
--     at rest by Vault's root key, and only SECURITY DEFINER functions owned by the
--     migration role can read it. No key material is ever inlined or client-visible.
--
-- SAFETY / TRANSITION (a botched decrypt path breaks every QBO import)
--   • New nullable columns access_token_enc / refresh_token_enc (bytea) are added
--     ALONGSIDE the existing plaintext columns — nothing is dropped here.
--   • enc_qbo_token(text) / dec_qbo_token(bytea) are the single write/read helpers.
--   • Existing rows are encrypted IN PLACE from their current plaintext values.
--   • The qbo edge fns read via ext_connection_secrets() (decrypts *_enc, falls back
--     to plaintext if a row predates encryption) and write via *_enc.
--   • Plaintext columns are LEFT IN PLACE this migration (dual-read) so a rollback
--     never leaves a connection unreadable. A LATER migration nulls them once the
--     decrypt path is proven live (the card's "verify before removing plaintext").

create extension if not exists pgcrypto;

-- ── the encryption key: one named Vault secret, created if absent ────────────
-- Idempotent. The key never leaves the DB; only the SECDEF helpers below read it.
-- (Vault stores it encrypted under the instance root key.)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'qbo_token_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'qbo_token_key');
  end if;
end $$;

-- reader for the key — SECURITY DEFINER, never granted to anon/authenticated.
create or replace function _qbo_token_key()
returns text language sql security definer set search_path = public, vault, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'qbo_token_key' limit 1;
$$;
revoke all on function _qbo_token_key() from public, anon, authenticated;

-- ── encrypt / decrypt helpers ────────────────────────────────────────────────
create or replace function enc_qbo_token(p_plain text)
returns bytea language sql security definer set search_path = public, extensions as $$
  select case
    when p_plain is null then null
    else pgp_sym_encrypt(p_plain, _qbo_token_key())
  end;
$$;
revoke all on function enc_qbo_token(text) from public, anon, authenticated;
grant execute on function enc_qbo_token(text) to service_role;

create or replace function dec_qbo_token(p_cipher bytea)
returns text language sql security definer set search_path = public, extensions as $$
  select case
    when p_cipher is null then null
    else pgp_sym_decrypt(p_cipher, _qbo_token_key())
  end;
$$;
revoke all on function dec_qbo_token(bytea) from public, anon, authenticated;
grant execute on function dec_qbo_token(bytea) to service_role;

-- ── new ciphertext columns (alongside plaintext, nothing dropped) ────────────
alter table external_connections add column if not exists access_token_enc  bytea;
alter table external_connections add column if not exists refresh_token_enc bytea;

-- never let a client read the ciphertext either.
revoke select on external_connections from anon, authenticated;
grant select (id, org_id, provider, realm_id, tenant_name, scope, status, last_error, connected_by, created_at, updated_at)
  on external_connections to authenticated;

-- ── encrypt existing plaintext rows IN PLACE ─────────────────────────────────
update external_connections
   set access_token_enc  = enc_qbo_token(access_token)
 where access_token is not null and access_token_enc is null;
update external_connections
   set refresh_token_enc = enc_qbo_token(refresh_token)
 where refresh_token is not null and refresh_token_enc is null;

-- ── the ONE reader the edge fns call to get decrypted tokens for a connection ─
-- Dual-read: prefer the encrypted column, fall back to legacy plaintext for any
-- row not yet migrated. service_role only. Returns nothing for a foreign/absent id.
create or replace function ext_connection_secrets(p_connection uuid)
returns table (access_token text, refresh_token text)
language sql security definer set search_path = public as $$
  select
    coalesce(dec_qbo_token(access_token_enc),  access_token),
    coalesce(dec_qbo_token(refresh_token_enc), refresh_token)
  from external_connections
  where id = p_connection;
$$;
revoke all on function ext_connection_secrets(uuid) from public, anon, authenticated;
grant execute on function ext_connection_secrets(uuid) to service_role;

-- ── writer: set BOTH the ciphertext (canonical) and null the plaintext, atomically ─
-- The edge fns call this on connect / refresh so a token is never written in the
-- clear again. Nulling the plaintext here means new & refreshed rows hold ONLY
-- ciphertext; legacy rows keep their (already-encrypted-above) plaintext until the
-- follow-up cleanup migration.
create or replace function set_qbo_tokens(
  p_connection uuid, p_access text, p_refresh text, p_expires timestamptz
) returns void
language sql security definer set search_path = public as $$
  update external_connections
     set access_token_enc  = enc_qbo_token(p_access),
         refresh_token_enc = enc_qbo_token(p_refresh),
         access_token = null, refresh_token = null,
         token_expires_at = p_expires,
         updated_at = now()
   where id = p_connection;
$$;
revoke all on function set_qbo_tokens(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function set_qbo_tokens(uuid, text, text, timestamptz) to service_role;

-- ── centralized QBO resilience knobs → platform_config.behavior ──────────────
-- Retry/backoff/state-TTL are DATA (admin-tunable, no redeploy), never magic
-- numbers in the edge fn. Merge into the existing singleton behavior blob.
insert into platform_config (id, behavior)
values (true, jsonb_build_object(
  'qbo_max_retries',        4,       -- attempts on 429 / 5xx before giving up
  'qbo_backoff_base_ms',    500,     -- exponential base: base * 2^attempt
  'qbo_backoff_max_ms',     30000,   -- per-wait cap
  'qbo_page_throttle_ms',   250,     -- pause between paged pulls (rate-limit friendly)
  'qbo_state_ttl_minutes',  10       -- reject an OAuth callback older than this
))
on conflict (id) do update
  set behavior = platform_config.behavior || excluded.behavior,
      updated_at = now();

-- read-only accessor for the qbo knobs (the edge fns fetch this; no admin needed
-- because these values are non-sensitive operational thresholds).
create or replace function get_qbo_config()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'qbo_max_retries',       coalesce((behavior->>'qbo_max_retries')::int, 4),
    'qbo_backoff_base_ms',   coalesce((behavior->>'qbo_backoff_base_ms')::int, 500),
    'qbo_backoff_max_ms',    coalesce((behavior->>'qbo_backoff_max_ms')::int, 30000),
    'qbo_page_throttle_ms',  coalesce((behavior->>'qbo_page_throttle_ms')::int, 250),
    'qbo_state_ttl_minutes', coalesce((behavior->>'qbo_state_ttl_minutes')::int, 10)
  )
  from platform_config where id = true;
$$;
grant execute on function get_qbo_config() to service_role, authenticated;

-- End of migration.
