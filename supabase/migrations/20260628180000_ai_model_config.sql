-- =============================================================================
-- FounderFirst — AI quality & cost layer, Phase 4 (Control): model + routing
-- config, spend caps, caching — DB-backed and admin-editable (D10).
-- =============================================================================
--
-- Turns the seed constants in @ff/inference core.ts (DEFAULT_ROUTING / DEFAULT_
-- PRICES) into editable DATA. The admin "AI · Models" sub-tab reads/writes these;
-- the inference layer loads them at runtime via a service-role twin and caches
-- them (~60s), exactly like the Penny voice guide. No model id, price, cap, or
-- caching flag is hardcoded per file anymore (D10).
--
-- Two tables:
--   ai_model_prices  — model id -> per-MTok price. Feeds the cost KPIs (D22); cost
--                      is config and never changes an answer.
--   ai_model_config  — per-use-case: main model, optional backup, caching flag,
--                      optional monthly spend cap, and the runtime the use case
--                      executes on (so a Workers-AI model can't be assigned to a
--                      Deno/Edge use case — the core would reject it at call time).
--
-- Spend caps (D11): Cloudflare AI Gateway budgets are per-gateway, not per-use-
-- case, so the cap is enforced in resolve(): when month-to-date spend >= the cap,
-- the call FALLS BACK to the (cheaper) backup model — it never fails. The runtime
-- twin returns MTD spend alongside the config so the core can decide without an
-- extra round-trip per request.
--
-- Caching flag: stored per use case, but the core only ever honors it for non-
-- customer-facing, non-financial use cases — the exact-match gateway cache is
-- global and could otherwise serve one tenant's answer to another (D11/D15).
--
-- GLOBAL config, not tenant-scoped (holds no customer data). Admins read/write via
-- is_admin() RPCs (audit-logged to admin_audit); the runtime reads via a service-
-- role twin. RLS deny-all on the tables themselves.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3) — apply manually
-- via the dashboard SQL editor / Management API. Unique timestamp (rule 11):
-- 180000 follows 170000 (ai_review); 160000 = ledger, 150000 = judge cols.
-- =============================================================================

-- ── Price table ──────────────────────────────────────────────────────────────
create table if not exists ai_model_prices (
  model           text        primary key,
  provider        text        not null check (provider in ('anthropic','workers-ai')),
  input_per_mtok  numeric     not null default 0 check (input_per_mtok >= 0),
  output_per_mtok numeric     not null default 0 check (output_per_mtok >= 0),
  updated_at      timestamptz not null default now(),
  updated_by      text
);

comment on table ai_model_prices is
  'Editable per-million-token prices (D10/D22). Feeds cost KPIs; never affects answers. Seeded from @ff/inference DEFAULT_PRICES — re-confirm against the provider price list when models change.';

