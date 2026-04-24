# Penny — Solopreneur Build Tracker
**v1.1 · 21 April 2026**
*What is done · in progress · blocked · open.*

*v1.1: added wireframing specs (17 mobile, 18 web) — folder is now fully self-sufficient for low-fi wireframing.*

This is the single view of build status for the Penny MVP (solopreneur segment). Update this whenever a decision locks, a deliverable completes, or a new gap surfaces.

---

## Legend

- ✅ **Done** — decision locked or deliverable complete
- 🟡 **In progress** — actively being worked on
- 🔴 **Blocked** — cannot proceed until a prerequisite completes
- ⚪ **Open** — identified but not started
- 🧪 **Hypothesis** — locked direction, validation research pending

---

## Section 1 — Product Decisions (spec-brainstorm-decisions v2.2)

86 decisions locked. Source: `../spec-brainstorm-decisions.md` v2.2.

| Area | Status | Notes |
|---|---|---|
| Governing philosophy + 12 principles | ✅ Done | Locked in v2.2 |
| Onboarding & cold start (D1–D4, D83, D84) | ✅ Done | 6 decisions locked; D84 supersedes D70 |
| Data input (D5–D18, D69, D74, D75, D77, D81) | ✅ Done | 21 decisions locked |
| Categorisation + approval card (D19–D34, D76) | ✅ Done | 17 decisions locked; D25 reversed (hallucination-zero) |
| Learning & memory (D35–D41, D86) | ✅ Done | 8 decisions locked; D86 adaptation-floor framing |
| Notifications + backlog (D42–D46, D61–D63, D67, D68) | ✅ Done | 10 decisions locked |
| Review & reporting (D47–D51, D64–D66) | ✅ Done | 8 decisions locked |
| Invoicing (D52, D78, D79, D80) | ✅ Done | 4 decisions locked; pixel-perfect customisation |
| Tax & CPA (D53–D56) | ✅ Done | 4 decisions locked; taxonomy blocked on IRS research |
| Platform (D57, D72, D73, D81, D82) | ✅ Done | 5 decisions; D73 remains 🧪 until diary study |
| Hard rules (D58, D62, D71, plus principles 10, 12) | ✅ Done | 7 never-dos locked |
| Self-evaluation metrics + north star (D59, D60) | ✅ Done | Signal #4 is the defining one |
| Mobile screens and flows (file 17) | ✅ Done | 15 parts, onboarding → tabs → approval card variants → capture → My Books → invoicing → S-Corp → Discord support |
| Web screens and flows (file 18) | ✅ Done | 15 parts, auth → CPA view → Penny thread with bulk mode → My Books desktop → invoicing customiser → tax/export → keyboard shortcuts |

---

## Section 2 — Engineering Decisions (implementation-strategy v2)

38 decisions locked. Source: `../../engineering/implementation-strategy.md` v2 §0.5.

| Cluster | Status | Decision IDs |
|---|---|---|
| Architecture foundations (auth, event store, offline, PDF, DR, monorepo) | ✅ Done | E1–E8 |
| AI pipeline (Claude tiers, federated learning, prompt-injection, tone enforcement) | ✅ Done | E9–E13 |
| Integrations (Stripe, Plaid, payroll, email, push, webhook, Zelle) | ✅ Done | E14–E23 |
| Data / currency / accounting (multi-currency, cash+accrual, file storage, runway scope, search) | ✅ Done | E24–E29 |
| Platform & infra (OTA, analytics, webhook recovery) | ✅ Done | E30–E32 |
| Security / safety / compliance (encryption, cost guardrails, audit log, Face ID, device sec, 1099, data deletion, support access) | ✅ Done | E33–E40 |
| Support / ops / CPA (Discord channel, re-auth UX, tone enforcement) | ✅ Done | E41–E43 |

---

## Section 3 — Launch-Blocking Gaps

Nothing ships until these resolve.

| # | Item | Status | Owner | Blocks |
|---|---|---|---|---|
| 1 | **IRS tax research** (Q-C1–C4, Q-T1–T3) | 🔴 Blocked — commissioning | Nik + commissioned CPA | Full category taxonomy (`categories.v1.json`), vehicle + home office + quarterly tax + 1099 + year-boundary rules |
| 2 | **AI eval 04 — financial computation** | ⚪ Open | CTO | Wrong P&L numbers destroy trust permanently. **Highest priority.** |
| 3 | **AI eval 03 — data capture (OCR)** | ⚪ Open | CTO | Receipt / invoice accuracy |
| 4 | **AI eval 05 — anomaly detection** | ⚪ Open | CTO | D76 variable-recurring threshold tuning |
| 5 | **S-Corp eval extensions** (01, 02, 03, 04, 05) | ⚪ Open | CTO | D72 requires S-Corp test cases on every suite |
| 6 | **General Counsel reviews** | ⚪ Open | General Counsel | D74 email scope, E10 federated-learning privacy, E39 deletion copy, E40 support-access copy |
| 7 | **Architecture v4.1 extension** | ⚪ Open | CTO | Multi-user/role, pending-settled lifecycle, VendorStats, accrual projection, multi-currency schema, Discord thread projection |
| 8 | **`categories.v1.json`** (IRS taxonomy as machine-readable) | 🔴 Blocked on #1 | CTO + CPA | Intelligence + Export services |

