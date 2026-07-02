-- Phase 3 import gate (ARCHITECTURE.md §6.4). Exercises the batch lifecycle:
-- create → stage rows → commit (posts through the verified post_journal_entry) →
-- frozen; plus discard-before-commit, the opening-balance plug, and authorization.
-- Same technique as the Phase 2 tests: SECURITY DEFINER functions take an explicit
-- p_actor, called directly as the test role; everything rolls back.

begin;
select plan(15);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev',        'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'cpaAdmin@test.dev',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cpaUnassigned@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A',  '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000f1', 'firm',     'Firm F', '00000000-0000-0000-0000-0000000000a1');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000f1', 'cpa',        'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash',     'asset'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', '4000', 'Revenue',  'income'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '5000', 'Rent',     'expense'),
  ('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-0000000000b1', '2000', 'Loan',     'liability');

-- ── CSV import: deposit (+) and rent (−) ─────────────────────────────────────
create temp table _b1 as
select * from create_import_batch(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  'csv'::import_source, 'jan.csv', '00000000-0000-0000-0000-00000000c001', null);

select is(
  add_import_rows('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
    (select id from _b1),
    '[{"row_num":1,"txn_date":"2026-01-10","description":"Client deposit","amount_minor":120000,"account_id":"00000000-0000-0000-0000-00000000c002","status":"ready"},
      {"row_num":2,"txn_date":"2026-01-12","description":"Rent","amount_minor":-30000,"account_id":"00000000-0000-0000-0000-00000000c003","status":"ready"}]'::jsonb),
  2, 'two CSV rows staged');

create temp table _b1c as
select * from commit_import_batch('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _b1));

select is((select status::text from _b1c), 'committed', 'CSV batch commits');
select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000000b1' and source='import'), 2, 'one journal entry per CSV row');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
   from journal_lines where account_id='00000000-0000-0000-0000-00000000c001'),
  90000, 'Cash nets to +90000 (deposit 120000 − rent 30000)');
select is(
  (select coalesce(sum(case side when 'C' then amount_minor else -amount_minor end),0)::int
   from journal_lines where account_id='00000000-0000-0000-0000-00000000c002'),
  120000, 'Revenue credited 120000');
select is((select count(*)::int from import_rows where batch_id=(select id from _b1) and status='posted'), 2, 'both rows marked posted');

-- idempotent re-commit: no double-post
select is((select status::text from commit_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b1))), 'committed', 're-commit is idempotent (returns committed)');
select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000000b1' and source='import'), 2, 're-commit did not double-post');

-- committed batch is frozen
select throws_ok($$
  select add_import_rows('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',
    (select id from _b1), '[{"row_num":3,"amount_minor":1,"status":"ready"}]'::jsonb)
$$, '23001', NULL, 'cannot stage rows into a committed batch');
select throws_ok($$
  select discard_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b1))
$$, '23001', NULL, 'cannot discard a committed batch');

-- ── discard BEFORE commit ────────────────────────────────────────────────────
create temp table _b2 as
select * from create_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1','csv'::import_source,'feb.csv','00000000-0000-0000-0000-00000000c001',null);
select add_import_rows('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b2),
  '[{"row_num":1,"txn_date":"2026-02-01","amount_minor":5000,"account_id":"00000000-0000-0000-0000-00000000c002","status":"ready"}]'::jsonb);
select is((select status::text from discard_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b2))), 'discarded', 'pre-commit batch discards');
select is((select count(*)::int from import_rows where batch_id=(select id from _b2)), 0, 'discarded batch rows removed (zero ledger impact)');

-- ── opening balances with a plug ─────────────────────────────────────────────
create temp table _b3 as
select * from create_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1','opening_balances'::import_source,null,null,date '2025-12-31');
select add_import_rows('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b3),
  '[{"row_num":1,"description":"Cash opening","amount_minor":50000,"account_id":"00000000-0000-0000-0000-00000000c001","side":"D","status":"ready"},
    {"row_num":2,"description":"Loan opening","amount_minor":20000,"account_id":"00000000-0000-0000-0000-00000000c004","side":"C","status":"ready"}]'::jsonb);
create temp table _b3c as
select * from commit_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b3));

-- one balanced opening entry; the 30000 imbalance is plugged to Opening Balance Equity (auto-created)
select is(
  (select count(*)::int from journal_entries je
   where je.org_id='00000000-0000-0000-0000-0000000000b1' and je.entry_date='2025-12-31' and je.source='import'),
  1, 'opening balances post as one entry at cutover');
select is(
  (select coalesce(sum(case side when 'C' then amount_minor else -amount_minor end),0)::int
   from journal_lines jl join ledger_accounts a on a.id=jl.account_id
   where a.org_id='00000000-0000-0000-0000-0000000000b1' and a.code='3900'),
  30000, 'Opening Balance Equity plug = 30000 credit (50000 Dr − 20000 Cr)');

-- ── authorization ────────────────────────────────────────────────────────────
select throws_ok($$
  select create_import_batch('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000b1','csv'::import_source,'x.csv',null,null)
$$, '42501', NULL, 'a non-member / unengaged user cannot create an import batch');

select * from finish();
rollback;
