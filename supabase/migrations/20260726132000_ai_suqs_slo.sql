-- =============================================================================
-- FounderFirst — SUQS SLOs: turn the AI measurement layer into a MANAGED quality
-- envelope. Speed / Utility / Quality / Scalability were measured (ai_decisions)
-- but never TARGETED (audit Dims 9/12). This adds numeric SLO targets as editable
-- DATA and an is_admin() RPC that reports measured-vs-target per use case, surfaced
-- in the admin "AI · Models" view.
-- =============================================================================
--
-- Three SUQS dimensions are computable directly from the ai_decisions log and get a
-- numeric target here:
--   • Speed        → p95 answer latency (ms)                 [max]
--   • Cost (Q/scale) → cost per answer (USD, incl. judge)    [max]
--   • Quality      → gate-block rate (% blocked/failed_closed) [max]
-- (Utility / zero-edit approval is a human-verdict metric tracked on the AI Review
--  surface; its numeric target is documented in docs/PRD.md but not recomputed here.)
--
-- GLOBAL config (no customer data, D15 n/a). Review before `supabase db push`
-- (LEARNINGS rule 3); unique timestamp (rule 11).
-- =============================================================================

create table if not exists ai_suqs_slo (
  use_case            text        primary key references ai_use_cases(use_case) on delete cascade,
  p95_latency_ms_slo  int         not null check (p95_latency_ms_slo > 0),
  cost_per_answer_slo numeric(12,6) not null check (cost_per_answer_slo >= 0),
  block_rate_pct_slo  numeric(5,2) not null check (block_rate_pct_slo >= 0 and block_rate_pct_slo <= 100),
  updated_at          timestamptz not null default now(),
  updated_by          text
);

comment on table ai_suqs_slo is
  'Per-use-case SUQS SLO targets (Speed p95 latency, cost/answer, gate-block rate) — the numeric quality envelope the admin AI·Models view reports measured performance against (D9/D12). Global config, no tenant scope.';

alter table ai_suqs_slo enable row level security;
drop policy if exists ai_suqs_slo_no_direct on ai_suqs_slo;
create policy ai_suqs_slo_no_direct on ai_suqs_slo for all using (false) with check (false);

-- Seed targets sized to each use case's job (chat is interactive → tight latency;
-- insights is batch → looser latency, higher token budget). These are starting
-- envelopes, editable by migration/admin, not magic numbers in code. Seeded only
-- for use cases that exist in ai_use_cases (FK) — the SELECT ∩ ai_use_cases guard
-- keeps this migration replay-safe regardless of which use cases are registered.
insert into ai_suqs_slo (use_case, p95_latency_ms_slo, cost_per_answer_slo, block_rate_pct_slo)
select v.use_case, v.p95, v.cost, v.block
from (values
  ('penny_chat',    3000,  0.010000::numeric, 2.00::numeric),
  ('insights',     20000,  0.150000::numeric, 5.00::numeric),
  ('email_compose', 8000,  0.020000::numeric, 2.00::numeric)
) as v(use_case, p95, cost, block)
join ai_use_cases u on u.use_case = v.use_case
on conflict (use_case) do nothing;

-- ---- Read: measured SUQS vs SLO per use case (is_admin-gated) ----------------
-- p95 via percentile_cont over the window; cost/answer averages answer + judge
-- cost; block rate = blocked+failed_closed / evaluated. `breached` flags any
-- dimension over target so the UI can color it. Only use cases that have an SLO
-- row are returned (the routed ones).
create or replace function admin_ai_suqs(p_days int default 30)
returns table (
  use_case text, label text,
  answers bigint,
  p95_latency_ms int, slo_p95_latency_ms int,
  cost_per_answer_usd numeric, slo_cost_per_answer_usd numeric,
  block_rate_pct numeric, slo_block_rate_pct numeric,
  breached boolean
)
language plpgsql security definer set search_path = public as $$
declare v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not is_admin() then raise exception 'admin_ai_suqs: admin access required'; end if;
  return query
  with m as (
    -- tenant-ok: platform-wide SUQS rollup for the is_admin-gated admin cost/quality
    -- view; aggregates across orgs by design (not per-tenant billing), so no tenant_id.
    select d.use_case,
           count(*)                                                            as answers,
           percentile_cont(0.95) within group (order by d.latency_ms)          as p95,
           avg(coalesce(d.cost_usd,0) + coalesce(d.judge_cost_usd,0))          as cost_avg,
           count(*) filter (where d.gate_status in ('blocked','failed_closed')) as blocked,
           count(*) filter (where d.gate_status <> 'unevaluated')              as evaluated
      from ai_decisions d
     where d.created_at >= v_since
     group by d.use_case
  )
  select s.use_case, u.label,
         coalesce(m.answers, 0) as answers,
         round(m.p95)::int as p95_latency_ms, s.p95_latency_ms_slo,
         round(coalesce(m.cost_avg, 0), 6) as cost_per_answer_usd, s.cost_per_answer_slo,
         round(case when coalesce(m.evaluated,0) > 0 then 100.0 * m.blocked / m.evaluated else 0 end, 2) as block_rate_pct,
         s.block_rate_pct_slo,
         (
           coalesce(round(m.p95)::int, 0) > s.p95_latency_ms_slo
           or coalesce(round(m.cost_avg, 6), 0) > s.cost_per_answer_slo
           or (case when coalesce(m.evaluated,0) > 0 then 100.0 * m.blocked / m.evaluated else 0 end) > s.block_rate_pct_slo
         ) as breached
    from ai_suqs_slo s
    join ai_use_cases u on u.use_case = s.use_case
    left join m on m.use_case = s.use_case
   order by u.label;
end; $$;
grant execute on function admin_ai_suqs(int) to authenticated;
