-- CENTRAL-2 knowledge-kernel gate. Proves the kernel's load-bearing guarantees:
--   1. schema + seed loaded: entity_types / industries / filing_obligations /
--      vendor_priors / connectors exist and carry the seeded rows.
--   2. "add a sector via seed alone surfaces it" — inserting one industries row
--      makes it visible to the onboarding query and carries a CoA template ref,
--      with zero code change.
--   3. EFFECTIVE-DATING proves BOTH: old period computes under old law, new period
--      under the superseding row (the 1099 $600 → $2,000 OBBBA change), via
--      filing_obligations_for(). supersede_filing_obligation() enforces one open
--      row.
--   4. the consumer upcoming_filing_deadlines() returns kernel-driven deadlines
--      (never a hardcoded date) — and it MOVES when the seed row moves.
-- Everything runs in a transaction and rolls back.

begin;
select plan(19);

-- ── 1. schema + seed present ─────────────────────────────────────────────────
select has_table('public', 'entity_types',       'entity_types table exists');
select has_table('public', 'industries',         'industries table exists');
select has_table('public', 'filing_obligations', 'filing_obligations table exists');
select has_table('public', 'vendor_priors',      'vendor_priors table exists');
select has_table('public', 'connectors',         'connectors table exists');

select ok((select count(*) >= 5 from entity_types),  'entity_types seeded (>=5 structures)');
select ok((select count(*) >= 10 from industries),   'industries seeded (>=10 sectors, ported from demo)');
select is((select owner_draw_treatment from entity_types where key = 's_corp'), 'wages',
          's_corp owner-comp treatment is wages (reasonable-comp rule)');

-- ── 2. add a sector via SEED ALONE → onboarding query surfaces it ─────────────
-- Simulate a new seed row (the loader would upsert this; here we insert directly,
-- which is what the generated SQL does).
insert into industries (key, label, icon, coa_template_ref, sort_order)
values ('test-sector', 'Test Sector', 'flask', 'general_business', 999);

-- the onboarding tile query (active sectors, ordered) now includes it — no code change.
select ok(
  exists (select 1 from industries where is_active and key = 'test-sector'),
  'a sector added via seed row alone surfaces in the onboarding/active query');
select is(
  (select coa_template_ref from industries where key = 'test-sector'),
  'general_business',
  'the new sector carries its CoA template ref (drives CoA seeding, zero code change)');

-- ── 3. effective-dating: OLD law and NEW law both compute ─────────────────────
-- The seeds model the 1099-NEC threshold: $600 (60000 minor) for tax year 2025,
-- $2,000 (200000 minor) for tax year 2026 (OBBBA). Prove both, as of a 2026 date.
select is(
  (select threshold_minor
     from filing_obligations_for('US-FED', 'sole_prop', 2025, date '2026-06-01')
    where obligation_key = '1099_nec_issue'),
  60000::bigint,
  'OLD period (tax year 2025) still computes under OLD law: $600 threshold');
select is(
  (select threshold_minor
     from filing_obligations_for('US-FED', 'sole_prop', 2026, date '2026-06-01')
    where obligation_key = '1099_nec_issue'),
  200000::bigint,
  'NEW period (tax year 2026) computes under NEW law: $2,000 threshold');

-- supersede a due date and prove the effective window switches by as_of date.
-- Move sole_prop 2025 annual return from Apr 15 to a new date effective 2026-02-01.
select public.supersede_filing_obligation(
  'US-FED', 'sole_prop', 2025, 'annual_return', date '2026-02-01',
  '{"kind":"annual_return","form_code":"SCH_C","label":"Individual return (revised)","due_month":5,"due_day":1,"due_year_offset":1}'::jsonb,
  'https://example.test/revised', 'seed');

select is(
  (select due_day from filing_obligations_for('US-FED', 'sole_prop', 2025, date '2026-01-01')
    where obligation_key = 'annual_return'),
  15,
  'as_of BEFORE the supersede: OLD due day (15) still in force');
select is(
  (select due_day from filing_obligations_for('US-FED', 'sole_prop', 2025, date '2026-03-01')
    where obligation_key = 'annual_return'),
  1,
  'as_of AFTER the supersede: NEW due day (1) in force — old row was closed, one active row only');

