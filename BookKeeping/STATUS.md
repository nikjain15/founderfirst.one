# Penny — Project Status
*Updated: 25 April 2026*

**What we're building:** An AI-first, mobile-first bookkeeper for US sole proprietors. Conversation is the product. AI does the work, owner confirms in one tap. Grows through word-of-mouth. Own ledger from day one.

---

## Where We Are

**Demo v5 complete and live.** All 7 screens built (Onboarding · Penny thread · Approval card · Add · My Books · Avatar menu · Invoice designer). CPA view built with 6 tabs (Work Queue · Books · P&L · Cash Flow · Chat · Learned Rules). Phase-2 stress-test audits in progress — see audit tracker below.

**Phase-2 demo stress-test audits (6 audits):**
| # | Audit | Status | Report |
|---|---|---|---|
| 1 | Founder code quality (SCAF-1–6) | ✅ Complete | `reviews/demo-stress-test-apr-2026/01-founder-code.md` |
| 2 | Prompts + voice | 🟡 In progress | `reviews/demo-stress-test-apr-2026/02-prompts-voice.md` |
| 3 | Config, data + IRS taxonomy | ✅ Complete (21 findings fixed, `bbe5ce0`) | `reviews/demo-stress-test-apr-2026/03-config-data-irs.md` |
| 4 | CPA spec buildability | ⏳ Pending | `reviews/demo-stress-test-apr-2026/04-cpa-spec-buildability.md` |
| 5 | End-user walkthrough | ⏳ Pending | `reviews/demo-stress-test-apr-2026/05-end-user-walkthrough.md` |
| 6 | Doc consistency | ⏳ Pending | `reviews/demo-stress-test-apr-2026/06-doc-consistency.md` |

**FounderFirst OS is execution-ready.** 8 expert roles fully defined with HANDOFFS between them. Standing rules enforce: ask-first, CEO authority, best thinking without constraints, trade-offs not gatekeeping, concise output. Nightly scorer automation confirmed running.

---

## Documents

✅ = complete · 🟡 = placeholder (structure only, needs content) · ❌ = doesn't exist yet · ⚠️ = exists but has known issues

### Core Product

**Product**
| | File | What it covers | Notes |
|---|---|---|---|
| ✅ | `product/spec-brainstorm-decisions.md` v2.2 | 86 product decisions (data input, categorization, learning, notifications, invoicing, tax/CPA, platform, hard rules) | 8 open questions (7 IRS → research doc + Q-A1); 2 active deliverables; 6 research pre-commits |
| ✅ | `product/01-overview.md` through `16-success-metrics.md` | 16 focused spec files — one per product area | Decision-ID refs to spec-brainstorm-decisions v2.2 and engineering-ID refs to implementation-strategy v2 |
| ✅ | `product/17-mobile-screens-and-flows.md` | Full mobile wireframing spec — 15 parts | Self-sufficient for wireframing |
| ✅ | `product/18-web-screens-and-flows.md` | Full web wireframing spec — 15 parts | Self-sufficient for wireframing |
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
| ✅ | `design/design-system.md` v2.0 | Colors, type, components, layout rules | Unified with FounderFirst.one tokens |
| ✅ | `demo/DESIGN.md` | Machine-readable design system for demo | YAML tokens + prose rules for AI coding agents |

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
| ✅ | `reviews/comprehensive-review-apr-2026.md` | Cross-document consistency audit | 7 contradictions, 14 gaps identified |
| ✅ | `reviews/spec-v2.2-tech-stress-test-apr-2026.md` | Technical stress test of v2.2 spec | 4C/6H/10M/5L. All resolved in implementation-strategy v2 |
| ✅ | `reviews/demo-stress-test-apr-2026/01-founder-code.md` | Phase-2 audit-1: founder code quality | SCAF-1–6 fixes applied |
| 🟡 | `reviews/demo-stress-test-apr-2026/02-prompts-voice.md` | Phase-2 audit-2: prompts + voice | In progress |
| ✅ | `reviews/demo-stress-test-apr-2026/03-config-data-irs.md` | Phase-2 audit-3: config, data + IRS taxonomy | 21 findings — all fixed (`bbe5ce0`) |

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

## What to Build Next (Priority Order)

**Immediate — demo phase-2 audits:**
1. Complete **audit-2** (prompts + voice) — `reviews/demo-stress-test-apr-2026/02-prompts-voice.md`
2. Complete **audit-4** (CPA spec buildability) — `reviews/demo-stress-test-apr-2026/04-cpa-spec-buildability.md`
3. Complete **audit-5** (end-user walkthrough) and **audit-6** (doc consistency)

**After demo audits — product Phase 0:**
1. **Commission IRS research** per `research/solo-freelancer/irs-tax-research.md` (Option C hybrid) — unblocks 7 tax decisions + Layer 2 taxonomy
2. `engineering/engineering-decisions.md` — populate from implementation-strategy v2 §1 and §0.5
3. `ai-evals/04-financial-computation.md` — wrong P&L numbers break user trust permanently
4. `ai-evals/03-data-capture.md` and `ai-evals/05-anomaly-detection.md` — complete the eval gate
5. `product/error-empty-states.md` — product feels unfinished without these
6. `product/day-2-30-experience.md` — where users stay or leave

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
