-- =============================================================================
-- FounderFirst — ai_decisions (AI quality & cost layer, Phase 0)
-- =============================================================================
--
-- One row per AI answer Penny produces, written by resolve() (@ff/inference) as
-- every live AI call routes through the seam. This is the SINGLE SOURCE OF TRUTH
-- for cost + quality (D9) that the Phase-1 dashboard, the Phase-3 review queue,
-- and the Phase-5 ramp all read from. Phase 0 only WRITES it (answers unchanged);
-- most columns below are populated by later phases but exist now so no later
-- migration is destructive.
--
-- Invariants baked in here (docs/plans/ai-quality-cost-layer-plan.html):
--   D15  tenant_id NOT NULL — the isolation key. The stack runs as service-role
--        (RLS bypassed), so tenant isolation MUST be a deterministic data-layer
--        invariant, never an AI eval. A companion CI guard
--        (scripts/check-tenant-predicate.ts) asserts every ai_decisions access
--        carries tenant_id; resolve() refuses an empty tenant at runtime too.
--        Pre-bookkeeping the key is namespaced: 'org:founderfirst' for internal
--        tools (insights, email_compose), 'anon:<sessionId>' for marketing chat;
--        real customers later use 'org:<uuid>'.
--   D18  the write is async + crash-safe (ctx.waitUntil, log-drop on failure) —
--        nothing here blocks an answer.
--   D19/D24  retention is first-class: raw input/answer kept 90 days
--        (retain_until), then archived de-identified to train our own models
--        (archived_at / deidentified); erasure is a soft delete (deleted_at) with
--        a hard cascade added with the erasure path. Disclose + offer erasure
--        (LEARNINGS rule 8). Do NOT assert GDPR/CCPA compliance — flag for legal.
--   D21  migration safety: resolve() is ADDITIVE — every legacy write (e.g.
--        insight_runs.model) is untouched; this row links back via
--        legacy_table/legacy_id so a Phase-1 job can reconcile, and legacy
--        columns retire LAST.
--   D22  honest cost: cost_usd per answer + cost_to_resolution (incl. retries,
--        escalations, human time) are first-class.
--
-- Writes happen from resolve() with the service role (bypasses RLS). Reads land
-- in Phase 1 behind is_admin()-gated RPCs — same convention as product_insights
-- / content_pipeline. No RPCs in this migration (Phase 0 is write-only).
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3). Apply manually.
-- =============================================================================

create table if not exists ai_decisions (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- ── Tenant (D15) ──────────────────────────────────────────────────────────
  tenant_id     text        not null,                  -- isolation key (namespaced)

  -- ── The ask / the engine ──────────────────────────────────────────────────
  use_case      text        not null,                  -- 'penny_chat' | 'insights' | 'email_compose' | …
  runtime       text        not null
                            check (runtime in ('workers', 'deno', 'node')),
  provider      text        not null
                            check (provider in ('anthropic', 'workers-ai')),
  model         text        not null,
  request_ref   text,                                  -- session_id / run id correlation

  -- ── The ask / the answer (retention-bound; null input = PII-minimized) ─────
  input         jsonb,
  output        text,
  output_json   jsonb,

  -- ── Cost + speed (D22) ─────────────────────────────────────────────────────
  usage         jsonb       not null default '{}'::jsonb,   -- {inputTokens, outputTokens}
  cost_usd      numeric(12,6),
  latency_ms    int,
  cache_hit     boolean     not null default false,

  -- ── Quality: evals + gate decision (Phase 2 fills these) ───────────────────
  evals         jsonb       not null default '{}'::jsonb,   -- each eval's pass/score + version
  gate_status   text        not null default 'unevaluated'
                            check (gate_status in
                              ('unevaluated','passed','blocked','escalated','failed_closed')),

  -- ── Human verdict (Phase 3) — zero_edit feeds the ramp (D5) ────────────────
  human_verdict text        check (human_verdict in
                              ('approved','approved_after_edit','rejected')),
  human_edit    jsonb,
  zero_edit     boolean,
  reviewed_at   timestamptz,
  reviewed_by   uuid        references auth.users(id) on delete set null,

  -- ── Resolution economics + lagging outcome (D22, D5) ───────────────────────
  cost_to_resolution numeric(12,6),                    -- incl. retries / escalations / human time
  final_outcome text        check (final_outcome in
                              ('used','corrected_by_customer','corrected_by_cpa')),
  corrected_at  timestamptz,

  -- ── Migration reconcile link (D21) ─────────────────────────────────────────
  legacy_table  text,
  legacy_id     text,

  -- ── Retention + erasure (D19/D24) ──────────────────────────────────────────
  retain_until  timestamptz not null default (now() + interval '90 days'),
  archived_at   timestamptz,                           -- set when de-identified into the training archive
  deidentified  boolean     not null default false,
  deleted_at    timestamptz                            -- soft-erasure; hard cascade via the erasure path
);

-- Hot paths: tenant timeline, per-use-case timeline, the retention/archive job,
-- the review queue (rows needing a human), and legacy reconciliation.
create index if not exists ai_decisions_tenant_idx   on ai_decisions (tenant_id, created_at desc);
create index if not exists ai_decisions_usecase_idx  on ai_decisions (use_case, created_at desc);
create index if not exists ai_decisions_retain_idx   on ai_decisions (retain_until);
create index if not exists ai_decisions_legacy_idx   on ai_decisions (legacy_table, legacy_id);
create index if not exists ai_decisions_review_idx
  on ai_decisions (created_at desc)
  where gate_status in ('blocked','escalated','failed_closed');

-- ── RLS: locked to service-role writes (+ is_admin() RPCs for reads in Phase 1) ─
-- Same pattern as content_pipeline / product_insights: deny all direct access;
-- the service role bypasses RLS for resolve()'s inserts.
alter table ai_decisions enable row level security;
drop policy if exists ai_decisions_no_direct on ai_decisions;
create policy ai_decisions_no_direct on ai_decisions for all using (false) with check (false);

comment on table ai_decisions is
  'AI quality & cost layer — one row per AI answer, written by @ff/inference resolve(). Single source of truth for cost/quality. tenant_id is a deterministic isolation invariant (D15); writes are async/crash-safe (D18); raw kept 90d then de-identified archive (D19/D24).';
comment on column ai_decisions.tenant_id is
  'D15 isolation key, NOT NULL. Namespaced: org:founderfirst | anon:<sessionId> | org:<uuid>. Enforced by CI guard + resolve() runtime check, not an AI eval.';
comment on column ai_decisions.legacy_table is
  'D21 dual-write reconcile link to the legacy row this decision corresponds to (e.g. insight_runs). Legacy columns retire LAST.';
comment on column ai_decisions.retain_until is
  'D19 raw input/answer retention horizon (default 90d). After this, archive de-identified for training (D24); erasure cascades here.';
