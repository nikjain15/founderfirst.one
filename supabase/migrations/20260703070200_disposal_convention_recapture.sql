-- W1.3-C red-team #3 (P2) — disposal math must follow IRS law, not "max accumulated
-- through disposal year". STACKED ON 20260703070100_fixed_asset_rpcs.sql.
--
-- WHAT WAS WRONG: dispose_fixed_asset computed
--     book_basis = cost - max(book_accumulated where tax_year <= disposal_year)
-- which (a) took the FULL disposal-year depreciation with NO partial-year (disposal-
-- year) convention, (b) silently depended on which schedule years happened to be
-- stored, (c) ignored the TAX accumulated schedule entirely, and (d) flagged no
-- §1245/§1250 recapture. gain/loss and the register drifted from the return.
--
-- CORRECT (IRS-standard, deterministic — this is tax law, not a product choice):
--   * In the DISPOSAL YEAR, apply the asset's acquisition convention to the
--     disposal-year depreciation: half-year → HALF of that year's normal depreciation
--     is allowed in the disposal year; mid-quarter → the mid-quarter disposal fraction
--     (Q1 .125, Q2 .375, Q3 .625, Q4 .875 — Pub 946 mid-quarter disposal table).
--   * Adjusted basis = cost − accumulated depreciation THROUGH the disposal year,
--     computed WITH that disposal-year convention (book and tax separately).
--   * gain/loss = proceeds − adjusted basis.
--   * BOOK gain/loss uses book accumulated; TAX gain/loss + §1245 (personal property)
--     / §1250 (real property) ordinary-recapture flag uses the TAX accumulated.
--     recapture = min(gain, tax_accumulated_depreciation) as ordinary (§1245).
--   * The schedule is ensured deterministically through the disposal year rather than
--     depending on what was already stored.
--
-- ASSUMPTION (noted — the research doc §398-402 mandates disposals + recapture but
-- does not spell the exact fractions): personal property (recovery_period ≤ 20, the
-- MACRS GDS bands) → §1245 full ordinary recapture; real property (recovery_period
-- ≥ 27 — 27.5/39-yr) → §1250. Property type is stored on the asset (defaulted from
-- the class recovery period) so a CPA can override.

-- ── 1. property type on the asset (drives §1245 vs §1250) ─────────────────────
alter table public.fixed_assets
  add column if not exists property_type text not null default 'personal'
    check (property_type in ('personal','real'));
comment on column public.fixed_assets.property_type is
  'personal → §1245 (full ordinary depreciation recapture); real → §1250. Defaulted from the class recovery period at register time; CPA-overridable.';

-- ── 2. tax basis / gain / recapture on the disposal event ─────────────────────
alter table public.asset_disposals
  add column if not exists tax_basis_minor      bigint,   -- adjusted TAX basis at disposal (cost - tax accumulated w/ disposal convention)
  add column if not exists tax_gain_loss_minor  bigint,   -- proceeds - adjusted tax basis
  add column if not exists recapture_section    text      -- '§1245' | '§1250' | null (loss → no recapture)
    check (recapture_section in ('§1245','§1250')),
  add column if not exists recapture_minor      bigint not null default 0;  -- ordinary income recaptured = min(tax gain, tax accumulated)
comment on column public.asset_disposals.recapture_minor is
  'Ordinary-income depreciation recapture = min(tax gain, tax accumulated depreciation). §1245 for personal property, §1250 for real property. Zero on a loss.';

-- ── 3. disposal-year convention fraction (of the year''s NORMAL depreciation) ──
-- half_year → 0.5 in the disposal year (mirror of the placed-in-service half-year).
-- mid_quarter → the mid-quarter disposal fraction by the DISPOSAL quarter (Pub 946):
--   Q1 .125, Q2 .375, Q3 .625, Q4 .875. mid_month → month-based (n-.5)/12.
create or replace function public.disposal_year_fraction(
  p_convention text, p_disposal_date date
) returns numeric
  language sql immutable set search_path = public as $$
  select case
    when p_convention = 'half_year'  then 0.5
    when p_convention = 'mid_quarter'
      then (floor((extract(month from p_disposal_date)::int - 1) / 3) * 2 + 1) / 8.0  -- Q1 .125 … Q4 .875
    when p_convention = 'mid_month'
      then (extract(month from p_disposal_date)::numeric - 0.5) / 12.0
    else 0.5
  end;
$$;
grant execute on function public.disposal_year_fraction(text,date) to authenticated, service_role;

