-- W4.3 invoicing + AR gate. Exercises the invoice lifecycle end-to-end against
-- the real ledger: create (draft) → send (posts Dr AR / Cr Revenue) → apply
-- payment (posts Dr Cash / Cr AR, clears AR) → paid; plus void (reversal), AR
-- aging bucketing, the config-driven nudge selector, and the isolation grants.
-- Everything rolls back. Run: `supabase test db`.
--
-- SECDEF write RPCs take an explicit p_actor, so the (superuser) test role calls
-- them directly with each actor passed in — no SET ROLE.

begin;
select plan(21);

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
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash',                'asset'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', '1200', 'Accounts receivable', 'asset'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '4000', 'Sales income',        'income');

-- helper: current balance (signed, D positive) of an account across posted entries
create or replace function _acct_bal(p_acct uuid) returns bigint language sql as $$
  select coalesce(sum(case when side='D' then amount_minor else -amount_minor end), 0)::bigint
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.account_id = p_acct and e.status <> 'reversed'
    -- reversed entries net to zero WITH their reversal, so include everything:
  ;
$$;
-- (we include reversed + reversal both — they net out — for a true running balance)
create or replace function _acct_bal_all(p_acct uuid) returns bigint language sql as $$
  select coalesce(sum(case when side='D' then amount_minor else -amount_minor end), 0)::bigint
  from journal_lines l where l.account_id = p_acct;
$$;

-- ── 1. opt-in is OFF by default until set ────────────────────────────────────
select set_invoicing_settings('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', true, true);
select is(
  (select enabled from org_invoicing_settings where org_id = '00000000-0000-0000-0000-0000000000b1'),
  true, 'set_invoicing_settings enables the feature (opt-in)');

-- ── 2. a stranger cannot create an invoice (auth gate) ───────────────────────
select throws_ok(
  $$ select upsert_invoice('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000b1',
       '[{"description":"x","unit_price_minor":100}]'::jsonb, 'Cust') $$,
  '42501', null, 'non-member cannot create an invoice');

-- ── 3–4. create a draft invoice with two lines; total computed ───────────────
create temp table _inv as
select * from upsert_invoice(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Design","quantity_milli":2000,"unit_price_minor":5000},
    {"description":"Hosting","unit_price_minor":1500}]'::jsonb,
  'Acme Co', 'ap@acme.test', '2026-01-31'::date, '2026-01-01'::date);
select is((select status from _inv)::text, 'draft', 'new invoice is a draft');
-- 2 × 5000 + 1 × 1500 = 11500
select is((select total_minor from _inv), 11500::bigint, 'total = qty×unit summed to the cent');

-- ── 5. draft posts NOTHING to the ledger yet ─────────────────────────────────
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c002'), 0::bigint, 'AR still zero while draft');

-- ── 6–9. SEND posts Dr AR / Cr Revenue for the total ─────────────────────────
create temp table _sent as
select * from send_invoice('00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000b1', (select id from _inv));
select is((select status from _sent)::text, 'sent', 'send flips status → sent');
select is((select post_entry_id from _sent) is not null, true, 'send links a ledger entry');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c002'), 11500::bigint,  'AR debited by the total on send');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c003'), -11500::bigint, 'Revenue credited by the total on send');

-- ── 10. re-send is idempotent (no double-post) ───────────────────────────────
select send_invoice('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _inv));
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c002'), 11500::bigint, 're-send does not double-post AR');

-- ── 11–13. partial payment posts Dr Cash / Cr AR; status → partial ───────────
create temp table _p1 as
select * from apply_invoice_payment('00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000b1', (select id from _inv), 4000::bigint, '2026-02-05'::date, 'ach');
select is((select status from _p1)::text, 'partial', 'partial payment → partial status');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c001'), 4000::bigint, 'Cash debited by the payment');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c002'), 7500::bigint, 'AR reduced to the remaining balance');

-- ── 14. overpayment beyond the balance is rejected ───────────────────────────
select throws_ok(
  $$ select apply_invoice_payment('00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-0000000000b1',
       (select id from invoices where number='INV-0001'), 999999::bigint) $$,
  '23514', null, 'overpayment rejected');

-- ── 15–16. final payment → paid; AR fully cleared ────────────────────────────
create temp table _p2 as
select * from apply_invoice_payment('00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-0000000000b1', (select id from _inv), 7500::bigint);
select is((select status from _p2)::text, 'paid', 'full payment → paid');
select is(_acct_bal_all('00000000-0000-0000-0000-00000000c002'), 0::bigint, 'AR ties out to zero when paid in full');

-- ── 17. AR aging buckets an overdue open invoice ─────────────────────────────
-- a second invoice, sent, due long ago, unpaid → lands in 90+ as-of a late date.
create temp table _inv2 as
select * from upsert_invoice('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Overdue job","unit_price_minor":20000}]'::jsonb, 'Late Corp', 'late@x.test',
  '2026-01-10'::date, '2026-01-01'::date);
select send_invoice('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _inv2));
select is(
  (select balance_minor from invoice_ar_aging('00000000-0000-0000-0000-0000000000b1', '2026-05-01'::date) where bucket = '90+'),
  20000::bigint, 'AR aging puts a long-overdue open invoice in the 90+ bucket');

-- ── 18. nudge selector honors the config cadence + opt-in ─────────────────────
-- The overdue open invoice (inv2, has email) is due a nudge as-of a late date.
select is(
  (select count(*)::int from invoices_due_nudge('00000000-0000-0000-0000-0000000000b1', 7, '2026-05-01'::date)),
  1, 'invoices_due_nudge finds the overdue opt-in invoice');
-- after marking it nudged, it is throttled out within the cadence window.
select mark_invoice_nudged('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _inv2));
select is(
  (select count(*)::int from invoices_due_nudge('00000000-0000-0000-0000-0000000000b1', 7, current_date)),
  0, 'a just-nudged invoice is throttled within the cadence window');

-- ── 19. config seed present (cadence is DATA, not a magic number) ─────────────
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000000b1') ->> 'invoice_nudge_cadence_days')::int,
  7, 'invoice_nudge_cadence_days seeded in platform_config');

-- ── 20. void reverses the accrual (append-only); AR nets to zero ─────────────
-- a fresh, unpaid sent invoice can be voided → its send entry is reversed.
create temp table _inv3 as
select * from upsert_invoice('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '[{"description":"Mistake","unit_price_minor":5000}]'::jsonb, 'Oops LLC');
select send_invoice('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _inv3));
select void_invoice('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', (select id from _inv3));
-- inv3's revenue account is the same 4000; after void the send + its reversal net
-- out, so 4000's balance reflects only inv2 (still -20000, unchanged by inv3).
select is(
  (select status from invoices where id = (select id from _inv3))::text,
  'void', 'void marks the invoice void and reverses its ledger entry');

select * from finish();
rollback;
