-- Definer-tenant guard — CI gate + the SEC-3-class fixes it found ------------
--
-- The 6-Jul weekly audit (PR #301) found 4 P0 + 2 P1 `security definer` read
-- RPCs granted `to authenticated` that trusted a caller-supplied `p_org_id` /
-- `p_asset_id` with no `can_access_org` membership check — DEFINER bypasses the
-- base table's RLS, so any authenticated user could pass another tenant's id
-- and read its data. That was the SECOND time this exact shape recurred (after
-- the Wave-3 F1 `owner_asks_this_week` leak), so the audit proposed graduating
-- it into a LEARNINGS rule. PR #309 (SEC-3) fixed the 4 confirmed P0 instances
-- (resolve_account_tax_lines / tax_unmapped_accounts / tax_m1_summary /
-- fixed_asset_listing) — but nothing stopped a FIFTH instance from shipping
-- undetected before the next audit. This migration:
--
--  1. Adds `scripts/check-definer-tenant-guard.ts` (wired into `pnpm build` and
--     CI — see package.json / .github/workflows/pages.yml), which parses every
--     migration's SECURITY DEFINER functions and fails the build if one is
--     granted to `authenticated`, takes an org-scoping parameter, and never
--     calls a membership check. Run it against `origin/main` as of this
--     writing and it found, beyond the 4 already known: `resolve_account_tax_
--     lines` / `tax_unmapped_accounts` / `tax_m1_summary` / `fixed_asset_
--     listing` STILL UNFIXED on main (PR #309 not yet merged), PLUS TWO NEW
--     instances no one had found: `upcoming_filing_deadlines` (leaks another
--     org's entity_type/jurisdiction + filing-deadline list) and
--     `ninetynine_nec_threshold_minor` (leaks another org's entity_type via a
--     different path). A third candidate, `get_effective_behavior_config`, is
--     addressed below (a real gap, deliberately NOT auto-fixed here).
--
--  2. Re-applies the SEC-3 fix (verbatim from PR #309's migration) for the 4
--     already-known functions, so THIS branch's own CI is green under the new
--     guard regardless of merge order against #309 — CREATE OR REPLACE is
--     idempotent, so whichever of the two PRs merges second is a harmless
--     no-op re-application of the identical guard, not a conflict or a
--     behavior change. (Verified: byte-identical to PR #309's bodies for these
--     four functions.)
--
--  3. Fixes the two NEW instances (`upcoming_filing_deadlines`,
--     `ninetynine_nec_threshold_minor`) with the same `can_access_org(...)`
--     pattern — both are purely client-facing (verified: no service-role/edge-
--     fn caller depends on an unauthenticated read of either), so the guard is
--     safe to add unconditionally.
--
-- `get_effective_behavior_config(p_org)` is DELIBERATELY NOT fixed here: it is
-- granted to `anon, authenticated` BY DESIGN (pre-auth callers need the
-- platform-default read with p_org = null) AND is called from THREE edge fns
-- (receipts, categorize, invoicing) via a service-role client with no per-user
-- JWT — `auth.uid()` is null in that context, so a blanket `can_access_org`
-- guard would break those legitimate backend reads, not just close the leak.
-- The leak itself is low-severity (org-tuned autonomy thresholds — asks/week,
-- confidence cutoffs, SLA days; no financial/PII data) and needs a caller-
-- role-aware fix (e.g. `auth.role() = 'service_role' or p_org is null or
-- can_access_org(p_org)`) that this migration does not attempt to verify
-- end-to-end against a live service-role caller. Disclosed as a follow-up
-- (BACKLOG DEFINER-GUARD-2), not silently dropped — flagged in the guard's own
-- source via `-- definer-ok:` so it's a documented exemption, not a silent gap.

-- ═══════════════════════════════════════════════════════════════════════════
-- Re-apply SEC-3 (PR #309) — verbatim, idempotent
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- Two NEW instances the guard found (not in PR #301 or #309)
-- ═══════════════════════════════════════════════════════════════════════════

-- upcoming_filing_deadlines — previously trusted p_org_id alone; leaked another
-- org's entity_type/jurisdiction_code (org_accounting_settings) plus its
-- resolved filing-deadline list. Client-facing only (apps/app/src/ledger/
-- api.ts via the user's own session) — no service-role caller, safe to gate
-- unconditionally.
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
       and can_access_org(p_org_id)
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
comment on function public.upcoming_filing_deadlines is
  'CENTRAL-2 consumer: filing deadlines due within a horizon for an org, resolved from filing_obligations via the kernel (effective-dated). Feeds "Coming up" cards + email nudges. Deadlines are never hardcoded — change a seed row and every reminder moves (Roadmap 3c). Definer-guard: gated on can_access_org(p_org_id) — a non-member gets zero rows.';

-- ninetynine_nec_threshold_minor — previously trusted p_org alone; leaked
-- another org's entity_type (org_accounting_settings). Raises (plpgsql), not a
-- silent empty read, matching the write-RPC 42501-on-forbidden convention this
-- file already uses (mirrors macrs_tax_depreciation_for_year's SEC-3 fix). Its
-- own caller `ninetynine_nec_summary` is already can_access_org-gated, so this
-- adds a redundant-but-harmless second check on that path (same auth.uid(),
-- same session — SECURITY DEFINER does not change auth.uid()) and closes the
-- direct-call surface (it is independently granted to `authenticated`).
create or replace function public.ninetynine_nec_threshold_minor(
  p_org      uuid,
  p_tax_year int
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity  text;
  v_thresh  bigint;
  v_as_of   date := make_date(p_tax_year, 12, 31);
begin
  if not can_access_org(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- entity_type is on org_accounting_settings (CENTRAL-2 org profile), not organizations.
  select entity_type into v_entity from org_accounting_settings where org_id = p_org;

  -- 1) the org's own entity_type, if it has an active 1099 rule for the year
  if v_entity is not null then
    select o.threshold_minor into v_thresh
      from filing_obligations_for('US-FED', v_entity, p_tax_year, v_as_of) o
     where o.obligation_key = '1099_nec_issue'
     limit 1;
  end if;

  -- 2) fall back to the canonical federal payer rule (seeded under sole_prop)
  if v_thresh is null then
    select o.threshold_minor into v_thresh
      from filing_obligations_for('US-FED', 'sole_prop', p_tax_year, v_as_of) o
     where o.obligation_key = '1099_nec_issue'
     limit 1;
  end if;

  return v_thresh;  -- may be null if the kernel has no rule for that year (caller decides)
end$$;
comment on function public.ninetynine_nec_threshold_minor is
  'The 1099-NEC issuance threshold (minor units) for an org in a tax year, READ from filing_obligations (LAW; effective-dated + cited). Returns null if the kernel has no rule for that year. Never hardcoded. Definer-guard: gated on can_access_org(p_org) — a non-member is refused (42501), matching the depreciation RPCs'' convention.';

-- ═══════════════════════════════════════════════════════════════════════════
-- get_effective_behavior_config — documented DEFINER-guard exemption
-- ═══════════════════════════════════════════════════════════════════════════
-- Body is BYTE-IDENTICAL to the original (20260702050100_platform_config_
-- behavior.sql) — the only change is a `-- definer-ok:` marker so
-- check-definer-tenant-guard.ts records this as a reviewed, deliberate
-- exemption instead of an undetected gap. See the migration-header note above
-- for why: `anon`-callable by design (p_org = null pre-auth default read), and
-- called by 3 edge fns via a service-role client with no per-user JWT, so a
-- blanket can_access_org guard would break legitimate backend reads. Real
-- follow-up: BACKLOG DEFINER-GUARD-2 (caller-role-aware fix).
create or replace function get_effective_behavior_config(p_org uuid default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  -- definer-ok: anon-callable by design (pre-auth platform-default read via
  -- p_org=null); org-override branch is a low-severity config-tuning leak
  -- (asks/week, confidence cutoffs — no financial/PII) and is also read by
  -- receipts/categorize/invoicing edge fns via service-role with no per-user
  -- JWT, so a blanket can_access_org guard would break those legitimate
  -- backend reads. Real gap, tracked as BACKLOG DEFINER-GUARD-2 (needs a
  -- caller-role-aware fix, e.g. auth.role() = 'service_role' or p_org is
  -- null or can_access_org(p_org) — not applied here without a live
  -- service-role test to verify it doesn't regress those 3 fns).
  select
    coalesce((select behavior from platform_config where id = true), '{}'::jsonb)
    || coalesce(
         (select behavior from org_behavior_overrides o where p_org is not null and o.org_id = p_org),
         '{}'::jsonb
       );
$$;
