# Penny — Product Spec for Solopreneurs
**Folder index + build tracker · v1.1 · 21 April 2026**

*v1.1 adds wireframing specs (17 mobile, 18 web) making this folder fully self-sufficient for low-fi wireframing without requiring any other doc.*

This folder is the share-ready product spec for Penny's MVP segment: US solopreneurs (freelancers, consultants, S-Corp-elected solopreneurs).

Each file covers one focused area of the product so work can proceed independently and reviewers can jump to what they care about. This README serves two purposes:

1. **Index** — what is in each file
2. **Build tracker** — what is locked, what is in progress, what is blocked, what is open

---

## Who this folder is for

Three audiences read it at the same time:

- **Technical advisor / engineer** — wants scope and architectural commitments
- **Domain expert / CPA** — wants accounting correctness stance
- **Early user / beta candidate (Alex)** — wants to know what it feels like and what it will not do

Each file is written to work for all three. Deep engineering detail lives in companion docs, linked from each file.

---

## File Index

| # | File | What it covers |
|---|---|---|
| 01 | [01-overview.md](01-overview.md) | One-paragraph product, the problem, Alex in one page |
| 02 | [02-principles-and-voice.md](02-principles-and-voice.md) | Governing philosophy, 12 core principles, Penny's voice |
| 03 | [03-onboarding.md](03-onboarding.md) | First message, entity diagnostic, historical data import |
| 04 | [04-data-input.md](04-data-input.md) | All input sources — bank, Stripe, peer payments, email, receipts, cash, offline |
| 05 | [05-categorization.md](05-categorization.md) | Approval card, taxonomy, confidence, the expense/income asymmetry |
| 06 | [06-learning-and-memory.md](06-learning-and-memory.md) | How Penny learns, adaptation floor, federated learning |
| 07 | [07-notifications-and-backlog.md](07-notifications-and-backlog.md) | Proactive triggers, shame-free re-entry, weekly compliance batch, audit-readiness |
| 08 | [08-review-and-reporting.md](08-review-and-reporting.md) | My Books, P&L, cash runway, search, financial Q&A |
| 09 | [09-invoicing.md](09-invoicing.md) | Invoice creation, reminders, recurring, payment plans, customisation |
| 10 | [10-tax-and-cpa.md](10-tax-and-cpa.md) | Tax guidance, export package, CPA collaboration, quarterly tax, 1099, sales tax |
| 11 | [11-entity-type-and-s-corp.md](11-entity-type-and-s-corp.md) | Full S-Corp support, payroll, owner's draw, mid-year election |
| 12 | [12-platform.md](12-platform.md) | Mobile vs. web, landing surface, offline capture, device security, multi-currency, accounting basis |
| 13 | [13-hard-rules.md](13-hard-rules.md) | The 7 never-dos |
| 14 | [14-architecture-security-summary.md](14-architecture-security-summary.md) | Stack, architecture, security summary + pointers |
| 15 | [15-launch-scope.md](15-launch-scope.md) | In-scope / out-of-scope at launch |
| 16 | [16-success-metrics.md](16-success-metrics.md) | North star, accuracy metrics, growth model |
| 17 | [17-mobile-screens-and-flows.md](17-mobile-screens-and-flows.md) | Every mobile screen, state, and flow — self-sufficient for wireframing |
| 18 | [18-web-screens-and-flows.md](18-web-screens-and-flows.md) | Every web screen, state, and flow — self-sufficient for wireframing |
| — | [BUILD-TRACKER.md](BUILD-TRACKER.md) | What is done / in progress / blocked / open |

---

## Companion docs (referenced, not duplicated)

- `../spec-brainstorm-decisions.md` v2.2 — 86-decision source of truth
- `../persona-freelancer.md` — Alex persona, long form
- `../tone-guide.md` — Penny's voice, long form
- `../app-spec.md` v1.2 — every screen and flow
- `../../architecture/system-architecture.md` v4 — microservices, data model
- `../../engineering/implementation-strategy.md` v2 — tech stack + 38 engineering decisions
- `../../ai-evals/` — 6 eval suites, all must pass before any model ships
- `../../research/solo-freelancer/irs-tax-research.md` — 7 open IRS questions blocking final taxonomy

---

## Quick status

- **Product decisions locked:** 86 (spec-brainstorm-decisions v2.2)
- **Engineering decisions locked:** 38 (implementation-strategy v2)
- **Open product questions:** 8 (7 IRS research + Q-A1 adaptation-floor list)
- **Launch-blocking gaps:** IRS research, AI evals 03/04/05, S-Corp eval extensions, General Counsel reviews

Full tracker: [BUILD-TRACKER.md](BUILD-TRACKER.md).

---

*v1.1 · 21 April 2026*
