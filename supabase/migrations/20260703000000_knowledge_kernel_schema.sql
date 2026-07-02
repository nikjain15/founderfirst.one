-- CENTRAL-2 — Knowledge kernel schema (Roadmap principle 3b: business knowledge
-- is SEED DATA every app projects from — add a row, every surface updates).
--
-- WHAT: five platform-level knowledge tables + an idempotent loader contract.
--   entity_types       — "what am I?" (label, plain-language desc, diagnostic Qs,
--                        owner-draw + officer-comp treatment, forms filed)
--   industries         — sectors (ports+extends demo industries.json: CoA template
--                        ref, payment methods, vendor priors, tax quirks, marketing
--                        blurb, Signals queries)
--   filing_obligations — jurisdiction × entity × tax-year: form due dates, quarterly
--                        estimates, 1099 issuance, extensions  (LAW-DERIVED)
--   vendor_priors      — platform-level vendor→category first-guess (NOT per-org rules)
--   connectors         — provider registry (qbo/xero/plaid: name, logo, capabilities)
--
-- KEY ALIGNMENT (docs/plans/research/tax-mapping-research.md §B):
--   * jurisdiction codes are 'US-FED' + 'US-<STATE>' (matches tax_jurisdictions.code
--     'US-FED'/'US-CA' shape in the research doc).
--   * entity_type values are the research doc's exact set:
--     'sole_prop' | 's_corp' | 'c_corp' | 'partnership' | 'nonprofit'.
--   * filing_obligations references entity_type + tax_year the same way tax_forms
--     will (jurisdiction, form_code, entity_type, tax_year), so W1.3-B's tax tables
--     and this filing calendar share keys — a form and its due date line up by
--     (jurisdiction_code, entity_type, tax_year, form_code).
--   * stable semantic keys everywhere (entity_types.key, industries.key,
--     filing_obligations.obligation_key) so annual re-seeds never orphan references
--     — the same discipline as tax_form_lines.line_key.
--
-- LAW LIFECYCLE (Roadmap principle 3c): every law-derived row carries
--   effective_from / effective_to + a source citation. A change is a NEW row that
--   supersedes the old; OLD periods still compute under OLD law. Nothing is
--   overwritten. filing_obligations is the law-derived table here (due dates,
--   thresholds, %); entity_types/industries/vendor_priors/connectors are reference
--   data (effective-dated only where a value is legally time-bound).
--
-- WRITE-DON'T-DEPLOY: this migration is committed, not applied. The idempotent
-- seed loader (scripts/seed-kernel.ts) fills rows as pure data; a new sector or
-- state is a seed edit, zero schema change.

-- ── entity_types ────────────────────────────────────────────────────────────
-- Reference data. No enum: entity kinds are rows so a new structure (e.g. a
-- co-op) is a seed insert, not a code+enum change.
create table if not exists public.entity_types (
  key                  text primary key,          -- 'sole_prop','s_corp','c_corp','partnership','nonprofit'
  label                text not null,             -- 'S corporation'
  short_label          text,                      -- 'S-corp'
  description          text not null,             -- plain-language "what am I?"
  diagnostic_questions jsonb not null default '[]'::jsonb,  -- [{q, helps_pick}] for the not-sure flow
  owner_draw_treatment text not null,             -- 'equity_distribution' | 'wages' | 'guaranteed_payment' | 'na'
  officer_comp_rule    text,                      -- plain-language reasonable-comp / no-comp note
  forms_filed          jsonb not null default '[]'::jsonb,   -- [{form_code, jurisdiction, note}]
  files_balance_sheet  boolean not null default false,
  sort_order           int not null default 0,
  is_active            boolean not null default true,
  updated_at           timestamptz not null default now()
);
comment on table public.entity_types is
  'Platform knowledge: business entity structures. Seed data (scripts/seed-kernel.ts). Consumed by onboarding, tax engine, Penny explanations, marketing.';

