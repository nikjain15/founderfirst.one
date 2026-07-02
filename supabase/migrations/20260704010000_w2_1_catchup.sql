-- =============================================================================
-- FounderFirst — W2.1 Catch-up mode (the #1 Signals wedge)
-- =============================================================================
--
-- Years-behind owners get organized without shame or a $10k quote. Catch-up mode
-- ORCHESTRATES the existing pipeline (import → categorize → reconcile → per-year
-- export); it adds NO new posting path. This migration adds only the two things
-- the orchestration needs that don't already exist:
--
--   1. catch_up_plans           — flat-per-year packaging/pricing for a catch-up.
--                                 One row per org, holding the per-year fee (cents)
--                                 and the set of backlog years being caught up. The
--                                 dollar figure is a marketing/GTM detail; the DATA
--                                 MODEL just has to reflect "priced flat per year"
--                                 (Nik, 3 Jul). fee_total = fee_per_year_minor × N years.
--
--   2. catch_up_batch_approve   — BULK-APPROVE high-confidence categorizations in
--                                 one owner action, so a 5k-txn backlog does not turn
--                                 into 5k prompts (the interruption budget, ≤5
--                                 asks/week). It loops recategorize_entry (the SAME
--                                 audited, period-lock-aware, idempotent, learning
--                                 write-path Approve uses) and REFUSES anything below
--                                 the platform trust tier (confidence_high) server-side
--                                 — the client cannot smuggle a low-confidence auto-post.
--
--   3. catch_up_progress        — the per-year progress meter ("2023 ✓ · 2024 in
--                                 progress"): uncategorized / reconciled counts per
--                                 backlog year, derived from the ledger. Read-only.
--
-- Security: ISOTEST pattern — every write RPC is SECURITY DEFINER, takes p_actor
-- first, is gated by can_write_org_as (a read-only CPA is refused), and is
-- EXECUTE-granted to service_role ONLY (no anon/authenticated p_actor forgery).
-- Every bulk approve is audit-logged (one summary row + the per-entry rows that
-- recategorize_entry already writes). Trust tier + period-lock are inherited from
-- get_effective_behavior_config and recategorize_entry, never re-implemented.
-- =============================================================================

-- ── can_access_org_as: p_actor READ capability (ISOTEST parallel) ───────────
-- can_access_org(org) checks auth.uid(); the service_role-only catch-up RPCs carry
-- an explicit p_actor instead (no forgery — they're not EXECUTE-granted to
-- anon/authenticated). This is the READ analogue of can_write_org_as: a read-only
-- CPA (access <> 'full') passes it and may SEE catch-up progress, but not bulk-post.
create or replace function public.can_access_org_as(p_actor uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from memberships m
       where m.user_id = p_actor and m.org_id = target_org and m.status = 'active'
    )
    or exists (
      select 1
        from engagements e
        join memberships m
          on m.org_id = e.firm_org_id and m.user_id = p_actor and m.status = 'active'
       where e.client_org_id = target_org
         and e.status = 'active'
         and ( m.role = 'firm_admin'
               or exists (select 1 from client_assignments ca
                          where ca.engagement_id = e.id and ca.user_id = p_actor) )
    );
$$;
revoke all on function public.can_access_org_as(uuid, uuid) from public;
grant execute on function public.can_access_org_as(uuid, uuid) to service_role;

-- ── catch_up_plans: flat-per-year packaging for a catch-up ──────────────────
create table if not exists public.catch_up_plans (
  org_id             uuid        primary key references organizations(id) on delete cascade,
  -- The flat per-year fee, in minor units of the org's home currency. The exact
  -- number is a marketing detail; the model just records the flat-per-year price.
  fee_per_year_minor bigint      not null default 0 check (fee_per_year_minor >= 0),
  currency           text        not null default 'USD',
  -- The backlog years this catch-up covers, e.g. {2022,2023,2024}. fee_total is a
  -- generated column so it can never drift from fee_per_year × N (single source).
  backlog_years      int[]       not null default '{}',
  fee_total_minor    bigint      generated always as
                       (fee_per_year_minor * coalesce(cardinality(backlog_years), 0)) stored,
  status             text        not null default 'draft'
                       check (status in ('draft', 'active', 'complete')),
  created_at         timestamptz not null default now(),
  created_by         uuid        references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now()
);

alter table public.catch_up_plans enable row level security;

-- Readable by anyone who can access the org; writes go through the RPC only.
drop policy if exists catch_up_plans_read on public.catch_up_plans;
create policy catch_up_plans_read on public.catch_up_plans
  for select using (can_access_org(org_id));

drop policy if exists catch_up_plans_no_write on public.catch_up_plans;
create policy catch_up_plans_no_write on public.catch_up_plans
  for all using (false) with check (false);

-- =============================================================================
-- RPC: upsert the catch-up plan (flat-per-year packaging). Owner/full-CPA only.
-- =============================================================================
create or replace function public.catch_up_set_plan(
  p_actor uuid, p_org uuid, p_fee_per_year_minor bigint,
  p_backlog_years int[], p_currency text default 'USD'
) returns public.catch_up_plans
  language plpgsql security definer set search_path to 'public' as $$
declare v_plan public.catch_up_plans;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not manage catch-up for org %', p_org
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_fee_per_year_minor, 0) < 0 then
    raise exception 'bad_fee: fee per year cannot be negative' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.catch_up_plans (org_id, fee_per_year_minor, currency, backlog_years, status, created_by)
  values (p_org, coalesce(p_fee_per_year_minor, 0), coalesce(p_currency, 'USD'),
          coalesce(p_backlog_years, '{}'), 'active', p_actor)
  on conflict (org_id) do update
    set fee_per_year_minor = excluded.fee_per_year_minor,
        currency           = excluded.currency,
        backlog_years      = excluded.backlog_years,
        status             = case when public.catch_up_plans.status = 'complete'
                                  then 'complete' else 'active' end,
        updated_at         = now()
  returning * into v_plan;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'catchup.set_plan', 'catch_up_plan', null,
            jsonb_build_object('fee_per_year_minor', v_plan.fee_per_year_minor,
                               'backlog_years', to_jsonb(v_plan.backlog_years),
                               'fee_total_minor', v_plan.fee_total_minor,
                               'currency', v_plan.currency));
  return v_plan;
