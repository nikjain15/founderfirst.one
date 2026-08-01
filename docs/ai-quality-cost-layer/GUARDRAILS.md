# AI quality & cost layer, guardrails (living)

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

The checker panel is **generator-family-aware:** gate-eval judges are always a
different model family than the generator (D20). Roster (`DEFAULT_ROSTER`,
`packages/inference/src/judge.ts`), all reachable on today's stack (Anthropic API
+ Workers-AI via the gateway, no new infra):

- **Fast-classifier (inline triage):** `@cf/meta/llama-3.1-8b-instruct-fast` (Meta).
- **Panel (escalation):** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Meta) +
  `@cf/mistralai/mistral-small-3.1-24b-instruct` (Mistral), two distinct
  non-Anthropic families for grading the Anthropic generators (chat=Haiku,
  insights=Sonnet).
- **Strong judge (financial floor / Meta-generator filler):** `claude-sonnet-4-6`.

`resolvePanel(generator, roster, needStrong)` picks ≥2 distinct families ≠ the
generator's; the strong judge fills the 2nd slot when the generator IS one of the
panel families (e.g. the Meta email generator leaves only Mistral). **Live chat
runs the DETERMINISTIC floor inline** (`llmDisabled`, safety prefilter + privacy
+ valid-format, instant, reliably block hard-unsafe/PII within the <500ms budget)
and runs the **full multi-model LLM panel ASYNC** (`finalizeChatDecision`, phase
"all"), which sets `gate_status` so blocked/escalated answers reach the review
queue. Real Workers-AI judge latency (~0.5–2s) can't fit an inline live-chat
budget, so an inline LLM judge would fail-closed on every turn, verified in prod
(28 Jun). A deterministic gate fail still fails closed to a human handoff. **On
Supabase Edge (Deno) the LLM panel is likewise deferred** (no Workers-AI binding,
same-family Anthropic judge barred), insights gets deterministic gates now, LLM
grounding later.

The deterministic floor runs for **every** gate that declares a `check_ref` -
including an `llm_judge` eval like `safety` ("rules + AI judge"): the rule is a
hard floor BENEATH the panel and a rule fail blocks before any model call.

The load-test gate (`pnpm test:chat-latency`) must pass (p95 added-latency <500ms,
slow-judge runs capped at the budget → fail-closed) **before** live-chat judging is
enabled. It is **run manually today**; it is wired to no workflow, so it is a
release precondition an operator executes, not a check CI enforces. `pnpm
check:judge` unit-tests the judge and does run in CI (it is inside `pnpm build`).
Neither touches the network. **Next action:** add `pnpm test:chat-latency` to a
workflow so the precondition is machine-enforced.

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

## Autonomy ramp

### Current state: full autonomy is OFF

Autonomy has not been enabled for any tenant, cohort, or use case. Every
categorization and every customer-facing answer is at **100% human review**
today. Nothing in this section describes a live setting; it describes how the
setting will be earned.

### The evidence we actually have

One measured quality number exists in this repo, and it is an offline one. The
labeled categorization eval
(`supabase/functions/_shared/conduit-ff/evals/categorize-eval.test.ts`) scores
the deterministic path over a committed 40-row fixture and measures **82.5%
accuracy and 85.6% macro F1**, with CI floors set just below at 0.80 and 0.85.
That fixture is **synthetic and hand-labeled**. It is a regression gate on the
lexical matching kernel, **not a measure of live accuracy**, and it exercises
the deterministic path only, never the model or agent path. No production
zero-edit approval rate, no production correction rate, and no live safety or
privacy failure rate exists yet, because no production decisions have run
without human review.

### Why this section documents a method and not a number

Every threshold below is deliberately left to be filled in from real production
data. Publishing a specific number here today would be false precision: this
document declares its rules non-negotiable, so a number in it reads as a
commitment that was measured and validated, and none of these have been.
The method is fixed now so the numbers cannot be chosen after the fact to fit
whatever the data happens to show.

### How each threshold gets set

**1. Sample size, from a binomial lower bound.** A ramp claim is a claim about a
*true* clean rate, not an observed one. So the sample must be large enough that
the observed clean rate supports the claimed rate as a **95%-confidence lower
bound** (Wilson or Clopper-Pearson; either is acceptable, the choice is recorded
with the certification). Worked illustration of why the size matters: **200
decisions at 98% observed** supports a true clean rate of **at least about 95%**,
whereas **100 decisions at the same 98% observed** supports only **about 93%**.
Same observed rate, weaker guarantee, because the interval is wider. A smaller
sample therefore cannot support the stronger claim no matter how clean it looks,
and N is chosen from the rate being claimed rather than from how soon a ramp is
wanted. [`docs/PRD.md`](../PRD.md) §5.1 already states a zero-edit approval
**target** of ≥ 85% per tenant cohort; that is a target, and it becomes a ramp
threshold only once a sample of the size described here certifies it.

