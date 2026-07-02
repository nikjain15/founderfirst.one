-- CENTRAL-2 — wire ONE real consumer of the filing calendar (acceptance:
-- "filing_obligations drives at least one real consumer").
--
-- (1) Org tax profile columns on org_accounting_settings — the home the tax
--     research doc names ("entity_type, jurisdiction_code, industry"). Additive,
--     nullable, defaulted; the onboarding card (W3.x) will populate them, but the
--     kernel consumer is real today for any org that has them set. entity_type
--     FK-references the kernel so an org can't claim a structure the kernel
--     doesn't know.
--
-- (2) upcoming_filing_deadlines(org_id, as_of, horizon_days) — the consumer.
--     Joins the org's (jurisdiction, entity) to filing_obligations_for() (which
--     already honors effective-dating), resolves each obligation's real calendar
--     due date from due_month/due_day/due_year_offset, and returns everything due
--     within the horizon. This is exactly the input a "Coming up" card or an email
--     nudge needs — and it reads a DEADLINE FROM THE KERNEL, never a literal
--     (Roadmap 3c). Change a due date in a seed row → every reminder moves.

alter table public.org_accounting_settings
  add column if not exists entity_type       text references public.entity_types(key),
  add column if not exists jurisdiction_code  text not null default 'US-FED',
  add column if not exists industry_key        text references public.industries(key);

-- Resolve an obligation's actual calendar date for a tax year.
-- due_year_offset: 0 = within the tax year, 1 = following year, 2 = two years out
-- (e.g. a Q4 estimate due the following January when the return year rolls).
create or replace function public.filing_obligation_due_date(
  p_tax_year int, p_due_month int, p_due_day int, p_due_year_offset int
) returns date
  language sql immutable
as $$
  select make_date(p_tax_year + p_due_year_offset, p_due_month, p_due_day);
$$;

create or replace function public.upcoming_filing_deadlines(
  p_org_id       uuid,
  p_as_of        date default current_date,
  p_horizon_days int  default 60
) returns table (
  obligation_key text,
  kind           text,
  form_code      text,
  label          text,
  due_date       date,
  days_until     int,
  citation       text
)
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  with prof as (
    select s.jurisdiction_code, s.entity_type
      from org_accounting_settings s
     where s.org_id = p_org_id
       and s.entity_type is not null
  ),
  -- tax years whose obligations could fall inside the window: the current year
  -- and the prior year (whose returns are due the following spring).
  yrs as (
    select generate_series(extract(year from p_as_of)::int - 1,
                           extract(year from p_as_of)::int) as ty
  ),
  obs as (
    select o.*
      from prof p
      cross join yrs
      cross join lateral filing_obligations_for(p.jurisdiction_code, p.entity_type, yrs.ty, p_as_of) o
  )
  select
    o.obligation_key,
    o.kind,
    o.form_code,
    o.label,
    filing_obligation_due_date(o.tax_year, o.due_month, o.due_day, o.due_year_offset) as due_date,
    (filing_obligation_due_date(o.tax_year, o.due_month, o.due_day, o.due_year_offset) - p_as_of) as days_until,
    o.citation
  from obs o
  where filing_obligation_due_date(o.tax_year, o.due_month, o.due_day, o.due_year_offset) >= p_as_of
    and filing_obligation_due_date(o.tax_year, o.due_month, o.due_day, o.due_year_offset) <= p_as_of + p_horizon_days
  order by due_date;
$$;

grant execute on function public.upcoming_filing_deadlines(uuid, date, int) to authenticated, service_role;
grant execute on function public.filing_obligation_due_date(int,int,int,int) to authenticated, anon, service_role;

comment on function public.upcoming_filing_deadlines is
  'CENTRAL-2 consumer: filing deadlines due within a horizon for an org, resolved from filing_obligations via the kernel (effective-dated). Feeds "Coming up" cards + email nudges. Deadlines are never hardcoded — change a seed row and every reminder moves (Roadmap 3c).';
