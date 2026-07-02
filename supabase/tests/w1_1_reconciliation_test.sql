-- W1.1 · Bank reconciliation gate (migration 20260703080000_w1_1_bank_reconciliation).
-- Guards the match RPCs, tenant isolation, the read_only CPA gate, the tie-out
-- lock refusal, and the acceptance-critical reversal-reopens-match rule.
-- Scenario ids: W1.1-AUTOMATCH, W1.1-REVERSAL, W1.1-TIEOUT.  Run: `supabase test db`.

begin;
select plan(21);

-- ── fixtures: one business, a FULL CPA, a READ-ONLY CPA, plus a second org ────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000ee0a01', 'rOwner@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000ee0f01', 'rFirm@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000ee0c01', 'rCpaFull@test.dev','authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000ee0c02', 'rCpaRo@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000ee0d02', 'rOther@test.dev',  'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-000000ee0b01', 'business', 'R Biz',   '00000000-0000-0000-0000-000000ee0a01'),
  ('00000000-0000-0000-0000-000000ee0f01', 'firm',     'R Firm',  '00000000-0000-0000-0000-000000ee0f01'),
  ('00000000-0000-0000-0000-000000ee0b02', 'business', 'R Other', '00000000-0000-0000-0000-000000ee0d02');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000ee0a01', '00000000-0000-0000-0000-000000ee0b01', 'owner',      'active'),
  ('00000000-0000-0000-0000-000000ee0f01', '00000000-0000-0000-0000-000000ee0f01', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0f01', 'cpa',        'active'),
  ('00000000-0000-0000-0000-000000ee0c02', '00000000-0000-0000-0000-000000ee0f01', 'cpa',        'active'),
  ('00000000-0000-0000-0000-000000ee0d02', '00000000-0000-0000-0000-000000ee0b02', 'owner',      'active');

-- FULL engagement (assigned to rCpaFull) + READ-ONLY engagement branch. To keep
-- one firm↔client engagement, model read-only via a SECOND firm for rCpaRo.
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-000000ee0f02', 'firm', 'R Firm RO', '00000000-0000-0000-0000-000000ee0c02');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000ee0c02', '00000000-0000-0000-0000-000000ee0f02', 'firm_admin', 'active');

insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-000000ee0e01', '00000000-0000-0000-0000-000000ee0f01', '00000000-0000-0000-0000-000000ee0b01', 'active', 'full',      '00000000-0000-0000-0000-000000ee0f01'),
  ('00000000-0000-0000-0000-000000ee0e02', '00000000-0000-0000-0000-000000ee0f02', '00000000-0000-0000-0000-000000ee0b01', 'active', 'read_only', '00000000-0000-0000-0000-000000ee0c02');
insert into client_assignments (engagement_id, user_id, assigned_by) values
  ('00000000-0000-0000-0000-000000ee0e01', '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0f01');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-000000ee0b01', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- chart of accounts: a bank account for the biz + a revenue contra.
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-000000eec001', '00000000-0000-0000-0000-000000ee0b01', '1000', 'Cash',    'asset'),
  ('00000000-0000-0000-0000-000000eec002', '00000000-0000-0000-0000-000000ee0b01', '4000', 'Revenue', 'income');

-- a posted deposit of $50.00 into the bank (auto-creates this month, open).
create temp table _dep as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-000000ee0a01',
  p_org   => '00000000-0000-0000-0000-000000ee0b01',
  p_entry_date => (date_trunc('month', current_date) + interval '10 days')::date,
  p_idempotency_key => 'k-rdep',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-000000eec001","amount_minor":5000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-000000eec002","amount_minor":5000,"side":"C"}]'::jsonb
);

-- a statement line for that deposit, via an import batch (source csv).
insert into import_batches (id, org_id, source, status, bank_account_id, created_by) values
  ('00000000-0000-0000-0000-000000eeb101', '00000000-0000-0000-0000-000000ee0b01', 'csv', 'committed',
   '00000000-0000-0000-0000-000000eec001', '00000000-0000-0000-0000-000000ee0a01');
insert into import_rows (id, batch_id, org_id, row_num, txn_date, description, amount_minor, status) values
  ('00000000-0000-0000-0000-000000ee9101', '00000000-0000-0000-0000-000000eeb101', '00000000-0000-0000-0000-000000ee0b01',
   1, (date_trunc('month', current_date) + interval '10 days')::date, 'Deposit', 5000, 'posted');

