# Penny — AI Evaluation Criteria: Financial Computation Accuracy
**Version 2 · April 2026**

> Part of the Penny AI Eval Suite — one of five evaluation documents.
> See `penny-architecture.md` → AI Architecture → Model Evaluation Before Deployment for the full picture.
>
> **Eval Suite:**
> - `penny-ai-evals.md` (Transaction Intelligence)
> - `penny-evals-conversational-qa.md` (Conversational & Financial Q&A)
> - `penny-evals-data-capture.md` (Receipt & Invoice Capture)
> - `penny-evals-financial-computation.md` ← you are here (Financial Computation Accuracy)
> - `penny-evals-anomaly-detection.md` (Anomaly & Pattern Detection)

---

## Scope

This document defines evaluation criteria for Penny's financial computation layer — the part of the product that aggregates ledger data into summaries, totals, and reports that Alex relies on to understand her business.

This is not AI inference — it is arithmetic and aggregation. The standard is therefore fundamentally different from every other eval in this suite: **not a statistical accuracy threshold, but exact correctness.** A P&L that is off by one dollar is wrong. A category total that is off by one cent is wrong. There is no acceptable error rate. These evals are regression tests as much as AI evals — given a known ledger state, the correct output is known exactly.

---

## The Benchmark

**The standard is correctness, not accuracy.**
Unlike categorization or extraction, where statistical accuracy is the metric, financial computation has a binary standard: right or wrong. A spreadsheet that computes a sum does not get 99% accuracy — it gets the right answer or it is broken. Penny's computation layer must meet the same standard.

**Why this matters:**
Alex shows her P&L to her accountant at tax time. The accountant reconciles the numbers against the bank statement. If they do not match, trust is destroyed — not in the AI, but in the entire product. One wrong number on a CPA export means the product cannot be used for its primary purpose.

---

## No Maturity Tiers for Computation

Unlike the other eval documents, financial computation does not use maturity tiers with evolving thresholds. The standard is 100% correctness from day one. Computation either works or it does not. A model or system that produces one wrong P&L number is not "almost ready" — it is broken and cannot ship.

The complexity of test scenarios increases over time (more edge cases, larger ledgers, more account types), but the pass threshold is always the same: zero errors.

---

## The Eight Evaluation Dimensions

### 1. Profit & Loss Accuracy

**What we're testing:** When Penny shows income, expenses, and net profit for a given period, are the figures exactly correct against the underlying ledger?

The P&L is the most important number in the product — the single figure Alex sees on the My Books screen. It must be correct to the cent, every time, for every period.

**Test set:** Synthetic ledger fixtures with pre-computed correct P&L figures, verified by independent calculation (a second, independent computation of the same ledger produces the same result). Must include:

- Simple cases: 10 transactions, one category, one month
- Moderate cases: 100 transactions, 8 categories, 3 months
- Complex cases: 1,000+ transactions, all categories, 12+ months
- Ledgers with only income (no expenses yet — common for a new business)
- Ledgers with only expenses (no income yet — a pre-revenue startup)
- Ledgers with a net loss (expenses exceed income)
- Ledgers with $0.00 net profit exactly

Minimum 50 ledger fixtures at Launch, 200 ongoing.

**Metrics:**
- Income total: exact match to the cent
- Expense total: exact match to the cent
- Net profit: exact match to the cent (income minus expenses)
- Period correctness: are the numbers computed for exactly the right date range?

**Pass criteria (all scenarios, no exceptions):**

| Metric | Threshold |
|---|---|
| Income total exact match | 100% |
| Expense total exact match | 100% |
| Net profit exact match | 100% |
| Period correctness | 100% |

---

### 2. Schedule C Category Totals

**What we're testing:** When Penny computes how much Alex spent in each IRS Schedule C category over a period, are the per-category totals exact?

This is what the CPA export relies on. Every category total must match the sum of confirmed transactions in that category for the period. The sum of all category totals must match the expense total in the P&L. Any discrepancy between the two is a hard failure.

**Test set:** Same ledger fixtures as P&L accuracy, with per-category expected totals pre-computed.

**Metrics:**
- Per-category total: exact match for every category
- Category sum check: sum of all category totals equals the P&L expense total exactly
- Empty category handling: categories with zero transactions show $0.00, not missing/null/undefined

**Pass criteria:**

| Metric | Threshold |
|---|---|
| Per-category total exact match | 100% |
| Category sum equals P&L expense total | 100% |
| Empty category display | $0.00 (not blank) |

---

### 3. Running Balance Accuracy

**What we're testing:** When Penny shows a running account balance, does it correctly reflect every transaction in sequence, with no missing or double-counted entries?

A running balance is a sequential computation — each transaction adjusts the balance, and the final balance must equal the starting balance plus all credits minus all debits. If a single transaction is missing, duplicated, or out of order, the running balance is wrong from that point forward.

**Test set:** Synthetic account histories with a known starting balance and known transactions in sequence. Must include:
- Accounts with dozens of transactions in a single day (common for product sellers)
- Accounts with transactions that arrive out of order (bank posts at different times)
- Accounts with pending transactions that are later confirmed or rejected
- Accounts with transfers that must not double-count (a transfer out of Account A and into Account B)

