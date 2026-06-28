-- =============================================================================
-- FounderFirst — AI quality & cost layer, Phase 1 (Visibility)
-- =============================================================================
--
-- Read RPCs for the admin "AI quality & cost" dashboard (/admin/ai-quality) over
-- the ai_decisions table (Phase 0), plus the legacy↔new reconcile job (D21).
--
-- ai_decisions has RLS deny-all (writes are service-role only). These RPCs are
-- SECURITY DEFINER + is_admin()-gated, the same pattern as admin_list_audit /
-- get_analytics — the dashboard reads through them with the caller's admin JWT.
--
-- Phase 1 surfaces what Phase 0 records: cost per use case, models in play,
-- latency, cache-hit rate, and decisions awaiting a human. Judge-cost-% and the
-- zero-edit ramp signal are wired as fields but stay null until Phases 2–3 fill
-- evals / human verdicts. cost-per-resolved is real now (every shipped decision).
--
-- Reconcile (D21): resolve() is additive — it writes ai_decisions ALONGSIDE the
-- legacy insight_runs.model write, never replacing it. ai_reconcile_tick()
-- compares the two on a rolling sample so we can flip readers to ai_decisions
-- one surface at a time with confidence, and retire legacy columns LAST.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3). Apply manually.
-- pg_cron is used for the daily reconcile tick (same approach as email cron).
-- =============================================================================

