# CLAUDE.md — Penny Project Reference
*For Claude: read this before any substantive work. It will save tokens and prevent re-opening settled decisions.*
*Last updated: 22 April 2026 (folder restructure — full clean. Old product files deleted, solopreneurs/ flattened into product/, wireframes/ deleted, misplaced files moved, CLAUDE.md updated to match.)*

---

## What This File Is

This is the single source of truth for working context on the Penny project. Before starting any task, scan the relevant sections here. If a decision is marked **settled**, do not re-open it. If a section says **placeholder / not decided**, that is a known gap — flag it but don't invent an answer.

**This file lives at the root of the workspace.** All file paths below are relative to this root.

---

## Folder Structure — Top Level

```
FounderFirst_Building Products/
├── CLAUDE.md                        ← You are here
├── README.md                        ← FounderFirst public readme
├── index.html                       ← GitHub Pages index
├── _config.yml                      ← GitHub Pages config
├── BookKeeping/                     ← Penny product (all active work lives here)
│   ├── STATUS.md                    ← Current project status at a glance
│   ├── penny-system-prompt.md       ← Penny AI system prompt
│   ├── product/                     ← THE canonical product spec (18 files + tracker + decision log)
│   ├── architecture/                ← System architecture, data governance
│   ├── engineering/                 ← Tech stack decisions, implementation strategy
│   ├── design/                      ← Design system (design-system.md only)
│   ├── ai-evals/                    ← 6 AI eval frameworks (must all pass before ship)
│   ├── research/                    ← Reference docs + solo-freelancer segment research
│   │   └── solo-freelancer/         ← 8 research docs on the freelancer segment
│   ├── reviews/                     ← Stress tests and consistency audits (5 files)
│   └── tools/                       ← HTML demos and dashboards
└── FounderFirst OS/                 ← Role system (8 expert roles + dashboard)
    ├── FounderFirst_OS_Role/        ← IDENTITY.md, role_*.md, README, CHANGELOG
    ├── FounderFirst_OS_Dashboard/   ← STRATEGY.md, founderfirst-os.html, founderfirst-os-lofi.html, daily-log.json
    └── website-planning/            ← FounderFirst parent website docs (brief, spec, tone)
```

---

## 0. How We Work Together

**Nik is the CEO. Claude advises. Nik decides.**

These principles apply to every interaction on this project:

1. **Ask first.** Before starting any work, ask follow-up questions to clarify scope, format, expectations, and what is out of scope. Set expectations on output before producing it. Do not assume.
2. **Best thinking, no constraints.** Recommend the best solution for a scalable, highly trusted product that users love. Do not constrain thinking by team size, resources, or execution complexity. Present the right answer, then help figure out execution.
3. **Trade-offs, not gatekeeping.** Never say "do not do X." Say "here is X, here is the trade-off, here is my recommendation and why." Present options. Nik decides.
4. **Concise.** Do exactly what is asked — no more, no less. Do not add extra sections, extra logic, or extra work that was not requested.
5. **Strong opinions, loosely held.** Push back, flag risks, give strong recommendations. But final authority is always Nik's.

---

## 0.5 FounderFirst OS — Role System

Penny is built using the FounderFirst OS — a system of 8 expert roles that provide domain-specific advice. Each role thinks independently as a world-class executive.

**Roles (in `FounderFirst OS/FounderFirst_OS_Role/`):**

| Role | File | Domain |
|---|---|---|
| Head of Research | `role_research.md` | Problem validation, customer discovery, assumption mapping, segment validation |
| CPO | `role_cpo.md` | Product scope, one job, feature prioritisation, multi-segment strategy |
| CTO | `role_cto.md` | AI product architecture, prompts, evaluation, shipping, debugging |
| Head of Design | `role_design.md` | User flows, AI interface patterns, design systems, visual identity |
| CMO | `role_cmo.md` | Positioning, messaging, first users, WOM, retention |
| CFO | `role_cfo.md` | Pricing, unit economics, runway, fundraising |
| COO | `role_coo.md` | Decisions, systems, bottlenecks, hiring |
| General Counsel | `role_legal.md` | Terms, privacy, AI liability, data handling, contracts, IP |

**How it works:**
- Each role has: principles, specific skills with frameworks, behaviour rules, HANDOFFS (what it receives from / delivers to other roles), and CRITIC mode
- Standing rules (in `IDENTITY.md`): ask before building, CEO authority, best thinking without constraints, trade-offs not gatekeeping, concise output
- Project context (in `IDENTITY_penny.md`): stage, customer, problem, locked decisions, evidence, open questions

**Automation:**
- Nightly scorer (`founderfirst-os-scorer`) runs at 9pm daily — reads session transcripts, scores against 6 levers, writes `daily-log.json`
- Dashboard (`founderfirst-os.html`) reads the log and renders Today / My Levers / Trend views

---

## 1. The Product — One Paragraph

