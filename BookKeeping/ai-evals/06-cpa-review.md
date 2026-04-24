# Eval 06 — CPA Review Framework

> **Status:** Draft — to be finalized alongside `irs-schedule-mapping.md` CPA review.
> **Purpose:** Define the criteria a CPA would use to assess whether Penny's categorizations, calculations, and tax-facing outputs are accurate enough to stake their professional reputation on. This eval must pass before any Schedule C / 1120-S export, any tax-facing display, or any "review-ready for your CPA" claim ships.
> **Prerequisites:** `irs-schedule-mapping.md` v1.0 (CPA-reviewed), `categories.v1.json` finalized.
> **Blocks:** Any public claim that Penny prepares tax-ready books. CPA share-link feature (E42).
> **Last updated:** 23 April 2026

---

## Why this eval exists

Penny's value proposition depends on one thing above all others: the books it produces are correct enough that a CPA can file from them without redoing the work. A wrong categorization is not just a bug — it is a liability. Meals categorized at 100% instead of 50%. Contractor payments not flagged for 1099. Owner's health insurance put on Schedule C instead of Schedule 1. These errors cost Alex real money and expose Penny to reputation-destroying CPA feedback.

This eval suite is the last gate before any tax-facing output ships. It runs against all 20 demo personas and must be supplemented with real Alex data before MVP launch.

**Pass threshold:** 100% on Critical tests. ≥95% on High tests. ≥90% on Medium tests. Any fail on a Critical test is a ship-blocker.

---

## Test structure

Each test has:
- **Scenario** — which persona, which transaction
- **Input** — what Penny receives (vendor, amount, entity type, industry context)
- **Expected output** — correct category label, IRS line, and any required flags
- **Pass condition** — exact criteria for a pass
- **Fail condition** — what counts as a failure
- **Severity** — Critical / High / Medium / Low

---

## Section 1 — Income categorization

### Test 1.1 — Cash-basis income recognition (sole prop)

**Scenario:** sole-prop.consulting — Sarah Chen receives $3,000 from Bright Co via bank transfer.

**Input:** `{ vendor: "Bright Co", amount: 3000, type: "credit", entity: "sole-prop", industry: "consulting" }`

**Expected output:** Category "Client income", IRS line "Sch C Line 1", recognized in the month the payment is received.

**Pass condition:** Penny categorizes as income (not a liability, not a return), uses cash-basis recognition date (date received, not invoice date).

**Fail condition:** Penny categorizes as "deferred revenue" or uses invoice date for recognition when payment date differs. Penny classifies as non-taxable.

**Severity:** Critical

---

### Test 1.2 — Platform payout (retail sole prop)

**Scenario:** sole-prop.retail — Olivia Park receives a Shopify payout of $1,840 (gross sales $1,960, Shopify fees $120).

**Input:** `{ vendor: "Shopify", amount: 1840, type: "credit", entity: "sole-prop", industry: "retail" }`

**Expected output:** Penny asks to confirm gross vs. net. Gross income = $1,960 (Line 1). Shopify fee = $120 (Line 10, Platform fees). Net deposit = $1,840.

**Pass condition:** Penny does not record $1,840 as the income figure. Penny surfaces a gross-vs-net clarification prompt or automatically separates the fee if it has platform context.

**Fail condition:** Penny records net payout amount ($1,840) as gross income, understating revenue by $120 and missing the fee deduction entirely.

**Severity:** High

---

### Test 1.3 — Insurance payout (healthcare)

**Scenario:** sole-prop.healthcare — Lisa Grant receives $890 from Aetna for physical therapy sessions.

**Input:** `{ vendor: "Aetna", amount: 890, type: "credit", entity: "sole-prop", industry: "healthcare" }`

**Expected output:** Category "Insurance payout" → Sch C Line 1. Supporting fields: payer name, service period. No patient name in the record.

**Pass condition:** Categorized as income. Penny does not store or display patient names. Does not categorize as a loan or refund.

**Fail condition:** Penny stores patient-identifiable information. Penny categorizes as a non-income credit.

**Severity:** Critical (HIPAA exposure)

---

## Section 2 — The 50% meals rule

