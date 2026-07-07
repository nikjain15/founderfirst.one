-- W1.3-B tax mapping engine gate. Proves the load-bearing guarantees:
--   1. schema present: tax_jurisdictions / tax_forms / tax_form_lines /
--      tax_mapping_rules / org_account_tax_map / tax_adjustments + ledger_accounts.tags.
--   2. EFFECTIVE-DATING (reuses CENTRAL-2's idiom): no two active tax_forms may
--      overlap in effect (EXCLUDE), and supersede_tax_form() + tax_form_in_force()
--      make old periods compute under old law, new under the superseding row.
--   3. RESOLUTION precedence (§B.2): CPA override > seed rule (by priority) >
--      UNMAPPED. An account with no rule stays UNMAPPED (never silently dropped).
--   4. EXTENSIBILITY: a SECOND jurisdiction/entity/form maps by seed rows alone,
--      zero code change (a ZZ-CATEST T2125-shaped fixture resolves).
--   5. M-1 draft/approve: draft_tax_adjustment inserts a PROPOSAL; only
--      approve_tax_adjustment (CPA-gated) makes it 'approved'; tax_m1_summary
--      counts approved only — a proposal never reaches the return.
--   6. ROLE GATES (ISOTEST): the p_actor-first write RPCs are EXECUTE-granted only
--      to service_role (not authenticated/anon); set_account_tax_line and
--      approve_tax_adjustment require CPA-role (can_edit_tax_map_as).
-- Runs in a transaction and rolls back.

begin;
select plan(40);

-- ── fixtures: jurisdiction, a form@2025, lines, rules, org, accounts ─────────
insert into auth.users (id, email, aud, role) values
  ('70000000-0000-0000-0000-000000000001', 'owner@tax.dev',  'authenticated', 'authenticated'),
  ('70000000-0000-0000-0000-000000000002', 'cpa@tax.dev',    'authenticated', 'authenticated'),
  ('70000000-0000-0000-0000-000000000009', 'outsider@tax.dev', 'authenticated', 'authenticated');

insert into public.entity_types (key, label, description, owner_draw_treatment)
  values ('sole_prop', 'Sole prop', 'x', 'equity_distribution')
  on conflict (key) do nothing;

insert into public.tax_jurisdictions (code, name, country_code, currency) values
  ('ZZ-TEST', 'US Federal', 'US', 'USD') on conflict (code) do nothing;

-- the form in force from 2025-01-01
insert into public.tax_forms (id, jurisdiction_code, form_code, entity_type, tax_year, name, effective_from, citation)
values ('70000000-0000-0000-0000-0000000000f1', 'ZZ-TEST', 'SCH_C', 'sole_prop', 2025,
        'Schedule C', '2025-01-01', 'https://irs.gov/schc');

insert into public.tax_form_lines (form_id, line_key, line_code, label, section, sort_order, kind, deductible_pct) values
  ('70000000-0000-0000-0000-0000000000f1', 'gross_receipts', '1',   'Gross receipts', 'income',     10, 'amount', null),
  ('70000000-0000-0000-0000-0000000000f1', 'advertising',    '8',   'Advertising',    'deductions', 80, 'amount', null),
  ('70000000-0000-0000-0000-0000000000f1', 'meals',          '24b', 'Meals',          'deductions', 245,'amount', 50),
  ('70000000-0000-0000-0000-0000000000f1', 'other_expenses', '27a', 'Other',          'deductions', 270,'amount', null);

insert into public.tax_mapping_rules (form_id, priority, match_kind, match_value, line_key) values
  ('70000000-0000-0000-0000-0000000000f1', 20, 'account_tag',          'meals',      'meals'),
  ('70000000-0000-0000-0000-0000000000f1', 30, 'account_name_pattern', '%advertis%', 'advertising'),
  ('70000000-0000-0000-0000-0000000000f1', 40, 'account_type',         'expense',    'other_expenses'),
  ('70000000-0000-0000-0000-0000000000f1', 40, 'account_type',         'income',     'gross_receipts');

insert into organizations (id, type, name, created_by) values
  ('70000000-0000-0000-0000-0000000000a0', 'business', 'Tax Co', '70000000-0000-0000-0000-000000000001');
-- owner membership (reads) + a CPA firm with an active FULL engagement (edits)
insert into memberships (org_id, user_id, role, status) values
  ('70000000-0000-0000-0000-0000000000a0', '70000000-0000-0000-0000-000000000001', 'owner', 'active');
insert into organizations (id, type, name, created_by) values
  ('70000000-0000-0000-0000-0000000000b0', 'firm', 'CPA Firm', '70000000-0000-0000-0000-000000000002');
insert into memberships (org_id, user_id, role, status) values
  ('70000000-0000-0000-0000-0000000000b0', '70000000-0000-0000-0000-000000000002', 'firm_admin', 'active');
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('70000000-0000-0000-0000-0000000000e0', '70000000-0000-0000-0000-0000000000b0',
   '70000000-0000-0000-0000-0000000000a0', 'active', 'full',
   '70000000-0000-0000-0000-000000000002');

insert into ledger_accounts (id, org_id, code, name, type, tags) values
  ('70000000-0000-0000-0000-0000000000c1', '70000000-0000-0000-0000-0000000000a0', '4000', 'Sales',        'income',  '{}'),
  ('70000000-0000-0000-0000-0000000000c2', '70000000-0000-0000-0000-0000000000a0', '6100', 'Google Advertising', 'expense', '{}'),
  ('70000000-0000-0000-0000-0000000000c3', '70000000-0000-0000-0000-0000000000a0', '6200', 'Client meals', 'expense', '{meals}'),
  ('70000000-0000-0000-0000-0000000000c4', '70000000-0000-0000-0000-0000000000a0', '6900', 'Misc',         'expense', '{}');

-- the SECDEF readers below (resolve_account_tax_lines / tax_unmapped_accounts /
-- tax_m1_summary) are gated on can_access_org(p_org_id) (SEC-3) — auth as the
-- owner (a member of Tax Co) so the positive-path assertions below still resolve.
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","email":"owner@tax.dev","role":"authenticated"}';

-- ── 1. schema present ────────────────────────────────────────────────────────
select has_table('public', 'tax_jurisdictions',   'tax_jurisdictions exists');
select has_table('public', 'tax_forms',           'tax_forms exists');
select has_table('public', 'tax_form_lines',      'tax_form_lines exists');
select has_table('public', 'tax_mapping_rules',   'tax_mapping_rules exists');
select has_table('public', 'org_account_tax_map', 'org_account_tax_map exists');
select has_table('public', 'tax_adjustments',     'tax_adjustments exists');
select has_column('public', 'ledger_accounts', 'tags', 'ledger_accounts.tags additive column exists');

-- ── 2. resolution precedence (§B.2) ──────────────────────────────────────────
-- meals account resolves via TAG rule (priority 20)
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c3'),
  'meals', 'tag rule (pri 20) maps the meals account');
