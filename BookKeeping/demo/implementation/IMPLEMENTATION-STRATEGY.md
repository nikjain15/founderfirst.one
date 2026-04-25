# Penny — Implementation Strategy (Demo → Production, Single-Shot Build)

*Scope: build everything needed for invite-only beta in one integrated effort. No phased cuts.*
*Starting point: React + Vite demo, Cloudflare Worker → Claude, seeded state.*
*Last updated: 2026-04-23*

---

## 0. Ground rules

1. **Single-shot launch.** No feature phasing — every decision in the product spec ships on day one of invite-only beta.
2. **Own the ledger.** Postgres (via Supabase) is system of record. Exports are one-way.
3. **Append-only.** Financial data is never overwritten or hard-deleted. Every state change is a reversible event.
4. **Accuracy > completeness.** Low confidence → ask, don't guess.
5. **Server-side validation on every AI output.** Client guardrails are UX polish, not trust.
6. **Trust signal first.** AWS stack, SOC 2 Type I before public launch, public status page, real observability.

---

## 1. Locked decisions (from 23 Apr 2026 CEO Q&A)

| # | Area | Decision |
|---|---|---|
| L1 | Surface | Mobile-first responsive web + native iOS. Android fast-follow. |
| L2 | Launch mode | Invite-only beta → public beta after pen test + SOC 2 Type I |
| L3 | Auth | Apple + Google + email/password; Face ID required; multi-device sync |
| L4 | Bank feeds | Plaid only at launch |
| L5 | Payments | Stripe, Square, PayPal, Venmo, Zelle, CashApp — all at launch |
| L6 | Email | Gmail + Outlook at launch |
| L7 | Payroll | Gusto + OnPay + QBO Payroll at launch |
| L8 | Import | CSV + QBO + Xero API at launch |
| L9 | Entity types | Sole prop + LLC + S-Corp + C-Corp + Partnership |
| L10 | Accounting basis | Cash + accrual toggle at launch |
| L11 | Currency | Full multi-currency (USD base) |
| L12 | Tax | Quarterly estimate compute + remind; 1099-NEC via Track1099; sales tax detect/flag only |
| L13 | AI tiering | Opus for trust-critical; Haiku for UI copy; hard per-user daily spend cap ($15/user/day, soft-degrade at $10) + global circuit breaker |
| L14 | Federated learning | Data pipeline at launch; training gated at 500 users |
| L15 | OCR | Specialized vendor (Veryfi or Mindee) as primary; Claude vision as fallback/cross-check |
| L16 | Eval gate | Strict from day one — failing eval blocks deploy |
| L17 | Backend | TypeScript everywhere |
| L18 | DB | Supabase (managed Postgres on AWS) |
| L19 | Mobile | Expo managed workflow |
| L20 | Hosting | AWS for core API + data; Cloudflare Worker edge for AI router only |
| L21 | Offline | Full offline capture with sync queue |
| L22 | Compliance | SOC 2 Type I before public beta; vendor later; internal pen test; cyber insurance quoted and bound before first real user |
| L23 | Region | US-only |
| L24 | Status | Better Stack public status page |
| L25 | Analytics | PostHog + Sentry |
| L26 | Support | Private per-user Discord channel (Claude bot + founder escalation) + in-app chat widget |
| L27 | Pricing | Free during beta |
| L28 | Repos | Separate repos, balanced for low overhead |
| L29 | CPA + multi-user | Share-links and roles at launch |
| L30 | Invoices | Pixel-perfect customization + recurring + payment plans at launch |
| L31 | Demo — AI model tiering | Ambient auto-calls (greeting, idle, card approval) → Haiku. User-initiated accuracy-critical calls (thread Q&A, books Q&A, capture parse) → Sonnet. Never collapse tiers — split is load management, not just cost. |
| L32 | Demo — session state | App state in `sessionStorage` (tab-scoped). New tab = fresh onboarding. Refresh mid-walkthrough preserves progress. AI response cache stays in `localStorage`. |

---

