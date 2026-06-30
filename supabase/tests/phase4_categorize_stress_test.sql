-- [stress:categorize] regression tests for 20260630140000:
--  (1) LIKE-wildcard rule poisoning is neutralized (match is literal), and a
--      genuine literal value still matches.
--  (2) reverse_journal_entry's already_reversed guard holds (the FOR UPDATE that
--      makes it concurrency-safe can't be exercised in a single pgTAP session;
--      the live stress harness proves the concurrent case — see the PR).

begin;
select plan(7);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'ownerD@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000e1', 'business', 'Biz D', '00000000-0000-0000-0000-0000000000d1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 'owner', 'active');
-- org_accounting_settings is auto-seeded (home_currency defaults to USD) by the
-- organizations_seed_settings trigger — do not insert it again (dup pkey).
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000000e1', '1000', 'Cash',    'asset'),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000000e1', '5100', 'Meals',   'expense');

-- ── FIX 2: a learned wildcard value must match LITERALLY, not as a pattern ─────
insert into categorization_rules (org_id, match_type, match_value, account_id, source, created_by)
values ('00000000-0000-0000-0000-0000000000e1', 'description_contains', 'a%z',
        '00000000-0000-0000-0000-0000000d0002', 'human', '00000000-0000-0000-0000-0000000000d1');

select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000000e1', 'alcatraz tickets') is null,
  'a "%"-wildcard rule no longer over-matches an unrelated description (poison neutralized)');
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000e1', 'please buy a%z today'),
  '00000000-0000-0000-0000-0000000d0002'::uuid,
  'the same rule STILL matches a description that literally contains "a%z"');

insert into categorization_rules (org_id, match_type, match_value, account_id, source, created_by)
values ('00000000-0000-0000-0000-0000000000e1', 'description_contains', 'a_c',
        '00000000-0000-0000-0000-0000000d0002', 'human', '00000000-0000-0000-0000-0000000000d1');
select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000000e1', 'abc supplies') is null,
  'a "_"-wildcard rule no longer matches "abc" (underscore treated literally)');
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000e1', 'vendor a_c ltd'),
  '00000000-0000-0000-0000-0000000d0002'::uuid,
  'the "_" rule still matches a literal "a_c"');

-- ── FIX 1: reverse guard — a posted entry can be reversed once; a second reverse
-- of the same entry raises already_reversed (the FOR UPDATE makes this race-safe). ─
create temp table _e as
select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1',
  '2026-05-01', 'k-rev-orig',
  '[{"account_id":"00000000-0000-0000-0000-0000000d0002","amount_minor":900,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000d0001","amount_minor":900,"side":"C"}]'::jsonb,
  'manual', null, 'Reversible');

select lives_ok($$
  select reverse_journal_entry('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1',
    (select id from _e), 'k-rev-1')
$$, 'first reverse of a posted entry succeeds');

select throws_ok($$
  select reverse_journal_entry('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1',
    (select id from _e), 'k-rev-2')
$$, '23001', NULL, 'a second reverse of the same entry raises already_reversed (no double-reversal)');

-- the entry touched Meals net 0 after exactly one reversal (900 D − 900 C)
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines
    where account_id = '00000000-0000-0000-0000-0000000d0002'
      and entry_id in (select id from journal_entries
                        where source_ref = (select id::text from _e) or id = (select id from _e))),
  0, 'Meals nets to zero after exactly one reversal (no over-cancellation)');

select * from finish();
rollback;