end$$;

-- =============================================================================
-- RPC: batch-approve high-confidence categorizations in ONE owner action.
--
-- p_items is a jsonb array of { entry_id, to_account_id, confidence, learn_value? }.
-- Each element is the owner accepting Penny's high-confidence pick for that entry.
-- The RPC re-derives the trust cutoff from get_effective_behavior_config and
-- REFUSES any item whose confidence is below confidence_high — so a low-confidence
-- pick can never be bulk-auto-posted, no matter what the client sends. Rule-matched
-- picks (confidence >= 1) always qualify. Each qualifying item is recategorized via
-- the existing recategorize_entry write-path (audited, period-lock-aware, idempotent,
-- learning); items below the cutoff are returned as `skipped` for the batched
-- question queue. One summary audit row records the whole action.
--
-- Returns jsonb: { approved:int, skipped:int, failed:int,
--                  results:[{entry_id, status:'approved'|'skipped'|'failed', detail?}] }.
-- =============================================================================
create or replace function public.catch_up_batch_approve(
  p_actor uuid, p_org uuid, p_items jsonb
) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_cfg          jsonb;
  v_high         numeric;
  v_from_acct    uuid;
  v_item         jsonb;
  v_entry_id     uuid;
  v_to_acct      uuid;
  v_conf         numeric;
  v_learn_value  text;
  v_idem         text;
  v_approved     int := 0;
  v_skipped      int := 0;
  v_failed       int := 0;
  v_results      jsonb := '[]'::jsonb;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not categorize org %', p_org
      using errcode = 'insufficient_privilege';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bad_items: items must be a json array' using errcode = 'invalid_parameter_value';
  end if;

  -- Trust tier from config (single source; org override merged over platform default).
  v_cfg  := get_effective_behavior_config(p_org);
  v_high := coalesce((v_cfg ->> 'confidence_high')::numeric, 0.75);

  -- The holding account every uncategorized line sits on (the "from" side).
  v_from_acct := resolve_uncategorized_account(p_actor, p_org);
  if v_from_acct is null then
    raise exception 'no_uncategorized_account' using errcode = 'no_data_found';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_entry_id    := nullif(v_item ->> 'entry_id', '')::uuid;
    v_to_acct     := nullif(v_item ->> 'to_account_id', '')::uuid;
    v_conf        := coalesce((v_item ->> 'confidence')::numeric, 0);
    v_learn_value := v_item ->> 'learn_value';

    -- TRUST GATE (server-authoritative): only high-confidence picks bulk-post.
    -- A low-confidence item is never auto-posted — it goes to the batched
    -- question queue instead (returned as skipped).
    if v_entry_id is null or v_to_acct is null then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object('entry_id', v_item ->> 'entry_id',
                     'status', 'failed', 'detail', 'missing entry_id or to_account_id');
      continue;
    end if;
    if v_conf < v_high then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('entry_id', v_entry_id,
                     'status', 'skipped', 'detail', 'below trust tier');
      continue;
    end if;

    -- Reuse the exact Approve write-path: audited, period-lock-aware, idempotent,
    -- learning. Idempotency key ties a re-fired batch to the same repost (no
    -- double-post on replay). A per-item failure is captured, never fatal to the batch.
    v_idem := 'catchup:' || v_entry_id::text || ':' || v_to_acct::text;
    begin
      perform recategorize_entry(p_actor, p_org, v_entry_id, v_from_acct, v_to_acct,
                                 v_idem, true, v_learn_value, 'description_contains');
      v_approved := v_approved + 1;
      v_results := v_results || jsonb_build_object('entry_id', v_entry_id, 'status', 'approved');
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object('entry_id', v_entry_id,
                     'status', 'failed', 'detail', sqlerrm);
    end;
  end loop;

  -- One summary audit row for the whole bulk action (the per-entry recategorize
  -- rows are already written by recategorize_entry).
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'catchup.batch_approve', 'catch_up_plan', null,
            jsonb_build_object('approved', v_approved, 'skipped', v_skipped,
                               'failed', v_failed, 'confidence_high', v_high,
                               'submitted', jsonb_array_length(p_items)));

  return jsonb_build_object('approved', v_approved, 'skipped', v_skipped,
                            'failed', v_failed, 'results', v_results);