## 2. Target architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Clients                                                     │
│  • iOS app (Expo managed)                                    │
│  • Responsive web (Vite SPA, reuses current demo components) │
│  • CPA web view (share-link, read-only or edit per role)     │
└──────────────────┬───────────────────────────────────────────┘
                   │ HTTPS + Supabase JWT
┌──────────────────▼───────────────────────────────────────────┐
│  Cloudflare Worker — AI edge router                          │
│  • Verifies Supabase JWT                                     │
│  • Routes intents to Claude (Opus / Sonnet / Haiku)          │
│  • Runs server-side voice validator                          │
│  • KV prompt cache (user_id + prompt_hash)                   │
│  • Per-user spend metering → dashboards                      │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  Core API — AWS ECS Fargate (TypeScript, Fastify)            │
│  ├── auth-svc        Apple/Google/email/password + MFA       │
│  ├── ledger-svc      Append-only event store + projections   │
│  ├── ingest-svc      Plaid/Stripe/Square/PayPal/Venmo/…     │
│  ├── email-svc       Gmail/Outlook OAuth, receipt extraction │
│  ├── ocr-svc         Veryfi primary, Claude vision verify    │
│  ├── intelligence-svc Categorization, rules, anomalies       │
│  ├── tax-svc         Quarterly estimates, 1099, sales tax    │
│  ├── invoice-svc     Designer, recurring, payment plans      │
│  ├── export-svc      QBO/Xero/CSV/PDF/1120-S/Schedule-C      │
│  ├── cpa-svc         Share-links, roles, audit log           │
│  ├── fx-svc          OpenExchangeRates sync + gain/loss      │
│  ├── notify-svc      APNs push, email, in-app                │
│  └── support-svc     In-app chat + escalation                │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  Data                                                        │
│  • Supabase (Postgres 15) — primary store, RLS, Auth, Storage│
│  • S3 (private, SSE-KMS) — receipts, invoices, exports       │
│  • SQS FIFO — all async work (ingestion, OCR, exports, notif)│
│  • CF KV — AI response cache (cross-device, per-user TTLs)   │
│  • Kinesis Firehose → S3 → Athena — event lake + FL corpus   │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Stack summary

| Concern | Choice | Notes |
|---|---|---|
| Frontend web | React 18 + Vite + TypeScript | Current demo; add TS, tRPC client |
| Mobile | Expo managed + React Native | Reuses ~80% of web components |
| Shared UI | NativeWind v4 | Tailwind utility classes on RN; demo tokens map directly to tailwind.config.ts |
| API | Fastify + tRPC + Zod | End-to-end typed contracts |
| ORM | Drizzle | TS-first, raw-SQL escape hatch. Runtime uses pooler URL with `prepare: false`; migrations use direct connection. |
| DB | Supabase Postgres 15 | RLS enforces business-level isolation |
| Auth | Supabase Auth | Apple + Google OAuth + email/password + TOTP MFA |
| Storage | S3 + Supabase Storage | S3 for financial docs; Supabase for user avatars |
| Queue | SQS FIFO only | Cross-service and in-service. DLQ on every queue. No Redis/BullMQ. |
| AI | Anthropic API via CF Worker | Opus/Sonnet/Haiku by intent |
| OCR | Veryfi (primary), Claude Vision (verify) | Cross-check receipts |
| Infra-as-code | Terraform + GitHub Actions | One-click envs |
| Hosting | AWS us-east-1 + us-west-2 (DR) | |
| CDN/edge | Cloudflare | Worker + DNS + WAF |
| Observability | Sentry + PostHog + Better Stack + CloudWatch | |
| Secrets | AWS Secrets Manager + CF Secrets | Quarterly rotation |

---

## 4. Data model (v1 — ships with launch)