### Test 2.1 — Meals at 50%

**Scenario:** sole-prop.consulting — Sarah Chen pays $140 at Tartine for a client dinner.

**Input:** `{ vendor: "Client dinner — Tartine", amount: 140, type: "debit", entity: "sole-prop", industry: "consulting" }`

**Expected output:**
- Category: "Client meals"
- IRS line: Sch C Line 24b
- Deductible amount displayed: $70 (50%)
- Non-deductible amount: $70
- Required fields prompted: who attended, business purpose

**Pass condition:** Penny displays $70 as the deductible portion. The approval card does NOT show $140 as the full deduction. Penny surfaces the "who attended / purpose" prompt.

**Fail condition:** Penny shows $140 as a deduction. Penny does not flag the 50% rule. Penny categorizes as 100% deductible.

**Severity:** Critical

---

### Test 2.2 — Meals at a restaurant (ambiguous)

**Scenario:** sole-prop.consulting — Card transaction "SQ *BUCKLEY'S" for $42.50 (low confidence card in demo).

**Input:** `{ vendor: "SQ *BUCKLEY'S", amount: 42.50, type: "debit", confidence: 0.54, entity: "sole-prop" }`

**Expected output:** Penny flags low confidence. Suggests "Meals" as the category. If confirmed as meals, applies 50% rule. Prompts for business purpose.

**Pass condition:** Low-confidence card triggers a clarification prompt. If Alex confirms it's a meal, Penny applies 50% rule before accepting.

**Fail condition:** Penny auto-accepts as a 100% deductible expense without surfacing the meals question.

**Severity:** High

---

## Section 3 — Contractor / 1099-NEC tracking

### Test 3.1 — Contractor at threshold

**Scenario:** sole-prop.consulting — Upwork payment to "@jsmith_design" for $900 in April.

**Input:** `{ vendor: "Upwork — @jsmith_design", amount: 900, type: "debit", category_guess: "Contractors", entity: "sole-prop" }`

**Expected output:** Category "Contractors" → Sch C Line 11. Penny begins tracking cumulative YTD payments to this individual. Because this single payment exceeds $600, Penny should immediately surface the 1099-NEC flag: "You've paid @jsmith_design $900 this year. I'll remind you in January to file a 1099-NEC."

**Pass condition:** Penny tracks this contractor in the 1099-candidate list. The flag is surfaced at or before $600.

**Fail condition:** Penny categorizes as "Contractors" without flagging 1099 obligation. Penny does not track cumulative payments.

**Severity:** Critical

---

### Test 3.2 — Contractor is a corporation (1099 exception)

**Scenario:** A payment to "Acme Design Corp" (a registered corporation, not an individual) for $1,200.

**Input:** `{ vendor: "Acme Design Corp", amount: 1200, type: "debit", category_guess: "Contractors" }`

**Expected output:** Category "Contractors" → Sch C Line 11. Penny does NOT flag 1099-NEC because corporations are generally exempt. Penny should ask or infer whether the payee is an individual or a corporation.

**Pass condition:** Penny does not add "Acme Design Corp" to the 1099-NEC candidate list (or flags it as "corporation — likely exempt").

**Fail condition:** Penny flags a corporation for 1099-NEC filing.

**Severity:** Medium

---

### Test 3.3 — Subcontractor in trades

**Scenario:** llc.trades — Henderson Renovations pays a plumbing subcontractor $1,800 for a job.

**Input:** `{ vendor: "Mike's Plumbing", amount: 1800, type: "debit", category_guess: "Subcontractors", entity: "llc" }`

**Expected output:** Same as Test 3.1. Category "Subcontractors" → 1120-S Line 19 (Other) or Form 1065 Schedule K. 1099-NEC flag if payee is an individual.

**Pass condition:** 1099-NEC flag triggered. Entity type context correctly routes to 1065 (not Schedule C) for the LLC persona.

**Fail condition:** No 1099 flag. Wrong form line for LLC entity type.

**Severity:** High

---

## Section 4 — S-Corp specific

### Test 4.1 — Owner's salary vs. owner's draw

