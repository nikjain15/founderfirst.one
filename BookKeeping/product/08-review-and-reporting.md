# 08 — Review and Reporting
*What Alex sees when she opens My Books.*

Decisions covered: D47–D51, D64–D66.

---

## My Books — what Alex sees first (D47)

My Books leads with **financial health at a glance**.

**Lead number:** 90-day trailing net income (**not** this-month alone, which is volatile for freelancers).

Below the lead:

- This month vs. 90-day trend (up / flat / down)
- Anything that needs her attention (pending approvals, compliance gaps, overdue invoices)

Month-over-month is a secondary view, not the default.

---

## P&L time periods (D48)

**Default view:** 90-day trailing and 6-month trailing side by side.

Secondary tabs: this-month and last-month.

Alex can pick any custom date range.

**Why trailing-default:** de-catastrophises lumpy freelancer income. Custom range gives her control.

---

## Conversation thread management (D49)

- **Default:** 30 days visible in the conversation thread
- Older confirmed transactions move automatically to My Books
- Alex can adjust the window from Connect settings
- **Full history is always preserved and searchable in My Books**

---

## Search (D50)

**In My Books:** dedicated search bar — keyword, vendor, amount, or date range.

**In the Penny thread:** natural language ("find that Austin trip from February") — Penny surfaces the result in conversation.

**Both paths lead to the same data.**

Engineering: Postgres full-text + `pg_trgm` (implementation-strategy v2, E8).

---

## Financial Q&A (D51)

Penny answers financial questions anywhere Alex asks them.

**In the conversation thread:** Alex asks naturally ("am I spending more on software this year?") and Penny responds with a direct, plain-English answer with numbers.

**The same answer is available as a view in My Books** for deeper exploration.

---

## Lumpy is normal (D64)

When income drops sharply month-over-month, Penny's default language normalises it:

> *"Income dipped vs. last month — that's normal for freelancers. Your 90-day trend is healthy."*

**Penny never panics over a slow month.** Tone under income volatility matches her tone under any other stress: calm, contextual, honest.

---

## Cash runway as a first-class number (D65)

My Books displays Alex's runway prominently, in plain English:

> *"You have 4.2 months of runway at your average expense rate."*

**Calculation:** current cash balance ÷ trailing 90-day average expenses.

Appears on the main My Books view.

**Why this is first-class:** for a solo business owner this number is more emotionally relevant than the P&L — it answers "am I okay?" in a single glance.

### Runway scope (E27)

- **Default:** all connected accounts, unless Alex marks a specific account as personal
- Cash runway reflects the money Alex can actually deploy for the business

---

## Audit-readiness indicator (D66)

Alex can see at any time:

> *"If the IRS wrote you a letter tomorrow, how prepared would you be?"*

**One-tap view of:**

- Compliance completeness by quarter
- Receipts attached
- Categorisation confidence
- Outstanding gaps

**Why it matters:** proactively reduces **latent audit anxiety** — the real reason most solo freelancers do bookkeeping at all.

Feeds directly from the Audit-Readiness Score (D68) — see [07-notifications-and-backlog.md](07-notifications-and-backlog.md).

---

*Next: [09-invoicing.md](09-invoicing.md)*