```sql
-- Identity
users                 (id, email, apple_sub, google_sub, mfa_enabled, created_at)
businesses            (id, name, entity_type, industry, fiscal_year_start,
                       base_currency, accounting_basis,
                       tax_id_last4,       -- display masking only
                       tax_id_encrypted,   -- AES-256 KMS; decrypted only inside tax-svc for IRS submissions
                       created_at)
memberships           (user_id, business_id, role)
                       -- role ∈ {owner, bookkeeper, cpa_viewer, cpa_editor}
share_links           (id, business_id, role, expires_at, token_hash, revoked_at)

-- Ledger (append-only)
events                (id, business_id, aggregate_id, type, payload_jsonb,
                       actor_user_id, ip, created_at)
transactions          (id, business_id, account_id, amount_cents, currency,
                       fx_rate, base_amount_cents, occurred_at, raw_description,
                       vendor_normalized, category_code, confidence,
                       bank_state,         -- pending | posted | refunded | disputed
                       enrichment_state,   -- raw | pending_review | approved | skipped | flagged
                       source, basis_cash_date, basis_accrual_date, created_at)
transaction_splits    (id, parent_tx_id FK→transactions.id, amount_cents, currency,
                       category_code FK→categories.code, note, seq)
                       -- DB constraint: SUM(amount_cents) across splits = parent.amount_cents
accounts              (id, business_id, provider, external_id, kind, nickname,
                       currency, last_sync_at, last_sync_cursor)
receipts              (id, transaction_id, s3_key, ocr_provider, ocr_jsonb,
                       confidence, verified_by_claude, created_at)

-- Intelligence & memory
categories            (code PK, label, parent_code, tax_line_sole_prop,
                       tax_line_scorp, tax_line_ccorp, tax_line_partnership)
                       -- seeded from categories.v1.json, CPA-reviewed
rules                 (id, business_id, match_jsonb, action_jsonb, source,
                       created_at, last_fired_at)
memories              (id, business_id, kind, content, created_at)
                       -- kind ∈ {vendor_preference, client_context, category_preference, business_context, personal_note}
                       -- narrative context only; machine-actionable rules live in the rules table
vendor_stats          (business_id, vendor_normalized, count, last_category,
                       last_seen_at)  -- projection

-- Invoices
invoices              (id, business_id, number, client_jsonb, lines_jsonb,
                       tax_jsonb, payment_methods[], customization_jsonb,
                       is_template,        -- true = recurring template; null sent_at/due_at/status
                       status, pdf_s3_key, sent_at, due_at)
invoice_payments      (id, invoice_id, amount_cents, method, received_at)
invoice_schedules     (id, invoice_template_id, cadence, next_run_at)
payment_plans         (id, invoice_id, installments_jsonb, status)

-- Tax
tax_estimates         (business_id, period, federal_cents, state_cents,
                       computed_at, computed_by_model)
form_1099_candidates  (business_id, vendor_id, ytd_paid_cents, w9_jsonb)
sales_tax_flags       (transaction_id, jurisdiction, reason, flagged_at)

-- FX
fx_rates              (date, base_currency, quote_currency, rate)  -- OpenExchangeRates
fx_realizations       (transaction_id, realized_gain_cents)

-- AI
ai_spend              (user_id, business_id, intent, model, input_tokens,
                       output_tokens, cost_cents, cached, created_at)
eval_runs             (suite, commit_sha, pass_rate, jsonb_results, created_at)

-- Support
support_threads       (id, business_id, user_id, channel, status, created_at)
support_messages      (thread_id, author, body, created_at)

-- Federated-learning pipeline (collect now, train post-500 users)
fl_contributions      (id, business_id_hash, anonymized_jsonb, opt_in_version,
                       created_at)
                       -- business_id_hash = HMAC-SHA256(fl_secret_key, business_id)
                       -- fl_secret_key in AWS Secrets Manager only; not in DB; rotated annually
```

**Row-level security:** every table keyed by `business_id` has an RLS policy — user can read/write only where a `memberships` row grants the role. CPA-viewer can read but not write. Share-link tokens map to ephemeral sessions with the share-link role.

---

## 5. AI layer

**Intent routing** — defined in the Worker's `INTENT_MAP`. Each intent specifies model tier, prompt file, schema, and eval suite.

| Intent | Model | Purpose |
|---|---|---|
| `thread.greeting`, `thread.idle`, `card.approval`, `books.qa`, `toast.*` | Haiku | UI copy |
| `tx.categorize`, `tx.extract-vendor`, `rule.propose` | Opus | Trust-critical |
| `receipt.ocr-verify` | Sonnet | Cross-check Veryfi output |
| `anomaly.detect`, `duplicate.detect` | Opus | Financial safety |
| `tax.estimate`, `tax.classify-1099` | Opus | Financial accuracy |
| `support.reply` | Sonnet | Customer-facing, escalates to founder on low confidence |

