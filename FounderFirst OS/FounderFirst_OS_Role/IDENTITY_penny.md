PROJECT: Penny
STAGE: Build

ONE SENTENCE: An AI-first, mobile-first bookkeeper that does the work for US sole proprietors — categorising transactions, producing reports, and answering financial questions in plain English — so the owner confirms in one tap instead of doing the books themselves.

CUSTOMER: Three segments, in priority order:
1. Solo service provider (freelancer/consultant) — MVP persona: Alex
2. Product-based seller (e-commerce or retail)
3. Local service business (plumber, salon, cleaner)

All are US sole proprietors. All do their own books because they cannot afford a bookkeeper. All hate it.

PROBLEM: These owners spend hours each month on bookkeeping they do not understand, are terrified of getting it wrong at tax time, and every tool available (QuickBooks, spreadsheets) assumes they already know accounting.

REVENUE MODEL: Not decided

GROWTH STRATEGY: Word-of-mouth only

LOCKED DECISIONS
> Closed. Not revisited unless I say REOPEN #.

| # | Decision | Why | Date |
|---|----------|-----|------|
| 1 | Own the ledger from day one | QuickBooks/Xero are export targets only — we control the data | Pre-Apr 2026 |
| 2 | Mobile-first | Phone is primary device for all 3 segments, web follows | Pre-Apr 2026 |
| 3 | Conversation is the UX | No forms, no dashboards — Penny talks, owner taps | Pre-Apr 2026 |
| 4 | US market only | Tax rules, bank feeds, regulatory scope — one country first | Pre-Apr 2026 |
| 5 | MVP user: Alex (solo service provider) | Sharpest pain, simplest books, fastest to validate | Pre-Apr 2026 |
| 6 | Growth: word-of-mouth only | No paid ads, no SEO, no content until 100 users minimum | Pre-Apr 2026 |
| 7 | American English everywhere | All copy, all AI output, all docs | Pre-Apr 2026 |
| 8 | AI training on user data: explicit opt-in, default off | Trust is the product — cannot risk it on data policy | Pre-Apr 2026 |

WHAT I KNOW (Evidence Only)
- RESEARCH: Persona Alex documented in `product/persona-freelancer.md` — solo service provider pain points validated
- DOCUMENT: Full app spec written and stress-tested twice (`product/app-spec.md` v1.2)
- DOCUMENT: Tone guide written — Penny's voice defined across 8 scenarios (`product/tone-guide.md`)
- DOCUMENT: 5 core user flows mapped (`product/user-flows-freelancer.md`)
- DOCUMENT: System architecture v4 complete (`architecture/system-architecture.md`)
- DOCUMENT: AI eval framework written — trust principles, risk tiers, stage gates (`ai-evals/00-how-penny-earns-trust.md`)
- DOCUMENT: Transaction intelligence eval suite complete (`ai-evals/01-transaction-intelligence.md`)
- DOCUMENT: Conversational QA eval suite complete (`ai-evals/02-conversational-qa.md`)
- DOCUMENT: Design system defined (`design/design-system.md`)
- DOCUMENT: 17 wireframe screens + full prototype built
- REVIEW: Cross-document consistency audit done — 7 contradictions, 14 gaps identified (`reviews/comprehensive-review-apr-2026.md`)

BIGGEST OPEN QUESTIONS
- Tech stack not decided — blocks all engineering (`engineering/engineering-decisions.md` is empty)
- Financial computation eval (`ai-evals/04-financial-computation.md`) has no metrics — wrong P&L breaks trust permanently
- Data capture eval (`ai-evals/03-data-capture.md`) and anomaly detection eval (`ai-evals/05-anomaly-detection.md`) incomplete
- No error/empty states doc — product feels unfinished without these
- No day 2–30 experience doc — where users stay or leave
- Persona docs for segments 2 (product seller) and 3 (local service) do not exist yet

CURRENT WEEK'S GOAL
- Pick the tech stack (`engineering/engineering-decisions.md`) — nothing can be built without this
