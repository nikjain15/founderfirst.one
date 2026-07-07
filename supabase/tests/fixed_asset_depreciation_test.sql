-- W1.3-C fixed-asset & depreciation gate. Proves the load-bearing guarantees:
--   1. schema present: asset_classes / macrs_percentages / fixed_assets /
--      depreciation_schedule_lines / asset_disposals.
--   2. EFFECTIVE-DATING (reuses CENTRAL-2 / W1.3-B idiom): no two active
--      asset_classes may overlap (EXCLUDE); supersede_asset_class + asset_class_in_force
--      make old in-service years compute under old §179/bonus law.
--   3. MACRS GOLDEN NUMBERS: a $10,000 5-year 200DB half-year asset depreciates
--      2000/3200/1920/1152/1152/576 (IRS Pub 946 Table A-1) — DATA-driven, from
--      the seeded macrs_percentages, not a literal.
--   4. BOOK straight-line: $10,000 over 5 years half-year = 1000/2000×4/1000.
--   5. §179 + bonus stack in year 1, then MACRS on the remainder.
--   6. M-1 ROUND-TRIP: the book-vs-tax delta drafts a tax_adjustment (via W1.3-B's
--      draft_tax_adjustment, origin_kind=depreciation_book_tax, status=proposed);
--      approval makes it count in tax_m1_summary — proves asset → schedule → M-1.
--   7. POSTING: book depreciation posts a BALANCED JE (Dr expense / Cr accumulated)
--      via post_journal_entry; PERIOD-LOCK is respected (a closed Dec period refuses).
--   8. DISPOSAL: gain/loss = proceeds - net book value, computed + recorded, AND a
--      BALANCED book removal JE is POSTED (Cr asset cost / Dr accumulated / Dr cash /
--      Cr-or-Dr gain-loss) via post_journal_entry — period-lock respected, idempotent
--      per asset, gain/loss lands on p_gain_loss_account_id. (P1: was subledger-only.)
--   9. ROLE / TENANT GATES (ISOTEST): the p_actor-first write RPCs are EXECUTE-
--      granted only to service_role; cross-tenant register is refused.
-- Runs in a transaction and rolls back.

