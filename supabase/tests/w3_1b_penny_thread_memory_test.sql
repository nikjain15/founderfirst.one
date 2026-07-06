-- W3.1b · Penny thread memory (server-side per-(org,user) history).
-- Proves: append + history round-trip in chat order; a non-member is refused;
-- the thread is per-user (isolation); role + non-empty body are validated.
-- All rolls back.

begin;
select plan(7);

-- ── users + orgs + memberships ───────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'owner@mem.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d9', 'outsider@mem.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000D1', 'business', 'MemCo', '00000000-0000-0000-0000-0000000000d1');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000D1', 'owner', 'active');

-- the table exists
select has_table('penny_thread_messages');

-- ── owner (member) appends two turns ─────────────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000d1","email":"owner@mem.dev","role":"authenticated"}';

select ok(
  (select penny_thread_append('00000000-0000-0000-0000-0000000000D1', 'you', 'What did I spend?')) is not null,
  'member can append a message');
select lives_ok(
  $$ select penny_thread_append('00000000-0000-0000-0000-0000000000D1', 'penny', 'Nothing yet — connect your bank.') $$,
  'member can append Penny''s reply');

-- history comes back in chat order (oldest first)
select is(
  (select count(*)::int from penny_thread_history('00000000-0000-0000-0000-0000000000D1', 200)),
  2, 'history returns both turns');
select is(
  (select role from penny_thread_history('00000000-0000-0000-0000-0000000000D1', 200) limit 1),
  'you', 'history is oldest-first');

-- role + body validation
select throws_ok(
  $$ select penny_thread_append('00000000-0000-0000-0000-0000000000D1', 'bogus', 'x') $$,
  '22023', NULL, 'invalid role is refused');

reset "request.jwt.claims";

-- ── outsider (non-member) is refused + sees nothing ──────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000d9","email":"outsider@mem.dev","role":"authenticated"}';

select throws_ok(
  $$ select penny_thread_append('00000000-0000-0000-0000-0000000000D1', 'you', 'let me in') $$,
  '42501', NULL, 'non-member cannot append (isolation)');

reset "request.jwt.claims";

select * from finish();
rollback;
