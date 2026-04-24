# How Penny Earns Trust
### Our evaluation playbook — the source of truth for every AI eval in the product

**Owner:** Nik · **Last updated:** 2026-04-10 · **Status:** Living document, reviewed every release and refreshed every quarter

---

## Why this document exists

Penny is a bookkeeper Alex trusts. That trust is the whole product — not the AI, not the UI, not the automation. If Alex doesn't trust Penny with her money, nothing else matters. And trust is earned one correct, calm, plain-English answer at a time.

This document is how we make sure every one of those answers is worth trusting. It defines how we evaluate every AI capability inside Penny before a single user sees it. Every specific eval suite in this folder (`01-transaction-intelligence.md`, `02-conversational-qa.md`, and the rest) has to follow the rules laid out here. If a new capability doesn't fit the framework, the framework changes — not the eval.

One companion document matters as much as this one: `product/tone-guide.md`. That is the source of truth for Penny's voice. This document is the source of truth for whether Penny is *right*. They have to agree. A correct answer in the wrong voice is still a failing answer.

> **North star:** A small business owner should feel that their finances are finally under control, and trust this product enough to tell a friend about it. Every eval in this repo exists to protect that feeling.

---

## 1. Principles

These are the rules we don't bend. Each one exists to protect the trust Alex puts in Penny.

1. **Evals are the product spec.** In an AI-first product, the hardest question is "what does correct actually mean?" We answer that question *before* we build the feature, not after.
2. **Wrong is worse than slow.** A confidently wrong answer can trigger an IRS audit, a tax penalty, or a lost deduction. Latency is a bug; silent wrongness is a crisis.
3. **Calibrated uncertainty beats raw accuracy.** A system that is 80% correct and asks about the 20% is more trustworthy than one that is 92% correct and silently wrong on 8%. We measure "knows when to ask."
4. **Mobile-first evals.** Every user-facing eval is scored under mobile constraints: small screen, one thumb, cellular latency, possibly voice input, possibly a distracted user.
5. **Sounds like Penny, or it fails.** A correct answer in robotic, legalese, or bank-alert voice is a failing answer. Every user-facing output we evaluate must match `product/tone-guide.md` — warm, plain-English, one idea per message, calm under pressure. A "correct but robotic" pass is not a pass. See §3 for how this is measured.
6. **CPA Agent as primary reviewer, not a human CPA.** We cannot afford a retained human CPA pre-revenue. Instead, we build a *CPA Agent* — a grounded, multi-model, rule-scaffolded AI system whose every judgment traces to a cited IRS authority (§6.5). Where the CPA Agent is uncertain, the system defaults to the most tax-conservative treatment and the founder reviews. A small, one-time real-CPA spot audit is the only form of human-CPA cost we take on, and only before each stage gate.
7. **Conservative-default bias in every judgment.** When two treatments are plausible, always pick the one with zero audit risk — even if it costs Alex a small deduction. Missed deductions are recoverable; IRS penalties and audits are not. This applies to the CPA Agent, to every product surface, and to every eval rubric.
8. **Every eval links to a real user harm.** If we can't name the concrete harm a failing eval would cause (penalty, audit, lost trust, lost time, lost money), the eval isn't real and we delete it.
9. **Evals rot.** Tax law, form numbers, bank feed formats, and merchant naming all change. Every eval has an expiry date and a refresh owner.
10. **Reproducible or it didn't happen.** Every eval run must be re-runnable with a pinned model version, pinned dataset version, pinned prompt version, and a deterministic seed wherever possible.

---

## 2. The Eval Pyramid

We think about evals in three stacked layers. Specific eval suites must identify which layer each test case belongs to.

### Layer 1 — Capability evals (the bottom)
*Can the AI do a single atomic task?*

Narrow, single-shot, large labeled datasets (target: 500+ examples per capability before self-serve). Examples: extract total from a receipt image, categorize a transaction string, identify a vendor, detect whether a charge is a transfer. These are the easiest to automate and the easiest to overweight. Passing Layer 1 is necessary but never sufficient.

### Layer 2 — Workflow evals (the middle)
*Can the AI chain capabilities into a real user job?*

