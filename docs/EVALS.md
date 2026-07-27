# FounderFirst / Penny, Evaluation Strategy

> How Penny's AI is held to a money-critical accuracy bar. This documents the
> **real** eval harness in `packages/inference` (Phase 2, built) and names what is
> implemented today versus roadmap. The governing rules live in
> [`docs/ai-quality-cost-layer/GUARDRAILS.md`](ai-quality-cost-layer/GUARDRAILS.md).

## 1. Why evals are the product, not a test suite

Penny operates on money. The stated bar is: **a confident wrong number is worse than
a question.** So the top risk the eval design targets is *false confidence*, an eval
that passes while missing a real error. Every design choice below follows from that:
deterministic checks under the LLM ones, judges from a different model family than
the generator, fail-closed on any doubt, and 100%-review before any autonomy.

The layers, from cheapest/hardest to most expensive/softest:

```
unit + parity  ->  deterministic floor gates  ->  SQL reconciliation  ->  LLM-judge panel  ->  A/B + autonomy ramp
(offline, CI)      (every answer, non-LLM)       (financial, exact)      (family-aware)        (online, roadmap)
```

## 2. Layer 1, Unit tests and request-parity (implemented, CI-gated)

**Request parity** (`packages/inference/test/parity.ts`, `pnpm check:inference`).
When the whole codebase was routed through the new `resolve()` seam, the risk was
that answers would silently change. This harness mocks the transports, captures the
exact provider request `resolve()` builds, and deep-compares it (key-order-independent)
against the legacy request body copied verbatim from each pre-refactor call site. It
covers all four routed sites (Penny chat, synthesize-insights, email compose,
insights fallback) plus invariants (empty tenant throws, a Workers-AI model is refused
off the Workers runtime), the DB-backed config path (cap fallback, cache gate), and
the OpenRouter provider. Green means every routed call site builds a byte-identical
provider request, so answers are provably unchanged.

**Judge unit tests** (`packages/inference/test/judge.ts`, `pnpm check:judge`, and in
the `build` script so it gates CI). Model calls are mocked with scripted verdict
JSON, no network. It asserts the gate machinery directly: each deterministic gate,
family-aware panel composition, fail-closed behavior (missing reconciler, panel
error), classifier triage, `llmDisabled` deferral, an injection canary, score-eval
sampling, and outcome-merge precedence.

**Latency budget gate** (`packages/inference/test/chat-latency.ts`,
`pnpm test:chat-latency`). A load test that runs the inline gate path 80 times with
realistic mocked model latencies and asserts p95 added latency < 500ms with
slow-judge runs capped at the budget (fail-closed). This is the gate that must pass
before live-chat LLM judging is enabled.

## 3. Layer 2, Deterministic floor gates (implemented)

Non-LLM code that runs on **every** answer, beneath any model judge. Agreement of LLM
judges is never a substitute for these (`packages/inference/src/judge.ts`):

| Gate | `check_ref` | What it enforces |
|---|---|---|
| Safety prefilter | `safety_prefilter.v1` | Hard-blocks egregious guarantees / absolutes ("100% deductible", "you won't be audited"). |
| Privacy | `privacy.v1` | Blocks raw PII (SSN-shaped strings, Luhn-valid card numbers) from appearing in an answer. |
| Valid format | `valid_format.v1` | Non-empty answer; non-empty object when the caller parsed JSON. |
| Source-exists | `source_exists.v1` | Every citation in the answer must be present in the grounding context; citations with no context -> fail. |
| Math | `math.v1` | Structured line items must sum to the stated total (1-cent tolerance). |

Tenant isolation is deliberately **not** an LLM eval, it is a data-layer invariant
(`tenant_id NOT NULL`, RLS, `resolve()` throws on an empty tenant, `pnpm check:tenant`
in CI). The privacy gate is defense-in-depth, never the boundary.

## 4. Layer 3, SQL reconciliation (financial source-correctness)

For financial answers, cited figures must reconcile against real records via a
deterministic SQL check (`SourceReconcile`, injected so the pure judge never touches a
DB). This is the gate that lets a financial use case ramp toward autonomy. **Status:
the gate code and its unit tests exist; the reconciler is not yet wired into every
financial call site**, if a source-correct gate is required but no reconciler is
configured, the judge fails closed. Wiring it end-to-end is the top eval-roadmap item.

Note that grounding itself is already enforced in the product data path today, just
not through this judge gate: `penny-thread` re-computes every figure from the org's
own ledger and discards any model-emitted number that differs, and `categorize`
constrains the model to the org's own accounts. See [ARCHITECTURE.md](ARCHITECTURE.md)
sections 3-4.

## 5. Layer 4, The LLM-judge panel (implemented)

When an answer needs judgment beyond rules, `judge()` runs a **tiered, generator-
family-aware panel**:

- **Fast-classifier triage (inline).** One cheap, different-family model
  (`@cf/meta/llama-3.1-8b-instruct-fast`) returns `{"clear", "suspect":[...]}`, it
  decides *escalate or not*, never a verdict.
- **Escalation panel.** `resolvePanel()` picks >=2 judges of **different model
  families, each different from the generator's family** (decision D20), so an
  Anthropic-generated answer is never graded only by Anthropic. Default roster:
  Llama 3.3 70B (Meta) + Mistral Small (Mistral), with Claude Sonnet as the stronger
  judge for financial floor gates or when the generator itself is Meta.
- **Combine rule.** Gate evals combine `unanimous` by default: all-pass -> pass, any
  unanimous fail -> `blocked`, a split -> `escalated` to a human. Score evals return
  0..1, are averaged, and are **sampled at 10-20%** so judge cost stays bounded, they
  never gate.