**Validator pipeline (server-side):**
1. Call Claude with JSON schema.
2. Parse; if invalid JSON → retry once.
3. Run banned-phrase validator (from `guardrails/`).
4. Run schema-specific validator (e.g., amounts present, category in seeded list).
5. Run voice validator (optional LLM-as-judge on Haiku outputs).
6. On failure, return deterministic fallback and log.

**Spend caps (hard):**
- Per-user soft-degrade at $10/user/day (non-critical AI calls queue with "give me a moment").
- Per-user hard cap at $15/user/day (trust-critical approvals still process; UI copy falls back to deterministic copy).
- Global circuit breaker: if total AI spend exceeds threshold/hour, non-critical paths throttle and founder is paged.
- Every AI call writes to `ai_spend`. Grafana shows $/user/day, $/intent, cache hit rate, model mix.

**CF KV response cache:**
- Key: `userID:intentHash`. Cross-device, warm at the edge.
- TTLs: UI copy (thread.greeting, onboarding) = 1 hour. Tax estimates = 24 hours. Q&A and categorization = no cache (every call is unique).
- Estimated impact: ~30% reduction in Anthropic calls for active users.

**Eval gate (strict):**
- 5 suites from `ai-evals/` run in CI on every PR that touches prompts or the Worker.
- Trust-critical suites (categorization, financial computation, data capture, anomaly) must be 100% pass. Voice/conversation suite must be >90%.
- Failing run blocks merge.

**Federated learning pipeline:**
- Opt-in toggle in avatar → Preferences (default off).
- Opted-in users contribute to `fl_contributions` with business_id one-way-hashed.
- Aggregations computed nightly. Training only starts when corpus has 500+ businesses and GC has signed off on the architecture doc.

---

## 6. Integration catalog

| Vendor | Purpose | Status to arrange |
|---|---|---|
| Plaid | Bank feeds | Apply for Production access (SMB tier) |
| Stripe Connect | Card payments | Standard account |
| Square | POS payments | Developer app + OAuth |
| PayPal | Payments | Partner API |
| Venmo | P2P payments | PayPal Partner (Venmo uses PP infra) |
| Zelle | P2P payments | Ingest via bank feed (no direct API) |
| CashApp | P2P payments | Ingest via bank feed + email receipts |
| Gusto | Payroll | Partner app + OAuth |
| OnPay | Payroll | Partner API |
| QBO Payroll | Payroll | Intuit Partner Portal |
| Intuit QBO | Export + import | Intuit Partner Portal |
| Xero | Export + import | Xero App Partner |
| Track1099 | 1099 filing | API account |
| Veryfi | OCR | Paid API key |
| OpenExchangeRates | FX | Paid plan |
| Anthropic | AI | Production API key |
| Apple | Sign-In + APNs + App Store | Developer Program |
| Google | Sign-In + Gmail OAuth | Cloud project |
| Microsoft | Outlook OAuth | Azure AD app |
| Supabase | DB + Auth + Storage | Pro plan |
| AWS | Infra | Root account + Organizations |
| Cloudflare | Edge + DNS | Pro plan |
| PostHog + Sentry + Better Stack | Observability | Paid tiers |

---

## 7. Tax & accounting engine

Blocked on **IRS research completion** — without it, categorization can't be certified. In parallel with build:

1. Commission IRS research (see `research/solo-freelancer/irs-tax-research.md`).
2. Produce `categories.v1.json` — CPA-reviewed, keyed to tax lines per entity type.
3. Quarterly estimator: income × applicable rates (fed + state) with deductions. Uses Opus with structured context.
4. 1099-NEC: `form_1099_candidates` populated throughout year; Track1099 API call in Jan.
5. Sales tax: detect jurisdictions per transaction (Avalara lite ruleset) and flag — do not compute or file.
6. Accrual basis: every transaction stores both `basis_cash_date` and `basis_accrual_date`; P&L projections run both. Toggle in My Books.
7. Multi-currency: every amount stored in native currency + base (USD); FX rate snapshotted at transaction time; realized gain/loss computed on settlement.
8. S-Corp support: owner's-draw and distribution variants on approval cards; 1120-S export package; payroll-linked salary validation.

