# Penny — AI Evaluation Criteria: Conversational & Financial Q&A
**Version 2 · April 2026**

> Part of the Penny AI Eval Suite — one of five evaluation documents.
> See `penny-architecture.md` → AI Architecture → Model Evaluation Before Deployment for the full picture.
>
> **Eval Suite:**
> - `penny-ai-evals.md` (Transaction Intelligence)
> - `penny-evals-conversational-qa.md` ← you are here (Conversational & Financial Q&A)
> - `penny-evals-data-capture.md` (Receipt & Invoice Capture)
> - `penny-evals-financial-computation.md` (Financial Computation Accuracy)
> - `penny-evals-anomaly-detection.md` (Anomaly & Pattern Detection)

---

## Scope

This document defines evaluation criteria for Penny's conversational AI layer — the part of the product that answers Alex's questions about her business in plain English, and proactively surfaces insights and alerts.

This is distinct from transaction processing. The AI here is doing retrieval + reasoning + language generation on top of the ledger. The failure mode is different: not a wrong category, but a wrong number, a hallucinated fact, or an insight that sounds helpful but is misleading.

This is the highest-risk area for user trust. When Penny tells Alex a number — "You made $8,200 in profit this month" — Alex makes business decisions based on it. A wrong number here is not a minor categorization error that gets corrected later. It is misinformation delivered with confidence in a trusted voice.

---

## The Benchmark

**Human benchmark:** A human bookkeeper answering the same questions would look up the answer in the ledger, compute it manually, and relay it to the client. An experienced bookkeeper gets this right nearly 100% of the time because the answer is deterministic — it is in the data. The only errors are lookup mistakes (wrong date range, wrong category) or arithmetic errors.

**The standard for Penny:** Penny's conversational answers are derived from verified ledger data through structured queries — the AI generates the language, not the answer. This means the accuracy standard is closer to computation accuracy than AI inference accuracy. When the architecture is working correctly, the only failure modes are: (1) the retrieval layer pulls the wrong data, (2) the arithmetic is wrong, or (3) the AI hallucinates something not in the payload. All three are preventable with the right eval framework.

---

## Maturity Tiers

The same three-tier framework as Transaction Intelligence applies. Tiers advance based on data volume and founder decision.

| Tier | Trigger | What it means |
|---|---|---|
| **Launch** | Product goes live | Answers are correct and grounded. Penny handles common questions reliably. |
| **Growth** | 500+ active users | Penny handles complex, multi-step questions. Insights are genuinely useful. |
| **Mastery** | 2,000+ active users | Penny anticipates questions before Alex asks them. Every answer is perfect. |

---

## The Eight Evaluation Dimensions

### 1. Retrieval Accuracy

**What we're testing:** When Alex asks a question, does the system retrieve the correct data from the ledger before passing it to the AI for language generation?

This is the foundation — if the retrieval is wrong, the answer is wrong regardless of how well the AI generates language. The retrieval layer must correctly interpret: which accounts, which date range, which categories, which transaction types.

**Test set:** A curated set of questions paired with a known ledger state and the expected retrieval scope (which transactions, which date range, which accounts should be included in the data payload).

Minimum 200 question-ledger pairs at Launch, 500 at Growth, 1,000 at Mastery.

**Test cases must include:**
- Explicit date ranges: "How much did I spend in March?"
- Relative date references: "last month", "this quarter", "the past 90 days"
- Ambiguous time references: "recently" (should Penny clarify or default to current month?)
- Category-specific queries: "What did I spend on software?"
- Vendor-specific queries: "How much did I pay Figma?"
- Client-specific queries: "Did Studio Nine pay yet?"
- Multi-account queries: "What's my total income across all accounts?"
- Cross-period comparisons: "Am I spending more on travel than last quarter?"
- Aggregate queries: "What are my top expenses?"
- Queries that span a period boundary (month-end, year-end)

**Metrics:**
- Retrieval scope correctness: does the query pull exactly the right transactions? (No missing, no extra)
- Date range correctness: does the query use the correct start and end dates?
- Account scope correctness: does the query include the right accounts?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Retrieval scope correctness | ≥ 95% | ≥ 98% | ≥ 99.5% |
| Date range correctness | ≥ 97% | ≥ 99% | 100% |
| Account scope correctness | 100% | 100% | 100% |

