# 14 — Architecture and Security (Summary)
*Enough to understand the commitments. Full detail lives elsewhere.*

Full references:
- `../../architecture/system-architecture.md` v4 — microservices, data model
- `../../engineering/implementation-strategy.md` v2 — 38 engineering decisions

---

## Core architectural commitments

- **Own the ledger from day one.** QuickBooks, Xero, Wave are **export targets only** — never system of record.
- **Financial data is never overwritten, never hard-deleted.** Event-sourced CQRS on AWS Aurora Postgres. Full audit trail always.
- **User data is never used for AI training without explicit opt-in.** Default off.
- **Microservices.** Each service has a single responsibility and its own data boundary.
- **SOC-2-ready at launch.** Full certification in Phase 13.

---

## Stack — high level

| Area | Choice | Notes |
|---|---|---|
| Frontend language | TypeScript everywhere | Shared types across mobile + web + backend |
| Mobile | Expo (React Native) | iOS first, Android follows |
| Web | Next.js | Full-screen review experience |
| Monorepo | Turborepo | Shared UI, shared types, fast incremental builds |
| Backend | AWS Fargate + Aurora Postgres + EventBridge + S3 + KMS + Cognito | |
| Auth | Apple Sign-In + Google Sign-In federated via Cognito + Face ID via Expo LocalAuthentication | No magic link |
| Offline sync | WatermelonDB on SQLite | Per D81 |
| AI orchestration | Multi-provider routed via `AIClient` abstraction | |
| AI models | Claude Opus for trust-critical; Sonnet / Haiku for mid / narrow classification | Quality first, cost optimisation later |
| Federated learning | Full pipeline at launch, 500-user training-cycle gate | Per E10 |
| PDF invoices | HTML + Chromium (Puppeteer) | Per D80 |
| Search | Postgres full-text + `pg_trgm` | |
| DR | Active-Passive warm standby (us-east-1 primary, us-west-2 warm) | |
| OTA updates | Expo EAS Update with 10% staged rollout + auto-rollback | |
| Payments | Stripe Connect Standard (connect-existing flow) | |
| Bank feeds | Plaid Transactions + Balance + Auth (OAuth Link where supported) | |
| Payroll | Gusto + OnPay + QBO Payroll — all three at launch | Per D72 |
| 1099 filing | Track1099 | Per E27 |
| FX rates | OpenExchangeRates | Per E25 |
| Encryption | Per-user KMS envelope encryption | |
| Cost guardrails | Per-user daily spend cap + global circuit breaker | |
| Prompt-injection defence | Input sanitisation + output validation + moderation classifier | 3 layers |
| Tone enforcement | Classifier + rule-based checker | Two-layer |
| Support | Private 1-on-1 Discord channel per user + in-app chat, AI-first, human escalation | Per E41 |
| Analytics | PostHog | |
| Errors | Sentry | |
| Deletion | 30-day soft delete → hard delete + certificate | Per E39 |
| Support access | Per-session grant only — no standing access | Per E40 |

---

## AI tier assignments

Quality-first. Cost optimisation later.

| Task | Tier | Reason |
|---|---|---|
| Transaction categorisation | Claude Opus | Core correctness task; trust depends on this |
| Conversation (Penny) | Claude Opus | Tone + accuracy both critical |
| Anomaly detection | Claude Opus | False positives destroy trust; false negatives miss tax consequences |
| Financial Q&A | Claude Opus | Wrong P&L numbers destroy trust permanently |
| Receipt OCR | Claude Sonnet | Structured extraction; quality matters but not trust-critical in isolation |
| Vendor normalisation | Claude Haiku | Narrow classification; fast + cheap is fine |
| Tone classifier | Claude Haiku | Narrow classifier on Penny's output |
| Moderation classifier | Claude Haiku | Safety check on user input |

---

## Security model

- **Per-user KMS envelope encryption** for all financial data (E33)
- **Field-level encryption** for sensitive fields (bank account numbers, SSN)
- **7-year audit log** of sensitive actions — export, cancel, share link, CPA access
- **Comprehensive** audit log scope (not selective)
- **Face ID required** on every app open, default 5-minute timeout, user-configurable (E36)
- **Device trust** — new device requires email + Face ID before first use
- **Remote wipe** via Connect → Preferences
- **Sign-out all devices** control

---

## Data deletion lifecycle (E39)

1. Alex requests deletion
2. **30 days soft-delete** — read-only, can restore
3. At day 30, **hard delete** across all systems
4. **Deletion certificate** issued to Alex
5. Audit log records the deletion action (retained per regulatory requirement even after user-data hard-delete)

---

## Support access (E40)

**Per-session grant only.**

- Alex explicitly grants a support agent permission to view her data on a per-session basis
- Grant includes scope (read-only / specific records) and duration
- Every access is logged
- **No standing support-agent access exists**

---

## DR model

**Active-Passive warm standby.**

- **Primary:** us-east-1
- **Warm:** us-west-2 — continuously replicated, ready to cut over
- **RTO:** minutes
- **RPO:** seconds

Chosen over active-active for cost and consistency simplicity; over cold standby for launch-grade reliability.

---

## Webhook recovery

**Every webhook + hourly reconciliation job** (E32).

- Webhooks processed as primary path
- Hourly reconciliation job catches missed or failed webhooks
- Defence-in-depth against webhook delivery failures

---

## What's still open on the architecture side

See BUILD-TRACKER.md for current status.

- Architecture v4.1 extension — effective-dated entity type, pending-settled lifecycle, VendorStats projection, accrual projection, multi-currency schema, federated-learning data model, Discord thread projection
- `engineering-decisions.md` population from implementation-strategy v2 §1 and §0.5
- Cost guardrail threshold values (floor / ceiling / circuit-breaker trip point)
- Partner applications (Apple, Intuit, PayPal/Venmo, Track1099, Discord, OpenExchangeRates, Gusto, OnPay)
- General Counsel reviews — D74 email-scope, E10 federated learning, E39 deletion copy, E40 support-access copy

---

*Next: [15-launch-scope.md](15-launch-scope.md)*
