# FounderFirst / Penny — Product Requirements Document

> Product overview for engineers, operators, and partners. Everything here is
> grounded in the code in this repository. Capabilities that are scaffolded but not
> yet fully wired are labeled **Roadmap**, never described as live.

**Product:** FounderFirst, an operating layer for business owners. Its first
product is **Penny**, an autonomous bookkeeper that runs the back office and only
asks the owner for a decision when it genuinely needs one.

**Status:** live in early access at [founderfirst.one](https://founderfirst.one),
referral-driven waitlist. 640 commits, a pnpm monorepo across `apps/`, `packages/`,
`supabase/`, and `site-bubble/`.

---

## 1. The problem

Founders start companies to build, not to keep books. Money moves across Stripe,
the bank, and cards, and the real financial picture ends up spread across five
places. Every accounting tool on the market was built for accountants, so the owner
is still categorizing transactions, chasing invoices, and prepping for the CPA. The
work is constant, low-leverage, and easy to fall behind on, and the moment anyone
falls behind, the books quietly stop telling the truth.

Two structural realities make this hard to solve well:

1. **Bookkeeping is money-critical.** A confident wrong number is worse than a
   question. Any automation has to be grounded in the real ledger, not guessed.
2. **The owner's time is the scarce resource.** The system has to act on its own
   for the routine 95% and reserve the owner's attention for the true exceptions.

## 2. Who it is for (personas)

| Persona | Who they are | Primary job-to-be-done |
|---|---|---|
| **The owner** | Solo founder, freelancer, or small-business owner. Knows their craft, not double-entry accounting. | "Keep my books correct and my profit clear without me having to think about it." |
| **The CPA / bookkeeper** | The accountant who serves several of these businesses. | "Give me clean, categorized, receipt-attached books and a fast way to close the month." |
| **The platform operator** | Internal admin running routing, evals, cost caps, and the review queue. | "Ship AI into money-critical workflows without losing accuracy or blowing the budget." |

One source of truth, two projections: a founder app and a conversational CPA view
over the same books (`apps/app`, lens selected server-side from the verified JWT).

## 3. Jobs-to-be-done

- **JTBD-1 — "Sort my money for me."** Ingest transactions from Stripe, bank, and
  cards, categorize each one against the business's own chart of accounts, and only
  ask the owner about the ones that are genuinely ambiguous.
- **JTBD-2 — "Tell me what I'm actually making."** Real profit derived from the
  ledger, updated as money moves, not just revenue.
- **JTBD-3 — "Chase my late payers so I don't have to."** Invoicing plus polite,
  on-brand reminders.
- **JTBD-4 — "Keep me tax-ready."** Books stay clean and CPA-ready year round;
  filing obligations and depreciation tracked as data, not hardcoded.
- **JTBD-5 — "Answer my questions from the real books."** A conversational thread
  that phrases figures computed from the ledger, never invented.
- **JTBD-6 (CPA) — "Close the month fast."** Reconciliation, period close, and a
  client work queue.

## 4. What is built today (verified in code)

- **Multi-source ingest.** Connectors behind one provider interface
  (`supabase/seeds/kernel/connectors.json`): QuickBooks Online and Xero (accounting
  sync), Plaid (bank feed), and Stripe / Shopify / PayPal / Square (commerce
  payout splitting + report import). Adding a provider is one interface
  implementation plus one seed row.
- **Grounded auto-categorization.** `supabase/functions/categorize` proposes a
  category by trying a deterministic learned-rule matcher first, then falling back
  to the inference layer **constrained to the org's own ledger accounts** — the
  model cannot invent an account it was not handed. Approvals run
  `recategorize_entry` (reverse + repost + learn), so books stay append-only and
  the correction is remembered.
- **Learned rules.** `categorization_rules` are org-scoped, learned on approval,
  and can be deactivated so Penny stops applying them.
- **Exceptions-only surfacing.** Confidence tiers (`confidence_high` 0.75,
  `confidence_medium` 0.45) plus a weekly ask budget (`asks_per_week` 5,
  `auto_propose_limit`) mean the owner sees only low-confidence items, a few times
  a week, as one-tap approval cards.
- **Grounded Q&A.** `supabase/functions/penny-thread` re-routes and **re-computes
  every figure from the org's own ledger** server-side; if the model emits any
  number other than the server fact, that output is discarded. A hallucinated or
  client-forged number is structurally impossible.
- **Double-entry ledger.** Integer minor units (never floats), append-only
  `journal_entries` / `journal_lines`, balanced-entry enforcement, accounting
  periods with close, first-class bank reconciliation, and reversible import
  batches (`supabase/functions/{reconcile,ledger-*,imports,invoicing,bill-pay}`).
- **Invoicing + collections.** `invoicing`, `payouts`, and reminder flows.
- **Receipt capture.** `supabase/functions/receipts` parses a snapped or texted
  receipt (`capture_kind: photo | text`), extracts vendor / amount / date, and
  tier-matches it to a transaction (high-confidence auto-attach, low-confidence
  confirm card, no match to the unmatched queue). Assets live in a private,
  RLS-scoped storage bucket. (Voice-note capture is a demo surface, **Roadmap** for
  the product — no audio-transcription path is wired today.)
- **The AI quality & cost layer.** Every AI request passes through one
  `resolve()` (`packages/inference`): multi-model routing, per-token cost
  accounting, spend caps with fallback, and a tiered LLM-judge eval panel. See
  [EVALS.md](EVALS.md) and [TECHNICAL_NOTES.md](TECHNICAL_NOTES.md).
- **A knowledge kernel as data.** Entity types, industries, filing obligations,
  vendor priors, and connectors are seed data every app projects from
  (`scripts/seed-kernel.ts`); a regulatory watcher turns a tax-law change into one
  reviewed, effective-dated, cited seed-diff PR — never a self-merge
  (`scripts/regulatory-watcher`).

## 5. Success metrics

**North-star:** share of transactions correctly categorized without the owner
touching them (autonomous-correct rate), held against a hard accuracy floor.

| Layer | Metric | Why it matters |
|---|---|---|
| Accuracy | Categorization precision; zero-edit approval rate per tenant cohort | The trust bar; gates the autonomy ramp (GUARDRAILS) |
| Owner effort | Asks per week; time-to-approve | The product promise is "only tap me when needed" |
| Correctness | Safety/privacy gate failures (target: zero); escalation rate | A wrong money number is the worst outcome |
| Trust | CPA/customer correction rate (rolling); books that reconcile | Corrections auto-demote learned rules |
| Cost | Cost per answer; judge-cost as % of answer cost | Keeps multi-model economics viable |
| Growth | Waitlist conversion; referral months activated | Early-access loop |

Metrics are captured as data today: every AI call writes an `ai_decisions` row with
`cost_usd`, `latency_ms`, `usage`, `gate_status`, and per-eval results.

## 6. Tradeoffs and principles

- **Accuracy over autonomy.** The system starts at 100% human review and advances
  to sampling only after per-cohort thresholds are met and a human approves each
  reduction (GUARDRAILS autonomy ramp). Financial use cases cannot ramp until the
  source-correctness reconciliation gate is wired as code.
- **Grounded over generative.** Figures are computed by the server and phrased by
  the model, not produced by the model. Prompt-level grounding is enforced today;
  a judge-level SQL reconciliation gate is built and unit-tested (**Roadmap:** wire
  it to every financial call site).
- **Knowledge as data, not code.** Tax rules, deadlines, and connectors are seed
  data with CI drift guards, so a rule change is a reviewed PR, not a code sweep.
- **The model has no authority.** Penny writes proposals a human approves; it never
  silently mutates the ledger, and write-path RPCs are `SECURITY DEFINER`,
  service-role-only, RLS-gated.
- **Don't name the model.** The brand is FounderFirst; routing is "intelligent
  multi-model," not a single vendor (VOICE.md).

## 7. Roadmap — Now / Next / Later

**Now (built / in early access)**
- Multi-source ingest, grounded categorization with learned rules, one-tap
  approval cards, grounded Penny thread, double-entry ledger, reconciliation,
  invoicing, capture, and the inference quality/cost layer (routing, cost, judge
  panel — Phase 2 built).
- Owner app + CPA view over one set of books; demo live at
  `/penny/demo/` and `/penny/demo/cpa/`.

**Next**
- Wire the source-correct SQL reconciliation gate into every financial call site
  (the code + unit tests exist; call sites do not yet pass the reconciler).
- Ship the review queue and the admin model-control / cost dashboard
  (inference layer Phases 3–4).
- Advance the autonomy ramp from 100%-review to sampling on cohorts that clear the
  accuracy thresholds.

**Later**
- Retention + right-to-erasure jobs (schema exists; jobs are Phase 5–6) and
  de-identified archive for training cheaper in-house models.
- Exact-match gateway caching for non-financial, non-customer-facing use cases.
- Broader back-office surfaces beyond the books.

---

*Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [EVALS.md](EVALS.md) ·
[TECHNICAL_NOTES.md](TECHNICAL_NOTES.md) · [FDE_JOURNEY.md](FDE_JOURNEY.md)*