---

## 8. Security & compliance

**Baseline (day one):**
- TLS 1.3 only, HSTS preload.
- Supabase RLS enforced on every table; integration tests verify policies.
- AWS KMS envelope encryption for: bank tokens, tax IDs, bank account numbers, OAuth refresh tokens.
- Secrets in AWS Secrets Manager + CF Secrets; rotated quarterly; never in env files or repos.
- Per-business KMS data-encryption-key (DEK); master key rotated annually.
- PII redaction in logs (structured logger with redaction middleware).
- Rate limits per user + per IP at the Worker edge.
- MFA required for all operator access. MFA required for users on sensitive actions (export, delete, CPA invite).

**Before first real user:**
- Internal penetration test: OWASP Top-10 checklist + auth bypass + RLS bypass + IDOR. Documented in `security/pen-test-YYYY-MM.md`.
- Cyber insurance bound (quote obtained now; target ~$2–5k/year early stage).
- Incident response runbook written.
- Data Processing Agreement signed with every subprocessor.

**Before public beta:**
- SOC 2 Type I — engage Vanta or Drata 90 days before target date.
- External pen test budgeted (later).
- Privacy policy + terms finalized by counsel.

**Lifecycle:**
- Soft delete → 30-day window → hard delete + cert email.
- Every event carries `actor_user_id`, `ip`, `user_agent`.
- Support-access grant: explicit per-session, time-bounded, logged.

---

## 9. Observability & cost dashboards

| Tool | Surfaces |
|---|---|
| Sentry | JS errors (web + iOS), API errors, source maps uploaded in CI |
| PostHog | Product analytics, funnels, feature flags, session replay (web, masked) |
| Better Stack | Uptime monitoring + public status page |
| CloudWatch | AWS metrics, ECS/RDS/ElastiCache |
| Grafana on Supabase | Custom dashboards: AI spend per user/intent/model, cache hit rate, eval pass rate, approval-card time-to-approve, ingestion lag |

**Alerts:**
- Error rate > 1% over 5 min → page founder.
- Plaid/Stripe webhook backlog > 5 min → page.
- AI spend anomaly (user 3× their 7-day average) → notify (not page).
- Eval pass rate drops below threshold → block deploy (already in CI) + notify.

---

## 10. Testing + eval strategy

| Layer | Tool | Expectation |
|---|---|---|
| Unit | Vitest | 80% coverage on ledger-svc, intelligence-svc, tax-svc, fx-svc |
| Integration | Vitest + testcontainers (Postgres) + Supabase local | Every API route + RLS policy |
| E2E | Playwright (web) + Detox (iOS) | Onboarding → first approval → invoice → export |
| AI evals | Custom runner in `ai-evals/` | All 5 suites; strict gate on trust-critical |
| Security | Semgrep + Snyk + RLS policy tests | Zero high/critical at merge |
| Load | k6 | 1k concurrent users, p95 API < 400ms, AI p95 < 3s |
| Regression | Visual diff (Chromatic or Percy) on key screens | Block on unreviewed diff |

CI runs on every PR, on every push to main, and nightly. Preview deploys per PR.

---

## 11. Support & operations

**Support (Discord + in-app chat, AI-first, low founder overhead):**
- Every user gets a **private Discord channel** on signup (Penny-operated server, channel gated to user + founder + bot).
- Claude-powered bot answers 24/7 with access to user's redacted account state + Penny docs.
- User says "talk to human" or bot confidence < threshold → founder notified via @mention in channel + push.
- **In-app chat widget** is the parallel surface for users who don't open Discord. Both surfaces write to `support_threads`.
- SLA (beta): 4h response during US business hours.
- All support messages stored; used to improve prompts and eval cases.

