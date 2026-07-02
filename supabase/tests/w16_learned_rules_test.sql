-- W1.6 — learned-rules delete path (deactivate_categorization_rule).
-- REG scenario W1.6-RULEDEL. Proves:
--   (1) a writer (owner) can soft-delete a learned rule; it flips is_active off,
--   (2) a deleted rule STOPS being proposed (the matcher filters is_active) — the
--       card's core acceptance ("Penny will stop applying it"),
--   (3) a non-writer (no membership, no engagement) is FORBIDDEN (role gate —
--       read_only CPA takes this same can_write_org_as=false path),
--   (4) deleting an unknown / wrong-org rule id raises not_found,
--   (5) the delete writes a ledger_audit row (rule.delete) — auditable,
--   (6) a poisoned `%` rule can be deleted by id and then no longer matches even
--       its own literal value (CAT-F4: management path never LIKE-evaluates the
--       stored value; it keys on id).

begin;
select plan(9);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000016d1', 'ownerW16@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000016d9', 'strangerW16@test.dev','authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000016e1', 'business', 'Biz W16', '00000000-0000-0000-0000-0000000016d1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000016d1', '00000000-0000-0000-0000-0000000016e1', 'owner', 'active');
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-000000160001', '00000000-0000-0000-0000-0000000016e1', '5100', 'Meals', 'expense');

-- A learned rule: "starbucks" → Meals.
insert into categorization_rules (id, org_id, match_type, match_value, account_id, source, created_by)
values ('00000000-0000-0000-0000-0000001600a1', '00000000-0000-0000-0000-0000000016e1',
        'description_contains', 'starbucks', '00000000-0000-0000-0000-000000160001', 'penny',
        '00000000-0000-0000-0000-0000000016d1');

-- sanity: before delete, the rule proposes Meals for a matching description.
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000016e1', 'STARBUCKS #123'),
  '00000000-0000-0000-0000-000000160001'::uuid,
  'before delete: the learned rule proposes its account');

-- ── (3) role gate: a stranger (no membership/engagement) is forbidden ─────────
select throws_ok($$
  select deactivate_categorization_rule('00000000-0000-0000-0000-0000000016d9',
    '00000000-0000-0000-0000-0000000016e1', '00000000-0000-0000-0000-0000001600a1')
$$, '42501', NULL, 'a non-writer cannot delete a rule (read_only CPA hits this same gate)');

-- rule is untouched by the forbidden attempt.
select is(
  (select is_active from categorization_rules where id = '00000000-0000-0000-0000-0000001600a1'),
  true, 'forbidden delete left the rule active');

-- ── (4) not_found for a bad / wrong-org id ────────────────────────────────────
select throws_ok($$
  select deactivate_categorization_rule('00000000-0000-0000-0000-0000000016d1',
    '00000000-0000-0000-0000-0000000016e1', '00000000-0000-0000-0000-0000009999ff')
$$, 'P0002', NULL, 'deleting an unknown rule id raises not_found');

-- ── (1) owner deletes the rule ────────────────────────────────────────────────
select lives_ok($$
  select deactivate_categorization_rule('00000000-0000-0000-0000-0000000016d1',
    '00000000-0000-0000-0000-0000000016e1', '00000000-0000-0000-0000-0000001600a1')
$$, 'owner (writer) deletes the learned rule');

select is(
  (select is_active from categorization_rules where id = '00000000-0000-0000-0000-0000001600a1'),
  false, 'delete soft-deactivates the rule (is_active=false)');

-- ── (2) the deleted rule STOPS being proposed ─────────────────────────────────
select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000016e1', 'STARBUCKS #123') is null,
  'after delete: the matcher no longer proposes the rule (Penny stops applying it)');

-- ── (5) the delete is audit-logged ────────────────────────────────────────────
select is(
  (select count(*)::int from ledger_audit
     where org_id = '00000000-0000-0000-0000-0000000016e1'
       and action = 'rule.delete'
       and target_id = '00000000-0000-0000-0000-0000001600a1'),
  1, 'the delete wrote a ledger_audit rule.delete row');

-- ── (6) CAT-F4: a poisoned "%"-wildcard rule is deletable by id and then dead ──
insert into categorization_rules (id, org_id, match_type, match_value, account_id, source, created_by)
values ('00000000-0000-0000-0000-0000001600b2', '00000000-0000-0000-0000-0000000016e1',
        'description_contains', 'a%z', '00000000-0000-0000-0000-000000160001', 'human',
        '00000000-0000-0000-0000-0000000016d1');
select deactivate_categorization_rule('00000000-0000-0000-0000-0000000016d1',
  '00000000-0000-0000-0000-0000000016e1', '00000000-0000-0000-0000-0000001600b2');
select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000016e1', 'please buy a%z today') is null,
  'a poisoned "%"-rule deleted by id no longer matches even its literal value');

select * from finish();
rollback;