---

### 2. Arithmetic Accuracy

**What we're testing:** When a question requires computation (summing expenses, computing profit, calculating a percentage change), is the arithmetic correct?

This is not AI inference — it is math. The acceptable error rate is zero. A P&L that is off by one dollar is wrong. See `penny-evals-financial-computation.md` for the full computation eval. This dimension tests computation specifically within the context of answering conversational questions.

**Test set:** A subset of the retrieval test set where the question requires computation. Each case has a pre-computed expected answer verified by independent calculation.

Minimum 100 computation questions at Launch, 300 at Growth.

**Metrics:**
- Exact match rate: does the computed answer match the expected answer to the cent?
- Rounding consistency: when percentages or ratios are involved, does Penny round consistently (always same direction, same precision)?

**Pass criteria (all tiers):**

| Metric | All Tiers |
|---|---|
| Exact match rate (dollar amounts) | 100% |
| Rounding consistency | 100% |

**Hard blocker:** A single arithmetic error is a deployment blocker. Financial computation correctness is binary — there is no acceptable error rate.

---

### 3. Hallucination Prevention

**What we're testing:** Does Penny ever assert something that is not present in the data payload she was given?

Hallucination in a financial product is not a minor quality issue — it is misinformation delivered in a trusted voice. If Penny says "You spent $400 on software this month" and the actual figure is $340, Alex may make a budget decision based on a number that doesn't exist.

**Test set:** Every question-response pair in the eval run is tested. Additionally, a curated set of adversarial questions designed to elicit hallucination:
- Questions about data that is not in the ledger: "How much did I spend on marketing?" (when there are no marketing transactions)
- Questions about future events: "Will I be profitable next month?"
- Questions that combine real data with an implied assumption: "Since my software costs went up, should I switch providers?" (the costs may not have gone up)
- Questions that reference transactions from a different time period than implied

Minimum 50 adversarial hallucination test cases at Launch, 200 at Mastery.

**Metrics:**
- Hallucination rate: percentage of responses containing any claim not directly supported by the data payload
- Fabricated number rate: percentage of responses containing a specific number (dollar amount, percentage, count) that does not match the source data

**Pass criteria (all tiers):**

| Metric | All Tiers |
|---|---|
| Hallucination rate | 0% |
| Fabricated number rate | 0% |

**Hard blocker:** A single hallucinated fact or fabricated number is a deployment blocker. This is the product's core trust contract.

---

### 4. Disambiguation and Clarification

**What we're testing:** When Alex's question is ambiguous, does Penny clarify rather than guess?

Ambiguity is common in natural language financial questions. "How much did I pay John?" (which John?). "What did I spend last quarter?" (calendar quarter or trailing 90 days?). "How are my expenses?" (compared to what?). The correct behavior is always to ask for clarification — never to silently pick an interpretation.

**Test set:** A curated set of deliberately ambiguous questions paired with the expected Penny behavior (clarify, not answer).

Test cases must include:
- Entity ambiguity: two clients or vendors with the same or similar names
- Time ambiguity: "recently", "last quarter", "this year" (when the fiscal year may differ from calendar year)
- Scope ambiguity: "How much did I spend?" (on what? in what period? from which account?)
- Comparative ambiguity: "Am I doing better?" (compared to what baseline?)
- Implicit assumptions: "Why did my costs go up?" (costs may not have gone up)

Minimum 50 ambiguity test cases at Launch, 150 at Growth.

**Metrics:**
- Clarification rate: when given an ambiguous question, does Penny ask for clarification instead of guessing?
- False clarification rate: does Penny ask for clarification on questions that are not actually ambiguous? (This is annoying — it should not happen often.)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Clarification on ambiguous questions | ≥ 90% | ≥ 95% | ≥ 99% |
| False clarification rate | ≤ 10% | ≤ 5% | ≤ 2% |

---

### 5. Multi-Turn Conversation Coherence

**What we're testing:** When Alex asks a follow-up question that depends on context from the previous exchange, does Penny correctly carry the context?

"How much did I spend on software this month?" → "What about last month?" — Penny must interpret the second question as "How much did I spend on software last month?" and not lose the category context. This is a retrieval and reasoning challenge, not just language generation.

