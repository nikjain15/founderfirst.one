-- =============================================================================
-- FounderFirst — AI quality & cost layer: AUTONOMY RAMP (Phase 5, D5)
-- =============================================================================
--
-- "As the AI proves itself, it earns less oversight." Each use case carries a
-- review_mode + review_sample_rate (fraction of PASSED answers a human still spot-
-- checks; 1.0 = review everything, 0.2 = 20% shadow). Gate STOPS (blocked /
-- escalated / failed_closed) ALWAYS queue regardless — the floor never relaxes.
--
-- The ramp RECOMMENDS, a human APPROVES (D4): admin_ai_ramp_recommendations()
-- computes per-use-case readiness from real data (zero-edit approval rate, gate
-- pass rate, safety failures, volume) and proposes the next review level;
-- admin_ai_set_review_mode() applies it (audit-logged). Rollback is recommended
-- when corrections rise. The review queue's shadow sample now reads each use
-- case's review_sample_rate (so lowering it actually reduces review load).
--
-- Apply manually (LEARNINGS rule 3). Unique timestamp (rule 11): 20260629140000.
-- =============================================================================

alter table ai_use_cases
  add column if not exists review_mode        text    not null default 'full'
    check (review_mode in ('full','sampling')),
  add column if not exists review_sample_rate numeric not null default 1.0
    check (review_sample_rate >= 0 and review_sample_rate <= 1);

-- ---- Review queue: per-use-case shadow rate (replaces the global p_shadow_pct) --
create or replace function admin_ai_review_queue(
  p_filter     text default 'needs',   -- 'needs' | 'shadow' | 'all'
  p_limit      int  default 50,
  p_shadow_pct int  default 15          -- fallback for use cases not in the registry
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
            < greatest(0, least(coalesce(round(uc.review_sample_rate * 100)::int, p_shadow_pct), 100))) as is_sample
    from ai_decisions d
    left join ai_use_cases uc on uc.use_case = d.use_case
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

-- ---- Ramp recommendations (the system proposes; a human approves) -------------
create or replace function admin_ai_ramp_recommendations(p_days int default 30)
returns table (
  use_case               text,
  label                  text,
  current_mode           text,
  current_sample_rate    numeric,
  recommended_mode       text,
  recommended_sample_rate numeric,
  decisions              bigint,
  reviewed               bigint,
  zero_edit_pct          numeric,
  gate_pass_pct          numeric,
  safety_fail            bigint,
  rationale              text
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_ai_ramp_recommendations: admin access required'; end if;
  return query
  with agg as (
    select
      uc.use_case, uc.label, uc.review_mode, uc.review_sample_rate,
      count(d.*) filter (where d.judged_at is not null) as decisions,
      count(d.*) filter (where d.human_verdict is not null) as reviewed,
      count(d.*) filter (where d.zero_edit) as zero_edits,
      count(d.*) filter (where d.gate_status = 'passed') as passed,
      count(d.*) filter (where d.gate_status in ('blocked','failed_closed')) as safety_fail
    from ai_use_cases uc
    -- tenant-ok: is_admin()-gated operator analytics — aggregates across all tenants by design, returns only per-use-case counts (no per-tenant rows)
    left join ai_decisions d
      on d.use_case = uc.use_case
     and d.created_at > now() - make_interval(days => greatest(1, p_days))
     and d.deleted_at is null
    group by uc.use_case, uc.label, uc.review_mode, uc.review_sample_rate
  )
  select
    a.use_case, a.label, a.review_mode, a.review_sample_rate,
    -- recommendation
    case
      when a.review_mode = 'full'
        and a.decisions >= 50 and a.reviewed >= 20
        and a.reviewed > 0 and (100.0 * a.zero_edits / a.reviewed) >= 95
        and a.safety_fail = 0
      then 'sampling'
      when a.review_mode = 'sampling'
        and a.reviewed >= 10 and (100.0 * a.zero_edits / nullif(a.reviewed,0)) < 85
      then 'full'
      else a.review_mode
    end as recommended_mode,
    case
      when a.review_mode = 'full'
        and a.decisions >= 50 and a.reviewed >= 20
        and a.reviewed > 0 and (100.0 * a.zero_edits / a.reviewed) >= 95
        and a.safety_fail = 0
      then 0.20
      when a.review_mode = 'sampling'
        and a.reviewed >= 10 and (100.0 * a.zero_edits / nullif(a.reviewed,0)) < 85
      then 1.0
      else a.review_sample_rate
    end as recommended_sample_rate,
    a.decisions, a.reviewed,
    case when a.reviewed > 0 then round(100.0 * a.zero_edits / a.reviewed, 1) end as zero_edit_pct,
    case when a.decisions > 0 then round(100.0 * a.passed / a.decisions, 1) end as gate_pass_pct,
    a.safety_fail,
    case
      when a.review_mode = 'full'
        and a.decisions >= 50 and a.reviewed >= 20
        and a.reviewed > 0 and (100.0 * a.zero_edits / a.reviewed) >= 95
        and a.safety_fail = 0
      then 'Ready to reduce review to 20% — ' || a.zero_edits || '/' || a.reviewed || ' approved with no edit, zero safety failures.'
      when a.review_mode = 'sampling'
        and a.reviewed >= 10 and (100.0 * a.zero_edits / nullif(a.reviewed,0)) < 85
      then 'Corrections rising — recommend returning to full review.'
      when a.review_mode = 'full' and a.safety_fail > 0
      then 'Holding at full review — ' || a.safety_fail || ' safety/privacy gate failure(s) in window.'
      else 'Building track record — keep current review level.'
    end as rationale
  from agg a
  order by a.decisions desc;
end; $$;
grant execute on function admin_ai_ramp_recommendations(int) to authenticated;

-- ---- Apply a review-level change (human-approved, audit-logged) ----------------
create or replace function admin_ai_set_review_mode(
  p_use_case    text,
  p_mode        text,
  p_sample_rate numeric
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_ai_set_review_mode: admin access required'; end if;
  if p_mode not in ('full','sampling') then raise exception 'invalid mode'; end if;
  if p_sample_rate < 0 or p_sample_rate > 1 then raise exception 'sample rate out of range'; end if;

  update ai_use_cases
     set review_mode = p_mode,
         review_sample_rate = case when p_mode = 'full' then 1.0 else p_sample_rate end
   where use_case = p_use_case;
  if not found then raise exception 'unknown use case %', p_use_case; end if;

  insert into admin_audit (actor_email, action, target_type, target_id, payload)
  values (coalesce(auth.email(), 'system'), 'ai_review_mode.set', 'ai_use_case', p_use_case,
          jsonb_build_object('mode', p_mode, 'sample_rate', p_sample_rate));
end; $$;
grant execute on function admin_ai_set_review_mode(text, text, numeric) to authenticated;
