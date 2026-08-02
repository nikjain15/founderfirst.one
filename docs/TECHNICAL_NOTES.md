# FounderFirst / Penny, Technical Notes

> A **self-assessment**, written by the team that built the system, walking 12
> dimensions with file-level evidence and the honest gap in each. It is not an
> external review, not a benchmark, and not scored. Read the evidence column and
> judge for yourself; the gap column is the part worth reading first.
>
> This file used to carry a 0-5 score per dimension and a "mean ~4.6/5" composite.
> Those were removed. A team grading its own work produces a number that looks
> measured and is not, and the evidence links below are the part that was ever
> load-bearing.

## Dimensions, evidence, and gaps

| # | Dimension | Evidence (file refs) | Gap |
|---|---|---|---|
| 1 | **Model choice** (LLM vs ML vs hybrid) | Hybrid by design: deterministic rule matcher + vendor priors run before any model in `supabase/functions/categorize`; models are the fallback. Right-sized per task via `DEFAULT_ROUTING` (`packages/inference/src/core.ts`): Haiku (fast), Sonnet (reasoning), Llama 70B (writing). | No trained categorization classifier yet; the ML tier is rules + priors, not a learned model. |
| 2 | **How the AI works** (context, temperature, grounding) | `resolve()` sets provider-native system/temperature/JSON-schema; grounding is structural: `penny-thread` re-computes figures from the ledger and discards any mismatched model number; `categorize` constrains the model to the org's own accounts. | Judge-level SQL reconciliation not wired to call sites (grounding is enforced in the data path, not yet as a gate). |
| 3 | **Tools / MCP** (schemas, validation, errors) | Read-only, tenant-scoped MCP server (`tools/ff-mcp/server.ts`) exposing four ledger tools over a JSON-schema-validated `@conduit/mcp` ToolRegistry, membership-guarded, no write tools, no cross-tenant reads; the same registry backs the in-app investigator's tool calls. Plus typed Edge contracts, Anthropic structured outputs (`output_config.json_schema`), `InferenceError` kinds, refusal detection. See [MCP.md](MCP.md). | Hosted HTTP/SSE transport is specced (URL shape documented) but stdio is the wired transport today. |
| 4 | **Agents & skills** | The ambiguous-categorization path is a bounded `@conduit/agent` reason-act loop (`_shared/conduit-ff/investigator.ts`): read-only tool calls to gather evidence, then one drafted proposal, step-capped and side-effect-free (fail-safe, no ledger authority). Plus scheduled routines: `regulatory-watcher` (law change -> reviewed seed-diff PR, never self-merge) and trust-tiered auto-post to a "Penny did this" feed. | Bounded, single-purpose loops by design (money-critical); not an open-ended planner, and the agent only proposes. |
| 5 | **Orchestration & routing** (multi-model, cost) | One `resolve()` routes across `anthropic` / `workers-ai` / `openrouter` (`core.ts`); config-driven routing from DB (`buildInferenceConfig`); per-token cost (`computeCostUsd`); spend caps trigger a backup model, not a failure; cost recorded per `ai_decisions` row. On the categorization path, dynamic difficulty routing escalates Haiku -> Sonnet -> Opus by confidence / retrieval signal, bounded to two metered passes. | Admin cost dashboard + live model controls are Phase 3-4 (schema exists). |
| 6 | **RAG & context** (retrieval, failure modes) | The investigator grounds on BM25 RAG over the founder's real corpus (chart of accounts + prior categorizations + tax-rule text, `_shared/conduit-ff/retrieval.ts` on `@conduit/rag`), with both RAG failure modes handled: a weak-retrieval gate returns not-found instead of inventing, and a groundedness check flags a rationale with no lexical anchor. For financial figures, retrieval is deterministic ledger math (server re-computes; empty-books defers). Source-exists gate checks citations against context. | BM25 lexical, not embedding/vector retrieval (a deliberate fit for short accounting labels and the Edge runtime, but narrower than dense RAG). |
| 7 | **Evals & grounding** (unit -> judge -> A/B) | Real harness in `packages/inference/test/*`: judge unit tests (`judge.ts`, PR-gated via `pnpm build`), request-parity (`parity.ts`, post-merge only in `pages.yml`), latency budget (`chat-latency.ts`, run manually, no workflow); tiered family-aware LLM panel with deterministic floor gates; fail-closed; injection canary; sampled score evals. The labeled fixture eval genuinely gates PRs through `deno-tests.yml` and computes named IR metrics (precision/recall/F1/accuracy) on the deterministic categorization path. See [EVALS.md](EVALS.md) §8a. | Parity and latency are not PR gates yet; A/B + autonomy ramp are roadmap; the fixture eval scores the lexical matcher on a synthetic 40-row fixture, not the live model/agent path. |
| 8 | **Code quality** | Pure runtime-agnostic core with injected dependencies (runs on Workers/Deno/Node); vendor-drift CI guard; 132 `Deno.test` cases across 22 edge-function test files (115 of them in the `deno-tests.yml` PR gate) + 479 Vitest cases across 52 test files in `apps/app/src` + 58 pgTAP test files + 16 CI workflows; `LEARNINGS.md` codifies 24 incident-driven rules; no-magic-numbers discipline enforced by `check-law-literals` / `check-kernel-hardcodes`. | Test counts are declarations counted in the tree, not a green-run tally; several workflows need repo secrets to run at all. |
| 9 | **Scalability & cost** | Stateless Edge Functions; integer-minor-unit money; idempotent money mutations; append-only ledger; spend caps + cheaper-model fallback; judge cost metered separately and score evals sampled 10-20%; gateway caching gated for safe use cases. | Reports computed on-the-fly (materialized views deferred until needed); caching is Phase 5. |
| 10 | **Guardrails & safety** | Deterministic floor gates (safety/privacy/format/source-exists/math) beneath every LLM judge; fail-closed; tenant isolation as a data-layer invariant (RLS + `resolve()` throws on empty tenant + `check-tenant-predicate` CI); `SECURITY DEFINER` service-role-only write RPCs; MFA gate; model has no authority (proposals only); VOICE banned-phrase enforcement. | Retention/erasure jobs are schema-only (Phase 5-6); no GDPR/CCPA compliance asserted (correctly flagged for legal). |
| 11 | **Product layer** (PRD depth) | Clear personas, JTBD, metrics, and Now/Next/Later in [PRD.md](PRD.md); two projections over one ledger; the accuracy-over-autonomy tradeoff is explicit, and the system sits at its most conservative setting today, 100% human review. | The autonomy ramp's thresholds are not set; they get filled from production data by the method in [GUARDRAILS.md](ai-quality-cost-layer/GUARDRAILS.md). Referral/waitlist traction only (early access), no external user-scale numbers to cite. |
| 12 | **FDE journey** (deploy into a live env) | Import-at-launch (API pull / CSV / opening balances), reversible batches, parallel-run-friendly canonical ledger, provenance on every entry, RLS + audit logs, observability via `ai_decisions`. See [FDE_JOURNEY.md](FDE_JOURNEY.md). | Single-tenant-cohort early access; multi-customer rollout tooling is nascent. |