**Test set:** A curated set of multi-turn conversation sequences, each with 2–5 exchanges, where later questions depend on earlier context. Each turn has an expected retrieval scope and expected answer.

Minimum 50 multi-turn sequences at Launch, 200 at Growth.

Test cases must include:
- Category carry-over: "How much on software?" → "And last quarter?"
- Vendor carry-over: "What did I pay Figma?" → "When was the last payment?"
- Comparison follow-ups: "Am I spending more this month?" → "On what specifically?"
- Narrowing: "Show me expenses" → "Just the ones over $500"
- Context switches: "How about income instead?" (Penny must recognize the topic changed)

**Metrics:**
- Context retention accuracy: does Penny correctly interpret the follow-up in context?
- Context carry-over correctness: does the retrieval scope for the follow-up reflect the carried context?

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Context retention accuracy | ≥ 85% | ≥ 93% | ≥ 98% |
| Context carry-over correctness | ≥ 85% | ≥ 93% | ≥ 98% |

---

### 6. Unanswerable Question Handling

**What we're testing:** When Alex asks something Penny cannot answer from the ledger data, does Penny say so honestly — rather than guessing, approximating, or deflecting?

This is the "honest uncertainty" principle applied to conversation. Penny must distinguish between: (1) questions she can answer from the data, (2) questions she cannot answer because the data isn't there, and (3) questions she should not answer because they involve tax advice, legal advice, or financial projections.

**Test set:** A curated set of unanswerable questions across three categories:

- **Data not available:** "How much did I spend on marketing?" (no marketing transactions exist). "What did I pay my landlord in 2023?" (no 2023 data connected).
- **Outside Penny's scope:** "How much tax will I owe?" "Should I switch to an S-corp?" "Is this expense deductible?"
- **Speculative questions:** "Will I be profitable next quarter?" "Can I afford to hire someone?"

Minimum 50 unanswerable cases at Launch, 150 at Growth.

**Metrics:**
- Honest refusal rate: when the question is unanswerable, does Penny say so clearly?
- Scope boundary accuracy: when the question is outside Penny's scope (tax, legal, projections), does Penny decline and suggest the right resource (e.g., "That's a great question for your accountant")?
- False refusal rate: does Penny refuse to answer questions she actually can answer? (This is a usability failure.)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Honest refusal rate | ≥ 95% | ≥ 98% | 100% |
| Scope boundary accuracy | 100% | 100% | 100% |
| False refusal rate | ≤ 5% | ≤ 3% | ≤ 1% |

**Hard blocker at all tiers:** Scope boundary accuracy is 100% — Penny must never provide tax advice, legal advice, or financial projections. This is a safety and compliance requirement.

---

### 7. Proactive Insight Quality

**What we're testing:** When Penny proactively surfaces an insight or alert — "Your travel spending is 40% higher than last month" — is it factually correct, timely, and genuinely useful?

Proactive insights are a product differentiator. But a wrong insight erodes trust faster than no insight at all. And an insight that fires every week becomes noise that Alex ignores. This eval tests both accuracy and signal quality.

**Test set:** A set of synthetic ledger states designed to trigger (or not trigger) proactive insights. Each state has pre-defined expected insights and expected non-insights (patterns that should not trigger an alert).

Minimum 100 ledger state scenarios at Launch, 300 at Growth.

**Metrics:**
- Factual accuracy of surfaced insights: are the numbers in the insight correct?
- Trigger precision: what percentage of triggered insights are genuinely informative? (Not noise, not stating the obvious.)
- Trigger recall: what percentage of genuinely informative patterns in the ledger state are detected and surfaced?
- False positive rate per user per week: on average, how many non-useful alerts does a user receive per week? (This directly measures alert fatigue.)

**Pass criteria by tier:**

| Metric | Launch | Growth | Mastery |
|---|---|---|---|
| Insight factual accuracy | 100% | 100% | 100% |
| Trigger precision | ≥ 80% | ≥ 90% | ≥ 97% |
| Trigger recall | ≥ 60% | ≥ 75% | ≥ 90% |
| Max false positives per user per week | ≤ 1 | ≤ 0.5 | ≤ 0.25 |