**Ops (founder-only on-call):**
- PagerDuty (solo schedule) wired to Sentry + Better Stack.
- Runbooks for: Plaid outage, Stripe outage, Claude outage, DB failover, cert rotation, key rotation, incident disclosure.
- DR: Supabase Pro with Point-in-Time Recovery (PITR) enabled. RPO ~minutes, RTO ~1 hour. Nightly backup + PITR is the beta posture. Cross-region read replica deferred to post-launch (requires Supabase Enterprise). Recovery drill quarterly.

---

## 12. Legal & business setup

**You need, before first real user (recommended sequence):**
1. **Delaware C-Corp** — Stripe Atlas or Clerky (~1 week).
2. **EIN, business bank account, business credit card.**
3. **General Counsel engagement** — recommend: Cooley or Gunderson for startup package; Lextech or Atrium for lean alternatives. Scope: ToS, Privacy Policy, DPA template, CCPA compliance, financial-services disclaimers.
4. **IP assignment** — all founder code assigned to the corp.
5. **Plaid, Stripe, Intuit partner applications** — all require an incorporated entity.
6. **Cyber insurance quote** — Coalition or At-Bay.
7. **Trademark** — "Penny" is generic; consider "Penny Books" or similar for USPTO filing. Counsel decides.
8. **Data processing addendums** — sign with every vendor (Supabase, AWS, Anthropic, Veryfi, Plaid, etc.).

---

## 13. Repo strategy

Per your "separate but balanced" preference — 4 repos sharing common tooling:

```
penny-app         React Native (Expo) + web build (Metro web or Vite)
                  → iOS + responsive web
penny-api         All backend services (monorepo inside one repo via pnpm workspaces)
penny-worker      Cloudflare Worker for AI edge
penny-shared      Published npm pkg (private): types, schemas (Zod), prompts
                  → consumed by all three above
```

Rationale:
- `penny-shared` as a published private package means **one source of truth for types** without forcing a single megarepo.
- Each app repo has its own CI, its own release cadence, its own deploy target — reduces blast radius.
- All four share Renovate config, lint rules, and commit conventions via a fifth tiny `penny-tooling` repo.

**Alternative considered:** Turborepo monorepo. Faster local DX but slower CI on large trees and all-or-nothing deploys. Rejected for this stage.

---

## 14. Build order (not phased — parallel tracks, all ship before beta)

All tracks start concurrently; gated only by their listed dependencies.

**Track A — Foundations (no dependencies)**
- [ ] Incorporate + EIN + bank account
- [ ] 4 repos scaffolded with CI
- [ ] AWS Organizations + Terraform skeleton
- [ ] Supabase project + base schema migrations
- [ ] Sentry + PostHog + Better Stack + CloudWatch wired
- [ ] Cloudflare Worker hardened: JWT verify, KV cache, spend logging
- [ ] Secrets Manager + rotation policy

**Track B — Identity + membership** (depends on A)
- [ ] Supabase Auth: Apple + Google + email/password + TOTP MFA
- [ ] Face ID in Expo + web WebAuthn
- [ ] RLS policies on all business-scoped tables
- [ ] Share-link creation + token hashing + role enforcement

**Track C — Ledger core** (depends on A)
- [ ] Events table + aggregate root pattern
- [ ] Transactions projection + dual-basis date logic
- [ ] Currency + FX model with OpenExchangeRates sync
- [ ] Soft-delete + hard-delete-with-cert flow

**Track D — Ingestion** (depends on A, C, partner approvals)
- [ ] Plaid OAuth + webhook handler + item sync worker
- [ ] Stripe/Square/PayPal/Venmo/Zelle (via bank)/CashApp
- [ ] Gmail + Outlook OAuth + receipt parsing worker
- [ ] CSV + QBO + Xero import with schema inference fallback
- [ ] Gusto + OnPay + QBO Payroll connectors

**Track E — AI intelligence** (depends on A, C; IRS research input for categorization)
- [ ] Server-side prompt assembly: client sends `{intent, context}` only; Worker resolves prompt file server-side. Client never holds prompt text (security requirement).
- [ ] Intent map + all prompt files (server-side only)
- [ ] Per-intent token budgets (not global 400-token cap)
- [ ] Categorization with Opus + rule proposals
- [ ] Anomaly + duplicate detection
- [ ] Conversational Q&A over user's ledger
- [ ] Memory + rules engine
- [ ] Eval suites wired to CI, strict gate