**Scenario:** s-corp.consulting — Sarah Chen's Gusto payroll shows $6,000 salary payment to herself.

**Input:** `{ vendor: "Gusto — Sarah Chen payroll", amount: 6000, type: "debit", category_guess: "Owner salary", entity: "s-corp" }`

**Expected output:** Category "Compensation of officers" → 1120-S Line 7. This is a deductible business expense at the corporate level. W-2 is issued.

**Pass condition:** Penny categorizes as a deductible salary expense, not as owner's draw or distribution.

**Fail condition:** Penny categorizes as a non-deductible distribution or as a sole-prop draw.

**Severity:** Critical

---

### Test 4.2 — Owner's distribution (non-deductible)

**Scenario:** s-corp.consulting — Sarah Chen transfers $2,000 from business account to personal account, labeled "Owner distribution."

**Input:** `{ vendor: "Transfer to personal — Sarah", amount: 2000, type: "debit", entity: "s-corp" }`

**Expected output:** Category "Owner's distribution" — flagged as non-deductible equity event. Does NOT appear on 1120-S as an expense. Penny copy: "This is a distribution from your business — it doesn't reduce your taxes."

**Pass condition:** Distribution is correctly categorized as non-deductible equity. Does not appear in expense totals.

**Fail condition:** Penny categorizes as a business expense. Penny includes it in Schedule deductions. Penny treats it the same as a salary payment.

**Severity:** Critical

---

### Test 4.3 — Owner's health insurance (S-Corp 2% shareholder rule)

**Scenario:** s-corp.consulting — Sarah Chen's health insurance premium of $450/month is paid through the business.

**Input:** `{ vendor: "UnitedHealth", amount: 450, type: "debit", category_guess: "Health insurance", entity: "s-corp" }`

**Expected output:** Category "Owner's health insurance (S-Corp)" → NOT a Schedule C or 1120-S Line 18 expense. Must be added to W-2 Box 1 wages and then deducted on Schedule 1 Line 17 of Sarah's personal return. Penny should flag: "Health insurance for an S-Corp owner has special IRS rules — I'm routing this correctly."

**Pass condition:** Penny does NOT put this on 1120-S Line 18 (employee benefits). Penny flags the 2% shareholder rule. Penny does not treat it as a regular employee benefit expense.

**Fail condition:** Penny puts health insurance on 1120-S Line 18, which overstates corporate deductions and understates W-2 income — a common S-Corp audit trigger.

**Severity:** Critical

---

### Test 4.4 — Reasonable salary check

**Scenario:** s-corp.tech-software — Priya Shah sets her Gusto salary at $24,000/year ($2,000/month) while her business generates $28,000/month in revenue ($336,000/year).

**Input context:** S-Corp revenue $336K/year. Owner salary $24K/year. Net ratio: salary is 7% of gross revenue.

**Expected output:** Penny flags this as a potential IRS audit risk. "IRS requires S-Corp owners to pay themselves a reasonable salary. At $24K vs. $336K revenue, this may attract scrutiny. I'd recommend discussing with your CPA."

**Pass condition:** Penny surfaces the reasonable salary concern. Does not prevent the entry, but flags it clearly.

**Fail condition:** Penny accepts the salary figure without any flag or comment.

**Severity:** High

---

## Section 5 — Vehicle and home office

### Test 5.1 — Mixed-use vehicle

**Scenario:** sole-prop.creative — Jordan Reyes fills up "SHELL GAS" for $94.

**Input:** `{ vendor: "SHELL GAS", amount: 94, type: "debit", confidence: 0.52, entity: "sole-prop", industry: "creative" }`

**Expected output:** Low-confidence flag. Penny asks: "Is this for business travel?" If yes: Category "Vehicle & fuel" → Sch C Line 9, business use % required. Penny prompts for mileage or confirms method elected.

**Pass condition:** Penny does not auto-accept gas as a 100% deductible business expense. Penny asks about business use before categorizing.

**Fail condition:** Penny accepts $94 as a full business deduction without business-use verification.

**Severity:** High

---

### Test 5.2 — Home office (sole prop working from home)

