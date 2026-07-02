# Categorization — multi-model validation & cost-aware model selection

**Status:** design / proposal (no code yet). **Parent system:** this instantiates the
[AI quality & cost layer](ai-quality-cost-layer-plan.html) (+ its living
[GUARDRAILS](../ai-quality-cost-layer/GUARDRAILS.md)) for categorization.
**North star:** make Penny's
categorization *as accurate as possible*, prove it with data, and serve that
accuracy at the **lowest cost** — with a first-class **admin view of how well
we're doing**.

This is not a greenfield build. It is **applying the AI quality & cost layer we
already have** (`@ff/inference`, `ai_decisions`, OpenRouter, the admin
`Quality.tsx` dashboard) to the categorization use-case, plus one new idea that is
unique to categorization: **we already have the right answer.**

---

## 1. The key insight — categorization has built-in ground truth

Most AI features have to *guess* whether an answer was good (that's what the
generic LLM-judge panel is for). Categorization is different: **every time a human
Approves or overrides Penny's pick, that is a labeled correct answer.**

When `recategorize_entry` runs, `p_to_account_id` is the account a human accepted.
So for any model that proposed an account for that transaction, we can compute the
single most valuable metric in the whole system:

> **Did this model's proposed account equal the account the human ultimately
> accepted?**

That is real, free, continuously-arriving accuracy data — per model, per
use-case, per industry, per org. It is a far stronger signal than model-judges
grading each other, and it is the spine of everything below.

### 1a. Not all labels are equal — a **CPA's decision outweighs a user's**

The person approving matters. A qualified **CPA** correcting a category is a far
more authoritative "right answer" than a busy business owner one-tap-accepting a
suggestion. So labels are **weighted by approver authority**, and a later, more
authoritative decision **supersedes** an earlier one:

| Event | Label weight | Notes |
|---|---|---|
| **CPA** corrects/overrides Penny | **highest (gold)** | the strongest signal we have |
| CPA accepts Penny's pick as-is | high | confirms correctness |
| Owner/user corrects Penny | medium | real, but less expert |
| Owner/user one-tap-accepts | low (could be rubber-stamping) | discount it |
| **CPA later re-categorizes what a user had accepted** | **gold — and it overrides** the user's earlier label | also a *strong negative*: the model AND the user were both wrong |

Concretely: the scorecard's "accuracy" is a **weighted** accuracy (a model that
matches the CPA's choice scores higher than one that only matches a rubber-stamp),
and the ground-truth account for an entry is always the **most authoritative**
decision on record. When a CPA overrides a user, we (a) re-score every model
against the CPA's answer, and (b) flag the entry as a "user got it wrong" case —
useful both for model training and for nudging that user. Approver role is already
on the record (`recategorize`/`approve` carry the actor; CPA vs. member is known
via `has_membership_as` / engagement), so this is a weighting on data we already
capture — no new input from anyone.

---

## 2. What already exists (reuse, don't rebuild)

| Capability | Where | Reuse for this |
|---|---|---|
| One model call → priced, timed, recorded | `@ff/inference` `resolve()` → `ai_decisions` (one row per AI answer, `tenant_id`, `model`, `cost_usd`, `evals` jsonb, `output_json`, `ref`=entry id) | Each panel model writes a sibling `ai_decisions` row keyed by the same entry. |
| **OpenRouter already integrated** | `Provider="openrouter"`, OpenAI-compatible transport in `_shared/inference/deno.ts` | The panel runs N models through **one** API — no new provider plumbing. |
| Config-driven routing (use-case → model) | `InferenceConfig.routing` / `prices`, admin-editable via `ai_runtime_inference_config` | Flip live traffic to the winning model with **zero code change**. |
| Multi-family judge panel + voting | `judge.ts` (gate/score evals, escalation panel, recorded votes) | Reused for *disagreement escalation*, not as the primary accuracy signal. |
| Admin AI quality/cost dashboard | `apps/admin/src/routes/Quality.tsx` + `styles/ai-quality.css` | The new **categorization scorecard** is a section/route here. |
| Bandit / experiments | `bandit` edge fn, `experiments_winner` | The exploration policy for "try a cheaper model on a slice." |