-- advertising via NAME rule (priority 30)
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c2'),
  'advertising', 'name-pattern rule (pri 30) maps advertising');
-- Sales via TYPE fallback (priority 40, income)
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c1'),
  'gross_receipts', 'type-fallback (pri 40, income) maps Sales');
-- Misc expense via TYPE fallback (priority 40, expense) → other_expenses (Sch C catch-all)
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c4'),
  'other_expenses', 'type-fallback (pri 40, expense) maps Misc to other_expenses');

-- ── 3. UNMAPPED is first-class (never silently dropped, §B.0.4) ───────────────
-- an account of a type with no rule stays UNMAPPED. Add a bare equity account.
insert into ledger_accounts (id, org_id, code, name, type) values
  ('70000000-0000-0000-0000-0000000000c5', '70000000-0000-0000-0000-0000000000a0', '3000', 'Owner Draw', 'equity');
select is(
  (select resolved_by from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c5'),
  'unmapped', 'an account with no matching rule stays UNMAPPED (not dropped)');
select is(
  (select count(*)::int from tax_unmapped_accounts('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)),
  1, 'the unmapped preflight surfaces exactly the one unmapped account (package gate)');

-- ── 4. CPA override wins over seed rule (§B.2.1) ─────────────────────────────
-- CPA remaps the Misc account from other_expenses to advertising.
select lives_ok($$
  select set_account_tax_line('70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-0000000000a0', '70000000-0000-0000-0000-0000000000c4',
    'SCH_C', 'advertising', null, 'CPA reclass');
$$, 'CPA (firm member, full engagement) may set an override');
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c4'),
  'advertising', 'CPA override wins over the seed type-fallback rule');
select is(
  (select resolved_by from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c4'),
  'override', 'resolution reports resolved_by=override for explainability');
-- audit-logged
select ok(
  exists (select 1 from ledger_audit where action = 'tax.map_line'
          and org_id = '70000000-0000-0000-0000-0000000000a0'),
  'the mapping edit is audit-logged (tax.map_line)');

-- ── 5. role gate: an OWNER cannot edit (owners view; CPAs edit — §decision 3) ──
select throws_ok($$
  select set_account_tax_line('70000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-0000000000a0', '70000000-0000-0000-0000-0000000000c4',
    'SCH_C', 'meals', null, 'owner tries');
$$, '42501', NULL, 'an owner (no engagement) is BLOCKED from editing mappings');

-- ── 5b. INTEGRITY: an override may NOT point at a line the form doesn't define ─
-- (research §B) A bad line_key would make resolve_account_tax_lines report the
-- account as 'override'/mapped while mapReturn() finds no such line and drops it
-- into UNMAPPED — the two sources of truth disagree (OBTEST silent-drop class).
select throws_ok($$
  select set_account_tax_line('70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-0000000000a0', '70000000-0000-0000-0000-0000000000c4',
    'SCH_C', 'not_a_real_line', null, 'typo / cross-form line');
$$, '23514', NULL, 'override at a non-existent line_key is REJECTED (integrity)');
-- and the good override from step 4 is untouched (still advertising)
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c4'),
  'advertising', 'a rejected bad override leaves the prior valid mapping intact');

-- ── 6. effective-dating: supersede + old/new law (§B.0.2, CENTRAL-2 idiom) ────
-- supersede the 2025 Sch C mid-year (meals % change scenario). New row from 2025-07-01.
select lives_ok($$
  select supersede_tax_form('ZZ-TEST','SCH_C','sole_prop',2025, date '2025-07-01',
    'Schedule C (rev)', '{}'::jsonb, 'https://irs.gov/schc-rev');
$$, 'supersede_tax_form closes the old row and opens a new one atomically');
select is(
  (select count(*)::int from tax_forms where jurisdiction_code='ZZ-TEST' and form_code='SCH_C'
     and tax_year=2025 and effective_to is null and is_active),
  1, 'exactly ONE active (open) form row after supersede (one-active invariant)');
-- old period resolves the ORIGINAL row; new period the superseding one
select is(
  (select name from tax_form_in_force('ZZ-TEST','SCH_C',2025, date '2025-03-01')),
  'Schedule C', 'as-of a March date returns the ORIGINAL form (old law)');
select is(
  (select name from tax_form_in_force('ZZ-TEST','SCH_C',2025, date '2025-09-01')),
  'Schedule C (rev)', 'as-of a September date returns the SUPERSEDING form (new law)');
-- the no-overlap EXCLUDE + one-active partial-unique make an overlapping active
-- window impossible. Either guard may fire first (unique 23505 or exclusion 23P01);
-- both mean "rejected". throws_ok with NULL sqlstate asserts it raises at all.
select throws_ok($$
  insert into tax_forms (jurisdiction_code, form_code, entity_type, tax_year, name, effective_from, citation)
  values ('ZZ-TEST','SCH_C','sole_prop',2025,'dup','2025-08-01','x');
$$, NULL, 'an overlapping active form window is rejected (EXCLUDE / one-active guard)');

-- ── 7. M-1 draft → approve (§B.0.5): proposal never auto-files ────────────────
select lives_ok($$
  select draft_tax_adjustment('70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-0000000000a0', 2025, 'expense_on_books_not_return',
    50000, 'permanent', 'meals', 'meals 50% disallowed', 'deductibility_meals', 'meals:2025', 'penny_proposed');
$$, 'Penny drafts an M-1 adjustment (status proposed)');
select is(
  (select status from tax_adjustments where org_id='70000000-0000-0000-0000-0000000000a0' and origin_ref='meals:2025'),
  'proposed', 'the draft is PROPOSED — not applied to the return');
-- proposals do not appear in the M-1 summary
select is(
  (select count(*)::int from tax_m1_summary('70000000-0000-0000-0000-0000000000a0', 2025)),
  0, 'a PROPOSED adjustment does NOT reach the M-1 summary (only approved counts)');
-- idempotent re-draft updates in place, no duplicate
select lives_ok($$
  select draft_tax_adjustment('70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-0000000000a0', 2025, 'expense_on_books_not_return',
    60000, 'permanent', 'meals', 'updated', 'deductibility_meals', 'meals:2025', 'penny_proposed');
$$, 're-drafting the same origin_ref updates the pending proposal');
select is(
  (select count(*)::int from tax_adjustments where org_id='70000000-0000-0000-0000-0000000000a0' and origin_ref='meals:2025'),
  1, 'the idempotent re-draft did NOT create a duplicate proposal');
-- a human (CPA) approves → now it counts
select lives_ok($$
  select approve_tax_adjustment('70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-0000000000a0',
    (select id from tax_adjustments where org_id='70000000-0000-0000-0000-0000000000a0' and origin_ref='meals:2025'),
    true);
$$, 'a CPA approves the drafted adjustment (the human gate)');
select is(
  (select total_minor from tax_m1_summary('70000000-0000-0000-0000-0000000000a0', 2025)
    where m1_bucket='expense_on_books_not_return'),
  60000::bigint, 'the APPROVED adjustment now reaches the M-1 summary');

-- ── 8. ISOTEST: write RPCs are service_role-only (no forged-actor) ───────────
select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'set_account_tax_line' and grantee in ('authenticated','anon')),
  0, 'set_account_tax_line is NOT granted to authenticated/anon (forged-actor P0 closed)');