---

## Section 4 — Open Product Questions (non-launch-blocking but to resolve)

| Q-ID | Question | Status | Owner |
|---|---|---|---|
| Q-A1 | Adaptation-floor signal list completeness (D86) | ⚪ Open | Head of Research — surface more signals via research |
| D73 🧪 | Mobile landing-surface hypothesis — validate status-view-primary | 🟡 In progress | Head of Research — 2-week diary study, 8–10 solo freelancers |

---

## Section 5 — Research Pre-Commits

Six pieces of research ranked by derisking value. None are launch-blocking but each tightens a hypothesis decision.

| # | Research | Derisks | Status |
|---|---|---|---|
| 1 | Prevalence survey (200 solo freelancers) — CPA vs. DIY, entity-type distribution | D53, D55, D56; confirms D72 sizing | ⚪ Not started |
| 2 | Diary study (8–10 Alexes, 14 days) — landing preference, emotional patterns | D2, D3, D4, D37, D42, D61–D63, D73 | 🟡 Scoping |
| 3 | S-Corp freelancer interviews (6–8) — what breaks in QBO for them | D72 scope | ⚪ Not started |
| 4 | Concept test on approval-card fatigue (4-week prototype) — retention weeks 2–4 | D7, D13, D15, D32 | ⚪ Not started |
| 5 | Competitive churn interviews (8–10) — left Keeper / FlyFin / QBSE / Wave | Overall positioning | ⚪ Not started |
| 6 | CPA interviews (5) — do they want the CPA Penny view | D56 | ⚪ Not started |

---

## Section 6 — Deliverables

Not open questions — deliverables with defined owners.

| Q-ID | Deliverable | Owner | Status |
|---|---|---|---|
| Q-R1 | Shame-layer language bank — 5-day, 14-day, 30-day re-entry openers (3–4 variants each) | Nik + Head of Design | ⚪ Not started |
| Q-N1 | Mobile landing-surface diary study | Head of Research | 🟡 Scoping |

---

## Section 7 — Partner Applications

Integrations requiring partner approval. Timelines vary.

| Partner | Purpose | Status |
|---|---|---|
| Apple Developer | iOS app, Apple Sign-In | ⚪ Not applied |
| Intuit Developer (QBO + Payroll) | Historical import + QBO Payroll | ⚪ Not applied |
| PayPal Venmo | Venmo peer-payment API (partner-gated) | ⚪ Not applied — longest pole |
| Track1099 | 1099-NEC issuance | ⚪ Not applied |
| Discord Bot | Per-user support channels | ⚪ Not applied |
| OpenExchangeRates | Multi-currency FX rates | ⚪ Not applied |
| Gusto | Payroll ingestion | ⚪ Not applied |
| OnPay | Payroll ingestion | ⚪ Not applied |

---

## Section 8 — Cleanup Items (Non-Blocking)

| Item | Source | Owner | Status |
|---|---|---|---|
| American English find-replace ("categorised" → "categorized") | tone-guide.md, app-spec.md | Nik | ⚪ Not done |
| 😊 emoji in tone guide contradicts design-system ban | comprehensive-review-apr-2026.md | Nik | ⚪ Not done |
| `data-input-categorization-spec.md` v1.0 stale — rewrite to v2.0 | post-Phase 0 queue | CPO | 🔴 Blocked on IRS research |
| `error-empty-states.md` missing | CLAUDE.md §3 | CPO | ⚪ Not started |
| `day-2-30-experience.md` missing | CLAUDE.md §3 | CPO | ⚪ Not started |
| Data-capture reference doc recommends QBO as system-of-record (outdated) | comprehensive-review | CPO | ⚪ Not rewritten |

---

## Section 9 — Non-Scope at Launch (Confirmed OUT)

Decisions explicitly out of scope. Do not re-open without CEO approval.

- Multi-member LLC and C-Corp (feature-flagged, post-launch)
- Non-US geographies
- Sales tax computation and filing (detect + flag only; exposed in CPA export)
- Money movement of any kind
- Tax filing
- Personalised tax advice
- Standing support-agent access (per-session grant only)
- Paid acquisition (word-of-mouth only growth)

---

*v1.1 · 21 April 2026. Update this file whenever status changes.*