**What's missing:** categorize today calls **one pinned model** (Haiku,
`categorize/index.ts`) and runs **no** validation/selection. That's the gap.

---

## 3. Architecture

```
                       ┌─────────────────────────────────────────────┐
  import txn ──► holding (Uncategorized)                              │
                       │                                              │
  Categorize tab ──► propose (categorize edge fn)                     │
                       │  1. rule match? → return (no model spend)    │
                       │  2. PRIMARY model (grounded) → user sees this│  ◄── unchanged UX
                       │  3. ctx.waitUntil(SHADOW PANEL):             │
                       │       run N OpenRouter models on the SAME    │
                       │       grounded prompt, async, never blocks   │
                       │       → write one ai_decisions row each      │
                       └───────────────┬──────────────────────────────┘
                                       │
  human Approves/overrides ──► recategorize_entry(to_account_id)      ◄── the LABEL
                                       │
                  ┌────────────────────▼─────────────────────┐
                  │  labeler job: join each model's pick for  │
                  │  this entry → the approved account        │
                  │  → categorization_model_runs (scored)     │
                  └────────────────────┬─────────────────────┘
                                       │
              ┌────────────────────────▼────────────────────────┐
              │  admin scorecard (Quality.tsx): accuracy × cost  │
              │  per model, agreement, override rate, $/correct  │
              └────────────────────────┬────────────────────────┘
                                       │
                       selection policy → ai_runtime_inference_config.routing
                       (cheapest model clearing the accuracy bar wins)
```

**Runtime choice — async shadow, not synchronous panel.** The panel must NOT add
latency to the user's "Penny is thinking…". It runs in `ctx.waitUntil` after the
primary answer returns (the inference layer already does crash-safe async writes,
D18). The panel uses **OpenRouter** (one key, many models) so it works from the
Deno edge fn without a Workers-AI binding and without the same-family-judge
restriction (D20) that blocks synchronous Anthropic-judges-Anthropic on the edge.

**Grounding is unchanged and stays server-authoritative.** Every panel model gets
the same constraint the primary does: it may only return an `account_id` from
*this org's* chart of accounts, and the server rejects anything else
(`byId.has(...)`). No model — primary or panel — can ever introduce an account.

### 3a. The panel doubles as a **fallback / resilience layer**

The roster isn't only for measurement — it's also how categorization stays up. The
primary model is served through an **ordered, health-aware fallback chain**: if the
primary times out / 429s / errors (the `categorize` fn already catches this and
returns a null proposal today), we transparently fall to the next healthy model in
the roster instead of giving the user nothing. Because every candidate runs the
*same* grounded prompt and the *same* server-side validation, any of them is a safe
substitute. The scorecard's accuracy+latency data orders the chain (best-value
first), so the fallback is also a *good* model, not just any model. Net: a single
provider outage degrades to "slightly different model," never to "Penny is down."

## 3b. Why not just default to Haiku? — start even-handed, let data decide

Haiku is only the current model because **Phase 0 deliberately pinned every
caller's existing model unchanged** (`pinModel`, so answers were provably identical
during the migration). That's a starting point, **not a verdict** — and hard-coding
a single default is exactly the assumption this feature exists to remove.

So the roster opens **even-handed**: several *leading models at comparable price &
latency* run side-by-side from day one (e.g. Claude Haiku, a GPT-class mini, a
Gemini-class flash, and a strong open model — all reachable through the one
OpenRouter key). When two models cost about the same, there's no reason to assume
the incumbent wins — we let **your** data (weighted by CPA authority, §1a) pick the
winner on *your* transaction distribution. The scorecard is the referee; the
default falls out of evidence, and it can change as models/prices move.

---

## 4. The admin view — "how well are we doing" (the deliverable you asked for)

A new **Categorization** section in `apps/admin` `Quality.tsx`. Everything below is
computable from `ai_decisions` ⨝ the approved account.

### 4a. Headline scorecard (top of page)
- **Accuracy (last 30d):** % of categorizations where the *primary* model's pick
  was accepted by the human without change. The single number that says "is Penny
  good." Trendline + sparkline.
- **Override rate:** % where the human picked a *different* account than proposed.
- **Cost / 1,000 categorizations** and **$ per correct categorization** (the real
  efficiency number — cheap-but-wrong is expensive).
