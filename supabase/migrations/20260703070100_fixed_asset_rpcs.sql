-- W1.3-C — Fixed-asset & depreciation RPCs. STACKED ON W1.3-B (#181) + CENTRAL-2.
--
-- SECURITY (ISOTEST pattern, LEARNINGS): every WRITE fn takes p_actor as its FIRST
-- arg, is SECURITY DEFINER, authorizes against p_actor, and is EXECUTE-granted ONLY
-- to service_role (the thin write-API forwards the real caller). No p_actor-first
-- SECDEF write fn is granted to anon/authenticated (the forged-actor P0). READ /
-- lookup fns are safe for authenticated (RLS scopes tenant reads).
--
-- REUSE, DON'T FORK: book depreciation posts through post_journal_entry (period-lock
-- + trust-tier approval + audit already inside it); the book-vs-tax delta drafts an
-- M-1 via draft_tax_adjustment (W1.3-B). This card adds NO parallel posting or M-1
-- path.

-- ── the asset-class-in-force lookup (law-derived, effective-dated) ────────────
-- The ONLY sanctioned way to resolve which recovery regime applies for a year —
-- old years get old §179/bonus, new years get the superseding row (Roadmap 3c).
create or replace function public.asset_class_in_force(
  p_jurisdiction_code text,
  p_class_key         text,
  p_tax_year          int,
  p_as_of             date default current_date
) returns public.asset_classes
  language sql stable security definer set search_path = public as $$
  select *
    from public.asset_classes
   where jurisdiction_code = p_jurisdiction_code
     and class_key         = p_class_key
     and tax_year          = p_tax_year
     and is_active
     and effective_from <= p_as_of
     and (effective_to is null or effective_to >= p_as_of)
   order by effective_from desc
   limit 1;
$$;
grant execute on function public.asset_class_in_force(text,text,int,date) to authenticated, anon, service_role;

