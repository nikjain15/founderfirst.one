# 09 — Invoicing
*Alex's public face to her clients.*

Decisions covered: D52, D78, D79, D80.

---

## Overdue invoice reminders (D52)

When an invoice goes past due:

- Penny notifies Alex
- Drafts a polite, professional reminder email to the client — ready to send in one tap
- If Alex approves, Penny sends it
- Over time, Penny learns Alex's follow-up style, timing, and preferred tone

**The goal:** Alex eventually just taps send without reading the draft because Penny has learned exactly how she communicates.

---

## Recurring invoices (D78)

Alex can designate any invoice as **recurring** on a cadence (monthly, quarterly, custom).

- Penny drafts the next invoice on the due date and surfaces it for Alex's **one-tap send**
- **Penny never auto-sends** without Alex's explicit confirmation

**Why never auto-send:** retainer relationships are too sensitive for silent sending.

**Model-flexibility:** decision is defined at the capability level (not specific UI), so the underlying model can evolve without re-spec. Examples of future evolution:

- Auto-send-with-preview
- Per-client auto-send rules
- Pause-this-month

---

## Payment plans on invoices (D79)

**Proactive payment plans at invoice creation.**

Alex can structure an invoice as **installments at the time of creation**:

> *"This $3,000 invoice, payable in 3 monthly installments of $1,000 starting Nov 1."*

**Penny's behaviour:**

- Generates scheduled sub-invoices
- Sends each on schedule (per Alex's preferences — see D78)
- Reminds on late installments
- Tracks overall invoice completion against the full total

### Industry-standard validation (April 2026)

- **FreshBooks** — Payment Schedules + Affirm BNPL partnership
- **QuickBooks** — Progress Invoicing
- **Stripe** — Afterpay / Klarna / Affirm integrations

Reactive partial-payment matching from D14 continues to handle ad-hoc partial payments on non-plan invoices.

---

## Invoice customisation — pixel-perfect (D80)

**Full brand control at launch, designed to Stripe-Invoicing quality. No shortcuts.**

### What Alex can customise

- Custom logo upload (PNG / SVG)
- Custom accent colour — **full picker, not presets**
- Font selection from a curated web-font library
- Per-client default settings — terms, currency, reminder cadence
- PDF layout templates — 3–5 professional options
- Custom terms, footer, payment instructions
- Custom invoice numbering schemes

### Rationale

Invoicing is Alex's **public face to her clients**. The product either looks professional or it doesn't — there is no middle ground that earns trust from the client side. Matches the "never compromise on product building phase" stance.

### Engineering

HTML + Chromium (Puppeteer) for pixel-perfect PDF rendering (implementation-strategy v2, E5).

---

*Next: [10-tax-and-cpa.md](10-tax-and-cpa.md)*