**Scenario:** sole-prop.other — Natalie Brooks (VA) pays $1,200/month in rent for her apartment where she has a dedicated 120 sq ft home office in a 900 sq ft apartment.

**Input context:** Persona flags "works from home." Rent transaction: $1,200/month.

**Expected output:** Penny does NOT categorize monthly rent on Sch C Line 20b. Instead, Penny routes to Form 8829 calculation: 120/900 = 13.3% business use → $160/month deductible via Form 8829 → Sch C Line 30.

**Pass condition:** Rent is not shown as a direct Line 20b deduction. Form 8829 calculation is applied. Deductible amount is the business-use percentage of rent, not the full rent.

**Fail condition:** Penny puts $1,200/month rent on Sch C Line 20b. Penny allows full rent as a business deduction.

**Severity:** Critical

---

## Section 6 — Entity-correct form routing

### Test 6.1 — Sole prop routes to Schedule C

**Scenario:** Any sole-prop.* persona, any expense category.

**Pass condition:** All expense categories route to Schedule C line numbers. No 1120-S lines appear. SE tax is flagged.

**Severity:** Critical

---

### Test 6.2 — S-Corp routes to 1120-S

**Scenario:** Any s-corp.* persona, any expense category.

**Pass condition:** Expense categories route to 1120-S line numbers. Owner salary identified separately from employee wages. Owner distributions flagged as non-deductible. Health insurance correctly flagged per 2% shareholder rules.

**Severity:** Critical

---

### Test 6.3 — LLC routes to correct form

**Scenario:** Any llc.* persona (trades, retail, food-bev, other).

**Pass condition:** Multi-member LLC routes to Form 1065. Single-member LLC routes to Schedule C. Penny correctly identifies which applies based on onboarding answers.

**Fail condition:** LLC persona routes to Schedule C when it is multi-member, or vice versa.

**Severity:** High

---

## Section 7 — COGS vs. supplies

### Test 7.1 — Materials for retail (COGS)

**Scenario:** llc.retail — Westside Goods LLC purchases $3,200 in inventory from a wholesale supplier.

**Input:** `{ vendor: "Wholesale Supplier", amount: 3200, type: "debit", entity: "llc", industry: "retail" }`

**Expected output:** Category "Inventory purchased" → Sch C / 1065 COGS section (Line 36), not Line 22 (Supplies). Penny should ask: "Are these items you're buying to resell, or supplies you use to run the business?"

**Pass condition:** Inventory for resale goes to COGS, not supplies.

**Fail condition:** Inventory for resale is categorized as Line 22 (Supplies), which overstates supply deductions and understates COGS — distorting gross profit.

**Severity:** High

---

### Test 7.2 — Food costs (food & bev)

**Scenario:** llc.food-beverage — Curbside Collective pays Sysco $4,200 for food supplies.

**Input:** `{ vendor: "Sysco", amount: 4200, type: "debit", entity: "llc", industry: "food-beverage" }`

**Expected output:** Category "Food supplies (COGS)" → COGS section. Not Line 22 (Supplies).

**Pass condition:** Food & bev inputs route to COGS.

**Fail condition:** Sysco costs go to Line 22 (Supplies), understating COGS and overstating gross profit.

**Severity:** High

---

## Section 8 — Depreciation vs. direct expense

### Test 8.1 — Large equipment purchase

**Scenario:** sole-prop.creative — Jordan Reyes purchases a new Sony A7 camera body for $2,800.

**Input:** `{ vendor: "B&H Photo", amount: 2800, type: "debit", entity: "sole-prop", industry: "creative" }`

**Expected output:** Penny flags this as a capital item: "This looks like equipment — it may need to be depreciated or expensed under Section 179. Do you want to take the full deduction this year?" Prompts Alex to confirm. If yes → Line 13 + Form 4562 (Section 179). If no → Form 4562 depreciation schedule.

**Pass condition:** Penny does not auto-expense a $2,800 item on Line 22 without asking. Penny surfaces the Section 179 vs. depreciation choice.

**Fail condition:** Penny auto-expenses as "Supplies" or "Equipment" with no depreciation flag.

**Severity:** High

---

## Section 9 — P&L accuracy (Schedule C aggregation)

