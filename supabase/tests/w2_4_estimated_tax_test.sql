-- W2.4 estimated-tax data + grounded-reader gate. Proves:
--   1. Rate params live in tax_jurisdictions.params (year-keyed) — seeded, cited.
--   2. estimated_tax_basis(org, year) returns the org's entity + jurisdiction +
--      the resolved year params (federal, state folded in) — the ONE grounded
--      reader the app calls; RLS-gated by can_access_org.
--   3. A non-member is FORBIDDEN (can't read another org's basis).
--   4. Rates are DATA: changing a params row changes the RPC output — no redeploy.
--   5. The filing calendar covers the estimating entities (q1..q4_estimate rows
--      exist for s_corp / partnership / c_corp, added by this card).
-- Everything runs in a transaction and rolls back.

begin;
select plan(12);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000e4001', 'owner@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e4002', 'nobody@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000e40b1', 'business', 'Fed Co', '00000000-0000-0000-0000-0000000e4001'),
  ('00000000-0000-0000-0000-0000000e40b2', 'business', 'Cal Co', '00000000-0000-0000-0000-0000000e4001');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e40b1', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000e4001', '00000000-0000-0000-0000-0000000e40b2', 'owner', 'active');

-- Fed Co is a sole-prop in the federal jurisdiction; Cal Co is a sole-prop in CA.
insert into org_accounting_settings (org_id, home_currency, entity_type, jurisdiction_code) values
  ('00000000-0000-0000-0000-0000000e40b1', 'USD', 'sole_prop', 'US-FED'),
  ('00000000-0000-0000-0000-0000000e40b2', 'USD', 'sole_prop', 'US-CA');

-- ── 1. params seeded on tax_jurisdictions (year-keyed, cited) ─────────────────
select ok(
  (select params -> '2025' -> 'self_employment' ->> 'rate' from tax_jurisdictions where code = 'US-FED') is not null,
  'US-FED carries a 2025 self-employment rate param (year-keyed)');
select ok(
  (select params -> '2025' ->> 'citation' from tax_jurisdictions where code = 'US-FED') like 'https://%',
  'the 2025 federal param block is cited (law-derived)');
select is(
  (select params -> '2025' -> 'income_tax' ->> 'effective_rate' from tax_jurisdictions where code = 'US-CA'),
  '0.06',
  'US-CA carries its own 2025 state income-tax rate param');

-- ── 2. estimated_tax_basis returns the grounded profile + params ──────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000e4001","role":"authenticated"}';

select is(
  (select entity_type from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b1', 2025)),
  'sole_prop',
  'basis returns the org entity type from org_accounting_settings');
select is(
  (select jurisdiction_code from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b1', 2025)),
  'US-FED',
  'basis returns the org jurisdiction');
select ok(
  (select (params -> 'self_employment' ->> 'rate') is not null
     from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b1', 2025)),
  'basis resolves the federal year params for the app (no rate literal in TS)');

-- CA org: the state block is folded under "state" on top of federal.
select ok(
  (select (params -> 'state' -> 'income_tax' ->> 'effective_rate') = '0.06'
     from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b2', 2025)),
  'a state jurisdiction folds its params under a "state" key on top of federal');
select ok(
  (select (params -> 'self_employment' ->> 'rate') is not null
     from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b2', 2025)),
  'the CA org still gets the federal base params (federal + state)');
reset role;

-- ── 3. a non-member is forbidden ─────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000e4002","role":"authenticated"}';
select throws_ok(
  $$ select * from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b1', 2025) $$,
  '42501',
  'forbidden',
  'a non-member cannot read another org''s estimated-tax basis (RLS via can_access_org)');
reset role;

-- ── 4. rates are DATA: change a params row → the RPC output changes ───────────
update tax_jurisdictions
   set params = jsonb_set(params, '{2025,income_tax,effective_rate}', '0.35'::jsonb)
 where code = 'US-FED';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000e4001","role":"authenticated"}';
select is(
  (select params -> 'income_tax' ->> 'effective_rate'
     from estimated_tax_basis('00000000-0000-0000-0000-0000000e40b1', 2025)),
  '0.35',
  'changing a params row changes the basis the app reads — no redeploy (rates are data)');
reset role;

-- ── 5. filing calendar covers the estimating entities (this card's seed) ──────
select ok(
  (select count(*) = 4
     from filing_obligations
    where jurisdiction_code = 'US-FED' and entity_type = 's_corp' and tax_year = 2025
      and obligation_key in ('q1_estimate','q2_estimate','q3_estimate','q4_estimate')),
  's_corp has all four quarterly-estimate rows (W2.4 seed)');
select ok(
  (select count(*) = 4
     from filing_obligations
    where jurisdiction_code = 'US-FED' and entity_type = 'c_corp' and tax_year = 2025
      and obligation_key in ('q1_estimate','q2_estimate','q3_estimate','q4_estimate')),
  'c_corp has all four quarterly-estimate rows (W2.4 seed)');

select * from finish();
rollback;
