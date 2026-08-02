-- IQ-3: Xero access + refresh tokens at rest: encrypt them, stop writing them in
-- the clear. Closes finding S-7 in docs/STAKEHOLDERS.md §4a.
--
-- THE DEFECT
--   20260802120000_iq2_plaid_token_encryption.sql fixed Plaid and said so
--   explicitly at :29-33: "The backfill below is scoped to `provider = 'plaid'`.
--   It deliberately does NOT touch other providers: xero-callback still writes
--   plaintext and xero-import still reads the raw column". That was the correct
--   call at the time, because nulling a plaintext column whose only reader is the
--   plaintext column breaks live connections. This migration is the other half.
--
--   Until now, xero-callback/index.ts:50 wrote `access_token` and `refresh_token`
--   straight onto the row, and xero-import/index.ts:53 selected them back. A Xero
--   refresh token is standing read/write access to a business's full accounting
--   ledger, which puts it in the same class as the Plaid token IQ-2 protected.
--
-- WHAT THIS MIGRATION DOES
--   Nothing new is invented. Every helper already exists as of IQ-2:
--     enc_connection_token / dec_connection_token   (aliases over the QBO originals)
--     set_connection_tokens(uuid, text, text, timestamptz)
--     ext_connection_secrets(uuid) -> table(access_token, refresh_token)
--   All this adds is the provider-scoped backfill, so it is a much smaller change
--   than IQ-2 was. The edge-fn half is the matching change to xero-callback
--   (write via set_connection_tokens) and xero-import (read via
--   ext_connection_secrets, re-write via set_connection_tokens on refresh).
--
-- ORDER MATTERS
--   Encrypt anything lacking ciphertext FIRST, then null the plaintext. The
--   reverse order would make a live Xero connection unreadable for the window
--   between the two statements. Reads keep working throughout because
--   ext_connection_secrets() prefers the ciphertext and falls back to plaintext:
--     coalesce(dec_qbo_token(access_token_enc), access_token)
--
-- SCOPE
--   Scoped to `provider = 'xero'`, deliberately, and for the same reason IQ-2 was
--   scoped to Plaid. It also keeps assertion 12 of
--   supabase/tests/iq2_plaid_token_encryption_test.sql honest: that test proves
--   the Plaid backfill does not clear a Xero token, and a provider-blind backfill
--   here would quietly make that proof meaningless.
--
-- KEY
--   The same Vault-held key as QBO and Plaid ('qbo_token_key',
--   20260707130000_iq1_qbo_token_encryption.sql:39-51). There is no per-provider
--   key, and adding one is not in scope here.
--
-- IDEMPOTENCE
--   Guarded UPDATEs only. Replayed from scratch in CI against an empty database
--   the backfill matches zero rows and is a no-op; run twice against real data the
--   second run matches nothing because the plaintext is already null.
--
-- AFTER THIS MIGRATION
--   No provider writes a plaintext connection token. `external_connections
--   .access_token` / `.refresh_token` become legacy-read-only columns kept solely
--   for the ext_connection_secrets() fallback. Dropping them is a separate,
--   later change, once a full production window has passed with nothing writing
--   to them.
--
-- Unique timestamp (rule 11). NOTE: review before `supabase db push`
-- (LEARNINGS.md rule 3). Apply manually.
-- =============================================================================

create or replace function _iq3_encrypt_xero_plaintext()
returns void language plpgsql security definer set search_path = public as $$
begin
  update external_connections
     set access_token_enc = enc_connection_token(access_token)
   where provider = 'xero' and access_token is not null and access_token_enc is null;

  update external_connections
     set refresh_token_enc = enc_connection_token(refresh_token)
   where provider = 'xero' and refresh_token is not null and refresh_token_enc is null;

  update external_connections
     set access_token = null
   where provider = 'xero' and access_token is not null;

  update external_connections
     set refresh_token = null
   where provider = 'xero' and refresh_token is not null;
end;
$$;

comment on function _iq3_encrypt_xero_plaintext() is
  'IQ-3 one-shot backfill: encrypts then clears every plaintext Xero token. '
  'Provider-scoped on purpose (see the migration header). Idempotent.';

revoke all on function _iq3_encrypt_xero_plaintext() from public, anon, authenticated;
grant execute on function _iq3_encrypt_xero_plaintext() to service_role;

select _iq3_encrypt_xero_plaintext();

-- set_connection_tokens and ext_connection_secrets are called over PostgREST by
-- xero-callback and xero-import. The cache already knows them from IQ-2 and IQ-1,
-- but the reload is harmless and keeps the migration self-contained.
notify pgrst, 'reload schema';

-- =============================================================================
-- End of migration.
-- =============================================================================
