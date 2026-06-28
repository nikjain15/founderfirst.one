-- =============================================================================
-- FounderFirst — AI quality & cost layer, Phase 2 (Judging): decision columns
-- =============================================================================
--
-- Additive columns on ai_decisions for the judge's output, plus updated Phase-1
-- read RPCs so the dashboard's dashed KPIs (judge-cost-%, gate outcomes) light up
-- from real data. The evals jsonb + gate_status columns already exist (Phase 0);
-- this adds the cost/timing of judging itself so "judge cost as % of answer cost"
-- (the D12/D22 budget metric) is measurable.
--
-- gate_status values are unchanged from Phase 0's check constraint:
--   'unevaluated' | 'passed' | 'blocked' | 'escalated' | 'failed_closed'.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3). Apply manually.
-- Unique timestamp (rule 11).
-- =============================================================================

alter table ai_decisions
  add column if not exists judge_cost_usd numeric(12,6),
  add column if not exists judge_latency_ms int,
  add column if not exists judged_at timestamptz;

comment on column ai_decisions.judge_cost_usd is
  'D12/D22 — cost of the eval panel that judged this answer (separate from the answer''s own cost_usd). Feeds "judge cost as % of answer cost" on the dashboard.';

-- ---- KPI strip: now fills judge cost + gate outcomes (was null in Phase 1) ---
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
    'resolved_count',   count(*) filter (where gate_status not in ('blocked','escalated','failed_closed')),
    'cost_per_resolved', round(
        coalesce(sum(cost_usd), 0)
        / nullif(count(*) filter (where gate_status not in ('blocked','escalated','failed_closed')), 0), 6),
    'avg_latency_ms',   round(avg(latency_ms))::int,
    'cache_hit_pct',    round(100.0 * count(*) filter (where cache_hit) / nullif(count(*), 0))::int,
    'awaiting_review',  count(*) filter (where gate_status in ('blocked','escalated','failed_closed')),
    -- Phase 2: judge economics + gate outcomes are now real.
    'judge_cost_usd',   coalesce(sum(judge_cost_usd), 0),
    'judge_cost_pct',   round(100.0 * coalesce(sum(judge_cost_usd), 0) / nullif(sum(cost_usd), 0))::int,
    'judged_count',     count(*) filter (where judged_at is not null),
    'gate_passed',      count(*) filter (where gate_status = 'passed'),
    'gate_blocked',     count(*) filter (where gate_status = 'blocked'),
    'gate_escalated',   count(*) filter (where gate_status = 'escalated'),
    'gate_failed_closed', count(*) filter (where gate_status = 'failed_closed'),
    -- Phase 3 (human verdicts) fills this; null = not measured yet.
    'zero_edit_pct',    null
  )
  into result
  -- tenant-ok: is_admin()-gated operator KPI view — aggregates across all tenants by design.
  from ai_decisions
  where created_at >= v_since and deleted_at is null;
  return result;
end; $$;
grant execute on function admin_ai_kpis(int) to authenticated;

-- ---- Per-use-case breakdown: add judge cost + gate outcome columns -----------
drop function if exists admin_ai_usecases(int);
create or replace function admin_ai_usecases(p_days int default 30)
returns table (
  use_case text, decisions bigint, total_cost numeric, cost_per_task numeric,
  avg_latency_ms int, cache_hit_pct int, awaiting_review bigint, models text[],
  judge_cost numeric, gate_passed bigint, gate_blocked bigint, gate_escalated bigint,
  gate_failed_closed bigint, judged bigint
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
      array_agg(distinct d.model) as models,
      coalesce(sum(d.judge_cost_usd), 0) as judge_cost,
      count(*) filter (where d.gate_status = 'passed') as gate_passed,
      count(*) filter (where d.gate_status = 'blocked') as gate_blocked,
      count(*) filter (where d.gate_status = 'escalated') as gate_escalated,
      count(*) filter (where d.gate_status = 'failed_closed') as gate_failed_closed,
      count(*) filter (where d.judged_at is not null) as judged
    -- tenant-ok: is_admin()-gated operator breakdown — aggregates across all tenants by design.
    from ai_decisions d
    where d.created_at >= v_since and d.deleted_at is null
    group by d.use_case
    order by total_cost desc;
end; $$;
grant execute on function admin_ai_usecases(int) to authenticated;