-- ── industries ──────────────────────────────────────────────────────────────
-- Supersedes apps/demo industries.json. Reference data; the CoA-template ref and
-- Signals queries make "add a sector = one row" true across onboarding + Signals.
create table if not exists public.industries (
  key               text primary key,             -- 'consulting','trades','retail',…
  label             text not null,
  icon              text,                          -- lucide icon name (design-system owns the glyph)
  coa_template_ref  text,                          -- id of the CoA template to seed (W1.3-B / catch-up)
  payment_methods   jsonb not null default '[]'::jsonb,
  vendor_priors     jsonb not null default '[]'::jsonb,   -- [{vendor, category}] sector-typical
  expense_categories jsonb not null default '[]'::jsonb,
  banks             jsonb not null default '[]'::jsonb,
  tax_quirks        jsonb not null default '[]'::jsonb,   -- ['COGS-heavy','booth-rent',…] — hints, NOT law
  marketing_blurb   text,                          -- per-sector landing-page copy (VOICE.md)
  signals_queries   jsonb not null default '[]'::jsonb,   -- social-listening search strings
  sample_income_vendor text,
  sample_income_label  text,
  sample_expense_vendor text,
  sample_expense_label  text,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  updated_at        timestamptz not null default now()
);
comment on table public.industries is
  'Platform knowledge: sectors/personas. Seed data supersedes demo industries.json. Consumed by onboarding tiles, CoA seeding, categorize hints, per-sector pages, Signals source generation.';

