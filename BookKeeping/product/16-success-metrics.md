# 16 — Success Metrics
*How we'll know Penny is working.*

Decisions covered: D59, D60.

---

## North star (D60)

> **Penny's north star: Alex is never anxious about her books.**

Measured by **four behavioural signals**:

1. **Time saved** — Alex's bookkeeping time is measurably less than before Penny.
2. **Financial clarity** — Alex can answer "how am I doing?" in under 60 seconds.
3. **Tax readiness** — at any moment, Alex can hand clean books to a CPA, or load them into TurboTax / H&R Block and file confidently without cleanup.
4. **Returns after a gap without shame.**

**Signal #4 is the defining one.**

Everything else is a feature-level metric. #4 is the only one that tells us Penny actually earned the relationship. If Alex voluntarily reopens the app after a 2-week absence, we've built the calm friend. If she doesn't, we've built another nagging fintech app.

---

## Internal accuracy metrics (D59)

Penny's internal accuracy metrics:

### 1. Correction rate

- % of approval cards where Alex edits vs. accepts
- **Target: <10% edit rate** for known vendors

### 2. AI evals

- Separate eval suite benchmarking categorisation accuracy against a labelled test set
- Must include **sole prop, LLC, and S-Corp** specific test cases (per D72)
- Must include multi-currency, accrual-basis, 1099 candidates, quarterly-tax edges, split transactions, ask-once rule proposals
- Must pass on all 6 suites before any model ships:
  - 00 — Trust principles (framework)
  - 01 — Transaction intelligence
  - 02 — Conversational Q&A
  - 03 — Data capture (OCR)
  - 04 — Financial computation — **highest priority** (wrong P&L destroys trust permanently)
  - 05 — Anomaly detection

### 3. Return-after-gap rate

- % of users who voluntarily open Penny within 7 days of a 14-day absence
- **Behavioural signal for "calm friend" delivery**
- This metric directly tests North Star signal #4

**Removed (v2.1):** 80% compliance completeness target. Compliance is Alex's Audit-Readiness Score (D68), not Penny's KPI.

---

## Growth metrics

### Word-of-mouth only

**No paid acquisition. No traditional sales.**

Alex recommends Penny to the next freelancer who complains about taxes or their CPA bill.

- If the product earns recommendations, it grows
- If not, the product isn't good enough yet

### Operational growth signals

- Net new users / week
- Net new users / week from referral attribution (track but not optimise for)
- Churn — specifically, **voluntary cancellation with full export** as the honest signal (versus soft abandonment)
- Time-to-first-approved-transaction — faster means trust is being earned quickly

---

## What we do not measure

Deliberately not measured:

- **Daily active users in isolation** — encourages anxious engagement
- **Time spent in app** — encourages lock-in patterns we don't want
- **Notification open rate** — encourages notification spam
- **Streak length** — banned entirely (D62)

---

## Why Signal #4 is the one that matters

Signal #4 — returns after a gap without shame — is the only metric that cannot be gamed toward a bad product.

- Time saved can be gamed by automating categorisations that are wrong
- Financial clarity can be gamed by showing confident-but-wrong numbers
- Tax readiness can be gamed by booking everything to safe-harbour categories that under-deduct
- **Return-after-gap cannot be gamed.** Alex only comes back if Penny feels like a calm friend rather than a nagging app.

If we get #4 right, everything else follows. If we optimise for anything that hurts #4, we have built the wrong product.

---

*End of solopreneur product spec. For tracker, see [BUILD-TRACKER.md](BUILD-TRACKER.md). For index, see [README.md](README.md).*