end$$;

-- =============================================================================
-- RPC: per-year catch-up progress meter (read-only, tenant-scoped).
--
-- For each backlog year, count the uncategorized entries still on the holding
-- account and the reconciliation sessions locked. A year is "done" when it has
-- activity, zero uncategorized entries, and at least one locked reconciliation.
-- Derived entirely from the ledger — no denormalized status to drift.
-- Returns jsonb array (one element per year present in the books OR in the plan),
-- newest year first: [{ year, entries, uncategorized, reconciled_sessions, done }].
-- =============================================================================
create or replace function public.catch_up_progress(
  p_actor uuid, p_org uuid
) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_from_acct uuid;
  v_result    jsonb;
begin
  if not can_access_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not view org %', p_org
      using errcode = 'insufficient_privilege';
  end if;

  -- Look up (NEVER create) the holding account — progress is read-only, so it must
  -- not have the account-creating side-effect of resolve_uncategorized_account. If
  -- no holding account exists yet, nothing is uncategorized (v_from_acct stays null).
  select id into v_from_acct from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '9999' or lower(name) = 'uncategorized')
   order by (code = '9999') desc limit 1;

  with years as (
    -- every year that has posted activity, plus any year named in the plan.
    select distinct extract(year from entry_date)::int as yr
      from journal_entries where org_id = p_org and status = 'posted'
    union
    select distinct unnest(coalesce(backlog_years, '{}'))::int as yr
      from catch_up_plans where org_id = p_org
  ),
  entry_counts as (
    select extract(year from je.entry_date)::int as yr,
           count(distinct je.id) as entries
      from journal_entries je
     where je.org_id = p_org and je.status = 'posted'
     group by 1
  ),
  uncat_counts as (
    select extract(year from je.entry_date)::int as yr,
           count(distinct je.id) as uncategorized
      from journal_entries je
      join journal_lines jl on jl.entry_id = je.id
     where je.org_id = p_org and je.status = 'posted'
       and je.source <> 'reversal'
       and v_from_acct is not null and jl.account_id = v_from_acct
     group by 1
  ),
  recon_counts as (
    select extract(year from statement_end)::int as yr,
           count(*) as reconciled_sessions
      from reconciliation_sessions
     where org_id = p_org and status = 'locked'
     group by 1
  )
  select jsonb_agg(y_json order by yr desc)
    into v_result
    from (
      select jsonb_build_object(
               'year', y.yr,
               'entries', coalesce(ec.entries, 0),
               'uncategorized', coalesce(uc.uncategorized, 0),
               'reconciled_sessions', coalesce(rc.reconciled_sessions, 0),
               'done', coalesce(ec.entries, 0) > 0
                       and coalesce(uc.uncategorized, 0) = 0
                       and coalesce(rc.reconciled_sessions, 0) > 0
             ) as y_json, y.yr
        from years y
        left join entry_counts ec on ec.yr = y.yr
        left join uncat_counts  uc on uc.yr = y.yr
        left join recon_counts  rc on rc.yr = y.yr
       where y.yr is not null
    ) s;

  return coalesce(v_result, '[]'::jsonb);
end$$;

-- =============================================================================
-- ISOTEST lockdown: SECDEF, service_role-EXECUTE only (no p_actor forgery).
-- =============================================================================
revoke all on function public.catch_up_set_plan(uuid, uuid, bigint, int[], text) from public;
revoke all on function public.catch_up_batch_approve(uuid, uuid, jsonb) from public;
revoke all on function public.catch_up_progress(uuid, uuid) from public;
grant execute on function public.catch_up_set_plan(uuid, uuid, bigint, int[], text) to service_role;
grant execute on function public.catch_up_batch_approve(uuid, uuid, jsonb) to service_role;
grant execute on function public.catch_up_progress(uuid, uuid) to service_role;

-- =============================================================================
-- End of migration.
-- =============================================================================