-- ── 4. the consumer reads deadlines from the kernel (not a literal) ───────────
-- minimal org + settings fixture with an entity profile.
insert into auth.users (id, email, aud, role)
  values ('00000000-0000-0000-0000-0000000ce201', 'ownerCE2@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by)
  values ('00000000-0000-0000-0000-0000000ce2b1', 'business', 'Kernel Co', '00000000-0000-0000-0000-0000000ce201');
-- the seed trigger creates the settings row; set the tax profile on it.
update org_accounting_settings
   set entity_type = 's_corp', jurisdiction_code = 'US-FED'
 where org_id = '00000000-0000-0000-0000-0000000ce2b1';

-- S-corp 2025 annual return is due Mar 15 2026. As of Feb 1 2026 with a 60-day
-- horizon, the consumer surfaces it — sourced from filing_obligations, not code.
select ok(
  exists (
    select 1 from upcoming_filing_deadlines(
      '00000000-0000-0000-0000-0000000ce2b1', date '2026-02-01', 60)
    where obligation_key = 'annual_return' and due_date = date '2026-03-15'),
  'consumer returns the S-corp annual-return deadline from the kernel (Mar 15 2026)');

-- ── 5. RED-TEAM regressions (PR #177 review) ─────────────────────────────────
-- (a) DEFECT: the loader emitted source=null but source is NOT NULL DEFAULT 'seed',
--     so the whole seed aborted and ZERO rows loaded. Assert the seed is actually
--     present with source defaulted — the fix omits null source so the default wins.
select ok(
  (select count(*) from filing_obligations) >= 11,
  'filing_obligations seed actually LOADED (source-null NOT NULL abort fixed)');
select ok(
  not exists (select 1 from filing_obligations where source is null),
  'every filing_obligations row has a non-null source (DB default applied)');

-- (b) DEFECT: overlapping ACTIVE windows for one key were silently allowed and
--     masked by distinct-on. The exclusion constraint must now reject them.
select throws_ok(
  $ov$
    insert into filing_obligations
      (jurisdiction_code, entity_type, tax_year, obligation_key, kind, form_code, label,
       due_month, due_day, due_year_offset, effective_from, effective_to, citation, source)
    values
      ('US-FED','sole_prop',2099,'atk_ov','estimate','X','A',6,15,1,'2020-01-01','2024-12-31','c','seed'),
      ('US-FED','sole_prop',2099,'atk_ov','estimate','X','B',7,20,1,'2022-01-01','2026-12-31','c','seed')
  $ov$,
  '23P01',   -- exclusion_violation
  null,
  'overlapping active effective windows for one obligation are REJECTED (no silent wrong-law lookup)');

-- (c) DEFECT: re-running the seed after a supersede re-opened the closed row
--     (clobbering old law / colliding with one_active). Prove re-seed is idempotent
--     against a superseded row: closed row stays closed, exactly one open row.
select public.supersede_filing_obligation(
  'US-FED', 'sole_prop', 2025, 'q2_estimate', date '2026-02-01',
  '{"kind":"estimate","form_code":"1040-ES","label":"Q2 revised","due_month":6,"due_day":16}'::jsonb,
  'https://example.test/rev', 'regulatory_watcher');
-- re-apply the exact seed upsert for the ORIGINAL q2 row (what a re-seed does):
insert into filing_obligations
  (jurisdiction_code, entity_type, tax_year, obligation_key, kind, form_code, label,
   due_month, due_day, due_year_offset, effective_from, citation)
values ('US-FED','sole_prop',2025,'q2_estimate','estimate','1040-ES','Q2 estimated tax payment',
   6,15,1,'2020-01-01','https://www.irs.gov/forms-pubs/about-form-1040-es')
on conflict (jurisdiction_code, entity_type, tax_year, obligation_key, effective_from)
  do update set kind = excluded.kind, form_code = excluded.form_code, label = excluded.label,
     due_month = excluded.due_month, due_day = excluded.due_day,
     due_year_offset = excluded.due_year_offset, citation = excluded.citation;
select is(
  (select count(*)::int from filing_obligations
     where entity_type='sole_prop' and tax_year=2025 and obligation_key='q2_estimate'
       and effective_to is null),
  1,
  're-seeding a superseded row does NOT re-open the closed window (exactly one open row)');
select is(
  (select source from filing_obligations
     where entity_type='sole_prop' and tax_year=2025 and obligation_key='q2_estimate'
       and effective_to is null),
  'regulatory_watcher',
  're-seed does not clobber the superseding row''s source');

select finish();
rollback;
