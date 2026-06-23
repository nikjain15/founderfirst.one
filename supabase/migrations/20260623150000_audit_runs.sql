-- audit_runs — one row per /audit run, powering the admin Quality dashboard.
--
-- Each run records a 0–100 score per quality dimension (plus P0/P1/P2 counts),
-- an overall score, the audited commit, a short summary and the findings PR.
-- Written by the weekly audit agent; read by admins on /quality.
--
-- `dimensions` shape:
--   { "ia_ux": {"score":85,"p0":0,"p1":2,"p2":3}, "security": {...}, ... }
-- `totals` shape: { "p0":1, "p1":8, "p2":20 }

create table if not exists public.audit_runs (
  id          uuid primary key default gen_random_uuid(),
  run_at      timestamptz not null default now(),
  commit_sha  text,
  overall     integer not null default 0 check (overall between 0 and 100),
  dimensions  jsonb not null default '{}'::jsonb,
  totals      jsonb not null default '{}'::jsonb,
  summary     text not null default '',
  pr_url      text,
  created_by  text default auth.email()
);

create index if not exists audit_runs_run_at_idx
  on public.audit_runs (run_at desc);

alter table public.audit_runs enable row level security;

-- Any admin may read the audit history.
drop policy if exists "audit_runs_select_admin" on public.audit_runs;
create policy "audit_runs_select_admin"
  on public.audit_runs for select
  to authenticated
  using (public.is_admin());

-- Any admin may record a run (the audit agent runs as an admin, or via the
-- service_role key which bypasses RLS entirely — both work).
drop policy if exists "audit_runs_insert_admin" on public.audit_runs;
create policy "audit_runs_insert_admin"
  on public.audit_runs for insert
  to authenticated
  with check (public.is_admin());
