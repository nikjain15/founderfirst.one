-- Learning loop "Act" stage — experiments, arms, cached results.
-- Variants are section-level payload overrides (not full page versions), so an
-- experiment targets one section type and each arm supplies that section's data.
-- Assignment is decided by a PostHog multivariate flag keyed by experiments.key.
--
-- RLS: admins (is_admin()) manage everything; anon may read only RUNNING
-- experiments + their arms (the static site needs the active arm payloads to
-- render). Results are admin-read-only. All writes from the site go through the
-- service-role bandit function, never the anon client.

create table if not exists public.experiments (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,                 -- PostHog flag key, e.g. "exp-hero-headline"
  name           text not null,
  status         text not null default 'draft' check (status in ('draft','running','stopped','promoted')),
  section_type   text not null,                        -- which section this targets (e.g. "hero")
  primary_metric text not null default 'signup',
  policy_tier    text not null default 'propose' check (policy_tier in ('auto','propose','inform')),
  -- Guardrail: experiments may never auto-touch these surfaces (defence in depth
  -- on top of the app-layer check). section_type is whitelisted to marketing copy.
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  stopped_at     timestamptz
);

create table if not exists public.experiment_arms (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  variant_key   text not null,                         -- "control" | "v1" | ...
  payload       jsonb not null default '{}'::jsonb,    -- the section `data` override for this arm
  is_control    boolean not null default false,
  rollout_pct   numeric,                               -- bandit-managed; null = even split
  created_at    timestamptz not null default now(),
  unique (experiment_id, variant_key)
);

create table if not exists public.experiment_results (
  id            uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  variant_key   text not null,
  exposures     integer not null default 0,
  conversions   integer not null default 0,
  conv_rate     numeric,
  lift          numeric,                               -- vs control, fraction (e.g. 0.12 = +12%)
  as_of         timestamptz not null default now(),
  unique (experiment_id, variant_key)
);

create index if not exists experiment_arms_exp_idx    on public.experiment_arms (experiment_id);
create index if not exists experiment_results_exp_idx on public.experiment_results (experiment_id);
create index if not exists experiments_status_idx     on public.experiments (status);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.experiments        enable row level security;
alter table public.experiment_arms    enable row level security;
alter table public.experiment_results enable row level security;

-- Admins: full control over everything.
create policy experiments_admin_all on public.experiments
  for all using (public.is_admin()) with check (public.is_admin());
create policy arms_admin_all on public.experiment_arms
  for all using (public.is_admin()) with check (public.is_admin());
create policy results_admin_all on public.experiment_results
  for all using (public.is_admin()) with check (public.is_admin());

-- Anon/public: read RUNNING experiments + their arms only (needed to render the
-- assigned variant). Draft/stopped/promoted experiments are not exposed.
create policy experiments_public_running on public.experiments
  for select using (status = 'running');
create policy arms_public_running on public.experiment_arms
  for select using (exists (
    select 1 from public.experiments e
    where e.id = experiment_id and e.status = 'running'
  ));
-- Results stay admin-only (no public policy).

-- ── Bandit cron — daily refresh of arm results + auto-promote (auto-tier) ────
-- Mirrors the signals-digest pattern: a security-definer trigger that posts to
-- the `bandit` edge function with a shared secret from Vault. If the secret is
-- unset, it skips silently — the optimizer must never error. (Set the Vault
-- secret `bandit_secret` + the function env BANDIT_SECRET to activate.)
create or replace function public.trigger_bandit()
returns void language plpgsql security definer set search_path = public, vault as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/bandit';
  secret text;
begin
  begin
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'bandit_secret' limit 1;
  exception when others then secret := null;
  end;
  if secret is null then return; end if;
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bandit-secret', secret),
    body    := '{}'::jsonb
  );
end;
$$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('learning-loop-bandit', '0 12 * * *', 'select public.trigger_bandit();');
  end if;
end $$;
