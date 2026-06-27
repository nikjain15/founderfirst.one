-- =============================================================================
-- FounderFirst — product insights (learning loop: Synthesize + Act)
-- =============================================================================
--
-- Capture (PostHog/GA events) and Surface (admin Analytics tabs) already exist.
-- This adds the next two stages:
--
--   insight_runs    — one row per synthesis run: the metrics snapshot it saw, an
--                     AI-generated summary, and structured findings. Append-only.
--   insight_actions — the human-in-the-loop Act tracker. Each suggested action
--                     from a run can be accepted / dismissed / marked done.
--
-- Writes happen from the synthesize-insights edge function with the service role
-- (bypasses RLS). Reads + the Act status flips go through is_admin()-gated RPCs,
-- audited via log_admin_action — same conventions as content_model.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3).
-- =============================================================================

create table if not exists insight_runs (
  id          uuid        primary key default gen_random_uuid(),
  window_days int         not null default 30,
  metrics     jsonb       not null default '{}'::jsonb,  -- the snapshot the model saw
  summary     text        not null default '',
  findings    jsonb       not null default '[]'::jsonb,  -- [{observation,likely_cause,suggested_action,confidence}]
  model       text,
  status      text        not null default 'complete'
                          check (status in ('complete', 'error')),
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users(id) on delete set null
);
create index if not exists insight_runs_created_idx on insight_runs (created_at desc);

create table if not exists insight_actions (
  id          uuid        primary key default gen_random_uuid(),
  run_id      uuid        not null references insight_runs(id) on delete cascade,
  title       text        not null,
  observation text        not null default '',
  suggested_action text   not null default '',
  confidence  text,                                       -- low | medium | high (free text)
  status      text        not null default 'suggested'
                          check (status in ('suggested', 'accepted', 'dismissed', 'done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists insight_actions_run_idx on insight_actions (run_id);
create index if not exists insight_actions_status_idx on insight_actions (status);

-- updated_at maintenance
create or replace function insight_actions_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists insight_actions_touch_trg on insight_actions;
create trigger insight_actions_touch_trg
  before update on insight_actions
  for each row execute function insight_actions_touch();

-- RLS: locked to security-definer RPCs (+ service role for writes).
alter table insight_runs enable row level security;
alter table insight_actions enable row level security;
drop policy if exists insight_runs_no_direct on insight_runs;
create policy insight_runs_no_direct on insight_runs for all using (false) with check (false);
drop policy if exists insight_actions_no_direct on insight_actions;
create policy insight_actions_no_direct on insight_actions for all using (false) with check (false);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Admin: runs newest first (with an open-action count for the list view).
create or replace function list_insight_runs(p_limit int default 26)
returns table (id uuid, window_days int, summary text, finding_count int,
               open_actions int, model text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_insight_runs: admin access required'; end if;
  return query
    select r.id, r.window_days, r.summary,
           jsonb_array_length(r.findings) as finding_count,
           (select count(*)::int from insight_actions a
              where a.run_id = r.id and a.status in ('suggested', 'accepted')) as open_actions,
           r.model, r.status, r.created_at
    from insight_runs r
    order by r.created_at desc
    limit greatest(1, least(p_limit, 200));
end;
$$;
grant execute on function list_insight_runs(int) to authenticated;

-- Admin: one run + its actions.
create or replace function get_insight_run(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'get_insight_run: admin access required'; end if;
  select jsonb_build_object(
    'run', to_jsonb(r),
    'actions', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from insight_actions a where a.run_id = r.id
    ), '[]'::jsonb)
  ) into result
  from insight_runs r where r.id = p_id;
  return result;
end;
$$;
grant execute on function get_insight_run(uuid) to authenticated;

-- Admin: flip an action's status (the "Act" step).
create or replace function set_insight_action_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  if not is_admin() then raise exception 'set_insight_action_status: admin access required'; end if;
  if p_status not in ('suggested', 'accepted', 'dismissed', 'done') then
    raise exception 'set_insight_action_status: bad status %', p_status;
  end if;
  update insight_actions set status = p_status where id = p_id returning run_id into v_run;
  if v_run is null then raise exception 'set_insight_action_status: action not found'; end if;
  perform log_admin_action('insight_action_status', 'insight_action', p_id::text,
    jsonb_build_object('status', p_status));
end;
$$;
grant execute on function set_insight_action_status(uuid, text) to authenticated;
