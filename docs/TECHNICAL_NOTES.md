# FounderFirst / Penny — Technical Notes & Scorecard

> An engineer's-eye assessment of the AI system, scored against a 12-point rubric
> with file-level evidence and honest gaps. Scores are 0-5.

## Scorecard

| # | Dimension | Score | Evidence (file refs) | Gap |
|---|---|---|---|---|
| 1 | **Model choice** (LLM vs ML vs hybrid) | 4 | Hybrid by design: deterministic rule matcher + vendor priors run before any model in `supabase/functions/categorize`; models are the fallback. Right-sized per task via `DEFAULT_ROUTING` (`packages/inference/src/core.ts`): Haiku (fast), Sonnet (reasoning), Llama 70B (writing). | No trained categorization classifier yet; the ML tier is rules + priors, not a learned model. |
| 2 | **How the AI works** (context, temperature, grounding) | 5 | `resolve()` sets provider-native system/temperature/JSON-schema; grounding is structural: `penny-thread` re-computes figures from the ledger and discards any mismatched model number; `categorize` constrains the model to the org's own accounts. | Judge-level SQL reconciliation not wired to call sites (grounding is enforced in the data path, not yet as a gate). |
| 3 | **Tools / MCP** (schemas, validation, errors) | 4 | Typed Edge Function contracts (`categorize` propose/approve/delete_rule; `reconcile` op-switch); Anthropic structured outputs via `output_config.json_schema`; provider errors typed as `InferenceError` with kinds; refusal detection. | No formal MCP/tool-calling loop; the model proposes, code executes — a deliberate choice, but not a tool-use agent. |
| 4 | **Agents & skills** | 3 | Scheduled autonomous routines: `regulatory-watcher` (law change -> reviewed seed-diff PR, never self-merge); trust-tiered autonomy auto-posts high-confidence categorizations to a "Penny did this" feed. | Not a multi-step planning agent; bounded, single-purpose routines by design (appropriate for money-critical work). |
| 5 | **Orchestration & routing** (multi-model, cost) | 5 | One `resolve()` routes across `anthropic` / `workers-ai` / `openrouter` (`core.ts`); config-driven routing from DB (`buildInferenceConfig`); per-token cost (`computeCostUsd`); spend caps trigger a backup model, not a failure; cost recorded per `ai_decisions` row. | Admin cost dashboard + live model controls are Phase 3-4 (schema exists). |
| 6 | **RAG & context** (retrieval, failure modes) | 3 | Retrieval is deterministic ledger queries, not vector RAG: server SELECTs the exact report math and the org's own accounts; empty-books path defers instead of reporting a hollow `$0`. Source-exists gate checks citations against context. | No embedding/vector retrieval; the "corpus" is the structured ledger, which fits the domain but is narrower than general RAG. |
| 7 | **Evals & grounding** (unit -> judge -> A/B) | 5 | Real harness in `packages/inference/test/*`: request-parity (`parity.ts`), judge unit tests (`judge.ts`, CI-gated in `build`), latency budget (`chat-latency.ts`); tiered family-aware LLM panel with deterministic floor gates; fail-closed; injection canary; sampled score evals. See [EVALS.md](EVALS.md). | A/B + autonomy ramp are roadmap; precision/recall/F1 on the categorization classifier awaits labeled volume. |
| 8 | **Code quality** | 5 | Pure runtime-agnostic core with injected dependencies (runs on Workers/Deno/Node); vendor-drift CI guard; 74 unit/edge tests + 53 pgTAP tests + 18 CI workflows; `LEARNINGS.md` codifies 24 incident-driven rules; no-magic-numbers discipline enforced by `check-law-literals` / `check-kernel-hardcodes`. | Some connector tokens are pilot-plaintext, graduating to Vault (`sec` migrations note this). |
| 9 | **Scalability & cost** | 4 | Stateless Edge Functions; integer-minor-unit money; idempotent money mutations; append-only ledger; spend caps + cheaper-model fallback; judge cost metered separately and score evals sampled 10-20%; gateway caching gated for safe use cases. | Reports computed on-the-fly (materialized views deferred until needed); caching is Phase 5. |
| 10 | **Guardrails & safety** | 5 | Deterministic floor gates (safety/privacy/format/source-exists/math) beneath every LLM judge; fail-closed; tenant isolation as a data-layer invariant (RLS + `resolve()` throws on empty tenant + `check-tenant-predicate` CI); `SECURITY DEFINER` service-role-only write RPCs; MFA gate; model has no authority (proposals only); VOICE banned-phrase enforcement. | Retention/erasure jobs are schema-only (Phase 5-6); no GDPR/CCPA compliance asserted (correctly flagged for legal). |
| 11 | **Product layer** (PRD depth) | 5 | Clear personas, JTBD, metrics, and Now/Next/Later in [PRD.md](PRD.md); two projections over one ledger; accuracy-over-autonomy tradeoff made explicit and enforced by the ramp. | Referral/waitlist traction only (early access) - no external user-scale numbers to cite. |
| 12 | **FDE journey** (deploy into a live env) | 4 | Import-at-launch (API pull / CSV / opening balances), reversible batches, parallel-run-friendly canonical ledger, provenance on every entry, RLS + audit logs, observability via `ai_decisions`. See [FDE_JOURNEY.md](FDE_JOURNEY.md). | Single-tenant-cohort early access; multi-customer rollout tooling is nascent. |