**Penny** is an AI-first, mobile-first bookkeeper for US sole proprietors and small business owners. The core interaction is conversation — not forms, not dashboards. Penny notices money moving in the world, categorizes it intelligently, and presents it to the owner as a one-tap approval card. The owner confirms (or corrects) in seconds. The books stay clean without the owner ever needing to know what "double-entry bookkeeping" means. Growth engine: word-of-mouth only.

**Product name:** Penny (always capitalized, never "penny")
**Founder / CEO:** Nik

---

## 2. Settled Decisions — Do Not Re-Open

These have been explicitly decided. Do not suggest reversing them unless Nik explicitly asks.

| Decision | What was decided |
|---|---|
| **Ledger ownership** | Own the ledger from day one. QuickBooks, Xero, Wave are **export targets only** — never system of record. |
| **Platform** | Mobile-first (phone is primary device). Web follows for detailed review. |
| **UX model** | Conversation is the core UX. No forms. No dashboards. No complex navigation. |
| **Market** | US only. All copy, tax logic, and compliance is US/IRS-aligned. |
| **Language** | American English throughout. `categorized`, `organized`, `recognized`, `canceled`, `color` — never British spellings. |
| **MVP user segment** | Solo service provider (freelancer / consultant) — codename "Alex". |
| **Growth model** | Word-of-mouth only. No paid acquisition. No traditional sales. |
| **Onboarding philosophy** | Minimum essentials only. Earn trust before asking for more data. First approved transaction as fast as possible. |
| **AI training on user data** | Explicit opt-in. Default off. Never assumed. |
| **Undo pattern** | 5-second toast. Not a modal. |
| **App lock** | Face ID / passcode under the avatar menu → Preferences. |
| **App structure** | Three persistent tabs only: Penny · Add · My Books. Connect functionality merges into Add. Profile / Memory / Preferences live behind the avatar menu, not a tab. (Settled 23 Apr 2026 during demo v5 rebuild.) |
| **Notification labels** | "Real-time" and "Daily digest" (not "Instant" / "Batch" or British variants). |
| **Emoji rules** | Approved: 🎉 (payment received), 👋 (first hello), ✓ (text character — not emoji), 💪 (milestone). Never: 😊 👍 ✅ ⚠️. |

---

## 3. File Map — What Exists and Its Status

### Product
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/product/README.md` | Index of all product spec files with audience guide (tech advisor / CPA / beta candidate). |
| ✅ Complete | `BookKeeping/product/BUILD-TRACKER.md` | 9-section tracker: product decisions, engineering decisions, launch-blocking gaps, open questions, research pre-commits, deliverables, partner apps, cleanup items, non-scope. |
| ✅ Complete | `BookKeeping/product/spec-brainstorm-decisions.md` v2.2 | **Decision log — 86 locked product decisions.** Source of truth for all decisions. 8 open questions (7 IRS → research doc + Q-A1). |
| ✅ Complete | `BookKeeping/product/01-overview.md` through `16-success-metrics.md` | 16 focused spec files — one per product area. Each has decision-ID refs to spec-brainstorm-decisions v2.2 and engineering-ID refs to implementation-strategy v2. |
| ✅ Complete | `BookKeeping/product/17-mobile-screens-and-flows.md` | Full mobile wireframing spec — 15 parts covering all screens, flows, states, and components. Fully self-sufficient without needing other docs. |
| ✅ Complete | `BookKeeping/product/18-web-screens-and-flows.md` | Full web wireframing spec — 15 parts covering web-only surfaces (CPA share-link, bulk-approve, /tax hub, command palette). Fully self-sufficient. |
| ❌ Missing | `BookKeeping/product/error-empty-states.md` | What Alex sees when things go wrong or are empty. Needed before launch. |
| ❌ Missing | `BookKeeping/product/day-2-30-experience.md` | Post-first-approval habit formation. Critical retention doc. |
| ❌ Missing | `BookKeeping/product/persona-product-seller.md` | Segment 2 (e-commerce / retail). Not started. |
| ❌ Missing | `BookKeeping/product/persona-local-service.md` | Segment 3 (plumber, salon, trades). Not started. |

### Architecture & Engineering
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/architecture/system-architecture.md` v4 | Full system: microservices, data model, AI pipeline, security, financial event model. **v4.1 extension pending** — multi-user/role/share-link, pending-settled lifecycle, VendorStats shape, accrual projection, multi-currency schema, federated-learning data model, Discord support-thread projection. |
| 🟡 Placeholder | `BookKeeping/architecture/data-governance.md` | Privacy & compliance — 8 open questions, no answers yet. |
| ✅ Complete | `BookKeeping/engineering/implementation-strategy.md` v2 | **Primary tech-implementation reference.** Translates spec v2.2 into buildable engineering. v2 folds in 38 engineering decisions from 21 Apr Q&A (auth, event store, offline sync, PDF, DR, monorepo, Claude tiers, federated learning, payroll, multi-currency, accounting-basis toggle, 1099 filing, quarterly tax, encryption model, cost guardrails, Discord support, data deletion, and more — see §0.5 decision log). |
| ✅ Complete | `BookKeeping/reviews/spec-v2.2-tech-stress-test-apr-2026.md` | Technical stress test of v2.2 spec. 4 Critical, 6 High, 10 Medium, 5 Low, 4 Decisions Needed. All findings resolved in implementation-strategy v2. |
| 🟡 Placeholder → to populate | `BookKeeping/engineering/engineering-decisions.md` | Tech-stack reference. **Populate from implementation-strategy.md §1 and §0.5.** Phase 0 prerequisite. |

