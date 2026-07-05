-- IQ-1-CLEANUP — null legacy plaintext QBO tokens (post-verify).
-- Proves: _iq1_cleanup_legacy_qbo_plaintext() (a) nulls plaintext for a row that
-- was already encrypted (the exact post-20260707130000, pre-cleanup prod shape),
-- (b) defensively encrypts-then-nulls a row that somehow still has NO ciphertext,
-- (c) is a no-op (no crash) on a tokenless row, (d) is service_role-only, and
-- (e) ext_connection_secrets() still decrypts correctly for every row afterward
-- — i.e. the cleanup never makes a connection unreadable. Everything rolls back.
-- Run: `supabase test db`.

begin;
select plan(9);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000019201', 'owner-iq1cleanup@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000192fa', 'business', 'IQ1 Cleanup Org', '00000000-0000-0000-0000-000000019201');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000019201', '00000000-0000-0000-0000-0000000192fa', 'owner', 'active');

-- (a) the post-20260707130000, pre-cleanup shape: already encrypted, but the
-- plaintext column was left standing (dual-read fallback, not yet nulled).
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token, refresh_token, access_token_enc, refresh_token_enc) values
  ('00000000-0000-0000-0000-0000000192c1', '00000000-0000-0000-0000-0000000192fa', 'qbo', '910', 'active', '00000000-0000-0000-0000-000000019201',
   'stale-plaintext-access', 'stale-plaintext-refresh',
   enc_qbo_token('stale-plaintext-access'), enc_qbo_token('stale-plaintext-refresh'));

-- (b) defensive case: plaintext with NO ciphertext at all (should never happen
-- post-20260707130000, but the cleanup must not assume it and skip these).
insert into external_connections (id, org_id, provider, realm_id, status, connected_by, access_token, refresh_token) values
  ('00000000-0000-0000-0000-0000000192c2', '00000000-0000-0000-0000-0000000192fa', 'qbo', '911', 'active', '00000000-0000-0000-0000-000000019201',
   'never-encrypted-access', 'never-encrypted-refresh');

-- (c) a tokenless connection (pending/never connected) — must survive untouched.
insert into external_connections (id, org_id, provider, realm_id, status, connected_by) values
  ('00000000-0000-0000-0000-0000000192c3', '00000000-0000-0000-0000-0000000192fa', 'qbo', '912', 'pending', '00000000-0000-0000-0000-000000019201');

-- ── run the cleanup ───────────────────────────────────────────────────────────
select _iq1_cleanup_legacy_qbo_plaintext();

-- ── (a) already-encrypted row: plaintext nulled, ciphertext untouched, decrypts ─
select is(
  (select access_token from external_connections where id = '00000000-0000-0000-0000-0000000192c1'),
  null, 'cleanup nulls the plaintext access_token on an already-encrypted row'
);
select is(
  (select refresh_token from external_connections where id = '00000000-0000-0000-0000-0000000192c1'),
  null, 'cleanup nulls the plaintext refresh_token on an already-encrypted row'
);
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000192c1')),
  'stale-plaintext-access', 'ext_connection_secrets still decrypts the (a)-row access token post-cleanup'
);

-- ── (b) never-encrypted row: cleanup ENCRYPTS first, then nulls plaintext ──────
select isnt(
  (select access_token_enc from external_connections where id = '00000000-0000-0000-0000-0000000192c2'),
  null, 'cleanup defensively encrypts a row that had no ciphertext at all'
);
select is(
  (select access_token from external_connections where id = '00000000-0000-0000-0000-0000000192c2'),
  null, 'cleanup nulls the plaintext access_token on the never-encrypted row too'
);
select is(
  (select access_token from ext_connection_secrets('00000000-0000-0000-0000-0000000192c2')),
  'never-encrypted-access', 'ext_connection_secrets decrypts the (b)-row correctly post-cleanup (no unreadable connection)'
);

-- ── (c) tokenless row: no crash, both columns stay null ────────────────────────
select is((select access_token      from external_connections where id = '00000000-0000-0000-0000-0000000192c3'), null, 'tokenless row: access_token stays null');
select is((select refresh_token     from external_connections where id = '00000000-0000-0000-0000-0000000192c3'), null, 'tokenless row: refresh_token stays null');

-- ── (d) service_role-only ───────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000019201","email":"owner-iq1cleanup@test.dev","role":"authenticated"}';
select throws_ok(
  $$ select _iq1_cleanup_legacy_qbo_plaintext() $$,
  null::text, null::text,
  'authenticated CANNOT execute the plaintext-cleanup helper'
);
reset role;

select * from finish();
rollback;
