-- W5.4 multi-currency — the currency catalog, the per-org opt-in gate, rate
-- resolution (manual override + the fx_rates snapshot), the NEW base-currency
-- balance invariant alongside the unchanged per-currency one, foreign-currency
-- invoicing with realized FX on settlement, and period-close unrealized FX
-- revaluation + auto-reverse (docs/plans/multi-currency-design.md). Everything
-- rolls back. Run: `supabase test db`.

begin;
select plan(29);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'owner-mc@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'stranger-mc@test.dev','authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000fa', 'business', 'MC Org A', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000fb', 'business', 'MC Org B (legacy)', '00000000-0000-0000-0000-0000000000f1');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fb', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000fa', 'USD'),
  ('00000000-0000-0000-0000-0000000000fb', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-0000000000fa', '1000', 'Cash',                'asset'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000fa', '1200', 'Accounts receivable', 'asset'),
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-0000000000fa', '4000', 'Sales income',        'income'),
  ('00000000-0000-0000-0000-00000000fa04', '00000000-0000-0000-0000-0000000000fa', '1050', 'Foreign Bank GBP',    'asset'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-0000000000fb', '1000', 'Cash',                'asset'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-0000000000fb', '4000', 'Sales income',        'income');

-- ECB-style snapshot: EUR-base, re-based arithmetically at lookup time.
insert into fx_rates (base_currency, quote_currency, rate, as_of, source) values
  ('EUR', 'USD', 1.10, '2026-01-01', 'ECB'),
  ('EUR', 'GBP', 0.80, '2026-01-01', 'ECB'),
  ('EUR', 'USD', 1.08, '2026-03-31', 'ECB'); -- GBP carries forward from Jan (0.80)

-- signed base balance (D positive), like the codebase's _acct_bal convention.
create or replace function _acct_base(p_acct uuid) returns bigint language sql as $$
  select coalesce(sum(case when side='D' then base_amount_minor else -base_amount_minor end), 0)::bigint
  from journal_lines where account_id = p_acct;
$$;
-- as-of variant: close_accounting_period posts the auto-reverse IMMEDIATELY
-- (dated into the next period), so a snapshot "as of the closing period end"
-- must filter by entry_date, not just query every row that exists yet.
create or replace function _acct_base_asof(p_acct uuid, p_asof date) returns bigint language sql as $$
  select coalesce(sum(case when l.side='D' then l.base_amount_minor else -l.base_amount_minor end), 0)::bigint
  from journal_lines l join journal_entries e on e.id = l.entry_id
  where l.account_id = p_acct and e.entry_date <= p_asof;
$$;

-- ── 1-3. currency catalog: minor_unit correctness (D2) ───────────────────────
select is((select minor_unit from currencies where code = 'JPY'), 0::smallint, 'JPY is a 0-decimal currency');
select is((select minor_unit from currencies where code = 'BHD'), 3::smallint, 'BHD is a 3-decimal currency');
select is((select minor_unit from currencies where code = 'USD'), 2::smallint, 'USD is a 2-decimal currency');

-- ── 4. multi-currency is OFF by default (D7) ─────────────────────────────────
select is(
  (select multi_currency_enabled from org_accounting_settings where org_id = '00000000-0000-0000-0000-0000000000fa'),
  false, 'multi_currency_enabled defaults false');

-- ── 5. only the org's OWNER may flip the opt-in gate (folded into the
--      existing set_org_accounting_settings, not a second settings RPC) ──────
select throws_ok(
  $$ select set_org_accounting_settings(p_actor => '00000000-0000-0000-0000-0000000000f2',
       p_org => '00000000-0000-0000-0000-0000000000fa', p_multi_currency_enabled => true) $$,
  '42501', null, 'a stranger cannot enable multi-currency');

-- ── 6. owner enables multi-currency for org A ────────────────────────────────
select is(
  (select multi_currency_enabled from set_org_accounting_settings(
    p_actor => '00000000-0000-0000-0000-0000000000f1', p_org => '00000000-0000-0000-0000-0000000000fa',
    p_multi_currency_enabled => true)),
  true, 'owner enables multi-currency (opt-in)');