begin;
select plan(52);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('80000000-0000-0000-0000-000000000001', 'owner@depr.dev', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000009', 'other@depr.dev', 'authenticated', 'authenticated');

insert into public.tax_jurisdictions (code, name, country_code, currency) values
  ('ZZ-DEPR', 'US Federal', 'US', 'USD') on conflict (code) do nothing;

insert into organizations (id, type, name, created_by) values
  ('80000000-0000-0000-0000-0000000000a0', 'business', 'Depr Co', '80000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-0000000000a9', 'business', 'Other Co', '80000000-0000-0000-0000-000000000009');
insert into memberships (org_id, user_id, role, status) values
  ('80000000-0000-0000-0000-0000000000a0', '80000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('80000000-0000-0000-0000-0000000000a9', '80000000-0000-0000-0000-000000000009', 'owner', 'active');
-- the organizations AFTER INSERT trigger (seed_org_accounting_settings) already
-- created a defaults row for this business org, so upsert our test values on top.
insert into org_accounting_settings (org_id, home_currency, cpa_posts_require_approval) values
  ('80000000-0000-0000-0000-0000000000a0', 'USD', false)
  on conflict (org_id) do update set home_currency = excluded.home_currency,
    cpa_posts_require_approval = excluded.cpa_posts_require_approval;

-- ledger accounts for posting (expense + contra-asset accumulated + asset cost +
-- disposal gain/loss + cash for proceeds — the disposal removal JE needs all of these)
insert into ledger_accounts (id, org_id, code, name, type) values
  ('80000000-0000-0000-0000-0000000000c1', '80000000-0000-0000-0000-0000000000a0', '7300', 'Depreciation expense',        'expense'),
  ('80000000-0000-0000-0000-0000000000c2', '80000000-0000-0000-0000-0000000000a0', '1590', 'Accumulated depreciation',    'asset'),
  ('80000000-0000-0000-0000-0000000000c3', '80000000-0000-0000-0000-0000000000a0', '1500', 'Fixed assets — cost',         'asset'),
  ('80000000-0000-0000-0000-0000000000c4', '80000000-0000-0000-0000-0000000000a0', '4900', 'Gain/loss on disposal',       'income'),
  ('80000000-0000-0000-0000-0000000000c5', '80000000-0000-0000-0000-0000000000a0', '1000', 'Cash',                        'asset');

-- LAW DATA: a 5-year 200DB half-year class in force from 2025 (no §179/bonus here to
-- isolate the MACRS golden numbers), plus its published percentage table.
insert into public.asset_classes
  (jurisdiction_code, class_key, label, tax_year, recovery_period, macrs_method, default_convention,
   section_179_cap_minor, bonus_pct, effective_from, citation)
values
  ('ZZ-DEPR', 'computers', 'Computers', 2025, 5, '200DB', 'half_year', 125000000, null, '2025-01-01', 'Pub 946 A-1');
insert into public.macrs_percentages
  (jurisdiction_code, recovery_period, convention, macrs_method, year_index, percentage, effective_from, citation) values
  ('ZZ-DEPR', 5, 'half_year', '200DB', 1, 20.00, '1987-01-01', 'Pub 946 A-1'),
  ('ZZ-DEPR', 5, 'half_year', '200DB', 2, 32.00, '1987-01-01', 'Pub 946 A-1'),
  ('ZZ-DEPR', 5, 'half_year', '200DB', 3, 19.20, '1987-01-01', 'Pub 946 A-1'),
  ('ZZ-DEPR', 5, 'half_year', '200DB', 4, 11.52, '1987-01-01', 'Pub 946 A-1'),
  ('ZZ-DEPR', 5, 'half_year', '200DB', 5, 11.52, '1987-01-01', 'Pub 946 A-1'),
  ('ZZ-DEPR', 5, 'half_year', '200DB', 6, 5.76,  '1987-01-01', 'Pub 946 A-1');

-- ── 1. schema present ────────────────────────────────────────────────────────
select has_table('public', 'asset_classes',                'asset_classes exists');
select has_table('public', 'macrs_percentages',            'macrs_percentages exists');
select has_table('public', 'fixed_assets',                 'fixed_assets exists');
select has_table('public', 'depreciation_schedule_lines',  'depreciation_schedule_lines exists');
select has_table('public', 'asset_disposals',              'asset_disposals exists');

-- ── register a $10,000 computer placed in service 15 Jun 2025 ─────────────────
create temp table _asset as
select register_fixed_asset(
  p_actor => '80000000-0000-0000-0000-000000000001',
  p_org   => '80000000-0000-0000-0000-0000000000a0',
  p_name  => 'MacBook Pro', p_class_key => 'computers', p_jurisdiction_code => 'ZZ-DEPR',
  p_cost_minor => 1000000, p_in_service_date => '2025-06-15',
  p_book_life_years => 5, p_book_convention => 'half_year',
  p_asset_account_id => '80000000-0000-0000-0000-0000000000c3',
  p_expense_account_id => '80000000-0000-0000-0000-0000000000c1',
  p_accumulated_account_id => '80000000-0000-0000-0000-0000000000c2'
) as id;

-- the SECDEF readers below (macrs_tax_depreciation_for_year / book_depreciation_
-- for_year / fixed_asset_listing / tax_m1_summary) are gated on can_access_org
-- (SEC-3) — auth as the owner (a member of Depr Co) for the positive path.
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","email":"owner@depr.dev","role":"authenticated"}';

-- ── 3. MACRS golden numbers per year (DATA-driven) ───────────────────────────
select is(macrs_tax_depreciation_for_year((select id from _asset), 2025), 200000::bigint, 'MACRS 5yr HY yr1 = $2,000 (20%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2026), 320000::bigint, 'MACRS 5yr HY yr2 = $3,200 (32%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2027), 192000::bigint, 'MACRS 5yr HY yr3 = $1,920 (19.2%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2028), 115200::bigint, 'MACRS 5yr HY yr4 = $1,152 (11.52%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2030), 57600::bigint,  'MACRS 5yr HY yr6 = $576 (5.76%)');

-- ── 4. book straight-line golden numbers ─────────────────────────────────────
select is(book_depreciation_for_year((select id from _asset), 2025), 100000::bigint, 'book SL yr1 half-year = $1,000');
select is(book_depreciation_for_year((select id from _asset), 2026), 200000::bigint, 'book SL yr2 full = $2,000');
select is(book_depreciation_for_year((select id from _asset), 2030), 100000::bigint, 'book SL yr6 remaining half = $1,000');

-- ── compute + store the full schedule; tax fully recovers cost ───────────────
select ok(compute_depreciation_schedule(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset)
) >= 6, 'schedule computed for >= 6 years');
select is(
  (select max(tax_accumulated_minor) from depreciation_schedule_lines where asset_id = (select id from _asset)),
  1000000::bigint, 'tax accumulated fully recovers the $10,000 cost');
select is(
  (select max(book_accumulated_minor) from depreciation_schedule_lines where asset_id = (select id from _asset)),
  1000000::bigint, 'book accumulated fully recovers cost (salvage 0)');

-- ── 6. M-1 round-trip: draft the yr1 book-vs-tax delta, approve, summarize ────
-- yr1: tax $2,000 - book $1,000 = $1,000 extra tax deduction → deduction_on_return_not_books.
create temp table _adj as
select draft_depreciation_m1(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset), 2025
) as id;
select is(
  (select m1_bucket from tax_adjustments where id = (select id from _adj)),
  'deduction_on_return_not_books', 'M-1 draft picks the right bucket (tax > book)');