### Design
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/design/design-system.md` v2.0 | Colors, typography, components, layout rules. Unified with FounderFirst.one tokens (`--ink`, `--paper`, Inter, pill buttons, p-mark avatar). This is the only design file — wireframes folder deleted. |
| ✅ Complete | `BookKeeping/demo/DESIGN.md` | Machine-readable design system companion for the demo (Google Labs DESIGN.md format). YAML front matter with all tokens + prose rationale covering color zones, component rules, and Do's/Don'ts. Read by AI coding agents at the start of every demo build session. Zero runtime effect — documentation only. |

### AI Evals (all 5 must pass before any model ships)
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/ai-evals/00-how-penny-earns-trust.md` | Trust principles and eval philosophy. |
| ✅ Complete | `BookKeeping/ai-evals/01-transaction-intelligence.md` | Categorization, confidence scoring, vendor normalization, split transactions. |
| ✅ Complete | `BookKeeping/ai-evals/02-conversational-qa.md` | Q&A accuracy, hallucination prevention, multi-turn conversations. |
| 🟡 Placeholder | `BookKeeping/ai-evals/03-data-capture.md` | Receipt & invoice OCR — scope defined, metrics not set. |
| 🟡 Placeholder | `BookKeeping/ai-evals/04-financial-computation.md` | P&L accuracy — scope defined, metrics not set. **High priority: wrong numbers destroy trust.** |
| 🟡 Placeholder | `BookKeeping/ai-evals/05-anomaly-detection.md` | Duplicate & anomaly detection — scope defined, metrics not set. |

### Research (reference only — not product decisions)
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/research/bookkeeper-role-reference.md` | What a human bookkeeper actually does (informs AI design). |
| ⚠️ Partially outdated | `BookKeeping/research/data-capture-integration-reference.md` | Data sources & capture methods. **Ledger sections are outdated** — recommend QuickBooks as system of record, which contradicts settled architecture. Treat as historical research only. |
| ✅ Complete | `BookKeeping/research/solo-freelancer/README.md` | Index of all solo-freelancer research, including planned studies. |
| ✅ Complete | `BookKeeping/research/solo-freelancer/` | 5-doc research bundle on the freelancer segment: master-research, segment-needs-analysis, integration-sources, research-strategy, research. |
| 🟡 Research pending | `BookKeeping/research/solo-freelancer/irs-tax-research.md` | IRS & tax research required — blocks 7 product decisions (Q-C1–C4, Q-T1–T3). All open. |

### Reviews
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/reviews/comprehensive-review-apr-2026.md` | Cross-document consistency audit. 7 contradictions found. 14 strategic gaps identified. |
| ✅ Complete | `BookKeeping/reviews/spec-v2.2-tech-stress-test-apr-2026.md` | Technical stress test of spec v2.2. 4 Critical, 6 High, 10 Medium, 5 Low. All resolved in implementation-strategy v2. |
| ✅ Complete | `BookKeeping/reviews/penny-demo-v3-stress-test-apr-2026.md` | Stress test of the v3 interactive demo. |
| ✅ Complete | `BookKeeping/reviews/penny-demo-wireframe-stress-test-apr-2026.md` | Stress test of wireframe spec against design system and product decisions. |
| ✅ Complete | `BookKeeping/reviews/19-wireframe-v2-stress-test-apr-2026.md` | Wireframe v2 stress test — covers mobile + web flow completeness. |

### Tools & Demos
| Status | File | What it covers |
|---|---|---|
| ✅ Complete | `BookKeeping/demo/` | **Demo v5** — React + Vite. All 7 screens built: Onboarding, Penny thread, Approval card, Add, My Books, Avatar menu, Invoice designer. Live AI voice via Cloudflare Worker + Claude. Public GitHub-shareable. See `BookKeeping/demo/CLAUDE.md` and `BookKeeping/demo/DESIGN.md`. |
| ✅ Complete | `BookKeeping/tools/penny-demo-v4-mobile.html` | Mobile demo v4 — superseded by `BookKeeping/demo/`. Kept for reference. |
| ✅ Complete | `BookKeeping/tools/penny-demo-v4-cpa-view.html` | CPA view demo v4 — CPA share-link experience. |
| ✅ Complete | `BookKeeping/tools/bookkeeper-flows.html` | Bookkeeper role flows — visual reference for AI design. |
| ✅ Complete | `BookKeeping/tools/build-in-public.html` | Build-in-public page. |
| ✅ Complete | `BookKeeping/tools/claude-efficiency-dashboard.html` | Claude efficiency tracking dashboard. |
| ✅ Complete | `BookKeeping/tools/token-guide.html` | Token/design guide reference. |