Minimum 30 account fixtures at Launch.

**Metrics:**
- Final balance: exact match after all transactions are applied
- Intermediate balance at each step: exact match at every point in the sequence
- Transaction count: the number of transactions in the balance matches the number in the ledger (no missing, no duplicates)

**Pass criteria:**

| Metric | Threshold |
|---|---|
| Final balance exact match | 100% |
| Every intermediate balance exact match | 100% |
| Transaction count match | 100% |

---

### 4. Transfer Exclusion

**What we're testing:** When an inter-account transfer is detected and confirmed by Alex, it must be excluded from both income and expense totals in the P&L. When a transfer is detected but Alex says "no, that's actually income," it must correctly appear in income.

This is a critical integrity test. Incorrect transfer handling inflates or deflates the P&L. A transfer counted as both income and expense would overstate both revenue and costs.

**Test set:** Ledger fixtures that include confirmed transfers, rejected transfer suggestions (Alex said it was income), and ambiguous cases (similar amounts across accounts that are not transfers).

Minimum 30 transfer scenarios at Launch.

**Metrics:**
- Confirmed transfer exclusion: transfers correctly excluded from both income and expenses
- Rejected transfer inclusion: when Alex rejects a transfer suggestion, the transaction correctly appears in the appropriate category
- P&L impact: the net profit number is correct after accounting for transfer handling

**Pass criteria:**

| Metric | Threshold |
|---|---|
| Confirmed transfer exclusion | 100% |
| Rejected transfer correct inclusion | 100% |
| P&L net profit correctness with transfers | 100% |

---

### 5. Split Transaction Accounting

**What we're testing:** When a transaction has a confirmed business/personal split (e.g., 60% business, 40% personal), is only the business portion included in expense totals, category totals, and the P&L?

**Test set:** Ledger fixtures with split transactions at various percentages. Must include:
- Standard splits (60/40, 50/50, 80/20)
- Odd-percentage splits that produce rounding situations (e.g., 60% of $33.33 = $19.998)
- Multiple split transactions in the same category within the same period
- A ledger where split transaction rounding accumulates across hundreds of transactions — the total must still be correct

**Rounding rule (must be defined and tested):**
All monetary amounts are stored as integers in cents. When a percentage split produces a fractional cent, the result is rounded using banker's rounding (round half to even). This rule is applied per-transaction, and the total of all business portions must equal the sum of individually rounded business amounts — not a separate calculation of the percentage against the pre-split total. This ensures the P&L is exactly reproducible from the individual transaction records.

Minimum 30 split scenarios at Launch.

**Metrics:**
- Business amount correctness: the business portion of each split transaction matches the expected value (per the rounding rule)
- P&L inclusion: only business portions are summed in the P&L
- Category total inclusion: only business portions appear in category totals
- Rounding accumulation: after applying splits to 100+ transactions, the total matches the sum of individually rounded amounts exactly

**Pass criteria:**

| Metric | Threshold |
|---|---|
| Business amount correctness (per transaction) | 100% |
| P&L includes only business portions | 100% |
| Category totals include only business portions | 100% |
| Rounding accumulation correctness | 100% |

---

### 6. Period Boundary Precision

**What we're testing:** Are transactions correctly assigned to the right period (month, quarter, year) when they fall near a boundary?

A transaction on January 31 at 11:59 PM must be in January. A transaction on February 1 at 12:01 AM must be in February. But timezone matters — if Alex is in Pacific Time and the bank records in UTC, the same transaction might fall in different months depending on whose clock governs.

**Timezone rule (must be defined and tested):**
Period boundaries are governed by the business's local timezone (as set during onboarding). A transaction's effective date is the date in the business's timezone, regardless of the timezone used by the bank or payment processor. This means a bank transaction timestamped "2026-02-01T02:00:00Z" for a Pacific Time business is a January 31 transaction (6:00 PM Pacific on January 31).

**Test set:** Transactions placed at exact boundary moments across timezones. Must include:
- Month boundaries (last second of month, first second of next month)
- Quarter boundaries
- Year boundaries (December 31 / January 1)
- Transactions where the bank's UTC timestamp and the business's local date disagree
- Daylight saving time transitions (March and November in the US)
- Leap year (February 29)

Minimum 50 boundary test cases at Launch.

**Metrics:**
- Period assignment correctness: is each transaction assigned to the correct month/quarter/year per the timezone rule?
- Period total consistency: does the sum of all monthly totals equal the yearly total? (No transactions lost or double-counted at boundaries.)

**Pass criteria:**

| Metric | Threshold |
|---|---|
| Period assignment correctness | 100% |
| Period total consistency (monthly = yearly) | 100% |

---

### 7. Multi-Account Aggregation

**What we're testing:** When Alex has multiple connected accounts (2 bank accounts, 1 credit card, 2 payment processors), are cross-account totals computed correctly?

Multi-account aggregation must handle: different account types (checking, credit card, payment processor), different transaction directions (deposits vs. charges vs. payouts), and potential overlaps (a Stripe payout appears in the payment processor feed and the bank feed — it must be counted once, not twice).

