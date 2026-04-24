# Open Items — Build Blockers

*These must be resolved before the track they block can ship. Check this file at the start of every sprint.*
*Last updated: 2026-04-23*

---

## Blocker 1 — IRS Research
**Blocks:** Track E (AI categorization), Track G (tax engine)
**Owner:** Nik + CPA reviewer
**Reference:** `BookKeeping/research/solo-freelancer/irs-tax-research.md`

What needs to happen:
- Commission a US-licensed CPA to answer the 7 open questions in the IRS research doc (Q-C1 through Q-C4, Q-T1 through Q-T3)
- Output: `categories.v1.json` — the CPA-reviewed taxonomy file that becomes the engineering source of truth
- No categorization code ships until this is done

---

## Blocker 2 — Legal Setup
**Blocks:** any real user, partner applications, Track K
**Owner:** Nik
**Reference:** `implementation/legal-checklist.md`

What needs to happen: work through the checklist in full. Nothing ships to a real user until it's complete.

---

## Blocker 3 — Partner Applications
**Blocks:** Track D (ingestion), Track F (OCR), Track G (1099), Track J (support)
**Owner:** Nik
**Reference:** `implementation/partner-applications.md`

What needs to happen: submit all applications in the sequencing order in that doc. Several have multi-week review times — start before writing integration code.

---

## Blocker 4 — GitHub Packages setup for `penny-shared`
**Blocks:** any cross-repo type sharing (needed from Track A onward)
**Owner:** Nik

What needs to happen:
- Create `penny-shared` repo
- Enable GitHub Packages on the org
- Add a CI job that publishes `penny-shared` as a private npm package on every merge to main
- Add `@penny/shared` as a dependency in `penny-api`, `penny-app`, `penny-worker`

Breaking changes protocol once live:
- Breaking type change = bump major version (e.g. 1.x → 2.0.0) + entry in `BREAKING_CHANGES.md`
- Open coordinated PRs in all 3 consuming repos in the same sprint — don't merge `penny-shared` until all 3 are ready
- Each consuming repo's CI pins a minimum version and fails the build if `penny-shared` is below it

---

## Blocker 5 — Per-intent AI token budgets
**Blocks:** Track E (any intent going to production)
**Owner:** Nik

The demo hard-caps all responses at 400 tokens. Production needs a per-intent budget. Proposed starting values (adjust based on real usage data):

| Intent | Max tokens | Notes |
|---|---|---|
| `thread.greeting`, `thread.idle` | 150 | Short welcome copy |
| `onboarding.*` | 200 | One step at a time |
| `card.approval` | 300 | Headline + why + CTAs |
| `capture.parse` | 400 | Structured JSON extraction |
| `books.qa`, `thread.qa` | 800 | Room for a real answer |
| `tx.categorize` | 300 | Structured output only |
| `anomaly.detect` | 400 | Explanation must be plain English |
| `tax.estimate` | 600 | Needs working + caveat |
| `support.reply` | 800 | Customer-facing, can't be truncated |

These live in a config object in the Worker's `INTENT_MAP` — not hardcoded per call. You can raise any cap without a code deploy, just a config change.

**Action needed:** review the table above and confirm or adjust before Track E ships any intent to production.

---

## Blocker 6 — Spend cap thresholds confirmed
**Blocks:** Track E (any AI call in production)
**Owner:** Nik

Current settings in `IMPLEMENTATION-STRATEGY.md`:
- Soft-degrade (non-critical AI calls queue, Penny says "give me a moment"): **$10/user/day**
- Hard cap (trust-critical approvals still process; UI copy falls back to deterministic): **$100/user/day**
- Global circuit breaker threshold: **TBD — set this before first AI call ships**

**Action needed:** confirm the global circuit breaker threshold ($ per hour across all users). Suggested starting point: 10× the average expected hourly spend across your beta cohort. Revisit after first 30 days of data.

---

## Resolved (for reference)

| Item | Resolution |
|---|---|
| Tamagui vs NativeWind | NativeWind v4 — locked 2026-04-23 |
| Cross-region DR | Supabase Pro + PITR for beta; cross-region post-launch |
| Queue system | SQS FIFO only — BullMQ + Redis dropped |
| Drizzle + pgBouncer compatibility | Runtime uses pooler URL + `prepare: false`; migrations use direct connection |
| OCR primary vendor | Veryfi primary + Claude Sonnet Vision fallback on low confidence |
| Discord vs in-app chat | Both — Discord per-user channel + in-app widget |
| Hard spend cap | $100/user/day hard, $10/user/day soft |

---

*Update this file whenever a blocker is resolved or a new one is discovered.*