### Test 9.1 — Schedule C totals reconcile

**Scenario:** sole-prop.consulting — full month of approved transactions from scenarios.json.

**Expected output:**
- Gross income (Line 1): $8,200
- Total expenses (Line 28): $2,340
- Net profit (Line 31): $5,860
- SE tax base (Schedule SE): $5,860 × 0.9235 × 15.3% ≈ $828

**Pass condition:** Penny's P&L totals match the ledger to the cent. Schedule C line totals are consistent with the ledger. SE tax estimate is surfaced and correctly computed.

**Fail condition:** Any rounding error, missing line, or incorrect aggregate total. SE tax not surfaced.

**Severity:** Critical

---

### Test 9.2 — Meals deduction correctly halved in P&L

**Scenario:** sole-prop.consulting — $180 in meals transactions for April.

**Expected output:** Schedule C Line 24b shows $90 (50% of $180). The P&L expense total ($2,340) already reflects the 50% deduction. The remaining $90 is a non-deductible personal expense and does not appear in Schedule C.

**Pass condition:** P&L correctly shows $90, not $180, for meals.

**Fail condition:** P&L shows $180 for meals, overstating deductions by $90.

**Severity:** Critical

---

### Test 9.3 — S-Corp ordinary income reconciliation

**Scenario:** s-corp.consulting — Sarah Chen, full month.

**Expected output:**
- 1120-S revenue: $14,500
- 1120-S deductions: $3,800 (including Line 7 officer compensation)
- Net ordinary income (K-1 Box 1): $10,700
- K-1 income flows to Schedule E, not subject to SE tax
- Sarah's W-2 wage: her Gusto salary amount

**Pass condition:** Corporate income ≠ personal income. K-1 Box 1 is the pass-through income. Owner salary is separately identified.

**Fail condition:** All $14,500 revenue flows to Schedule C. SE tax applied to all of it. Owner salary not deducted at corporate level.

**Severity:** Critical

---

## Section 10 — CPA share-link review

### Test 10.1 — CPA view shows Schedule C line mapping

**Scenario:** CPA opens share link for sole-prop.consulting Sarah Chen.

**Expected output:** CPA view shows expense totals grouped by Schedule C line (Line 8, Line 9, Line 11, etc.), not by Penny's internal category labels. Amounts reconcile to the client's ledger. Flagged items (meals, contractors, home office) are surfaced separately.

**Pass condition:** CPA can trace every dollar to a Schedule C line without having to re-categorize.

**Fail condition:** CPA sees Penny's UX labels ("Software subscriptions") without Schedule C line numbers. CPA cannot trace to form lines. Flagged items are not highlighted.

**Severity:** High

---

### Test 10.2 — No guesses in CPA view

**Scenario:** CPA opens share link and sees transactions that are still in "low-confidence" or "pending" state.

**Expected output:** Pending / unconfirmed transactions are clearly marked as "Not yet confirmed by [Alex]" and excluded from Schedule C totals. CPA cannot accidentally rely on unconfirmed data.

**Pass condition:** Unconfirmed transactions are visually distinct and excluded from tax-ready totals.

**Fail condition:** Unconfirmed transactions appear in Schedule C totals without distinction.

**Severity:** Critical

---

## Scoring and ship criteria

| Severity | Tests in this suite | Pass threshold | Fail action |
|---|---|---|---|
| Critical | 14 tests | 100% | Ship blocker — do not release any tax-facing feature |
| High | 10 tests | ≥95% (9/10) | Ship blocker on fails — fix before release |
| Medium | 3 tests | ≥90% | Fix before release with CEO sign-off on exceptions |

**Running this eval:** Run against all 20 demo personas before any tax-facing output ships. Re-run on every IRS rule change (each January). Run against live Alex data in beta before any "CPA-ready" claim is made in marketing.

---

*See also: `ai-evals/01-transaction-intelligence.md` (categorization confidence, vendor normalization), `ai-evals/04-financial-computation.md` (P&L accuracy, Schedule C aggregation — highest priority placeholder), `ai-evals/02-conversational-qa.md` (tax Q&A accuracy).*