---

## 4. App Structure — Quick Reference

Three persistent bottom tabs. (Settled 23 Apr 2026 during the demo v5 rebuild. The
earlier four-tab layout with a dedicated **Connect** tab was retired — Connect
functionality merged into **Add**; Profile / Memory / Preferences moved behind
the avatar menu.)

| Tab | Label | Purpose |
|---|---|---|
| 1 | Penny | Home — active conversation thread. Default landing. |
| 2 | Add | Capture + integrations + data actions. Bank connect, QBO/Stripe/Venmo links, export, and data-deletion all live here. |
| 3 | My Books | Financial review — P&L, invoices, expenses, CPA export. |

**Add tab** is a native tab with a label — NOT a floating action button.

**Avatar menu.** A full-screen overlay reached by tapping the ⋮ in the Penny
thread header. Contains Profile, Memory ("what Penny has learned"), and
Preferences (app lock, notifications, data, legal). It is not a tab.

**Propagation to specs.** The three-tab model supersedes the four-tab layout
in `product/17-mobile-screens-and-flows.md` and
`product/18-web-screens-and-flows.md`. Those specs will be updated to match
before the MVP build begins; until then, the demo (`BookKeeping/demo/`) is the
visual source of truth for tabs.

---

## 5. Design Rules

- Every screen must work at **375px wide** — this is the minimum phone width. No exceptions.
- Design standard: **production-grade iOS quality** — not wireframe quality.
- Penny avatar: **solid p-mark** — circle with `--ink` fill + white "P". 4 sizes: sm 28, md 40, lg 56, xl 96. Never dashed/lo-fi.
- **American English** throughout — no British spellings anywhere.
- Max **3 items visible at once** on the Penny conversation screen — no clutter.
- **16px minimum spacing** between content groups.
- Full-width CTAs, aligned to content margin.
- Voice input button: **36×36px**, mic icon, Deep Ocean light background idle / Ocean fill recording.

---

## 6. Penny's Voice — Core Rules

- Speak like a calm, knowledgeable friend — not a bank, not an app, not a robot.
- Never use accounting jargon without immediately explaining it in plain English.
- When uncertain, say so honestly and ask. Never fake confidence.
- Always say what happened and why it matters, in that order.
- Keep messages short. One thought per message. No walls of text.
- Complete sentences. Never truncated. Never casual to the point of confusion.
- Full reference: `BookKeeping/product/02-principles-and-voice.md`

---

## 7. Architecture — Core Principles (Quick Reference)

- **Own the ledger from day one.** Never third-party as system of record.
- **Microservices architecture.** Each service has a single responsibility, its own data boundary.
- **Financial data is never overwritten, never hard-deleted.** Full audit trail always.
- **Accuracy over everything.** Never show data we're not confident in as fact. Show nothing and ask rather than show something wrong.
- **User data is never used for AI training without explicit opt-in.**
- Full reference: `BookKeeping/architecture/system-architecture.md`

---

## 8. Known Contradictions Between Documents (Unresolved)

These were identified in `reviews/comprehensive-review-apr-2026.md`. They have NOT all been fixed yet.

| # | Contradiction | Status |
|---|---|---|
| 1 | `data-capture-integration-reference.md` recommends QuickBooks as system of record; architecture says own the ledger | ⚠️ Partially resolved — integration reference marked as outdated but not rewritten |
| 2 | Notification labels inconsistency across remaining docs | ❌ Not confirmed resolved |
| 3–5 | Additional contradictions documented in comprehensive review | ❌ Check `reviews/comprehensive-review-apr-2026.md` |

---

## 9. What to Build Next (Priority Order)

**Phase 0 (as defined in `implementation-strategy.md` v2 §10) — nothing else can begin:**

1. **Commission IRS research** per `BookKeeping/research/solo-freelancer/irs-tax-research.md` — Option C hybrid (self-research + CPA review). Unblocks 7 product decisions (Q-C1–C4, Q-T1–T3) and Layer 2 taxonomy.
2. **Draft `categories.v1.json`** — IRS taxonomy as machine-readable artefact, CPA-reviewed. Blocks Intelligence + Export services.
3. **Rewrite 5 AI eval suites** — solopreneur-specific, v2.2-aligned, S-Corp-extended. Must include test cases for: multi-currency, accrual-basis, 1099 candidates, quarterly-tax edges, split transactions, ask-once rule proposals.
4. **Extend `architecture/system-architecture.md` to v4.1** — add multi-user/role/share-link, pending-settled lifecycle, VendorStats projection, accrual projection (E26), multi-currency schema (E25), federated-learning data model (E10), Discord support-thread projection (E41).
5. **Populate `engineering/engineering-decisions.md`** — authoritative tech-stack reference, sourced from `implementation-strategy.md` v2 §1 and §0.5.
6. **Kick off partner applications** — Apple developer, Intuit developer (QBO + Payroll), PayPal Venmo partner, Track1099, Discord bot app, OpenExchangeRates.
7. **Commission General Counsel review** — D74 email ingestion, E10 federated-learning privacy, E39 data-deletion cert copy, E40 support-access grant copy.
8. **Design federated-learning architecture doc (E10)** — anonymisation, aggregation, opt-in storage, 500-user training-cycle gate.