-- ---- KPI strip: one jsonb blob for the dashboard headline -------------------
create or replace function admin_ai_kpis(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  result jsonb;
begin
  if not is_admin() then raise exception 'admin_ai_kpis: admin access required'; end if;
  select jsonb_build_object(
    'window_days',      greatest(1, least(p_days, 365)),
    'decision_count',   count(*),
    'total_cost_usd',   coalesce(sum(cost_usd), 0),
    -- resolved = shipped without a human gate-stop (Phase 1: everything not blocked/escalated/failed-closed)
    'resolved_count',   count(*) filter (where gate_status not in ('blocked','escalated','failed_closed')),
    'cost_per_resolved', round(
        coalesce(sum(cost_usd), 0)
        / nullif(count(*) filter (where gate_status not in ('blocked','escalated','failed_closed')), 0), 6),
    'avg_latency_ms',   round(avg(latency_ms))::int,
    'cache_hit_pct',    round(100.0 * count(*) filter (where cache_hit) / nullif(count(*), 0))::int,
    'awaiting_review',  count(*) filter (where gate_status in ('blocked','escalated','failed_closed')),
    -- Phase 2/3 fill these; null = "not measured yet" so the UI shows an honest dash.
    'judge_cost_usd',   null,
    'judge_cost_pct',   null,
    'zero_edit_pct',    null
  )
  into result
  -- tenant-ok: is_admin()-gated operator KPI view — aggregates across all tenants by design.
  from ai_decisions
  where created_at >= v_since and deleted_at is null;
  return result;
end; $$;
grant execute on function admin_ai_kpis(int) to authenticated;

-- ---- Per-use-case breakdown (the overview table) ----------------------------
create or replace function admin_ai_usecases(p_days int default 30)
returns table (
  use_case text, decisions bigint, total_cost numeric, cost_per_task numeric,
  avg_latency_ms int, cache_hit_pct int, awaiting_review bigint, models text[]
)
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not is_admin() then raise exception 'admin_ai_usecases: admin access required'; end if;
  return query
    select
      d.use_case,
      count(*) as decisions,
      coalesce(sum(d.cost_usd), 0) as total_cost,
      round(coalesce(sum(d.cost_usd), 0) / nullif(count(*), 0), 6) as cost_per_task,
      round(avg(d.latency_ms))::int as avg_latency_ms,
      round(100.0 * count(*) filter (where d.cache_hit) / nullif(count(*), 0))::int as cache_hit_pct,
      count(*) filter (where d.gate_status in ('blocked','escalated','failed_closed')) as awaiting_review,
      array_agg(distinct d.model) as models
    -- tenant-ok: is_admin()-gated operator breakdown — aggregates across all tenants by design.
    from ai_decisions d
    where d.created_at >= v_since and d.deleted_at is null
    group by d.use_case
    order by total_cost desc;
end; $$;
grant execute on function admin_ai_usecases(int) to authenticated;

-- ---- Daily spend trend (sparkline) ------------------------------------------
create or replace function admin_ai_daily(p_days int default 30)
returns table (day date, cost numeric, decisions bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not is_admin() then raise exception 'admin_ai_daily: admin access required'; end if;
  return query
    select (d.created_at at time zone 'UTC')::date as day,
           coalesce(sum(d.cost_usd), 0) as cost,
           count(*) as decisions
    -- tenant-ok: is_admin()-gated operator spend trend — aggregates across all tenants by design.
    from ai_decisions d
    where d.created_at >= v_since and d.deleted_at is null
    group by day
    order by day asc;
end; $$;
grant execute on function admin_ai_daily(int) to authenticated;

-- =============================================================================
-- Reconcile (D21): legacy columns ↔ ai_decisions
-- =============================================================================

create table if not exists ai_reconcile_runs (
  id            uuid        primary key default gen_random_uuid(),
  run_at        timestamptz not null default now(),
  window_days   int         not null,
  surface       text        not null,         -- which legacy↔new pair was compared
  legacy_count  int         not null,
  new_count     int         not null,
  drift         int         not null,         -- legacy_count - new_count
  note          text
);
create index if not exists ai_reconcile_runs_at_idx on ai_reconcile_runs (run_at desc);

alter table ai_reconcile_runs enable row level security;
drop policy if exists ai_reconcile_no_direct on ai_reconcile_runs;
create policy ai_reconcile_no_direct on ai_reconcile_runs for all using (false) with check (false);

-- Compare each legacy write against its ai_decisions mirror on a rolling sample.
-- Today only insights dual-writes a legacy column (insight_runs.model); chat and
-- compose have no legacy record, so ai_decisions is purely additive there and
-- isn't reconciled. Extend the surfaces list as more legacy columns are mirrored.
create or replace function ai_reconcile_tick(p_days int default 7)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_since   timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
  v_legacy  int;
  v_new     int;
begin
  -- insights: insight_runs (legacy) vs ai_decisions(use_case='insights')
  select count(*) into v_legacy from insight_runs where created_at >= v_since;
  -- tenant-ok: system reconcile job counts the insights mirror across all tenants by design.
  select count(*) into v_new from ai_decisions
    where use_case = 'insights' and created_at >= v_since and deleted_at is null;
  insert into ai_reconcile_runs (window_days, surface, legacy_count, new_count, drift, note)
  values (
    greatest(1, least(p_days, 90)), 'insights', v_legacy, v_new, v_legacy - v_new,
    case
      when v_legacy = v_new then 'in sync'
      when v_new = 0 and v_legacy > 0 then 'ai_decisions not yet receiving insights writes (Phase 0 not deployed?)'
      else 'drift — investigate before flipping readers'
    end
  );
end; $$;

-- Latest reconcile status per surface, for the dashboard card.
create or replace function admin_ai_reconcile_latest()
returns table (surface text, run_at timestamptz, window_days int,
               legacy_count int, new_count int, drift int, note text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_ai_reconcile_latest: admin access required'; end if;
  return query
    select distinct on (r.surface)
      r.surface, r.run_at, r.window_days, r.legacy_count, r.new_count, r.drift, r.note
    from ai_reconcile_runs r
    order by r.surface, r.run_at desc;
end; $$;
grant execute on function admin_ai_reconcile_latest() to authenticated;

-- Daily reconcile tick (pure in-DB; no http/secret needed). Safe to re-run.
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('ai-reconcile-daily') where exists (
    select 1 from cron.job where jobname = 'ai-reconcile-daily'
  );
  perform cron.schedule('ai-reconcile-daily', '0 2 * * *', 'select ai_reconcile_tick();');
exception when others then
  -- pg_cron not available in this environment — skip; reconcile can be run manually.
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
