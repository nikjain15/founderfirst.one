-- loop_runs + loop_events — the build-loop instrumentation behind /admin → Build.
--
-- The autonomous build loop runs many sessions (builder / red-team / integrator)
-- across separate chats. LOOP-1 gives Nik ONE page to see the whole loop without
-- hopping between chats. Each session upserts a `loop_runs` row and heartbeats it
-- (via the `loop-heartbeat` edge fn) every ≤10 min; a beat >30 min stale reads as
-- ⚠ dead in the UI. Step-level detail is appended to `loop_events`.
--
-- WRITE-DON'T-DEPLOY: committed here as the schema source of truth (LEARNINGS #2);
-- the integrator deploys it from `main` after Nik's approval. Do NOT `db push`.
--
-- One row per loop SESSION (keyed by session_tag, the builder's claim tag). The
-- heartbeat fn upserts on session_tag so a reconnecting session updates in place
-- rather than duplicating (LEARNINGS #6 — one concept, one row).

create table if not exists public.loop_runs (
  id             uuid primary key default gen_random_uuid(),
  session_tag    text not null unique,            -- the builder's claim tag, e.g. "loop-1"
  role           text not null default 'builder', -- builder | red-team | integrator
  card           text,                            -- backlog card id, e.g. "LOOP-1"
  phase          text,                            -- free-text current step, e.g. "writing migration"
  status         text not null default 'running'  -- running | pr-open | blocked | done
                 check (status in ('running','pr-open','blocked','red-teaming','done')),
  pr_url         text,
  blocked_reason text,
  started_at     timestamptz not null default now(),
  last_beat      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists loop_runs_last_beat_idx on public.loop_runs (last_beat desc);
create index if not exists loop_runs_status_idx    on public.loop_runs (status);

-- Timestamped step log, newest-first in the UI. Keeps a per-session history so
-- "now-running w/ current step" can show recent activity, not just the latest phase.
create table if not exists public.loop_events (
  id          uuid primary key default gen_random_uuid(),
  session_tag text not null,
  at          timestamptz not null default now(),
  kind        text not null default 'step',  -- step | status | note
  message     text not null default ''
);

create index if not exists loop_events_session_at_idx on public.loop_events (session_tag, at desc);
create index if not exists loop_events_at_idx         on public.loop_events (at desc);

alter table public.loop_runs   enable row level security;
alter table public.loop_events enable row level security;

-- Any admin may read the loop state (the Build dashboard is admin-only).
drop policy if exists "loop_runs_select_admin" on public.loop_runs;
create policy "loop_runs_select_admin"
  on public.loop_runs for select to authenticated using (public.is_admin());

drop policy if exists "loop_events_select_admin" on public.loop_events;
create policy "loop_events_select_admin"
  on public.loop_events for select to authenticated using (public.is_admin());

-- Writes come ONLY from the loop-heartbeat edge fn using the service_role key,
-- which bypasses RLS. No authenticated-user INSERT/UPDATE policy is granted, so
-- an admin's browser JWT can read the dashboard but cannot forge loop state.