**After Phase 0:**

9. **`BookKeeping/ai-evals/04-financial-computation.md`** — wrong P&L numbers destroy trust permanently (highest priority within eval rewrite).
10. **`BookKeeping/ai-evals/03-data-capture.md`** and **`05-anomaly-detection.md`** — complete the eval gate. Both must add S-Corp + multi-currency + accrual test cases.
11. **`BookKeeping/product/error-empty-states.md`** — product feels unfinished without this.
12. **`BookKeeping/product/day-2-30-experience.md`** — retention lives here.
13. Resolve remaining contradictions from comprehensive review.

---

## 10. Working Guardrails

**Settled decisions are closed.** Do not re-open a settled decision (Section 2) unless Nik explicitly says REOPEN. If a recommendation conflicts with a settled decision, flag it and present the trade-off — Nik decides whether to reopen.

**Project-specific rules:**
- American English everywhere — never British spellings
- Accounting jargon must always be immediately explained in plain English
- QuickBooks and Xero are export targets only — flag the trade-off if recommending otherwise
- Do not invent persona details, financial numbers, or product decisions not documented here
- UI copy must align with the voice rules (`BookKeeping/product/02-principles-and-voice.md`)
- All designs must work at 375px minimum
- MVP persona is Alex (solo freelancer) — flag if work is expanding to other segments so Nik can confirm scope
- Always present trade-offs when Nik asks for a decision

---

## 11. Session History — What Has Been Built

A record of major work completed across sessions:

