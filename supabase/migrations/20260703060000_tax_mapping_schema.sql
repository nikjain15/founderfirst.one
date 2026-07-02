-- W1.3-B — Data-driven tax mapping engine schema (research §B).
-- STACKED ON CENTRAL-2 (#177): tax tables key off the SAME jurisdiction/entity/
-- tax_year/form_code keys the knowledge kernel established, so a form and its
-- filing due date line up by (jurisdiction_code, entity_type, tax_year, form_code)
-- and nothing re-invents them.
--
-- KEY ALIGNMENT (research §B, CENTRAL-2 schema header):
--   * tax_jurisdictions.code       == filing_obligations.jurisdiction_code  ('US-FED','US-CA','CA-FED')
--   * tax_forms.entity_type        FK-> entity_types(key)                   (kernel is the authority)
--   * tax_forms (jurisdiction, form_code, entity_type, tax_year)           == the kernel join key
--   * STABLE semantic keys everywhere: tax_form_lines.line_key, mapping rules and
--     org overrides reference (form_code, line_key) — NOT display line numbers —
--     so an annual re-seed never orphans a CPA's mapping (research §B.0.2).
--
-- WHAT (research §B.1 — 4 tables this card owns + the additive ledger column):
--   tax_jurisdictions   — countries / sub-national authorities (rows, not code).
--   tax_forms           — per jurisdiction × entity_type × TAX YEAR (year-versioned).
--   tax_form_lines      — the rows of a form + its sub-schedules; carry deductibility
--                         metadata (deductible_pct, flows_to) that drives M-1.
--   tax_mapping_rules   — SEEDED ledger-account -> line rules, priority-ordered.
--   + org_account_tax_map  — the CPA-editable override layer (wins over all rules).
--   + tax_adjustments      — the M-1 book-tax difference layer (Penny DRAFTS, human approves).
--   + ledger_accounts.tags — the ONLY ledger touch (additive; tags feed tag-rules,
--                            owner-scoped M-2/K-1, officer-comp, fixed-asset lists).
--
-- LAW LIFECYCLE (Roadmap 3c): tax_forms + tax_form_lines are LAW-DERIVED — they
-- carry effective_from / effective_to + citation, and reuse CENTRAL-2's exact
-- idiom: a btree_gist EXCLUDE constraint makes overlapping active windows
-- impossible, a supersede fn (migration ...060100) is the only way to version a
-- line, and a *_for() lookup returns the row in force as of a date. Mapping RULES
-- and the seed line SET for a (form_code, tax_year) are re-seedable data; a within-
-- year law CHANGE to a line (e.g. meals % move) is a supersede, not an overwrite.
--
-- WRITE-DON'T-DEPLOY: committed, not applied. Seeds load via scripts/seed-tax.ts
-- into supabase/seeds/tax/_generated.sql, \i-included from supabase/seed.sql.

create extension if not exists btree_gist;

-- ── 1. tax_jurisdictions ─────────────────────────────────────────────────────
-- Reference data. code is the SAME string used by filing_obligations.jurisdiction_code
-- so the kernel filing calendar and this tax engine share one jurisdiction vocab.
create table if not exists public.tax_jurisdictions (
  code          text primary key,                  -- 'US-FED','US-CA','CA-FED' (== filing_obligations.jurisdiction_code)
  name          text not null,                      -- 'United States — Federal (IRS)'
  country_code  char(2) not null,                   -- 'US','CA'
  currency      char(3) not null,                   -- 'USD','CAD'
  parent_code   text references public.tax_jurisdictions(code),  -- 'US-CA'.parent = 'US-FED' (state under federal)
  params        jsonb not null default '{}'::jsonb, -- jurisdiction-wide year-keyed params (thresholds live in kernel; this is for jurisdiction-scoped extras)
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now()
);
comment on table public.tax_jurisdictions is
  'Tax authorities. code aligns filing_obligations.jurisdiction_code (CENTRAL-2). A new country/state is ONE row (research §B.0.1). States: extensible by seed alone — a US-<STATE> row + a form seed file, zero code.';

-- ── 2. tax_forms — per jurisdiction × entity_type × TAX YEAR (law-derived) ────
create table if not exists public.tax_forms (
  id                uuid primary key default gen_random_uuid(),
  jurisdiction_code text not null references public.tax_jurisdictions(code),
  form_code         text not null,                  -- 'SCH_C','1120S','1120','1065','T2125'
  entity_type       text not null references public.entity_types(key),  -- kernel is the authority (research §B alignment)
  tax_year          int  not null,
  name              text not null,                  -- 'Schedule C (Form 1040)'
  params            jsonb not null default '{}'::jsonb,  -- form-level thresholds (schedule_l_required_over, balance_sheet_required)
  status            text not null default 'active' check (status in ('active','draft','superseded')),
  -- law lifecycle (principle 3c) — same columns/idiom as filing_obligations:
  effective_from    date not null,
  effective_to      date,                            -- null = still in force
  citation          text not null,                   -- IRS/CRA form + year instructions URL
  source            text not null default 'seed',    -- 'seed' | 'regulatory_watcher' (LOOP-2)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  -- CPA-lens gate lives in the RPCs; C-corp (1120) is seeded but its package is
  -- gated per the research decision (seed lines, defer package polish).
  unique (jurisdiction_code, form_code, tax_year, effective_from)
);
create index if not exists tax_forms_lookup
  on public.tax_forms (jurisdiction_code, form_code, tax_year);
create index if not exists tax_forms_entity
  on public.tax_forms (jurisdiction_code, entity_type, tax_year);
-- one active form per (jurisdiction, form, year) at a time; a supersede closes the
-- old row first (mirrors filing_obligations_one_active).
create unique index if not exists tax_forms_one_active
  on public.tax_forms (jurisdiction_code, form_code, tax_year)
  where effective_to is null and is_active;
-- STRONGER: no two ACTIVE rows for one (jurisdiction, form, year) may OVERLAP in
-- their effective windows — not just at the open end. Same daterange EXCLUDE as
-- filing_obligations_no_overlap. effective_to INCLUSIVE, half-open '[)'.
alter table public.tax_forms
  drop constraint if exists tax_forms_no_overlap;
alter table public.tax_forms
  add constraint tax_forms_no_overlap
  exclude using gist (
    jurisdiction_code with =,
    form_code         with =,
    tax_year          with =,
    daterange(effective_from, effective_to + 1, '[)') with &&
  ) where (is_active);
comment on table public.tax_forms is
  'LAW-DERIVED: a tax form for a jurisdiction × entity × year. Year-versioned + effective-dated + cited (Roadmap 3c). A within-year change is a NEW superseding row (supersede_tax_form); old periods compute under old law.';

-- ── 3. tax_form_lines — the rows of a form + sub-schedules (law-derived) ──────
create table if not exists public.tax_form_lines (
  id             uuid primary key default gen_random_uuid(),
  form_id        uuid not null references public.tax_forms(id) on delete cascade,
  line_key       text not null,                     -- STABLE semantic key: 'advertising','meals','officer_comp','sch_l_cash','m2_distributions'
  line_code      text,                              -- display: '8','24b','Part III·36','L·1','8521' (null for info lines)
  label          text not null,
  section        text not null check (section in
                  ('income','cogs','deductions','balance_sheet','equity_rollforward','info')),
  sort_order     int not null default 0,
  kind           text not null default 'amount' check (kind in ('amount','computed','subtotal','info')),
  deductible_pct numeric,                            -- null = 100; 50 for meals; 0 for penalties/entertainment — drives M-1
  flows_to       text,                              -- null | a form name ('1040 Schedule 1') | 'disallowed'
  notes          text,
  unique (form_id, line_key)
);
create index if not exists tax_form_lines_form on public.tax_form_lines (form_id, sort_order);
comment on table public.tax_form_lines is
  'Lines of a tax form. Mappings target the STABLE line_key (not line_code) so annual re-seeds do not orphan CPA work (research §B.0.2). deductible_pct/flows_to are the M-1 metadata: meals 50, entertainment/penalties 0, SEP flows_to Schedule 1.';

-- ── 4. tax_mapping_rules — SEEDED account -> line (priority-ordered) ──────────
create table if not exists public.tax_mapping_rules (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.tax_forms(id) on delete cascade,
  priority    int  not null,                        -- lower wins: code-range 10, tag 20, name-pattern 30, type-fallback 40
  match_kind  text not null check (match_kind in
                ('account_code_range','account_tag','account_name_pattern','account_type')),
  match_value text not null,                         -- '6100-6199' | 'meals' | '%advertis%' (ILIKE, ESCAPE-safe) | 'expense'
  line_key    text not null,                         -- target line on this form
  is_seed     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists tax_mapping_rules_form on public.tax_mapping_rules (form_id, priority);
comment on table public.tax_mapping_rules is
  'Seeded, priority-ordered account->line rules per form. Evaluation: CPA override (org_account_tax_map) wins, else lowest-priority match, else UNMAPPED (research §B.2). ILIKE patterns are ESCAPE-safe (CAT-F4 lesson).';

-- ── 5. org_account_tax_map — THE CPA-editable override layer ──────────────────
-- Keyed by (form_code, line_key) NOT line id, so it survives annual re-seeds
-- (research §B.1.5). Effective-dated by tax_year_from (null = all years).
create table if not exists public.org_account_tax_map (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  account_id    uuid not null references public.ledger_accounts(id) on delete cascade,
  form_code     text not null,                        -- survives re-seed: keyed by code + line_key, not line id
  line_key      text not null,
  tax_year_from int,                                  -- effective-dated; null = all years
  set_by        uuid references auth.users(id),
  note          text,
  created_at    timestamptz not null default now()
);
-- one override per (org, account, form, year-window). coalesce(tax_year_from,0)
-- collapses "all years" to a single slot (research §B.1.5).
create unique index if not exists org_account_tax_map_unique
  on public.org_account_tax_map (org_id, account_id, form_code, coalesce(tax_year_from, 0));
create index if not exists org_account_tax_map_org on public.org_account_tax_map (org_id);
alter table public.org_account_tax_map enable row level security;
drop policy if exists org_account_tax_map_select on public.org_account_tax_map;
create policy org_account_tax_map_select on public.org_account_tax_map
  for select using (can_access_org(org_id));               -- owners READ (research decision 3)
drop policy if exists org_account_tax_map_nowrite on public.org_account_tax_map;
create policy org_account_tax_map_nowrite on public.org_account_tax_map
  for all using (false) with check (false);                 -- writes only via the CPA-gated RPC (service_role)
grant select on public.org_account_tax_map to authenticated;
grant select, insert, update, delete on public.org_account_tax_map to service_role;
comment on table public.org_account_tax_map is
  'CPA-editable per-account tax-line override. Owners READ (RLS), only CPA-role writes via set_account_tax_line() (research decision 3). Keyed by form_code+line_key to survive annual re-seeds.';

-- ── 6. tax_adjustments — the M-1 book-tax difference layer ────────────────────
-- Penny DRAFTS mechanical differences as status='proposed'; a human approves
-- (research §B.0.5, decision 4). NEVER auto-posted to the books — the books stay
-- book-basis; this layer is the M-1 home only.
create table if not exists public.tax_adjustments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  tax_year    int  not null,
  form_id     uuid references public.tax_forms(id),
  line_key    text,                                  -- optional: which return line it adjusts
  m1_bucket   text not null check (m1_bucket in
                ('income_on_books_not_return','expense_on_books_not_return',
                 'income_on_return_not_books','deduction_on_return_not_books')),
  kind        text not null default 'permanent' check (kind in ('permanent','temporary')),
  amount_minor bigint not null,                      -- always positive; bucket carries the direction
  memo        text,
  source      text not null default 'cpa_entered' check (source in ('penny_proposed','cpa_entered')),
  status      text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  origin_kind text,                                  -- 'meals_disallowance'|'penalties'|'depreciation_book_tax'|... (W1.3-C feeds 'depreciation_book_tax')
  origin_ref  text,                                  -- idempotency: e.g. 'meals:2025' so Penny re-draft is a no-op, not a dup
  created_by  uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists tax_adjustments_org_year on public.tax_adjustments (org_id, tax_year, status);
-- idempotent Penny drafts: one proposal per (org, year, origin_ref). A re-run of
-- the draft RPC updates the pending row, never duplicates it. origin_ref null =
-- free-form CPA entry (no dedupe). Partial unique so multiple CPA entries coexist.
create unique index if not exists tax_adjustments_origin
  on public.tax_adjustments (org_id, tax_year, origin_ref)
  where origin_ref is not null and status <> 'rejected';
alter table public.tax_adjustments enable row level security;
drop policy if exists tax_adjustments_select on public.tax_adjustments;
create policy tax_adjustments_select on public.tax_adjustments
  for select using (can_access_org(org_id));
drop policy if exists tax_adjustments_nowrite on public.tax_adjustments;
create policy tax_adjustments_nowrite on public.tax_adjustments
  for all using (false) with check (false);          -- writes only via draft/approve RPCs (service_role)
grant select on public.tax_adjustments to authenticated;
grant select, insert, update, delete on public.tax_adjustments to service_role;
comment on table public.tax_adjustments is
  'M-1 book-tax difference layer. Penny DRAFTS (source=penny_proposed, status=proposed); a human approves via approve_tax_adjustment() — NEVER auto-posted (research §B.0.5). W1.3-C depreciation feeds origin_kind=depreciation_book_tax.';

-- ── 7. read-only public read on the DATA (jurisdictions/forms/lines/rules) ────
-- These are platform tax facts (no tenant data) — authenticated read, seed-loader
-- (service_role) writes only. Mirrors the kernel RLS stance.
alter table public.tax_jurisdictions  enable row level security;
alter table public.tax_forms          enable row level security;
alter table public.tax_form_lines     enable row level security;
alter table public.tax_mapping_rules  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tax_jurisdictions','tax_forms','tax_form_lines','tax_mapping_rules']
  loop
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for select to authenticated, anon using (true);',
      t||'_read', t, t||'_read', t);
  end loop;
end $$;
grant select on public.tax_jurisdictions, public.tax_forms, public.tax_form_lines,
                public.tax_mapping_rules to authenticated, anon;
grant select, insert, update, delete on
  public.tax_jurisdictions, public.tax_forms, public.tax_form_lines,
  public.tax_mapping_rules to service_role;

-- ── 8. the ONLY ledger touch: additive tags column (research §B.1) ───────────
-- Owner-scoped tags ('owner:<id>') let equity accounts feed per-shareholder/
-- partner M-2 / basis / K-1 without a subledger; 'meals'/'officer_comp'/
-- 'fixed_asset'/'distribution' drive tag-rules and the equity/fixed-asset reports.
alter table public.ledger_accounts
  add column if not exists tags text[] not null default '{}';
create index if not exists ledger_accounts_tags on public.ledger_accounts using gin (tags);
comment on column public.ledger_accounts.tags is
  'Tax/reporting tags (additive, research §B.1). e.g. {meals,officer_comp,fixed_asset,distribution,owner:<uuid>}. Feeds tag mapping rules + M-2/K-1/officer-comp/fixed-asset reports. The ledger stays otherwise tax-ignorant.';
