-- SEC-3 — close the cross-tenant SECURITY DEFINER read leak found by the weekly
-- audit (PR #301, LEARNINGS Rule 25 pattern, 2nd occurrence after the W3 F1
-- `owner_asks_this_week` leak). Four DEFINER read RPCs took a caller-supplied
-- org id / asset id and filtered ONLY on that id — no `can_access_org` membership
-- check. DEFINER runs as the function owner and BYPASSES the base table's RLS, so
-- any authenticated user could pass another tenant's id and read its data:
--   · resolve_account_tax_lines / tax_unmapped_accounts (P0) — any org's chart of
--     accounts + CPA tax-line overrides.
--   · tax_m1_summary (P0) — any org's approved M-1 tax-adjustment totals.
--   · fixed_asset_listing (P0) — any org's fixed-asset register + depreciation,
--     despite fixed_assets itself being RLS-protected (the DEFINER reader bypasses it).
--   · macrs_tax_depreciation_for_year / book_depreciation_for_year (P1) — keyed on
--     an opaque p_asset_id with no org filter/guard at all.
--
-- FIX PATTERN (already used by bill_ap_aging / ninetynine_nec_summary /
-- estimated_tax_basis — this closes the gap, doesn't invent a new pattern):
-- `language sql` readers add `and can_access_org(p_org_id)` to their filtering
-- predicate (unauthorized caller gets zero rows, not an error — matches the
-- existing sibling readers); `language plpgsql` readers RAISE on failure.
-- tax_unmapped_accounts is fixed transitively (it joins resolve_account_tax_lines,
-- which now returns nothing for an unauthorized org) plus its own guard for
-- defense-in-depth. Additive, idempotent (create or replace), no data change.

-- ── resolve_account_tax_lines — gate the base account set by org membership ───
create or replace function public.resolve_account_tax_lines(
  p_org_id            uuid,
  p_jurisdiction_code text,
  p_form_code         text,
  p_tax_year          int,
  p_as_of             date default current_date
) returns table (
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  line_key     text,
  resolved_by  text,      -- 'override' | 'rule' | 'unmapped'
  match_detail text       -- explainability: which override/rule matched
)
  language sql stable security definer set search_path = public as $$
  with frm as (
    select id from public.tax_form_in_force(p_jurisdiction_code, p_form_code, p_tax_year, p_as_of)
  ),
  acct as (
    select a.id, a.code, a.name, a.type::text as type, a.tags
      from public.ledger_accounts a
     where a.org_id = p_org_id and not a.is_archived
       and can_access_org(p_org_id)
  ),
  -- 1. CPA override (research §B.2.1): keyed by form_code + line_key, effective by
  -- year. An override applies if tax_year_from is null (all years) or <= the year.
  -- The MOST-SPECIFIC applicable override wins per account: a year-specific row
  -- (higher tax_year_from) beats the all-years row (null, sorted last).
  ovr1 as (
    select distinct on (o.account_id)
           o.account_id, o.line_key,
           'set by CPA' || coalesce(' on ' || o.created_at::date::text, '') as detail
      from public.org_account_tax_map o
     where o.org_id = p_org_id
       and o.form_code = p_form_code
       and (o.tax_year_from is null or o.tax_year_from <= p_tax_year)
     order by o.account_id, o.tax_year_from desc nulls last
  ),
  -- 2. lowest-priority matching seed rule (research §B.2.2).
  ruled as (
    select a.id as account_id,
           (select r.line_key
              from public.tax_mapping_rules r
              join frm on r.form_id = frm.id
             where (
                 (r.match_kind = 'account_code_range'
                    and a.code is not null
                    and split_part(r.match_value,'-',1) <= a.code
                    and a.code <= split_part(r.match_value,'-',2))
              or (r.match_kind = 'account_tag'          and r.match_value = any(a.tags))
              or (r.match_kind = 'account_name_pattern' and a.name ilike r.match_value)
              or (r.match_kind = 'account_type'         and r.match_value = a.type)
             )
             order by r.priority asc, r.id asc
             limit 1) as line_key,
           (select 'matched seed rule: ' || r.match_kind || ' ~ ' || r.match_value
              from public.tax_mapping_rules r
              join frm on r.form_id = frm.id
             where (
                 (r.match_kind = 'account_code_range'
                    and a.code is not null
                    and split_part(r.match_value,'-',1) <= a.code
                    and a.code <= split_part(r.match_value,'-',2))
              or (r.match_kind = 'account_tag'          and r.match_value = any(a.tags))
              or (r.match_kind = 'account_name_pattern' and a.name ilike r.match_value)
              or (r.match_kind = 'account_type'         and r.match_value = a.type)
             )
             order by r.priority asc, r.id asc
             limit 1) as detail
      from acct a
  )
  select a.id, a.code, a.name, a.type,
         coalesce(o.line_key, ru.line_key)                                    as line_key,
         case when o.line_key is not null then 'override'
              when ru.line_key is not null then 'rule'
              else 'unmapped' end                                             as resolved_by,
         coalesce(o.detail, ru.detail, 'no matching rule — needs a CPA mapping') as match_detail
    from acct a
    left join ovr1 o  on o.account_id = a.id
    left join ruled ru on ru.account_id = a.id
   order by a.type, a.code nulls last;
$$;
comment on function public.resolve_account_tax_lines is
  'Research §B.2 resolution: per account -> tax line, CPA override wins, else lowest-priority seed rule, else UNMAPPED. Returns resolved_by + match_detail for explainability (Signals #5). The mapping computation (per-line amounts) tallies these against the trial balance. SEC-3: gated on can_access_org(p_org_id) — a non-member gets zero rows.';

-- ── tax_unmapped_accounts — own guard (defense-in-depth; also fixed transitively) ─
create or replace function public.tax_unmapped_accounts(
  p_org_id uuid, p_jurisdiction_code text, p_form_code text, p_tax_year int,
  p_as_of date default current_date
) returns setof public.ledger_accounts
  language sql stable security definer set search_path = public as $$
  select a.*
    from public.ledger_accounts a
    join public.resolve_account_tax_lines(p_org_id, p_jurisdiction_code, p_form_code, p_tax_year, p_as_of) r
      on r.account_id = a.id
   where r.resolved_by = 'unmapped'
     and can_access_org(p_org_id);
$$;

-- ── tax_m1_summary — gate on org membership ────────────────────────────────
create or replace function public.tax_m1_summary(p_org_id uuid, p_tax_year int)
returns table (m1_bucket text, kind text, total_minor bigint, line_count int)
  language sql stable security definer set search_path = public as $$
  select m1_bucket, kind, sum(amount_minor)::bigint, count(*)::int
    from public.tax_adjustments
   where org_id = p_org_id and tax_year = p_tax_year and status = 'approved'
     and can_access_org(p_org_id)
   group by m1_bucket, kind
   order by m1_bucket, kind;
$$;

-- ── fixed_asset_listing — gate on org membership ───────────────────────────
create or replace function public.fixed_asset_listing(p_org_id uuid, p_tax_year int)
returns table (
  asset_id uuid, name text, class_key text, cost_minor bigint, in_service_date date,
  status text, book_depreciation_minor bigint, tax_depreciation_minor bigint,
  book_accumulated_minor bigint, tax_accumulated_minor bigint, book_tax_delta_minor bigint
)
  language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.class_key, a.cost_minor, a.in_service_date, a.status,
         coalesce(sl.book_depreciation_minor, 0), coalesce(sl.tax_depreciation_minor, 0),
         coalesce(sl.book_accumulated_minor, 0), coalesce(sl.tax_accumulated_minor, 0),
         coalesce(sl.tax_depreciation_minor, 0) - coalesce(sl.book_depreciation_minor, 0)
    from public.fixed_assets a
    left join public.depreciation_schedule_lines sl
      on sl.asset_id = a.id and sl.tax_year = p_tax_year
   where a.org_id = p_org_id
     and can_access_org(p_org_id)
   order by a.in_service_date, a.name;
$$;

-- ── macrs_tax_depreciation_for_year — keyed on p_asset_id, no org filter at all;
-- resolve the asset's own org and gate on it (RAISE — plpgsql, matches the write
-- RPCs' 42501-on-forbidden convention used elsewhere in this file). Based on the
-- LATEST body (20260703070200 red-team #4 fix — raise on unseeded convention
-- within the recovery period instead of silently returning 0), not the original
-- 070100 version — only the access guard is new here.
create or replace function public.macrs_tax_depreciation_for_year(
  p_asset_id uuid,
  p_tax_year int,
  p_as_of    date default current_date
) returns bigint
  language plpgsql stable security definer set search_path = public as $$
declare
  a           public.fixed_assets;
  cls         public.asset_classes;
  v_service_year int;
  v_year_index   int;
  v_179          bigint := 0;
  v_bonus_basis  bigint := 0;
  v_bonus        bigint := 0;
  v_macrs_basis  bigint := 0;
  v_pct          numeric;
  v_convention   text;
begin
  select * into a from public.fixed_assets where id = p_asset_id;
  if not found then return 0; end if;
  if not can_access_org(a.org_id) then
    raise exception 'not authorized: no access to this asset''s org' using errcode = '42501';
  end if;

  v_service_year := extract(year from a.in_service_date)::int;
  v_year_index   := p_tax_year - v_service_year + 1;
  if v_year_index < 1 then return 0; end if;

  select * into cls from public.asset_class_in_force(a.jurisdiction_code, a.class_key, v_service_year, p_as_of);
  if not found then return 0; end if;

  -- §179 + bonus established in year 1; later years depreciate the post-179/bonus basis.
  v_179 := least(coalesce(a.section_179_elected_minor,0),
                 coalesce(cls.section_179_cap_minor, a.cost_minor), a.cost_minor);
  v_bonus_basis := a.cost_minor - v_179;
  if a.bonus_elected and coalesce(cls.bonus_pct,0) > 0 then
    v_bonus := floor(v_bonus_basis * cls.bonus_pct / 100.0)::bigint;
  end if;
  v_macrs_basis := a.cost_minor - v_179 - v_bonus;

  if v_macrs_basis <= 0 then
    return case when v_year_index = 1 then v_179 + v_bonus else 0 end;
  end if;

  v_convention := cls.default_convention;
  if v_convention = 'mid_quarter' then
    v_convention := 'mid_quarter_q' || (floor((extract(month from a.in_service_date)::int - 1) / 3) + 1)::int;
  elsif v_convention <> 'mid_month' then
    v_convention := 'half_year';
  end if;

  select percentage into v_pct
    from public.macrs_percentages
   where jurisdiction_code = a.jurisdiction_code
     and recovery_period   = cls.recovery_period
     and convention        = v_convention
     and macrs_method       = cls.macrs_method
     and year_index         = v_year_index
     and is_active
     and effective_from <= p_as_of
     and (effective_to is null or effective_to >= p_as_of)
   order by effective_from desc
   limit 1;

  if v_pct is null then
    -- WITHIN the recovery schedule (year_index within recovery_period+1 for the
    -- half-year/mid-quarter tail) but NO seeded % row → a missing table, not "done".
    -- half-year/mid-quarter schedules run recovery_period + 1 years; only PAST that
    -- is a null % a legitimate "fully depreciated". RAISE the silent-zero footgun.
    if v_year_index <= coalesce(cls.recovery_period, 0) + 1 then
      raise exception 'no depreciation table for %/% year % (recovery_period %) — seed macrs_percentages for this key',
        v_convention, cls.macrs_method, v_year_index, cls.recovery_period
        using errcode = 'P0001';
    end if;
    return case when v_year_index = 1 then v_179 + v_bonus else 0 end;
  end if;

  return (case when v_year_index = 1 then v_179 + v_bonus else 0 end)
       + floor(v_macrs_basis * v_pct / 100.0)::bigint;
end $$;

-- ── book_depreciation_for_year — same shape: resolve org from the asset, gate ──
create or replace function public.book_depreciation_for_year(
  p_asset_id uuid,
  p_tax_year int
) returns bigint
  language plpgsql stable security definer set search_path = public as $$
declare
  a              public.fixed_assets;
  v_service_year int;
  v_year_index   int;
  v_base         numeric;
  v_annual       numeric;
  v_life         numeric;
begin
  select * into a from public.fixed_assets where id = p_asset_id;
  if not found or a.book_method = 'none' then return 0; end if;
  if not can_access_org(a.org_id) then
    raise exception 'not authorized: no access to this asset''s org' using errcode = '42501';
  end if;

  v_service_year := extract(year from a.in_service_date)::int;
  v_year_index   := p_tax_year - v_service_year + 1;
  v_life         := a.book_life_years;
  if v_year_index < 1 then return 0; end if;

  v_base   := (a.cost_minor - a.salvage_minor);
  if v_base <= 0 then return 0; end if;
  v_annual := v_base / v_life;

  -- half-year convention: 50% in year 1; the deferred half spills into year (life+1).
  if a.book_convention = 'half_year' then
    if v_year_index = 1 then
      return floor(v_annual / 2.0)::bigint;
    elsif v_year_index > 1 and v_year_index <= v_life then
      return floor(v_annual)::bigint;
    elsif v_year_index = v_life + 1 then
      return ceil(v_annual / 2.0)::bigint;  -- remaining half-year
    else
      return 0;
    end if;
  else
    -- full-year straight line
    if v_year_index >= 1 and v_year_index <= v_life then
      return floor(v_annual)::bigint;
    else
      return 0;
    end if;
  end if;
end $$;
