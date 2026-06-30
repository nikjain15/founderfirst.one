-- [stress:chart-of-accounts] COA integrity guards (COATEST F4–F9, F12).
-- Proves the hardened upsert_ledger_account + cycle trigger at the DB level.
-- Run locally: `supabase test db`.

begin;
select plan(12);

-- ── fixtures: two orgs so cross-tenant parenting can be exercised ────────────
insert into auth.users (id, email, aud, role) values
  ('c0a70000-0000-0000-0000-000000000001', 'coa-a@test.dev', 'authenticated', 'authenticated'),
  ('c0a70000-0000-0000-0000-000000000002', 'coa-b@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('c0a70000-0000-0000-0000-0000000000a0', 'business', 'COA Co A', 'c0a70000-0000-0000-0000-000000000001'),
  ('c0a70000-0000-0000-0000-0000000000b0', 'business', 'COA Co B', 'c0a70000-0000-0000-0000-000000000002');
insert into memberships (user_id, org_id, role, status) values
  ('c0a70000-0000-0000-0000-000000000001', 'c0a70000-0000-0000-0000-0000000000a0', 'owner', 'active'),
  ('c0a70000-0000-0000-0000-000000000002', 'c0a70000-0000-0000-0000-0000000000b0', 'owner', 'active');
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('c0a70000-0000-0000-0000-0000000000f0', 'c0a70000-0000-0000-0000-0000000000a0', '2026-01-01', '2026-12-31', 'open');

-- an account in org B (the cross-tenant parent target)
insert into ledger_accounts (id, org_id, name, type, code) values
  ('c0a70000-0000-0000-0000-0000000000e0', 'c0a70000-0000-0000-0000-0000000000b0', 'B Cash', 'asset', 'BCASH');

-- ── 1. happy create returns a row + writes an audit trail (F12) ──────────────
select lives_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Cash', 'asset'::account_type, 'A1000');
$$, 'create account succeeds');

select is(
  (select count(*)::int from ledger_audit
    where org_id = 'c0a70000-0000-0000-0000-0000000000a0' and action = 'account.create'),
  1, 'F12: account.create is audited');

-- grab the created id for later
create or replace function _coa_id(p_code text) returns uuid language sql as $$
  select id from ledger_accounts where org_id = 'c0a70000-0000-0000-0000-0000000000a0' and code = p_code;
$$;

-- ── 2. F4: a non-ISO-shaped currency is rejected ─────────────────────────────
select throws_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Bad Ccy', 'asset'::account_type, 'A1001',
    null, null, 'US$'::char(3), null);
$$, '23514', NULL, 'F4: malformed currency is rejected');

-- ── 3. F5: a parent in ANOTHER org is rejected ───────────────────────────────
select throws_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Child', 'asset'::account_type, 'A1002',
    null, 'c0a70000-0000-0000-0000-0000000000e0'::uuid);
$$, '23503', NULL, 'F5: cross-tenant parent is rejected');

-- a same-org parent of a DIFFERENT type, for F6
select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
  'c0a70000-0000-0000-0000-0000000000a0', 'Revenue', 'income'::account_type, 'A4000');

-- ── 4. F6: a parent of a different type is rejected ──────────────────────────
select throws_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Child2', 'asset'::account_type, 'A1003',
    null, _coa_id('A4000'));
$$, '23514', NULL, 'F6: cross-type parent is rejected');

-- ── 5. F7: self-parent (cycle) is rejected by the folded-in trigger/guard ────
select throws_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Cash', 'asset'::account_type, 'A1000',
    _coa_id('A1000'), _coa_id('A1000'));
$$, '23514', NULL, 'F7: self-parent (cycle) is rejected');

-- ── 6. a valid same-org / same-type parent is accepted ───────────────────────
select lives_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Petty Cash', 'asset'::account_type, 'A1010',
    null, _coa_id('A1000'));
$$, 'valid same-org same-type parent is accepted');

-- post a balanced entry touching Cash (A1000) so it carries activity + a balance
insert into journal_entries (id, org_id, entry_date, period_id, source, idempotency_key, posted_by) values
  ('c0a70000-0000-0000-0000-0000000000d1', 'c0a70000-0000-0000-0000-0000000000a0', '2026-03-01',
   'c0a70000-0000-0000-0000-0000000000f0', 'manual', 'coa-k1', 'c0a70000-0000-0000-0000-000000000001');
insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
  ('c0a70000-0000-0000-0000-0000000000d1', 'c0a70000-0000-0000-0000-0000000000a0', _coa_id('A1000'), 10000, 'D'),
  ('c0a70000-0000-0000-0000-0000000000d1', 'c0a70000-0000-0000-0000-0000000000a0', _coa_id('A4000'), 10000, 'C');
set constraints all immediate;
set constraints all deferred;

-- ── 7. F9: changing type once posted is rejected ─────────────────────────────
select throws_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Cash', 'expense'::account_type, 'A1000',
    _coa_id('A1000'));
$$, '23514', NULL, 'F9: type change on a posted account is rejected');

-- ── 8. F8: archiving a non-zero-balance account is rejected ──────────────────
select throws_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Cash', 'asset'::account_type, 'A1000',
    _coa_id('A1000'), null, null, true);
$$, '23514', NULL, 'F8: archiving a non-zero-balance account is rejected');

-- ── 9. F8: a zero-balance account CAN be archived ────────────────────────────
select lives_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Petty Cash', 'asset'::account_type, 'A1010',
    _coa_id('A1010'), null, null, true);
$$, 'F8: a zero-balance account can be archived');

-- ── 10. F12: an update is audited (account.archive action) ───────────────────
select is(
  (select count(*)::int from ledger_audit
    where org_id = 'c0a70000-0000-0000-0000-0000000000a0' and action = 'account.archive'),
  1, 'F12: account.archive is audited');

-- ── 11. rename after posting is allowed (identity = id; history-safe) ─────────
select lives_ok($$
  select upsert_ledger_account('c0a70000-0000-0000-0000-000000000001',
    'c0a70000-0000-0000-0000-0000000000a0', 'Cash — Operating', 'asset'::account_type, 'A1000',
    _coa_id('A1000'));
$$, 'rename of a posted account is allowed (identity stays the id)');

select * from finish();
rollback;
