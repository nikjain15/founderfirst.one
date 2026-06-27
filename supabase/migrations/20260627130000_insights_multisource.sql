-- =============================================================================
-- FounderFirst — insights: multi-source inputs + themed, grounded findings
-- =============================================================================
--
-- Extends the learning loop (20260627120500_product_insights.sql) so a run can:
--   * draw from several data sources (not just PostHog product usage), and
--   * bucket each finding into one of three outcome areas (theme) with a target
--     surface, and carry the exact metric evidence it was grounded in.
--
-- No new tables — just columns. The get_insight_run RPC returns to_jsonb(run)
-- and to_jsonb(action), so the new columns surface automatically; only the
-- list RPC's explicit column list is widened (sources/goals for the list view).
--
-- Grounding: `evidence` holds [{metric,value}] copied from the run's real
-- metrics snapshot. The edge function rejects any finding whose evidence does
-- not match a real datapoint, so the column always reflects truth, not the
-- model's imagination.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3).
-- =============================================================================

-- ---- insight_runs: what we fed in + what we asked to improve ----------------
alter table insight_runs
  add column if not exists sources text[] not null default '{}',
  add column if not exists goals   text[] not null default '{}';

-- ---- insight_actions: outcome area + target surface + grounding evidence -----
alter table insight_actions
  add column if not exists theme    text,                       -- product | content | customer
  add column if not exists surface  text,                       -- website | cpa | owner | admin | blog | podcast | social | support | …
  add column if not exists evidence jsonb not null default '[]'::jsonb;  -- [{metric,value}] from the real snapshot

-- Widen the list RPC so the run history can show what each run covered.
-- Return-type change (added OUT columns) requires a drop first — Postgres won't
-- alter a function's result columns via create-or-replace.
drop function if exists list_insight_runs(int);
create or replace function list_insight_runs(p_limit int default 26)
returns table (id uuid, window_days int, summary text, finding_count int,
               open_actions int, model text, status text, created_at timestamptz,
               sources text[], goals text[])
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_insight_runs: admin access required'; end if;
  return query
    select r.id, r.window_days, r.summary,
           jsonb_array_length(r.findings) as finding_count,
           (select count(*)::int from insight_actions a
              where a.run_id = r.id and a.status in ('suggested', 'accepted')) as open_actions,
           r.model, r.status, r.created_at,
           r.sources, r.goals
    from insight_runs r
    order by r.created_at desc
    limit greatest(1, least(p_limit, 200));
end;
$$;
grant execute on function list_insight_runs(int) to authenticated;
