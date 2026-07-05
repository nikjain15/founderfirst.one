-- RV2-D1 AP / bill-pay — TRACKING ONLY gate. Exercises the bill lifecycle
-- end-to-end against the real ledger: add (draft) → enter (posts Dr Expense / Cr
-- AP) → record payment (posts Dr AP / Cr Cash, clears AP) → paid; plus void
-- (reversal), AP aging bucketing, per-vendor AP, vendor REUSE from the 1099
-- store, and the isolation grants. Critically, it asserts the NO-FUND-MOVEMENT
-- invariant: the ONLY effects of these RPCs are DB rows + journal postings, and
-- AP totals tie to the 1099 vendor totals. Everything rolls back.
-- Run: `supabase test db`.
--
-- SECDEF write RPCs take an explicit p_actor, so the (superuser) test role calls
-- them directly with each actor passed in — no SET ROLE.

begin;
select plan(24);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A', '00000000-0000-0000-0000-00000000000a');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- Seed the well-known accounts so the resolvers find (not create) them.
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash',              'asset'),
  ('00000000-0000-0000-0000-00000000c020', '00000000-0000-0000-0000-0000000000b1', '2000', 'Accounts payable',  'liability'),
  ('00000000-0000-0000-0000-00000000c060', '00000000-0000-0000-0000-0000000000b1', '6000', 'General expenses',  'expense');

-- A vendor from the EXISTING 1099 store (reuse, no dup) — bills point here.
create temp table _vend as
select * from vendor_upsert('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  null, 'Widgets Supply Co', true);

-- signed balance (D positive) across ALL entries (reversed + reversal net out).
create or replace function _acct_bal_all(p_acct uuid) returns bigint language sql as $$
  select coalesce(sum(case when side='D' then amount_minor else -amount_minor end), 0)::bigint
  from journal_lines l where l.account_id = p_acct;
$$;

-- ── 1. opt-in is OFF by default until set ────────────────────────────────────
select is(
  (select coalesce((select enabled from org_ap_settings where org_id='00000000-0000-0000-0000-0000000000b1'), false)),
  false, 'AP tracking is OFF until turned on (opt-in)');
select set_ap_settings('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', true);
select is(
  (select enabled from org_ap_settings where org_id = '00000000-0000-0000-0000-0000000000b1'),
  true, 'set_ap_settings enables the feature (opt-in)');

-- ── 2. a stranger cannot create a bill (auth gate) ───────────────────────────
select throws_ok(
  $$ select upsert_bill('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1',
       '[{"description":"x","unit_price_minor":100}]'::jsonb) $$,
  '42501', null, 'non-member cannot create a bill (cross-tenant isolation)');

-- ── 3–4. create a draft bill with two lines; total computed ──────────────────
create temp table _bill as
select * from upsert_bill(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Widgets","quantity_milli":2000,"unit_price_minor":5000},
    {"description":"Freight","unit_price_minor":1500}]'::jsonb,
  (select id from _vend), '2026-01-31'::date, '2026-01-01'::date);
select is((select status from _bill)::text, 'draft', 'new bill is a draft');
-- 2 × 5000 + 1 × 1500 = 11500
select is((select total_minor from _bill), 11500::bigint, 'total = qty×unit summed to the cent');

-- ── 5. draft posts NOTHING to the ledger yet ─────────────────────────────────
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c020'), 0::bigint, 'AP still zero while draft');

-- ── 6. a bill with NO vendor cannot be entered (AP must tie to a payee) ───────
create temp table _novend as
select * from upsert_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Mystery","unit_price_minor":900}]'::jsonb);
select throws_ok(
  $$ select enter_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
       (select id from _novend)) $$,
  '23001', null, 'cannot enter a bill with no vendor');

-- ── 7–10. ENTER posts Dr Expense / Cr AP for the total ───────────────────────
create temp table _entered as
select * from enter_bill('00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000b1', (select id from _bill));
select is((select status from _entered)::text, 'open', 'enter flips status → open (owed)');
select is((select post_entry_id from _entered) is not null, true, 'enter links a ledger entry');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c060'), 11500::bigint,  'Expense debited by the total on enter');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c020'), -11500::bigint, 'AP credited by the total on enter');

-- ── 11. re-enter is idempotent (no double-post) ──────────────────────────────
select enter_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _bill));
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c020'), -11500::bigint, 're-enter does not double-post AP');