-- ── 7. org B (opted OUT) — the legacy single-currency gate is untouched ──────
select throws_ok(
  $$ select post_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fb',
       '2026-01-05'::date, 'mc:legacy-gate',
       jsonb_build_array(
         jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fb01','amount_minor',1000,'side','D','currency','EUR'),
         jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fb02','amount_minor',1000,'side','C','currency','EUR'))) $$,
  '23514', null, 'an opted-out org still refuses a non-home-currency line');

-- ── 8. resolve_fx_rate re-bases the EUR-base snapshot to home currency ───────
select is(resolve_fx_rate('GBP', 'USD', '2026-01-01'::date), 1.375, 'resolve_fx_rate(GBP,USD) = 1.10/0.80');

-- ── 9. post_journal_entry auto-resolves the rate from fx_rates and computes
--      base_amount_minor with integer math (design §3). Both lines share GBP
--      and the SAME resolved rate, so it also proves the base-balance trigger
--      passes for a same-currency-both-legs entry.
select post_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  '2026-01-01'::date, 'mc:auto-rate',
  jsonb_build_array(
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',10000,'side','D','currency','GBP'),
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',10000,'side','C','currency','GBP')));
select is(
  (select array_agg(distinct base_amount_minor) from journal_lines
    where entry_id = (select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa' and idempotency_key = 'mc:auto-rate')),
  array[13750::bigint], 'auto-resolved GBP rate produces base_amount_minor = 13750 (100.00 GBP @ 1.375)');

-- ── 10. no snapshot + no override for a foreign line → refuse, never silently 1
select throws_ok(
  $$ select post_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
       '2026-01-01'::date, 'mc:no-rate',
       jsonb_build_array(
         jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',1000,'side','D','currency','JPY'),
         jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',1000,'side','C','currency','JPY'))) $$,
  '22023', null, 'no fx_rates snapshot and no manual override → fx_rate_required, never a silent 1');

-- ── 11. a manual per-line fx_rate override is honored over the snapshot ──────
select post_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  '2026-01-01'::date, 'mc:manual-override',
  jsonb_build_array(
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',1000,'side','D','currency','GBP','fx_rate',2.0),
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',1000,'side','C','currency','GBP','fx_rate',2.0)));
select is(
  (select base_amount_minor from journal_lines
    where entry_id = (select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa' and idempotency_key = 'mc:manual-override') limit 1),
  2000::bigint, 'a manual fx_rate override is used over the fx_rates lookup');

-- ── 12. the NEW base-balance trigger rejects an entry that balances per-
--       currency-amount but NOT in base terms, with no FX plug. Direct insert
--       (bypassing post_journal_entry) + force the deferred check, mirroring
--       phase2_ledger_test's established pattern for journal_lines_balanced.
select throws_ok($$
  insert into journal_entries (id, org_id, entry_date, period_id, status, source, idempotency_key, posted_by) values
    ('00000000-0000-0000-0000-0000000fa1e0', '00000000-0000-0000-0000-0000000000fa', '2026-01-01',
     (select id from accounting_periods where org_id = '00000000-0000-0000-0000-0000000000fa' order by period_start limit 1),
     'posted', 'manual', 'mc:base-imbalance', '00000000-0000-0000-0000-0000000000f1');
  insert into journal_lines (entry_id, org_id, account_id, amount_minor, currency, side, base_amount_minor, fx_rate) values
    ('00000000-0000-0000-0000-0000000fa1e0', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000fa01', 1000, 'USD', 'D', 1000, 1),
    ('00000000-0000-0000-0000-0000000fa1e0', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000fa03', 1000, 'USD', 'C', 999,  1);
  -- per-transaction-currency invariant still holds (1000 USD D = 1000 USD C);
  -- only the base leg is corrupted (1000 <> 999) — isolates invariant 2.
  set constraints journal_lines_base_balanced immediate;
$$, '23514', null, 'base-currency imbalance (no FX plug) is rejected at commit');
set constraints all deferred;

-- ── 13-14. D5 monetary classification: infer from type, override wins ───────
select ok(is_monetary_account('00000000-0000-0000-0000-00000000fa01'), 'Cash (asset, no override) infers monetary = true');
update ledger_accounts set is_monetary = false where id = '00000000-0000-0000-0000-00000000fa01';
select ok(not is_monetary_account('00000000-0000-0000-0000-00000000fa01'), 'is_monetary override wins over the type default');
update ledger_accounts set is_monetary = null where id = '00000000-0000-0000-0000-00000000fa01'; -- restore for later assertions

-- ── 15-19. foreign-currency invoicing: booking rate vs settlement rate ───────
create temp table _mc_inv as
select * from upsert_invoice('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  '[{"description":"Consulting","unit_price_minor":10000}]'::jsonb, 'UK Customer Ltd',
  null, null, '2026-01-01', 'GBP');
select is((select currency from _mc_inv), 'GBP', 'a foreign-currency invoice can be created once opted in');

select send_invoice('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa', (select id from _mc_inv));
select is(
  (select fx_rate from invoices where id = (select id from _mc_inv)),
  1.375, 'send_invoice stores the booking-date rate on the invoice');

select apply_invoice_payment('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  (select id from _mc_inv), 10000, '2026-01-15'::date, 'wire', 1.40);
select is(
  (select status from invoices where id = (select id from _mc_inv))::text,
  'paid', 'settling at a different rate still fully pays the invoice');
select is(
  _acct_base('00000000-0000-0000-0000-00000000fa02'), 0::bigint,
  'AR nets to zero base once paid (booked and cleared at the SAME booking rate)');
select is(
  _acct_base(resolve_realized_fx_account('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa')),
  -250::bigint, 'the settlement/booking rate gap (1.40 vs 1.375) posts a $2.50 realized FX gain (credit-normal, -250)');

-- ── 20-24. period-close unrealized FX revaluation + auto-reverse (D4) ────────
-- An open GBP balance carried since Feb (booked @ 1.30) sits in "Foreign Bank
-- GBP" when March closes; the March snapshot re-bases to 1.35.
select post_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  '2026-02-15'::date, 'mc:fbank-open',
  jsonb_build_array(
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa04','amount_minor',5000,'side','D','currency','GBP','fx_rate',1.30),
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fa03','amount_minor',5000,'side','C','currency','GBP','fx_rate',1.30)));
select is(_acct_base('00000000-0000-0000-0000-00000000fa04'), 6500::bigint, 'Foreign Bank carries £50.00 @ 1.30 = $65.00 base before any revaluation');

select ensure_open_period('00000000-0000-0000-0000-0000000000fa', '2026-03-15'::date);
select close_accounting_period('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  (select id from accounting_periods where org_id = '00000000-0000-0000-0000-0000000000fa'
     and '2026-03-15' between period_start and period_end));

-- FIX 1 (regression): closing a period must still write the 'period.close'
-- ledger_audit row (dropped by the W5.4 rewrite, restored in 20260707120000).
select ok(
  exists(select 1 from ledger_audit
     where org_id = '00000000-0000-0000-0000-0000000000fa'
       and actor  = '00000000-0000-0000-0000-0000000000f1'
       and action = 'period.close'
       and target_type = 'period'
       and target_id = (select id from accounting_periods where org_id = '00000000-0000-0000-0000-0000000000fa'
                          and '2026-03-15' between period_start and period_end)
       and detail ? 'period_start' and detail ? 'period_end'),
  'FIX 1: close_accounting_period writes the period.close ledger_audit row (same shape as pre-W5.4)');

select ok(
  exists(select 1 from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa'
    and source = 'fx_revaluation' and source_ref = '00000000-0000-0000-0000-00000000fa04'),
  'closing the period posts an unrealized FX revaluation entry for the open GBP balance');
select is(
  _acct_base_asof('00000000-0000-0000-0000-00000000fa04', '2026-03-31'::date), 6750::bigint,
  'Foreign Bank revalues to £50.00 @ 1.35 = $67.50 base AS OF the closing period end');
-- Unrealized FX nets TWO effects at this close: Foreign Bank's $2.50 GAIN
-- (credit 250, from its 1.30->1.35 revaluation) AND a $5.00 LOSS (debit 500)
-- on the shared Cash account's own un-reconverted GBP balance — the invoice
-- payment test (#17-19) left 10000 GBP sitting in Cash at the 1.40 settlement
-- rate (base 14000), which THIS SAME close also revalues to 1.35 (base
-- 13500, delta -500) since Cash never got converted back to home currency.
-- Net signed (D-C) = 500 - 250 = +250 — proving the revaluation sweep isn't
-- scoped to one hand-picked account; it finds every open foreign balance.
select is(
  _acct_base_asof(resolve_unrealized_fx_account('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa'), '2026-03-31'::date),
  250::bigint, 'Unrealized FX nets the Foreign Bank gain (-250) and the Cash-GBP-balance loss (+500) AS OF the closing period end');
select is(
  _acct_base('00000000-0000-0000-0000-00000000fa04'), 6500::bigint,
  'the cumulative balance (incl. the next-period auto-reverse already posted) is back to the pre-revaluation carrying value');
select ok(
  exists(select 1 from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa'
    and source = 'reversal' and entry_date = '2026-04-01'
    and reverses_id = (select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa'
                          and source = 'fx_revaluation' and source_ref = '00000000-0000-0000-0000-00000000fa04')),
  'the revaluation auto-reverses at the start of the next period (D4)');

-- ── 25. reverse_journal_entry still carries base_amount_minor + fx_rate on a
--       plain (non-FX) reversal — the shared write-path regression guard.
select reverse_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fa',
  (select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa' and idempotency_key = 'mc:manual-override'),
  'mc:manual-override:rev', '2026-01-02'::date);
select is(
  (select array_agg(distinct base_amount_minor) from journal_lines
    where entry_id in (
      select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fa'
        and idempotency_key in ('mc:manual-override', 'mc:manual-override:rev'))),
  array[2000::bigint], 'a reversal carries the SAME base_amount_minor as the original (side flips, magnitude does not)');

-- ── 26. legacy single-currency path is byte-identical: base = amount, rate = 1
select post_journal_entry('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fb',
  '2026-01-05'::date, 'mc:legacy-home',
  jsonb_build_array(
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fb01','amount_minor',500,'side','D'),
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000fb02','amount_minor',500,'side','C')));
select is(
  (select array_agg(distinct base_amount_minor) from journal_lines
    where entry_id = (select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fb' and idempotency_key = 'mc:legacy-home')),
  array[500::bigint], 'an org that never opts in still gets base_amount_minor = amount_minor');
select is(
  (select array_agg(distinct fx_rate) from journal_lines
    where entry_id = (select id from journal_entries where org_id = '00000000-0000-0000-0000-0000000000fb' and idempotency_key = 'mc:legacy-home')),
  array[1::numeric], 'an org that never opts in still gets fx_rate = 1');

select * from finish();
rollback;
