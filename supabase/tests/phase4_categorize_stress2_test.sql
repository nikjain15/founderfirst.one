-- [stress:categorize] round 2 — deterministic regressions surfaced by the
-- independent validation pass. Covers: the backslash + trailing-% escape branches
-- (the most fragile LIKE escapes), rule precedence, correction-learns-B-not-A,
-- multi-line recategorize (only the holding line moves), and the approve guard.
-- Everything rolls back.

begin;
select plan(11);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'ownerF@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000f2', 'business', 'Biz F', '00000000-0000-0000-0000-0000000000f1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'owner', 'active');
-- org_accounting_settings is auto-seeded (home_currency defaults to USD) by the
-- organizations_seed_settings trigger — do not insert it again (dup pkey).
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000f2', '1000', 'Cash',     'asset'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000f2', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000f2', '5100', 'Software', 'expense'),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000f2', '5200', 'Meals',    'expense'),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-0000000000f2', '5400', 'Fees',     'expense');

-- ── LIKE escape: backslash + trailing-% branches ─────────────────────────────
insert into categorization_rules (org_id, match_type, match_value, account_id, source, created_by) values
  ('00000000-0000-0000-0000-0000000000f2', 'description_contains', 'a\b',  '00000000-0000-0000-0000-00000000f004', 'human', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2', 'description_contains', '100%', '00000000-0000-0000-0000-00000000f003', 'human', '00000000-0000-0000-0000-0000000000f1');

select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000f2', 'raw a\b data'),
  '00000000-0000-0000-0000-00000000f004'::uuid,
  'a backslash in a rule matches literally (escape char handled)');
select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000000f2', 'ab supplies') is null,
  'the "a\b" rule does NOT match "ab" (backslash is literal, not a no-op)');
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000f2', 'paid 100% upfront'),
  '00000000-0000-0000-0000-00000000f003'::uuid,
  'a trailing "%" in a rule matches literally');

-- ── rule precedence: exact beats contains for identical text ─────────────────
insert into categorization_rules (org_id, match_type, match_value, account_id, source, created_by) values
  ('00000000-0000-0000-0000-0000000000f2', 'description_contains', 'uber', '00000000-0000-0000-0000-00000000f004', 'human', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2', 'description_exact',    'uber', '00000000-0000-0000-0000-00000000f003', 'human', '00000000-0000-0000-0000-0000000000f1');
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000f2', 'Uber'),
  '00000000-0000-0000-0000-00000000f003'::uuid,
  'exact rule beats contains rule for identical text');
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000f2', 'Uber Eats delivery'),
  '00000000-0000-0000-0000-00000000f004'::uuid,
  'contains rule still applies to a superstring (exact does not fire)');

-- ── correction learns B not A (upsert flips, no duplicate) ───────────────────
select learn_categorization_rule('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
  'description_contains'::cat_match_type, 'stripe', '00000000-0000-0000-0000-00000000f004', 'human');  -- A=Meals
select learn_categorization_rule('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
  'description_contains'::cat_match_type, 'stripe', '00000000-0000-0000-0000-00000000f003', 'human');  -- correct to B=Software
select is(
  (select account_id from categorization_rules where org_id='00000000-0000-0000-0000-0000000000f2' and match_value='stripe'),
  '00000000-0000-0000-0000-00000000f003'::uuid,
  'a correction re-points the rule to B (Software), not A (Meals)');
select is(
  (select count(*)::int from categorization_rules where org_id='00000000-0000-0000-0000-0000000000f2' and match_value='stripe'),
  1, 'the correction updates in place — no duplicate rule row');

-- ── multi-line entry: only the holding line is recategorized ─────────────────
-- a split charge: 1000 uncategorized + 200 known Fees, paid from Cash.
create temp table _m as
select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
  '2026-05-20', 'k-multi',
  '[{"account_id":"00000000-0000-0000-0000-00000000f002","amount_minor":1000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000f005","amount_minor":200,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000f001","amount_minor":1200,"side":"C"}]'::jsonb,
  'manual', null, 'split charge');
select recategorize_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
  (select id from _m), '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f003', 'k-multi-rc');

select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000f003'),
  1000, 'only the holding line moved to Software (+1000)');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000f005'),
  200, 'the known Fees line is untouched (still +200)');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000f002'),
  0, 'Uncategorized nets to zero (original + reversal), entry leaves the queue');

-- ── approve guard: approving a non-pending (posted) entry is rejected ─────────
create temp table _p as
select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
  '2026-05-21', 'k-posted',
  '[{"account_id":"00000000-0000-0000-0000-00000000f003","amount_minor":300,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000f001","amount_minor":300,"side":"C"}]'::jsonb,
  'manual', null, 'already posted');
select throws_ok($$
  select approve_journal_entry('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2',
    (select id from _p))
$$, '23001', NULL, 'approving an already-posted (non-pending) entry raises not_pending');

select * from finish();
rollback;
