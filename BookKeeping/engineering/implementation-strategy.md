# Penny — Technology Implementation Strategy
**Version 2 · 21 April 2026**

> This document is the bridge between the v2.2 product spec (86 decisions) and buildable engineering. It answers one question only: **what are we actually building?**
>
> **v2 adds §0.5 — a full CEO decision log from the 21 April implementation Q&A.** 38 engineering decisions locked, with direction-changing ones folded through the sections below.
>
> **What this is:** the translation layer — each major product decision cluster mapped to a concrete engineering shape (services, data, AI, integrations, platform).
> **What this is not:** a tech-stack menu of alternatives, a timeline, or a project plan.
>
> **Companion documents:**
> - `product/spec-brainstorm-decisions.md` v2.2 — 86 locked product decisions (the *what* and *why*)
> - `architecture/system-architecture.md` v4 — system constitution (services, data, security, resilience)
> - `reviews/spec-v2.2-tech-stress-test-apr-2026.md` — pre-build findings, with CEO resolutions folded into this document
> - `engineering/engineering-decisions.md` — tech-stack reference (this doc populates it)

---

## 0. Working constraints — the full picture

| | |
|---|---|
| Build team | Solo Nik + Claude Code |
| Timeline posture | Quality first; no fixed date |
| Product scope | All 86 v2.2 decisions frozen |
| Starting point | Greenfield |
| Mobile framework | Expo / React Native (iPhone + Android + Web in one codebase) |
| AI strategy | Multi-provider, best tool per job |
| Launch shape | Public launch from day one |
| Compliance bar | SOC-2-ready controls at launch; Type I certified in parallel |
| Payments | Stripe Connect Pay Now built in |
| Cloud | AWS (US-only data residency) |
| Data residency | United States (all user financial data) |

Every choice below serves these constraints. Nothing optimises for speed at the cost of trust, and nothing compromises trust for speed.

---

## 0.5 CEO decision log — 21 April 2026 Q&A

38 engineering decisions locked with Nik in this session. Grouped by area. All sections below reflect these.

### Architecture foundations
| # | Decision | Locked |
|---|---|---|
| E1 | Primary sign-in | Apple Sign-In + Google Sign-In (federated via Cognito) + Face ID on returning sessions. Apple mandated if Google offered. |
| E2 | Event store implementation | Single Postgres (Aurora) with append-only `events` table + outbox-pattern projections. No EventStoreDB, no Kafka. |
| E3 | Mobile offline database | WatermelonDB (SQLite under the hood) with custom sync protocol. Owns the offline queue. |
| E4 | PDF engine | HTML + CSS rendered via headless Chromium (Puppeteer) on dedicated Fargate task. Used for invoices and exports. |
| E5 | Disaster recovery posture | Active-Passive warm standby across us-east-1 (primary) and us-west-2 (warm). 30–60 min RTO, near-zero RPO, quarterly failover drill. |
| E6 | Code organisation | Monorepo with Turborepo (`/apps/mobile`, `/apps/web`, `/apps/api`, `/packages/shared`). Shared TypeScript types across all three apps. |
| E7 | Search engine | Postgres full-text + `pg_trgm` extension for fuzzy matching. Revisit OpenSearch only if p99 > 200ms. |
| E8 | OTA updates | Expo EAS Update with 10% staged rollout + auto-rollback on error-rate spike. Native changes still go through stores. |

### AI pipeline
| # | Decision | Locked |
|---|---|---|
| E9 | Claude model strategy | Quality-first per task, cost optimisation later. Opus for trust-critical reasoning (categorisation + confidence, conversational Q&A, anomaly explanations, P&L Q&A). Sonnet for structured mid-complexity (OCR post-processing, vendor normalisation, transaction enrichment). Haiku only where proven (content moderation on free-text notes). |
| E10 | Federated learning | **Full pipeline at launch** (opt-in default OFF, anonymisation, aggregation, training infra all shipped). Training cycle gates on ~500 active users; baseline model behaviour until threshold. Adds ~8 weeks scope. |
| E11 | Tone enforcement at runtime | Two-layer: rule-based checker (banned words, emoji whitelist, spelling) + Claude-based tone classifier (scores response against tone-guide principles). Fail either → regenerate or canned fallback. |
| E12 | Input safety / prompt injection | Three layers: (1) input sanitisation strips known injection patterns, (2) output validation against strict JSON schema, (3) moderation classifier on user input. Amounts never AI-mutable. |
| E13 | Auto-learn categorisation rules | Ask-once pattern: after two confirmed corrections, Penny proposes a rule; Alex opts in; future matches auto-categorise with subtle "Applied your rule" note. Unusual transactions still surface. Rules managed in Preferences → Rules. |

### Integrations
| # | Decision | Locked |
|---|---|---|
| E14 | Stripe Connect account type | Standard accounts. Connect-existing flow is the first option; new-account onboarding inside Penny is fallback. Stripe owns KYC/disputes/payouts. |
| E15 | Plaid products at launch | Transactions + Balance + Auth. Identity deferred to post-launch unless fraud pressure appears. |
| E16 | Plaid Link variant | OAuth Link where bank supports it (Chase, Wells Fargo, etc.); regular Link as fallback. Plaid auto-routes. |
| E17 | Payroll providers at launch | All three per D72 — Gusto + OnPay + QBO Payroll. Confirmed with honest flag: one API shift near launch could force partial-ship decision. |
| E18 | Email receipt ingestion scope | Targeted Gmail/Outlook search against published receipt allowlist (sender domain + subject patterns). Non-matching emails never fetched. Every body-fetch audit-logged, visible to Alex. |
| E19 | Webhook reconciliation | Real-time webhook processing + hourly reconciliation job querying provider "what changed in last 2h?". Missed webhooks caught within the hour. |
| E20 | CPA export formats | PDF + CSV + QuickBooks (.iif/.qbo) + Xero + TurboTax (via QBO interchange — Alex imports QBO file into QuickBooks Self-Employed, TurboTax pulls from QBSE). |
| E21 | 1099-NEC issuance | Full support at launch. Track contractor payments year-round, auto-prompt Alex in January, collect W-9 via email, file with IRS via Track1099 (or equivalent), copy to contractor. |
| E22 | Quarterly estimated taxes | Compute + remind + explain. Penny tracks YTD income−expenses, surfaces estimated quarterly 30 days before each deadline, links to irs.gov/payments. No money movement (aligned with C2). |
| E23 | Sales tax | Detect and flag only at launch. No computation, filing, or nexus tracking. Shown as separate line in P&L and CPA export. |

