# 04 — Data Input
*Every source Penny ingests, and the rules around capture.*

Decisions covered: D5–D18, D69, D74, D75, D77, D81.

---

## Input sources at launch

| Source | Mechanism | Notes |
|---|---|---|
| **Bank feeds** | Plaid Transactions + Balance + Auth | OAuth Link where supported, regular Link fallback |
| **Card feeds** | Plaid | Same as bank |
| **Stripe** | Direct API | Payments, payouts, reconciliation (D11) |
| **PayPal** | Direct API | Income + expense |
| **Square / CashApp** | Square Business API | Direct API integration per D77 |
| **Venmo** | Partner-gated PayPal API | Partnership application required |
| **Zelle** | Bank feed only | No public API; per-sender learning (D69) |
| **Receipt photos** | Mobile camera | On-device crop before upload |
| **Email receipts** | Connected Gmail / Outlook OAuth | Receipt-signal-only scope (D74) |
| **Voice input** | Mobile mic | Alex talks, Penny transcribes and books |
| **Manual text entry** | Chat bar | Alex types a note, Penny structures it |
| **Cash entries** | Proactive prompts | Learned timing (D9) |

Forwarding address fallback for email: `<alex-id>@receipts.penny.app`.

---

## Pending vs. settled transactions (D5, D6)

Penny shows a transaction as soon as it appears, **even as pending**.

- On settlement, if the settled amount matches pending within threshold → silent update
- **Material change threshold:** $1 or 5% of the transaction amount, whichever is greater
- Above threshold → resurface, explain what changed, ask Alex to confirm the final amount

The settled amount is what gets confirmed and booked.

---

## Pre-authorisations (D7)

Penny waits for settlement. No pending-hold noise.

When the settled charge arrives:

> *"Your hotel charge came in at $178 — the original hold was $200. I've categorised this as Travel."*

Alex sees the full picture without having to track it herself.

---

## Minimum input (D8)

When Alex enters incomplete information ("spent $40 today" — no vendor, no category):

- Penny **never** stops and demands missing fields
- She takes what she has
- If she has signal, she adds a best-effort guess: *"I'll book this as a Business Meal — does that sound right?"*
- If she has no signal, she asks directly — never guesses (D25)
- Asks one follow-up question at most
- Incomplete entries are flagged for follow-up

Applies across all input types.

---

## Cash and informal payments (D9)

Penny prompts cash capture proactively — learns when Alex tends to have cash expenses (e.g., after client meetings) and prompts at those times:

> *"Any cash expenses today?"*

Alex can capture in seconds. Cash entries are manual and get `SOURCE = MANUAL`.

---

## Receipt + bank feed overlap (D10)

Penny flags the potential match and waits for Alex's confirmation:

> *"I have a $45 Starbucks from Tuesday on your bank feed — did you also upload a receipt for this?"*

- Until confirmed, both entries exist separately in the system of record
- On confirmation, Penny links them into a single entry with both sources attached
- **Nothing is ever silently merged or deleted**

---

## Stripe + bank feed overlap (D11, 🧪 hypothesis)

Penny treats payment-processor income (Stripe / Square / PayPal) and bank deposits as two events that need reconciliation.

- When a bank deposit matches a recent processor payout, Penny proposes the link: *"Is this Chase deposit the Studio Nine Stripe payout?"*
- Alex confirms once
- Penny learns the settlement timing for each processor and handles future reconciliation automatically
- Penny always notifies Alex when a payment has hit both systems

**Architectural requirement:** direct Stripe / Square / PayPal API integration beyond Plaid.

---

## Duplicates (D12)

Penny flags potential duplicates immediately but **never auto-rejects**. She surfaces the second entry with context:

> *"This looks like the same Studio Nine payment I already recorded — is this a new payment or a duplicate?"*

The original is never deleted. The duplicate is either confirmed or voided by Alex.

---

## Invoice payment matching — income is a celebration (D13)

**Income is never silently auto-confirmed.** This is a deliberate brand signature, not a risk-management stance.

Penny surfaces income with warmth:

> *"🎉 A $3,500 transfer just landed — is this Studio Nine paying Invoice #1042?"*

Alex confirms with one tap. The tap is the celebration, not the friction. Over time Penny learns which clients pay predictably, but the one-tap confirmation on income remains — always.

See also Principle 8 and D32 asymmetry in [05-categorization.md](05-categorization.md).

---

## Partial invoice payments (D14)

Penny proposes the partial payment match:

- Alex confirms
- Penny books the received amount as income
- Marks the invoice as partially paid
- Sets a reminder for the outstanding balance based on original payment terms
- Proactively follows up if the second payment is late

For explicitly scheduled payment plans, see D79 in [09-invoicing.md](09-invoicing.md).

---

## Recurring income (D15)

Recurring income (monthly retainer, etc.) always gets Alex's one-tap confirmation — see D13 and Principle 8.