**Track F — OCR** (depends on A)
- [ ] Veryfi integration
- [ ] Claude Vision cross-check
- [ ] Receipt attachment to transactions
- [ ] "Unreadable" follow-up loop (D75)

**Track G — Tax** (depends on C, E, IRS research)
- [ ] `categories.v1.json` CPA-reviewed
- [ ] Quarterly estimator
- [ ] 1099-NEC candidate tracker + Track1099 integration
- [ ] Sales-tax detector + flagger
- [ ] S-Corp owner's-draw + 1120-S export
- [ ] Schedule C / 1065 / 1120 / 1120-S export packages

**Track H — Invoices + payments** (depends on C, Stripe)
- [ ] Pixel-perfect designer (web + iOS)
- [ ] Send + PDF + email delivery
- [ ] Payment collection via Stripe, Square, PayPal
- [ ] Recurring invoices scheduler
- [ ] Payment plans with installment tracking

**Track I — UI surfaces** (depends on A, B)
- [ ] Mobile-first responsive web (migrate demo screens to TS + shared components)
- [ ] iOS Expo shell with native nav, biometrics, push
- [ ] CPA web view (share-link landing + bulk-approve + /books drill-downs)
- [ ] Invoice designer surface
- [ ] Avatar menu + Memory + Preferences (real data)

**Track J — Support** (depends on A, E)
- [ ] In-app chat threads
- [ ] AI reply with redacted context
- [ ] Founder escalation + APNs

**Track K — Compliance** (depends on all)
- [ ] Internal pen test + remediation
- [ ] Cyber insurance bound
- [ ] Privacy policy + ToS + DPA template (via GC)
- [ ] SOC 2 Type I engagement started

**Gate to invite-only beta:**
- [ ] All tracks green
- [ ] Full eval suite at target thresholds
- [ ] Internal pen test passed
- [ ] Cyber insurance bound
- [ ] First 10 friendly users briefed and onboarded manually

---

## 15. Unit economics instrumentation (since no hard cost cap)

Track from day one so pricing decisions are data-driven:
- **$ AI spend per active user per month** — bucketed by intent and model.
- **$ infra spend per active user per month.**
- **$ vendor spend (Plaid, Veryfi, OCR, FX) per active user.**
- **$ total COGS per user** rolled up; target < 20% of eventual ARPU.
- Weekly cost review in the dashboard.

If COGS trends bad: swap trust-critical-but-not-user-visible calls to Sonnet, tune KV cache TTL up, batch non-urgent intents, renegotiate vendor tiers.

---

## 16. Open items to track

Full detail, checklists, and ownership for each blocker lives in `implementation/`:

| Item | File | Blocks |
|---|---|---|
| IRS research (7 questions, CPA review, `categories.v1.json`) | `implementation/open-items.md` + `BookKeeping/research/solo-freelancer/irs-tax-research.md` | Track E, Track G |
| Legal setup (incorporate, GC, ToS, Privacy Policy, DPAs, cyber insurance) | `implementation/legal-checklist.md` | All real users, Track K |
| Partner applications (Plaid, Intuit, PayPal, Track1099, Discord, Apple, Veryfi, OpenExchangeRates, SOC 2 tool) | `implementation/partner-applications.md` | Track D, F, G, J, K |
| GitHub Packages setup for `penny-shared` + breaking-changes protocol | `implementation/open-items.md` | Track A onward |
| Per-intent AI token budgets (replace 400-token blanket cap) | `implementation/open-items.md` | Track E |
| Global AI circuit-breaker threshold ($ per hour) | `implementation/open-items.md` | Track E |

Additional items not yet in a dedicated doc:
- **Domain confirmation** — confirm `penny.app` or equivalent before any OAuth or email config
- **Trademark** — GC to check USPTO availability for "Penny Books" or variant; don't build brand on an unprotected name
- **Better Stack** — internal uptime monitoring + founder alerts (set up in Track A)

---

*This is the single source of truth for the production build. Update whenever a locked decision changes. Do not re-open Section 1 without explicit CEO sign-off.*