Multi-step traces with ground truth at each step AND at the final output. Examples: "import Chase feed → categorize 87 transactions → flag 3 that need input → produce a correct P&L that a CPA would sign off on." This is where systems break even when Layer 1 passes. Target: cover every job-to-be-done in the product.

### Layer 3 — Outcome evals (the top)
*Does the user trust it, keep using it, and tell a friend?*

Fuzzier, more important, cannot be fully automated. Examples: time-to-first-"aha" moment, confidence calibration felt by user, recoverability when wrong, screenshot/share rate of weekly summaries, unprompted NPS-style signals from concierge sessions. These are the evals that decide whether the company survives.

**Rule:** Every feature must have evals at all three layers before it ships to self-serve users. Pre-concierge, Layer 1 plus founder-reviewed Layer 2 traces (with CPA Agent as the automated reviewer) is acceptable.

---

## 3. Scoring Dimensions

Every eval case is scored on five dimensions. Never drop any of them. An eval that passes on four and fails on the fifth is a failing eval.

| Dimension | Question | Measured by |
|---|---|---|
| **Correctness** | Did it produce the right answer per US GAAP / IRS rules? | Exact match / numerical tolerance / CPA Agent judgment / real-CPA spot-audit sample |
| **Safety** | Could being wrong cause a concrete user harm (penalty, audit, data loss, privacy leak)? | Risk-tier-weighted failure rate (see §4) |
| **Voice** | Does it sound like Penny? Plain English, one idea per message, warm, calm, no jargon, no bank-alert phrasing? | Tone-guide rubric (`product/tone-guide.md`), LLM-as-judge against that rubric, founder spot-check on 10% |
| **Experience** | Was the path to the answer simple, fast, and mobile-friendly? | Latency, tap-count, readability, explanation clarity, thumb reach |
| **Cost** | What did it cost per successful task? | $/task, tokens/task, p95 latency |

Two failure modes that sound subtle but must block a release: "correct but unsafe" (right category but no warning about a $2,500+ depreciation trigger) and "correct but off-voice" (accurate answer that reads like a bank notification). Both fail the eval even if correctness alone passes.

---

## 4. Risk Tiers

Not all errors are equal. Every eval case is tagged with a risk tier. Tier dictates thresholds, escalation, and blast radius.

**T0 — Catastrophic.** User cannot recover without a CPA or the IRS. Examples: mis-reporting income, missing 1099 filing, treating sales tax collected as revenue, ignoring a Section 179 depreciation trigger, losing a user's bank credentials. **Zero tolerance. Any T0 failure blocks release.**

**T1 — High.** User experiences financial harm that is recoverable but painful. Examples: missed deduction over $500, mis-categorized owner draw as business expense, double-counted transaction, wrong tax year cutoff. **Failure rate target: < 0.1% on gold set. Any failure triggers immediate root-cause.**

**T2 — Medium.** User experiences annoyance, minor rework, or loss of trust. Examples: wrong sub-category that still rolls up correctly, typo in vendor name, a weekly summary that reads awkwardly. **Failure rate target: < 2%.**

**T3 — Low.** Cosmetic. No financial or trust impact. **Failure rate target: < 5%, and we just track trend.**

Every test case in every eval suite must carry an explicit tier. Untagged cases are invalid.

---

## 5. Eval Methods (how we actually measure)

We use six methods, in this order of preference:

1. **Deterministic automated checks.** Exact match, regex, numerical tolerance, schema validation. Fastest, cheapest, most reproducible. Use wherever possible.
2. **LLM-as-judge with a grading rubric.** For open-ended outputs (explanations, summaries, categorizations with valid alternatives). Rubric must be written first, frozen, and spot-checked by a human on 10% of cases. Never use an LLM to judge its own output (cross-model judging required).
3. **Human review (team).** For UX, tone, and mobile experience. Structured rubric, at least two reviewers per case, inter-rater agreement tracked.
4. **CPA Agent review.** The gold standard available to us pre-revenue. A grounded, multi-model, rule-scaffolded agent (§6.5) whose every output cites IRS authority and carries a calibrated confidence score. Required for all T0 cases and a random 10% sample of T1 cases. Low-confidence outputs must escalate to the founder. The CPA Agent is itself an AI capability with its own eval suite (`06-cpa-agent.md`) — it is evaluated before it is trusted.
5. **Real-CPA spot audit.** Rare, one-time, pre-stage-gate only. ~50 sampled cases from the CPA Agent's authority log, reviewed by a licensed US CPA, flat fee or friendly-CPA barter. This is the only human-CPA touchpoint pre-revenue and its sole purpose is to validate the CPA Agent itself.
6. **Red-team / adversarial.** Separate track. We assume a subset of users will actively try to mis-categorize (e.g., "client dinners" that are actually vacations). Red-team evals test refusal and pushback behavior.

