# Penny — Project Status
*Updated: 21 April 2026*

**What we're building:** An AI-first, mobile-first bookkeeper for US sole proprietors. Conversation is the product. AI does the work, owner confirms in one tap. Grows through word-of-mouth. Own ledger from day one.

---

## Where We Are

**Pre-build.** Product is fully thought through. Core docs written. Two workstreams active: (1) the core Penny product, (2) a Healthcare & Wellness vertical prototype. Engineering not started. Three gaps block building: tech stack, two AI eval docs, and two product experience docs.

**FounderFirst OS is execution-ready.** 8 expert roles fully defined with HANDOFFS between them. Standing rules enforce: ask-first, CEO authority, best thinking without constraints, trade-offs not gatekeeping, concise output. Nightly scorer automation confirmed running.

---

## Documents

✅ = complete · 🟡 = placeholder (structure only, needs content) · ❌ = doesn't exist yet · ⚠️ = exists but has known issues

### Core Product

**Product**
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `product/app-spec.md` v1.2 | Every screen, tab, onboarding flow, approval card | Two stress test passes applied |
| ✅ | `product/tone-guide.md` | Penny's voice, conversation rules, 8 scenarios | ⚠️ British spelling bug: "categorised" needs find-replace |
| ✅ | `product/persona-freelancer.md` | MVP user — who Alex is, her pain, her life | |
| ✅ | `product/user-flows-freelancer.md` | 5 core activities, notifications, invoice reminders | |
| ✅ | `product/spec-brainstorm-decisions.md` v2.2 | 86 product decisions (data input, categorization, learning, notifications, invoicing, tax/CPA, platform, hard rules) | 8 open questions (7 IRS → research doc + Q-A1); 2 active deliverables; 6 research pre-commits |
| ⚠️ | `product/data-input-categorization-spec.md` v1.0 | Early Layer 1 + Layer 2 spec (ingest / normalize / categorize / approval) | **Stale — needs rewrite to v2.0 based on brainstorm-decisions v2.2 locks.** Do not treat as current source of truth |
| ❌ | `product/error-empty-states.md` | What Alex sees when things go wrong or are empty | Needed before launch |
| ❌ | `product/day-2-30-experience.md` | What happens after first approval — habit formation | Critical for retention |
| ❌ | `product/persona-product-seller.md` | Segment 2 of 3 — not documented yet | |
| ❌ | `product/persona-local-service.md` | Segment 3 of 3 — not documented yet | |

**Architecture & Engineering**
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `architecture/system-architecture.md` v4 | Full system design — microservices, data model, AI pipeline, security | Production-grade |
| 🟡 | `architecture/data-governance.md` | Privacy & compliance | 8 open questions, no answers yet |
| 🟡 | `engineering/engineering-decisions.md` | Tech stack | All sections empty — **blocks everything** |

**Design**
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `design/design-system.md` | Colors, type, components, layout rules | |
| ✅ | `design/wireframes/` | 17 screens + full prototype | `prototype.html` + `penny-wireframe-v3.html` |

**AI Evals** *(all 5 must pass before any model ships)*
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `ai-evals/00-how-penny-earns-trust.md` | Trust principles and eval philosophy | |
| ✅ | `ai-evals/01-transaction-intelligence.md` | Categorization, confidence, vendor normalization, split | |
| ✅ | `ai-evals/02-conversational-qa.md` | Q&A accuracy, hallucination prevention, multi-turn | |
| 🟡 | `ai-evals/03-data-capture.md` | Receipt & invoice OCR | Scope defined, no metrics yet |
| 🟡 | `ai-evals/04-financial-computation.md` | P&L accuracy | Scope defined, no metrics — **high priority** |
| 🟡 | `ai-evals/05-anomaly-detection.md` | Duplicate & anomaly detection | Scope defined, no metrics yet |

**Research** *(reference only)*
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `research/bookkeeper-role-reference.md` | What a human bookkeeper actually does | |
| ⚠️ | `research/data-capture-integration-reference.md` | Data sources & capture methods | Ledger sections outdated — contradicts settled architecture |
| ✅ | `research/solo-freelancer/README.md` | Index of all solo-freelancer research + planned studies | Entry point for the segment research folder |
| ✅ | `research/solo-freelancer/` | Freelancer segment research (5 docs) | master-research, segment-needs-analysis, integration-sources, research-strategy, research |
| 🟡 | `research/solo-freelancer/irs-tax-research.md` | IRS & tax research — blocks 7 product decisions | All 7 questions (Q-C1–C4, Q-T1–T3) open; research pending per Option C hybrid plan |