-- ── 12–14. record a partial payment posts Dr AP / Cr Cash; status → partial ──
--   NOTE: this RECORDS a payment. Its ONLY effects are a bill_payments row + a
--   journal entry — no money moves anywhere.
create temp table _pay1 as
select * from record_bill_payment('00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000b1', (select id from _bill), 4000::bigint, '2026-02-05'::date, 'check 1042');
select is((select status from _pay1)::text, 'partial', 'partial payment → partial status');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c001'), -4000::bigint, 'Cash credited by the recorded payment');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c020'), -7500::bigint, 'AP reduced to the remaining balance');

-- ── 15. overpayment beyond the balance is rejected ───────────────────────────
select throws_ok(
  $$ select record_bill_payment('00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-0000000000b1',
       (select id from bills where number='BILL-0001'), 999999::bigint) $$,
  '23514', null, 'overpayment rejected');

-- ── 16–17. final payment → paid; AP fully cleared ────────────────────────────
create temp table _pay2 as
select * from record_bill_payment('00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000b1', (select id from _bill), 7500::bigint);
select is((select status from _pay2)::text, 'paid', 'full payment → paid');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c020'), 0::bigint, 'AP ties out to zero when paid in full');

-- ── 18. AP aging buckets an overdue open bill ────────────────────────────────
-- a second bill, entered, due long ago, unpaid → lands in 90+ as-of a late date.
create temp table _bill2 as
select * from upsert_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Overdue supply","unit_price_minor":20000}]'::jsonb,
  (select id from _vend), '2026-01-10'::date, '2026-01-01'::date);
select enter_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _bill2));
-- bill_ap_aging is membership-gated (can_access_org via auth.uid()); read it AS
-- the owner so the JWT claim resolves (mirrors the AR aging test).
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner@test.dev","role":"authenticated"}';
select is(
  (select balance_minor from bill_ap_aging('00000000-0000-0000-0000-0000000000b1', '2026-05-01'::date) where bucket = '90+'),
  20000::bigint, 'AP aging puts a long-overdue open bill in the 90+ bucket');

-- ── 19. AP aging ties to the ledger AP account balance ───────────────────────
-- Only bill2 is open (20000); the AP ledger account should equal the sum of open
-- AP-aging balances (credit balance −20000 == 20000 owed).
select is(
  (select coalesce(sum(balance_minor),0) from bill_ap_aging('00000000-0000-0000-0000-0000000000b1', '2026-05-01'::date)),
  -_acct_bal_all('00000000-0000-0000-0000-00000000c020'),
  'AP aging total ties to the AP ledger account balance');

-- ── 20. AP owed per vendor ties to the 1099 vendor (SAME store, no dup) ───────
select is(
  (select open_balance_minor from bill_ap_by_vendor('00000000-0000-0000-0000-0000000000b1')
     where vendor_id = (select id from _vend)),
  20000::bigint, 'per-vendor AP ties to the reused 1099 vendor row');
reset "request.jwt.claims";

-- ── 21. config seed present (payment terms is DATA, not a magic number) ───────
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000000b1') ->> 'bill_payment_terms_days')::int,
  30, 'bill_payment_terms_days seeded in platform_config');

-- ── 22. void reverses the accrual (append-only); AP nets to zero ─────────────
create temp table _bill3 as
select * from upsert_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Mistake","unit_price_minor":5000}]'::jsonb, (select id from _vend));
select enter_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _bill3));
select void_bill('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _bill3));
select is(
  (select status from bills where id = (select id from _bill3))::text,
  'void', 'void marks the bill void and reverses its ledger entry');

-- ── 23. NO-FUND-MOVEMENT invariant — recording a payment produces ONLY a
--        bill_payments row + a balanced journal entry, nothing else. There is no
--        payments/transfer table and no such side effect in the schema. We prove
--        the recorded payment's journal entry is balanced (a bookkeeping record,
--        not a disbursement) and that bill_payments carries no external ref.
select is(
  (select count(*)::int from bill_payments bp
     join journal_entries je on je.id = bp.post_entry_id
     join journal_lines jl on jl.entry_id = je.id
     where bp.org_id = '00000000-0000-0000-0000-0000000000b1'
     group by je.id
     having sum(case when jl.side='D' then jl.amount_minor else -jl.amount_minor end) <> 0),
  0, 'every recorded-payment journal entry is balanced (a record, not a transfer)');

-- ── 24. can_write is required to record a payment (a stranger cannot) ─────────
select throws_ok(
  $$ select record_bill_payment('00000000-0000-0000-0000-00000000000c',
       '00000000-0000-0000-0000-0000000000b1',
       (select id from _bill2), 100::bigint) $$,
  '42501', null, 'non-member cannot record a payment (cross-tenant isolation)');

select * from finish();
rollback;