---

## 6. Ground Truth Strategy

Ground truth is the foundation. Bad ground truth = evals that lie.

**Sources, ranked by authority:**
1. IRS publications, form instructions, Internal Revenue Code sections, and official state rules — *gold* (the only true authority)
2. Real-CPA spot-audited samples from the CPA Agent's log — *gold-adjacent*, the highest-trust dataset we can produce pre-revenue
3. CPA Agent judgments that cite gold authority, pass the Proposer–Auditor check, and cross-model consensus — *silver*
4. Single-pass CPA Agent judgments without consensus or without a strong authority citation — *bronze, directional only*
5. Founder-labeled data (non-CPA) — *bronze, directional only*
6. LLM-generated synthetic data without IRS grounding — *tin, augmentation only, never primary*

**Rules:**
- Every dataset has a version number, a creation date, an expiry date, and a named owner.
- Every case has provenance metadata: where it came from, who labeled it, when, what authority.
- Datasets are split: train / dev / test / holdout. The holdout is never touched until a release candidate. Touching the holdout during iteration is a process violation.
- Personal data in real SMB books is anonymized before it enters the eval repo. No exceptions.

---

## 6.5 The CPA Agent

The CPA Agent is our substitute for a retained human CPA. It is an AI system designed to produce judgments trustworthy enough to serve as *both* the first line of review *and* a ground-truth source for lower-authority evals. It is also, itself, an AI capability — which means it has its own eval suite (`06-cpa-agent.md`) and its own failure modes.

The CPA Agent is **not** "ask a frontier model about taxes." That approach is untrustworthy and will eventually harm a real user. The CPA Agent is a carefully constrained system built around seven design constraints. Violating any one of them breaks the chain of trust.

### Design constraints

**1. Grounded in authority, always.**
Every judgment the agent produces must cite a specific IRS publication, form instruction, Internal Revenue Code section, or state rule. If no authority can be cited, the agent *must not* emit a confident answer — it must escalate. We maintain an internal *authority library*: the current year's IRS publications (Pub 334, Pub 535, Pub 463, Pub 583, Pub 946, Schedule C instructions, 1099-NEC/MISC/K instructions), Section 179 and bonus depreciation thresholds, 1099 reporting thresholds, and state sales-tax rules for every state in which our users operate. The library is versioned, timestamped, and refreshed every January (post-IRS updates) and every April (post-filing learnings).

**2. Rule-first, LLM-second.**
A large share of bookkeeping is deterministic. Transfers between a user's own accounts are never expenses. Sales tax collected is a liability, not revenue. The 1099-NEC threshold is $600. Section 179 is an option on purchases above a threshold. Owner draws are equity movements. These rules are encoded as explicit Python/TypeScript tables or guardrails that run *before* any LLM call. The LLM is only invoked for judgment cases that the deterministic rules do not resolve. This reduces cost, latency, and hallucination risk simultaneously.

**3. Proposer–Auditor pattern.**
Every non-trivial judgment passes through two agents: a *Proposer* that produces the answer and its authority citation, and an *Auditor* running on a different underlying model whose job is to critique the proposal, verify the cited authority actually says what the Proposer claims, and look for missed risks (e.g., "you categorized this as Meals but did not check whether it should trigger a 50% deduction limit"). A judgment only passes if both agree. Disagreement escalates to the founder and is logged as a training signal.

**4. Multi-model consensus on high-risk cases.**
For T0 and T1 risk tiers, the Proposer is run against 2–3 top frontier models and consensus is required. Model disagreement is itself a strong signal of uncertainty, is surfaced in the user-facing explanation, and is never silently resolved.

