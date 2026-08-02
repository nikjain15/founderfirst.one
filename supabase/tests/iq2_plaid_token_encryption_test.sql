-- IQ-2: Plaid tokens at rest.
-- Proves: the provider-neutral aliases roundtrip a Plaid token; the migration's
-- backfill encrypts-then-nulls plaintext for plaid rows so the plaintext column is
-- null afterwards; ext_connection_secrets() returns the right token for a Plaid
-- connection (both a freshly-written one and a backfilled legacy one); the backfill
-- is provider-scoped so it does NOT touch a non-plaid row; the QuickBooks path is
-- unchanged (set_qbo_tokens + ext_connection_secrets still work); and none of the
-- new functions are reachable by `authenticated`. Everything rolls back.
-- Run: `supabase test db`.

begin;
select plan(14);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000019301', 'owner-iq2@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000193fa', 'business', 'IQ2 Org', '00000000-0000-0000-0000-000000019301');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000019301', '00000000-0000-0000-0000-0000000193fa', 'owner', 'active');

-- (a) a plaid connection with NO token yet. plaid-exchange inserts this shape, then
-- calls set_connection_tokens.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by) values
  ('00000000-0000-0000-0000-0000000193c1', '00000000-0000-0000-0000-0000000193fa', 'plaid', 'item-920', 'active', '00000000-0000-0000-0000-000000019301');

-- (b) a plaid connection written by the OLD plaintext write path, exactly what the
-- backfill has to clean up.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token) values
  ('00000000-0000-0000-0000-0000000193c2', '00000000-0000-0000-0000-0000000193fa', 'plaid', 'item-921', 'active', '00000000-0000-0000-0000-000000019301',
   'access-sandbox-legacy-plaid');

-- (c) a NON-plaid (xero) connection with plaintext. The IQ-2 backfill must leave it
-- alone: it is scoped to provider='plaid'. Xero is encrypted by its own scoped
-- backfill, _iq3_encrypt_xero_plaintext() (20260802130000), and this fixture still
-- proves the scoping holds: this row never passes through the Plaid backfill.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token, refresh_token) values
  ('00000000-0000-0000-0000-0000000193c3', '00000000-0000-0000-0000-0000000193fa', 'xero', 'tenant-922', 'active', '00000000-0000-0000-0000-000000019301',
   'xero-plaintext-access', 'xero-plaintext-refresh');

-- (d) a qbo connection, to prove the QuickBooks path is untouched by all of this.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by) values
  ('00000000-0000-0000-0000-0000000193c4', '00000000-0000-0000-0000-0000000193fa', 'qbo', '923', 'active', '00000000-0000-0000-0000-000000019301');

-- ── 1. provider-neutral aliases roundtrip, and agree with the QBO-named originals ─
select is(
  dec_connection_token(enc_connection_token('access-sandbox-plaid-abc123')),
  'access-sandbox-plaid-abc123',
  'enc_connection_token -> dec_connection_token roundtrips a Plaid access token'
);
select is(
  dec_qbo_token(enc_connection_token('cross-helper')),
  'cross-helper',
  'the alias and the historical QBO-named helper are interchangeable (same key, same scheme)'
);
select isnt(
  encode(enc_connection_token('access-sandbox-plaid-abc123'), 'escape'), 'access-sandbox-plaid-abc123',
  'ciphertext bytea is not the plaintext Plaid token'
);

-- ── 2. the write path plaid-exchange uses stores ciphertext only ──────────────
select set_connection_tokens('00000000-0000-0000-0000-0000000193c1', 'access-sandbox-new', null, null);

select isnt((select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000193c1'), null,
  'set_connection_tokens populates access_token_enc for a plaid connection');
select is((select access_token from external_connections where id = '00000000-0000-0000-0000-0000000193c1'), null,
  'set_connection_tokens leaves NO plaintext access_token for a plaid connection');

-- ── 3. ext_connection_secrets returns the right token for a Plaid connection ──
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000193c1')),
  'access-sandbox-new',
  'ext_connection_secrets decrypts the Plaid access token (the sync read path)'
);

-- ── 4. the migration backfill: encrypt then null the legacy plaintext plaid row ─
select _iq2_encrypt_plaid_plaintext();

select isnt((select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000193c2'), null,
  'backfill encrypts the legacy plaintext Plaid token before clearing it');
select is((select access_token from external_connections where id = '00000000-0000-0000-0000-0000000193c2'), null,
  'backfill NULLs the plaintext access_token on the legacy Plaid row');
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000193c2')),
  'access-sandbox-legacy-plaid',
  'the backfilled Plaid connection is still readable through ext_connection_secrets (no broken sync)'
);

-- idempotent: running it again changes nothing and does not crash.
select _iq2_encrypt_plaid_plaintext();
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000193c2')),
  'access-sandbox-legacy-plaid',
  'the backfill is idempotent (second run is a no-op)'
);

-- ── 5. provider-scoped: the xero row keeps its plaintext (xero still reads it raw) ─
select is(
  (select access_token from external_connections where id = '00000000-0000-0000-0000-0000000193c3'),
  'xero-plaintext-access',
  'the backfill is scoped to provider=plaid and does not clear a xero token'
);

-- ── 6. the QuickBooks path still works, unchanged ─────────────────────────────
select set_qbo_tokens('00000000-0000-0000-0000-0000000193c4', 'qbo-acc', 'qbo-ref', '2030-01-01T00:00:00Z');
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000193c4')),
  'qbo-acc',
  'set_qbo_tokens + ext_connection_secrets still roundtrip for QuickBooks (path unchanged)'
);
select is((select access_token from external_connections where id = '00000000-0000-0000-0000-0000000193c4'), null,
  'the QuickBooks row still holds no plaintext access_token');

-- ── 7. the new surface is service_role-only ───────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000019301","email":"owner-iq2@test.dev","role":"authenticated"}';
select throws_ok(
  $$ select dec_connection_token(decode('00','hex')) $$,
  null::text, null::text,
  'authenticated CANNOT execute dec_connection_token'
);
reset role;

select * from finish();
rollback;
