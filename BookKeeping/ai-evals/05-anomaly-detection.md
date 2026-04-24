# Penny — AI Evaluation Criteria: Anomaly & Pattern Detection
**Version 2 · April 2026**

> Part of the Penny AI Eval Suite — one of five evaluation documents.
> See `penny-architecture.md` → AI Architecture → Model Evaluation Before Deployment for the full picture.
>
> **Eval Suite:**
> - `penny-ai-evals.md` (Transaction Intelligence)
> - `penny-evals-conversational-qa.md` (Conversational & Financial Q&A)
> - `penny-evals-data-capture.md` (Receipt & Invoice Capture)
> - `penny-evals-financial-computation.md` (Financial Computation Accuracy)
> - `penny-evals-anomaly-detection.md` ← you are here (Anomaly & Pattern Detection)

---

## Scope

This document defines evaluation criteria for Penny's pattern recognition and anomaly detection layer — the part of the product that identifies unusual transactions, duplicate entries, inter-account transfers, and spending pattern changes that Alex should be aware of.

Getting this wrong in either direction is costly. A false negative (missing a real anomaly) means a potential error silently enters the ledger — an overcharge goes unnoticed, a duplicate transaction inflates expenses, a transfer is booked as income and expense. A false positive (flagging a normal transaction as anomalous) erodes Alex's trust in Penny and creates friction in a product that is supposed to be effortless.

The balance between these failure modes is different for each detection type, and this eval defines the trade-offs explicitly.

---

## The Benchmark

**There is no direct industry benchmark for anomaly detection in bookkeeping AI.** Fraud detection in banking provides the nearest reference — but our problem is different. We are not detecting fraud (a rare, adversarial event). We are detecting errors, duplicates, transfers, and unusual-but-legitimate patterns in a trusted user's own data. The base rate of anomalies is much higher than fraud (5–15% of transactions may need flagging, vs. 0.1% fraud rates in banking), and the cost of false positives is proportionally higher (Alex sees every flag, while fraud alerts go to a review team).

**The right benchmark is trust:** Does Alex trust Penny's flags? If Penny flags 10 things and 7 are real, Alex learns to pay attention. If Penny flags 10 things and 3 are real, Alex learns to dismiss them. The threshold for trust is precision above 70% at minimum — and it must improve from there.

---

## Maturity Tiers

| Tier | Trigger | What it means |
|---|---|---|
| **Launch** | Product goes live | Catches the critical anomalies (duplicates, transfers, large deviations). Some false positives expected. |
| **Growth** | 500+ active users | Precise enough that Alex trusts every flag. False positives are rare. |
| **Mastery** | 2,000+ active users | Penny catches patterns Alex wouldn't notice herself. Near-zero noise. |

---

## The Six Evaluation Dimensions

### 1. Amount Anomaly Detection — Vendor Pattern

**What we're testing:** When a known vendor charges an amount that deviates significantly from their established pattern, does Penny flag it for review?

This is the rule that protects auto-approval from becoming a silent error source. A vendor that usually charges $16/month suddenly charging $160 must be surfaced — even if that vendor is on the auto-approve list. But a vendor that charges $49.99 some months and $52.49 others (slight variation) should not trigger a flag every month.

**What counts as "anomalous" — the threshold model:**
The anomaly threshold is not a single fixed number. It adapts based on the vendor's established pattern:

- **For vendors with a stable recurring charge** (same amount ±1% for 3+ months): any deviation greater than 5% of the established amount triggers a flag. A $16 subscription jumping to $16.80 (5%) is borderline and flagged; $16 jumping to $32 is unambiguous.
- **For vendors with variable but bounded charges** (amount varies month to month but within a range — e.g., a utility bill between $80 and $140): a charge outside the historical range (min to max, plus a 20% buffer) triggers a flag. A utility bill at $180 when the range is $80–$140 is anomalous.
- **For vendors with insufficient history** (fewer than 3 data points): no automatic anomaly detection is applied. The transaction goes through the normal categorization pipeline with standard confidence scoring.

**Test set:** Synthetic vendor histories with known normal patterns and planted anomalies. Must include:
- Stable recurring vendors with small anomalies (price increase of 10%)
- Stable recurring vendors with large anomalies (10x charge)
- Variable-amount vendors with charges just inside and just outside their normal range
- Vendors with seasonal patterns (higher in December, lower in January)
- Vendors with a legitimate price increase (new subscription tier — anomalous on first occurrence, normal thereafter)
- Vendors with insufficient history (should not trigger anomaly detection)

Minimum 200 vendor-transaction pairs at Launch, 500 at Growth.