- **Fail closed (D3).** On judge timeout or error the status is `failed_closed` and
  the caller hands off to a human / templated reply. Status precedence:
  `failed_closed > blocked > escalated > passed`.
- **Injection-safe.** The customer message and the answer are always framed as
  fenced **data, never instructions**, and an injection canary lives in the suite.

Judge calls reuse the single provider path (`rawModelCall`) and are metered
separately: their cost rolls into `judge_cost_usd` on the judged `ai_decisions` row,
not as their own decisions.

## 6. Named metrics

- **Gate outcome distribution:** `passed` / `blocked` / `escalated` /
  `failed_closed` per use case (from `ai_decisions.gate_status`). Safety and privacy
  failures target **zero**.
- **Categorization precision** and **zero-edit approval rate** per tenant cohort -
  the accuracy floor that gates the autonomy ramp (`categorization_outcomes`).
- **Escalation rate** and **CPA/customer correction rate** (rolling), a rise in
  corrections auto-demotes learned rules and can trigger rollback.
- **Score-eval scores** (e.g. voice, grounding), sampled 0..1 averages.
- **Cost per answer** and **judge-cost as % of answer cost:** kept under a cap.
- **Added latency p95** for inline judging, held < 500ms by the load-test gate.

Precision / recall / F1 are the right frame for the categorization classifier. In
production those numbers are computed from approvals and corrections as labeled
outcome data accumulates. Offline, the labeled categorization eval in section 9a
computes exactly these named metrics over a hand-labeled fixture so the classifier is
scored in CI today, not only once live data lands.

## 7. Layer 5, Online: A/B and the autonomy ramp (roadmap)

The schema for experiments exists (`experiments`, `experiment_arms`,
`experiment_results`) and the model layer already routes by config, so a routing or
prompt change can be A/B tested by cohort. The **autonomy ramp** (GUARDRAILS) is the
online eval loop: start at 100% human review; advance to sampling only after a cohort
clears thresholds (zero safety/privacy failures, a minimum zero-edit approval rate
over a window); each reduction is proposed by the system and approved by a human,
audit-logged; and correction-rate regressions trigger rollback. Financial use cases
cannot advance until the source-correct reconciliation gate is wired.

## 8. What is implemented vs roadmap

| Layer | Status |
|---|---|
| Request parity + judge unit tests + latency gate | Implemented, CI-gated (`check:inference`, `check:judge`, `test:chat-latency`) |
| Deterministic floor gates (safety/privacy/format/source-exists/math) | Implemented + unit-tested |
| Product-level grounding (ledger-computed facts, account-constrained proposals) | Implemented (`penny-thread`, `categorize`) |
| SQL reconciliation gate | Code + tests exist; **not yet wired to call sites** (fails closed if required) |
| LLM-judge panel (family-aware, fail-closed, injection-safe) | Implemented; runs async for chat, deterministic-only inline |
| A/B experiments + autonomy ramp | Schema exists; ramp is roadmap (Phases 3-6) |
| Retention / erasure jobs on `ai_decisions` | Schema exists (90-day `retain_until`); jobs roadmap |

## 9. The `/evals` starter harness

A small, self-contained, dependency-free eval runner lives in
[`/evals`](../evals/README.md). It runs the repo's real deterministic gate functions
(imported directly from `packages/inference/src/judge.ts`) against a labeled dataset
of Penny-style answers and prints precision / recall / F1 for the safety and privacy
gates plus pass/fail for the format, source-exists, and math gates. It touches no
production paths and no network. Run it with `pnpm eval:gates`. This is additive
scaffolding for expanding the golden set; the authoritative gate tests remain
`packages/inference/test/*`.

## 9a. Labeled categorization eval (named IR metrics, deterministic path, CI-gated)

The flagship use case is `penny_categorize`: file a ledger transaction into an
expense or income account. This eval names statistical IR metrics for that
classifier. It runs the **deterministic** categorization path only (the rule +
vendor-prior lexical matcher in
`supabase/functions/_shared/conduit-ff/deterministic.ts`, the same predicate the edge
function uses), so it executes fully **offline in CI with no API key, no database, and
no network**. The model / agent path is not exercised here.

- **Fixture.** `supabase/functions/_shared/conduit-ff/evals/categorize-labeled.json`
  is a synthetic, hand-labeled evaluation fixture of **40 rows** across 11 accounts.
  It is a labeled fixture, **not production data and not a measure of live accuracy**.
  Vendor names are invented and neutral. Rows cover easy hits, hint-carried vendors,
  and deliberately ambiguous / no-match cases so the score is not inflated.
- **Metrics module.** `evals/metrics.ts` builds a confusion matrix and computes
  overall accuracy, per-class precision / recall / F1, and macro-averaged
  precision / recall / F1. Its math is verified against a hand-built confusion matrix
  in `evals/metrics.test.ts`.
- **Runner + gate.** `evals/categorize-runner.ts` runs the deterministic categorizer
  over the fixture and scores it. `evals/categorize-eval.test.ts` runs in the existing
  Deno CI gate (`deno test --allow-env supabase/functions/_shared/`), asserts the named
  metrics are computed, and asserts macro-F1 and accuracy clear a floor set at or just
  below the real measured values.

**Real measured numbers on the committed 40-row fixture (deterministic path, offline):**

| Metric | Value |
|---|---|
| Overall accuracy | 82.5% (33/40) |
| Macro precision | 92.9% |
| Macro recall | 84.9% |
| Macro F1 | 85.6% |

CI floors are macro-F1 >= 0.85 and accuracy >= 0.80, set just below the measured
values so the gate is honest and green, while a real regression in the matcher would
fail it. The recall gap is expected and honest: the deterministic path deliberately
declines (files to `Uncategorized`) on the ambiguous rows rather than guess, which is
the money-critical behavior that a confident wrong number is worse than a question.

---

*Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md)*