**Why precision starts high and the alert budget is tight:** Industry-standard bookkeeping tools surface insights constantly — weekly spending summaries, category breakdowns, generic tips. Users learn to ignore them. Penny takes the opposite approach: proactive insights are rare and always earned. At Launch, a maximum of one non-useful insight per week. By Mastery, a false positive insight surfaces roughly once a month. When Penny proactively tells Alex something about her business, Alex reads it — because it has always been worth reading. This is the standard that builds word-of-mouth: "My bookkeeper only tells me things that matter."

**Cross-reference — total notification load:** This false positive budget governs proactive insight notifications only. Penny also sends anomaly-type alerts (unusual amounts, duplicates, transfers) governed by `penny-evals-anomaly-detection.md` → Alert Fatigue. The combined worst-case notification load at Launch is approximately 6 per week (5 anomaly alerts + 1 insight false positive ceiling). By Mastery, the combined ceiling drops to approximately 1–2 per week. The Notification Service enforces the combined budget and prioritizes across both sources.

**Hard blocker at all tiers:** Insight factual accuracy is 100%. An insight that says "Your travel spending is 40% higher" when it is actually 15% higher is a wrong number delivered proactively — worse than a wrong answer to a question, because Alex didn't even ask.

---

### 8. Voice and Tone Consistency

**What we're testing:** Does every response follow Penny's voice — short sentences, plain English, no accounting jargon, no tax or legal advice, no filler?

This dimension applies to all conversational output — answers, insights, and errors alike. It is tested with the same automated checks and human review described in the Transaction Intelligence eval's Response Quality dimension, plus conversation-specific checks.

**Additional checks for conversational responses:**
- Response length: answers to simple questions should be 1–3 sentences. Answers should not be verbose when brevity is clearer.
- Lead with the answer: Penny gives the number first, context second. "You made $8,200 in April" — not "Looking at your income and expenses for the month of April..."
- Closing the loop: after every action-oriented exchange, Penny confirms what happened and gives one useful next piece of information.
- Emotional calibration: positive financial news gets a warm tone. Negative news gets an honest but calm tone. Penny never sounds alarmed, and never uses false enthusiasm.

**Pass criteria:** Same as Transaction Intelligence Response Quality — all automated checks pass, human review (scaled per tier) surfaces no harmful, confusing, or off-voice responses.

---

## Test Set Requirements — Ledger Fixtures

Conversational Q&A evals require synthetic ledger states with known correct answers pre-computed. These are more complex than transaction test sets because they require full ledger context (multiple accounts, multiple months, multiple categories) to produce meaningful questions.

**Fixture requirements:**
- Minimum 10 distinct ledger fixtures at Launch, 30 at Growth
- Each fixture represents a complete business: accounts, transactions, vendors, categories, invoices, splits
- Each fixture has pre-computed correct answers for a set of standard questions
- Fixtures must span: different business types (freelancer, product seller, service business), different business sizes (50 transactions/month to 500 transactions/month), different time spans (1 month to 24 months)
- At least 2 fixtures must have known edge cases: a business with only expenses (no income yet), a business where the bank feed has a gap, a business with many split transactions

---

## Pass / Fail Summary — Launch Tier

| Dimension | Key Threshold | Hard Blocker? |
|---|---|---|
| Retrieval scope correctness | ≥ 95% | Yes |
| Date range correctness | ≥ 97% | Yes |
| Account scope correctness | 100% | Yes |
| Arithmetic exact match | 100% | Yes |
| Hallucination rate | 0% | Yes |
| Fabricated number rate | 0% | Yes |
| Clarification on ambiguous questions | ≥ 90% | Yes |
| Context retention (multi-turn) | ≥ 85% | Yes |
| Honest refusal rate | ≥ 95% | Yes |
| Scope boundary accuracy (tax/legal) | 100% | Yes |
| Insight factual accuracy | 100% | Yes |
| Insight trigger precision | ≥ 80% | Yes |
| Max false positives per user per week | ≤ 1 | Yes |
| Voice and tone compliance | Per Response Quality spec | Yes |

Every row is a hard blocker. There is no weighting, no averaging, no exceptions.

---

*Penny · AI Evaluation Criteria: Conversational & Financial Q&A · v2 · April 2026*
*Maintained alongside the codebase. Every production error is a new test case.*