-- ── Per-use-case model/routing/cap/cache config ──────────────────────────────
create table if not exists ai_model_config (
  use_case        text        primary key references ai_use_cases(use_case) on delete cascade,
  -- where this use case executes — guards Workers-AI-only models (core rejects
  -- @cf/* off the Workers runtime). 'workers' | 'deno'.
  runtime         text        not null default 'workers' check (runtime in ('workers','deno','node')),
  main_provider   text        not null check (main_provider in ('anthropic','workers-ai')),
  main_model      text        not null,
  backup_provider text        check (backup_provider in ('anthropic','workers-ai')),
  backup_model    text,
  cache_enabled   boolean     not null default false,   -- honored only for non-CF/non-financial (D11)
  monthly_cap_usd numeric     check (monthly_cap_usd is null or monthly_cap_usd >= 0),
  updated_at      timestamptz not null default now(),
  updated_by      text,
  -- a backup is all-or-nothing
  constraint ai_model_config_backup_pair
    check ((backup_provider is null) = (backup_model is null))
);

comment on table ai_model_config is
  'Per-use-case model routing, optional cheaper backup (used on spend-cap hit, D11), caching flag, and monthly spend cap. DB-backed config (D10) that @ff/inference loads at runtime. Edited via admin RPCs, audit-logged.';

-- ── RLS: deny-all; runtime reads via service-role twin, admins via RPCs ───────
alter table ai_model_prices enable row level security;
alter table ai_model_config enable row level security;
drop policy if exists ai_model_prices_no_direct on ai_model_prices;
drop policy if exists ai_model_config_no_direct on ai_model_config;
create policy ai_model_prices_no_direct on ai_model_prices for all using (false) with check (false);
create policy ai_model_config_no_direct on ai_model_config for all using (false) with check (false);

-- ── Runtime/provider consistency guard ───────────────────────────────────────
-- A Workers-AI (@cf/*) model is only reachable on the Workers runtime; the core
-- throws otherwise. Enforce it here too so the admin can never save a config that
-- would break the use case ("test before saving" catches it; this is the backstop).
create or replace function ai_model_config_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.runtime <> 'workers' then
    if new.main_provider = 'workers-ai' then
      raise exception 'use case "%" runs on "%": its main model cannot be a Workers-AI model', new.use_case, new.runtime;
    end if;
    if new.backup_provider = 'workers-ai' then
      raise exception 'use case "%" runs on "%": its backup model cannot be a Workers-AI model', new.use_case, new.runtime;
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_ai_model_config_guard on ai_model_config;
create trigger trg_ai_model_config_guard
  before insert or update on ai_model_config
  for each row execute function ai_model_config_guard();

-- =============================================================================
-- Seed from the @ff/inference defaults (the current live mapping)
-- =============================================================================
insert into ai_model_prices (model, provider, input_per_mtok, output_per_mtok) values
  ('claude-haiku-4-5-20251001',                 'anthropic',  1.0,  5.0),
  ('claude-haiku-4-5',                          'anthropic',  1.0,  5.0),
  ('claude-sonnet-4-6',                         'anthropic',  3.0, 15.0),
  ('@cf/meta/llama-3.3-70b-instruct-fp8-fast',  'workers-ai', 0,    0)
on conflict (model) do nothing;

insert into ai_model_config (use_case, runtime, main_provider, main_model, backup_provider, backup_model, cache_enabled, monthly_cap_usd) values
  ('penny_chat',    'workers', 'anthropic',  'claude-haiku-4-5-20251001',                'workers-ai', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', false, null),
  ('insights',      'deno',    'anthropic',  'claude-sonnet-4-6',                        null,         null,                                       false, null),
  ('email_compose', 'workers', 'workers-ai', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', null,         null,                                       false, null)
on conflict (use_case) do nothing;

-- =============================================================================
-- Admin RPCs (is_admin()-gated, audit-logged)
-- =============================================================================

-- ---- Read: per-use-case config + month-to-date spend (for cap display) -------
create or replace function admin_ai_model_config()
returns table (
  use_case text, label text, runtime text,
  main_provider text, main_model text,
  backup_provider text, backup_model text,
  cache_enabled boolean, monthly_cap_usd numeric,
  spend_mtd_usd numeric, customer_facing boolean, financial boolean,
  updated_at timestamptz, updated_by text
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_ai_model_config: admin access required'; end if;
  return query
    select c.use_case, u.label, c.runtime,
           c.main_provider, c.main_model, c.backup_provider, c.backup_model,
           c.cache_enabled, c.monthly_cap_usd,
           -- tenant-ok: spend rollup is intentionally across all tenants for the admin cost view (is_admin-gated)
           coalesce((select sum(coalesce(d.cost_usd,0) + coalesce(d.judge_cost_usd,0))
                     from ai_decisions d
                     where d.use_case = c.use_case
                       and d.created_at >= date_trunc('month', now())), 0) as spend_mtd_usd,
           u.customer_facing, u.financial,
           c.updated_at, c.updated_by
    from ai_model_config c
    join ai_use_cases u on u.use_case = c.use_case
    order by u.label;
end; $$;
grant execute on function admin_ai_model_config() to authenticated;

-- ---- Read: the editable price list ------------------------------------------
create or replace function admin_ai_models()
returns table (model text, provider text, input_per_mtok numeric, output_per_mtok numeric, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_ai_models: admin access required'; end if;
  return query select p.model, p.provider, p.input_per_mtok, p.output_per_mtok, p.updated_at
               from ai_model_prices p order by p.provider, p.model;
end; $$;
grant execute on function admin_ai_models() to authenticated;

-- ---- Write: upsert per-use-case config (guard-checked, audit-logged) ---------
create or replace function admin_ai_model_config_set(
  p_use_case text,
  p_main_provider text, p_main_model text,
  p_backup_provider text default null, p_backup_model text default null,
  p_cache_enabled boolean default null, p_monthly_cap_usd numeric default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin() then raise exception 'admin_ai_model_config_set: admin access required'; end if;
  if not exists (select 1 from ai_model_config where use_case = p_use_case) then
    raise exception 'no config row for use case "%" (seed it via migration first)', p_use_case;
  end if;
  if p_main_provider not in ('anthropic','workers-ai') then
    raise exception 'invalid main_provider "%"', p_main_provider;
  end if;
  update ai_model_config set
    main_provider   = p_main_provider,
    main_model      = p_main_model,
    backup_provider = case when p_backup_provider = '' then null else p_backup_provider end,
    backup_model    = case when p_backup_model = '' then null else p_backup_model end,
    cache_enabled   = coalesce(p_cache_enabled, cache_enabled),
    monthly_cap_usd = p_monthly_cap_usd,   -- null clears the cap
    updated_by      = v_actor
  where use_case = p_use_case;             -- trigger validates runtime/provider + sets updated_at
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_model_config.set', 'ai_model_config', p_use_case,
            jsonb_build_object('main_model', p_main_model, 'backup_model', p_backup_model,
                               'cache_enabled', p_cache_enabled, 'monthly_cap_usd', p_monthly_cap_usd));
end; $$;
grant execute on function admin_ai_model_config_set(text,text,text,text,text,boolean,numeric) to authenticated;

-- ---- Write: upsert a model price (audit-logged) -----------------------------
create or replace function admin_ai_price_set(
  p_model text, p_provider text, p_input_per_mtok numeric, p_output_per_mtok numeric
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin() then raise exception 'admin_ai_price_set: admin access required'; end if;
  if p_provider not in ('anthropic','workers-ai') then raise exception 'invalid provider "%"', p_provider; end if;
  insert into ai_model_prices (model, provider, input_per_mtok, output_per_mtok, updated_by)
    values (p_model, p_provider, p_input_per_mtok, p_output_per_mtok, v_actor)
    on conflict (model) do update set
      provider = excluded.provider,
      input_per_mtok = excluded.input_per_mtok,
      output_per_mtok = excluded.output_per_mtok,
      updated_at = now(), updated_by = v_actor;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_price.set', 'ai_model_price', p_model,
            jsonb_build_object('input_per_mtok', p_input_per_mtok, 'output_per_mtok', p_output_per_mtok));
end; $$;
grant execute on function admin_ai_price_set(text,text,numeric,numeric) to authenticated;

-- =============================================================================
-- Runtime twin (service-role only) — one call returns the whole InferenceConfig
-- the core needs: routing + backups + caps + MTD spend + caching + prices.
-- =============================================================================
create or replace function ai_runtime_inference_config()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'config', coalesce((
      select jsonb_agg(jsonb_build_object(
        'use_case', c.use_case,
        'runtime', c.runtime,
        'customer_facing', u.customer_facing,
        'financial', u.financial,
        'main', jsonb_build_object('provider', c.main_provider, 'model', c.main_model),
        'backup', case when c.backup_model is null then null
                       else jsonb_build_object('provider', c.backup_provider, 'model', c.backup_model) end,
        'cache_enabled', c.cache_enabled,
        'monthly_cap_usd', c.monthly_cap_usd,
        -- tenant-ok: cap enforcement needs total spend per use case across all tenants (service-role twin, no customer data returned)
        'spend_mtd_usd', coalesce((select sum(coalesce(d.cost_usd,0) + coalesce(d.judge_cost_usd,0))
                                   from ai_decisions d
                                   where d.use_case = c.use_case
                                     and d.created_at >= date_trunc('month', now())), 0)
      ))
      from ai_model_config c join ai_use_cases u on u.use_case = c.use_case
    ), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_object_agg(p.model, jsonb_build_object(
        'inputPerMTok', p.input_per_mtok, 'outputPerMTok', p.output_per_mtok))
      from ai_model_prices p
    ), '{}'::jsonb)
  ) into v;
  return v;
end; $$;
revoke all on function ai_runtime_inference_config() from public;
grant execute on function ai_runtime_inference_config() to service_role;