**5. Calibrated confidence and mandatory abstention.**
Every output carries an explicit confidence score and a hard abstention rule: below a per-tier threshold (initially 0.90 for T0, 0.85 for T1, 0.75 for T2), the agent *must* escalate rather than answer. Calibration itself is measured — is the agent's stated 85% actually 85% correct on held-out data? — and thresholds are adjusted from evidence, not from vibes. Calibration is the single most important eval in the meta-suite.

**6. Conservative-default bias.**
When two treatments are plausible and the authority library does not clearly prefer one, the CPA Agent always picks the more IRS-conservative treatment — the one that does not create audit risk. A user might miss a small legitimate deduction; they will never be nudged toward a penalty. This is the most important design choice in the whole system. It is explicit in the Proposer's system prompt, in the Auditor's grading rubric, and in the meta-eval pass criteria.

**7. Full authority trail per decision.**
Every decision the agent ever makes is logged with its inputs, its cited authority (publication + section + retrieved passage), its confidence score, the model versions used, the Proposer and Auditor outputs, and the final treatment. This log is the substrate for the meta-eval suite, for drift detection, and for any future real-CPA spot audit. If we cannot reconstruct *why* the agent said what it said, the agent has failed and the decision does not count as ground truth.

### The escape valve: the founder

The founder is not a CPA, but the founder is the only human in the loop. The CPA Agent escalates to the founder whenever confidence is below the tier threshold, whenever Proposer and Auditor disagree, whenever no authority can be cited, whenever a new edge case has no precedent in the authority library, or whenever the case is tagged T0. During the concierge stage, the founder *also* does blind spot-checks on a random 10% of the agent's "confident pass" decisions, specifically to sanity-check that stated confidence is actually calibrated to reality.

The founder's job when escalated is not to be a CPA. It is to: read the cited authority, apply the conservative-default rule, and if still unsure, defer the treatment and ask the user to provide more information rather than guess.

### The meta-eval suite (`06-cpa-agent.md`)

Because the CPA Agent is itself an AI capability, it has its own eval suite. That suite measures:

- **Authority-citation correctness** — did the cited publication actually contain the claim? (LLM-as-judge against the retrieved passage, spot-checked by founder.)
- **Calibration** — does stated confidence match actual accuracy at each decile?
- **Conservative-bias compliance** — when two treatments were plausible, did the agent pick the safer one? Measured on a hand-curated "plausible-pair" dataset.
- **Escalation behavior** — did the agent escalate when it should have? False-confidence is the worst failure mode in this eval.
- **Proposer–Auditor agreement rate** and what happens on disagreement (must never silently default to Proposer).
- **Temporal drift** — does last year's tax rule still resolve correctly under this year's authority library? Forces the January/April refresh.
- **Adversarial robustness** — does the agent hold its position when the user pushes it toward an aggressive treatment?

This meta-suite must itself pass its stage gate before the CPA Agent is trusted to act as a ground-truth source for any other eval. In other words: you cannot bootstrap trust in the CPA Agent from the CPA Agent. The meta-suite uses IRS publications directly as gold, plus the real-CPA spot-audit sample.

### The real-CPA spot audit (the floor, not the norm)

Pre-revenue, we do not retain a CPA. But we do budget, as the only human-CPA expense, a one-time spot audit before each stage gate: roughly 50 cases sampled from the authority log (stratified across risk tiers and categories), reviewed by a licensed US CPA for a flat fee (target $500–1,000) or via a friendly-CPA barter. The spot audit is the only thing that tells us whether the CPA Agent is actually trustworthy enough to be a ground-truth source. Skipping it means flying blind.

If the founder cannot afford even this: the rule is simple — *do not advance past Stage 1 concierge until the first revenue dollar lands and the spot audit happens*. Shipping to self-serve without ever having a real CPA look at a single decision is not acceptable, regardless of how strong the internal evals look. The CPA Agent can hallucinate authority, and no internal eval will reliably catch that.

### What the CPA Agent is NOT

The CPA Agent does not give tax advice to Alex. It is an internal judgment layer used by the product and by the eval system. Every user-facing surface that reflects a CPA Agent decision must say so in Penny's voice — not in legalese. The tone guide rules apply.

Penny-voice version (the only acceptable surface language):
> "I've double-checked this against the current IRS rules 😊 Your CPA knows your full picture though, so loop them in before filing."

