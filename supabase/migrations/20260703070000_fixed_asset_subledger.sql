-- W1.3-C — Fixed-asset & depreciation subledger (Penny COMPUTES depreciation).
-- STACKED ON CENTRAL-2 (#177) + W1.3-B (#181): reuses entity_types, the tax
-- effective-dating idiom, ledger_accounts.tags, the ledger posting path
-- (post_journal_entry), the period-lock guard (ensure_open_period), and the M-1
-- layer (tax_adjustments + draft_tax_adjustment) — nothing forked.
--
-- WHAT (research decision 5 — "BUILD the subledger; Penny computes depreciation"):
--   asset_classes        — LAW DATA: MACRS class life, recovery period, GDS method,
--                          default convention, plus §179 cap & bonus % — effective-
--                          dated + cited (a law change is a seed row, not code).
--   macrs_percentages    — LAW DATA: the IRS published MACRS percentage tables
--                          (recovery_period × convention × year) — DATA, not literals.
--   fixed_assets         — the REGISTER: one row per asset (cost, in-service date,
--                          method, useful life, convention, salvage, class).
--   depreciation_schedule_lines — COMPUTED book + tax depreciation per asset per
--                          year (the subledger detail); posting/M-1 reference these.
--   asset_disposals      — disposal event: proceeds, gain/loss (computed), status.
--
-- LAW LIFECYCLE (Roadmap 3c, same as W1.3-B tax_forms): asset_classes +
-- macrs_percentages carry effective_from / effective_to + citation. A change is a
-- new superseding row; old periods compute under old law. NO hardcoded MACRS /
-- §179 / bonus literals anywhere in app code — they are rows here, loaded from
-- seeds/depreciation/*.json via scripts/seed-depreciation.ts.
--
-- POSTING: book depreciation posts as a NORMAL balanced journal entry (Dr
-- depreciation expense / Cr accumulated depreciation) through post_journal_entry
-- — period-lock respected, trust-tier approval honored, audit-logged. Penny
-- PROPOSES; the existing approval gate applies (never a silent auto-post).
--
-- M-1: the book-vs-tax depreciation difference DRAFTS a tax_adjustment via W1.3-B's
-- draft_tax_adjustment (origin_kind='depreciation_book_tax'), human-approved.
--
-- WRITE-DON'T-DEPLOY: committed, not applied. Seeds load via
-- scripts/seed-depreciation.ts → supabase/seeds/depreciation/_generated.sql,
-- \i-included from supabase/seed.sql AFTER the kernel (entity_types FK) + tax seeds.

create extension if not exists btree_gist;

-- ── 1. asset_classes — LAW DATA: MACRS class, life, §179/bonus (effective-dated) ─
-- One row per (jurisdiction, asset_class_key, tax_year) recovery regime. The whole
-- point of Part B: a law change (bonus % step-down, §179 cap bump) is a new row.
create table if not exists public.asset_classes (
  id                 uuid primary key default gen_random_uuid(),
  jurisdiction_code  text not null references public.tax_jurisdictions(code),
  class_key          text not null,                 -- STABLE semantic key: 'computers','office_furniture','vehicles_light','machinery','land_improvements'
  label              text not null,                 -- 'Computers & peripheral equipment'
  tax_year           int  not null,
  recovery_period    int  not null,                 -- MACRS recovery period in years: 3,5,7,10,15,20 (GDS)
  macrs_method       text not null default '200DB'  -- '200DB' | '150DB' | 'SL' (GDS depreciation method)
                       check (macrs_method in ('200DB','150DB','SL')),
  default_convention text not null default 'half_year'
                       check (default_convention in ('half_year','mid_quarter','mid_month')),
  section_179_cap_minor  bigint,                     -- §179 expensing cap (minor units); year-keyed law data
  bonus_pct              numeric,                    -- bonus depreciation %; year-keyed law data (100→80→60…)
  class_life_years       numeric,                    -- ADR class life (for reference / ADS)
  -- law lifecycle (Roadmap 3c) — same idiom as tax_forms:
  effective_from     date not null,
  effective_to       date,
  citation           text not null,                 -- IRS Pub 946 / §168 / §179 cite + year
  source             text not null default 'seed',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (jurisdiction_code, class_key, tax_year, effective_from)
);
create index if not exists asset_classes_lookup
  on public.asset_classes (jurisdiction_code, class_key, tax_year);
-- one active class row per (jurisdiction, class, year); a supersede closes the old
-- one first (mirrors tax_forms_one_active / filing_obligations_one_active).
create unique index if not exists asset_classes_one_active
  on public.asset_classes (jurisdiction_code, class_key, tax_year)
  where effective_to is null and is_active;
alter table public.asset_classes drop constraint if exists asset_classes_no_overlap;
alter table public.asset_classes
  add constraint asset_classes_no_overlap
  exclude using gist (
    jurisdiction_code with =,
    class_key         with =,
    tax_year          with =,
    daterange(effective_from, effective_to + 1, '[)') with &&
  ) where (is_active);
comment on table public.asset_classes is
  'LAW-DERIVED asset depreciation classes (MACRS recovery period/method/convention, §179 cap, bonus %). Year-versioned + effective-dated + cited (Roadmap 3c). A §179/bonus change is a NEW superseding row; old years compute under old law. NO literals in app code.';

-- ── 2. macrs_percentages — LAW DATA: the IRS published MACRS percentage tables ──
-- The percentage-per-recovery-year tables (Pub 946 Appendix A). Stored as DATA so
-- the compute engine looks them up, never encodes them. Keyed by (recovery_period,
-- convention, method, year_index) — one row per recovery-year of the schedule.
create table if not exists public.macrs_percentages (
  id                uuid primary key default gen_random_uuid(),
  jurisdiction_code text not null references public.tax_jurisdictions(code),
  recovery_period   int  not null,                  -- 3,5,7,10,15,20
  convention        text not null                   -- 'half_year' | 'mid_quarter_q1'..'mid_quarter_q4'
                      check (convention in
                        ('half_year','mid_quarter_q1','mid_quarter_q2','mid_quarter_q3','mid_quarter_q4','mid_month')),
  macrs_method      text not null default '200DB' check (macrs_method in ('200DB','150DB','SL')),
  year_index        int  not null,                  -- 1-based recovery year (1 = first year)
  percentage        numeric not null,               -- the published % (e.g. 20.00 for 5yr HY yr1)
  -- law lifecycle:
  effective_from    date not null,
  effective_to      date,
  citation          text not null,                  -- 'IRS Pub 946 Table A-1' + year
  source            text not null default 'seed',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (jurisdiction_code, recovery_period, convention, macrs_method, year_index, effective_from)
);
create index if not exists macrs_percentages_lookup
  on public.macrs_percentages (jurisdiction_code, recovery_period, convention, macrs_method);
-- EFFECTIVE-DATING INTEGRITY (repeat of the CENTRAL-2 overlap P0 — the SAME guard
-- asset_classes carries must live on THIS law table too, or macrs_tax_depreciation_for_year's
-- `order by effective_from desc limit 1` silently picks one of two overlapping active
-- rows). One active % per (jurisdiction, recovery_period, convention, method, year_index),
-- and no two active rows whose effective ranges overlap.
create unique index if not exists macrs_percentages_one_active
  on public.macrs_percentages (jurisdiction_code, recovery_period, convention, macrs_method, year_index)
  where effective_to is null and is_active;
alter table public.macrs_percentages drop constraint if exists macrs_percentages_no_overlap;
alter table public.macrs_percentages
  add constraint macrs_percentages_no_overlap
  exclude using gist (
    jurisdiction_code with =,
    recovery_period   with =,
    convention        with =,
    macrs_method      with =,
    year_index        with =,
    daterange(effective_from, effective_to + 1, '[)') with &&
  ) where (is_active);
comment on table public.macrs_percentages is
  'LAW-DERIVED: IRS published MACRS percentage tables (Pub 946 App. A). DATA, never literals — the engine looks up percentage by (recovery_period, convention, method, year_index). Effective-dated + cited.';

-- ── 3. fixed_assets — the REGISTER (per-org tenant data) ──────────────────────
create table if not exists public.fixed_assets (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null,                 -- 'MacBook Pro 16"'
  description        text,
  jurisdiction_code  text not null default 'US-FED' references public.tax_jurisdictions(code),
  class_key          text not null,                 -- FK-by-key to asset_classes (resolved by year at compute time)
  cost_minor         bigint not null check (cost_minor > 0),  -- capitalized cost (minor units)
  salvage_minor      bigint not null default 0 check (salvage_minor >= 0),  -- book salvage; MACRS ignores salvage
  in_service_date    date not null,                 -- placed-in-service date (drives conventions + year)
  -- BOOK method (straight-line by default); TAX method comes from the asset class (MACRS).
  book_method        text not null default 'straight_line'
                       check (book_method in ('straight_line','none')),
  book_life_years    numeric not null default 5 check (book_life_years > 0),  -- useful life for book SL
  book_convention    text not null default 'half_year'
                       check (book_convention in ('half_year','mid_quarter','mid_month','full_month')),
  -- tax elections (year-scoped law limits live in asset_classes; these are the
  -- org's ELECTIONS, tenant data):
  section_179_elected_minor bigint not null default 0 check (section_179_elected_minor >= 0),
  bonus_elected      boolean not null default false, -- did the org elect bonus for this asset
  -- ledger wiring: which accounts the book depreciation posts against.
  asset_account_id            uuid references public.ledger_accounts(id),  -- the asset (Dr on acquisition; informational)
  expense_account_id          uuid references public.ledger_accounts(id),  -- Dr depreciation expense
  accumulated_account_id      uuid references public.ledger_accounts(id),  -- Cr accumulated depreciation (contra-asset)
  status             text not null default 'active' check (status in ('active','disposed','fully_depreciated')),
  disposed_on        date,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists fixed_assets_org on public.fixed_assets (org_id, status);
alter table public.fixed_assets enable row level security;
drop policy if exists fixed_assets_select on public.fixed_assets;
create policy fixed_assets_select on public.fixed_assets
  for select using (can_access_org(org_id));
drop policy if exists fixed_assets_nowrite on public.fixed_assets;
create policy fixed_assets_nowrite on public.fixed_assets
  for all using (false) with check (false);          -- writes only via the gated RPCs (service_role)
grant select on public.fixed_assets to authenticated;
grant select, insert, update, delete on public.fixed_assets to service_role;
comment on table public.fixed_assets is
  'Fixed-asset register (tenant data). One row per capitalized asset. Book method (SL) + tax method (MACRS via asset_classes) computed by Penny; NEVER hand-entered depreciation. Writes via register_fixed_asset / dispose_fixed_asset (CPA/owner-gated, service_role).';

-- ── 4. depreciation_schedule_lines — the COMPUTED subledger detail ────────────
-- Book + tax depreciation per asset per tax year. Penny computes and stores these;
-- the book row drives the posting, the book-vs-tax delta drives the M-1 draft.
create table if not exists public.depreciation_schedule_lines (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  asset_id           uuid not null references public.fixed_assets(id) on delete cascade,
  tax_year           int  not null,
  book_depreciation_minor bigint not null default 0,   -- book (straight-line) depreciation this year
  tax_depreciation_minor  bigint not null default 0,   -- tax (MACRS + §179 + bonus) depreciation this year
  book_accumulated_minor  bigint not null default 0,   -- running book accumulated depreciation
  tax_accumulated_minor   bigint not null default 0,   -- running tax accumulated depreciation
  -- book-vs-tax difference this year = tax - book (positive = extra tax deduction).
  -- Its sign selects the M-1 bucket when drafted (see rpc migration).
  posted_entry_id    uuid references public.journal_entries(id),  -- the book depreciation JE (null until posted)
  m1_adjustment_id   uuid references public.tax_adjustments(id),  -- the drafted M-1 adjustment (null until drafted)
  computed_at        timestamptz not null default now(),
  unique (asset_id, tax_year)
);
create index if not exists depreciation_schedule_org_year
  on public.depreciation_schedule_lines (org_id, tax_year);
alter table public.depreciation_schedule_lines enable row level security;
drop policy if exists depreciation_schedule_select on public.depreciation_schedule_lines;
create policy depreciation_schedule_select on public.depreciation_schedule_lines
  for select using (can_access_org(org_id));
drop policy if exists depreciation_schedule_nowrite on public.depreciation_schedule_lines;
create policy depreciation_schedule_nowrite on public.depreciation_schedule_lines
  for all using (false) with check (false);
grant select on public.depreciation_schedule_lines to authenticated;
grant select, insert, update, delete on public.depreciation_schedule_lines to service_role;
comment on table public.depreciation_schedule_lines is
  'COMPUTED book + tax depreciation per asset per year (the subledger detail). Book row drives the JE posting; (tax - book) delta drives the M-1 draft. Penny computes; posting/M-1 are separate gated steps.';

-- ── 5. asset_disposals — disposal event with computed gain/loss ───────────────
create table if not exists public.asset_disposals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  asset_id           uuid not null references public.fixed_assets(id) on delete cascade,
  disposal_date      date not null,
  proceeds_minor     bigint not null default 0 check (proceeds_minor >= 0),
  -- computed at disposal time and stored (book basis = cost - book accumulated):
  book_basis_minor   bigint not null,               -- net book value at disposal
  gain_loss_minor    bigint not null,               -- proceeds - book_basis (positive = gain, negative = loss)
  posted_entry_id    uuid references public.journal_entries(id),
  note               text,
  disposed_by        uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  unique (asset_id)                                  -- one disposal per asset
);
create index if not exists asset_disposals_org on public.asset_disposals (org_id);
alter table public.asset_disposals enable row level security;
drop policy if exists asset_disposals_select on public.asset_disposals;
create policy asset_disposals_select on public.asset_disposals
  for select using (can_access_org(org_id));
drop policy if exists asset_disposals_nowrite on public.asset_disposals;
create policy asset_disposals_nowrite on public.asset_disposals
  for all using (false) with check (false);
grant select on public.asset_disposals to authenticated;
grant select, insert, update, delete on public.asset_disposals to service_role;
comment on table public.asset_disposals is
  'Asset disposal events. gain_loss = proceeds - net book value, computed and stored. Feeds the disposal JE + subledger status update.';

-- ── 6. read-only public read on the LAW DATA (asset_classes / macrs_percentages) ─
-- Platform tax facts (no tenant data) — authenticated/anon read, seed-loader
-- (service_role) writes only. Mirrors the tax_forms / kernel RLS stance.
alter table public.asset_classes      enable row level security;
alter table public.macrs_percentages  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['asset_classes','macrs_percentages']
  loop
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for select to authenticated, anon using (true);',
      t||'_read', t, t||'_read', t);
  end loop;
end $$;
grant select on public.asset_classes, public.macrs_percentages to authenticated, anon;
grant select, insert, update, delete on
  public.asset_classes, public.macrs_percentages to service_role;