-- ── 1. ISOTEST: match RPCs are NOT execute-granted to authenticated/anon ──────
select is(
  (select count(*)::int from information_schema.role_routine_grants
   where routine_name = 'reconcile_match' and grantee in ('authenticated','anon')), 0,
  'reconcile_match is not EXECUTE-granted to authenticated/anon (service_role only)');

-- ── 2. open a session (full CPA) ─────────────────────────────────────────────
create temp table _s as
select * from reconcile_open_session(
  '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
  '00000000-0000-0000-0000-000000eec001',
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  0, 5000);
select is((select status::text from _s), 'open', 'full CPA opens a reconciliation session');

-- ── 3. read_only CPA cannot open a session (server-side gate) ─────────────────
select throws_ok($$
  select reconcile_open_session(
    '00000000-0000-0000-0000-000000ee0c02', '00000000-0000-0000-0000-000000ee0b01',
    '00000000-0000-0000-0000-000000eec001', '2099-01-31', 0, 0) $$,
  '42501', NULL, 'read_only CPA cannot open a session (can_write_org_as refuses)');

-- ── 4. cross-tenant actor cannot open a session ──────────────────────────────
select throws_ok($$
  select reconcile_open_session(
    '00000000-0000-0000-0000-000000ee0d02', '00000000-0000-0000-0000-000000ee0b01',
    '00000000-0000-0000-0000-000000eec001', '2099-02-28', 0, 0) $$,
  '42501', NULL, 'a stranger cannot reconcile another org');

-- ── 5. record a match (W1.1-AUTOMATCH shape: exact) ──────────────────────────
create temp table _m as
select * from reconcile_match(
  '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
  (select id from _s), '00000000-0000-0000-0000-000000ee9101', (select id from _dep), 'exact');
select is((select kind::text from _m), 'exact', 'full CPA records an exact match');
select is((select amount_minor from _m), 5000::bigint, 'match captures the statement line amount to the cent');

-- ── 6. the match is audit-logged ─────────────────────────────────────────────
select is(
  (select count(*)::int from ledger_audit
   where org_id = '00000000-0000-0000-0000-000000ee0b01' and action = 'reconcile.match'), 1,
  'match writes a ledger_audit row');

-- ── 7. read_only CPA cannot match ────────────────────────────────────────────
select throws_ok($$
  select reconcile_match(
    '00000000-0000-0000-0000-000000ee0c02', '00000000-0000-0000-0000-000000ee0b01',
    (select id from _s), '00000000-0000-0000-0000-000000ee9101', (select id from _dep), 'manual') $$,
  '42501', NULL, 'read_only CPA cannot match');

-- ── 8. a line already matched cannot be matched again (live unique) ──────────
select throws_ok($$
  select reconcile_match(
    '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
    (select id from _s), '00000000-0000-0000-0000-000000ee9101', (select id from _dep), 'manual') $$,
  '23505', NULL, 'a statement line cannot be double-matched while live');

-- ── 9. TIEOUT: lock succeeds because opening(0)+cleared(5000)=closing(5000) ───
create temp table _lk as
select * from reconcile_lock(
  '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01', (select id from _s));
select is((select status::text from _lk), 'locked', 'W1.1-TIEOUT: ties to the cent → lock succeeds');
select is(
  (select count(*)::int from ledger_audit
   where org_id = '00000000-0000-0000-0000-000000ee0b01' and action = 'reconcile.lock'), 1,
  'lock writes a ledger_audit row');

-- ── 10. a locked session refuses new matches until reopened ──────────────────
insert into import_rows (id, batch_id, org_id, row_num, txn_date, description, amount_minor, status) values
  ('00000000-0000-0000-0000-000000ee9102', '00000000-0000-0000-0000-000000eeb101', '00000000-0000-0000-0000-000000ee0b01',
   2, current_date, 'Extra', 100, 'posted');
select throws_ok($$
  select reconcile_match(
    '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
    (select id from _s), '00000000-0000-0000-0000-000000ee9102', (select id from _dep), 'manual') $$,
  '23001', NULL, 'a locked session refuses new matches');

-- ── 11. W1.1-REVERSAL: reversing the matched entry REOPENS the match ─────────
-- The match is live before the reversal.
select is(
  (select count(*)::int from reconciliation_matches
   where entry_id = (select id from _dep) and reopened_at is null), 1,
  'match is live before the reversal');

create temp table _rev as
select * from reverse_journal_entry(
  '00000000-0000-0000-0000-000000ee0a01', '00000000-0000-0000-0000-000000ee0b01',
  (select id from _dep), 'k-rrev', current_date, 'reopen test');