**Test set:** Multi-account ledger fixtures with known correct cross-account totals. Must include:
- Two bank accounts and one credit card
- A payment processor and a bank account (where payouts create duplicate transaction risk)
- Accounts with overlapping transactions (same underlying event appearing in two feeds)
- Accounts connected at different times (one has 12 months of history, another has 3 months)

Minimum 20 multi-account fixtures at Launch.

**Metrics:**
- Cross-account income total: exact match
- Cross-account expense total: exact match
- Duplicate exclusion: overlapping transactions counted exactly once
- Account-specific totals: each individual account's totals are correct independently

**Pass criteria:**

| Metric | Threshold |
|---|---|
| Cross-account income total | 100% exact match |
| Cross-account expense total | 100% exact match |
| Duplicate exclusion | 100% |
| Per-account totals | 100% exact match |

---

### 8. Refund and Adjustment Handling

**What we're testing:** When a refund or credit memo is received for a previous expense, is it correctly reflected in the P&L and category totals?

Refunds are a common source of computation errors. A refund for an office supply purchase should reduce the Office Supplies expense total — not appear as income. A partial refund should reduce the expense by the refund amount, not the original purchase amount.

**Test set:** Ledger fixtures with refund scenarios. Must include:
- Full refund for a previous expense (category total decreases by the full amount)
- Partial refund (category total decreases by the partial amount)
- Refund that arrives in a different period than the original purchase (March purchase, April refund — does April's P&L reflect the refund? Does March's retroactively change?)
- Refund for a split transaction (60% business, 40% personal — the refund should also be split)
- Credit memo from a vendor (functionally a refund but arrives as a credit, not a reversal)

**Cross-period refund policy (must be defined and tested):**
When a refund arrives in a different period than the original purchase, the refund is recorded in the period it is received — not retroactively applied to the original period. This means March's P&L is final once March is closed. April's P&L shows the refund as a reduction in the relevant expense category. This is the standard cash-basis accounting treatment for sole proprietors.

Minimum 30 refund scenarios at Launch.

**Metrics:**
- P&L impact: the correct period's P&L reflects the refund amount
- Category impact: the correct category total is reduced (not income increased)
- Split refund handling: refund for a split transaction is correctly split
- No retroactive modification: closed periods are not altered by later refunds

**Pass criteria:**

| Metric | Threshold |
|---|---|
| P&L correctness after refund | 100% |
| Category total correctness after refund | 100% |
| Split refund handling | 100% |
| Period integrity (no retroactive changes) | 100% |

---

## Year-End Rollover

An additional cross-cutting test that applies to all dimensions: when the fiscal year changes, do all category totals reset correctly for the new year? Does the running balance carry over? Are year-over-year comparisons computed from the correct periods?

**Test set:** Ledger fixtures that span a year boundary with transactions in the last week of December and first week of January.

**Pass criteria:**
- New year category totals start at $0.00
- Running balance carries over correctly
- Year-over-year comparisons pull the correct full-year figures
- All: 100% exact match

---

## Test Set Requirements — Ledger Fixtures

Financial computation evals require synthetic ledger states with known correct outputs. These are deterministic — given the same input, the correct output is always the same.

**Fixture construction:**
- Every fixture is built from explicit transaction records with known amounts, dates, categories, and statuses
- Expected outputs (P&L, category totals, running balances) are computed independently — never by the system under test
- Independent verification means: a second, separate computation (even a spreadsheet) produces the same result. If the two computations disagree, the fixture is not usable until the discrepancy is resolved.
- Fixtures are version-controlled alongside the eval suite

**Fixture coverage requirements (minimum at Launch):**
- 50 P&L fixtures across varying complexity levels
- 30 running balance fixtures
- 30 transfer scenarios
- 30 split transaction scenarios
- 50 period boundary cases
- 20 multi-account fixtures
- 30 refund scenarios
- 5 year-end rollover fixtures

---

## Pass / Fail Summary

| Dimension | Key Threshold | Hard Blocker? |
|---|---|---|
| P&L income/expense/profit exact match | 100% | Yes |
| Category totals exact match | 100% | Yes |
| Category sum equals P&L expense total | 100% | Yes |
| Running balance exact match (every step) | 100% | Yes |
| Transfer exclusion from P&L | 100% | Yes |
| Split transaction business-only inclusion | 100% | Yes |
| Rounding accumulation correctness | 100% | Yes |
| Period boundary assignment | 100% | Yes |
| Monthly totals sum to yearly total | 100% | Yes |
| Multi-account cross-totals | 100% | Yes |
| Duplicate transaction exclusion | 100% | Yes |
| Refund P&L and category impact | 100% | Yes |
| Period integrity (no retroactive changes) | 100% | Yes |
| Year-end rollover | 100% | Yes |

Every row is a hard blocker. Every threshold is 100%. There is no acceptable error rate for financial computation.

---

*Penny · AI Evaluation Criteria: Financial Computation Accuracy · v2 · April 2026*
*Standard: 100% correctness. No statistical threshold. No acceptable error rate.*
*Maintained alongside the codebase. Every computation error is a new test case.*