**2. Observation window, anchored to the close.** The window must span **at least
one full month-end close**, and **two closes are preferred**. Bookkeeping error
is not uniformly distributed across the month. Rent, payroll, subscription
renewals, and accrual and reversal entries cluster at period boundaries, so a
window that never crosses a close has simply not seen the transactions most
likely to be misfiled. Calendar time is the constraint on the window; sample
size is the constraint on N; whichever binds later governs.

**3. Autonomy is granted per vendor rule, not by a global switch.** The unit of
trust is a **single learned vendor rule**, not the system. A rule that has
matched many times with zero corrections has earned evidence about itself that
the system as a whole has not earned, and a rule with three matches has earned
nothing regardless of how well its neighbors performed. Each rule carries its own
match count, correction count, and certified lower bound; each is ramped, and
rolled back, independently. Learned rules stay tenant-partitioned and are never
promoted to a shared scope (D17).

**4. Rollback triggers.** A rule or cohort is demoted to full review when either
condition holds:

- the **rolling 30-day clean rate falls below the certified lower bound** that
  was used to grant its current autonomy level, or
- **any single safety or privacy failure** occurs. That one is not a rate. One
  failure demotes immediately.

Rollback is automatic and does not wait for a human to approve it; only the
ramp *up* requires human approval. A shadow-review sample runs continuously
post-ramp so the clean rate keeps being measured after review stops being
mandatory (D5, D25).

**5. Judge-cost cap, anchored to an SLO that already exists.** Judge cost is not
capped at an invented percentage. It is bounded by the **published chat cost SLO
of $0.010 per answer** ([`docs/PRD.md`](../PRD.md) §5.1, cost per answer including
judge, measured over a 30-day window by `admin_ai_suqs`): generator plus judge
together stay inside that budget, which is what sets the room judging gets.
Score evals stay sampled at 10-20% rather than run at 100% (D12, D22), and a use
case that would breach the SLO reduces sampling or drops to a cheaper judge
rather than dropping the deterministic floor, which is never disableable.

### Rules that are already in force

- Start at **100% review**, per tenant cohort (D5). This is the current state.
- Each reduction is proposed by the system and **approved by a human**,
  audit-logged (D4). No ramp is automatic.
- Financial use cases cannot advance until the **Source-correct** reconciliation
  gate is wired to its call sites (D16); the gate code and its tests exist today,
  the wiring does not.
- Graduated rules are re-validated through the gates, expire, and auto-demote on
  correction (D17). Rules and cache are tenant-partitioned.

**Next action:** fill each threshold from production data once decisions are
flowing under review, recording the sample size, the observed rate, the
confidence bound, and the closes covered alongside the number, in this file.

## Model, judge & cost rules

- The gate-eval judge is a **different model family** than the generator; locked
  financial gates use a stronger judge (D20).
- Model/routing changes pass "test on recent answers" before going live (D10).
- Spend caps per use case are enforced (gateway or `resolve()`); hitting a cap
  triggers **fallback, not failure** (D11).
- Judge cost is bounded by the **published per-answer cost SLO** rather than by a
  separately invented percentage: generator plus judge together stay inside the
  use case's `ai_suqs_slo` budget (Penny chat ≤ $0.010, insights ≤ $0.150, email
  ≤ $0.020, [`docs/PRD.md`](../PRD.md) §5.1). Score-evals are **sampled**
  (10–20%), not run at 100% (D12, D22). A use case trending over budget reduces
  sampling or drops to a cheaper judge; the deterministic floor is never the
  thing that gets cut.
- Customer input is treated as **data, never instructions** (structured
  delimiting + instruction hierarchy); injection canaries live in the eval suite
  (D20).

## Data rules, retention, archive & erasure (D19, D24; LEARNINGS rule 8)

The `ai_decisions` table is a new store of personal data. It is governed as:

- **Raw retention: 90 days.** `retain_until` defaults to `created_at + 90 days`.
  Raw `input` / `output` are readable for that window (review, debugging, the
  dashboard). PII can be minimized per call (`record.storeInput = false` → input
  stored null) and **must** be for financial use cases (D11).
- **Then archive, de-identified, not silent purge** (D24). After `retain_until`,
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
  compliance in comments or copy, flag for legal sign-off **before real
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