select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'approve_tax_adjustment' and grantee in ('authenticated','anon')),
  0, 'approve_tax_adjustment is NOT granted to authenticated/anon');

-- ── 9. EXTENSIBILITY: a SECOND jurisdiction/entity maps by SEED ROWS alone ────
-- Prove the research §B.8 claim: a Canada T2125 sole-prop resolves with ZERO
-- engine-code change — just a jurisdiction row + a form + lines + rules (the same
-- tables). The SAME resolve_account_tax_lines() handles it.
insert into public.entity_types (key, label, description, owner_draw_treatment)
  values ('sole_prop', 'Sole prop', 'x', 'equity_distribution') on conflict (key) do nothing;
insert into public.tax_jurisdictions (code, name, country_code, currency) values
  ('ZZ-CATEST', 'Canada CRA', 'CA', 'CAD') on conflict (code) do nothing;
insert into public.tax_forms (id, jurisdiction_code, form_code, entity_type, tax_year, name, effective_from, citation)
  values ('70000000-0000-0000-0000-0000000000f2', 'ZZ-CATEST', 'T2125', 'sole_prop', 2025, 'T2125', '2025-01-01', 'https://cra/t2125');
insert into public.tax_form_lines (form_id, line_key, line_code, label, section, sort_order, kind, deductible_pct) values
  ('70000000-0000-0000-0000-0000000000f2', 'meals',          '8523', 'Meals',    'deductions', 51, 'amount', 50),
  ('70000000-0000-0000-0000-0000000000f2', 'other_expenses', '9270', 'Other',    'deductions', 69, 'amount', null),
  ('70000000-0000-0000-0000-0000000000f2', 'gross_sales',    '8000', 'Gross',    'income',     10, 'amount', null);
