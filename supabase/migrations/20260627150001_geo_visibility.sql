-- =============================================================================
-- FounderFirst — GEO (AI-answer) visibility tracking
-- =============================================================================
--
-- We can't see how often AI answer engines (Gemini/Perplexity/ChatGPT) cite
-- founderfirst.one for buyer-intent questions — no third party stores that.
-- So once a day pg_cron fires geo_trigger_probe(), which POSTs to the geo-probe
-- Edge Function (shared secret from Vault, like sig_trigger_digest in
-- 20260622110000_signals_digest.sql). The function asks each active prompt to
-- every configured engine and records whether/where we were cited — one
-- geo_runs row per (prompt × engine).
--
-- Engines run iff their key is set: GEMINI_API_KEY (free tier, Google AI Studio,
-- Search-Grounding) and/or PERPLEXITY_API_KEY (optional). At least one required.
--
-- The admin Analytics → Visibility tab reads geo_summary() for the dashboard.
--
-- One-time setup (same shape as the signals digest):
--   1. supabase secrets set GEO_PROBE_SECRET=…  GEMINI_API_KEY=…  [PERPLEXITY_API_KEY=…]
--   2. select vault.create_secret('<same GEO_PROBE_SECRET>', 'geo_probe_secret');
--   3. supabase functions deploy geo-probe
--
-- Safe to re-run.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- geo_prompts — the buyer-intent questions we probe AI engines with.
-- -----------------------------------------------------------------------------
create table if not exists public.geo_prompts (
  id         uuid primary key default gen_random_uuid(),
  prompt     text not null,
  topic      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.geo_prompts enable row level security;

drop policy if exists "geo_prompts_select_admin" on public.geo_prompts;
create policy "geo_prompts_select_admin"
  on public.geo_prompts for select
  to authenticated
  using (public.is_admin());

drop policy if exists "geo_prompts_write_admin" on public.geo_prompts;
create policy "geo_prompts_write_admin"
  on public.geo_prompts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed buyer-intent prompts (only if the table is empty, so re-runs are safe).
insert into public.geo_prompts (prompt, topic)
select * from (values
  ('best AI bookkeeper for startup founders',                'bookkeeping'),
  ('automated bookkeeping software for small business',      'bookkeeping'),
  ('QuickBooks alternative for solopreneurs',                'competitor'),
  ('how do founders do bookkeeping without an accountant',   'jobs-to-be-done'),
  ('AI accounting software for small business owners',       'accounting'),
  ('best tools to automate small business finances',         'automation'),
  ('cheapest bookkeeping service for a one-person business', 'pricing'),
  ('software that categorizes business transactions automatically', 'automation')
) as seed(prompt, topic)
where not exists (select 1 from public.geo_prompts);

-- -----------------------------------------------------------------------------
-- geo_runs — one row per (prompt × engine) probe.
-- -----------------------------------------------------------------------------
create table if not exists public.geo_runs (
  id             uuid primary key default gen_random_uuid(),
  run_at         timestamptz not null default now(),
  prompt_id      uuid references public.geo_prompts(id) on delete set null,
  engine         text not null default 'perplexity',
  cited          boolean not null default false,   -- founderfirst.one in the sources/citations
  rank           integer,                          -- position among cited sources (null if absent)
  mentioned      boolean not null default false,   -- brand named in the answer text, even if not linked
  competitors    text[] not null default '{}',     -- other tools/brands named
  answer_excerpt text not null default '',
  raw            jsonb not null default '{}'::jsonb
);

create index if not exists geo_runs_run_at_idx   on public.geo_runs (run_at desc);
create index if not exists geo_runs_prompt_idx   on public.geo_runs (prompt_id);

alter table public.geo_runs enable row level security;

drop policy if exists "geo_runs_select_admin" on public.geo_runs;
create policy "geo_runs_select_admin"
  on public.geo_runs for select
  to authenticated
  using (public.is_admin());

-- Admin (or service_role, which bypasses RLS) may record a run.
drop policy if exists "geo_runs_insert_admin" on public.geo_runs;
create policy "geo_runs_insert_admin"
  on public.geo_runs for insert
  to authenticated
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- geo_summary — everything the Visibility dashboard needs, in one call.
-- Looks at the LATEST run per (prompt, engine) within the window for "current"
-- status, plus a daily citation-rate trend. service_role + admins only.
-- -----------------------------------------------------------------------------
create or replace function public.geo_summary(p_days int default 28)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with win as (
    select * from geo_runs
    where run_at > now() - make_interval(days => greatest(1, p_days))
  ),
  -- latest probe per prompt+engine in the window
  latest as (
    select distinct on (r.prompt_id, r.engine)
      r.prompt_id, r.engine, r.cited, r.rank, r.mentioned, r.competitors, r.run_at
    from win r
    order by r.prompt_id, r.engine, r.run_at desc
  ),
  -- per-prompt status, aggregated across whichever engines ran (gemini/perplexity/…)
  pstat as (
    select p.id, p.prompt, p.topic,
      coalesce(bool_or(l.cited), false)     as cited,
      coalesce(bool_or(l.mentioned), false) as mentioned,
      min(l.rank) filter (where l.cited)    as best_rank,
      coalesce(array_agg(distinct l.engine) filter (where l.cited), '{}') as engines_cited
    from geo_prompts p
    left join latest l on l.prompt_id = p.id
    where p.is_active
    group by p.id, p.prompt, p.topic
  )
  select jsonb_build_object(
    'days', greatest(1, p_days),
    'prompts_tracked', (select count(*) from geo_prompts where is_active),
    'probes', (select count(*) from latest),
    -- headline counts are per-PROMPT (cited by any engine), the rate the user reasons about
    'cited_count',     (select count(*) from pstat where cited),
    'mentioned_count', (select count(*) from pstat where mentioned and not cited),
    'citation_rate', (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where cited)::numeric / count(*), 3) end
      from pstat
    ),
    -- per-engine breakdown (per-PROBE), so you can compare AI assistants
    'engines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'engine', e.engine,
        'probes', e.n,
        'cited',  e.c,
        'rate',   case when e.n = 0 then 0 else round(e.c::numeric / e.n, 3) end
      ) order by e.engine)
      from (
        select engine, count(*) as n, count(*) filter (where cited) as c
        from latest group by engine
      ) e
    ), '[]'::jsonb),
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'prompt',        ps.prompt,
        'topic',         ps.topic,
        'cited',         ps.cited,
        'mentioned',     ps.mentioned,
        'rank',          ps.best_rank,
        'engines_cited', to_jsonb(ps.engines_cited)
      ) order by ps.cited desc, ps.best_rank nulls last, ps.prompt)
      from pstat ps
    ), '[]'::jsonb),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d,
        'cited', cited_c,
        'total', total_c,
        'rate', case when total_c = 0 then 0 else round(cited_c::numeric / total_c, 3) end
      ) order by d)
      from (
        select date_trunc('day', run_at)::date as d,
               count(*) filter (where cited) as cited_c,
               count(*) as total_c
        from win
        group by 1
      ) t
    ), '[]'::jsonb),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'count', c.n) order by c.n desc)
      from (
        select comp as name, count(*) as n
        from latest l, unnest(l.competitors) as comp
        group by comp
        order by n desc
        limit 12
      ) c
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.geo_summary(int) from public;
grant  execute on function public.geo_summary(int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- geo_trigger_probe — pg_cron calls this; it POSTs to the Edge Function.
-- Exact shape of sig_trigger_digest (20260622110000_signals_digest.sql).
-- -----------------------------------------------------------------------------
create or replace function public.geo_trigger_probe()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/geo-probe';
  secret text;
begin
  -- Shared secret from Vault. If unset, skip silently — a probe must never error.
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'geo_probe_secret'
    limit 1;
  exception when others then
    secret := null;
  end;

  if secret is null then
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-geo-secret', secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Schedule — daily at 11:00 UTC (staggered off the 13:00 signals digest).
-- Idempotent.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'geo-daily-probe') then
    perform cron.unschedule('geo-daily-probe');
  end if;
  perform cron.schedule('geo-daily-probe', '0 11 * * *', 'select geo_trigger_probe();');
end;
$$;