-- ── 4. dispose_fixed_asset — IRS-correct basis, gain/loss (book + tax), recapture ─
-- Ensures the schedule is computed through the disposal year, applies the asset''s
-- acquisition convention to the disposal-year depreciation, computes adjusted BOOK
-- and TAX basis, and flags §1245/§1250 ordinary recapture on a tax gain.
create or replace function public.dispose_fixed_asset(
  p_actor uuid, p_org uuid, p_asset_id uuid, p_disposal_date date,
  p_proceeds_minor bigint default 0, p_note text default null,
  p_gain_loss_account_id uuid default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  a               public.fixed_assets;
  cls             public.asset_classes;
  v_year          int;
  v_prior_year    int;
  v_service_year  int;
  v_convention    text;
  v_frac          numeric;
  -- accumulated THROUGH the year before disposal (full years), from the schedule:
  v_book_prior    bigint := 0;
  v_tax_prior     bigint := 0;
  -- the disposal-year NORMAL depreciation (from the schedule / compute fns):
  v_book_dy_full  bigint := 0;
  v_tax_dy_full   bigint := 0;
  -- disposal-year allowed depreciation (normal × convention fraction):
  v_book_dy       bigint;
  v_tax_dy        bigint;
  v_book_acc      bigint;   -- book accumulated through disposal
  v_tax_acc       bigint;   -- tax accumulated through disposal
  v_book_basis    bigint;
  v_tax_basis     bigint;
  v_book_gl       bigint;
  v_tax_gl        bigint;
  v_recap         bigint := 0;
  v_recap_sec     text := null;
  v_disp          uuid;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to dispose asset for org %', p_org using errcode = '42501';
  end if;
  select * into a from public.fixed_assets where id = p_asset_id and org_id = p_org;
  if not found then raise exception 'asset % not in org %', p_asset_id, p_org using errcode = '42501'; end if;
  if a.status = 'disposed' then raise exception 'asset % already disposed', p_asset_id; end if;

  v_year         := extract(year from p_disposal_date)::int;
  v_prior_year   := v_year - 1;
  v_service_year := extract(year from a.in_service_date)::int;
  if v_year < v_service_year then
    raise exception 'disposal date % precedes in-service date %', p_disposal_date, a.in_service_date;
  end if;

  -- resolve the acquisition convention (the asset's tax family) for the disposal fraction.
  select * into cls from public.asset_class_in_force(a.jurisdiction_code, a.class_key, v_service_year, p_disposal_date);
  v_convention := coalesce(cls.default_convention, a.book_convention, 'half_year');
  v_frac := public.disposal_year_fraction(v_convention, p_disposal_date);

  -- DETERMINISTIC: ensure the full schedule is computed (idempotent upsert) so the
  -- disposal math never depends on which years happened to be stored.
  perform public.compute_depreciation_schedule(p_actor, p_org, p_asset_id, p_disposal_date);

  -- accumulated through the year BEFORE disposal (whole years fully allowed).
  if v_prior_year >= v_service_year then
    select coalesce(book_accumulated_minor, 0), coalesce(tax_accumulated_minor, 0)
      into v_book_prior, v_tax_prior
      from public.depreciation_schedule_lines
     where asset_id = p_asset_id and tax_year <= v_prior_year
     order by tax_year desc limit 1;
    v_book_prior := coalesce(v_book_prior, 0);
    v_tax_prior  := coalesce(v_tax_prior, 0);
  end if;

  -- disposal-year NORMAL depreciation (unconventioned) then apply the disposal fraction.
  v_book_dy_full := public.book_depreciation_for_year(p_asset_id, v_year);
  v_tax_dy_full  := public.macrs_tax_depreciation_for_year(p_asset_id, v_year, p_disposal_date);
  v_book_dy := floor(v_book_dy_full * v_frac)::bigint;
  v_tax_dy  := floor(v_tax_dy_full  * v_frac)::bigint;

  -- never depreciate past basis (book: cost-salvage; tax: cost).
  v_book_acc := least(v_book_prior + v_book_dy, a.cost_minor - a.salvage_minor);
  v_tax_acc  := least(v_tax_prior  + v_tax_dy,  a.cost_minor);

  v_book_basis := a.cost_minor - v_book_acc;
  v_tax_basis  := a.cost_minor - v_tax_acc;
  v_book_gl    := p_proceeds_minor - v_book_basis;   -- book gain/loss
  v_tax_gl     := p_proceeds_minor - v_tax_basis;    -- tax gain/loss

  -- §1245 / §1250 ordinary recapture: on a TAX GAIN, recapture the lesser of the gain
  -- and the tax depreciation taken (all of it is ordinary for §1245 personal property).
  if v_tax_gl > 0 then
    v_recap := least(v_tax_gl, v_tax_acc);
    v_recap_sec := case when a.property_type = 'real' then '§1250' else '§1245' end;
  end if;

  insert into public.asset_disposals
    (org_id, asset_id, disposal_date, proceeds_minor, book_basis_minor, gain_loss_minor,
     tax_basis_minor, tax_gain_loss_minor, recapture_section, recapture_minor, note, disposed_by)
  values (p_org, p_asset_id, p_disposal_date, coalesce(p_proceeds_minor,0), v_book_basis, v_book_gl,
          v_tax_basis, v_tax_gl, v_recap_sec, v_recap, p_note, p_actor)
  returning id into v_disp;

  update public.fixed_assets
     set status = 'disposed', disposed_on = p_disposal_date, updated_at = now()
   where id = p_asset_id;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'asset.dispose', 'fixed_asset', p_asset_id,
          jsonb_build_object('disposal_date', p_disposal_date, 'proceeds_minor', coalesce(p_proceeds_minor,0),
                             'book_basis_minor', v_book_basis, 'gain_loss_minor', v_book_gl,
                             'tax_basis_minor', v_tax_basis, 'tax_gain_loss_minor', v_tax_gl,
                             'recapture_section', v_recap_sec, 'recapture_minor', v_recap));
  return v_disp;
end $$;
revoke all on function public.dispose_fixed_asset(uuid,uuid,uuid,date,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.dispose_fixed_asset(uuid,uuid,uuid,date,bigint,text,uuid) to service_role;

-- ── 5. red-team #4 (P3) — unseeded convention must RAISE, not silently return 0 ─
-- The engine computes mid_quarter_q1..q3 keys but only mid_quarter_q4 percentages are
-- seeded (and other (recovery_period, convention, year_index) rows may be missing).
-- macrs_tax_depreciation_for_year returned 0 silently on a missing % row — a
-- silent-zero footgun that under-depreciates with no signal. Guard: if the in-force
-- lookup finds NO percentage row for a year that is still WITHIN the recovery period,
-- RAISE. (Past the recovery period, a null % legitimately means "fully depreciated".)
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
grant execute on function public.macrs_tax_depreciation_for_year(uuid,int,date) to authenticated, service_role;