What we never ship:
> ✗ "Tax treatment is AI-reviewed against current IRS rules. Please consult a licensed CPA for your specific situation before filing."

That second version is correct and useless. It reads like a bank disclaimer and it tells Alex "you are alone with this." Penny is never alone with Alex. Every eval that scores this kind of language is a failing eval, no matter how accurate the underlying judgment is.

---

## 7. Bookkeeping-Specific Categories (the landmines)

Every specific eval suite must explicitly cover the following categories, because each is a known landmine in SMB books. If a category is not relevant to a given suite, that must be stated explicitly.

- **Transfers between own accounts** — the single most common AI bookkeeping error. Not income, not expense.
- **Personal vs. business on shared cards** — the #1 sole-prop audit trigger.
- **Owner draws and contributions** — equity, not P&L. ("Owner draws" = money a sole prop takes out for personal use; IRS does not treat this as an expense.)
- **Loan payments** — split into principal (balance sheet) and interest (expense).
- **Sales tax collected** — a liability, not revenue. State audit risk if wrong.
- **1099 contractor thresholds** — $600 rule, plus evolving 1099-K rules. Must refresh yearly.
- **Refunds, chargebacks, voids** — must reverse to the original category.
- **Mileage and home office** — two of the most audited deductions.
- **Depreciation triggers** — purchases over ~$2,500 (Section 179 territory). Must prompt user.
- **Foreign transactions & FX** — correct conversion, correct date.
- **Duplicate detection** — same coffee booked on card + bank + Venmo.
- **Year-end cutoff** — accrual vs. cash timing. (*Accrual* = book the sale when invoiced. *Cash* = book it when paid. Wrong choice shifts income into the wrong tax year.)
- **Payroll vs. contractor classification** — W-2 vs. 1099, federal and state rules.

---

## 8. The Eight Hidden Evals (easy to miss, we don't skip any)

These are the evals that are easy to forget and expensive to miss. Every capability suite either covers all eight or marks the missing ones as N/A with a written reason.

1. **Uncertainty calibration** — does the system know when to ask Alex instead of guessing?
2. **Explanation quality** — can Alex understand *why* in one glance on a phone?
3. **Voice fidelity** — does the output sound like Penny? Measured against the tone guide, not vibes.
4. **Adversarial robustness** — does the system hold its ground when Alex pushes toward a risky treatment?
5. **Temporal drift** — does last year's eval still pass against this year's tax rules?
6. **Error recovery** — how many taps does it take Alex to fix a wrong answer, and does the fix actually teach the system something?
7. **Mobile-specific** — latency on cellular, thumb reach, voice input accuracy, glanceability.
8. **Share-worthiness** — would Alex screenshot this and forward it to a friend? (The word-of-mouth proxy.)

---

## 9. Stage Gates

Evals scale with how many users are exposed. We define four stages.

### Stage 0 — Internal only
Requirements: Layer 1 on the 13 bookkeeping categories (§7), at least 100 cases per category, founder review of every output, CPA Agent meta-suite (`06-cpa-agent.md`) drafted and running in shadow mode. Real-CPA audit not yet required.

### Stage 1 — Concierge (first 10 hand-held users)
Requirements: Everything in Stage 0, plus Layer 2 workflow evals on every user-facing flow, plus CPA Agent live on every T0 and T1 case with full authority trail, plus founder sign-off on every low-confidence or escalated decision before any output reaches a user, plus founder blind spot-check on 10% of confident-pass decisions. **The first real-CPA spot audit (≥50 cases) must be completed and green before advancing out of Stage 1.** T0 failure rate: 0. T1 failure rate: < 1%.

### Stage 2 — Closed beta (10–100 users, still high-touch)
Requirements: Everything in Stage 1, plus Layer 3 outcome evals (share rate, recovery, NPS), plus automated red-team suite, plus 500+ cases per capability, plus a frozen holdout set, plus CPA Agent calibration measured within ±5% of actual accuracy per decile, plus a second real-CPA spot audit completed and green on a fresh sample.