| Topic | Output |
|---|---|
| Initial product strategy & vision | Early docs (app-spec, tone-guide, persona-freelancer, user-flows-freelancer) — **superseded and deleted Apr 22**. Content consolidated into `BookKeeping/product/` spec folder. |
| System architecture design | `BookKeeping/architecture/system-architecture.md` (production-grade microservices design) |
| Design system | `BookKeeping/design/design-system.md` v2.0 |
| Wireframes (19 screens + prototype) | **Deleted Apr 22** — superseded by v4 interactive demos in `BookKeeping/tools/`. |
| AI eval framework | `BookKeeping/ai-evals/00` through `BookKeeping/ai-evals/05` (2 complete, 3 placeholder) |
| Research reference docs | `BookKeeping/research/bookkeeper-role-reference.md`, `BookKeeping/research/data-capture-integration-reference.md` |
| Freelancer segment research | `BookKeeping/research/solo-freelancer/` (8 docs including master-research, segment-needs-analysis, integration-sources, research-strategy, research, irs-tax-research, user-session-guide) |
| Cross-document review | `BookKeeping/reviews/comprehensive-review-apr-2026.md` (7 contradictions, 14 gaps) |
| App spec stress test | Applied as app-spec v1.1 and v1.2 — stress test file **deleted Apr 22** (app-spec.md deleted). |
| FounderFirst OS — role system overhaul (12 Apr 2026) | Rewrote all 8 role files: removed solo-founder constraints, added CEO authority model (roles advise, founder decides), added ask-first behaviour, concise output discipline, HANDOFFS between roles. Updated IDENTITY.md standing rules, README.md. Confirmed nightly scorer automation running. Updated CLAUDE.md and STATUS.md with OS indexing. |
| Folder restructure (19 Apr 2026) | Moved CLAUDE.md to workspace root. Moved solo-freelancer research into `BookKeeping/research/solo-freelancer/`. Consolidated loose HTML tools into `BookKeeping/tools/`. Moved supabase-setup.sql to `BookKeeping/engineering/`. Updated all file paths in CLAUDE.md and STATUS.md. |
| Research-lens stress test of product decisions (20 Apr 2026) | Walked through 59 brainstorm questions in researcher → product → technical sequence. Settled positions written up in `BookKeeping/product/spec-brainstorm-decisions.md` v2.0. Key settlements: CPA/DIY equal support, income-expense asymmetry as brand signature, shame-layer principles (no streaks, Penny owns backlog), income volatility handling (90-day trailing, cash runway), audit-readiness score replaces compliance-nag, Venmo/Zelle/CashApp as first-class input, historical data import, data-portability hard rule, full S-Corp support at launch (entity type as architectural primitive, Gusto/OnPay/QBO Payroll, owner's-draw, 1120-S export), mobile landing surface as status view. |
| IRS research separation + folder organization (20 Apr 2026) | Created `BookKeeping/research/solo-freelancer/irs-tax-research.md` with all 7 tax/IRS open questions (Q-C1–C4, Q-T1–T3) — factual research questions separated from product-opinion decisions. Created `BookKeeping/research/solo-freelancer/README.md` as index of all segment research including planned studies. Amended `spec-brainstorm-decisions.md` to point all IRS questions to the research doc. |
| Full spec-brainstorm doc lock to v2.2 (21 Apr 2026) | Walked through all remaining non-IRS clusters with CEO. Locked 13 new decisions (D74–D86): email receipt ingestion via connected inbox + OAuth (D74), active follow-up loop for unreadable receipts never a passive graveyard (D75), variable recurring expenses learn-once with anomaly flag + always-visible activity line (D76), peer-payment integration-first strategy (D77), recurring invoices capability-level (D78), payment plans proactive at invoice creation validated against FreshBooks/QuickBooks/Stripe (D79), invoice customization pixel-perfect no shortcuts (D80), offline capture (D81), device security enterprise-grade from day one incl. remote wipe/device trust/field-level encryption/MDM-compatible (D82), entity-type onboarding upfront with "not sure" diagnostic (D83), historical data import API-first with CSV schema-inference fallback supersedes D70 (D84), adaptation-floor personalization delivery not existence (D86). Extended D72 with mid-year S-Corp election conversational narration. Closed 13 open questions (Q-I1–3, Q-V1–4, Q-P1–2, Q-E1, Q-I4, Q-S1–2). Moved Q-R1 and Q-N1 to new Deliverables & Commissioned Research section. Q-A1 kept open on list-completeness only. Doc status: 86 decisions · 8 open questions · 2 active deliverables · 6 research pre-commits. |
| Tech stress test + implementation strategy v1 (21 Apr 2026, afternoon) | Read v2.2 spec + arch v4 + engineering-decisions placeholder + skills. Wrote `BookKeeping/reviews/spec-v2.2-tech-stress-test-apr-2026.md` — 4 Critical, 6 High, 10 Medium, 5 Low, 4 Decisions-Needed. CEO walked findings. Critical resolutions: C1 full readonly email + strong policy; C2 amend HR1 to initiate-vs-infrastructure; C3 taxonomy + evals as hard launch prerequisites; C4 TurboTax-via-QBO path proposed. Wrote `BookKeeping/engineering/implementation-strategy.md` v1 — 14 sections mapping v2.2 product decisions to concrete engineering (TypeScript everywhere · Expo/Next.js · AWS Fargate+Aurora · multi-provider AI routed via `AIClient` abstraction · Stripe Connect Standard · SOC-2-ready at launch · 10-phase sequencing spine). Introduced new primitives: User/Business/Membership/ShareLink multi-user model, `bank_state`+`enrichment_state` orthogonal lifecycle, adaptation-floor signals config table. |
| Implementation-strategy v2 — 38-decision CEO Q&A (21 Apr 2026, evening) | Per CEO directive "ask ALL critical technical questions, don't skip it." Ran 9 batches of questions covering architecture foundations, AI, integrations, data/currency/accounting, platform, security, support, CPA collaboration. Locked 38 engineering decisions (E1–E43). Direction-changing calls: **Apple/Google Sign-In + Face ID primary auth** (not magic link), **Claude Opus for all trust-critical tasks** (quality-first, cost-optimize later), **full federated-learning pipeline at launch** (+8 weeks scope, training cycle gates at 500 users), **all 3 payroll providers at launch** (Gusto + OnPay + QBO Payroll per D72), **full multi-currency from day one** (US-only launch stands; FX rates + gain/loss tracking; +2-4 weeks), **cash+accrual toggle** (accrual added to scope; +3-4 weeks), **full 1099-NEC issuance** via Track1099, **quarterly estimated tax compute + remind**, **sales tax detect/flag only** (no computation/filing), **Discord per-user channel + in-app chat** for support (AI-first, human escalation), **per-user KMS envelope encryption**, **user-configurable Face ID timeout** default 5 min, **30-day soft delete → hard delete + cert**, **explicit per-session support access grant** only. Bumped implementation-strategy to v2 with §0.5 decision log summarizing all 38 locks. Updated §1 stack table, §2.3–2.5 services, §3.4–3.5 accounting+FX, §4.1 Claude tier assignments, §5.5 Face ID, new §5.8–5.11 (cost guardrails + input safety + deletion + support access), §6 integration inventory (added Track1099, Discord, OpenExchangeRates, PostHog, Sentry), §10 sequencing (expanded Phase 0, new Phases 9–12), §12 NOT-in-scope (removed accrual+federated, added sales tax), §13 open items (closed M9+L4; DN2 still open). Still-open items: TurboTax marketing claim validation (C4), IRS research, GC reviews, partner apps, cost guardrail thresholds. |
| Solopreneur spec folder — share-ready consolidation (21 Apr 2026, late evening) | CEO request: "break it down md into appropriate md files so we have focused work, don't cramp everything into one, be organized." Created `BookKeeping/product/solopreneurs/` with 16 focused .md files + BUILD-TRACKER.md + README index. Files: 01-overview, 02-principles-and-voice, 03-onboarding, 04-data-input, 05-categorization, 06-learning-and-memory, 07-notifications-and-backlog, 08-review-and-reporting, 09-invoicing, 10-tax-and-cpa, 11-entity-type-and-s-corp, 12-platform, 13-hard-rules, 14-architecture-security-summary, 15-launch-scope, 16-success-metrics. Each file scoped to one product area with decision-ID references back to spec-brainstorm-decisions v2.2 and engineering-ID references back to implementation-strategy v2. BUILD-TRACKER.md has 9 sections: product decisions, engineering decisions, launch-blocking gaps, open product questions, research pre-commits, deliverables, partner applications, cleanup items, confirmed non-scope. Deleted previous monolithic penny-spec-solopreneurs.md in favour of folder structure. Share-ready for tech advisor + CPA + beta candidate audiences. |

| Wireframing specs for solopreneur folder (21 Apr 2026, late evening) | CEO request: "yes please create fully self-sufficient for wireframing — make a md file — for both web and mobile application, properly structured." Added two files to `BookKeeping/product/solopreneurs/` — `17-mobile-screens-and-flows.md` (15 parts: onboarding 7 screens with D83 entity-upfront · 4-tab structure · Penny thread states incl. shame-free re-entry D61 · universal approval card with 10 variants incl. S-Corp owner's-draw C.9 + income celebration C.4 + rule proposal C.8 + variable-recurring C.7 · 4 capture modes · My Books with cash runway E.2 and audit-readiness E.3 · invoicing with pixel-perfect customiser G.2 + payment plans G.5 · Connect incl. data-deletion flow F.6 · S-Corp mid-year election narration H.3 · Discord support surface K.1 · offline/error/empty states J · global patterns L · wireframing checklist O) and `18-web-screens-and-flows.md` (15 parts: web vs mobile philosophy · auth with desktop device trust · **CPA share-link landing + CPA Penny view B.2** — biggest web-only surface · desktop Penny thread with **bulk-approve mode C.2** + keyboard shortcuts · /books desktop with side-by-side P&L + multi-period grid + drill-downs · web invoice customiser E.2 with live preview · /tax hub with quarterly E28 + 1099 via Track1099 E27 · web capture with drag-drop + batch · /connect detail with full audit log · command palette I.2 · right-click context menus · keyboard-driven + sync conflict handling J.2). Bumped folder README and BUILD-TRACKER to v1.1. Folder is now fully self-sufficient for low-fi wireframing without requiring app-spec.md or design-system.md. |

| Design-system alignment with FounderFirst.one (21 Apr 2026, late evening) | Rewrote `BookKeeping/design/design-system.md` to v2.0 — unified Penny app + FounderFirst.one tokens. `--ink` palette, `--paper`, Inter, p-mark avatar, pill buttons, asymmetric bubbles. British spellings swept from 17 and 18. |
| Full folder restructure + clean (22 Apr 2026) | Full clean pass on entire BookKeeping folder. Deleted: old product files (app-spec, data-input-categorization-spec, persona-freelancer, tone-guide, user-flows-freelancer), all 19 wireframe HTML screens, penny-demo-v1.html, supabase-setup.sql, app-spec stress test, root-level penny-system-prompt.md duplicate. Flattened product/solopreneurs/ → product/ directly. Moved 19-wireframe stress test to reviews/. Moved bookkeeper-flows.html to tools/. Moved founderfirst-os-lofi.html to FounderFirst OS/FounderFirst_OS_Dashboard/. Updated CLAUDE.md throughout to reflect clean state. |
| Demo v5 pre-handoff stress test + fix pass (23 Apr 2026) | Stress-tested the `BookKeeping/demo/` scaffolding from UX / UI / PM / Tech / Architect lenses before handing it to Claude Code for the build. Report: `BookKeeping/reviews/demo-v5-pre-handoff-stress-test-apr-2026.md` — 3 Critical, 8 High, 13 Medium, 8 Low findings. Fixed all findings. Locked decisions during the pass: (a) **3-tab model** — Penny · Add · My Books — supersedes the earlier 4-tab with dedicated Connect; (b) **React + Vite** stack (out of plain HTML / React+Babel CDN / Vite options) for fast iteration at low token cost; (c) **20 personas** (2 per industry × 10 industries = 1 sole-prop + 1 S-Corp each). Key fixes: intent-to-prompt mapping via explicit `INTENT_MAP` (was a string-replace that broke multi-dot intents); removed CDN React+Babel for proper bundled build; removed `maximum-scale=1` viewport lock (a11y); stopped clearing localStorage on boot (cache wipe); added `capture.parse` shape validation; added LICENSE, CONTRIBUTING, demo-worker/README, screen-briefs 00 (seed data) + 08 (error/empty/loading/offline), util/time.js, tests/validator.test.js. Root CLAUDE.md updated with the 3-tab decision; mobile + web spec files flagged for propagation. |
| Demo v5 — Screen 4 Add tab (23 Apr 2026) | Built `BookKeeping/demo/screens/add.jsx` — full end-to-end Add tab. Three sections: Quick capture, Connected accounts, Data actions. **Quick capture:** Photo tile triggers hidden file input → fullscreen "Reading your receipt…" overlay → stub `ApprovalCard`; Voice note tile opens fullscreen pulsing mic modal (live timer, auto-stops at 4s, "Done" button) → "Penny is reading…" transition → stub `ApprovalCard`; Upload file tile opens Import sheet; Just tell me tile opens inline textarea → `capture.parse` AI call → live `ApprovalCard`. **Connected accounts:** Provider sheet (10 banks/payments/payroll) with search, per-row "Connecting…" spinner (1.6s) → "Connected" checkmark → row added with "Last sync: Just now". **Data actions:** Import (drag-and-drop + Browse files → "Analyzing…" spinner → results summary 42/39/3 → confirm CTA); Export (format pick → "Generating…" spinner → real `Blob` file download); "Connect your email" replaces "Forward receipts by email" — Gmail and Outlook with branded color badges, OAuth stub (1.8s spinner → connected state), row updates with CheckCircle. State keys: `connections` and `emailConnections` stored separately in app state. All UI patterns: stroke SVG icons, `Sheet` scaffold component, inline `Spinner` component, `Toast` (2.4s pill). Full standards documented in `BookKeeping/demo/CLAUDE.md`. |
| Demo v5 — Screens 5–7 + systemic overlay fix (23 Apr 2026) | Built the final three screens: **My Books** (`screens/books.jsx`) — 3-column stat cards (Runway / Net / Books), Needs a look (flagged transactions tap-to-sheet), Coming up (dates with type icons), Explore drill-downs, Ask Penny bar wired to `books.qa` AI intent; **Avatar menu** (`screens/avatar-menu.jsx`) — Profile (editable fields + entity-change confirm sheet with IRS disclaimer), Memory (seeded rules + Forget per item), Preferences (check-in picker, Real-time/Daily digest toggle, Face ID + AI training toggles); **Invoice designer** (`screens/invoice.jsx`) — edit/preview toggle, line items with live subtotal, tax rate, payment method multi-select, Send/Save draft/Download PDF/Recurring stubs all toast. **Systemic overlay fix:** all screens were rendering toasts and sheets outside the phone frame because `position: fixed` escapes any container. Fixed by adding `position: relative` to `.phone` in `components.css` and converting every `position: fixed` (`.card-toast`, `.sheet-backdrop`, `.sheet`, `.toast`) to `position: absolute`. Also fixed inline Toast in `add.jsx`. Rule documented in `BookKeeping/demo/CLAUDE.md` under "Overlay / toast positioning rule." |
| DESIGN.md — machine-readable design system for demo (24 Apr 2026) | Created `BookKeeping/demo/DESIGN.md` using the Google Labs DESIGN.md format (alpha spec). YAML front matter encodes all 30+ color tokens, full typography scale, radii, spacing, and component definitions from `styles/tokens.css`. Prose sections document color zones, component rules, overlay/positioning rules, and Do's/Don'ts. Zero runtime effect — documentation only. Updated `BookKeeping/demo/CLAUDE.md` to add DESIGN.md as step 2 in the "How you build each screen" read list and to the References section. Updated root CLAUDE.md Design table and Tools & Demos table to reflect the new file. Purpose: AI coding agents that start a new demo build session now automatically pick up the full token system and design rules without re-briefing. |
| Phase-2 audit-3: config, data + IRS taxonomy — 21 findings fixed (25 Apr 2026) | Full audit of `public/config/`, `util/irsLookup.js`, and IRS routing. 4 Critical · 7 High · 6 Medium · 4 Low. All fixed and deployed to main (`bbe5ce0`). Critical fixes: (1) personas.json key separator `__` → `.`; (2) LLC dual-path split — `llc-single.*` (SMLLC → Sch C) and `llc-multi.*` (MMLLC → Form 1065) added as distinct entity types with `scenarioKeyFor()` normalization in `constants/variants.js`; (3) hardcoded `"sole-prop.consulting"` fallback replaced with `DEFAULT_SCENARIO_KEY` across App.jsx + 3 screens; (4) `normalizeLabel()` added to `irsLookup.js` for apostrophe/spacing-tolerant IRS line lookups. IRS_LINE_MAP expanded from ~55 to ~120 entries. cpa-fixture.json client names aligned. Full report: `BookKeeping/reviews/demo-stress-test-apr-2026/03-config-data-irs.md`. |

---

*This file should be updated whenever a significant decision is made, a document is completed, or a new gap is identified.*
