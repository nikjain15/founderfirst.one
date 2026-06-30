-- Audit batch 2 hardening gate:
--   1. upsert_ledger_account rejects a cross-org parent_id (no cross-tenant chains).
--   2. match_categorization_rule treats stored LIKE metacharacters literally — a
--      rule value of '%' no longer wildcard-matches every description.
-- Mirrors the existing suites' fixture style; everything rolls back.

begin;
select plan(4);

-- ── fixtures: one owner, two of their businesses ─────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b2', 'business', 'Biz B', '00000000-0000-0000-0000-00000000000a');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b2', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'USD')
  on conflict (org_id) do nothing;

-- an account that lives in Biz B, plus a legitimate parent in Biz A
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000b2001', '00000000-0000-0000-0000-0000000000b2', '6000', 'B2 Expenses', 'expense'),
  ('00000000-0000-0000-0000-0000000b1001', '00000000-0000-0000-0000-0000000000b1', '6000', 'B1 Expenses', 'expense');

-- ── 1. cross-org parent is rejected ──────────────────────────────────────────
select throws_ok($$
  select upsert_ledger_account(
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
    'Child of another org', 'expense'::account_type,
    p_parent_id => '00000000-0000-0000-0000-0000000b2001')
$$, '42501', NULL, 'upsert_ledger_account rejects a parent_id from a different org');

-- ── 2. a same-org parent is accepted ─────────────────────────────────────────
select is(
  (select org_id from upsert_ledger_account(
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
    'Software', 'expense'::account_type,
    p_parent_id => '00000000-0000-0000-0000-0000000b1001')),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'upsert_ledger_account accepts a parent_id in the same org');

-- ── 3. a poisoned '%' rule does NOT hijack every description ─────────────────
insert into categorization_rules (org_id, match_type, match_value, account_id, is_active) values
  ('00000000-0000-0000-0000-0000000000b1', 'description_contains', '%', '00000000-0000-0000-0000-0000000b1001', true);
select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000000b1', 'totally unrelated description') is null,
  'a stored "%" rule is matched literally — it does not wildcard-match every description');

-- ── 4. a normal contains rule still matches ──────────────────────────────────
insert into categorization_rules (org_id, match_type, match_value, account_id, is_active) values
  ('00000000-0000-0000-0000-0000000000b1', 'description_contains', 'uber', '00000000-0000-0000-0000-0000000b1001', true);
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000b1', 'UBER trip Tuesday'),
  '00000000-0000-0000-0000-0000000b1001'::uuid,
  'a literal contains rule still matches case-insensitively');

select * from finish();
rollback;