- **Auto-confidence coverage:** % of txns where the panel *agreed* (candidate for
  one-tap / future auto-approve) vs. needed a human.

### 4b. Model leaderboard (the core table)
One row per candidate model (all run through OpenRouter), over a chosen window:

| Model | Accuracy (vs human) | Agreement w/ primary | Cost / 1k | **$ / correct** | p50 latency | Sample n | Verdict |
|---|---|---|---|---|---|---|---|
| anthropic/claude-haiku-4.5 | 92% | — (primary) | $X | $Y | 0.8s | 4,210 | **live** |
| openai/gpt-4.1-mini | 90% | 88% | $0.4X | $0.5Y | 0.6s | 4,210 | candidate |
| google/gemini-flash | 89% | 86% | $0.2X | $0.3Y | 0.5s | 4,210 | **cheaper, ~as good** |
| meta-llama/llama-3.x | 81% | 79% | $0.05X | $0.4Y | 0.7s | 4,210 | below bar |

The point of the table: **find the model on the accuracy-vs-cost frontier** — the
cheapest one whose accuracy is within tolerance of the best. Highlight it.

### 4c. Where Penny struggles (quality, not cost)
- **Top confusion pairs:** "proposed *Software* → human chose *Subscriptions*" (×N).
  This drives prompt/account-naming fixes and tells you where to escalate.
- **Low-confidence / high-disagreement queue:** transactions where the panel split
  — the human-review worklist, ranked by dollar amount.
- **Per-category accuracy:** which account types Penny nails vs. fumbles.
- **By industry/segment** (later): accuracy can differ for a SaaS vs. a café.

### 4d. Cost ledger
- Spend by model over time; projected monthly spend at current volume; the
  marginal cost of running the shadow panel (and the sampling rate that caps it).

---

## 5. Selection algorithm — "best quality at lowest cost"

This is a **constrained optimization**, not "pick the highest accuracy":

1. **Define the bar.** Per use-case (and later per segment), set a minimum accuracy
   (e.g. ≥ best-observed − 1.5pp) and a max p95 latency.
2. **Pareto frontier.** Among models clearing the bar, pick the **cheapest**
   (lowest `$ / correct`). That's the winner.
3. **Explore safely (bandit).** Keep routing a small % (e.g. 5–10%) to challenger
   models so a newly-cheap/better model is discovered, not frozen out. Reuse the
   existing `bandit` infra.
4. **Promote via config, not code.** The winner is written to
   `ai_runtime_inference_config.routing[penny_categorize]`. Live traffic shifts
   with no deploy. Fully reversible.
5. **Re-evaluate continuously.** Models and prices change weekly; the frontier is
   recomputed on a schedule. Drift in accuracy auto-alerts.

**Guardrail:** selection only ever changes *which model proposes*. It **never**
changes the rule that a human (or, much later, an explicitly-enabled auto-approve)
accepts the account, and never relaxes server-side grounding.

---

## 6. Cost strategy — how this is *cheaper*, not N× more expensive

Running N models on every transaction forever would be N× the spend. We don't.

- **Rules first, always.** A learned-rule match costs **$0** (no model at all) and
  already handles repeat vendors. The panel only runs on genuinely new descriptions.
- **Sample the panel.** Full N-model panel on (a) a rolling **10–20% sample**, (b)
  **all disagreements**, (c) **high-dollar** transactions. Everyday traffic runs the
  single chosen cheap model.
- **Route the 95% to the winner.** Once the frontier names the cheapest-good model,
  that's what serves live — often a small/cheap model that's *more than enough* for
  "Starbucks → Meals." Big-model money is spent only where it changes the answer.
- **The panel pays for itself** by replacing a more expensive default with a proven
  cheaper one and by reducing human-override time.

Net: the dashboard should show **cost going down** while accuracy holds or rises.

---

## 7. Data model (sketch — additive)

- **Reuse `ai_decisions`** for every model run (primary + each panel model): it
  already has `tenant_id`, `model`, `cost_usd`, `output_json` (the proposed
  account), `ref` (entry id), latency, `evals`. Add a tag (e.g.
  `use_case='penny_categorize'`, `role='primary'|'panel'`).
