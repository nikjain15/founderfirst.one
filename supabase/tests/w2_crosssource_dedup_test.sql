-- W2 gate fix (P1) · Cross-source ingest de-dup (migration 20260704040000).
-- Proves the SAME real bank txn imported via CSV then synced via Plaid on the same
-- bank account posts ONCE (LEARNINGS #16 "balances ≠ correct"), while:
--   • same-source replay still dedups (no regression — Plaid webhook replay),
--   • two genuinely-distinct same-day/same-amount/same-desc txns from one source
--     both post,
--   • a reversed prior entry does NOT block a legitimate re-post.
-- SECURITY DEFINER RPCs take an explicit p_actor, called directly; all rolls back.
-- Scenario ids: XSRC-CSV-THEN-PLAID, XSRC-REPLAY, XSRC-TWO-DISTINCT, XSRC-REVERSAL.

begin;
select plan(19);

-- ── XSRC-CONCURRENCY (red-team): the cross-source dedup is a read-then-write with
-- NO unique(org,bank,content_hash) backstop, so two ingest paths racing the SAME
-- real txn from DIFFERENT sources could both pass find_crosssource_dup and both
-- post. Both paths MUST take the SAME (org,bank_account) txn-advisory lock so the
-- find→post→record window is serialized. Assert the lock is present in both fn
-- bodies with the identical key expression. Fails before the backstop, passes after.
select matches(
  pg_get_functiondef('commit_import_batch(uuid,uuid,uuid,integer)'::regprocedure),
  'pg_advisory_xact_lock\(hashtextextended\(.*v_bank.*, 42\)\)',
  'XSRC-CONCURRENCY: commit_import_batch serializes ingest on the (org,bank) advisory lock');
select matches(
  pg_get_functiondef('plaid_ingest_transactions(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure),
  'pg_advisory_xact_lock\(hashtextextended\(.*v_bank.*, 42\)\)',
  'XSRC-CONCURRENCY: plaid_ingest_transactions takes the SAME (org,bank) advisory lock');

-- ── fixtures: one business (owner), a bank account, a Plaid connection ────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000f0a01', 'xOwner@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000f0b01', 'business', 'X Biz', '00000000-0000-0000-0000-0000000f0a01');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000f0b01', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- the SAME bank account both the CSV batch and the Plaid connection post into.
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000fc001', '00000000-0000-0000-0000-0000000f0b01', '1000', 'Cash',    'asset'),
  ('00000000-0000-0000-0000-0000000fc002', '00000000-0000-0000-0000-0000000f0b01', '5000', 'Expense', 'expense');

-- Plaid connection wired to the SAME bank account so both sources share it.
insert into external_connections (id, org_id, provider, realm_id, tenant_name, access_token, status, connected_by, account_id) values
  ('00000000-0000-0000-0000-0000000fe001', '00000000-0000-0000-0000-0000000f0b01', 'plaid',
   'item-x', 'X Bank', 'access-x', 'active', '00000000-0000-0000-0000-0000000f0a01',
   '00000000-0000-0000-0000-0000000fc001');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. XSRC-CSV-THEN-PLAID: a $25 coffee imported via CSV, then the SAME txn
--    arrives via Plaid → posts ONCE (Plaid add is skipped, cross-source).
-- ═══════════════════════════════════════════════════════════════════════════
create temp table _xb as
select * from create_import_batch(
  '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
  'csv'::import_source, 'coffee.csv', '00000000-0000-0000-0000-0000000fc001', null);

select add_import_rows('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
  (select id from _xb),
  '[{"row_num":1,"txn_date":"2026-07-01","description":"Coffee  Shop","amount_minor":-2500,"account_id":"00000000-0000-0000-0000-0000000fc002","status":"ready"}]'::jsonb);
select lives_ok($$
  select commit_import_batch('00000000-0000-0000-0000-0000000f0a01','00000000-0000-0000-0000-0000000f0b01',(select id from _xb))
$$, 'XSRC: CSV coffee commits');

select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000f0b01' and source='import'),
  1, 'XSRC: one ledger entry after CSV import');
select is((select count(*)::int from ingest_content_index where org_id='00000000-0000-0000-0000-0000000f0b01'),
  1, 'XSRC: CSV import recorded one content-index row');

-- Now Plaid syncs the SAME real txn: same account, same date, same amount, same
-- description (whitespace differs → normalized away). It must NOT double-post.
select is(
  (select (plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
    '00000000-0000-0000-0000-0000000fe001',
    '[{"transaction_id":"plaid-coffee","date":"2026-07-01","amount_minor":-2500,"name":"coffee shop","pending":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb))->>'skipped')::int,
  1, 'XSRC-CSV-THEN-PLAID: Plaid add of the same real txn is skipped (cross-source)');

select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000f0b01' and source='import'),
  1, 'XSRC: still ONE ledger entry (no cross-source double-post)');

-- the Plaid raw row is still stored and bound to the EXISTING entry (so a later
-- Plaid modify/remove of this txn resolves), but no new entry was created.
select is((select count(*)::int from bank_transactions where org_id='00000000-0000-0000-0000-0000000f0b01'),
  1, 'XSRC: Plaid raw row stored');
select is(
  (select bt.journal_entry_id from bank_transactions bt where bt.plaid_transaction_id='plaid-coffee'),
  (select entry_id from ingest_content_index where org_id='00000000-0000-0000-0000-0000000f0b01' limit 1),
  'XSRC: Plaid row bound to the pre-existing CSV entry');

-- ledger still balances.
select is(
  (select coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0)::bigint
   from journal_lines where org_id='00000000-0000-0000-0000-0000000f0b01'),
  0::bigint, 'XSRC: ledger balances (Dr==Cr) after cross-source skip');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. XSRC-REPLAY: re-running the SAME Plaid page is still a no-op (same-source
--    replay-safety preserved — no regression).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
    '00000000-0000-0000-0000-0000000fe001',
    '[{"transaction_id":"plaid-coffee","date":"2026-07-01","amount_minor":-2500,"name":"coffee shop","pending":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb))->>'skipped')::int,
  1, 'XSRC-REPLAY: Plaid replay of the same txn is skipped (same-source guard)');
