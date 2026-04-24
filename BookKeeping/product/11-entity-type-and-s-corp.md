# 11 — Entity Type and Full S-Corp Support
*Why entity type is architectural, and what full S-Corp support means at launch.*

Decisions covered: D72, D83.

---

## Core decision

Every ledger, export, category, and tax calculation in Penny **knows Alex's entity type**:

- Sole proprietor
- Single-member LLC
- Multi-member LLC (feature-flagged, post-launch)
- **S-Corp (full support at launch)**
- C-Corp (feature-flagged, post-launch)

---

## Architectural principle

**Do not retrofit entity type.** Retrofitting costs **5–10×** what building it right costs now. Entity type is a **foundational data-model concept**, not a feature flag.

This is why entity type is asked **before** bank connection in onboarding (D83) — see [03-onboarding.md](03-onboarding.md).

---

## Launch scope — FULL S-Corp, not a half-baked phase

### In scope at launch

**Sole prop and single-member LLC flows** (≈95% overlap with each other).

**Full S-Corp support**, including:

#### Payroll ingestion — all three providers at launch

Gusto, OnPay, and QBO Payroll APIs. Not sequenced — all three live at launch, per D72.

Alex connects her payroll provider in Connect; Penny pulls:

- Salary
- Employee tax withholding
- Employer-side taxes
- Pay dates

#### Owner's draw as a first-class balance-sheet category

- Distinct from income
- Distinct from expenses
- Penny reports distributions separately

#### Owner's-draw one-tap confirmation flow

**Never silently auto-booked, even after pattern is learned.**

**Why:** S-Corp categorisation errors (salary vs. draw vs. self-reimbursement) have IRS consequences that expense mis-categorisation does not. Parallel to income confirmation in D13.

#### W-2 self-payment handling

- Alex pays herself a "reasonable salary"
- Penny books salary correctly
- Treats remaining distributions as owner's draw

#### Separate onboarding branch for S-Corp-elected Alexes

With entity-type-specific questions (framing in D83).

#### 1120-S export mapping

Alongside Schedule C. TurboTax Business / H&R Block Business compatibility.

#### AI evals extended

To S-Corp-specific signals: distinguishing salary from owner draw from expense reimbursement to self.

### Out of scope at launch

- **Multi-member LLC** — feature-flagged
- **C-Corp** — feature-flagged

---

## CEO rationale (20 April 2026)

Launching a sole-prop-only MVP would fail Alex **exactly at the moment she becomes most valuable** (>$80–100k net income, S-Corp elected on CPA advice).

A half-solution drives her to QuickBooks Online.

**Ship when it actually solves the problem.** Better to ship slower with the right scope than ship fast and lose the highest-LTV segment.

---

## Accepted trade-offs

- **Three payroll integrations, not one** — each with its own auth flow, data mapping, and maintenance surface
- **Owner's draw is a ledger-level concept**, not a category tweak. Testing surface area grows meaningfully
- **Categorisation mistakes for S-Corp** (salary vs. owner draw vs. self-reimbursement) have bigger tax consequences than expense mis-categorisation — higher bar on correctness
- **S-Corp-specific AI evals must exist and pass before any model ships**
- **Timeline impact is real but not quantified** — engineering sizing needed before any ship-date conversation

---

## Mid-year entity-type change — conversational narration

When Penny detects (via new payroll connection + Form 2553 effective date) or Alex reports an S-Corp election, Penny **narrates each step conversationally** — no silent state changes to ledger structure:

> *"Got it — starting July 1, I'll track you as an S-Corp. Before that date stays on Schedule C. When tax time comes, you'll get two exports for this year — I'll walk you through both. Sound good?"*

### Ledger behaviour

- Records the **effective-date** of the change
- Pre-change transactions book to Schedule C
- Post-change transactions book to 1120-S
- **Year-end export produces two documents** for the transition year

### Trust principle

Every step is visible, explained, and confirmed by Alex **before ledger structure changes**.

---

## Why this matters for the ledger design

- Entity type is not a setting on a user record — it is **time-effective state** on the business record
- The ledger projection must support an effective-dated entity type
- Tax-export routing must respect effective-dated transitions
- Reports must be split correctly across a transition date

Architecture detail: `../../architecture/system-architecture.md` v4 (extension v4.1 pending for effective-dated entity on business record).

---

*Next: [12-platform.md](12-platform.md)*