-- the match is reopened (soft) …
select is(
  (select count(*)::int from reconciliation_matches
   where entry_id = (select id from _dep) and reopened_at is not null and reopened_reason = 'entry_reversed'), 1,
  'W1.1-REVERSAL: the reversal reopens the matched line (reopened_at set)');
select is(
  (select count(*)::int from reconciliation_matches
   where entry_id = (select id from _dep) and reopened_at is null), 0,
  'no live match on the reversed entry remains');

-- … and the previously-locked session is UNLOCKED (books no longer tie) …
select is(
  (select status::text from reconciliation_sessions where id = (select id from _s)), 'open',
  'W1.1-REVERSAL: the reversal unlocks the reconciled session');

-- … and the reopen is audit-logged.
select is(
  (select count(*)::int from ledger_audit
   where org_id = '00000000-0000-0000-0000-000000ee0b01' and action = 'reconcile.reopen_on_reversal'), 1,
  'the reversal-reopen is audit-logged');

-- ── 12. lock now REFUSES: opening(0)+cleared(0) ≠ closing(5000) after reopen ──
select throws_ok($$
  select reconcile_lock(
    '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01', (select id from _s)) $$,
  '23001', NULL, 'W1.1-TIEOUT: lock refuses when opening+cleared ≠ closing');

-- ── 13. TIE-OUT INTEGRITY: a match must reflect the entry's net on the account ─
-- These guard against a forged tie-out: lock() sums statement-line amounts only,
-- so if match() didn't verify the ledger entry actually moves the bank account by
-- that amount, a CPA could clear lines against unrelated/zero-movement entries and
-- still "reconcile" — a silently-wrong month. (Fails before the match() amount/net
-- check was added; passes after.)

-- reopen the session (it was unlocked by the reversal above; matches are reopened).
-- fresh line + a $50 revenue-only entry that never touches the bank account.
create temp table _s2 as
select * from reconcile_open_session(
  '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
  '00000000-0000-0000-0000-000000eec001', '2099-06-30', 0, 5000);

insert into import_rows (id, batch_id, org_id, row_num, txn_date, description, amount_minor, status) values
  ('00000000-0000-0000-0000-000000ee9201', '00000000-0000-0000-0000-000000eeb101', '00000000-0000-0000-0000-000000ee0b01',
   3, '2099-06-15', 'Ghost deposit', 5000, 'posted');

-- an entry that posts $50 within revenue only (no bank-account line at all).
create temp table _off as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-000000ee0a01',
  p_org   => '00000000-0000-0000-0000-000000ee0b01',
  p_entry_date => '2099-06-15',
  p_idempotency_key => 'k-roff',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-000000eec002","amount_minor":5000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-000000eec002","amount_minor":5000,"side":"C"}]'::jsonb);

select throws_ok($$
  select reconcile_match(
    '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
    (select id from _s2), '00000000-0000-0000-0000-000000ee9201', (select id from _off), 'manual') $$,
  '23001', NULL,
  'match refuses an entry with no net movement on the reconciled bank account');

-- an entry that DOES touch the bank account but for the WRONG amount ($40 ≠ $50 line).
create temp table _wrong as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-000000ee0a01',
  p_org   => '00000000-0000-0000-0000-000000ee0b01',
  p_entry_date => '2099-06-15',
  p_idempotency_key => 'k-rwrong',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-000000eec001","amount_minor":4000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-000000eec002","amount_minor":4000,"side":"C"}]'::jsonb);

select throws_ok($$
  select reconcile_match(
    '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
    (select id from _s2), '00000000-0000-0000-0000-000000ee9201', (select id from _wrong), 'manual') $$,
  '23001', NULL,
  'match refuses an entry whose net on the account ≠ the statement line amount');

-- the RIGHT entry ($50 into the bank) matches cleanly and the session then ties+locks.
create temp table _right as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-000000ee0a01',
  p_org   => '00000000-0000-0000-0000-000000ee0b01',
  p_entry_date => '2099-06-15',
  p_idempotency_key => 'k-rright',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-000000eec001","amount_minor":5000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-000000eec002","amount_minor":5000,"side":"C"}]'::jsonb);

select lives_ok($$
  select reconcile_match(
    '00000000-0000-0000-0000-000000ee0c01', '00000000-0000-0000-0000-000000ee0b01',
    (select id from _s2), '00000000-0000-0000-0000-000000ee9201', (select id from _right), 'exact') $$,
  'match accepts the entry whose net on the account equals the statement line');

select * from finish();
rollback;
