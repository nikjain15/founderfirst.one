-- IQ-1 — QBO connection hardening: tokens-at-rest encryption.
-- Proves: enc/dec roundtrip; set_qbo_tokens writes ciphertext + nulls plaintext;
-- ext_connection_secrets decrypts (new rows) AND dual-reads legacy plaintext-only
-- rows; the decrypt path + key + secrets reader are NOT callable by `authenticated`;
-- `authenticated` cannot SELECT the token columns (plaintext or ciphertext).
-- Everything rolls back. Run: `supabase test db`.

begin;
select plan(13);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000019101', 'owner-iq1@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000191fa', 'business', 'IQ1 Org', '00000000-0000-0000-0000-000000019101');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000019101', '00000000-0000-0000-0000-0000000191fa', 'owner', 'active');

-- a NEW-style connection (tokens will be written via the encrypting RPC)
insert into external_connections (id, org_id, provider, realm_id, status, connected_by) values
  ('00000000-0000-0000-0000-0000000191c1', '00000000-0000-0000-0000-0000000191fa', 'qbo', '900', 'active', '00000000-0000-0000-0000-000000019101');

-- a LEGACY connection that predates encryption: plaintext columns only.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token, refresh_token) values
  ('00000000-0000-0000-0000-0000000191c2', '00000000-0000-0000-0000-0000000191fa', 'qbo', '901', 'active', '00000000-0000-0000-0000-000000019101', 'legacy-access', 'legacy-refresh');

-- ── 1. enc/dec roundtrip ─────────────────────────────────────────────────────
select is(
  dec_qbo_token(enc_qbo_token('secret-token-123')),
  'secret-token-123',
  'enc_qbo_token → dec_qbo_token roundtrips a token'
);
select is(enc_qbo_token(null), null, 'enc_qbo_token(null) is null (no crash on absent token)');
select is(dec_qbo_token(null), null, 'dec_qbo_token(null) is null');

-- encryption is non-trivial: ciphertext is NOT the plaintext bytes.
select isnt(
  encode(enc_qbo_token('plainA'), 'escape'), 'plainA',
  'ciphertext bytea is not the plaintext'
);

-- ── 2. set_qbo_tokens writes ciphertext + nulls plaintext ────────────────────
select set_qbo_tokens('00000000-0000-0000-0000-0000000191c1', 'acc-new', 'ref-new',
                      '2030-01-01T00:00:00Z');

select isnt((select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000191c1'), null,
  'set_qbo_tokens populates access_token_enc');
select is((select access_token from external_connections where id = '00000000-0000-0000-0000-0000000191c1'), null,
  'set_qbo_tokens NULLs the plaintext access_token (no clear token at rest)');
select is((select refresh_token from external_connections where id = '00000000-0000-0000-0000-0000000191c1'), null,
  'set_qbo_tokens NULLs the plaintext refresh_token');

-- ── 3. ext_connection_secrets decrypts a NEW (encrypted) row ─────────────────
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000191c1')),
  'acc-new',
  'ext_connection_secrets decrypts the new access token'
);
select is(
  (select refresh_token from ext_connection_secrets('00000000-0000-0000-0000-0000000191c1')),
  'ref-new',
  'ext_connection_secrets decrypts the new refresh token'
);

-- ── 4. dual-read: a LEGACY plaintext-only row is still readable ──────────────
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000191c2')),
  'legacy-access',
  'ext_connection_secrets falls back to plaintext for a pre-encryption row (no unreadable connection)'
);

-- ── 5. `authenticated` cannot reach the decrypt path or the key ──────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000019101","email":"owner-iq1@test.dev","role":"authenticated"}';

-- errcode + errmsg both NULL (4-arg form) — we assert the call is REFUSED, not a
-- specific SQLSTATE/message.
select throws_ok(
  $$ select dec_qbo_token(decode('00','hex')) $$,
  null::text, null::text,
  'authenticated CANNOT execute dec_qbo_token (no plaintext via the decrypt helper)'
);
select throws_ok(
  $$ select * from ext_connection_secrets('00000000-0000-0000-0000-0000000191c1') $$,
  null::text, null::text,
  'authenticated CANNOT execute ext_connection_secrets'
);
-- the token columns are not in the authenticated column grant → selecting them errors.
select throws_ok(
  $$ select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000191c1' $$,
  null::text, null::text,
  'authenticated CANNOT SELECT the ciphertext token column'
);

reset role;

select * from finish();
rollback;
