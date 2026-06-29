-- =============================================================================
-- FounderFirst — AI quality & cost layer: Workers-AI model catalog (Phase 4 follow-up)
-- =============================================================================
--
-- Registers a curated set of Cloudflare Workers-AI hosted open models in
-- ai_model_prices so they appear in the admin "Models" dropdown (#models) and can
-- be routed per use case (D10). Workers-AI is in-network (no egress) and billed in
-- Neurons with a free daily allowance, so these are the cheapest "already-hosted,
-- no servers to run" option — exactly what we want for the high-volume per-request
-- work. (Local Ollama is NOT this — it's self-hosting; deliberately excluded.)
--
-- All model ids below are REAL, taken from the live `wrangler ai models` catalog.
-- Grouped by the cost/quality tier they suit (see plan §4 archetypes); the admin
-- can route any use case to any of them, and the eval gates + judge panel catch
-- it when a cheap model isn't good enough.
--
-- PRICING: seeded at 0 — Workers-AI is metered in Neurons, not per-MTok, and the
-- per-model $/MTok isn't uniformly published. 0 matches the existing convention
-- (token usage is still recorded). Real per-model prices will be filled by the
-- Phase-5 catalog sync (OpenRouter /models + Workers-AI models API) and are
-- editable now in the admin price table. Cost is config and never changes answers.
--
-- Additive + idempotent (on conflict do nothing). No tenant-scoped tables touched.
-- Apply manually via the Management API / dashboard SQL editor (LEARNINGS rule 3).
-- Unique timestamp (rule 11): 20260629040000.
-- =============================================================================

insert into ai_model_prices (model, provider, input_per_mtok, output_per_mtok) values
  -- ── cheap / high-volume: classification, extraction, guardrails ──────────────
  ('@cf/meta/llama-3.2-1b-instruct',                'workers-ai', 0, 0),
  ('@cf/meta/llama-3.2-3b-instruct',                'workers-ai', 0, 0),
  ('@cf/meta/llama-3.1-8b-instruct-fast',           'workers-ai', 0, 0),
  ('@cf/meta/llama-3.1-8b-instruct-fp8',            'workers-ai', 0, 0),
  ('@cf/ibm-granite/granite-4.0-h-micro',           'workers-ai', 0, 0),
  -- safety classifier (pairs with the Safety eval / inline chat floor)
  ('@cf/meta/llama-guard-3-8b',                     'workers-ai', 0, 0),

  -- ── mid: chat, structured extraction, summarization ─────────────────────────
  ('@cf/mistralai/mistral-small-3.1-24b-instruct',  'workers-ai', 0, 0),
  ('@cf/qwen/qwen3-30b-a3b-fp8',                     'workers-ai', 0, 0),
  ('@cf/google/gemma-4-26b-a4b-it',                 'workers-ai', 0, 0),
  ('@cf/meta/llama-4-scout-17b-16e-instruct',       'workers-ai', 0, 0),
  ('@cf/qwen/qwen2.5-coder-32b-instruct',           'workers-ai', 0, 0),

  -- ── frontier / reasoning: hard edge cases, agentic ──────────────────────────
  ('@cf/openai/gpt-oss-120b',                       'workers-ai', 0, 0),
  ('@cf/openai/gpt-oss-20b',                        'workers-ai', 0, 0),
  ('@cf/zai-org/glm-5.2',                           'workers-ai', 0, 0),
  ('@cf/zai-org/glm-4.7-flash',                     'workers-ai', 0, 0),
  ('@cf/moonshotai/kimi-k2.7-code',                 'workers-ai', 0, 0),
  ('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',  'workers-ai', 0, 0),
  ('@cf/qwen/qwq-32b',                              'workers-ai', 0, 0)
on conflict (model) do nothing;