### Data, currency, accounting
| # | Decision | Locked |
|---|---|---|
| E24 | Historical backfill window | All available up to Plaid's 24-month cap. Show Alex what was retrieved. |
| E25 | Multi-currency | Full multi-currency from day one. US-only launch geography stands. Store original currency + USD equivalent (FX rate at transaction time). Display USD totals with per-currency breakdown. FX gain/loss tracked for IRS reporting. Adds ~2–4 weeks. |
| E26 | Accounting basis | Cash-basis default + accrual-basis toggle in Preferences. Accrual mode requires separate P&L projection and CPA-export mapping. Adds ~3–4 weeks. |
| E27 | Runway scope | All connected accounts by default; Alex can mark any account as "Personal" to exclude. Runway card carries label indicating which accounts are included. Onboarding defaults new accounts to "Business." |
| E28 | Split transactions | "Split" action on approval card opens bottom sheet; 2–N parts with amount + category + note; enforced sum. Splits stored as linked events. |
| E29 | Entity-type diagnostic | "Not sure" option triggers 3-question diagnostic (sole vs partners, one vs two returns, Form 2553 filed). Penny suggests entity type + Alex confirms. Never leaves Alex stuck. |

### Platform & infrastructure
| # | Decision | Locked |
|---|---|---|
| E30 | Analytics / product metrics | PostHog (cloud, US-hosted). Product analytics + feature flags + session replay + experiments in one tool. No PII. |
| E31 | Push notifications | Expo Notifications → APNs (iOS) + FCM (Android). Server owns token registry. |
| E32 | Object storage | S3 + per-user KMS envelope encryption + CloudFront signed URLs (5-min expiry). Applies to receipts, invoices, profile images, exports. |

### Security, safety, compliance
| # | Decision | Locked |
|---|---|---|
| E33 | Encryption depth | Per-user KMS envelope encryption for all financial data (not just SSN/bank numbers). Every read calls KMS → KMS access log. |
| E34 | Cost guardrails | Per-user daily AI spend cap (soft degrade with Penny "give me a moment") + global circuit breaker auto-throttle + alert. Protects from abuse and runaway bugs. |
| E35 | Audit log | Comprehensive (every financial event + auth + permission change + support access + admin action + export + share link), append-only, 7-year retention. Matches IRS audit window. |
| E36 | App-lock timeout | User-configurable in Preferences. Default 5 min. Options: Immediate / 1 / 5 (default) / 15 / Never. |
| E37 | Sensitive-action re-auth | Face ID re-prompt required on: export CPA/tax data, connect/disconnect bank, generate/revoke CPA share link, account deletion (plus email confirmation). Enforced in single auth-gate middleware. |
| E38 | Device security — remote actions | penny.com/security lists all signed-in devices. Alex can remote-sign-out + wipe Penny's local data on next reconnect. Does not wipe the device itself. |
| E39 | Data deletion | 30-day soft delete on cancellation. Account locked immediately, invisible to Alex, restorable via support. Day 30 → permanent hard delete (including backups) + deletion certificate emailed. |
| E40 | Support access to user data | Explicit per-session grant only. Alex clicks "Grant support access," time-limited 30-min session, every access visible to Alex in audit trail. No standing access. |