**Reviews**
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `reviews/app-spec-stress-test-apr-2026.md` | Pass 1 & 2 stress test | Applied in app-spec v1.1 and v1.2 |
| ✅ | `reviews/comprehensive-review-apr-2026.md` | Cross-document consistency audit | 7 contradictions, 14 gaps identified |

### FounderFirst OS (in `FounderFirst OS/FounderFirst_OS_Role/`)

| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `IDENTITY.md` | Project template + standing rules | CEO authority, ask-first, trade-offs not gatekeeping, concise output |
| ✅ | `IDENTITY_penny.md` | Penny project context | Stage: Build, 3 segments, 8 locked decisions, evidence, open questions |
| ✅ | `README.md` | System overview + activation guide | How every role works, stage priorities, handoff model |
| ✅ | `role_research.md` | Head of Research | Problem validation, customer discovery, segment validation |
| ✅ | `role_cpo.md` | CPO | Product scope, one job, multi-segment strategy |
| ✅ | `role_cto.md` | CTO | AI architecture, prompts, evaluation, shipping |
| ✅ | `role_design.md` | Head of Design | User flows, AI interface patterns, design systems |
| ✅ | `role_cmo.md` | CMO | Positioning, messaging, first users, WOM, retention |
| ✅ | `role_cfo.md` | CFO | Pricing, unit economics, runway, fundraising |
| ✅ | `role_coo.md` | COO | Decisions, systems, bottlenecks, hiring |
| ✅ | `role_legal.md` | General Counsel | Terms, privacy, AI liability, data handling, IP |
| ✅ | `CHANGELOG.md` | Change history | All updates documented |

### Tools & Artifacts (in `tools/`)

| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `tools/build-in-public.html` | Build-in-public page | |
| ✅ | `tools/claude-efficiency-dashboard.html` | Claude efficiency dashboard | |
| ✅ | `tools/token-guide.html` | Token/design guide | |
| ✅ | `tools/founderfirst-os-lofi.html` | Lo-fi OS prototype | |

### FounderFirst OS Dashboard (in `FounderFirst OS/FounderFirst_OS_Dashboard/`)

| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `STRATEGY.md` | Dashboard concept, 6 levers, design specs | |
| ✅ | `daily-log.json` | Nightly scorer output | Auto-updated at 9pm by scheduled task |
| ✅ | `founderfirst-os.html` | Interactive dashboard | 3 views: Today, My Levers, Trend |

---

## Known Issues — Must Fix Before External Demos

From `reviews/comprehensive-review-apr-2026.md`:

- "Categorised" → "Categorized" find-replace needed in tone-guide.md and app-spec.md
- 😊 emoji still in tone guide (banned by design system)
- Notification label consistency not confirmed resolved

---

## What to Build Next (Priority Order)

1. **Rewrite `product/data-input-categorization-spec.md` to v2.0** — apply the 86 locked decisions from `spec-brainstorm-decisions.md` v2.2. Current v1.0 is stale.
2. **Commission IRS research** per `research/solo-freelancer/irs-tax-research.md` (Option C hybrid) — unblocks 7 tax decisions + Layer 2 taxonomy
3. `engineering/engineering-decisions.md` — pick the stack (**nothing can be built without this**)
4. `ai-evals/04-financial-computation.md` — wrong P&L numbers break user trust permanently
5. `ai-evals/03-data-capture.md` and `ai-evals/05-anomaly-detection.md` — complete the eval gate (add S-Corp test cases per D72)
6. `product/error-empty-states.md` — product feels unfinished without these
7. `product/day-2-30-experience.md` — where users stay or leave
8. American English find-replace across tone guide and app spec

---

## Settled (Don't Re-open)

- Own the ledger from day one — QuickBooks/Xero are export targets only
- Mobile-first — phone is primary, web follows
- Conversation is the UX — no forms, no dashboards
- US market only
- MVP user: solo service provider (freelancer/consultant) — persona: Alex
- Growth: word-of-mouth only
- American English everywhere
- AI training on user data: explicit opt-in, default off