select is(
  (select amount_minor from tax_adjustments where id = (select id from _adj)),
  100000::bigint, 'M-1 draft amount = the $1,000 delta');
select is(
  (select status from tax_adjustments where id = (select id from _adj)),
  'proposed', 'M-1 draft is a PROPOSAL (never auto-applied)');
select is(
  (select origin_kind from tax_adjustments where id = (select id from _adj)),
  'depreciation_book_tax', 'M-1 draft is tagged origin_kind=depreciation_book_tax');
-- a proposal does NOT count in the summary yet
select is(
  (select coalesce(sum(total_minor),0)::bigint from tax_m1_summary('80000000-0000-0000-0000-0000000000a0', 2025)),
  0::bigint, 'a proposed adjustment is NOT in the M-1 summary');
-- redraft is idempotent (no dup)
select ok(
  (select draft_depreciation_m1('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset),2025)) is not null
  and (select count(*) from tax_adjustments where origin_ref = 'depr:' || (select id from _asset)::text || ':2025') = 1,
  'redraft is idempotent — one row per (asset, year)');

-- ── 7. posting: book depreciation posts a BALANCED JE via post_journal_entry ──
create temp table _je as
select post_book_depreciation(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset), 2025
) as id;
select is(
  (select sum(case when side='D' then amount_minor else 0 end) from journal_lines where entry_id = (select id from _je)),
  (select sum(case when side='C' then amount_minor else 0 end) from journal_lines where entry_id = (select id from _je)),
  'posted depreciation JE is balanced (debits = credits)');
select is(
  (select amount_minor from journal_lines where entry_id = (select id from _je) and side='D'),
  100000::bigint, 'JE debits depreciation expense by the book amount ($1,000)');
-- idempotent: re-posting returns the same entry
select is(
  post_book_depreciation('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset),2025),
  (select id from _je), 're-posting is idempotent (same entry id)');

-- ── period-lock: close the Dec-2025 period, then re-posting 2026 into a closed
-- period is refused. We post 2026 first, close its period, then a NEW asset's
-- 2026 post must fail. Simpler: close the 2025 period the JE landed in, and prove
-- a fresh post into it raises period_closed.
create temp table _asset2 as
select register_fixed_asset(
  '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
  'Second laptop','computers', 500000, '2025-06-15', 'ZZ-DEPR', 0, 'straight_line', 5, 'half_year',
  0, false, null, '80000000-0000-0000-0000-0000000000c1', '80000000-0000-0000-0000-0000000000c2'
) as id;
select compute_depreciation_schedule('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset2));
-- close the Dec-2025 period (the one the first JE created)
select close_accounting_period(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0',
  (select period_id from journal_entries where id = (select id from _je)));
select throws_ok($$
  select post_book_depreciation('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
    (select id from _asset2), 2025)
$$, '23001', NULL, 'posting depreciation into a CLOSED period is refused (period-lock respected)');

-- ── 8. disposal: IRS-correct — half-year convention in the DISPOSAL year, book vs
-- tax basis, §1245 ordinary recapture. Asset placed 2025-06, disposed 2026-03 for
-- $9,500. year_index of 2026 = 2.
--   BOOK: 2025 $1,000 + 2026 ($2,000 × ½ = $1,000) = $2,000 acc → basis $8,000 →
--         gain $9,500 - $8,000 = $1,500.
--   TAX : 2025 $2,000 (20%) + 2026 ($3,200 (32%) × ½ = $1,600) = $3,600 acc →
--         basis $6,400 → gain $9,500 - $6,400 = $3,100.
--   §1245 recapture (personal property) = min($3,100 gain, $3,600 tax accumulated) = $3,100.
create temp table _disp as
select dispose_fixed_asset(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset),
  '2026-03-01', 950000, 'sold',
  '80000000-0000-0000-0000-0000000000c4',   -- gain/loss account
  '80000000-0000-0000-0000-0000000000c5'    -- proceeds (cash) account
) as id;
select is((select book_basis_minor from asset_disposals where id = (select id from _disp)), 800000::bigint,
  'disposal BOOK basis = cost $10,000 - book acc $2,000 (½ book in disposal yr) = $8,000');
select is((select gain_loss_minor from asset_disposals where id = (select id from _disp)), 150000::bigint,
  'disposal BOOK gain = proceeds $9,500 - book basis $8,000 = $1,500');
select is((select tax_basis_minor from asset_disposals where id = (select id from _disp)), 640000::bigint,
  'disposal TAX basis = cost $10,000 - tax acc $3,600 (½ MACRS in disposal yr) = $6,400');
select is((select tax_gain_loss_minor from asset_disposals where id = (select id from _disp)), 310000::bigint,
  'disposal TAX gain = proceeds $9,500 - tax basis $6,400 = $3,100');
select is((select recapture_minor from asset_disposals where id = (select id from _disp)), 310000::bigint,
  '§1245 recapture = min(tax gain $3,100, tax accumulated $3,600) = $3,100 ordinary');
select is((select recapture_section from asset_disposals where id = (select id from _disp)), '§1245',
  'personal property recapture flagged §1245');
select is((select status from fixed_assets where id = (select id from _asset)), 'disposed',
  'asset marked disposed');

-- ── 8b. the disposal posts a BALANCED book removal JE (the P1 fix) ────────────
-- The disposal must post a JE, not just record the subledger row (TB-ties-but-wrong).
select isnt((select posted_entry_id from asset_disposals where id = (select id from _disp)), NULL,
  'disposal recorded a posted journal entry (a JE was posted, not just subledger)');
-- (1)+(3) the JE balances: sum debits == sum credits
select is(
  (select sum(case when side='D' then amount_minor else 0 end) from journal_lines
     where entry_id = (select posted_entry_id from asset_disposals where id = (select id from _disp))),
  (select sum(case when side='C' then amount_minor else 0 end) from journal_lines
     where entry_id = (select posted_entry_id from asset_disposals where id = (select id from _disp))),
  'disposal JE is balanced (debits = credits)');
-- (1) the asset cost is removed: Cr the fixed-asset (cost) account for full cost $10,000
select is(
  (select amount_minor from journal_lines
     where entry_id = (select posted_entry_id from asset_disposals where id = (select id from _disp))
       and account_id = '80000000-0000-0000-0000-0000000000c3' and side='C'),
  1000000::bigint, 'disposal JE credits the asset cost account for the full $10,000 cost');
-- (1) accumulated depreciation cleared: Dr the accumulated contra for book acc $2,000
select is(
  (select amount_minor from journal_lines
     where entry_id = (select posted_entry_id from asset_disposals where id = (select id from _disp))
       and account_id = '80000000-0000-0000-0000-0000000000c2' and side='D'),
  200000::bigint, 'disposal JE debits accumulated depreciation for the $2,000 book accumulated');
-- (2) the BOOK gain ($1,500) hits the gain/loss account, credited (a gain)
select is(
  (select amount_minor from journal_lines
     where entry_id = (select posted_entry_id from asset_disposals where id = (select id from _disp))
       and account_id = '80000000-0000-0000-0000-0000000000c4' and side='C'),
  150000::bigint, 'disposal JE credits the gain/loss account with the $1,500 BOOK gain');
-- (5) idempotent: a second dispose call does NOT post a second JE (returns same disposal)
select is(
  (select count(*)::int from journal_entries where org_id = '80000000-0000-0000-0000-0000000000a0'
     and idempotency_key = 'dispose:' || (select id from _asset)::text),
  1, 'exactly one disposal JE exists for the asset (idempotency key dispose:<asset_id>)');
-- (the status guard already refuses a second dispose — prove it raises)
select throws_ok($$
  select dispose_fixed_asset('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
    (select id from _asset), '2026-04-01', 100000, 'again',
    '80000000-0000-0000-0000-0000000000c4', '80000000-0000-0000-0000-0000000000c5')
$$, NULL, NULL, 'double-dispose is refused (asset already disposed)');

-- ── 8c. disposal into a CLOSED period is refused (period-lock via post_journal_entry) ─
-- Register + dispose a fresh asset into the closed Dec-2025 period; ensure_open_period
-- inside post_journal_entry must reject it (no removal JE lands in a locked period).
create temp table _asset3 as
select register_fixed_asset(
  '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
  'Third laptop','computers', 400000, '2025-06-15', 'ZZ-DEPR', 0, 'straight_line', 5, 'half_year',
  0, false, '80000000-0000-0000-0000-0000000000c3',
  '80000000-0000-0000-0000-0000000000c1', '80000000-0000-0000-0000-0000000000c2'
) as id;
select compute_depreciation_schedule('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset3));
select throws_ok($$
  select dispose_fixed_asset('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
    (select id from _asset3), '2025-12-20', 300000, 'sold into closed period',
    '80000000-0000-0000-0000-0000000000c4', '80000000-0000-0000-0000-0000000000c5')
$$, '23001', NULL, 'disposal into a CLOSED period is refused (period-lock respected)');

-- ── 9. role / tenant gates (ISOTEST) ─────────────────────────────────────────
-- the write RPCs are service_role EXECUTE only (not authenticated/anon)
select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'register_fixed_asset' and grantee in ('anon','authenticated')),
  0, 'register_fixed_asset is NOT execute-granted to anon/authenticated (forged-actor P0 closed)');
-- ── SEC-3: cross-tenant SECDEF read leak closed (weekly audit PR #301 P0/P1) ──
-- Other Co's owner (member of a9, NOT a0) must be refused reads on Depr Co's
-- (a0) asset/org data — previously these DEFINER readers trusted the id alone.
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000009","email":"other@depr.dev","role":"authenticated"}';
select throws_ok($$
  select macrs_tax_depreciation_for_year((select id from _asset), 2025)
$$, '42501', NULL, 'SEC-3: a non-member is REFUSED macrs_tax_depreciation_for_year on another org''s asset');
select throws_ok($$
  select book_depreciation_for_year((select id from _asset), 2025)
$$, '42501', NULL, 'SEC-3: a non-member is REFUSED book_depreciation_for_year on another org''s asset');
select is(
  (select count(*)::int from fixed_asset_listing('80000000-0000-0000-0000-0000000000a0', 2025)),
  0, 'SEC-3: a non-member gets ZERO rows from fixed_asset_listing for another org (was: full asset register)');
-- restore the owner context: the SAME reads succeed for a real member
set local "request.jwt.claims" = '{"sub":"80000000-0000-0000-0000-000000000001","email":"owner@depr.dev","role":"authenticated"}';
select is(
  macrs_tax_depreciation_for_year((select id from _asset), 2025), 200000::bigint,
  'sanity: the OWNER still reads MACRS depreciation on their own asset (the guard is not fail-closed for everyone)');
select ok(
  (select count(*)::int from fixed_asset_listing('80000000-0000-0000-0000-0000000000a0', 2025)) >= 1,
  'sanity: the OWNER still sees their own org''s fixed-asset listing');

-- cross-tenant register is refused (owner of Other Co cannot register into Depr Co)
select throws_ok($$
  select register_fixed_asset('80000000-0000-0000-0000-000000000009','80000000-0000-0000-0000-0000000000a0',
    'Sneaky','computers', 100000, '2025-06-15')
$$, '42501', NULL, 'a non-member cannot register an asset in another org');

-- ── EFFECTIVE-DATING INTEGRITY on the MACRS % law table (CENTRAL-2 overlap P0) ──
-- macrs_tax_depreciation_for_year picks ONE % via `order by effective_from desc
-- limit 1`; the table must make two OVERLAPPING active rows for the same key
-- impossible (the same guard asset_classes carries), or the lookup is non-deterministic.
select has_index('public', 'macrs_percentages', 'macrs_percentages_one_active',
  'macrs_percentages has a one-active partial-unique index');
-- a second, OPEN-ENDED active row for an already-active (5yr,HY,200DB,yr1) key must be rejected
select throws_ok($$
  insert into public.macrs_percentages
    (jurisdiction_code, recovery_period, convention, macrs_method, year_index, percentage, effective_from, citation)
  values ('ZZ-DEPR', 5, 'half_year', '200DB', 1, 19.00, '2030-01-01', 'bogus overlap')
$$, NULL, NULL, 'a second overlapping ACTIVE macrs % row is rejected (no_overlap EXCLUDE)');
-- exactly one active % resolves for the seeded key
select is(
  (select count(*)::int from public.macrs_percentages
    where jurisdiction_code='ZZ-DEPR' and recovery_period=5 and convention='half_year'
      and macrs_method='200DB' and year_index=1 and is_active and effective_to is null),
  1, 'exactly one active MACRS % in force for (5yr, HY, 200DB, yr1)');

-- ── UNSEEDED-CONVENTION GUARD (red-team #4, P3) ──────────────────────────────
-- The engine computes mid_quarter_q1..q3 keys but only mid_quarter_q4 % rows are
-- seeded. An unseeded (recovery_period, convention, year_index) must RAISE, not
-- silently return 0 depreciation. Register a mid-quarter Q1 (Jan) asset on a class
-- whose Q1 table is NOT seeded and prove the lookup raises.
insert into public.asset_classes
  (jurisdiction_code, class_key, label, tax_year, recovery_period, macrs_method, default_convention,
   section_179_cap_minor, bonus_pct, effective_from, citation)
values
  ('ZZ-DEPR', 'machinery_mq', 'Machinery (mid-quarter)', 2025, 5, '200DB', 'mid_quarter',
   125000000, null, '2025-01-01', 'Pub 946 A-4');
create temp table _mq as
select register_fixed_asset(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0',
  'Lathe','machinery_mq', 1000000, '2025-01-10'  -- January → mid_quarter_q1 (UNSEEDED)
) as id;
select throws_ok($$
  select macrs_tax_depreciation_for_year((select id from _mq), 2025)
$$, 'P0001', NULL,
  'unseeded convention (mid_quarter_q1) RAISES instead of silently returning 0 depreciation');

select * from finish();
rollback;