**The through-line, in one sentence:** the system's signature is money-critical
discipline, meaning deterministic grounding, a bounded no-authority agent on the
ambiguous path, family-diverse fail-closed evals, and knowledge-as-data with CI drift
guards. The honest counterweight is the gap column above plus the risk list below,
and the single most important one is that autonomy is still off and the thresholds
that would turn it on have not been measured
([GUARDRAILS.md](ai-quality-cost-layer/GUARDRAILS.md)).

## Model & orchestration details

- **Providers:** `anthropic`, `workers-ai`, `openrouter` (`Provider` type,
  `core.ts`). OpenAI is reachable only through OpenRouter (OpenAI-compatible), not a
  direct vendor.
- **Routing:** use-case keyed. `penny_chat -> claude-haiku-4-5-20251001`,
  `insights -> claude-sonnet-4-6`, `email_compose -> @cf/meta/llama-3.3-70b-instruct-fp8-fast`,
  `content_draft -> claude-sonnet-4-6`. Overridable from `ai_model_config` via the
  runtime twin; Phase-0 callers pinned the model so the refactor was byte-identical
  (proven by `parity.ts`).
- **Difficulty routing (categorization path):** the investigator escalates across a
  three-rung cascade instead of pinning one model. Cheap tier
  `claude-haiku-4-5-20251001`; reasoning tier `claude-sonnet-4-6`; hardest tier
  `claude-opus-4-8` (all env-overridable via `ANTHROPIC_MODEL[_REASONING|_HARDEST]`).
  A weak pre-model retrieval opens at the reasoning tier; after a pass, low
  confidence or an ungrounded rationale steps to reasoning, and a step-cap hit or no
  grounded draft jumps to hardest. Bounded to two model passes. Sampling contract:
  temperature is sent only to models that accept it (Haiku), withheld from the
  Sonnet/Opus rungs. `CONDUIT_DIFFICULTY_ROUTING=0` pins the cheap tier.
