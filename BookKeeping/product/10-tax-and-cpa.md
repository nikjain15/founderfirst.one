# 10 — Tax and CPA
*How Penny handles tax, works with CPAs, and supports DIY filers.*

Decisions covered: D53–D56. Engineering: E27 (1099), E28 (quarterly tax), E29 (sales tax).

---

## Tax guidance — CPA and DIY equally supported (D53)

Penny answers tax **rule questions** directly and helpfully:

> *"Yes — software used for your work is deductible."*

She always notes she is not a CPA and that Alex's specific situation should be confirmed by a CPA **or** handled through her DIY filing tool (TurboTax, H&R Block Self-Employed).

**She never answers questions requiring judgment about Alex's specific situation without that caveat.**

**Clear line:** Penny explains rules, she doesn't give personalised tax advice.

Works equally for CPA-users and DIY-filers.

---

## Year-end behaviour (D54)

Penny's year-end proactive behaviour is learnable and personalised.

**Default actions:**

- Surface a year-end compliance summary
- Flag largest deduction categories for review
- Offer to generate an export
- Ask whether Alex wants a Q4 estimated tax calculation
- Remind Alex of any recurring vendors that changed category during the year

---

## Export package (D55)

Penny produces a **complete export package**:

- **Human-readable summary PDF** — income, expenses by category, net profit, Schedule C mapping for sole prop / LLC, 1120-S mapping for S-Corp per D72
- **Full transaction CSV** — every transaction, categorised, dated, with source and compliance notes
- **Direct export files** compatible with **QuickBooks, Xero, TurboTax Self-Employed, and H&R Block Self-Employed**

The CPA or filing tool receives **clean, complete data with zero cleanup required**.

### TurboTax direct export — open item

Direct TurboTax API availability is being validated (see BUILD-TRACKER.md). If direct API isn't available, the QBO-as-interchange path is used and messaging is adjusted.

---

## CPA relationship (D56, 🧪 hypothesis)

Penny supports direct CPA access at **two levels**:

### Level 1 — Share link (one tap)

Alex generates a secure, read-only share link. The CPA opens it in a browser, sees the full books, no file download required.

- **Expiring access** (Alex sets the expiry)
- Read-only

### Level 2 — CPA's own Penny view

CPAs get their own Penny view — **read-only** with the ability to:

- Leave notes
- Make corrections that feed back into Penny's model as ground truth (D40)

Alex controls what the CPA can see and when.

**Hypothesis:** many Alex-personas do not have an active CPA. Feature exists for those who do; DIY export paths (D55) serve those who don't.

---

## Quarterly estimated tax (E28)

**Compute + remind + explain.**

Penny:

- Calculates Alex's quarterly estimate based on trailing net income + entity type + federal + state rules
- Reminds at 30 / 7 / 1 day
- Explains methodology in plain English

**Penny never moves money.** Alex sends the payment herself (hard rule).

**Methodology detail** (safe-harbor, projection, S-Corp variant) blocked on IRS research Q-T1 — see `../../research/solo-freelancer/irs-tax-research.md`.

---

## 1099-NEC issuance (E27)

**Full 1099-NEC support at launch** via Track1099 integration.

Penny:

- Tracks contractor payments against the $600 threshold
- Flags missing W-9s before the threshold is crossed (adaptation floor signal — D86)
- Prepares 1099s at year end
- Files through Track1099

Full 1099 rules (thresholds, filing partners, W-9 collection) blocked on IRS research Q-T2.

---

## Sales tax (E29)

**Detect + flag only at launch. No computation, no filing.**

When Penny sees sales-tax signals in a transaction (POS data, invoice line items):

- She flags it
- Exposes the amount in CPA export

**Clear non-scope for MVP.** Computation and filing are explicitly post-launch.

---

## Blocked on IRS research

The following decisions cannot be finalised until `../../research/solo-freelancer/irs-tax-research.md` completes (Option C hybrid — Penny team self-research + CPA review):

- **Q-C1** — Full category taxonomy (Schedule C / 1120-S line mapping, deductibility, plain-English labels)
- **Q-C2** — IRS-required supporting fields per category
- **Q-C3** — Vehicle expense method (mileage vs. actual) and Penny's default
- **Q-C4** — Home office method (simplified vs. actual) and Penny's default
- **Q-T1** — Quarterly estimated tax methodology
- **Q-T2** — Contractor / 1099-NEC tracking rules, thresholds, filing partners, W-9 collection
- **Q-T3** — Year boundary rules, amendment rules, record retention

**This research is a launch blocker.**

---

*Next: [11-entity-type-and-s-corp.md](11-entity-type-and-s-corp.md)*