**Penny's real value:** if the expected payment doesn't arrive by its usual date, Penny proactively alerts Alex. Missing income is flagged as urgently as unusual expenses.

---

## Refunds and reversals (D16)

Penny explains the refund event in plain English:

> *"Adobe refunded $54.99 — the expense you booked in March is now reversed."*

She explains the tax treatment, presents Alex's options, and follows Alex's decision. The original booking is never deleted — the refund is an addition to the ledger.

---

## Foreign currency (D17)

Penny always shows the USD amount prominently (IRS reporting currency) and includes the original currency and conversion rate as supporting context.

**Format:** `+$3,680 USD · 5,000 CAD @ 0.736`

The original contract currency is preserved in the record.

Full multi-currency schema: see [12-platform.md](12-platform.md).

---

## Bank disconnection (D18)

- Penny notifies Alex immediately on bank disconnection — proactively, not just on next app open
- No data is estimated during the gap
- When Alex reconnects, Penny backfills the missing period and flags it for review
- Penny learns how often Alex's token tends to expire and may prompt a refresh proactively before it lapses

Re-auth UX: silent retry + Penny-authored notice only after threshold (implementation-strategy v2, E23).

---

## Peer payments (D69, D77)

Venmo / Zelle / CashApp / peer payments are a first-class input class, distinct from cash.

**Bank-feed appearance:** transfers with weak vendor strings ("ZELLE PAYMENT FROM J SMITH").

**Penny behaviour:**

- Flags peer-payment inbounds for Alex to identify: *"Is this client income, a refund, or a personal transfer?"*
- Learns per-sender — after 2 confirmations, "J Smith" = Studio Nine client, auto-learned
- For outbound peer-payments to contractors or services, the same flow applies — vendor identification first, then category
- Income from peer-payments always follows D13 (one-tap celebration)

### Integration strategy (D77)

Direct API integration is pursued wherever the platform supports it:

- **CashApp** — direct API integration via Square Business
- **Venmo** — partner-gated API via PayPal; partnership application required
- **Zelle** — no public API exists; data flows through the bank feed only; Penny treats Zelle as structured bank-feed input and relies on D69's per-sender learning

Integration sequencing and partnership timelines are engineering / BD decisions, not product scope. The product stance: wherever a direct API exists or can be established, Penny pursues it. Bank-feed parsing is the fallback, not the default.

Accuracy gap between "direct API" and "bank-feed parsed" on peer payments is reported in AI eval 01 (Transaction Intelligence).

---

## Email receipt ingestion (D74)

Alex connects Gmail or Outlook at onboarding via OAuth with **read-only scope limited to receipt-signal messages**.

**What Penny's inbox scanner reads:**

- Known vendor domains
- Receipt-like subject lines
- Structured HTML receipt markup

**What it does NOT read:** personal email. Non-receipt mail is never touched.

Extracted receipts surface as approval cards identical to photographed receipts (D8, D10, D25 apply).

### Privacy and scope guardrails

- Penny never reads personal email
- Alex sees the exact scope she granted in Connect → Preferences, and can revoke anytime
- OAuth token lifecycle matches D18 (proactive refresh prompts)
- Scope is audited in General Counsel review before ship

### Forwarding-address fallback

`<alex-id>@receipts.penny.app` exists for Alex who prefers not to connect her inbox. Connected inbox is the default, wow path.

---

## Unreadable receipts — active follow-up (D75)

When Penny cannot fully parse a captured receipt (OCR failed on blurry photo; parser missed a field on HTML email receipt), the partial entry enters an **active follow-up loop**, not a silent "needs review" bucket.

1. Penny shows what she got and what she's missing: *"I caught the $45 amount and the date, but I can't read the vendor name."*
2. One-tap options: retake photo, type the missing field, or skip for now
3. If Alex skips, the item goes to the next session with Alex — Penny asks about it, one at a time, until resolved
4. The weekly batch (D67) surfaces stragglers explicitly
5. If Alex repeatedly skips, Penny names it conversationally: *"I've got 3 receipts I still can't read — want to walk through them together?"*

**Principle:** Penny owns the backlog (D61). Penny never hides the backlog. Penny never lets it silently rot. Solving the backlog through active conversation is Penny's job.

---

## Offline capture (D81)

Receipt photos, voice notes, and manual entries capture offline and queue locally, syncing on reconnect.

- Penny's UI shows a quiet "offline — will sync" banner, **not an alarm**
- Offline categorisation and offline P&L are **not** supported — those require server-side data
- The capture moment is never blocked by connectivity
- Conflict resolution on reconnect follows D10 and D12: flag potential duplicates / matches, never silently merge
- Offline-queued entries flow through the same approval-card surface as live entries on sync

Engineering: WatermelonDB on SQLite (implementation-strategy v2, E3).

---

*Next: [05-categorization.md](05-categorization.md)*
