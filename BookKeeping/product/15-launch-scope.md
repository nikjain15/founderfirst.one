# 15 — Launch Scope
*What's in at launch, and what's explicitly out.*

---

## In scope at launch

### Users

- US solopreneurs
- Sole proprietors
- Single-member LLCs
- **S-Corp-elected solopreneurs (full support, per D72)**

### Geography

- **US only.** All copy, tax logic, and compliance is US/IRS-aligned.

### Core product

- Four persistent tabs: Penny, Add, My Books, Connect
- Approval-card-centric interaction
- Conversation thread as peer surface (D73 hypothesis may invert to primary)
- 90-day trailing net income as lead number in My Books
- Cash runway as first-class number
- Audit-readiness indicator + score

### Data input

- Plaid bank + card feeds (OAuth Link preferred)
- Direct Stripe, PayPal, Square / CashApp APIs
- Venmo via partner-gated PayPal API (partnership application needed)
- Zelle via bank feed + per-sender learning
- Receipt photos
- Email receipt ingestion (Gmail + Outlook, receipt-signal scope)
- Voice input, manual entry, proactive cash prompts
- Offline capture with sync-on-reconnect

### Categorisation and learning

- Approval card with 4-field minimum (amount + direction + category + date)
- Confidence via visual + language + reasoning (no raw score)
- Hallucination-zero — ask when no signal
- Expense / income asymmetry (auto-confirm expenses; never auto-confirm income)
- Variable recurring expenses with visible activity line + 2× anomaly threshold
- Split transactions in user-preferred format
- Per-user model, private by default
- **Full federated-learning pipeline at launch**, opt-in, 500-user training gate

### Notifications

- Proactive triggers with adaptation floor
- Batched weekly compliance review (never per-transaction nag)
- Shame-free re-entry (no item counts)
- No streaks

### Reporting

- P&L default: 90-day + 6-month trailing side by side
- Search — keyword in My Books, natural language in Penny thread
- Financial Q&A anywhere
- Cash runway + audit-readiness scores

### Invoicing

- Invoice creation with pixel-perfect customisation
- Overdue reminders with learnable Alex-specific tone
- Recurring invoices (one-tap send, never auto-send)
- Payment plans with scheduled sub-invoices

### Tax and CPA

- Export package — PDF + CSV + QuickBooks + Xero + TurboTax Self-Employed + H&R Block Self-Employed
- CPA share link (expiring, read-only)
- CPA Penny view (read-only + note + correction-as-ground-truth)
- **Full 1099-NEC issuance** via Track1099
- **Quarterly estimated tax compute + remind + explain**
- **Sales tax detect + flag** (no computation, no filing)

### Platform

- iOS mobile (primary)
- Android mobile (post-iOS launch)
- Web app for sitting-down review
- **Full multi-currency** from day one (USD reporting)
- **Cash + accrual basis toggle**
- Face ID, remote wipe, device trust, field-level encryption, MDM-compatible path, 7-year audit log

### Support

- **Private 1-on-1 Discord channel per user**, AI-first with Claude bot, human escalation
- In-app chat as alternative surface
- Per-session support-access grant

### Growth

- **Word-of-mouth only.** No paid acquisition.

---

## Out of scope at launch

- **Multi-member LLC and C-Corp** (feature-flagged, post-launch)
- **Non-US geographies** — not negotiable for MVP
- **Sales tax computation and filing** — detect + flag only
- **Money movement of any kind** — hard rule
- **Tax filing** — hard rule
- **Personalised tax advice** — hard rule
- **Standing support-agent access** — per-session grant only
- **Paid acquisition** — word-of-mouth only
- **Streak mechanics** — hard rule (D62)

---

## Launch-blocking gaps (must resolve before ship)

See [BUILD-TRACKER.md](BUILD-TRACKER.md) Section 3 for full list. Summary:

1. **IRS tax research** (Q-C1–C4, Q-T1–T3) — blocks category taxonomy and tax computations
2. **AI eval 04 — financial computation** — highest priority (wrong numbers destroy trust permanently)
3. **AI evals 03 and 05** — data capture, anomaly detection
4. **S-Corp eval extensions** on all 5 evals
5. **General Counsel reviews** — D74, E10, E39, E40
6. **Architecture v4.1 extension**
7. **`categories.v1.json`** — blocked on IRS research
8. **Partner applications** — Apple, Intuit, Venmo, Track1099, Discord, OpenExchangeRates, Gusto, OnPay

---

*Next: [16-success-metrics.md](16-success-metrics.md)*
