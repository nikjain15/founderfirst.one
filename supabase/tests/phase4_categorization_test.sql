-- Phase 4 categorization gate (ARCHITECTURE.md §6). The approve→post→learn loop:
-- an uncategorized entry is recategorized (reverse + repost, append-only), the fix
-- is learned as a rule, and the matcher proposes that account next time. Same
-- technique as the other suites; everything rolls back.

begin;
select plan(10);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev',        'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cpaUnassigned@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A',  '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000f1', 'firm',     'Firm F', '00000000-0000-0000-0000-0000000000a3');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000f1', 'firm_admin', 'active');

insert into org_accounting_settings (org_id, home_currency) values ('00000000-0000-0000-0000-0000000000b1', 'USD');

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash',          'asset'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '5100', 'Software',      'expense');

-- an uncategorized expense paid from cash, memo "ADOBE *123"
create temp table _orig as
select * from post_journal_entry(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '2026-02-01', 'k-orig',
  '[{"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":5000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":5000,"side":"C"}]'::jsonb,
  'manual', null, 'ADOBE *123');

-- ── recategorize Uncategorized → Software, learn a rule on "adobe" ───────────
create temp table _rc as
select * from recategorize_entry(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  (select id from _orig),
  '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003',
  'k-rc', true, 'adobe', 'description_contains'::cat_match_type);

select is((select source from _rc), 'recategorize', 'recategorize posts a new entry');
select is(
  (select count(*)::int from journal_lines where entry_id = (select id from _rc)
     and account_id = '00000000-0000-0000-0000-00000000c003' and side = 'D' and amount_minor = 5000),
  1, 'new entry debits Software 5000');
select is((select status::text from journal_entries where id = (select id from _orig)), 'reversed', 'original entry reversed');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000c002'),
  0, 'Uncategorized nets to zero (original + reversal)');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000c003'),
  5000, 'Software now carries the 5000 debit');

-- ── the rule was learned ─────────────────────────────────────────────────────
select is(
  (select count(*)::int from categorization_rules
     where org_id='00000000-0000-0000-0000-0000000000b1' and match_value='adobe'
       and account_id='00000000-0000-0000-0000-00000000c003' and is_active),
  1, 'a categorization rule was learned for "adobe" → Software');

-- ── the matcher proposes Software for a new "adobe" description ──────────────
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000000b1', 'Monthly ADOBE subscription'),
  '00000000-0000-0000-0000-00000000c003'::uuid, 'matcher proposes Software for a new ADOBE charge');
select ok(
  match_categorization_rule('00000000-0000-0000-0000-0000000000b1', 'Starbucks coffee') is null,
  'matcher returns nothing for an unmatched description');

-- ── authorization + guards ───────────────────────────────────────────────────
select throws_ok($$
  select recategorize_entry('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000b1',
    (select id from _rc), '00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000c003','k-x')
$$, '42501', NULL, 'a non-member cannot recategorize');

select throws_ok($$
  select recategorize_entry('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',
    (select id from _rc), '00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000c003','k-y')
$$, '22023', NULL, 'recategorize with a from-account not on the entry is rejected');

select * from finish();
rollback;