select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000f0b01' and source='import'),
  1, 'XSRC-REPLAY: no new entry from replay');
select is((select count(*)::int from bank_transactions where org_id='00000000-0000-0000-0000-0000000f0b01'),
  1, 'XSRC-REPLAY: no duplicate bank_transactions row');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. XSRC-TWO-DISTINCT: two genuinely-distinct same-day/same-amount/same-desc
--    txns from ONE source (Plaid, distinct transaction_ids) BOTH post — the
--    fix must NOT collapse a single source's own distinct rows.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
    '00000000-0000-0000-0000-0000000fe001',
    '[{"transaction_id":"latte-1","date":"2026-07-05","amount_minor":-500,"name":"Latte","pending":false},
      {"transaction_id":"latte-2","date":"2026-07-05","amount_minor":-500,"name":"Latte","pending":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb))->>'added')::int,
  2, 'XSRC-TWO-DISTINCT: two distinct same-day $5 lattes from one source both post');
select is((select count(*)::int from journal_entries je
            where je.org_id='00000000-0000-0000-0000-0000000f0b01'
              and je.status='posted' and je.entry_date='2026-07-05'),
  2, 'XSRC-TWO-DISTINCT: both latte entries present (distinct, not merged)');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. XSRC-REVERSAL: a reversed prior entry must NOT block a legitimate re-post
--    of the same content from another source.
-- ═══════════════════════════════════════════════════════════════════════════
-- Plaid REMOVE the coffee txn → its entry is reversed → index row pruned.
select lives_ok($$
  select plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
    '00000000-0000-0000-0000-0000000fe001',
    '[]'::jsonb, '[]'::jsonb,
    '[{"transaction_id":"plaid-coffee"}]'::jsonb)
$$, 'XSRC-REVERSAL: Plaid removes the coffee txn (reverses its entry)');

-- the reversal pruned the coffee content-index row (only the two lattes remain).
select is((select count(*)::int from ingest_content_index where org_id='00000000-0000-0000-0000-0000000f0b01'),
  2, 'XSRC-REVERSAL: reversed entry pruned from the content index');

-- now a NEW CSV import of the same coffee content posts fresh (not blocked).
create temp table _xb2 as
select * from create_import_batch(
  '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
  'csv'::import_source, 'coffee2.csv', '00000000-0000-0000-0000-0000000fc001', null);
select add_import_rows('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01',
  (select id from _xb2),
  '[{"row_num":1,"txn_date":"2026-07-01","description":"Coffee Shop","amount_minor":-2500,"account_id":"00000000-0000-0000-0000-0000000fc002","status":"ready"}]'::jsonb);
select lives_ok($$
  select commit_import_batch('00000000-0000-0000-0000-0000000f0a01','00000000-0000-0000-0000-0000000f0b01',(select id from _xb2))
$$, 'XSRC-REVERSAL: re-import after reversal commits');
select is((select status::text from import_rows where batch_id=(select id from _xb2)),
  'posted', 'XSRC-REVERSAL: reversed prior entry did NOT block the legitimate re-post');

select * from finish();
rollback;
