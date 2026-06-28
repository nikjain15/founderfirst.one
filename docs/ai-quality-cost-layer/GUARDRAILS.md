# AI quality & cost layer — guardrails (living)

The load-bearing rules for the layer every Penny AI request passes through
(`@ff/inference` → `resolve()`). This is the operational companion to the plan
([`docs/plans/ai-quality-cost-layer-plan.html`](../plans/ai-quality-cost-layer-plan.html),
decisions D1–D25). Update it as each phase lands. Nothing below is disableable
without an explicit, audit-logged decision.

Status: **Phase 2 (judging) built.** Phase 0 = the seam (answers unchanged), Phase
1 = the dashboard, **Phase 2 = the eval library + tiered checker panel + live-chat
gate**. Phases 3–6 add the review queue, admin model controls, caching/ramp, and
bookkeeping. Rules for later phases are stated now so the build follows policy.

## Panel composition (the approved Phase-2 default)

The checker panel is **generator-family-aware** — gate-eval judges are always a
different model family than the generator (D20). Roster (`DEFAULT_ROSTER`,
`packages/inference/src/judge.ts`), all reachable on today's stack (Anthropic API
+ Workers-AI via the gateway, no new infra):

- **Fast-classifier (inline triage):** `@cf/meta/llama-3.1-8b-instruct-fast` (Meta).
- **Panel (escalation):** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Meta) +
  `@cf/mistralai/mistral-small-3.1-24b-instruct` (Mistral) — two distinct
  non-Anthropic families for grading the Anthropic generators (chat=Haiku,
  insights=Sonnet).
- **Strong judge (financial floor / Meta-generator filler):** `claude-sonnet-4-6`.

`resolvePanel(generator, roster, needStrong)` picks ≥2 distinct families ≠ the
generator's; the strong judge fills the 2nd slot when the generator IS one of the
panel families (e.g. the Meta email generator leaves only Mistral). **Live chat
runs the DETERMINISTIC floor inline** (`llmDisabled` — safety prefilter + privacy
+ valid-format, instant, reliably block hard-unsafe/PII within the <500ms budget)
and runs the **full multi-model LLM panel ASYNC** (`finalizeChatDecision`, phase
"all"), which sets `gate_status` so blocked/escalated answers reach the review
queue. Real Workers-AI judge latency (~0.5–2s) can't fit an inline live-chat
budget, so an inline LLM judge would fail-closed on every turn — verified in prod
(28 Jun). A deterministic gate fail still fails closed to a human handoff. **On
Supabase Edge (Deno) the LLM panel is likewise deferred** (no Workers-AI binding,
same-family Anthropic judge barred) — insights gets deterministic gates now, LLM
grounding later.

The deterministic floor runs for **every** gate that declares a `check_ref` —
including an `llm_judge` eval like `safety` ("rules + AI judge"): the rule is a
hard floor BENEATH the panel and a rule fail blocks before any model call.

The load-test gate (`pnpm test:chat-latency`) must pass (p95 added-latency <500ms,
slow-judge runs capped at the budget → fail-closed) **before** live-chat judging is
enabled. Unit-tested by `pnpm check:judge`; both run nothing against the network.

## Mandatory floor (cannot be disabled)

- Customer-facing use cases run **Safe** and **Privacy / tenant-isolation** gates
  at all times, enforced by **deterministic, non-LLM** checks (D8, D15, D20).
- Financial outputs run **Source-exists**, **Source-correct** (SQL
  reconciliation), and **Math** gates (D16).
- No output ships if a gate fails. **On judge timeout/error, fail CLOSED** to a
  templated human-handoff (D3). Never fail-open, never ship ungated.
- **Tenant isolation is a data-layer invariant, not an AI eval** (D15):
  `tenant_id NOT NULL` on `ai_decisions` (and the cache + rule tables when they
  land); every query carries `tenant_id`; `resolve()` throws on an empty tenant;
  CI (`pnpm check:tenant`) fails the build on any unprotected access. The Privacy
  eval is defense-in-depth, never the boundary.

## Autonomy-ramp rules (thresholds tuned with real data + reviewer capacity)

- Start at **100% review**. Advance 100% → sampling only after: ≥ [N] decisions,
  ≥ [X]% **zero-edit** approval, and **zero** safety/privacy failures over [T]
  weeks, **per tenant cohort** (D5).
- Each reduction is proposed by the system and **approved by a human**,
  audit-logged (D4).
- **Rollback** on the lagging CPA/customer-correction rate falling below [Y]%
  (rolling window); a shadow-review sample runs continuously post-ramp (D5, D25).
- Financial use cases cannot advance until the **Source-correct** reconciliation
  gate exists as code (D16).
- Graduated rules are re-validated through the gates, expire, and auto-demote on
  correction (D17). Rules/cache are tenant-partitioned; learned mappings are
  never promoted to a shared scope.

## Model, judge & cost rules

- The gate-eval judge is a **different model family** than the generator; locked
  financial gates use a stronger judge (D20).
- Model/routing changes pass "test on recent answers" before going live (D10).
- Spend caps per use case are enforced (gateway or `resolve()`); hitting a cap
  triggers **fallback, not failure** (D11).
- "Judge cost as % of answer cost" stays under [cap]; score-evals are **sampled**
  (10–20%), not run at 100% (D12, D22).
- Customer input is treated as **data, never instructions** (structured
  delimiting + instruction hierarchy); injection canaries live in the eval suite
  (D20).

## Data rules — retention, archive & erasure (D19, D24; LEARNINGS rule 8)

The `ai_decisions` table is a new store of personal data. It is governed as:

- **Raw retention: 90 days.** `retain_until` defaults to `created_at + 90 days`.
  Raw `input` / `output` are readable for that window (review, debugging, the
  dashboard). PII can be minimized per call (`record.storeInput = false` → input
  stored null) and **must** be for financial use cases (D11).
- **Then archive, de-identified — not silent purge** (D24). After `retain_until`,
  a job strips personal details and sets `deidentified = true` / `archived_at`.
  De-identified data trains our own cheaper models; **personal details are
  stripped BEFORE any data enters a training set**, so a trained model is never
  tied to an individual.
- **Right-to-erasure is first-class** (D19). An erasure request soft-deletes
  (`deleted_at`) then hard-cascades to `ai_decisions` + judge rationale + the
  cache/Vectorize entries **and the de-identified archive**, per the law. Ties to
  the open Discord erasure obligation ([[project_discord_data_retention]]).
- **Disclose retention; do not assert compliance in code.** The privacy policy
  must disclose this retention + offer erasure. Do **not** assert GDPR/CCPA
  compliance in comments or copy — flag for legal sign-off **before real
  bookkeeping data flows** (open item §11 of the plan).
- Gateway body-logging is **minimized** for financial use cases (Supabase is the
  sole audit record); gateway/exact-match cache is keyed by tenant or off for
  financial (D11).

### Implementation status of the data rules

| Rule | Phase 0 | Later |
| --- | --- | --- |
| `retain_until` column (90d default) | ✅ schema | retention job: Phase 5 |
| `archived_at` / `deidentified` columns | ✅ schema | de-identify + train: Phase 6 (D24) |
| `deleted_at` soft-erasure column | ✅ schema | erasure RPC + hard cascade: Phase 5 |
| PII-minimization toggle (`storeInput`) | ✅ in `resolve()` | enforced for financial: Phase 6 |
| Privacy-policy disclosure + legal sign-off | ⏳ open | before bookkeeping data flows |
