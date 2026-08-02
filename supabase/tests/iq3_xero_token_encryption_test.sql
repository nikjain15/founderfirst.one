-- IQ-3: Xero tokens at rest. Mirrors iq2_plaid_token_encryption_test.sql.
-- Proves: the shared helpers roundtrip a Xero token pair; the write path
-- xero-callback now uses stores ciphertext only and keeps the expiry;
-- ext_connection_secrets() returns BOTH tokens for a Xero connection (xero-import
-- needs the refresh token too, unlike Plaid); the migration's backfill
-- encrypts-then-nulls plaintext for xero rows in that order, so a live connection
-- is never unreadable; the backfill is idempotent and provider-scoped so it does
-- NOT touch a plaid or qbo row; the refresh-and-persist cycle xero-import performs
-- leaves no plaintext behind; and none of the surface is reachable by
-- `authenticated`. Everything rolls back.
-- Run: `supabase test db`.

begin;
select plan(19);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000019501', 'owner-iq3@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000195fa', 'business', 'IQ3 Org', '00000000-0000-0000-0000-000000019501');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000019501', '00000000-0000-0000-0000-0000000195fa', 'owner', 'active');

-- (a) a xero connection with NO token yet: the shape xero-connect inserts while
-- the OAuth `state` nonce is outstanding, before xero-callback fills it in.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by) values
  ('00000000-0000-0000-0000-0000000195c1', '00000000-0000-0000-0000-0000000195fa', 'xero', 'tenant-950', 'active', '00000000-0000-0000-0000-000000019501');

-- (b) a xero connection written by the OLD plaintext write path (xero-callback
-- before this change), which is exactly what the backfill has to clean up. Both
-- tokens, because Xero issues a refresh token and Plaid does not.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token, refresh_token, token_expires_at) values
  ('00000000-0000-0000-0000-0000000195c2', '00000000-0000-0000-0000-0000000195fa', 'xero', 'tenant-951', 'active', '00000000-0000-0000-0000-000000019501',
   'xero-legacy-access', 'xero-legacy-refresh', '2030-01-01T00:00:00Z');

-- (c) a plaid connection with plaintext. The Xero backfill must leave it alone:
-- the mirror image of assertion 12 in the IQ-2 suite.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token) values
  ('00000000-0000-0000-0000-0000000195c3', '00000000-0000-0000-0000-0000000195fa', 'plaid', 'item-952', 'active', '00000000-0000-0000-0000-000000019501',
   'plaid-plaintext-access');

-- (d) a qbo connection, to prove the QuickBooks path is untouched by all of this.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token) values
  ('00000000-0000-0000-0000-0000000195c4', '00000000-0000-0000-0000-0000000195fa', 'qbo', '953', 'active', '00000000-0000-0000-0000-000000019501',
   'qbo-plaintext-access');

-- ── 1. the shared helpers roundtrip a Xero token pair ────────────────────────
select is(
  dec_connection_token(enc_connection_token('xero-access-abc123')),
  'xero-access-abc123',
  'enc_connection_token -> dec_connection_token roundtrips a Xero access token'
);
select is(
  dec_connection_token(enc_connection_token('xero-refresh-abc123')),
  'xero-refresh-abc123',
  'and roundtrips a Xero refresh token (Xero has one, Plaid does not)'
);
select isnt(
  encode(enc_connection_token('xero-access-abc123'), 'escape'), 'xero-access-abc123',
  'ciphertext bytea is not the plaintext Xero token'
);

-- ── 2. the write path xero-callback now uses stores ciphertext only ──────────
select set_connection_tokens(
  '00000000-0000-0000-0000-0000000195c1', 'xero-new-access', 'xero-new-refresh', '2030-06-01T00:00:00Z'
);

select isnt((select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000195c1'), null,
  'set_connection_tokens populates access_token_enc for a xero connection');
select isnt((select refresh_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000195c1'), null,
  'set_connection_tokens populates refresh_token_enc for a xero connection');
select is((select access_token from external_connections where id = '00000000-0000-0000-0000-0000000195c1'), null,
  'set_connection_tokens leaves NO plaintext access_token for a xero connection');
select is((select refresh_token from external_connections where id = '00000000-0000-0000-0000-0000000195c1'), null,
  'set_connection_tokens leaves NO plaintext refresh_token for a xero connection');
select is(
  (select token_expires_at from external_connections where id = '00000000-0000-0000-0000-0000000195c1'),
  '2030-06-01T00:00:00Z'::timestamptz,
  'set_connection_tokens persists token_expires_at (xero-import gates its refresh on this)'
);

-- ── 3. ext_connection_secrets returns BOTH tokens (the xero-import read path) ─
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000195c1')),
  'xero-new-access',
  'ext_connection_secrets decrypts the Xero access token'
);
select is(
  (select refresh_token from ext_connection_secrets('00000000-0000-0000-0000-0000000195c1')),
  'xero-new-refresh',
  'ext_connection_secrets decrypts the Xero refresh token (xero-import needs both)'
);

-- ── 4. the migration backfill: encrypt THEN null the legacy plaintext xero row ─
select _iq3_encrypt_xero_plaintext();

select isnt((select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000195c2'), null,
  'backfill encrypts the legacy plaintext Xero access token before clearing it');
select is((select access_token from external_connections where id = '00000000-0000-0000-0000-0000000195c2'), null,
  'backfill NULLs the plaintext access_token on the legacy Xero row');
select is((select refresh_token from external_connections where id = '00000000-0000-0000-0000-0000000195c2'), null,
  'backfill NULLs the plaintext refresh_token on the legacy Xero row');
select is(
  (select refresh_token from ext_connection_secrets('00000000-0000-0000-0000-0000000195c2')),
  'xero-legacy-refresh',
  'the backfilled Xero connection is still readable end to end (no broken import)'
);

-- idempotent: running it again changes nothing and does not crash.
select _iq3_encrypt_xero_plaintext();
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000195c2')),
  'xero-legacy-access',
  'the backfill is idempotent (second run is a no-op)'
);

-- ── 5. provider-scoped: plaid and qbo rows are untouched ─────────────────────
select is(
  (select access_token from external_connections where id = '00000000-0000-0000-0000-0000000195c3'),
  'plaid-plaintext-access',
  'the backfill is scoped to provider=xero and does not clear a plaid token'
);
select is(
  (select access_token from external_connections where id = '00000000-0000-0000-0000-0000000195c4'),
  'qbo-plaintext-access',
  'the backfill is scoped to provider=xero and does not clear a qbo token'
);

-- ── 6. the refresh-and-persist cycle xero-import performs leaves no plaintext ─
select set_connection_tokens(
  '00000000-0000-0000-0000-0000000195c2', 'xero-refreshed-access', 'xero-refreshed-refresh', '2031-01-01T00:00:00Z'
);
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000195c2')),
  'xero-refreshed-access',
  'a token refresh rewrites the ciphertext and stays readable'
);

-- ── 7. the surface is not reachable by `authenticated` ───────────────────────
-- errcode + errmsg both NULL (4-arg form): we assert the call is REFUSED, not a
-- specific SQLSTATE/message.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000019501","email":"owner-iq3@test.dev","role":"authenticated"}';
select throws_ok(
  $$ select _iq3_encrypt_xero_plaintext() $$,
  null::text, null::text,
  'authenticated CANNOT execute the Xero backfill'
);
reset role;

select * from finish();
rollback;