**Metrics:**
- Recall: what percentage of real anomalies are correctly flagged?
- Precision: what percentage of flagged transactions are genuine anomalies?
- Alert-to-correction ratio: of the anomalies flagged, what percentage does Alex actually correct? (Measured in production, not in eval — but tracked as a health metric.)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Recall | ≥ 90% | ≥ 95% | ≥ 98% |
| Precision | ≥ 80% | ≥ 90% | ≥ 97% |

**Why recall is prioritized over precision, but precision still starts high:** A missed anomaly that silently books a wrong amount into the ledger is worse than an extra approval card Alex dismisses. But we refuse to train Alex to ignore Penny's flags. At Launch, 4 out of 5 flags must be real. By Mastery, Penny's flags are almost always right — Alex trusts every one. This is far above industry standard, where most bookkeeping tools either flag everything (destroying signal) or flag nothing (missing problems).

---

### 2. Inter-Account Transfer Detection

**What we're testing:** When the same amount moves out of one of Alex's connected accounts and into another within the detection window, does Penny identify it as a likely transfer rather than booking it as income and expense?

An undetected transfer inflates both revenue and expense figures — the P&L is wrong in both directions. This is one of the most common bookkeeping errors for small business owners with multiple accounts.

**Test set:** Synthetic multi-account transaction histories with planted transfers and distractors. Must include:
- Same-bank transfers (same amount, same day)
- Cross-bank ACH transfers (same amount, 1–3 business day delay)
- Wire transfers (same amount, 1–2 business day delay)
- Near-matches that are not transfers (two legitimate transactions from different sources that happen to be the same amount)
- Partial matches (a transfer of $5,000 from checking, but only $4,970 arrives in savings due to a fee — the system should still flag this)
- Multiple transfers on the same day (Alex moves money between several accounts)
- Transfers that cross a month boundary (debit in January, credit in February)

Minimum 100 transfer scenarios at Launch, 300 at Growth.

**Metrics:**
- Recall: what percentage of real transfers are correctly identified?
- Precision: what percentage of flagged transfers are genuine? (A false positive here — flagging a real income payment as a transfer — would incorrectly exclude it from the P&L.)
- Partial match detection: are transfers with small fee differences still detected?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Recall | ≥ 92% | ≥ 97% | ≥ 99% |
| Precision | ≥ 85% | ≥ 93% | ≥ 97% |
| Partial match detection (within 2% fee) | ≥ 80% | ≥ 90% | ≥ 95% |

**Why precision matters more here than for amount anomalies:** A false positive in transfer detection means a real income or expense transaction is incorrectly excluded from the P&L. That is a data integrity error — the P&L is wrong. This is worse than a false positive on an amount anomaly (which just creates an extra approval card).

---

### 3. Duplicate Transaction Detection

**What we're testing:** When the same transaction appears twice — possible when multiple data sources overlap, when a bank re-posts a transaction, or when Alex manually enters something that also arrives via bank feed — does Penny flag it rather than booking it twice?

**Test set:** Synthetic transaction histories with planted duplicates and near-duplicates. Must include:
- Exact duplicates (same amount, vendor, date — a bank re-post)
- Near-duplicates from different sources (Stripe webhook and bank feed for the same underlying payment — same amount, different vendor string, 1–2 day difference)
- Same-vendor same-day different transactions (Alex buys coffee twice at the same shop — these are NOT duplicates and must not be flagged)
- Manual entry that matches a bank feed transaction (Alex enters a receipt, and the bank charge arrives the next day)
- Duplicates across different connected accounts (a credit card charge and the credit card payment from the bank account — these are related but not duplicates)

Minimum 100 duplicate scenarios at Launch, 300 at Growth.

**Metrics:**
- Recall: what percentage of real duplicates are correctly detected?
- Precision: what percentage of flagged duplicates are genuine? (Falsely flagging a real transaction as a duplicate and blocking it from the ledger is a serious data integrity error.)
- Same-vendor-same-day handling: what percentage of legitimate same-vendor-same-day transactions are correctly allowed through without a false duplicate flag?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Recall | ≥ 85% | ≥ 93% | ≥ 97% |
| Precision | ≥ 90% | ≥ 95% | ≥ 98% |
| Same-vendor-same-day correctness | ≥ 92% | ≥ 96% | ≥ 99% |

**Why precision is prioritized over recall for duplicates:** A false positive (flagging a real transaction as a duplicate) means a legitimate expense is blocked from the ledger. Alex does not see it, does not approve it, and her books are incomplete. This is worse than a missed duplicate (which books a charge twice — bad, but visible and correctable).

---

### 4. Spending Pattern Alerts

**What we're testing:** When Alex's spending in a category changes significantly relative to her own historical baseline, does Penny surface a proactive alert? And is that alert genuinely useful — or noise?

This is the "Penny surfaces an insight" capability. It is the most subjective dimension in the eval suite. Unlike amount anomalies (where the threshold is mathematical) or duplicates (where the answer is binary), spending pattern alerts require judgment about what is "significant" and what is "useful."