- **New: `categorization_outcomes`** (small, derived): `(entry_id, org_id,
  proposed_by_model jsonb {model→account_id}, approved_account_id, approved_by,
  approver_role ('cpa'|'owner'|'member'), label_weight numeric, supersedes_outcome_id,
  approved_at, primary_correct bool, panel_agreement numeric)`. Written by the
  labeler job when `recategorize_entry`/`approve` records a human decision —
  `approver_role` + `label_weight` implement §1a, and `supersedes_outcome_id` links
  a CPA override back to the user label it overrides. This is what the scorecard
  reads — it keeps the dashboard fast and keeps `ai_decisions` as the source of truth.
- **Selection state** lives in the existing `ai_runtime_inference_config` /
  experiments tables.

Privacy: transaction memos are customer data. `ai_decisions` already has retention
(`retain_until`, de-identification, soft-delete erasure — D19/D24). The panel must
honor the same; no new raw-data store beyond the derived (account-id-only)
`categorization_outcomes`, which carries no free text.

---

## 8. Rollout phases

- **Phase A — Shadow + scorecard (safe, data-gathering).** Add the async panel
  (OpenRouter, sampled) + the labeler job + the admin Categorization scorecard.
  **Zero user-visible change.** After ~2 weeks you can *see* each model's real
  accuracy and cost. This is where the "how are we doing" view goes live.
- **Phase B — Agreement → confidence & escalation.** Surface "3 models agree" as
  higher confidence; route high-dollar disagreements to a stronger model or the
  human-review queue. Improves quality where it matters.
- **Phase C — Automated cost-aware selection.** Turn on the frontier policy +
  bandit exploration writing to `routing`. Admin can pin/override. Continuous
  re-evaluation + drift alerts.
- **Phase D (optional, gated) — assisted auto-approve.** For categories where a
  model has sustained ≥ very-high accuracy *and* panel unanimity, offer (opt-in)
  one-tap-bulk or auto-approve with easy undo. Only after the data earns it.
- **Phase E (long-horizon) — train our own model and switch to it.** Every weighted
  label (description → correct account, CPA-authoritative) is exactly the training
  data a small, cheap, *FounderFirst-specific* categorization model needs. The
  `ai_decisions` retention path already plans for this ("archived de-identified to
  train our own models", D19/D24). Once volume is sufficient, fine-tune (or train)
  a model on **our** distribution; if the scorecard shows it beats the general
  models on accuracy-per-$, the existing routing config switches live traffic to it
  — same mechanism, no re-architecture. This is the compounding moat: the more we
  categorize, the better and cheaper our own model gets, and the panel/scorecard is
  the objective gate that decides when to flip the switch. (Privacy: train only on
  de-identified, account-id-level labels per the retention policy; never raw memos
  beyond their retention window. Flag for legal before any training run.)

---

## 9. Risks & open questions

- **Label bias:** a human who just rubber-stamps Penny's pick inflates "accuracy."
  Mitigate by also tracking *override* events and *later* re-categorizations of the
  same entry (a correction after the fact = the first label was wrong).
- **Cold start:** new orgs have no rules and little history. The panel + a sensible
  default model cover this; accuracy reporting needs a minimum-sample gate.
- **Per-segment vs. global selection:** start global per use-case; add
  industry/segment routing once volume supports it.
- **Latency budget for escalation (Phase B):** must stay async or be a clearly
  separate "double-checking…" state, never blocking the one-tap approve.
- **Which candidate models?** Decide the OpenRouter roster (e.g. Haiku, a GPT-mini,
  a Gemini-flash, a strong open model) — cheap, fast, JSON-reliable, grounding-
  obedient. The scorecard then tells us which to keep.

## 10. Success criteria

- Admin can answer "how good is categorization, by model, at what cost?" on one
  page, updated continuously.
- We can name — with data — the **cheapest model that meets the accuracy bar**, and
  switch to it without a deploy.
- Measured **accuracy holds or rises while cost/correct falls** quarter over quarter.
- Every safeguard from the stress-test still holds: server-authoritative grounding,
  human-in-the-loop approval, tenant isolation, no model can introduce an account.

---

*Builds on `docs/plans/ai-quality-cost-layer-plan.html`. No code in this doc —
review, then we cut Phase A.*