**Composite:** strong across the board (mean ~4.3/5). The system's signature is
money-critical discipline: deterministic grounding, family-diverse fail-closed
evals, and knowledge-as-data with CI drift guards.

## Model & orchestration details

- **Providers:** `anthropic`, `workers-ai`, `openrouter` (`Provider` type,
  `core.ts`). OpenAI is reachable only through OpenRouter (OpenAI-compatible), not a
  direct vendor.
- **Routing:** use-case keyed. `penny_chat -> claude-haiku-4-5-20251001`,
  `insights -> claude-sonnet-4-6`, `email_compose -> @cf/meta/llama-3.3-70b-instruct-fp8-fast`,
  `content_draft -> claude-sonnet-4-6`. Overridable from `ai_model_config` via the
  runtime twin; Phase-0 callers pinned the model so the refactor was byte-identical
  (proven by `parity.ts`).
- **Cost:** `computeCostUsd(model, usage, prices)` with a seed price table
  (Haiku $1/$5, Sonnet $3/$15 per MTok; Workers-AI free-tier = 0 but usage still
  recorded). Spend cap -> `meta.backup` fallback.
- **Judge roster:** fast-classifier `@cf/meta/llama-3.1-8b-instruct-fast`; panel
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast` + `@cf/mistralai/mistral-small-3.1-24b-instruct`;
  strong judge `claude-sonnet-4-6`. Generator-family-aware selection (`resolvePanel`).

## Guardrails summary

- **Deterministic floor beneath every judge** — regex safety, PII/Luhn privacy,
  valid-format, source-exists, math. Non-LLM, every answer.
- **Fail closed (D3)** — judge timeout/error -> `failed_closed` -> human handoff.
- **Tenant isolation is a data invariant (D15)** — not an AI eval.
- **Input is data, never instructions** — fenced delimiting + injection canary.
- **The model has no authority** — proposals a human approves; write RPCs are
  service-role-only and audit-logged.
- **Knowledge as data** — tax/law/connectors are seed data; `check-law-literals`
  fails CI on a hardcoded law literal.

## Cost posture

Per-answer cost is recorded on `ai_decisions`. Bulk work (categorization, email
drafting) routes to cheap/free-tier Workers-AI models; judgment (insights) uses
Sonnet. Judge cost is metered separately (`judge_cost_usd`) and bounded by sampling
score evals at 10-20% and running the full LLM panel async rather than inline. Spend
caps per use case degrade to a backup model rather than erroring.

## Notable risks / honest gaps

1. **Source-correct reconciliation gate is unwired.** The code and tests exist;
   financial call sites do not yet pass the reconciler. Product-level grounding
   covers this today, but the judge gate should be wired before financial autonomy
   ramps. (Tracked in [EVALS.md](EVALS.md) section 4.)
2. **Voice expense capture is not implemented** - only photo/text receipt capture.
3. **Connector token encryption** is pilot-plaintext in places, graduating to Vault.
4. **Retention/erasure jobs** are schema-only; must land before real bookkeeping
   data flows at volume.

---

*Related: [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [EVALS.md](EVALS.md) ·
[FDE_JOURNEY.md](FDE_JOURNEY.md)*