-- ── filing_obligations ──────────────────────────────────────────────────────
-- LAW-DERIVED, effective-dated (principle 3c). jurisdiction × entity × tax-year.
-- One row per obligation (a form due date, a quarterly estimate, 1099 issuance,
-- an extension). Superseding a due date = insert a new row with a later
-- effective_from; the old row keeps its effective_to so old periods compute under
-- old law.
create table if not exists public.filing_obligations (
  id                uuid primary key default gen_random_uuid(),
  jurisdiction_code text not null,                 -- 'US-FED','US-CA' (aligns tax_jurisdictions.code)
  entity_type       text not null references public.entity_types(key),
  tax_year          int  not null,                 -- the tax year the obligation is FOR
  obligation_key    text not null,                 -- STABLE: 'annual_return','q1_estimate','1099_nec_issue','extension'
  kind              text not null,                 -- 'annual_return'|'estimate'|'information_return'|'extension'|'other'
  form_code         text,                          -- 'SCH_C','1120S','1099-NEC','7004' — joins tax_forms later
  label             text not null,                 -- 'S-corp annual return (Form 1120-S)'
  due_month         int  not null check (due_month between 1 and 12),
  due_day           int  not null check (due_day between 1 and 31),
  due_year_offset   int  not null default 1,       -- 0 = within tax year (estimates), 1 = following year (returns)
  threshold_minor   bigint,                         -- e.g. 1099 issuance threshold, in minor units (law-versioned)
  notes             text,
  -- law lifecycle (principle 3c):
  effective_from    date not null,                 -- when THIS rule takes effect (not just tax-year — mid-year changes happen)
  effective_to      date,                          -- null = still in force; set when a superseding row lands
  citation          text not null,                 -- IRS rev-proc / bill / instruction URL
  source            text not null default 'seed',  -- 'seed' | 'regulatory_watcher' (LOOP-2)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
comment on table public.filing_obligations is
  'LAW-DERIVED knowledge: filing calendar per jurisdiction×entity×year. Effective-dated + cited (Roadmap 3c). Consumed by coming-up cards, email nudges, tax package checklist. A change is a NEW superseding row; old periods keep old law.';

create index if not exists filing_obligations_lookup
  on public.filing_obligations (jurisdiction_code, entity_type, tax_year, obligation_key);
-- Natural key for the idempotent loader's ON CONFLICT: a corrected seed re-runs
-- (same effective_from = update in place); a supersede is a NEW effective_from =
-- a new row, never overwriting old law.
create unique index if not exists filing_obligations_natural_key
  on public.filing_obligations (jurisdiction_code, entity_type, tax_year, obligation_key, effective_from);
-- one active rule per (jurisdiction, entity, year, obligation) at a time — the
-- effective-dating invariant. Superseding requires closing the old row first.
create unique index if not exists filing_obligations_one_active
  on public.filing_obligations (jurisdiction_code, entity_type, tax_year, obligation_key)
  where effective_to is null and is_active;

-- STRONGER effective-dating invariant: no two ACTIVE rows for one key may have
-- OVERLAPPING effective windows — not just at the open end. The one_active index
-- above only guards effective_to IS NULL rows; two rows with overlapping *closed*
-- windows (or a closed window overlapping an open one) would otherwise both be "in
-- force" for some as_of, and filing_obligations_for()'s distinct-on would silently
-- pick one — a wrong-law lookup with no error. An EXCLUDE over the daterange makes
-- that state impossible to insert. effective_to is INCLUSIVE (filing_obligations_for
-- uses effective_to >= as_of), so the range upper bound is effective_to + 1 day,
-- half-open '[)'. A null effective_to = 'infinity'.
create extension if not exists btree_gist;
alter table public.filing_obligations
  add constraint filing_obligations_no_overlap
  exclude using gist (
    jurisdiction_code with =,
    entity_type       with =,
    tax_year          with =,
    obligation_key    with =,
    daterange(effective_from, effective_to + 1, '[)') with &&
  ) where (is_active);

-- ── vendor_priors ───────────────────────────────────────────────────────────
-- PLATFORM-LEVEL vendor→category first-guess. Explicitly SEPARATE from per-org
-- learned rules (categorization_rules) — no cross-tenant leakage: these are public
-- facts ("AWS → Cloud hosting"), not any org's data.
create table if not exists public.vendor_priors (
  id              uuid primary key default gen_random_uuid(),
  match_pattern   text not null,                   -- ILIKE pattern against memo/vendor, ESCAPE-safe (CAT-F4)
  vendor_label    text not null,                   -- canonical display 'Amazon Web Services'
  category_hint   text not null,                   -- semantic category key 'cloud_hosting' (joins CoA/tax later)
  industry_key    text references public.industries(key),  -- null = all industries
  confidence      numeric not null default 0.7 check (confidence between 0 and 1),
  is_active       boolean not null default true,
  updated_at      timestamptz not null default now()
);
-- Expression unique (table-level UNIQUE can't hold an expression) so a null
-- industry_key ("all sectors") is one distinct slot per match_pattern. The
-- loader's ON CONFLICT target matches this index exactly.
create unique index if not exists vendor_priors_pattern_industry
  on public.vendor_priors (match_pattern, coalesce(industry_key, ''));
comment on table public.vendor_priors is
  'Platform knowledge: vendor→category priors (first-guess). SEPARATE from per-org learned rules — public facts, no tenant data. Consumed by categorize first-guess in app, catch-up, imports.';

-- ── connectors ──────────────────────────────────────────────────────────────
-- Provider registry behind ONE provider interface (Roadmap 3b). Adding Shopify =
-- one interface impl + one row here; the Connections tab, marketing "works with"
-- strip, and import flows all read this.
create table if not exists public.connectors (
  key           text primary key,                  -- 'qbo','xero','plaid' (matches external_provider enum for qbo/xero)
  name          text not null,                     -- 'QuickBooks Online'
  category      text not null,                     -- 'accounting' | 'bank_feed' | 'commerce'
  logo_ref      text,                              -- design-system asset id (no inline SVG/URL)
  capabilities  jsonb not null default '[]'::jsonb, -- ['import_history','live_sync','coa_pull','bank_feed']
  scopes        jsonb not null default '[]'::jsonb, -- OAuth scopes requested
  status        text not null default 'available', -- 'available' | 'beta' | 'planned'
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now()
);
comment on table public.connectors is
  'Platform knowledge: connector/provider registry. Consumed by Connections tab, marketing works-with strip, import flows. Adding a provider = one row.';

-- ── RLS: knowledge is public read; writes are seed-loader (service_role) only ─
-- These tables hold NO tenant data — every row is a platform fact. Authenticated
-- users may read (onboarding tiles, connector list); nobody but the service role
-- (the loader) writes. RLS on with a read policy; no write policy = service_role
-- (which bypasses RLS) is the only writer, matching how seeds are loaded.
alter table public.entity_types       enable row level security;
alter table public.industries         enable row level security;
alter table public.filing_obligations enable row level security;
alter table public.vendor_priors      enable row level security;
alter table public.connectors         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['entity_types','industries','filing_obligations','vendor_priors','connectors']
  loop
    execute format(
      'drop policy if exists %I on public.%I; create policy %I on public.%I for select to authenticated, anon using (true);',
      t||'_read', t, t||'_read', t);
  end loop;
end $$;

grant select on public.entity_types, public.industries, public.filing_obligations,
                public.vendor_priors, public.connectors to authenticated, anon;