insert into public.tax_mapping_rules (form_id, priority, match_kind, match_value, line_key) values
  ('70000000-0000-0000-0000-0000000000f2', 20, 'account_tag',  'meals',   'meals'),
  ('70000000-0000-0000-0000-0000000000f2', 40, 'account_type', 'expense', 'other_expenses'),
  ('70000000-0000-0000-0000-0000000000f2', 40, 'account_type', 'income',  'gross_sales');
-- the SAME resolver maps the org's accounts against the Canadian form — no code change.
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-CATEST','T2125',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c3'),
  'meals', 'a SECOND jurisdiction (ZZ-CATEST T2125) maps by seed rows alone — zero code change (§B.8)');
select is(
  (select line_key from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-CATEST','T2125',2025)
    where account_id = '70000000-0000-0000-0000-0000000000c1'),
  'gross_sales', 'the Canadian income fallback resolves through the same engine');

-- ── 10. SEC-3: cross-tenant SECDEF read leak closed (weekly audit PR #301 P0) ──
-- An outsider (no membership/engagement on Tax Co) must get ZERO rows from every
-- DEFINER reader keyed by a caller-supplied p_org_id — not another org's tax data.
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000009","email":"outsider@tax.dev","role":"authenticated"}';
select is(
  (select count(*)::int from resolve_account_tax_lines('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)),
  0, 'SEC-3: an outsider gets ZERO rows from resolve_account_tax_lines for another org (was: full chart of accounts)');
select is(
  (select count(*)::int from tax_unmapped_accounts('70000000-0000-0000-0000-0000000000a0','ZZ-TEST','SCH_C',2025)),
  0, 'SEC-3: an outsider gets ZERO rows from tax_unmapped_accounts for another org');
select is(
  (select count(*)::int from tax_m1_summary('70000000-0000-0000-0000-0000000000a0', 2025)),
  0, 'SEC-3: an outsider gets ZERO rows from tax_m1_summary for another org (was: approved M-1 totals)');
-- restore the owner context so nothing after this point is affected
set local "request.jwt.claims" = '{"sub":"70000000-0000-0000-0000-000000000001","email":"owner@tax.dev","role":"authenticated"}';
select is(
  (select count(*)::int from tax_m1_summary('70000000-0000-0000-0000-0000000000a0', 2025)),
  1, 'sanity: the OWNER still sees the approved M-1 summary row (the guard is not fail-closed for everyone)');

select finish();
rollback;