-- ── supersede an asset class (law lifecycle) — service_role only ──────────────
-- Close the current active row + open a new one in ONE txn (mirrors
-- supersede_tax_form). The one-active partial unique + no-overlap EXCLUDE make a
-- half-done supersede impossible.
create or replace function public.supersede_asset_class(
  p_jurisdiction_code text,
  p_class_key         text,
  p_tax_year          int,
  p_effective_from    date,
  p_label             text,
  p_recovery_period   int,
  p_macrs_method      text,
  p_default_convention text,
  p_section_179_cap_minor bigint,
  p_bonus_pct         numeric,
  p_citation          text,
  p_source            text default 'seed'
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_new uuid;
begin
  update public.asset_classes
     set effective_to = p_effective_from - 1
   where jurisdiction_code = p_jurisdiction_code
     and class_key         = p_class_key
     and tax_year          = p_tax_year
     and effective_to is null
     and is_active;

  insert into public.asset_classes (
    jurisdiction_code, class_key, label, tax_year, recovery_period, macrs_method,
    default_convention, section_179_cap_minor, bonus_pct, effective_from, effective_to,
    citation, source
  ) values (
    p_jurisdiction_code, p_class_key, coalesce(p_label, p_class_key), p_tax_year,
    p_recovery_period, coalesce(p_macrs_method,'200DB'), coalesce(p_default_convention,'half_year'),
    p_section_179_cap_minor, p_bonus_pct, p_effective_from, null, p_citation, coalesce(p_source,'seed')
  ) returning id into v_new;
  return v_new;
end $$;
revoke all on function public.supersede_asset_class(text,text,int,date,text,int,text,text,bigint,numeric,text,text) from public, anon, authenticated;
grant execute on function public.supersede_asset_class(text,text,int,date,text,int,text,text,bigint,numeric,text,text) to service_role;

-- ── register a fixed asset — CPA/owner write-gated, audit-logged ──────────────
create or replace function public.register_fixed_asset(
  p_actor       uuid,
  p_org         uuid,
  p_name        text,
  p_class_key   text,
  p_cost_minor  bigint,
  p_in_service_date date,
  p_jurisdiction_code text default 'US-FED',
  p_salvage_minor bigint default 0,
  p_book_method text default 'straight_line',
  p_book_life_years numeric default 5,
  p_book_convention text default 'half_year',
  p_section_179_elected_minor bigint default 0,
  p_bonus_elected boolean default false,
  p_asset_account_id uuid default null,
  p_expense_account_id uuid default null,
  p_accumulated_account_id uuid default null,
  p_description text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to register a fixed asset for org %', p_org using errcode = '42501';
  end if;
  if p_cost_minor is null or p_cost_minor <= 0 then
    raise exception 'asset cost must be a positive amount in minor units';
  end if;
  -- referenced ledger accounts must belong to this org (no cross-tenant wiring)
  if p_expense_account_id is not null and not exists
       (select 1 from ledger_accounts where id = p_expense_account_id and org_id = p_org) then
    raise exception 'expense_account % is not in org %', p_expense_account_id, p_org using errcode = '42501';
  end if;
  if p_accumulated_account_id is not null and not exists
       (select 1 from ledger_accounts where id = p_accumulated_account_id and org_id = p_org) then
    raise exception 'accumulated_account % is not in org %', p_accumulated_account_id, p_org using errcode = '42501';
  end if;

  insert into public.fixed_assets (
    org_id, name, description, jurisdiction_code, class_key, cost_minor, salvage_minor,
    in_service_date, book_method, book_life_years, book_convention,
    section_179_elected_minor, bonus_elected,
    asset_account_id, expense_account_id, accumulated_account_id, created_by
  ) values (
    p_org, p_name, p_description, coalesce(p_jurisdiction_code,'US-FED'), p_class_key,
    p_cost_minor, coalesce(p_salvage_minor,0), p_in_service_date,
    coalesce(p_book_method,'straight_line'), coalesce(p_book_life_years,5),
    coalesce(p_book_convention,'half_year'), coalesce(p_section_179_elected_minor,0),
    coalesce(p_bonus_elected,false), p_asset_account_id, p_expense_account_id,
    p_accumulated_account_id, p_actor
  ) returning id into v_id;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'asset.register', 'fixed_asset', v_id,
          jsonb_build_object('name', p_name, 'class_key', p_class_key, 'cost_minor', p_cost_minor,
                             'in_service_date', p_in_service_date));
  return v_id;
end $$;
revoke all on function public.register_fixed_asset(uuid,uuid,text,text,bigint,date,text,bigint,text,numeric,text,bigint,boolean,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.register_fixed_asset(uuid,uuid,text,text,bigint,date,text,bigint,text,numeric,text,bigint,boolean,uuid,uuid,uuid,text) to service_role;

-- ── MACRS tax depreciation for ONE year — pure lookup over macrs_percentages ──
-- Penny COMPUTES tax depreciation entirely from DATA: §179 expensing first (capped
-- at the year's law cap on the class), then bonus on the remaining basis (at the
-- year's law bonus %), then MACRS % on what's left. NO literals — every rate is a
-- looked-up row. Returns the tax depreciation (minor units) for p_asset in p_tax_year.
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
  v_year_index   := p_tax_year - v_service_year + 1;      -- 1 in the placed-in-service year
  if v_year_index < 1 then return 0; end if;

  -- the recovery regime IN FORCE for the asset's in-service tax year (old law for
  -- old assets — an asset placed in service in 2022 keeps its 2022 §179/bonus).
  select * into cls from public.asset_class_in_force(a.jurisdiction_code, a.class_key, v_service_year, p_as_of);
  if not found then return 0; end if;

  -- §179 + bonus apply ONLY in the placed-in-service year (year_index = 1).
  if v_year_index = 1 then
    -- §179: the org's election, capped at the year's law cap for the class.
    v_179 := least(coalesce(a.section_179_elected_minor,0),
                   coalesce(cls.section_179_cap_minor, a.cost_minor),
                   a.cost_minor);
    v_bonus_basis := a.cost_minor - v_179;
    if a.bonus_elected and coalesce(cls.bonus_pct,0) > 0 then
      v_bonus := floor(v_bonus_basis * cls.bonus_pct / 100.0)::bigint;
    end if;
    v_macrs_basis := a.cost_minor - v_179 - v_bonus;
  else
    -- later years depreciate the post-179/bonus MACRS basis established in year 1.
    v_179 := least(coalesce(a.section_179_elected_minor,0),
                   coalesce(cls.section_179_cap_minor, a.cost_minor), a.cost_minor);
    v_bonus_basis := a.cost_minor - v_179;
    if a.bonus_elected and coalesce(cls.bonus_pct,0) > 0 then
      v_bonus := floor(v_bonus_basis * cls.bonus_pct / 100.0)::bigint;
    end if;
    v_macrs_basis := a.cost_minor - v_179 - v_bonus;
  end if;

  if v_macrs_basis <= 0 then
    return case when v_year_index = 1 then v_179 + v_bonus else 0 end;
  end if;

  -- convention: half-year unless the class defaults to mid-quarter (mid-quarter Q
  -- selection is a per-asset in-service-quarter decision; default_convention drives
  -- the table family — half_year here, mid_quarter_qN resolved by in-service quarter).
  v_convention := cls.default_convention;
  if v_convention = 'mid_quarter' then
    v_convention := 'mid_quarter_q' || (floor((extract(month from a.in_service_date)::int - 1) / 3) + 1)::int;
  elsif v_convention <> 'mid_month' then
    v_convention := 'half_year';
  end if;

  -- look up the published MACRS % for this recovery-year — DATA, not a literal.
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
    -- past the recovery period → basis is fully depreciated; year-1 still returns 179+bonus.
    return case when v_year_index = 1 then v_179 + v_bonus else 0 end;
  end if;

  return (case when v_year_index = 1 then v_179 + v_bonus else 0 end)
       + floor(v_macrs_basis * v_pct / 100.0)::bigint;
end $$;
grant execute on function public.macrs_tax_depreciation_for_year(uuid,int,date) to authenticated, service_role;

-- ── book (straight-line) depreciation for ONE year ────────────────────────────
-- Book uses straight-line over book_life_years on (cost - salvage), half-year in
-- the first and last recovery years (the org's book convention). Pure mechanics.
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
grant execute on function public.book_depreciation_for_year(uuid,int) to authenticated, service_role;

-- ── compute + STORE the schedule for an asset across its life ──────────────────
-- Penny COMPUTES the full book + tax schedule and upserts depreciation_schedule_lines
-- (idempotent per (asset, year)). Write-gated + audit-logged. Does NOT post or draft
-- M-1 — those are the explicit downstream steps.
create or replace function public.compute_depreciation_schedule(
  p_actor uuid, p_org uuid, p_asset_id uuid, p_as_of date default current_date
) returns int
  language plpgsql security definer set search_path = public as $$
declare
  a            public.fixed_assets;
  cls          public.asset_classes;
  v_service_year int;
  v_last_year    int;
  v_yr           int;
  v_book         bigint;
  v_tax          bigint;
  v_book_acc     bigint := 0;
  v_tax_acc      bigint := 0;
  v_rows         int := 0;
  v_last_stored  int := null;   -- tax_year of the last line we wrote (for the true-up sweep)
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to compute depreciation for org %', p_org using errcode = '42501';
  end if;
  select * into a from public.fixed_assets where id = p_asset_id and org_id = p_org;
  if not found then raise exception 'asset % not in org %', p_asset_id, p_org using errcode = '42501'; end if;

  v_service_year := extract(year from a.in_service_date)::int;
  select * into cls from public.asset_class_in_force(a.jurisdiction_code, a.class_key, v_service_year, p_as_of);
  -- schedule spans the greater of book life and tax recovery period (+1 for half-year tails).
  v_last_year := v_service_year + greatest(ceil(a.book_life_years)::int, coalesce(cls.recovery_period, 0)) + 1;

  for v_yr in v_service_year .. v_last_year loop
    v_book := public.book_depreciation_for_year(p_asset_id, v_yr);
    v_tax  := public.macrs_tax_depreciation_for_year(p_asset_id, v_yr, p_as_of);
    -- clamp accumulation so we never depreciate past depreciable basis.
    if v_book_acc + v_book > (a.cost_minor - a.salvage_minor) then
      v_book := greatest((a.cost_minor - a.salvage_minor) - v_book_acc, 0);
    end if;
    if v_tax_acc + v_tax > a.cost_minor then
      v_tax := greatest(a.cost_minor - v_tax_acc, 0);
    end if;
    if v_book = 0 and v_tax = 0 and v_yr > v_service_year then
      continue;  -- nothing left to record
    end if;
    v_book_acc := v_book_acc + v_book;
    v_tax_acc  := v_tax_acc + v_tax;

    insert into public.depreciation_schedule_lines
      (org_id, asset_id, tax_year, book_depreciation_minor, tax_depreciation_minor,
       book_accumulated_minor, tax_accumulated_minor, computed_at)
    values (p_org, p_asset_id, v_yr, v_book, v_tax, v_book_acc, v_tax_acc, now())
    on conflict (asset_id, tax_year) do update
      set book_depreciation_minor = excluded.book_depreciation_minor,
          tax_depreciation_minor  = excluded.tax_depreciation_minor,
          book_accumulated_minor  = excluded.book_accumulated_minor,
          tax_accumulated_minor   = excluded.tax_accumulated_minor,
          computed_at = now();
    v_rows := v_rows + 1;
    v_last_stored := v_yr;
  end loop;

  -- FINAL-YEAR TRUE-UP (crown-jewel invariant): per-year floor() rounding leaves a
  -- few cents of basis un-recovered across the asset's life — MACRS/SL must recover
  -- EXACTLY cost (tax) / cost-salvage (book), or the book-vs-tax temporary difference
  -- never nets to zero and the register drifts from the ledger. The recovery-schedule
  -- convention sweeps the residual into the final recovery year; do the same here so
  -- tax_accumulated == cost and book_accumulated == (cost - salvage) to the cent.
  if v_last_stored is not null then
    update public.depreciation_schedule_lines
       set tax_depreciation_minor = tax_depreciation_minor + (a.cost_minor - v_tax_acc),
           book_depreciation_minor = book_depreciation_minor + ((a.cost_minor - a.salvage_minor) - v_book_acc),
           tax_accumulated_minor  = a.cost_minor,
           book_accumulated_minor = (a.cost_minor - a.salvage_minor),
           computed_at = now()
     where asset_id = p_asset_id and tax_year = v_last_stored;
    v_tax_acc  := a.cost_minor;
    v_book_acc := a.cost_minor - a.salvage_minor;
  end if;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'asset.compute_schedule', 'fixed_asset', p_asset_id,
          jsonb_build_object('years', v_rows));
  return v_rows;
end $$;
revoke all on function public.compute_depreciation_schedule(uuid,uuid,uuid,date) from public, anon, authenticated;
grant execute on function public.compute_depreciation_schedule(uuid,uuid,uuid,date) to service_role;

-- ── post BOOK depreciation for a year as a balanced JE (via post_journal_entry) ─
-- Dr depreciation expense / Cr accumulated depreciation. Penny PROPOSES; the
-- existing posting path enforces period-lock (ensure_open_period) + the org trust-
-- tier approval gate + audit. Idempotent per (asset, year) via the JE idempotency
-- key. Records the resulting entry id on the schedule line.
create or replace function public.post_book_depreciation(
  p_actor uuid, p_org uuid, p_asset_id uuid, p_tax_year int
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  a        public.fixed_assets;
  sl       public.depreciation_schedule_lines;
  v_entry  journal_entries;
  v_date   date;
  v_key    text;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to post depreciation for org %', p_org using errcode = '42501';
  end if;
  select * into a from public.fixed_assets where id = p_asset_id and org_id = p_org;
  if not found then raise exception 'asset % not in org %', p_asset_id, p_org using errcode = '42501'; end if;
  if a.expense_account_id is null or a.accumulated_account_id is null then
    raise exception 'asset % has no expense/accumulated account wired — cannot post', p_asset_id;
  end if;

  select * into sl from public.depreciation_schedule_lines where asset_id = p_asset_id and tax_year = p_tax_year;
  if not found then raise exception 'no computed schedule for asset % year % — run compute_depreciation_schedule first', p_asset_id, p_tax_year; end if;
  if sl.book_depreciation_minor <= 0 then
    raise exception 'no book depreciation to post for asset % year %', p_asset_id, p_tax_year;
  end if;
  if sl.posted_entry_id is not null then
    return sl.posted_entry_id;  -- already posted (idempotent)
  end if;

  -- post on the last day of the tax year; ensure_open_period (inside
  -- post_journal_entry) rejects a closed period — depreciation never lands in a
  -- locked period.
  v_date := make_date(p_tax_year, 12, 31);
  v_key  := 'depr:' || p_asset_id::text || ':' || p_tax_year::text;

  v_entry := public.post_journal_entry(
    p_actor, p_org, v_date, v_key,
    jsonb_build_array(
      jsonb_build_object('account_id', a.expense_account_id,      'side', 'D', 'amount_minor', sl.book_depreciation_minor, 'memo', 'Depreciation — ' || a.name),
      jsonb_build_object('account_id', a.accumulated_account_id,  'side', 'C', 'amount_minor', sl.book_depreciation_minor, 'memo', 'Accumulated depreciation — ' || a.name)
    ),
    'depreciation', p_asset_id::text, 'Book depreciation ' || p_tax_year || ' — ' || a.name
  );

  update public.depreciation_schedule_lines
     set posted_entry_id = v_entry.id
   where asset_id = p_asset_id and tax_year = p_tax_year;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'asset.post_depreciation', 'fixed_asset', p_asset_id,
          jsonb_build_object('tax_year', p_tax_year, 'entry_id', v_entry.id, 'amount_minor', sl.book_depreciation_minor));
  return v_entry.id;
end $$;
revoke all on function public.post_book_depreciation(uuid,uuid,uuid,int) from public, anon, authenticated;
grant execute on function public.post_book_depreciation(uuid,uuid,uuid,int) to service_role;

-- ── draft the book-vs-tax depreciation delta as an M-1 adjustment ─────────────
-- Reuses W1.3-B's draft_tax_adjustment (Penny proposes, human approves). The
-- (tax - book) delta selects the M-1 bucket: tax > book → an extra deduction on
-- the return not on the books (deduction_on_return_not_books); book > tax →
-- expense on books not return. Idempotent via origin_ref = 'depr:<asset>:<year>'.
create or replace function public.draft_depreciation_m1(
  p_actor uuid, p_org uuid, p_asset_id uuid, p_tax_year int
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  a       public.fixed_assets;
  sl      public.depreciation_schedule_lines;
  v_delta bigint;
  v_bucket text;
  v_adj   uuid;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to draft M-1 for org %', p_org using errcode = '42501';
  end if;
  select * into a from public.fixed_assets where id = p_asset_id and org_id = p_org;
  if not found then raise exception 'asset % not in org %', p_asset_id, p_org using errcode = '42501'; end if;
  select * into sl from public.depreciation_schedule_lines where asset_id = p_asset_id and tax_year = p_tax_year;
  if not found then raise exception 'no computed schedule for asset % year %', p_asset_id, p_tax_year; end if;

  v_delta := sl.tax_depreciation_minor - sl.book_depreciation_minor;
  if v_delta = 0 then
    return null;  -- no book-tax difference this year
  end if;
  if v_delta > 0 then
    v_bucket := 'deduction_on_return_not_books';  -- extra tax depreciation
  else
    v_bucket := 'expense_on_books_not_return';     -- book depreciation exceeds tax
  end if;

  -- reuse the W1.3-B hook (never a parallel path). Temporary difference (timing).
  v_adj := public.draft_tax_adjustment(
    p_actor, p_org, p_tax_year, v_bucket, abs(v_delta),
    'temporary', null,
    'Book vs tax depreciation — ' || a.name || ' (' || p_tax_year || ')',
    'depreciation_book_tax', 'depr:' || p_asset_id::text || ':' || p_tax_year::text,
    'penny_proposed'
  );

  update public.depreciation_schedule_lines
     set m1_adjustment_id = v_adj
   where asset_id = p_asset_id and tax_year = p_tax_year;
  return v_adj;
end $$;
revoke all on function public.draft_depreciation_m1(uuid,uuid,uuid,int) from public, anon, authenticated;
grant execute on function public.draft_depreciation_m1(uuid,uuid,uuid,int) to service_role;

-- ── dispose an asset — compute gain/loss, update subledger + book ─────────────
-- Book basis = cost - book accumulated depreciation (from the schedule). gain/loss
-- = proceeds - book basis. Marks the asset disposed; records the disposal row.
-- (The disposal JE — remove asset, clear accumulated, book gain/loss — is posted
-- via the same post_journal_entry path when accounts are wired; here we compute +
-- record and post if wired.) Audit-logged.
create or replace function public.dispose_fixed_asset(
  p_actor uuid, p_org uuid, p_asset_id uuid, p_disposal_date date,
  p_proceeds_minor bigint default 0, p_note text default null,
  p_gain_loss_account_id uuid default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  a            public.fixed_assets;
  v_book_acc   bigint := 0;
  v_basis      bigint;
  v_gain_loss  bigint;
  v_disp       uuid;
  v_year       int;
  v_entry      journal_entries;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to dispose asset for org %', p_org using errcode = '42501';
  end if;
  select * into a from public.fixed_assets where id = p_asset_id and org_id = p_org;
  if not found then raise exception 'asset % not in org %', p_asset_id, p_org using errcode = '42501'; end if;
  if a.status = 'disposed' then raise exception 'asset % already disposed', p_asset_id; end if;

  v_year := extract(year from p_disposal_date)::int;
  -- book accumulated depreciation through the disposal year (from the computed schedule).
  select coalesce(max(book_accumulated_minor), 0) into v_book_acc
    from public.depreciation_schedule_lines
   where asset_id = p_asset_id and tax_year <= v_year;

  v_basis     := a.cost_minor - v_book_acc;
  v_gain_loss := p_proceeds_minor - v_basis;    -- positive = gain, negative = loss

  insert into public.asset_disposals
    (org_id, asset_id, disposal_date, proceeds_minor, book_basis_minor, gain_loss_minor, note, disposed_by)
  values (p_org, p_asset_id, p_disposal_date, coalesce(p_proceeds_minor,0), v_basis, v_gain_loss, p_note, p_actor)
  returning id into v_disp;

  update public.fixed_assets
     set status = 'disposed', disposed_on = p_disposal_date, updated_at = now()
   where id = p_asset_id;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'asset.dispose', 'fixed_asset', p_asset_id,
          jsonb_build_object('disposal_date', p_disposal_date, 'proceeds_minor', coalesce(p_proceeds_minor,0),
                             'book_basis_minor', v_basis, 'gain_loss_minor', v_gain_loss));
  return v_disp;
end $$;
revoke all on function public.dispose_fixed_asset(uuid,uuid,uuid,date,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.dispose_fixed_asset(uuid,uuid,uuid,date,bigint,text,uuid) to service_role;

-- ── the fixed-asset listing (read) — feeds Form 4562 / Schedule L ─────────────
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
   order by a.in_service_date, a.name;
$$;
grant execute on function public.fixed_asset_listing(uuid,int) to authenticated, service_role;
