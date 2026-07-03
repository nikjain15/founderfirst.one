-- =============================================================================
-- W2.4 · Quarterly estimated-tax assistant — the grounded read RPC.
--
-- The estimate is computed in the app (apps/app/src/ledger/estimatedTax.ts) from
-- the org's REAL ledger P&L (the same paginated entries the Reports tab renders —
-- ties to the cent), so the math is unit-testable without a DB. What the DB owns is
-- the DATA the calc is grounded on, and NONE of it is hardcoded:
--
--   • Tax RATE PARAMS live in tax_jurisdictions.params, YEAR-KEYED — the designed
--     home for jurisdiction-scoped rate params. They are SEED DATA
--     (supabase/seeds/tax/jurisdictions.json → seed-tax.ts → seed.sql), LAW-DERIVED
--     and cited; a rate change / new year is a seed edit, never an app constant.
--   • Quarterly DEADLINES live in filing_obligations as q1..q4_estimate rows
--     (CENTRAL-2 kernel seed) and are read via upcoming_filing_deadlines()
--     (kind='estimate'). This card's seed adds the estimate calendar for the
--     s_corp / partnership / c_corp entities (supabase/seeds/kernel/*).
--
-- This migration adds ONLY the schema object: estimated_tax_basis(org, tax_year) —
-- the ONE grounded reader the app calls to get an org's entity + jurisdiction +
-- the resolved year's rate params. The app never reads a rate literal; it reads
-- this. Change a params seed row → the estimate changes with no redeploy (tested).
-- =============================================================================

create or replace function public.estimated_tax_basis(
  p_org_id   uuid,
  p_tax_year int default extract(year from current_date)::int
) returns table (
  entity_type       text,
  jurisdiction_code text,
  currency          char(3),
  params            jsonb
)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_year_key text := p_tax_year::text;
begin
  -- Pure read, but gated: the caller must be able to see the org (RLS parity).
  if not can_access_org(p_org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with prof as (
    select s.entity_type, s.jurisdiction_code
      from org_accounting_settings s
     where s.org_id = p_org_id
  ),
  -- Federal is the base; a state jurisdiction folds its year block under "state".
  fed as (
    select coalesce(j.params -> v_year_key, '{}'::jsonb) as p, j.currency
      from tax_jurisdictions j
     where j.code = 'US-FED'
  ),
  juris as (
    select p.jurisdiction_code, j.currency,
           coalesce(j.params -> v_year_key, '{}'::jsonb) as state_p
      from prof p
      left join tax_jurisdictions j on j.code = p.jurisdiction_code
  )
  select
    prof.entity_type,
    coalesce(prof.jurisdiction_code, 'US-FED') as jurisdiction_code,
    coalesce(juris.currency, fed.currency)     as currency,
    case
      when prof.jurisdiction_code is null or prof.jurisdiction_code = 'US-FED'
        then fed.p
      else fed.p || jsonb_build_object('state', juris.state_p)
    end as params
  from prof
  cross join fed
  left join juris on true;
end;
$$;

grant execute on function public.estimated_tax_basis(uuid, int) to authenticated, service_role;

comment on function public.estimated_tax_basis is
  'W2.4: the ONLY sanctioned way the app reads estimated-tax rate params for an org. Returns the org entity_type + jurisdiction_code (RLS via can_access_org) and the year-keyed rate params from tax_jurisdictions.params (federal, with the state block folded in under a "state" key). Rates are LAW-DERIVED seed data (cited, year-keyed) — never hardcode a rate in app code. Change a params seed row → the estimate changes with no redeploy.';
