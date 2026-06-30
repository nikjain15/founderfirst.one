-- [stress:org-creation] create_org_atomic gate (ARCHITECTURE.md §8, §C10).
-- One transaction provisions org + membership + subscription + settings (business),
-- firms get firm_admin + no settings, identical rapid creates dedupe (no duplicate),
-- the per-user cap fires, and validation rejects bad type/name. Everything rolls back.

begin;
select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'ownerB@test.dev', 'authenticated', 'authenticated');

-- ── 1. business create provisions everything atomically ─────────────────────
create temp table _biz as
select * from create_org_atomic('00000000-0000-0000-0000-00000000000a', 'business', 'Acme Biz');

select is((select type::text from _biz), 'business', 'business org created');
select is((select created_by from _biz), '00000000-0000-0000-0000-00000000000a',
  'created_by is the passed user (never forgeable from the body)');
select is(
  (select role::text from memberships where org_id = (select id from _biz)),
  'owner', 'business creator gets an owner membership');
select is(
  (select plan from subscriptions where billable_org_id = (select id from _biz)),
  'pilot_free', 'a pilot_free subscription is created');
select is(
  (select count(*)::int from org_accounting_settings where org_id = (select id from _biz)),
  1, 'business org gets a seeded accounting-settings row (trigger, same txn)');

-- ── 2. firm create → firm_admin, NO settings row ────────────────────────────
create temp table _firm as
select * from create_org_atomic('00000000-0000-0000-0000-00000000000a', 'firm', 'Acme CPA');

select is(
  (select role::text from memberships where org_id = (select id from _firm)),
  'firm_admin', 'firm creator gets a firm_admin membership');
select is(
  (select count(*)::int from org_accounting_settings where org_id = (select id from _firm)),
  0, 'a firm holds no books — no accounting-settings row');

-- ── 3. idempotency: an identical rapid re-create returns the SAME org ───────
select is(
  (select id from create_org_atomic('00000000-0000-0000-0000-00000000000a', 'business', 'Acme Biz')),
  (select id from _biz),
  'identical re-create within the window returns the existing org (no duplicate)');
select is(
  (select count(*)::int from organizations
     where created_by = '00000000-0000-0000-0000-00000000000a'
       and lower(name) = 'acme biz'),
  1, 'still exactly one "Acme Biz" — double-submit did not duplicate');

-- ── 4. validation ───────────────────────────────────────────────────────────
select throws_ok(
  $$ select create_org_atomic('00000000-0000-0000-0000-00000000000b', 'charity', 'X') $$,
  'bad_type', 'an unknown org type is rejected');
select throws_ok(
  $$ select create_org_atomic('00000000-0000-0000-0000-00000000000b', 'business', '') $$,
  'bad_name', 'an empty name is rejected');

-- ── 5. per-user org cap ─────────────────────────────────────────────────────
-- Seed user B up to the cap, then the next create must fail.
insert into organizations (type, name, created_by)
select 'business', 'B'||g, '00000000-0000-0000-0000-00000000000b'
from generate_series(1, 50) g;
select throws_ok(
  $$ select create_org_atomic('00000000-0000-0000-0000-00000000000b', 'business', 'one too many') $$,
  'org_limit_reached', 'the per-user org cap stops runaway creation');

select * from finish();
rollback;