**What triggers an alert — the threshold model:**
A spending pattern alert is triggered when a category's spending in the current period deviates from Alex's historical baseline by more than a defined threshold. The baseline is the rolling average of the most recent 3 complete months (excluding the current month). The threshold is:

- **For categories with stable historical spending:** alert when current-period spending exceeds the baseline by 30% or more, or falls below by 40% or more.
- **For categories with highly variable spending:** alert when current-period spending exceeds the historical maximum by 20% or more.
- **Seasonal adjustment:** If the model has 12+ months of history and a category shows a clear seasonal pattern (e.g., higher travel in summer, higher supplies in Q4), the baseline is adjusted to the same period in the prior year rather than the trailing 3-month average.

**Test set:** Synthetic ledger histories spanning 6–18 months with planted spending changes. Must include:
- Gradual increase in a category (10% per month for 3 months — should this alert? Only when it crosses the threshold.)
- Sudden spike (one month 3x the baseline — clear alert)
- Seasonal pattern with expected holiday increase (should not alert if seasonal pattern is recognized)
- New category that didn't exist before (Alex starts spending on a category for the first time — this is not an "increase," it's a new pattern)
- Decreased spending (a major expense disappears — also worth surfacing)
- Noisy categories where spending naturally varies (should not alert every month)

Minimum 100 pattern scenarios at Launch, 300 at Growth.

**Metrics:**
- Alert precision: percentage of fired alerts that are genuinely informative (evaluated by human review of each alert against the ledger context)
- Alert recall: percentage of genuinely significant spending changes that are detected
- False positive rate per user per month: average number of non-useful spending alerts per user per month. This is the alert fatigue metric.
- Seasonal pattern recognition: when 12+ months of data exist, does the model correctly adjust for seasonal patterns rather than alerting on expected variation?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Alert precision | ≥ 75% | ≥ 88% | ≥ 95% |
| Alert recall | ≥ 70% | ≥ 85% | ≥ 93% |
| False positives per user per month | ≤ 2 | ≤ 1 | ≤ 0.5 |
| Seasonal pattern recognition | Not required | ≥ 80% | ≥ 93% |

**Why these thresholds are set above industry standard:** Most bookkeeping tools treat alerts as a volume game — flag everything, let the user sort it out. That trains users to ignore notifications entirely. Penny takes the opposite approach: speak only when it matters. At Launch, 3 out of 4 spending alerts must be genuinely informative. By Mastery, Penny surfaces a spending insight roughly once every two months per user — and when she does, Alex pays attention because it has always been worth her time. The maximum 2 false positives per month at Launch means Alex sees at most one non-useful spending alert every two weeks. This is far quieter than any competing product.

---

### 5. New Vendor Risk Assessment

**What we're testing:** When a transaction arrives from a vendor Penny has never seen before, is the transaction handled with appropriate caution?

A first-time vendor has no history — there is no established pattern to compare against. But the transaction may still be unusual in other ways: an unusually large amount for the category, a vendor name that looks suspicious, or a transaction type that is uncommon for Alex's business.

This is not anomaly detection in the strict sense — it is risk-appropriate handling of unknown entities. The eval tests whether Penny applies the right level of scrutiny to new vendors.

**Test set:** Transactions from vendors not present in the vendor memory, with varying risk signals. Must include:
- Normal first-time vendor (reasonable amount, clear vendor name, common category)
- Large-amount first-time vendor (first transaction is $5,000+ — warrants extra attention even if the category is correct)
- Suspicious vendor name (vague, generic, or garbled — "MISC PAYMENT", "TRANSFER 8273")
- First-time vendor in a category that is new for this business (Alex has never spent on "Equipment" before — first transaction in a new category from an unknown vendor)
- Legitimate new recurring vendor (Alex signed up for a new subscription — first charge should be surfaced, subsequent charges should normalize)

Minimum 100 new vendor cases at Launch, 200 at Growth.

**Metrics:**
- Appropriate handling rate: percentage of new vendor transactions where Penny's behavior (surface for review, auto-categorize with low confidence, flag for attention) matches the expected behavior for the risk level
- Large-amount surfacing: percentage of large first-time transactions (above a defined threshold, e.g., $500) that are surfaced for explicit review rather than auto-categorized
- False alarm rate: percentage of normal first-time vendors that are flagged as suspicious when they are actually routine

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Appropriate handling rate | ≥ 85% | ≥ 92% | ≥ 97% |
| Large-amount surfacing (≥ $500) | ≥ 95% | ≥ 98% | 100% |
| False alarm rate | ≤ 15% | ≤ 8% | ≤ 3% |

---

### 6. Alert Timeliness