### Stage 3 — Self-serve (100+ users, no human in loop by default)
Requirements: Everything in Stage 2, plus all eight hidden evals (§8), plus full CPA Agent meta-suite passing its own stage gate, plus production monitoring (live accuracy tracking, confidence-calibration drift alarms, voice-fidelity drift alarms, cost/task dashboards, authority-library freshness alarms), plus an automated escalation-to-founder path for any low-confidence or Proposer–Auditor disagreement, plus a third real-CPA spot audit completed and green. **No user ever sees an AI decision that was not either deterministically ruled, cross-model confirmed, or founder-reviewed — and every user-facing surface is voice-checked against the tone guide before shipping.**

**Rule:** A feature cannot advance to the next stage until its eval suite clears the gate. This is the only real quality bar.

---

## 10. Eval Lifecycle

Every eval goes through five states:

1. **Drafted** — spec written, no data yet.
2. **Active** — dataset built, running against every release candidate.
3. **Passing** — meeting its threshold for the current stage.
4. **Stale** — not refreshed in > 90 days, or a referenced rule/form has changed. Cannot gate releases until refreshed.
5. **Retired** — no longer relevant (capability removed, rule changed beyond recognition). Archived, not deleted.

Every eval must be reviewed every 90 days minimum. Tax-law-sensitive evals are reviewed every January (after IRS updates) and every April (post-filing learnings).

---

## 11. Template for a Specific Eval Suite

Every file in `ai-evals/` (e.g., `01-transaction-intelligence.md`) must contain these sections, in this order:

```
# [Capability name] Eval Suite

## Purpose
One sentence: what Alex-job does this capability serve?

## User harm if this fails
Concrete, not abstract. "Alex overstates deductions and gets audited" — not "loss of trust."

## Scope (in and out)
What this suite covers and what it explicitly does not.

## Layer coverage
- Layer 1 cases: [count]
- Layer 2 cases: [count]
- Layer 3 cases: [count]

## Risk tier distribution
- T0: [count]
- T1: [count]
- T2: [count]
- T3: [count]

## Dataset
- Source(s) and provenance
- Version, created, expires
- Labeler(s), including CPA Agent and any real-CPA spot-audit samples
- Split: train/dev/test/holdout

## Metrics and thresholds (per stage)
Correctness, safety, voice, experience, cost — target per stage gate.

## Voice compliance
How this suite scores against `product/tone-guide.md`. Which tone rules apply, how "sounds like Penny" is measured on this capability, sample good/bad outputs for the rubric.

## Method
Which of the six eval methods (§5) is used for each case class.

## Known failure modes
Bookkeeping landmines (§7) covered, plus capability-specific ones.

## Hidden evals coverage
Which of the eight (§8) are covered; written justification for any N/A.

## Refresh plan
Owner, cadence, trigger events.

## Changelog
Every material change, dated.
```

A suite missing any of these sections — especially Voice compliance — can't gate a release.

---

## 12. Governance

**Single owner:** Nik, until a technical co-founder or first engineer joins. All framework changes require owner approval.

**CPA Agent:** The CPA Agent (§6.5) is P0 infrastructure. It is an AI capability with its own eval suite (`06-cpa-agent.md`) and its own refresh cadence. Nik owns its authority library, its rule tables, its Proposer and Auditor prompts, and its confidence thresholds. The CPA Agent has its own versioning and its own changelog, tracked alongside the framework.

**Real-CPA spot audits (the only human-CPA spend):** No retainer. Instead, a one-time flat-fee audit of ~50 sampled cases from the CPA Agent's log before each stage gate. Target cost $500–1,000 per audit, three audits total to reach Stage 3. If a friendly-CPA barter is available, use it. If the founder genuinely cannot afford the first audit pre-revenue, Stage 1 may proceed on CPA-Agent-only review, but **the first real-CPA audit must happen before the first dollar of revenue is recognized**. No exceptions.

**Red-team:** Initially the founder wearing a different hat, monthly. Formalized before Stage 3.

**Review cadence:**
- Every release: re-run all active evals, no stale eval may gate the release.
- Monthly: review failure clusters, decide on fixes vs. threshold changes.
- Quarterly: framework review — is anything above wrong or missing?
- Yearly (January + April): tax-law refresh pass.

---

## 13. Explicitly Out of Scope

