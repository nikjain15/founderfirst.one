-- =============================================================================
-- FounderFirst — AI quality & cost layer, Phase 3 (Human review queue)
-- =============================================================================
--
-- Read/write RPCs for the admin review queue over ai_decisions. The verdict
-- columns (human_verdict / human_edit / zero_edit / reviewed_at / reviewed_by)
-- already exist from Phase 0, so this migration is RPCs only — no schema change.
--
-- What the queue surfaces (plan §9, D2/D5/D25):
--   • Gate-stops — rows the judge blocked / escalated / failed-closed (the async
--     chat panel, email/insights batch grading) that still need a human.
--   • Shadow sample (D25) — a deterministic ~p_shadow_pct% slice of PASSED rows,
--     so a human keeps validating the panel even after it starts auto-passing.
-- A verdict captures zero_edit (approved with NO edit) — the lagging signal the
-- autonomy ramp (D5) reads to propose reducing review. Every verdict is
-- audit-logged (admin_audit), same as ticket replies / admin changes.
--
-- All RPCs are SECURITY DEFINER + is_admin()-gated (ai_decisions is RLS deny-all;
-- the operator reviews across tenants by design — every cross-tenant read carries
-- a `-- tenant-ok:` marker, the convention the CI guard enforces, D15).
--
-- NOTE: review before `supabase db push` (LEARNINGS rule 3). Apply manually.
-- Unique timestamp (rule 11): 20260628160000 is taken by phase2_ledger_core.
-- =============================================================================

-- ---- The queue: rows needing a human -----------------------------------------
create or replace function admin_ai_review_queue(
  p_filter     text default 'needs',   -- 'needs' | 'shadow' | 'all'
  p_limit      int  default 50,
  p_shadow_pct int  default 15          -- D25 shadow-sample rate over passed rows
)
returns table (
  id uuid, created_at timestamptz, use_case text, tenant_id text,
  model text, provider text, gate_status text, request_ref text,
  input jsonb, output text, output_json jsonb, evals jsonb,
  cost_usd numeric, judge_cost_usd numeric, is_shadow boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_ai_review_queue: admin access required'; end if;
  return query
  -- tenant-ok: is_admin()-gated operator review queue — spans tenants by design
  -- (the operator reviews every customer's flagged answers; never returns one
  -- customer's data to another).
  with cand as (
    select d.*,
      (d.gate_status in ('blocked','escalated','failed_closed')) as is_stop,
      (d.gate_status = 'passed' and d.judged_at is not null
        and (abs(hashtextextended(d.id::text, 0)) % 100)
            < greatest(0, least(p_shadow_pct, 100))) as is_sample
    from ai_decisions d
    where d.human_verdict is null and d.deleted_at is null
  )
  select c.id, c.created_at, c.use_case, c.tenant_id, c.model, c.provider,
         c.gate_status, c.request_ref, c.input, c.output, c.output_json, c.evals,
         c.cost_usd, c.judge_cost_usd, (not c.is_stop) as is_shadow
  from cand c
  where (p_filter = 'all'    and (c.is_stop or c.is_sample))
     or (p_filter = 'needs'  and c.is_stop)
     or (p_filter = 'shadow' and c.is_sample and not c.is_stop)
  order by c.is_stop desc, c.created_at desc
  limit greatest(1, least(p_limit, 200));
end; $$;
grant execute on function admin_ai_review_queue(text,int,int) to authenticated;

-- ---- Submit a verdict (approve / edit / reject) ------------------------------
-- zero_edit = approved with NO edit — the ramp signal (D5). human_edit holds the
-- corrected answer when edited (fed back into the improvement loop). Audit-logged.
create or replace function admin_ai_review_submit(
  p_id      uuid,
  p_verdict text,                    -- 'approved' | 'approved_after_edit' | 'rejected'
  p_edit    jsonb default null,      -- the corrected answer (when edited)
  p_reason  text  default null       -- why (esp. for rejected)
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin() then raise exception 'admin_ai_review_submit: admin access required'; end if;
  if p_verdict not in ('approved','approved_after_edit','rejected') then
    raise exception 'admin_ai_review_submit: invalid verdict %', p_verdict;
  end if;
  -- tenant-ok: single-row operator review by primary key, is_admin()-gated — the
  -- queue RPC already scopes which rows an operator sees, this writes one by id.
  update ai_decisions
    set human_verdict = p_verdict,
        human_edit    = case when p_verdict = 'approved_after_edit' then p_edit else null end,
        zero_edit     = (p_verdict = 'approved'),
        reviewed_at   = now(),
        reviewed_by   = auth.uid()
    where id = p_id and deleted_at is null;
  if not found then raise exception 'admin_ai_review_submit: decision % not found', p_id; end if;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai.review.' || p_verdict, 'ai_decision', p_id::text,
            jsonb_build_object('reason', p_reason,
                               'edited', p_verdict = 'approved_after_edit'));
end; $$;
grant execute on function admin_ai_review_submit(uuid,text,jsonb,text) to authenticated;

-- ---- Review KPI strip --------------------------------------------------------
create or replace function admin_ai_review_kpis(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  result jsonb;
begin
  if not is_admin() then raise exception 'admin_ai_review_kpis: admin access required'; end if;
  select jsonb_build_object(
    'window_days',   greatest(1, least(p_days, 365)),
    -- awaiting is point-in-time (not windowed): everything still unreviewed.
    'awaiting',      (select count(*) from ai_decisions
                        where human_verdict is null and deleted_at is null
                          and gate_status in ('blocked','escalated','failed_closed')),
    'reviewed',      count(*) filter (where human_verdict is not null),
    'approved_pct',  round(100.0 * count(*) filter (where human_verdict in ('approved','approved_after_edit'))
                       / nullif(count(*) filter (where human_verdict is not null), 0))::int,
    'zero_edit_pct', round(100.0 * count(*) filter (where zero_edit)
                       / nullif(count(*) filter (where human_verdict is not null), 0))::int
  )
  into result
  -- tenant-ok: is_admin()-gated operator review KPIs — aggregates across tenants by design.
  from ai_decisions
  where reviewed_at >= v_since and deleted_at is null;
  return result;
end; $$;
grant execute on function admin_ai_review_kpis(int) to authenticated;

-- ---- Overview KPIs: fill zero_edit_pct now that verdicts exist ---------------
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
    'judge_cost_usd',   coalesce(sum(judge_cost_usd), 0),
    'judge_cost_pct',   round(100.0 * coalesce(sum(judge_cost_usd), 0) / nullif(sum(cost_usd), 0))::int,
    'judged_count',     count(*) filter (where judged_at is not null),
    'gate_passed',      count(*) filter (where gate_status = 'passed'),
    'gate_blocked',     count(*) filter (where gate_status = 'blocked'),
    'gate_escalated',   count(*) filter (where gate_status = 'escalated'),
    'gate_failed_closed', count(*) filter (where gate_status = 'failed_closed'),
    -- Phase 3: real now — % of reviewed decisions approved with zero edits (D5 ramp signal).
    'zero_edit_pct',    round(100.0 * count(*) filter (where zero_edit)
                          / nullif(count(*) filter (where human_verdict is not null), 0))::int
  )
  into result
  -- tenant-ok: is_admin()-gated operator KPI view — aggregates across all tenants by design.
  from ai_decisions
  where created_at >= v_since and deleted_at is null;
  return result;
end; $$;
grant execute on function admin_ai_kpis(int) to authenticated;