**What we're testing:** How quickly after the triggering transaction does the anomaly alert surface to Alex?

An anomaly that is detected 3 days after the transaction is less useful than one detected within minutes. For time-sensitive anomalies (a sudden large charge, a possible duplicate), speed matters.

**Metrics:**
- Time from transaction ingestion to alert surfaced in the thread
- Measured across all anomaly types (amount anomaly, transfer, duplicate, spending pattern)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| P50 alert latency | < 30 seconds | < 15 seconds | < 10 seconds |
| P95 alert latency | < 5 minutes | < 2 minutes | < 1 minute |
| Spending pattern alert latency | < 1 hour | < 30 minutes | < 10 minutes |

**Note:** Spending pattern alerts have a longer acceptable latency because they require aggregation across multiple transactions — they cannot fire until enough data for the current period has accumulated.

---

## Test Set Requirements

Anomaly detection evals require synthetic transaction histories with planted anomalies and known correct detection outcomes. These are more complex than single-transaction test sets because anomaly detection depends on historical context.

**Fixture requirements:**
- Each fixture is a complete transaction history for a business: 3–18 months of vendor history, multiple accounts, established patterns
- Anomalies are planted at known positions with known correct detection outcomes
- Distractors (normal transactions that resemble anomalies) are included to test precision
- Fixtures must span all three business types and include varying transaction volumes (low-volume freelancer to high-volume product seller)

**Fixture construction:**
- Base patterns are drawn from real transaction patterns observed during concierge onboarding
- Anomalies are injected synthetically at controlled levels
- Expected outcomes (flag/no-flag, transfer/not-transfer, duplicate/not-duplicate) are pre-labeled
- Every fixture is reviewed for realism before inclusion — an implausible transaction history produces meaningless eval results

---

## Alert Fatigue — The Cross-Cutting Metric

Across all anomaly types, the total number of flags and alerts Alex receives must be manageable. A product that sends 20 alerts per week is not a helpful bookkeeper — it is an annoying notification machine.

**Total alert budget per user per week (across all anomaly types):**

| Tier | Maximum alerts per user per week |
|---|---|
| Launch | ≤ 5 |
| Growth | ≤ 3 |
| Mastery | ≤ 1 |

This is a hard metric and a deployment consideration. Industry standard bookkeeping tools bombard users with notifications — every transaction, every categorization, every import. The result: users disable notifications entirely and stop engaging. Penny is the opposite. Five alerts per week at Launch means roughly one per business day — each one earned, each one worth Alex's attention. By Mastery, Penny surfaces at most one anomaly alert per week. When Penny speaks, Alex listens — because Penny has never wasted her time.

If a user's genuine anomaly rate exceeds the budget (they have a legitimately chaotic financial situation), the system prioritizes the highest-impact anomalies and batches lower-priority ones into a weekly summary rather than firing them individually. The budget is never exceeded by lowering quality — it is maintained by raising the bar for what earns a real-time alert.

**Cross-reference — total notification load:** This alert budget governs anomaly-type notifications only (unusual amounts, duplicates, transfers, spending changes). Penny also sends proactive insights via the conversational layer (see `penny-evals-conversational-qa.md` → Proactive Insight Quality). The combined notification load — anomaly alerts plus proactive insights — must remain manageable. At Launch, the worst-case combined load is approximately 6 notifications per week (5 anomaly alerts + 1 proactive insight false positive ceiling). By Mastery, the combined ceiling is approximately 1–2 per week. The Notification Service is responsible for enforcing the combined budget and prioritizing across both sources.

---

## Pass / Fail Summary — Launch Tier

| Dimension | Key Threshold | Hard Blocker? |
|---|---|---|
| Amount anomaly recall | ≥ 90% | Yes |
| Amount anomaly precision | ≥ 80% | Yes |
| Transfer detection recall | ≥ 92% | Yes |
| Transfer detection precision | ≥ 85% | Yes |
| Partial transfer match (within 2% fee) | ≥ 80% | Yes |
| Duplicate detection recall | ≥ 85% | Yes |
| Duplicate detection precision | ≥ 90% | Yes |
| Same-vendor-same-day correctness | ≥ 92% | Yes |
| Spending alert precision | ≥ 75% | Yes |
| Spending alert recall | ≥ 70% | Yes |
| Spending false positives per user per month | ≤ 2 | Yes |
| New vendor appropriate handling | ≥ 85% | Yes |
| Large-amount new vendor surfacing | ≥ 95% | Yes |
| Alert latency (P95) | < 5 minutes | Yes |

Every row is a hard blocker. There is no weighting, no averaging, no exceptions.

---

*Penny · AI Evaluation Criteria: Anomaly & Pattern Detection · v2 · April 2026*
*Maintained alongside the codebase. Every detection failure is a new test case.*
