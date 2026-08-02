-- IQ-2: Plaid access tokens at rest: encrypt them, stop writing them in the clear.
--
-- THE DEFECT
--   20260707130000_iq1_qbo_token_encryption.sql built a working encryption path
--   (pgcrypto pgp_sym under a Vault-held key) but only the QBO edge fns were wired
--   to it. plaid-exchange kept writing `access_token` as PLAINTEXT on both the
--   update and insert branches, and plaid-sync / plaid-webhook / plaid-exchange all
--   read the raw column rather than ext_connection_secrets(). A Plaid access token
--   is read access to a business's entire bank transaction history, so this is the
--   highest-value secret in the system sitting unencrypted.
--
-- WHY THE QBO CLEANUP DID NOT ALREADY COVER PLAID
--   20260708010000_iq1_cleanup_qbo_plaintext.sql is provider-blind: it encrypted and
--   nulled every plaintext token in the table, Plaid rows included. But it ran once,
--   and plaid-exchange has been re-populating the plaintext column on every link
--   since. Clearing the values again without fixing the write path would just refill
--   it. This migration is the DB half; the edge-fn half is the matching change to
--   plaid-exchange / plaid-sync / plaid-webhook.
--
-- NAMING DECISION (deliberate)
--   The helpers are QBO-named but provider-agnostic in behaviour. We do NOT rename
--   or drop them: enc_qbo_token / dec_qbo_token / set_qbo_tokens stay exactly as they
--   are, so every existing QuickBooks call site keeps working byte-for-byte. What we
--   add is thin provider-neutral ALIASES that delegate to them, so new connector code
--   reads honestly. Additive-only is the lower-risk half of "generalise the naming":
--   there is no window in which a QBO caller resolves to a function that no longer
--   exists, and no signature change for PostgREST to re-cache.
--
-- SCOPE (important)
--   The backfill below is scoped to `provider = 'plaid'`. It deliberately does NOT
--   touch other providers: xero-callback still writes plaintext and xero-import still
--   reads the raw column, so blanket-nulling every plaintext token here would break
--   live Xero connections. Xero is tracked separately as an open finding.
--
-- IDEMPOTENCE
--   Every statement is create-or-replace or a guarded UPDATE. Replayed from scratch
--   in CI against an empty database, the backfill matches zero rows and is a no-op.

-- ── provider-neutral aliases over the (historical) QBO-named helpers ─────────
-- Behaviour is identical; only the name is new. The QBO-named originals remain the
-- canonical implementation and are untouched.

create or replace function enc_connection_token(p_plain text)
returns bytea language sql security definer set search_path = public, extensions as $$
  select enc_qbo_token(p_plain);
$$;
revoke all on function enc_connection_token(text) from public, anon, authenticated;
grant execute on function enc_connection_token(text) to service_role;

create or replace function dec_connection_token(p_cipher bytea)
returns text language sql security definer set search_path = public, extensions as $$
  select dec_qbo_token(p_cipher);
$$;
revoke all on function dec_connection_token(bytea) from public, anon, authenticated;
grant execute on function dec_connection_token(bytea) to service_role;

-- The writer new connector code calls. Same semantics as set_qbo_tokens: writes the
-- ciphertext columns and NULLs the plaintext ones in one statement, so a token is
-- never at rest in the clear. Providers without a refresh token or an expiry (Plaid)
-- simply pass nulls.
create or replace function set_connection_tokens(
  p_connection uuid, p_access text, p_refresh text, p_expires timestamptz
) returns void
language sql security definer set search_path = public as $$
  select set_qbo_tokens(p_connection, p_access, p_refresh, p_expires);
$$;
revoke all on function set_connection_tokens(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function set_connection_tokens(uuid, text, text, timestamptz) to service_role;

-- ── backfill: encrypt then clear every plaintext Plaid token ─────────────────
-- Same two-step shape as _iq1_cleanup_legacy_qbo_plaintext(): encrypt anything that
-- lacks ciphertext FIRST, so nulling the plaintext can never make a connection
-- unreadable, then null the plaintext. Reads keep working throughout because
-- ext_connection_secrets() prefers the ciphertext and only falls back to plaintext.
create or replace function _iq2_encrypt_plaid_plaintext()
returns void language plpgsql security definer set search_path = public as $$
begin
  update external_connections
     set access_token_enc = enc_connection_token(access_token)
   where provider = 'plaid' and access_token is not null and access_token_enc is null;

  update external_connections
     set refresh_token_enc = enc_connection_token(refresh_token)
   where provider = 'plaid' and refresh_token is not null and refresh_token_enc is null;

  update external_connections
     set access_token = null
   where provider = 'plaid' and access_token is not null;

  update external_connections
     set refresh_token = null
   where provider = 'plaid' and refresh_token is not null;
end;
$$;
revoke all on function _iq2_encrypt_plaid_plaintext() from public, anon, authenticated;
grant execute on function _iq2_encrypt_plaid_plaintext() to service_role;

select _iq2_encrypt_plaid_plaintext();

-- set_connection_tokens is called over PostgREST by plaid-exchange, so the schema
-- cache has to see it before the next link attempt. Harmless if nothing is listening.
notify pgrst, 'reload schema';

-- End of migration.
