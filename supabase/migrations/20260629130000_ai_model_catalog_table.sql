-- =============================================================================
-- FounderFirst — AI quality & cost layer: model CATALOG (Phase 5)
-- =============================================================================
--
-- The browsable "universe" of hosted models with rich metadata, kept fresh by the
-- ai-catalog-sync edge function (Phase 5): price, context window, capabilities,
-- third-party benchmark scores (OpenRouter), the Workers-AI `task` tag, and public
-- leaderboard signals (Artificial Analysis intelligence, LMArena Elo). The sync
-- also computes `recommended_for` archetype tags so the admin Models tab can
-- self-recommend the best model per use case (plan §8, D10/D22).
--
-- This is SEPARATE from ai_model_prices (the curated set that is actually routable
-- per use case). The catalog informs/recommends; registering a catalog model into
-- ai_model_prices makes it selectable. Workers-AI catalog rows can be registered
-- with no key; OpenRouter rows become routable once the OpenRouter provider + key
-- land (Phase 5b).
--
-- RLS deny-all; admin reads via the is_admin()-gated security-definer RPC; the sync
-- writes with the service role (bypasses RLS). No tenant data here.
-- Apply manually (LEARNINGS rule 3). Unique timestamp (rule 11): 20260629130000.
-- =============================================================================

create table if not exists ai_model_catalog (
  model            text primary key,          -- e.g. "anthropic/claude-haiku-4.5" or "@cf/meta/llama-3.3-70b-..."
  provider         text not null,             -- openrouter | workers-ai | anthropic | ...
  display_name     text,
  description      text,
  context_length   integer,
  input_per_mtok   numeric(12,4),             -- USD per million input tokens
  output_per_mtok  numeric(12,4),             -- USD per million output tokens
  modalities       text[] default '{}',       -- input modalities: text, image, ...
  capabilities     jsonb  default '{}'::jsonb, -- supported_parameters (tools, json, reasoning), top_provider, etc.
  benchmarks       jsonb,                     -- OpenRouter third-party benchmark scores, when present
  intelligence     numeric(6,2),              -- Artificial Analysis Intelligence Index (enrichment)
  elo              numeric(8,2),              -- LMArena Elo (enrichment)
  task_tag         text,                      -- Workers-AI `task` (e.g. "Text Generation")
  recommended_for  text[] default '{}',       -- computed archetype tags: classification|extraction|chat|summarization|reasoning|writing|coding|safety
  routable         boolean default false,     -- true once present in ai_model_prices (i.e. selectable per use case)
  source           text not null,             -- openrouter | workers-ai-api | manual
  synced_at        timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists ai_model_catalog_provider_idx on ai_model_catalog (provider);
create index if not exists ai_model_catalog_recommended_idx on ai_model_catalog using gin (recommended_for);

alter table ai_model_catalog enable row level security;
-- No policies → deny-all to anon/authenticated; service_role bypasses RLS for the sync.

-- Admin read (is_admin()-gated). Filter by provider and/or a single archetype tag.
create or replace function admin_ai_catalog(
  p_provider        text default null,
  p_recommended_for text default null,
  p_limit           integer default 500
)
returns setof ai_model_catalog
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select *
    from ai_model_catalog c
    where (p_provider is null or c.provider = p_provider)
      and (p_recommended_for is null or p_recommended_for = any(c.recommended_for))
    order by
      array_length(c.recommended_for, 1) desc nulls last,
      coalesce(c.intelligence, 0) desc,
      coalesce(c.elo, 0) desc,
      c.input_per_mtok asc nulls last
    limit greatest(1, least(p_limit, 2000));
end;
$$;

grant execute on function admin_ai_catalog(text, text, integer) to authenticated;