- **Conduit usage reporter:** an env-gated mirror of each metered decision to a
  Conduit gateway (`_shared/conduit-ff/usageReporter.ts`). No-op unless both
  `CONDUIT_GATEWAY_URL` and `CONDUIT_GATEWAY_TOKEN` are set; fire-and-forget, never
  blocks or throws, and does not touch the metered-record math.
- **Cost:** `computeCostUsd(model, usage, prices)` with a seed price table
  (Haiku $1/$5, Sonnet $3/$15 per MTok; Workers-AI free-tier = 0 but usage still
  recorded). Spend cap -> `meta.backup` fallback.
- **Judge roster:** fast-classifier `@cf/meta/llama-3.1-8b-instruct-fast`; panel
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast` + `@cf/mistralai/mistral-small-3.1-24b-instruct`;
  strong judge `claude-sonnet-4-6`. Generator-family-aware selection (`resolvePanel`).

## Guardrails summary

- **Deterministic floor beneath every judge:** regex safety, PII/Luhn privacy,
  valid-format, source-exists, math. Non-LLM, every answer.
- **Fail closed (D3):** judge timeout/error -> `failed_closed` -> human handoff.
- **Tenant isolation is a data invariant (D15):** not an AI eval.
- **Input is data, never instructions:** fenced delimiting + injection canary.
- **The model has no authority:** proposals a human approves; write RPCs are
  service-role-only and audit-logged.
- **Knowledge as data:** tax/law/connectors are seed data; `check-law-literals`
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
2. **Voice expense capture is not implemented:** only photo/text receipt capture.
3. **Connector token encryption: QuickBooks and Plaid done, Xero still open.**
   *Correction to the record:* an earlier version of this note read "Connector token
   encryption shipped" and a companion note in `STAKEHOLDERS.md` claimed the
   machinery was "used for QuickBooks and Xero". Neither was true. Only the QBO edge
   functions were ever wired to it. Plaid wrote its access token in plaintext on
   every link, and Xero still does.
   - **QuickBooks (done).** Tokens on `external_connections` are encrypted at rest
     with pgcrypto under a key held as a **Vault** secret
     (`20260707130000_iq1_qbo_token_encryption.sql`); existing rows were encrypted in
     place and the legacy plaintext columns nulled
     (`20260708010000_iq1_cleanup_qbo_plaintext.sql`). pgTAP:
     `supabase/tests/iq1_qbo_token_encryption_test.sql`,
     `supabase/tests/iq1_cleanup_qbo_plaintext_test.sql`.
   - **Plaid (done, IQ-2).** `20260802120000_iq2_plaid_token_encryption.sql` adds
     provider-neutral aliases (`enc_connection_token`, `dec_connection_token`,
     `set_connection_tokens`) over the historical QBO-named helpers, then encrypts and
     nulls every remaining plaintext Plaid token. `plaid-exchange` now writes through
     `set_connection_tokens()` so the token is only ever at rest as ciphertext, and
     `plaid-sync` / `plaid-webhook` read through `ext_connection_secrets()` instead of
     selecting the raw column. pgTAP:
     `supabase/tests/iq2_plaid_token_encryption_test.sql`.
   - **Xero (open).** `xero-callback` still writes `access_token` / `refresh_token` in
     plaintext and `xero-import` still selects them directly, so the IQ-2 backfill is
     deliberately scoped to `provider = 'plaid'` rather than clearing every plaintext
     token and breaking live Xero connections. **Next action:** route `xero-callback`
     and `xero-import` through `set_connection_tokens()` / `ext_connection_secrets()`
     and backfill Xero the same way.
   - `ext_connection_secrets()` still coalesces to the plaintext column as
     defense-in-depth, so a connector wired without going through the setter can still
     write an unencrypted token. That fallback is what keeps Xero working today.
4. **Retention/erasure jobs** are schema-only; must land before real bookkeeping
   data flows at volume.

---

*Related: [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [EVALS.md](EVALS.md) ·
[FDE_JOURNEY.md](FDE_JOURNEY.md)*
