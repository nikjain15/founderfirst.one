-- REG-1 regression pack — Chart-of-Accounts integrity (COATEST F4/F5/F6).
--
-- These findings had NO pgTAP coverage before this pack (they were fixed on prod
-- via 20260701220000_coatest_coa_integrity.sql but never asserted in a test, so a
-- refactor of upsert_ledger_account could silently regress them). Scenario ids map
-- to the finding ids in docs/stress/SCENARIOS.md.
--
--   COA-F4  account.currency was unvalidated → non-ISO code crashes the books view
--   COA-F5  parent_id was not org-scoped → cross-tenant parent (dangling ref / DoS)
--   COA-F6  parent could be a different type → wrong rollups
--   COA-F7  cycle guard (self-parent / loop) — folded in from prod drift
--
-- Run locally: `supabase test db`. Everything rolls back.

begin;
select plan(5);

-- ── fixtures (namespaced [REGTEST]) ──────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000ca01', 'ownerA@regtest.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ca02', 'ownerB@regtest.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-00000000cb01', 'business', 'REG COA A', '00000000-0000-0000-0000-00000000ca01'),
  ('00000000-0000-0000-0000-00000000cb02', 'business', 'REG COA B', '00000000-0000-0000-0000-00000000ca02');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000cb01', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-00000000cb02', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-00000000cb01', 'USD'),
  ('00000000-0000-0000-0000-00000000cb02', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- an asset account in each org (org B's is the cross-tenant parent bait)
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-00000000cb01', '1000', 'Cash A',  'asset'),
  ('00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-00000000cb02', '1000', 'Cash B',  'asset');

-- ── COA-F4: a non-ISO currency code is rejected at the write-path ────────────
select throws_ok($$
  select upsert_ledger_account(
    p_actor => '00000000-0000-0000-0000-00000000ca01',
    p_org   => '00000000-0000-0000-0000-00000000cb01',
    p_name  => 'Bad ccy', p_type => 'asset'::account_type,
    p_code  => '1100', p_currency => 'US$')
$$, '23514', NULL, 'COA-F4: non-ISO currency (US$) rejected (would crash Intl.NumberFormat)');

-- a well-formed 3-letter code is accepted
select lives_ok($$
  select upsert_ledger_account(
    p_actor => '00000000-0000-0000-0000-00000000ca01',
    p_org   => '00000000-0000-0000-0000-00000000cb01',
    p_name  => 'EUR cash', p_type => 'asset'::account_type,
    p_code  => '1150', p_currency => 'EUR')
$$, 'COA-F4: a valid ISO currency code (EUR) is accepted');

-- ── COA-F5: a parent in ANOTHER org is rejected (cross-tenant dangling ref) ──
select throws_ok($$
  select upsert_ledger_account(
    p_actor => '00000000-0000-0000-0000-00000000ca01',
    p_org   => '00000000-0000-0000-0000-00000000cb01',
    p_name  => 'Child', p_type => 'asset'::account_type,
    p_code  => '1200', p_parent_id => '00000000-0000-0000-0000-0000000cc002')
$$, '23503', NULL, 'COA-F5: cross-tenant parent_id (org B account) rejected');

-- ── COA-F6: a parent of a different type is rejected (wrong rollups) ─────────
select throws_ok($$
  select upsert_ledger_account(
    p_actor => '00000000-0000-0000-0000-00000000ca01',
    p_org   => '00000000-0000-0000-0000-00000000cb01',
    p_name  => 'Mistyped child', p_type => 'income'::account_type,
    p_code  => '4000', p_parent_id => '00000000-0000-0000-0000-0000000cc001')
$$, '23514', NULL, 'COA-F6: income account cannot roll up under an asset parent');

-- ── COA-F5 (positive): a same-org, same-type parent IS allowed ──────────────
select lives_ok($$
  select upsert_ledger_account(
    p_actor => '00000000-0000-0000-0000-00000000ca01',
    p_org   => '00000000-0000-0000-0000-00000000cb01',
    p_name  => 'Sub-cash', p_type => 'asset'::account_type,
    p_code  => '1010', p_parent_id => '00000000-0000-0000-0000-0000000cc001')
$$, 'COA-F5: same-org same-type parent is accepted');

select * from finish();
rollback;