To keep this document honest, here is what this framework *does not* yet cover. Each is a known gap to close before the relevant stage.

- **Multi-entity / multi-currency / non-US tax jurisdictions.** US-only for v1.
- **Payroll processing** (as opposed to payroll *categorization*).
- **Investment portfolio tracking** and capital gains.
- **Full audit defense workflows.**
- **Real-time fraud detection.**
- **Accessibility evals** (screen readers, color contrast) — must be added before Stage 2.
- **Regulatory audit trail / SOC 2 evidence** — must be added before Stage 3.

---

## 14. Glossary (plain English)

- **Accrual accounting** — book a sale when you invoice it, even if the money hasn't landed yet.
- **Cash accounting** — book a sale only when the money actually arrives.
- **Double-entry bookkeeping** — every transaction touches two accounts so the books always balance. The product hides this from users, but it must still be correct under the hood.
- **Chart of accounts** — the master list of buckets (categories) a business uses to organize its money.
- **Owner draw** — money a sole proprietor takes out of the business for personal use. Not an expense.
- **Section 179** — an IRS rule that lets a business fully expense certain large purchases in the year they're bought instead of depreciating them over years.
- **Schedule C** — the IRS form sole proprietors file to report business income and expenses.
- **1099 / 1099-K** — IRS forms for reporting payments to contractors and payment-processor income.
- **P&L (profit & loss)** — a summary of income minus expenses over a period.
- **Balance sheet** — a snapshot of what the business owns, owes, and is worth at a single moment.
- **Reconciliation** — the process of making sure the books match the bank.
- **LLM-as-judge** — using another AI model to grade the output of our AI on open-ended tasks. Cheaper than humans, less reliable, needs spot-checking.
- **Gold / silver / bronze / tin dataset** — an internal ranking of ground-truth authority, from CPA-reviewed real data (gold) down to LLM-generated synthetic (tin).
- **Holdout set** — a dataset we never touch during iteration, only at release time, so our numbers aren't inflated by overfitting.
- **Red team** — people (or processes) whose job is to try to break the system, including by behaving like a dishonest user.
- **Penny** — the product itself, spoken of as a character. The bookkeeper Alex trusts. See `product/tone-guide.md`.
- **Alex** — our canonical user. A small business owner, busy, capable, not an accountant, under real pressure. Every eval is ultimately about what happens to Alex.
- **Voice fidelity** — how closely an output matches the tone guide. A scoring dimension in §3 and a hidden eval in §8.

---

## 15. Changelog

- **v0.1 — 2026-04-10** — Initial framework. Source of truth for all specific eval suites under `ai-evals/`.
- **v0.2 — 2026-04-10** — Replaced human-CPA-in-the-loop with CPA Agent as primary reviewer (new §6.5). Added conservative-default bias as a top-level principle. Reworked ground-truth ranking to put IRS authority and real-CPA spot-audit samples at the top, and the CPA Agent in silver (§6). Updated eval methods to add "CPA Agent review" and "Real-CPA spot audit" as distinct methods (§5). Updated stage gates to require a real-CPA spot audit at each gate, with an explicit carve-out for pre-revenue Stage 1 (§9). Updated governance to reflect no retained CPA, only one-time spot audits (§12). Added a new required specific eval suite: `06-cpa-agent.md` (the meta-suite).
- **v0.3 — 2026-04-10** — Tone-guide pass. Renamed from `00-framework.md` to `00-how-penny-earns-trust.md` so the filename says what it's for. Rewrote the opening to lead with the Penny/Alex trust mission instead of an "Owner/Status/Purpose" block. Added a new principle (§1.5) "Sounds like Penny, or it fails." Added **Voice** as a fifth scoring dimension (§3), measured against `product/tone-guide.md`. Renamed §8 from "Seven Hidden Evals" to "Eight Hidden Evals" and added **voice fidelity** as an explicit hidden eval. Rewrote the user-facing disclaimer in §6.5 "What the CPA Agent is NOT" into Penny voice (and showed what we *don't* ship). Updated the specific-suite template (§11) to require a **Voice compliance** section. Added Penny/Alex/voice-fidelity to the glossary. Softened corporate phrasing throughout ("non-negotiable" header → principles that "we don't bend"; "user" → "Alex" where appropriate).