### Support, operations, CPA collaboration
| # | Decision | Locked |
|---|---|---|
| E41 | Support model | Private 1-on-1 Discord channel per user + in-app chat widget + AI-first (Claude with Alex's account context) + human escalation via @mention. 24/7 AI availability, humans async. |
| E42 | CPA access | Expiring share link generated by Alex. Default 30-day expiry, configurable. Web-only, read-only by default, optional "comment/suggest" mode. No CPA-side install. |
| E43 | Bank re-auth flow | Silent 2-hour retry on Plaid failure; then Penny-authored notification; Plaid Link re-auth pre-filled on tap. Status indicator in Tab 1 until fixed. No raw error codes. |

---

## 1. The stack in one page

| Layer | Choice | Why |
|---|---|---|
| Language everywhere | **TypeScript** | One language across mobile, web, backend. Solo-plus-Claude leverage is highest when the whole codebase is one type system. |
| Mobile + Web | **Expo (React Native) + Next.js** | One codebase covers iOS, Android, and web components. Native modules for Face ID, offline SQLite, camera, push — all first-class in Expo. Next.js handles the sit-down-review web app. |
| Backend runtime | **Node.js (TypeScript) on AWS Fargate** | Managed containers, scales per service, no server maintenance. Keeps backend in TypeScript for shared types with the client. |
| Database | **Amazon Aurora PostgreSQL** | Financial-grade reliability, strong constraints, RLS, point-in-time recovery, multi-AZ. Cash-basis ledger lives here as append-only event log + read projections. |
| Event bus | **AWS EventBridge + SQS** | Async service-to-service. EventBridge for event routing, SQS FIFO for ordered consumption, DLQ for dead letters. No services share a database. |
| Object storage | **Amazon S3 (+ KMS)** | Receipts, voice recordings, export files. Every object encrypted with per-tenant KMS keys. Signed URLs only. |
| AI — reasoning | **Anthropic Claude** via Bedrock or direct API | Categorization, conversational Q&A, Penny's voice, confidence reasoning. Strong structured-output reliability, lowest hallucination rate for financial text. |
| AI — receipt OCR | **Google Document AI (Invoice Parser)** | Purpose-built for receipts and invoices. Field-level extraction (vendor, amount, date, tax, line items). Outperforms generic vision models on OCR-specific tasks. |
| AI — voice | **Deepgram Nova** | Industry-best latency and accuracy for conversational voice-to-text. Streaming support for real-time capture. |
| AI router | **Thin internal abstraction** | One `AIClient` interface. Per-task router delegates to provider. Swappable; no vendor lock beyond the interface. |
| Banking | **Plaid** | Transactions, Balance, Auth, Identity products. ACH-era standard. US-first. |
| Payments (Pay Now) | **Stripe Connect (Standard accounts)** | Alex holds her own Stripe account; Penny orchestrates invoicing and payouts. Card + ACH. Installment plans via `payment_schedule`. |
| Payroll | **Gusto + OnPay + QBO Payroll** | All three at launch per D72. Each via native OAuth / partner API. Unified internal payroll-event schema. |
| Email ingestion | **Gmail + Outlook via OAuth** | Full-readonly scope (see §5). Post-fetch filter against published allowlist. Full audit log. |
| Peer payments | **Square Business API (CashApp), PayPal partner API (Venmo), bank feed (Zelle)** | Per D77. Zelle accuracy gap is disclosed to Alex per M8. |
| Push | **Expo Notifications → APNs + FCM** | One API for both platforms. |
| Auth | **AWS Cognito + Apple Sign-In + Google Sign-In + Expo LocalAuthentication (Face ID)** | E1. Apple and Google federated via Cognito identity pools. Apple Sign-In required on iOS because we offer Google. Face ID on every returning session (timeout per E36). |
| Offline sync | **WatermelonDB on SQLite** | E3. Offline queue + per-device local ledger cache + custom sync protocol with idempotency and explicit conflict rules. |
| PDF engine | **HTML + CSS → headless Chromium (Puppeteer) on dedicated Fargate** | E4. Used for invoices (pixel-perfect per D80) and exports (Schedule C / 1120-S PDFs). Shared templates between web preview and PDF output. |
| Search | **Postgres full-text + `pg_trgm`** | E7. Fuzzy matching + prefix + ranked relevance. Revisit OpenSearch only if p99 > 200ms or cross-user search added. |
| Monorepo tooling | **Turborepo** | E6. Shared types force cross-app contract safety. One CI pipeline. |
| OTA updates | **Expo EAS Update, staged rollout + auto-rollback** | E8. 10% canary, auto-revert on error-rate spike. Critical fixes ship in minutes. |
| Disaster recovery | **Active-Passive warm standby (us-east-1 → us-west-2)** | E5. 30–60 min RTO, continuous logical replication, quarterly failover drill. |
| Cost guardrails | **Per-user AI spend cap + global circuit breaker** | E34. Soft-degrade via Penny fallback when cap hit; global cap pages Nik. |
| 1099 filing | **Track1099** (or equivalent IRS-authorised filer) | E21. W-9 collection + e-file + contractor copy. |
| Support (user-facing) | **Discord (bot-managed per-user private channel) + in-app chat widget** | E41. Claude-powered bot with account context; humans escalate via @mention. |
| Secrets | **AWS Secrets Manager + KMS (per-user envelope keys)** | E33. Per-user KMS envelope encrypts all financial data at rest. |
| Observability | **CloudWatch + Sentry + PostHog** | E30. Logs/metrics/alerts (CloudWatch), error tracking (Sentry), product analytics + feature flags + session replay (PostHog, US-hosted). No PII in any of the three. |
| CI / CD | **GitHub Actions → AWS** | E6 monorepo. Every PR runs type-check, unit tests, integration tests, the 5 AI eval suites, and a security lint. No manual deploy to prod. |

---

## 2. Service decomposition — how arch v4's 5 services become buildable

Architecture v4 specifies five services. Each below names what it owns, the concrete AWS surface, and the v2.2 decisions it must implement.

### 2.1 Ingestion Service

**Owns:** Every raw financial event from every source. Plaid webhooks, Stripe/Square/PayPal webhooks, payroll webhooks, receipt uploads (photo + email + forwarded), voice captures, manual entries, historical-import jobs. Immutable raw store. Idempotency. Pending/settled lifecycle.

**Concrete shape:** Fargate service behind API Gateway for direct uploads. Webhook receivers are thin Lambda functions that acknowledge in <200ms, persist to S3, and publish an `event.received` message to EventBridge. Deduplication via a DynamoDB idempotency index keyed on `provider + provider_event_id`.

**Implements:** D5 (pending transactions), D6 (materiality threshold on settlement — **new event, not a mutation**), D7 (pre-auth waiting), D10 (receipt/bank overlap), D11 (Stripe/bank overlap), D18 (disconnection detection), D69/D77 (peer-payment inbound), D74 (email-receipt ingestion — see §5), D81 (offline capture replay), D84 (historical-import engine with CSV schema inference).

**Pending/settled state model (H5 resolution):** Transaction entity gains two orthogonal states:
- `bank_state`: `pending | posted | refunded | disputed`
- `enrichment_state`: `raw | enriched | pending_review | auto_approved | confirmed | corrected`

D6's materiality threshold fires on the arrival of a `TransactionSettled` event and compares the settled amount to the pending amount of the same provider event ID. Below threshold — silent update (new event). Above — re-surfacing event. Auto-approval only fires on `posted` transactions, never `pending`.

### 2.2 Intelligence Service

**Owns:** Vendor normalization, categorization, confidence calibration, split inference, anomaly detection, amount-anomaly re-prompts, structured-output enforcement, prompt-injection defence.

**Concrete shape:** Fargate service consuming the `transaction.ingested` stream from EventBridge. Per-event pipeline:

```
transaction.ingested
   → vendor normalization (rules + Claude fallback)
   → vendor memory lookup (VendorStats projection)
   → amount anomaly check (M1: rolling median + MAD, min sample 3)
   → known-vendor auto-approval | unknown-vendor categorization
   → confidence calibration (per-category curve)
   → structured-output validation (JSON schema, category in taxonomy)
   → publish transaction.enriched
```

**Implements:** D3 (cold start with ≥1 signal), D21 (confidence tiers — starting thresholds per M2: ≥0.90 high / 0.70–0.90 medium / <0.70 honest-uncertain), D22 (personal/business learning), D25 (never guess with no signal — hard-enforced by the confidence floor), D26 (mixed-vendor Amazon case), D27 (split transactions), D32 (auto-confirm expenses, never income), D34 (OCR/voice prevention + correction), D35 (every action is a learning signal), D76 (variable recurring + 2× MAD anomaly).

**AI model binding:** categorization and conversation → Claude. OCR → Document AI. Voice → Deepgram. Each call goes through the `AIClient` abstraction so providers are swappable.

**Prompt-injection defence (arch v4 carries through):** transaction text is always passed as structured typed fields, never concatenated into the instruction prompt. AI output is validated against the taxonomy before acceptance. Amount fields cannot be altered by the AI — the bank figure is authoritative.

### 2.3 Core API Service

**Owns:** The ledger. The conversation thread. P&L. Invoices. Search. Natural-language Q&A orchestration (Claude generates the language; the *answer* is from the ledger). Undo. Corrections. Multi-user / CPA access.

**Concrete shape:** Fargate service behind API Gateway. REST + WebSocket (API Gateway v2 for real-time push). Writes go to the event log; reads hit read projections. CQRS boundary is strict — no endpoint reads the event log directly.

**Implements:** D13/D15/D32 (one-tap income celebration vs. silent expense auto-approval), D14 (partial invoice payments), D16 (refund/reversal treatment), D17 (foreign currency — expanded per E25 to full multi-currency), D23 (personal activity lines in the thread), D29 (edit flow with category-relevant recommendation), D33 (retroactive corrections), D40 (CPA correction as ground-truth — via H1 multi-user model), D47/D48/D64/D65/D66/D68 (My Books: 90-day trailing, lumpy-is-normal language, cash runway, audit-readiness score), D49–D51 (thread window + search + Q&A), D54/D55 (year-end + exports), D56 (CPA share link and CPA Penny view — via H1 multi-user model), D67 (weekly compliance batch), D71 (data portability on cancel), D78–D80 (recurring invoices + payment plans + pixel-perfect invoicing).

**Added per 21 Apr Q&A:** E13 ask-once categorisation rule engine · E21 1099-NEC year-round tracking + January prompt flow · E22 quarterly estimated tax compute surface · E23 sales tax detection and flagging · E26 cash/accrual basis toggle with dual projections · E27 runway per-account business/personal flagging · E28 split transaction composer · E29 entity-type diagnostic (3-question flow, rerun-able from Preferences) · E42 CPA expiring share link (default 30-day, configurable, read-only / comment modes).

**Multi-user model (H1 resolution) — new architectural primitive:**
- `User`: one human. Has email, auth credentials, phone, device registry.
- `Business`: one Penny tenant. Every financial entity has `business_id`.
- `Membership(user_id, business_id, role)`: role ∈ `{owner, accountant, viewer}`.
- `ShareLink(business_id, role, token, expires_at, revoked_at)`: short-lived, scope-limited, revocable.

RLS at Postgres: every row-read is gated by `business_id ∈ (SELECT business_id FROM memberships WHERE user_id = current_user_id)`. Role enforced at the service layer; any corrective write by an `accountant` is logged as a distinct event type with the accountant's user_id as the actor.

### 2.4 Notification Service

**Owns:** Delivering the right message at the right time through the right channel. Push, email, in-app. Invoice reminders to Alex's clients (D52). Delivery fallback chain by priority (arch v4 already specifies routine/important/critical).

**Concrete shape:** Fargate service consuming notification events from EventBridge. Push via Expo Notifications → APNs/FCM (E31). Email via AWS SES from an authenticated subdomain (`alerts.penny.app`) with SPF/DKIM/DMARC configured from day one. Invoice reminders to clients from a per-Alex authenticated sender alias (`invoices@alex-business.penny.app`) per arch v4.

**Support surface (E41):** Every Alex gets a private Discord channel provisioned on signup (Penny-operated server, channel gated to Alex + support team + bot). A Claude-powered bot with Alex's account context answers 24/7; `@nik` or keyword ("talk to human") escalates. In-app chat widget is the parallel surface for users who don't open Discord. Both surfaces back to the same conversation store in `support_threads_v1` projection.

**Implements:** D42 (proactive outreach triggers — the frozen six per H2), D43 (override with "was that helpful?"), D44 (shame-free backlog summary), D46 (calm tone under stress), D52 (overdue invoice reminder drafts), D61/D63 (shame-free re-entry language — tone-guide entries land here), D62 (no streaks, hard-enforced by absence from notification codebase), D75 (active follow-up on unreadable receipts), D86 (adaptation-floor delivery configurable).

**Adaptation-floor MVP list (H2 resolution) — frozen:**
1. Unusual income (>2× rolling median inbound)
2. Overdue invoices past payment terms
3. Quarterly tax deadlines (30 / 7 / 1 day) — surfaces the E22 computed estimate
4. Bank disconnection (E43 silent-retry window passed)
5. W-9 missing for contractor crossing 1099-NEC $600 threshold — feeds E21 January filing
6. S-Corp payroll pay-date with insufficient cash

Each floor signal is stored as a row in a `floor_signals` config table; new signals add as new rows without code changes.

### 2.5 Export Service

**Owns:** CPA-ready exports. Read-only. Cannot write to the ledger.

**Concrete shape:** Fargate service with adapter pattern per format. Each adapter is a pure function `(ledger_projection, business_meta) → file_bytes`. Generation is async (SQS job) for any export > 1 MB; "immediate" in D71 means *initiated immediately*, with a signed S3 URL delivered via email + push within minutes.

**Launch adapters:**
- Schedule C PDF (sole prop / single-member LLC)
- 1120-S PDF (S-Corp) — per D72
- Full transaction CSV
- QuickBooks-compatible export (QBO format)
- Xero-compatible export (CSV)

**TurboTax / H&R Block path (C4 open):** TurboTax Self-Employed and H&R Block Self-Employed do not have third-party direct-import file formats. The engineering path is QBO-as-interchange: Penny exports QBO → Alex imports into QBSE (Intuit) → TurboTax imports from QBSE. In-product copy explains this in one line. For H&R Block, the Schedule C PDF is read-and-paste. Strategy doc treats this as the best available path; Nik may revise the marketing claim in D55. **Flagged for final CEO sign-off.**

---

## 3. Data architecture

### 3.1 Event log (append-only, immutable)

One table: `events (event_id, business_id, aggregate_type, aggregate_id, event_type, schema_version, occurred_at, recorded_at, actor_user_id, payload_jsonb)`.

- **Never mutated. Never deleted.** Soft-delete is itself an event.
- **Schema versioned from event #1.** New fields additive only. No rewrites.
- **Ordered by `occurred_at`, not `recorded_at`** — out-of-order webhooks are normalised on read.
- **Stream to durable storage (S3) continuously** via logical replication — this is the RPO-near-zero guarantee.

### 3.2 Read projections

Per arch v4, every read hits a projection, never the event log. Projections are rebuilt-able from events any time.

Launch projections:
- `thread_v1` — conversation thread per business, windowed per D49
- `pnl_v1` — P&L by period (daily, monthly, 90-day trailing, 6-month trailing, custom)
- `vendor_stats_v1` — per-vendor: canonical name, rolling median, rolling MAD, sample count, last confirmed category, auto-approval eligibility (M1)
- `invoice_status_v1` — outstanding, paid, overdue, payment plans
- `audit_readiness_v1` — compliance completeness, receipts attached, confidence weighted mean, gaps (M3 formula)
- `cash_runway_v1` — business-account balance ÷ trailing 90-day business-expense average (M9 default — confirm with Nik)
- `search_index_v1` — Postgres full-text + trigram initially; move to OpenSearch when ledger > 10k transactions per business

### 3.3 Amounts as integers in cents

Per arch v4. Banker's rounding for split-derived fractional cents.

### 3.4 Accounting basis — cash + accrual toggle (E26)

Cash-basis is the default. Alex can switch to accrual in Preferences; the toggle flips a per-business `accounting_basis` flag and triggers rebuild of the P&L projection using the accrual rules.

- **Cash basis:** income recognised when received, expense when paid. Default.
- **Accrual basis:** income recognised when invoiced, expense when billed. Requires separate `pnl_accrual_v1` projection that joins against `invoices` and `bills`.

Switching basis is a discrete, logged event. Exports clearly label which basis they were generated under. CPA share link surfaces the current basis at the top of every report.

### 3.5 Multi-currency (E25)

Every transaction stores:
- `original_currency` (ISO 4217)
- `original_amount_cents` (native cents in original currency)
- `usd_amount_cents` (converted to USD cents)
- `fx_rate` (rate applied)
- `fx_rate_source` (`bank_reported` | `penny_computed`)
- `fx_rate_timestamp`

FX rates when not bank-reported come from a daily rate feed (OpenExchangeRates or equivalent), stored in an `fx_rates` table keyed by date + currency pair. Re-computation uses the rate at transaction time, not current. P&L aggregates in USD with per-currency breakdown available. Realised FX gain/loss tracked as a separate ledger event type for IRS reporting.

Launch geography remains US-only (settled decision stands). Multi-currency addresses US freelancers receiving foreign payments, not international expansion.

---

## 4. AI pipeline — multi-provider, eval-gated

### 4.1 Provider assignments (E9 — quality-first per task, cost optimisation later)

| Workload | Provider | Why |
|---|---|---|
| Transaction categorisation (trust-critical) | **Claude Opus** | Highest accuracy; Alex's books correctness depends on it. Cost-optimise only after eval data proves Sonnet matches. |
| Conversational Q&A (Penny's voice) | **Claude Opus** | Reasoning + tone consistency; never compromise on the response Alex sees. |
| Anomaly reasoning (plain-English explanations) | **Claude Opus** | These are the moments Penny earns trust; no shortcuts. |
| P&L Q&A ("how much did I spend on travel?") | **Claude Opus** | Factual correctness must be unimpeachable. |
| Vendor normalisation | **Claude Sonnet** | Structured task with clear signal; Sonnet evaluated sufficient. |
| OCR post-processing (cleanup of Document AI output) | **Claude Sonnet** | Structured transform task. |
| Transaction enrichment (merchant category, location tagging) | **Claude Sonnet** | Structured pattern. |
| Tone-guide classifier / output validation | **Claude Haiku** | High-volume, narrow classification; Haiku proven. |
| Content moderation on user free-text notes | **Claude Haiku** | High-volume safety check. |
| Receipt OCR (field extraction) | **Google Document AI Invoice Parser** | Purpose-built, best-in-class accuracy. |
| Voice capture | **Deepgram Nova** | Best real-time latency + accuracy for conversational speech. |
| Confidence calibration | In-house (no provider) | Track stated confidence vs. actual accuracy per category; apply learned correction. |

Every assignment above is a starting choice. Moving a task from Opus to Sonnet (or vice versa) requires green evals on the new model for that specific task before it ships.

### 4.2 Routing abstraction

One interface: `AIClient.execute(task, inputs) → structured output`. The router maps `task` to provider. Changing a provider means changing the router, not every caller.

### 4.3 Eval gate — no model ships without green

Per arch v4, five eval suites must all pass. The five suites are rewritten for v2.2 and solopreneur-specific (Nik's instruction 21 Apr 2026):

| Suite | Scope | Status |
|---|---|---|
| 01 Transaction Intelligence | Categorization accuracy, confidence calibration, vendor normalization, split inference | Requires rewrite — solopreneur-specific, must include S-Corp cases |
| 02 Conversational Q&A | Retrieval accuracy, arithmetic correctness, hallucination prevention, tone adherence | Requires rewrite |
| 03 Data Capture | Receipt + invoice OCR field extraction, amount/date accuracy, document quality handling | Placeholder; requires full build |
| 04 Financial Computation | P&L totals, Schedule C aggregation, 1120-S aggregation, running balances, period comparisons | Placeholder; requires full build — highest priority (wrong numbers destroy trust) |
| 05 Anomaly Detection | Amount anomaly, transfer detection, duplicate detection, pattern shifts | Placeholder; requires full build |

**The eval rewrite is a launch prerequisite (C3 resolution) — no Intelligence Service code ships until the rewrite completes and all five suites are green against the test set.**

### 4.4 Confidence calibration pipeline

Every user correction is a signal. Per-category, per-vendor-type calibration curves are maintained on a rolling basis. The *calibrated* score is what the threshold applies to — not the raw model output. Thresholds start at the M2 defaults (0.90 / 0.70) and tune with data.

### 4.5 Structured-output enforcement

Every AI call that produces data returns JSON matching a strict schema. Any output outside the schema fails the call and the transaction is held for human review. Categories must map to entries in `categories.v1.json` (C3 prerequisite).

---

## 5. Security and compliance

### 5.1 SOC-2-ready controls at launch (Nik's answer)

Every SOC-2 control in place from day one; audit runs in parallel so Type I certification lands as soon as possible after public launch.

- **Access controls:** Cognito + MFA required for all internal (admin) access. Least-privilege IAM roles per service. No shared credentials.
- **Audit logging:** CloudTrail enabled for every AWS action. Application audit log (append-only Postgres table + S3 export) for every state-changing action. Both are separate from application logs.
- **Encryption:** AES-256 at rest (KMS), TLS 1.3 in transit. Field-level encryption on bank account numbers, SSNs. Per-tenant KMS keys for S3 objects.
- **Vendor management:** Every third-party (Plaid, Stripe, Claude, Document AI, Deepgram, Gusto, OnPay, QBO Payroll, Square, PayPal, Deepgram, Expo, Sentry, PostHog) has a signed DPA, a data-flow diagram, and a documented breach-notification path.
- **Incident response:** Defined runbook. On-call rotation (Nik + one backup). Post-mortems on every P0/P1.
- **Change management:** Every production deploy via CI. No manual changes. Infrastructure as code (Terraform + CDK).
- **Risk assessment:** Quarterly. Written register of risks, owners, mitigations.

### 5.2 Zero-trust service-to-service

Every inter-service call authenticated with IAM + short-lived tokens. The Notification Service cannot read the ledger. The Export Service cannot write. Boundaries enforced at the IAM + VPC layer, not just in code.

### 5.3 Row-Level Security

Every Postgres row with a `business_id` column has an RLS policy. Policy is: *current user's memberships must include this business_id, and the role must allow the operation.* A service-layer bug cannot leak data — Postgres itself refuses.

### 5.4 Credential handling

Plaid access tokens, Stripe OAuth tokens, payroll OAuth tokens, Gmail/Outlook OAuth tokens → AWS Secrets Manager, encrypted with per-tenant KMS keys, never in the app database, never in code, never in logs. Rotation schedule: tokens refresh per provider cadence; secrets rotation quarterly.

### 5.5 Face ID + device trust (H3 + H4 + E36 + E37 + E38 resolution)

- **Face ID cadence:** required on cold launch. Re-auth after background timeout; default 5 minutes; user-configurable in Preferences to Immediately / 1 / 5 (default) / 15 / Never (E36). Always required before sensitive actions: export CPA/tax data, connect/disconnect bank, generate/revoke CPA share link, account deletion (E37). Sensitive-action list is enforced in a single middleware — not sprinkled across features. Account deletion additionally requires email confirmation.
- **Remote wipe (E38):** clears Penny's local data (WatermelonDB contents, offline queue, Keychain items) on a target device, triggered from penny.com/security from another authenticated device. On next device-online, Penny wipes its own local data. Does not attempt device-level wipe.
- **Device trust:** new device requires email confirmation + Face ID enrollment before first use. Stored in `user_devices` table with last-seen and trust status. "Sign out all devices" invalidates all device records in one action.

### 5.6 Email ingestion privacy posture (C1 resolution)

Per Nik's direction: `gmail.readonly` / `Mail.Read` scope. Full inbox access technically available to the server. Scope is restricted *by policy and code*, not OAuth scope.

Policy-level guarantees:
- Server never stores the content of a non-matching message.
- Receipt-allowlist filter runs before body is read into memory; if no match, the message is not fetched.
- Every body-fetch is audit-logged to a per-user log viewable in Connect → Preferences.
- Privacy disclosure at OAuth consent reads: *"Penny receives access to your mail, but only reads messages matching our published receipt allowlist. Every access is logged and visible to you."*
- **General Counsel review required before any code ships** (per D74's own guardrail).

### 5.7 Prompt-injection defence (E12 — three-layer)

1. **Input sanitisation:** strip known prompt-injection patterns from receipt OCR text, email bodies, and user free-text before the data becomes part of any prompt. Passed to AI as typed data fields, never concatenated into instruction prompts.
2. **Output validation:** every AI call returns JSON matching a strict schema; any output outside schema fails the call, transaction held for review, tone-guide fallback for conversation.
3. **Moderation classifier:** Claude Haiku runs on user free-text inputs before they enter the thread; flagged content sanitised or rejected.

Amounts are never AI-mutable — bank figure is authoritative. Category output must map to `categories.v1.json`.

### 5.8 Cost guardrails (E34)

- **Per-user daily AI spend cap.** Set an order of magnitude above normal usage. Exceeded → non-critical AI calls soft-degrade (Penny says "give me a moment") while approvals and confirmations continue. Cap is stored per-user and overridable by support.
- **Global circuit breaker.** If total AI spend crosses $X/hour, non-critical paths auto-throttle and Nik is paged. Stops runaway bugs and abuse.
- **Budget alerts.** AWS billing + provider billing → CloudWatch alarms at 50% / 75% / 90% of monthly budget.

### 5.9 Data deletion lifecycle (E39)

1. **User initiates deletion** (requires re-auth per E37 + email confirmation).
2. **T0:** account locked, all sessions invalidated, books disappear from Alex's view, push disabled. Internal state: `soft_deleted_at = now`.
3. **T0 → T+30 days:** restore possible via support (who calls the E40 explicit-grant flow into the soft-deleted account).
4. **T+30:** hard-delete job fires. Deletes: event log rows, projections, S3 objects, Secrets Manager entries, Discord channel, Stripe Connect disconnection, Plaid item removal, payroll-integration revocation. Audit log entries for the deletion retained per E35 (7 years) with PII redacted.
5. **Deletion certificate emailed** to the email on file at T+30, signed by a service key.

### 5.10 Support access to user data (E40)

- **No standing access.** A support agent's account cannot read any user's data by default.
- **Per-session grant.** Alex clicks "Grant support access" in Connect → Preferences → Support. Generates a time-limited token (30-min default, Alex can set 5/15/30/60 or revoke immediately). Token is scoped to a specific support agent.
- **Audit visibility.** Every read performed during the session appears in Alex's audit log (Preferences → Privacy → Audit log). Includes agent identity, time, what was viewed.
- **Automatic revocation** at session end, on Alex's manual revoke, or after 30 min.
- **Break-glass:** no override. If Alex is unreachable and support needs access for a compliance-mandated action, a separate break-glass workflow requires two senior-admin approvals and is logged to a separate, immutable audit stream visible to Alex when she returns.

### 5.11 Audit log retention (E35)

Append-only `audit_log` table (write-only indexes, no UPDATE/DELETE grants at Postgres role level) + nightly export to S3 Object Lock bucket with 7-year retention lock.

**Logged:** every financial event, auth event, permission change, data access by support, admin action, export generated, share link created/used, rule created/deleted, entity-type change, accounting-basis toggle, device trust event.

**Not logged (kept out to respect PII boundaries):** raw email body content, raw voice transcripts (only final transcript persisted), receipt image binary content (only hashes and extraction results).

---

## 6. External integration inventory

| Integration | Purpose | Auth | Webhook / Poll | Notes |
|---|---|---|---|---|
| Plaid | Bank transactions, balance, account health | OAuth via Plaid Link | Webhook | Token health monitored; refresh silently |
| Stripe | Payment processor feed (existing Alex Stripe) | OAuth | Webhook | Reconciliation job runs daily |
| Stripe Connect | **Pay Now on invoices** (launch scope) | Standard account OAuth | Webhook | `payment_schedule` for D79 payment plans |
| Square Business | CashApp per D77 | OAuth | Webhook | |
| PayPal | Venmo per D77, also PayPal payments | OAuth partner app (Venmo gated) | Webhook | Venmo application gating flagged; path is partner API |
| Gusto | Payroll ingestion (S-Corp) | OAuth | Webhook | |
| OnPay | Payroll ingestion (S-Corp) | OAuth | Webhook | |
| QBO Payroll | Payroll ingestion (S-Corp) | Intuit developer partner OAuth | Webhook | Requires Intuit partner approval |
| Gmail | Email receipt ingestion per D74 | OAuth `gmail.readonly` | Pub/Sub push | Allowlist filter pre-fetch; audit logged |
| Outlook | Email receipt ingestion per D74 | OAuth `Mail.Read` | Graph webhook | Same pattern as Gmail |
| Google Document AI | Receipt OCR | Service-account API key | Sync API | |
| Anthropic Claude | Categorization, conversation | API key via Secrets Manager | Sync API | |
| Deepgram | Voice-to-text | API key | Streaming API | |
| APNs + FCM | Push notifications | Via Expo | - | E31. Server owns token registry. |
| AWS SES | Transactional email + invoice reminders | IAM | - | Authenticated subdomain, SPF/DKIM/DMARC |
| Track1099 (or equivalent) | 1099-NEC e-filing with IRS | API key | Sync + webhook | E21. Collects W-9, files with IRS, sends contractor copy. |
| Discord | Per-user support channel + bot | Bot token + OAuth | Webhook (Gateway) | E41. Penny-operated server, private channels per user, Claude-powered bot. |
| OpenExchangeRates (or equivalent) | Daily FX rates for multi-currency | API key | Poll | E25. Rates cached daily; per-transaction rate stored at event time. |
| Sentry | Error tracking (mobile + backend) | DSN via Secrets Manager | - | No PII in payloads. |
| PostHog | Product analytics + feature flags + session replay | Project key | Sync | E30. US-hosted. No PII. Event taxonomy centralised. |

**Zelle:** no API. Bank-feed parsing only per D77. Accuracy gap disclosed to Alex on first Zelle inbound (M8).

---

## 7. Mobile architecture (Expo / React Native)

- **State management:** Zustand (lightweight stores) + React Query (server-cache + optimistic UI).
- **Offline queue:** SQLite via `expo-sqlite` + WatermelonDB for sync semantics. Queue is a first-class entity — every capture gets a local UUID, flows to the server on reconnect, and is reconciled via idempotency.
- **Camera:** `expo-camera` for receipt capture. Image quality pre-check (blur detection, resolution) before upload.
- **Voice:** `expo-av` for capture, streamed to Deepgram.
- **Face ID:** `expo-local-authentication`. Policy enforced in a single auth-gate component.
- **Secure storage:** `expo-secure-store` for Keychain items. Session tokens, device trust flag.
- **Push:** Expo Notifications. Token refresh handled server-side.
- **Real-time thread updates:** WebSocket via API Gateway v2. Reconnect with exponential backoff.
- **Offline status UX:** quiet "offline — will sync" banner per D81. Never blocks capture.

**Tab structure (per app-spec v1.2 + M5 resolution):**
- **Tab 1 — Penny:** first-open state is the D73 status view (numeric summary + active floor signals). One gesture down reveals the conversation thread with all activity lines per D23.
- **Tab 2 — Add:** capture bottom sheet (photo / voice / manual).
- **Tab 3 — My Books:** P&L, runway, audit-readiness, invoices, search.
- **Tab 4 — Connect:** accounts, preferences, device management, CPA share link, cancel/export.

---

## 8. Web architecture (Next.js)

- **Next.js App Router** for the sit-down-review surface.
- **Same REST API** as mobile. No duplicated backend.
- **Component strategy:** Tailwind + shared design tokens with mobile. `react-native-web` is not used globally (different interaction models), but design-system primitives (colour, typography, spacing) are shared.
- **Web-specific capabilities:** bulk edit, advanced filters, multi-period P&L comparison, CPA share-link landing page (read-only Penny view).
- **Auth parity:** same Cognito session, seamless cross-device per arch v4.

---

## 9. Observability and quality

- **Logs:** CloudWatch, JSON-structured, no PII. Log volumes sampled for cost; every error gets a dedup key.
- **Errors:** Sentry — both mobile and backend. Alerts on new error fingerprints, error rate spikes, crash-free-sessions dropping below 99.5%.
- **Metrics:** CloudWatch dashboards per service. Key SLOs: API p95 latency, event-bus lag, AI-provider error rate, auto-approval vs. review-card ratio, correction rate per category.
- **Product analytics:** PostHog, US-hosted. Event taxonomy defined once in a central `events.ts` — no ad-hoc events. No PII.
- **AI eval CI:** every model / prompt change triggers all five eval suites. PR cannot merge without green. D59's self-evaluation metrics (correction rate, eval suite pass, return-after-gap) surface on an internal dashboard.

---

## 10. Sequencing spine — what blocks what

No dates. Just dependencies.

**Phase 0 — Prerequisite artefacts (nothing else can begin)**
- `categories.v1.json` — the IRS taxonomy file, CPA-reviewed (blocks Intelligence + Export)
- Evals rewrite — five suites, solopreneur + v2.2 + S-Corp (blocks any AI model ship)
- Architecture v4.1 extension doc — multi-user / role / share-link + pending-settled lifecycle + VendorStats shape + accrual-projection shape (E26) + multi-currency schema (E25) + federated-learning data model (E10) (blocks Core API and Intelligence)
- Federated-learning privacy/architecture design doc (E10) — anonymisation strategy, aggregation boundaries, opt-in storage, training-cycle gating at 500 users
- `engineering-decisions.md` populated with §1's stack choices + §0.5's decision log (blocks any code)

**Phase 1 — Platform foundation**
- AWS account, Cognito, Aurora, EventBridge, S3, Secrets Manager, KMS, CDK/Terraform
- Shared TypeScript types, monorepo, CI pipeline
- Auth (Apple Sign-In + Google Sign-In via Cognito + Face ID via Expo LocalAuthentication) per E1

**Phase 2 — Ingestion Service + Intelligence Service (parallel-able)**
- Plaid integration, receipt upload, manual entry, offline queue replay
- Claude router, Document AI, Deepgram, calibration harness
- Blocked by Phase 0 artefacts

**Phase 3 — Core API + CQRS projections**
- Event log, thread projection, vendor memory, P&L projection, search
- Multi-user + memberships (per H1)

**Phase 4 — Mobile app v1**
- Tab 1 status + thread (M5), Tab 2 Add, approval card (with split variant), confirm/edit/undo
- Face ID + device trust
- Offline capture

**Phase 5 — Notification Service + adaptation floor**
- Push, email, fallback chain
- The six frozen floor signals

**Phase 6 — Invoicing + Stripe Connect Pay Now**
- Invoice entity, pixel-perfect PDF generator, Stripe Connect onboarding
- Recurring invoices (D78), payment plans (D79 — plan-level consent per M4)

**Phase 7 — Export Service**
- Schedule C PDF, QBO export (.iif/.qbo), CSV, Xero export, TurboTax-via-QBO interchange path
- CPA expiring share link (E42) with read-only / comment modes
- 1120-S adapter lands with S-Corp
- 1099-NEC filing integration via Track1099 (E21)

**Phase 8 — S-Corp full scope (per D72)**
- Payroll ingestion (Gusto + OnPay + QBO Payroll — all three per E17)
- Owner's-draw as first-class ledger category
- 1120-S export
- S-Corp AI eval cases green

**Phase 9 — Tax-surface completion**
- Quarterly estimated-tax compute + reminder (E22)
- 1099 January workflow (W-9 collection flow, contractor portal)
- Accrual-basis projection + toggle (E26)
- Multi-currency projection and FX gain/loss ledger events (E25)

**Phase 10 — Support surface**
- Per-user Discord channel provisioning (E41) + Claude-powered bot with account context
- In-app chat widget
- Support audit trail + per-session grant workflow (E40)

**Phase 11 — Web app**
- Next.js surface for sit-down review + CPA share-link landing + penny.com/security device management
- Penny.com/support as fallback chat surface

**Phase 12 — Federated-learning pipeline (E10 — infrastructure only at launch)**
- Anonymisation + aggregation + training-cycle infra
- Opt-in stored and honoured from day one; training cycle gated on 500-user threshold
- Eval-gate extension for model-update rollouts

**Phase 13 — Compliance certification**
- SOC 2 Type I audit (controls in place since Phase 1)

Phases overlap where dependencies allow. Phase 8 can begin as soon as Phase 3 stabilises. Phase 10 can begin as soon as Phase 5 stabilises. Phase 12 ships the pipeline at launch but the training cycle activates post-launch.

---

## 11. Stress-test findings — resolution table

All findings from `reviews/spec-v2.2-tech-stress-test-apr-2026.md` folded in. Resolutions are reflected throughout this doc.

| # | Finding | CEO answer (21 Apr) | Lands in |
|---|---|---|---|
| C1 | Gmail scope vs. "never reads personal email" | Full readonly + strong data-handling promise | §5.6 |
| C2 | "Never move money" vs. Stripe Connect Pay Now | Amend HR1 to initiate vs. infrastructure | Spec amendment to D58 + §2.3 + §6 |
| C3 | Taxonomy + evals as launch prerequisites | Both first, hard prerequisites | §10 Phase 0 + §4.3 |
| C4 | TurboTax / H&R Block claim not deliverable | Open — QBO-as-interchange proposed | §2.5 (flagged) |
| H1 | CPA multi-user model missing from arch | Build multi-user primitive | §2.3 + arch v4.1 |
| H2 | Adaptation-floor signal list not final | Lock the six for MVP | §2.4 |
| H3 | Face ID cadence undefined | Industry standard — 5 min in background | §5.5 |
| H4 | Remote wipe scope ambiguous | Penny local data only | §5.5 |
| H5 | Pending/settled lifecycle missing from arch | Extend Transaction with `bank_state` | §2.1 + arch v4.1 |
| H6 | Evals S-Corp + solopreneur rewrite needed | Prerequisite per C3 | §4.3 |
| M1 | Rolling median anomaly unspecified | Median + MAD, min sample 3 | §2.2 + §3.2 |
| M2 | Confidence thresholds undefined | 0.90 / 0.70 starting, tune via data | §4.4 |
| M3 | Audit-readiness formula undefined | 40/25/20/15 weighted starter | §3.2 |
| M4 | D78 vs D79 auto-send tension | Plan-level consent = one-time | §10 Phase 6 |
| M5 | Activity-line placement under D73 | Tab 1 first-state status; thread one gesture down | §7 |
| M6 | D84 import conflict scenario framing | Onboarding + Connect both | Spec amendment to D84 |
| M7 | D83 "not sure" diagnostic reorder | Reorder per stress test | Spec amendment to D83 |
| M8 | Zelle accuracy gap disclosure | First-inbound disclosure message | §6 + tone-guide entry |
| M9 | Runway calc scope | Default: business accounts ÷ business-expense average | §3.2 — **confirm with Nik** |
| M10 | "Your 90-day trend is healthy" with <60 days | Language gated on ≥60 days | Tone-guide entry |
| L1–L5 | Low findings | Applied inline | Throughout |

---

## 12. Explicitly NOT in launch scope

Named so nobody builds them by accident:

- **Sales tax computation, filing, or nexus tracking.** E23 — detection + flagging only. Sales tax amounts shown on transactions and in CPA export, but Penny does not compute obligations or file returns.
- **Multi-member LLC, C-Corp, partnerships.** D72 — post-launch feature flags.
- **Federated-model training cycle active at launch.** E10 — the pipeline ships, the opt-in is honoured, anonymised data collects, but the first training cycle is gated on reaching ~500 active opted-in users. Baseline model behaviour until then.
- **MDM-integrated device wipe.** H4 / E38 — Penny's local data only, never device-level.
- **Android-only App Store launch event.** Expo ships both; product marketing sequences launch separately.
- **Partnership MCPs / connector apps.** Penny is a standalone app at launch.
- **Web-first onboarding.** Mobile-first per settled decision. Web exists for sit-down review only.
- **OpenSearch / dedicated search engine.** E7 — Postgres full-text + pg_trgm is the launch choice. Revisit only on p99 breach.
- **Plaid Identity product.** E15 — Transactions + Balance + Auth at launch; Identity added only if fraud pressure appears.
- **Standing support-agent access to user data.** E40 — explicit per-session grant only.

---

## 13. Open items still waiting

Short list. Named so we close them promptly.

- **C4 / DN2 — TurboTax / H&R Block export path.** QBO-as-interchange is the chosen engineering path (Alex imports QBO export into QuickBooks Self-Employed; TurboTax pulls from QBSE). Nik to validate with early users whether this path is acceptable and whether marketing claim in D55 needs softening.
- **`irs-tax-research.md` — still pending.** Phase 0 blocker. Nik + CPA reviewer are the named owners.
- **General Counsel review of D74 email-ingestion copy + flow.** Before any email-ingestion code ships.
- **Apple developer + Intuit developer + PayPal Venmo partner + Track1099 + Discord bot approvals.** Kick off early — each has a lead time.
- **Federated-learning privacy review.** General Counsel + external privacy-engineering review required before training infrastructure accepts any opted-in data, even in collection mode (E10).
- **Cost guardrail thresholds.** Per-user daily cap ($ figure) and global circuit-breaker threshold ($ / hour) to be set before any AI call ships; Nik to approve once first load data is in (E34).

**Closed in v2 (previously open in v1):**
- ~~M9 Runway scope~~ — closed via E27: all accounts by default, Alex can flag any as Personal.
- ~~L4 Federated learning at launch~~ — closed via E10: full pipeline ships at launch, training cycle gates at 500-user threshold.

---

## 14. What a builder does tomorrow morning

Phase 0 first. Concretely:

1. Kick off `irs-tax-research.md` with a US-licensed CPA as reviewer.
2. Draft `categories.v1.json` schema (shape + validation) so the taxonomy lands into a machine-readable artefact, not a PDF.
3. Rewrite the five AI eval suites. Solopreneur-specific. v2.2-aligned. S-Corp-extended. Eval cases must include: multi-currency transaction handling (E25), accrual-basis P&L (E26), 1099-candidate contractor payments (E21), quarterly-tax compute edge cases (E22), split-transaction inference (E28), ask-once rule proposals (E13).
4. Extend `architecture/system-architecture.md` to v4.1 with: multi-user / role / share-link model, pending/settled transaction lifecycle, `VendorStats` projection shape, accrual projection shape (E26), multi-currency schema (E25), federated-learning data model (E10), Discord support-thread projection (E41).
5. Populate `engineering/engineering-decisions.md` with §1 stack choices and §0.5 decision log. This file is currently a placeholder — after tomorrow morning it is the authoritative tech-stack reference.
6. Start partner applications: Apple developer, Intuit developer (for QBO + QBO Payroll), PayPal Venmo partner, Track1099 integration, Discord bot application, OpenExchangeRates account.
7. Commission General Counsel review of: D74 email-ingestion flow, E10 federated-learning privacy posture, E39 data-deletion certificate wording, E40 support-access grant copy.
8. Design federated-learning architecture doc (E10) — anonymisation strategy, aggregation boundaries, opt-in consent storage, 500-user training-cycle gate.

Nothing in §10 Phase 1 begins until items 1–8 are in motion. None of them takes code; all of them unblock code.

---

*Penny · Technology Implementation Strategy · v2 · 21 April 2026*
*Companion to product spec v2.2, architecture v4, and stress test v2.2. v2 folds in the 21 April CEO decision log — 38 engineering decisions. Updates only via deliberate decision.*
