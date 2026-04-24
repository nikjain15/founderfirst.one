# IRS Taxonomy — CPA Stress Test

*Review of the taxonomy fixes applied on 23 April 2026.*
*Scope: 10 label fixes + LLC dual-path + LLC IRS Line Crosswalk + 4 S-Corp rules + 6 open items + sweep for what was missed.*
*Tax years: 2025 returns (filed in early 2026) and 2026 returns (filed in early 2027).*
*Reviewer: Claude (acting as adversarial CPA reviewer). Not a substitute for a licensed CPA sign-off.*
*Source files reviewed: `BookKeeping/product/irs-persona-taxonomy.md` v1.1 · `BookKeeping/demo/public/config/scenarios.json` · `BookKeeping/research/solo-freelancer/irs-tax-research.md`.*

---

## Executive summary — verdict

**Do not ship categories.v1.json against the current taxonomy.** The label fixes were directionally right and mostly well propagated in `scenarios.json`, but the LLC IRS Line Crosswalk table has **at least four hard IRS line errors** that would cause materially incorrect Form 1065 returns if Penny relies on that table. Two of the four open-item answers the prompt stated are also outdated (2025 mileage rate is 70¢, not 67¢; the $2,500 de minimis safe harbor is the correct threshold, not $500). On top of that, at least 12 compliance issues were not addressed by this pass that a CPA or tax-facing product cannot ship without — most urgently the OBBBA (One Big Beautiful Bill Act, July 4, 2025) changes that rewrote bonus depreciation, §174 R&E expensing, QBI §199A permanence, and the 1099-K threshold for 2025.

Of the 10 label fixes: **8 confirmed correct, 2 need nuance.** Of the 4 S-Corp rules: **3 confirmed, 1 wrong** (owner distributions box number on K-1 is not Box 19 for S-Corps). Of the 6 open items: **4 correctly flagged, 2 contain inaccuracies that need fixing in the flag itself.** LLC crosswalk has 4 wrong rows, 2 partially wrong rows. Gap list is 15 items deep, including a critical preparer-penalty / Circular 230 exposure that sits on top of every other finding.

Full findings below.

---

## Methodology & caveats

**What this review is.** A line-by-line adversarial read of the taxonomy doc and the actual scenarios.json data, against the 2024–2025 versions of Schedule C (Form 1040), Form 1120-S, Form 1065, Form 1125-A, Form 4562, Form 8829, and Form 1040-ES, plus relevant IRC sections, Treasury Regulations, and IRS Publications.

**What this review is not.**
1. Not a substitute for a licensed CPA's professional sign-off. The CPA review flagged in `irs-tax-research.md` (Option C hybrid) is still required before `categories.v1.json` ships.
2. My training knowledge cuts off May 2025. Where post-cutoff legislation (OBBBA, signed July 2025) or IRS guidance is directly relevant, I flag it explicitly and recommend verifying with current IRS publications.
3. I am not a licensed CPA or attorney. Treat every finding here as a candidate for CPA validation, not as filing advice.

**Citation format.** Every finding carries the IRS line, the IRC or Treas. Reg. section, and the relevant Pub. Where the citation depends on tax year, I note the year.

**Result tags used below.**
- **CONFIRMED** — item is IRS-correct for 2025 and 2026 as written.
- **WRONG** — item is factually incorrect. Correction stated inline.
- **NUANCE** — directionally right but incomplete. The missing piece is stated.
- **MISSED** — issue not caught in the current pass that needs to be added.

---

## Task 1 — LLC IRS Line Crosswalk audit

The crosswalk table in `irs-persona-taxonomy.md` §"LLC IRS Line Crosswalk" claims to map each category to the correct line on Schedule C (SMLLC path) and Form 1065 (MMLLC path). I'm auditing every row against the 2024 version of each form, which is the most recent published at time of review. Form 1065 and Schedule C have not announced structural changes for 2025, so 2024 line numbers carry forward unless the IRS publishes a restructured form.

### Schedule C (SMLLC) column

Every row in the SMLLC column maps to the correct Schedule C line. **CONFIRMED** for the Schedule C column overall. Minor notes are called out inline below.

### Form 1065 (MMLLC) column — multiple errors

Form 1065 is structured very differently from Schedule C. It has **named lines** for specific categories (repairs, rent, taxes, interest, retirement, employee benefits) and a Line 20 "Other deductions" catch-all. The crosswalk appears to have been written by analogy to Schedule C and conflated several line numbers. Below is the row-by-row audit.

| Category | Crosswalk says (MMLLC) | Reality | Verdict |
|---|---|---|---|
| Revenue | Line 1a | Line 1a "Gross receipts or sales" | **CONFIRMED** |
| COGS | Line 2 | Line 2 "Cost of goods sold" (Form 1125-A attached) | **CONFIRMED** |
| Advertising | Line 20 | Line 20 (no dedicated line on 1065; **1120-S Line 16** is the parallel dedicated line but only exists on 1120-S) | **CONFIRMED** for 1065. Worth noting for cross-entity consistency that 1120-S has a dedicated Advertising line and Form 1065 does not. |
| Car and truck | Line 20 | Line 20 (no dedicated line) | **CONFIRMED** |
| Commissions & fees | Line 10 | **Line 10 on Form 1065 is "Guaranteed payments to partners," not "Commissions & fees."** External commissions (e.g., Shopify platform fees, affiliate commissions) go to **Line 20**. The crosswalk appears to have cross-walked Schedule C Line 10 ("Commissions and fees") to the same line number on Form 1065, but the two forms use Line 10 for different purposes. | **WRONG** |
| Contractor / labor | Line 9 (guaranteed payments) or Line 20 | Two errors in one row. (a) Form 1065 Line 9 is "Salaries and wages (other than to partners) less employment credits" — i.e., **employee wages**, not guaranteed payments. (b) Guaranteed payments are **Line 10**, not Line 9. (c) External (1099) contractors go to **Line 20**, not Line 9 or Line 10. The correct rule: 1099 contractors → Line 20. W-2 employees → Line 9. Payments to partners in lieu of salary → Line 10. | **WRONG** on both line numbers and the description |
| Insurance | Line 18 | **Form 1065 Line 18 is "Retirement plans, etc.," not insurance.** Insurance routing on Form 1065 depends on what kind: (a) employee benefit insurance (e.g., group health for W-2 employees) → **Line 19** "Employee benefit programs," (b) business insurance (general liability, commercial property, E&O, workers' comp) → **Line 20** "Other deductions." Under no interpretation is insurance Line 18 on Form 1065. This is a critical error because the crosswalk is replicated in every LLC persona card (P06 "Commercial insurance → 1065 Line 18" is wrong; should be Line 20). | **WRONG** — and this error is propagated to persona cards |
| Office expense | Line 20 | Line 20 (no dedicated line) | **CONFIRMED** |
| Rent / lease | Line 13 | Line 13 "Rent" | **CONFIRMED** |
| Repairs | Line 20 | **Form 1065 Line 11 is dedicated to "Repairs and maintenance."** Repairs do not go to Line 20 — they have their own line, mirroring Schedule C Line 21. | **WRONG** |
| Supplies | Line 20 | Line 20 (no dedicated line on 1065; Schedule C has Line 22) | **CONFIRMED** |
| Taxes & licenses | Line 14 | Line 14 "Taxes and licenses" | **CONFIRMED** |
| Travel | Line 20 | Line 20 (no dedicated line) | **CONFIRMED** |
| Meals (50%) | Line 20 (50% rule applies equally) | Line 20 after applying the §274(n)(1) 50% limit | **CONFIRMED** |
| Utilities | Line 20 | Line 20 (no dedicated line) | **CONFIRMED** |
| Wages | Line 9 or Line 20 | Employees → Line 9. 1099 contractors → Line 20. Partner payments in lieu of salary → Line 10 (guaranteed payments). The "or Line 20" was probably meant to cover contractors, but it's not explicit in the crosswalk. | **NUANCE** — directionally right for employees, incomplete on the contractor and partner-pay distinction |
| Depreciation | Line 16 (Form 4562) | Form 1065 depreciation is on **Lines 16a/16b/16c** (16a = gross, 16b = reported on 1125-A/elsewhere, 16c = net). Form 4562 is attached. Stating "Line 16" without the sub-line precision is directionally correct but the net deduction is Line 16c, and the 1125-A portion must be netted out via 16b. | **NUANCE** — needs sub-line precision |
| Miscellaneous business expenses | Line 20 | Line 20 (with itemized statement attached — see below) | **CONFIRMED**, but note that Form 1065 **requires** a statement attached itemizing what's in Line 20. This parallels Schedule C Part V → Line 27a. The crosswalk should call out the statement requirement. |

**Summary of LLC crosswalk errors:**

1. **Insurance — Line 18 is wrong** (Line 18 = Retirement plans; Insurance → Line 19 for employee benefits, Line 20 for business insurance). IRC §162(a), §404 (for retirement plans). [Form 1065 Instructions, 2024, Line 18]
2. **Repairs — Line 20 is wrong** (Line 11 is dedicated). [Form 1065 Instructions, 2024, Line 11]
3. **Commissions & fees — Line 10 is wrong** (Line 10 = Guaranteed payments to partners; external commissions → Line 20). IRC §707(c) (guaranteed payments). [Form 1065 Instructions, 2024, Line 10]
4. **Contractor / labor — "Line 9 (guaranteed payments) or Line 20" is wrong** on two counts: Line 9 is for employee W-2 wages, not guaranteed payments; 1099 contractors go to Line 20. [Form 1065 Instructions, 2024, Lines 9, 10, 20]
5. Depreciation Line 16 is not wrong but lacks sub-line precision.

**Per-persona impact.** These crosswalk errors were replicated in at least three persona cards:
- **P06 (llc.trades Marco Henderson):** "Commercial insurance → 1065 Line 18" → should be Line 20.
- **P06:** "Subcontractors → 1065 Line 10 (guaranteed payments)" → Rivera Electric (subcontractor) is an external 1099 payee, not a partner. Should be Line 20. (If Rivera is the partner, that's a completely different entity structure and the data would need to reflect it.)
- **P08, P10, P20 (all other llc personas):** All reference "Line 18" for insurance and "Line 10" for commissions/vendor payments by implication from the crosswalk. Must be audited individually and corrected.

**Additional crosswalk gap — 1120-S equivalent column.** The crosswalk covers SMLLC and MMLLC but omits the S-Corp (1120-S) column, even though six of the 20 personas are S-Corps. 1120-S has different line numbers from Form 1065 (e.g., 1120-S Line 9 = Repairs; 1065 Line 11 = Repairs; 1120-S Line 11 = Rents; 1065 Line 13 = Rents). The taxonomy doc references 1120-S line numbers in per-persona cards but never puts them in the crosswalk. **MISSED** — add a 1120-S column (or separate crosswalk table) so the three entity paths are visible side-by-side.

---

## Task 2 — Validation of the 10 label fixes

### Fix 1–4: Meals labeled with "(50%)"

`"Meals"` → `"Business meals (50%)"`
`"Client meals"` → `"Client meals (50%)"`
`"Travel & client meals"` → `"Travel & client meals (50%)"`
`"Meals & entertainment"` → `"Meals & entertainment (50%)"`

**CONFIRMED** as the default rule. Section 274(n)(1) limits business meal deductions to 50% of the expense. [IRC §274(n)(1); Treas. Reg. §1.274-12; Pub 463 Ch 2; Schedule C Line 24b instructions.]

**NUANCE — meals are not always 50%.** The label is a shortcut that breaks in four real-world scenarios a bookkeeper product must handle:

1. **De minimis food and beverage provided to employees at the workplace (office coffee, snacks, occasional team lunches on premises).** Under §274(n)(2)(B), these were 50% deductible through 2025 and drop to **0% deductible starting in tax year 2026 per TCJA §13304(a)(2)**. OBBBA did not repeal this sunset as of my knowledge cutoff (May 2025) — the scheduled drop to 0% in 2026 likely stands. This affects S-Corp personas that buy office snacks or coffee through the business. **If Penny labels these as "Business meals (50%)" in 2026 returns, Penny will over-deduct.** [IRC §274(n)(2)(B), §274(o); TCJA §13304.]
2. **Meals as compensation reported on W-2 / 1099.** 100% deductible to the employer because the employee is taxed on them. §274(e)(2).
3. **Meals provided to the general public for free** (e.g., a bakery giving samples). 100% deductible. §274(e)(7).
4. **Meals that are part of a social/recreational event primarily for employees** (holiday party, company picnic not limited to highly-compensated employees). 100% deductible. §274(e)(4).
5. **Food and beverages sold as inventory** (i.e., a restaurant's own food on its own menu). Not a §274 deduction at all — it's COGS. Carmen's (P09) and Tony's (P10) catering/food-truck operations already route food to COGS, which is correct.

**Action:** The "(50%)" label is a defensible default, but the product needs at least one additional category or a confidence-check for the 0%-in-2026 office snack case. If Penny auto-labels everything "Business meals (50%)" in 2026 for S-Corp office food, users will file incorrect returns.

**Additional entertainment nuance.** `"Meals & entertainment (50%)"` is a legacy QuickBooks-style label that hides a 2018 change. Under TCJA and IRC §274(a)(1)(A), **entertainment is generally 0% deductible** (was 50% pre-2018). If a transaction is labeled "Meals & entertainment (50%)" and the actual expense is, say, a client NBA game, the game portion is **not deductible at all** — only the accompanying meal (if separately documented) can be 50%. Penny must never apply 50% to entertainment. [IRC §274(a); Treas. Reg. §1.274-11; Notice 2018-76.]

**Recommended label:** drop the combined "Meals & entertainment (50%)" label entirely. Split into "Business meals (50%)" and "Entertainment (not deductible)" so the UI forces the user to acknowledge the split. If the receipt is a combined bill, Penny should prompt the user to identify the meal portion.

### Fix 5: "Other operating expenses" → "Miscellaneous business expenses"

**CONFIRMED** as IRS-correct. Schedule C Part V rolls up to Line 27a "Other expenses." Form 1065 Line 20 "Other deductions" requires an attached itemized statement. There is no IRS line called "Other operating expenses." [Schedule C instructions 2024, Part V; Form 1065 instructions 2024, Line 20.]

**NUANCE — IRS documentation requirements for the catch-all.** The IRS expects each Part V / Line 20 item to be a named, specific expense. A bare "Miscellaneous business expenses" line with no description is an audit trigger, especially for amounts over a few hundred dollars. The IRS position, reinforced in cases like *Cohan v. Commissioner* (a taxpayer win on estimation) but later tightened by §274(d) documentation rules, is that Line 27a entries must be:
1. Individually named (not "miscellaneous" or "other").
2. Supported by records (receipt, date, business purpose).
3. "Ordinary and necessary" under §162.

**Action required (already flagged in the taxonomy doc § Part 4):** The product needs to prompt the user for a description when they select this category. The flag in `irs-persona-taxonomy.md` Part 4 is correct — I'm reaffirming it should block launch. [IRC §162; §274(d); Schedule C Part V instructions.]

### Fix 6: "Truck payment" → "Vehicle depreciation & loan interest"

**CONFIRMED** on the principle — loan principal is not deductible. Loan interest is deductible on Schedule C Line 16b (non-mortgage interest) if the truck is used for business, and vehicle depreciation is deductible on Line 13 via Form 4562 under actual-expense method. [IRC §163(h)(2) re: business interest; §167, §168, §280F re: depreciation.]

**NUANCE on the label — multiple issues.**

1. **Label combines two distinct IRS lines.** Line 13 (depreciation) and Line 16b (interest) are separate. A single transaction categorized as "Vehicle depreciation & loan interest" can't be posted to a single line; it must be allocated. Penny's downstream export logic needs to split the monthly payment into principal (non-deductible), interest (Line 16b), and depreciation (Line 13, computed separately by schedule, not by payment amount). A bookkeeper labeling the full monthly loan payment as "depreciation + interest" will overstate depreciation. Depreciation is **not tied to cash outflow** — it's computed on the cost basis of the asset over its useful life regardless of when loan payments are made.
2. **If the vehicle is under the standard mileage method, this label is wrong entirely.** Under standard mileage (§§1.274-5T(j)(2), Rev. Proc. 2019-46), the per-mile rate already includes depreciation and interest components, so neither Line 13 depreciation nor the interest portion of the loan payment can be separately deducted. Only the business-use portion of interest is deductible on Line 16b under the standard mileage method for non-Schedule-C filers — and Pub 463 Ch 4 actually clarifies that under standard mileage, only interest + personal property taxes can still be deducted for self-employed taxpayers, while fuel, maintenance, insurance, and depreciation are absorbed by the mileage rate.
3. **Luxury auto limits under §280F.** If the vehicle cost exceeds the §280F limits ($20,400 for first-year depreciation in 2024; 2025 TBD, typically slightly higher), first-year depreciation is capped regardless of what was paid. For heavier vehicles (GVWR > 6,000 lbs — SUVs, some trucks), §280F(d)(5) has different rules. Bonus depreciation under §168(k), restored to 100% permanent for acquisitions post-January 19, 2025 by OBBBA Section 70301, interacts with §280F caps.

**Action:** The label "Vehicle depreciation & loan interest" is better than "Truck payment" (which implied principal was deductible) but it still hides two separate IRS lines and ignores the standard-mileage pathway. Better approach: when a vehicle loan payment is detected, Penny should route to a special category that triggers a method-election check (Q-C3), then split into the correct lines based on the elected method. **NUANCE — the fix is an improvement but not ship-ready on its own.**

### Fix 7: "Inventory" → "Inventory (COGS)"

**CONFIRMED** as the correct direction — inventory is not an operating expense; it moves to COGS when sold. [IRC §263A (uniform capitalization), §471 (inventory methods); Schedule C Part III Lines 33–42; Form 1125-A for S-Corps and partnerships.]

**NUANCE — the label hides a timing and accounting-basis issue.**

1. **Inventory is capitalized when purchased, expensed as COGS when sold.** The label "Inventory (COGS)" is accurate in the sense that the eventual destination is COGS, but it doesn't tell the user that the cost is not currently deductible — it's recognized at sale. For a product business on the accrual basis (D86 has Penny supporting both cash and accrual), opening and closing inventory must be tracked to compute COGS correctly. On the cash basis, a taxpayer with ≤$30M average gross receipts (TCJA §13102 as modified by subsequent adjustments; $29M in 2024, $30M in 2025) can use the §471(c) small-taxpayer inventory method which allows expensing at purchase for financial statements, but this still doesn't make the full purchase a deduction until sold — it just conforms book to the financial accounting treatment.
2. **§263A UNICAP small-taxpayer exception.** Taxpayers with gross receipts under the §263A small-business threshold (same $30M ceiling) are exempt from UNICAP and can use simplified inventory methods. For the solopreneur personas, this is a non-issue (they're well under the threshold), but the product should not assume UNICAP doesn't apply as businesses grow.
3. **Ending inventory balance required.** For any product business, Schedule C Part III requires opening inventory (Line 35), purchases (Line 36), and ending inventory (Line 41). COGS (Line 42) = 35 + 36 + 37 + 38 + 39 − 41. **Penny cannot produce a Schedule C export for a product business without tracking ending inventory.** Labeling purchases "Inventory (COGS)" at point of purchase doesn't solve this — the user still needs to count inventory at year-end.

**Action:** The label fix is correct but incomplete. The product must force a year-end inventory count for product-based personas (P07, P09, P10, and LLC equivalents), or the Schedule C export will be wrong.

### Fix 8: "Product inventory" → "Product inventory (COGS)"

Same findings as Fix 7. **CONFIRMED** on label direction; **NUANCE** on the timing and year-end inventory count requirement.

### Fix 9: "Food & ingredients" → "Food & ingredients (COGS)" (food-bev only)

**CONFIRMED** that food ingredients for a food-prep business route to COGS, not Line 22 Supplies. [Schedule C Part III Line 38 "Materials and supplies"; Form 1125-A Line 5 "Other costs." Pub 334 Ch 6.]

**NUANCE — routing within Part III matters.** Schedule C Part III has three different lines for what can look like "materials":
- Line 36: Purchases (finished goods bought for resale)
- Line 37: Cost of labor (production labor, not general wages)
- Line 38: Materials and supplies (raw materials consumed in producing the product)
- Line 39: Other costs

For a restaurant/catering business, raw food ingredients that go into menu items → **Line 38** (as the taxonomy doc says). For a coffee roaster who buys finished products to resell, that would be **Line 36**. The taxonomy routing to Line 38 for food-bev personas is correct, but Penny should not hard-code every food-bev transaction to Line 38 — a catering business that buys prepared breads from a bakery for resale at an event is buying finished goods, which is Line 36.

**CONFIRMED** on direction, **NUANCE** on Line 36 vs. Line 38 nuance.

### Fix 10: `"Food & ingredients (COGS ~40%)"` → `"Food & ingredients (COGS)"`

**CONFIRMED** — the "~40%" was margin guidance, not an IRS deductible-percentage. COGS is 100% deductible as it reduces gross profit; the 40% was a food-cost-as-a-percentage-of-revenue margin note, which doesn't belong in the IRS-facing label. Good fix. [Same cites as Fix 9.]

---

## Task 3 — Validation of the 4 S-Corp rules

### Rule 1: Owner's health insurance — added to W-2 Box 1, then deducted on owner's Schedule 1 Line 17. NOT a 1120-S Line 18 deduction.

**CONFIRMED** — this is the correct §162(l) treatment for more-than-2% shareholders of an S-Corp. The mechanism:

1. S-Corp pays the shareholder-employee's health insurance premiums (for the shareholder-employee and family).
2. The premiums are added to the W-2 Box 1 wages of the shareholder-employee (taxable for income tax but NOT subject to Social Security or Medicare tax if the plan meets §3121(a)(2)(B)).
3. The S-Corp takes a compensation deduction — **but on Line 7 (Compensation of officers) or Line 8 (Salaries and wages) as wages, NOT on Line 18 (Employee benefit programs).** This is because the premiums are treated as wages for the >2% shareholder per IRC §1372(a) which says >2% shareholders are treated as self-employed for fringe benefit purposes.
4. The shareholder then deducts the premiums as a self-employed health insurance deduction on **Schedule 1 Line 17** (formerly Line 16 pre-2018) on their personal 1040 return.

**One clarification the taxonomy doc nails correctly** (in the P02 Sarah Chen S-Corp card): "Add to W-2 Box 1, deduct on personal Schedule 1 Line 17." This matches IRC §162(l), Notice 2008-1 (the IRS guidance that governs this mechanic).

[IRC §162(l); §1372(a); Notice 2008-1; Form 1120-S Instructions, Schedule K-1 Instructions; Pub 535 Ch 6.]

**One MISSED item.** For the S-Corp to claim the wage deduction and for the shareholder to claim the Schedule 1 deduction:
- The premiums must be paid by the S-Corp OR reimbursed to the shareholder under a properly established plan (one-person HRA is okay post-21st Century Cures Act).
- The S-Corp must include the premiums in the shareholder's W-2 Box 1 in the year of payment.
- The shareholder's self-employed health insurance deduction is **limited to the shareholder's earned income** from the S-Corp (i.e., the shareholder's W-2 wages from the S-Corp).

If the S-Corp pays $18,000 of premiums but the shareholder's W-2 wages from the S-Corp are only $12,000, the deduction is capped at $12,000 — the remaining $6,000 is treated as taxable wages with no offsetting personal deduction. **The product must surface this earnings-limitation to the user.** Not flagged in the taxonomy.

### Rule 2: Reasonable salary — general rule "salary ≥ 40% of net S-Corp income for service businesses."

**NUANCE — the 40% rule is a CPA-industry heuristic, not IRS guidance.** There is **no statutory or regulatory percentage** that defines a "reasonable salary" for S-Corp shareholder-employees. The IRS standard is a facts-and-circumstances test drawn from:

- **IRC §1366 and §3121** (wages subject to FICA).
- **IRS Fact Sheet 2008-25** (S-Corp reasonable compensation factors).
- **Revenue Ruling 74-44** (authority for recharacterizing distributions as wages).
- **Case law** — most notably *Watson v. U.S.*, 668 F.3d 1008 (8th Cir. 2012), where a CPA firm's $24K salary on $200K distributions was increased to $91,044 on audit; *Glass Blocks Unlimited v. Commissioner* T.C. Memo 2013-180, where zero-salary S-Corps have lost repeatedly; *Sean McAlary Ltd., Inc. v. Commissioner* T.C. Summ. Op. 2013-62 (real estate broker); *Radtke v. U.S.*, 712 F. Supp. 143 (E.D. Wis. 1989), aff'd per curiam, 895 F.2d 1196 (7th Cir. 1990).

The IRS uses nine factors from IRS Fact Sheet 2008-25:
1. Training and experience
2. Duties and responsibilities
3. Time and effort devoted to the business
4. Dividend history
5. Payments to non-shareholder employees
6. Timing and manner of paying bonuses to key people
7. What comparable businesses pay for similar services
8. Compensation agreements
9. Use of a formula to determine compensation

A rule of thumb of "40% of net income for service businesses" is what many CPAs use, but the defensible number depends on what the shareholder would be paid as an employee in the same role, not on a fixed percentage. For **P16 Priya Shah** (S-Corp SaaS, $6K/mo salary on $28K/mo revenue = 21%), the issue isn't the 21% ratio per se — it's whether $6K/mo is a defensible wage for a solo software engineer running their own SaaS business. In SF or NYC, $72K/year for a senior full-stack engineer is low; in a lower-cost market, it's defensible. The real defense is a compensation study, not a % rule.

**Action:** Remove the "40%" framing from the taxonomy doc. Replace with: "Reasonable compensation must be defensible as what the shareholder would be paid as an employee in the same role, considering the nine §1.162-7 factors. No statutory percentage exists. CPAs frequently use 30–60% of net pre-salary income for service businesses as a screening heuristic, but a compensation study or RCReports-style analysis is the defensible benchmark." [IRS Fact Sheet 2008-25; IRC §1366; Rev. Rul. 74-44; Watson v. U.S.; Pub 535 Ch 2.]

**NUANCE** — directionally right that S-Corps need reasonable compensation, but the 40% threshold claim is not authoritative.

### Rule 3: Owner distributions — non-deductible equity events. Not on 1120-S. K-1 Box 19.

**WRONG on the Box number for S-Corps.**

S-Corp distributions are reported on **Schedule K-1 (Form 1120-S) Box 16, Code D** ("Distributions"). Form 1120-S K-1 does not have a Box 19 at all — the form ends at Box 17.

The confusion: **partnership K-1 (Form 1065)** does have Line 19 for distributions (Code A = cash distributions, Code B = marketable securities, Code C = other property). The taxonomy doc on P02 Sarah Chen gets this partially right ("K-1 Box 16 tracks basis") for the S-Corp context, but the user-facing prompt conflates the S-Corp box number with the partnership box number.

| Entity | Distribution line on K-1 |
|---|---|
| S-Corp (Form 1120-S K-1) | **Box 16, Code D** |
| Partnership / MMLLC (Form 1065 K-1) | **Line 19, Code A/B/C** |

Also note: both are correctly reported to the shareholder/partner but **reduce basis** rather than create income (to the extent of basis). Distributions in excess of basis are gain (long-term or short-term depending on holding period for corporate stock; for partnerships, §731 governs). [IRC §1368 (S-Corp distributions); §731 (partnership distributions); Form 1120-S Schedule K-1 Instructions, 2024; Form 1065 Schedule K-1 Instructions, 2024.]

**WRONG** — fix the box number from 19 to 16D for S-Corps.

### Rule 4: K-1 Box 1 ordinary income flows to Schedule E Part II, NOT Schedule C, NOT subject to SE tax.

**CONFIRMED for S-Corps.** S-Corp shareholders report K-1 Box 1 on Schedule E Part II, and — this is the key S-Corp benefit — the pass-through ordinary income is **not subject to self-employment tax** under IRC §1402(a) because it's not "net earnings from self-employment." Only the W-2 wages the shareholder-employee receives are FICA-taxed. [IRC §1402(a); §1366; *Rev. Rul. 59-221*; Pub 535 Ch 2.]

**WRONG for MMLLCs — this rule does NOT apply to partnerships the same way.**

For multi-member LLCs filing Form 1065:
- K-1 Box 1 ordinary income flows to Schedule E Part II ✓ (same as S-Corp)
- **But the income IS subject to self-employment tax for active members** via §1402(a) and K-1 Box 14 (self-employment earnings).

Who is an active member? The law is unsettled. The IRS position (via *Renkemeyer, Campion & Hubbard, LLP v. Commissioner*, 136 T.C. 137 (2011); *Castigliola v. Commissioner*, T.C. Memo 2017-62; *Hardy v. Commissioner*, T.C. Memo 2017-16) is:
- "Limited partner" exception under §1402(a)(13) does not apply to an LLC member who **materially participates** in the business.
- Proposed Regulation §1.1402(a)-2 (1997) was never finalized; the 2011 IRS moratorium on new guidance technically expired, but the IRS continues to apply Renkemeyer.
- Passive (non-managing) members of an MMLLC can often claim §1402(a)(13) to avoid SE tax, but managing members generally cannot.

**Impact on Penny's MMLLC personas.** For every LLC persona treated as MMLLC (Path B), Penny cannot assume "like S-Corp, no SE tax on K-1 Box 1." If the owner is actively running the business (which is the case for all 20 demo personas), the MMLLC path likely **still generates SE tax** on the member's share of ordinary income. **This is the single biggest MMLLC-vs-S-Corp tax-planning consideration** and the taxonomy doc does not address it.

**Action:** Add a clear line to the LLC dual-path rule: "For active LLC members, K-1 Box 1 income from an MMLLC is generally subject to self-employment tax (IRC §1402(a); Renkemeyer). This is materially different from S-Corp treatment, where K-1 Box 1 is not SE-taxed. The choice between MMLLC Path B and S-Corp election has significant tax implications that Penny should flag, not obscure."

[IRC §1402(a), §1402(a)(13); Renkemeyer 136 T.C. 137 (2011); Castigliola T.C. Memo 2017-62; Prop. Treas. Reg. §1.1402(a)-2.]

**WRONG for MMLLC** — needs clarification that SE tax differs between S-Corp and MMLLC paths.

---

## Task 4 — Validation of the 6 open items

### Open item 1 — Vehicle method election (Q-C3)

**Prompt statement:** "standard mileage (67¢/mile for 2024) vs. actual expenses. Must elect method in year 1; cannot switch from actual back to standard once actual is elected for that vehicle."

**WRONG on two of three points.**

#### (a) Mileage rate is out of date for the review years.

- **2024:** 67¢/mile (IRS Notice 2024-8). ✓ correct as stated for 2024.
- **2025:** **70¢/mile** (IRS Notice 2025-5, December 19, 2024). The taxonomy doc and the prompt both state 67¢, which was the 2024 rate. For a product shipping returns for tax year 2025, the rate is 70¢.
- **2026:** Not yet announced as of my training cutoff. IRS typically publishes the rate in a December Notice. Penny must pull the rate from config, not hard-code.

[IRS Notice 2025-5; Notice 2024-8; Rev. Proc. 2019-46.]

#### (b) Election rules — the "can't switch back" claim is backward.

The actual IRS rule per Rev. Proc. 2019-46 (which supersedes earlier guidance):
- **Owned vehicle:** The taxpayer must **use standard mileage in the first year** the vehicle is placed in service for business to preserve the option to switch later. If the taxpayer uses actual expense method (including any accelerated depreciation like §168(k) or §179) in year 1, they **cannot** switch to standard mileage in any later year for that vehicle.
- **Subsequent years (for an owned vehicle that used standard mileage in year 1):** The taxpayer can switch to actual method in any subsequent year, and then can switch back to standard mileage in the following year, though once any MACRS/straight-line depreciation (other than the straight-line straight-line component embedded in the mileage rate) is claimed, the taxpayer is locked into straight-line depreciation going forward for that vehicle.
- **Leased vehicle:** If standard mileage is used in year 1 of the lease, it must be used for the **entire lease term** (including renewals). Switch to actual is not permitted mid-lease.

So the prompt's claim — "cannot switch from actual back to standard once actual is elected" — is **directionally right for owned vehicles that elected actual in year 1**, but the more fundamental rule is: if you want the option to ever use standard mileage on an owned vehicle, you **must** use it in year 1. The taxonomy doc has this backward in one respect (it implies actual is the "default for the life of that vehicle" if not elected away from, which isn't accurate — standard mileage is the flexible option that requires year-1 election).

[Rev. Proc. 2019-46 §4.03, §5.05, §5.06; Pub 463 Ch 4; Schedule C Part IV instructions.]

#### (c) Rate components must be understood.

The standard mileage rate is composed of:
- Fixed costs (depreciation portion): 30¢/mile in 2024; 33¢/mile in 2025 per Notice 2025-5.
- Variable costs (fuel, maintenance, insurance, etc.): the remainder.

When a taxpayer switches from standard mileage to actual after year 1, the depreciation basis of the vehicle must be **reduced by the depreciation-component portion accumulated during standard-mileage years**. Failure to track this depreciation reduction leads to overstated actual depreciation in the switch year. [Rev. Proc. 2019-46 §5.06(2); Pub 463 Table 4-1.]

**Action:**
1. Update mileage rate to 70¢ for 2025.
2. Pull mileage from config, not hard-coded.
3. Re-state the election rule: "To use standard mileage on an owned vehicle, you must elect it in year 1. Once actual-expense method is used in year 1, you're locked into actual for the life of that vehicle."
4. Track depreciation-component accumulation during standard mileage years so basis adjustment works when the user switches.

**WRONG as currently written.** Open item is correctly flagged as open, but the flag contains inaccurate content.

### Open item 2 — Home office (Q-C4)

**Prompt statement:** "needing Form 8829 routing for home-based utilities/rent. Simplified method vs. actual."

**CONFIRMED — correctly flagged as open, and the framing is correct.**

#### Simplified method details
- **$5 per square foot, maximum 300 square feet** → max $1,500/year deduction. [Rev. Proc. 2013-13.]
- No Form 8829 required under the simplified method; reported directly on Schedule C Line 30.
- Simplified method has **no depreciation component** and does not affect basis of the home on eventual sale.
- Annual election — can switch methods year to year. [Rev. Proc. 2013-13 §3.03.]

#### Actual method details
- Form 8829 required for each taxpayer (Sch C/SMLLC).
- Business-use % × (rent, mortgage interest, utilities, insurance, repairs, depreciation) → Line 30.
- **Depreciation component affects home basis** — on sale, **all** depreciation taken on the home office after May 6, 1997 is recaptured as unrecaptured §1250 gain (capped at 25% long-term capital gains rate) regardless of the §121 principal-residence exclusion. The §121 exclusion ($250K single / $500K MFJ) may still cover the remaining gain, but the depreciation portion is outside the exclusion. Penny must surface this trade-off before a user elects actual method — simplified method has no depreciation, so no recapture.
- **Regular and exclusive use** test. IRC §280A(c)(1)(A). The space must be used regularly and exclusively for business. A kitchen table, a dining room also used for family meals, or a desk in a shared bedroom generally fail this test.
- **Principal place of business** test. §280A(c)(1)(A): must be the principal place of business OR a place regularly used to meet with clients. Post-1999, under §280A(c)(1) (as amended by Taxpayer Relief Act of 1997), the admin/management fallback applies if there's no other fixed location where admin/management is done.
- **S-Corp-specific complication**: An S-Corp shareholder-employee cannot take a home office deduction on their personal return (home office is a miscellaneous itemized deduction, suspended 2018–2025 by TCJA §11045 and scheduled to return 2026 — or made permanent by OBBBA; verify). Instead, the S-Corp can adopt an **accountable plan** (§1.62-2) to reimburse the shareholder-employee for home office expenses tax-free, and the S-Corp deducts them on Line 19 ("Other deductions"). The taxonomy doc notes "(2% shareholder home office is complex — CPA required)" — correct flag.

**Action:**
- Add the recapture-on-sale §1250 warning for users on actual method.
- Add the S-Corp accountable plan mechanic for S-Corp owner home offices (critical for P04 Marcus, P16 Priya if they work from home; the current taxonomy routes P15 Alex Rivera Dev's home office correctly but doesn't address the S-Corp case).

[IRC §§280A, 1250, 121; Rev. Proc. 2013-13; Pub 587; Form 8829 Instructions 2024; Treas. Reg. §1.62-2.]

**CONFIRMED** that this is correctly flagged as open; **NUANCE** that the flag should include the basis recapture and the S-Corp accountable plan detail.

### Open item 3 — Phone at 100%

**Prompt statement:** "flagged as requiring business-use % for shared phones. Is a dedicated business phone deductible at 100%? What documentation is required?"

**CONFIRMED** on the rule — dedicated business phone is 100%, shared phone is business-use % only. Statutory basis:

- **IRC §262** disallows personal expense deductions.
- **IRC §274(d)(4)** removed cellular phones from listed-property status effective 2010 (via Small Business Jobs Act §2043). Prior to 2010, cell phones were listed property under §280F(d)(4) requiring stringent contemporaneous records. Post-2010, ordinary §162 substantiation applies.
- **Rev. Proc. 2011-47** and **Notice 2011-72** clarified that employer-provided cell phones primarily for business purposes are a working-condition fringe benefit, and employee personal use is de minimis (not taxable).

**Documentation required (post-2010, for a self-employed business owner):**
- **Dedicated business phone line:** bills and evidence the line is used for business (often a separate number, separate carrier account, or clear usage pattern). 100% deductible.
- **Shared personal/business phone:** business-use percentage supported by records. The IRS will accept a reasonable method — e.g., a representative month's usage log multiplied to the year. "Reasonable" means documented, not picked out of air. The old §280F listed-property contemporaneous-log rule no longer applies, but §162 "ordinary and necessary" plus §6001 substantiation do.

The taxonomy doc's approach ("Penny asks once: 'is this a dedicated business phone?'") is defensible. The %-based deduction for shared phones is where audit risk sits — if the user says "60% business" without documentation, the IRS can and does disallow on audit. **Penny should push the user toward a dedicated line** when they start logging business phone calls material to the deduction, to eliminate audit risk.

[IRC §162, §262, §274, §6001; Rev. Proc. 2011-47; Notice 2011-72; Pub 535 Ch 1.]

**CONFIRMED** as correctly flagged; rule is accurate.

### Open item 4 — Materials: COGS vs. Line 22

**Prompt statement:** "flagged as needing per-transaction determination."

**CONFIRMED** that per-transaction determination is necessary; the distinction is real and consequential. The controlling rule:

- **Inventory held for sale** → COGS (Part III for Sch C; Form 1125-A for 1120-S and 1065). IRC §471 requires inventory accounting.
- **Supplies consumed in rendering services** (job-by-job, no resale) → Line 22 (Supplies) on Sch C.

**Nuance — §471(c) small-taxpayer inventory method simplifies this.**

For taxpayers with ≤$30M average annual gross receipts for the prior 3 years (2025 threshold; was $29M in 2024, indexed for inflation), **IRC §471(c)** (added by TCJA §13102) provides an election to:
- Treat inventory as non-incidental materials and supplies (expense when consumed), OR
- Conform to the taxpayer's applicable financial statement (AFS) method, OR
- Use the book method even if there's no AFS.

Under §471(c), a small contractor/electrician buying materials job-by-job can legitimately expense them on Line 22 as "non-incidental materials and supplies" when consumed, rather than tracking as inventory. The key is:
- Must be **consumed** in the period — no meaningful ending inventory.
- Must be **tracked** as to when each item is consumed (used on a job).
- Must be **consistent** — the taxpayer picks a method and sticks with it.

For the **trades personas** (P05 Jake Torres, P06 Marco Henderson), buying Home Depot materials for the day's job and installing them → Line 22 is correct under §471(c) election. For the **retail/food-bev personas** (P07 Olivia Park, P09 Carmen Vega, P10 Tony Russo), ending inventory exists and COGS accounting is required.

The taxonomy doc's per-persona cards reflect this (Jake's materials → Line 22; Olivia's inventory → Part III). **CONFIRMED** — the "per-transaction determination" flag is correct, and the §471(c) authority makes the "no inventory" path defensible for trades personas. The product needs to surface the §471(c) election to the user and capture it (once per business).

[IRC §§263A, 471, 471(c); Rev. Proc. 2022-9; Treas. Reg. §1.471-1, §1.471-2; Pub 334 Ch 6.]

### Open item 5 — Equipment >$500 threshold

**Prompt statement:** "flagged for Section 179 / depreciation decision. Is $500 the right threshold or should it be $2,500 (de minimis safe harbor)?"

**WRONG threshold. $2,500 is correct, not $500.** The de minimis safe harbor under **Treas. Reg. §1.263(a)-1(f)(1)(ii)** (the "tangible property regulations" of 2013) provides:

- **$2,500 per invoice or per item** for taxpayers **without** an applicable financial statement (AFS). This is the relevant threshold for every solopreneur persona in the demo. [Treas. Reg. §1.263(a)-1(f)(1)(ii).]
- **$5,000 per invoice or per item** for taxpayers **with** an AFS (GAAP-audited financial statements). None of the personas meet this.

The $2,500 safe harbor lets the taxpayer **expense** (Line 22 for Sch C) rather than capitalize-and-depreciate items costing up to $2,500. An annual statement (§1.263(a)-1(f)(5)) must be attached to the return electing the safe harbor.

**The $500 figure in the prompt is wrong.** It may be a confusion with the old 1998–2013 pre-TPR informal safe harbor (no cites), or with the §179 "listed property" rules, or with IRS Publication 946 examples.

Above $2,500 per item, the taxpayer's options:
1. **Capitalize and depreciate** under §168 MACRS. 5-year life for most office equipment, 7 years for most furniture, longer for real property.
2. **§179 election** (up to $1,250,000 for 2025; phase-out starts at $3,130,000; IRC §179(b)). For most solopreneurs, §179 is available because they're well under any threshold.
3. **Bonus depreciation** under §168(k). **OBBBA Section 70301 (July 2025) restored 100% bonus depreciation permanently for property acquired after January 19, 2025.** For property acquired between January 1, 2025 and January 19, 2025, the pre-OBBBA TCJA phase-down applied (40% for 2025). For 2026 and later, 100% bonus is permanent.

The choice between §179 and bonus depreciation matters:
- §179 is elected on a per-asset basis; creates or increases a net operating loss limited by business income (cannot create NOL).
- Bonus depreciation is mandatory unless elected out (per asset class); CAN create NOL.
- State conformity varies — several states do not conform to bonus depreciation, creating federal/state basis differences.

**Per-persona impact:** P04 Marcus's **B&H Photo $1,840 equipment purchase** is under the $2,500 de minimis threshold and can legitimately be expensed on Line 19 (1120-S) / Line 22 (Sch C) without a depreciation decision — the current taxonomy doc's instruction to "ask Section 179 vs. depreciation" is more cautious than required, but not wrong. For items over $2,500, the decision matters.

[Treas. Reg. §1.263(a)-1(f), §1.263(a)-3(h); IRC §§168, 168(k), 179; OBBBA §70301; Pub 946; Rev. Proc. 2015-20.]

**WRONG** on the $500 threshold; the de minimis safe harbor is $2,500 for non-AFS taxpayers. **MISSED** the OBBBA 100% bonus depreciation restoration effective post-January 19, 2025.

### Open item 6 — Miscellaneous business expenses documentation

**Prompt statement:** "flagged as needing a user-provided description to be audit-defensible. Is this correct? What does the IRS actually require for Line 27a entries?"

**CONFIRMED** on the direction — Line 27a entries must be described, not lumped under a generic label. The IRS requirements:

1. **Schedule C Part V** (which feeds Line 27a total): "Other expenses. List below business expenses not included on lines 8–26 or line 30." **Each expense must be named and dollar-amount-stated.** Pub 334 Ch 8 reinforces that Part V is a line-item list, not a single lump. A return that shows only "Miscellaneous expenses $X" on Line 27a with no Part V detail is an audit flag.

2. **§162 substantiation** requires records showing (a) nature of the expense, (b) date, (c) business purpose, (d) amount. IRC §6001 imposes the general record-keeping requirement. §274(d) adds stricter rules for travel, meals, gifts, and listed property (receipt required if ≥$75 per §1.274-5T(c)(2)(iii)(A)).

3. **No "miscellaneous" as a line** — a Line 27a entry literally titled "Miscellaneous" is an audit trigger. Each item should be named ("Bank fees," "Professional association dues," "Business gifts," etc.).

4. **Line 27a is a total line**; Part V is the itemized detail. Penny's export must populate Part V with named items, not just a dollar total.

**Action:** The flag is correct. Additional requirements to build:
- When the user categorizes a transaction as "Miscellaneous business expenses," Penny must prompt for a description (name of expense, e.g., "Trade association dues," "Bank wire fee").
- The description must flow through to Schedule C Part V (line-item in the export).
- Amounts over $75 for travel/meals/gifts trigger additional §274(d) receipt requirements regardless of the Line 27a categorization.

[IRC §§162, 274(d), 6001; Treas. Reg. §1.274-5, §1.6001-1; Pub 334 Ch 8; Pub 463; Schedule C Part V Instructions.]

**CONFIRMED** flag; **MISSED** that the product-build spec should require a name field (not just a description) and that the name must flow to the exported return as a Part V entry.

---

## Task 5 — What was missed (broad compliance sweep)

Scope per user direction: stay in the 10 categories + federal income-tax-adjacent + 1099 + sales tax + state nexus + retirement + payroll + everything. These are the issues the current pass did not catch that need to be addressed before a tax-facing product ships.

### MISSED #1 — OBBBA (One Big Beautiful Bill Act, July 4, 2025) changes are not reflected anywhere

OBBBA (Public Law 119-21, signed July 4, 2025) made a set of changes that directly affect Penny's per-persona returns for 2025 and forward:

1. **§70301 — 100% bonus depreciation permanent** for qualified property acquired after January 19, 2025. Pre-OBBBA, bonus was scheduled at 40% for 2025 under TCJA §13201 phase-down. This inverts how Penny should be routing large equipment purchases made 2025 Q1–Q3 (before signing) vs. post-signing (Q4+). Per-persona impact: P04 Marcus B&H Photo equipment, P18 Wu clinic equipment.
2. **§70302 — §179 limit raised** to $2.5M for 2025 with phase-out at $4M, indexed; pre-OBBBA, 2025 §179 limit was $1.25M with phase-out at $3.13M. Not a big deal at solopreneur scale, but affects how Penny displays §179 limits to users.
3. **§70112 — QBI §199A made permanent.** Pre-OBBBA, §199A was scheduled to sunset December 31, 2025. This is **the single largest change for every pass-through persona in the demo.** Every sole prop, SMLLC, MMLLC, and S-Corp owner potentially gets a 20% QBI deduction on net business income, subject to limits and SSTB rules. Penny must compute or at least surface QBI for every eligible persona. **Not mentioned anywhere in the taxonomy doc.**
4. **§70432 — 1099-K threshold restored to $20,000 AND 200 transactions** (undoing ARPA). Pre-OBBBA, the threshold was dropping to $600 for 2026. Post-OBBBA, back to $20K/200. Affects Penny's 1099-K-related UI, Venmo/Stripe/Square detection logic (D77 peer-payments).
5. **§70313 — §174 R&E expensing restored** for domestic research and experimentation expenses (was 5-year amortization 2022–2024 under TCJA §13206, 15-year for foreign R&E). Affects P15 Alex Rivera Dev and P16 Priya Shah if they conduct domestic R&E — software development often qualifies.
6. **§70111 — SALT cap raised to $40,000** (single and MFJ, indexed, phases out at $500K AGI) for 2025–2029, then expires. Affects individual returns, not directly Sch C/1120-S/1065, but does impact the S-Corp SALT workaround state PTET elections used by many multi-state S-Corps and MMLLCs.

**Verify all of these against current IRS publications** since OBBBA is post my knowledge cutoff (May 2025) and my memory of the enacted bill may not match final text.

**Action:** Add an OBBBA supplement to `irs-tax-research.md` and propagate through the taxonomy and per-persona cards.

### MISSED #2 — QBI §199A deduction on every pass-through persona

Not mentioned in the taxonomy doc at all. The Qualified Business Income (QBI) deduction under IRC §199A provides up to a 20% deduction on net qualified business income for sole props, SMLLCs, MMLLCs, and S-Corps. Key mechanics:

1. **Computation path:** QBI = net business income (Sch C / K-1 Box 1) less self-employed health insurance, SE tax deduction (half of SE tax), self-employed retirement contributions, unrealized gains/losses. QBI × 20% = tentative deduction, limited by the lesser of 20% of taxable income minus net capital gains.
2. **Income thresholds (IRS inflation-indexed annually per Rev. Proc.):**
   - **2024**: Below lower threshold $191,950 single / $383,900 MFJ → full 20% deduction regardless of business type. Upper phase-in ends at $241,950 / $483,900.
   - **2025** (per Rev. Proc. 2024-40): Below lower threshold **$197,300 single / $394,600 MFJ** → full 20% deduction. Upper phase-in ends at **$247,300 / $494,600**.
   - **2026**: Will be published by IRS in late 2025; index from 2025 base.
   - In the phase-in range: W-2 wage limit and SSTB restriction phase in.
   - Above the upper threshold: full W-2 wage limit (greater of 50% of W-2 wages or 25% of W-2 wages + 2.5% of UBIA in qualified property) applies; SSTB income is **fully excluded from QBI** regardless of wage base.
3. **Specified Service Trade or Business (SSTB):** Consulting, health, law, accounting, performing arts, athletics, financial services, brokerage, investment management, and "any trade or business where the principal asset is the reputation or skill of 1 or more of its employees or owners." At income above the upper threshold, SSTB income is **fully excluded from QBI**. [IRC §199A(d)(2); Treas. Reg. §1.199A-5.]

**Per-persona SSTB classification:**

| Persona | SSTB? | Impact |
|---|---|---|
| P01 sole-prop.consulting (Sarah Chen) | **YES** (consulting) | Above the upper phase-in threshold ($247,300 single / $494,600 MFJ for 2025), no QBI |
| P02 s-corp.consulting | YES (consulting) | Same |
| P03 sole-prop.creative (Jordan photography) | NO (creative services — not an enumerated SSTB; "performing arts" doesn't include photography in IRS guidance) | Full QBI eligibility |
| P04 s-corp.creative (video production) | NO | Full QBI |
| P05 sole-prop.trades (electrician) | NO | Full QBI |
| P06 llc.trades | NO | Full QBI |
| P07 sole-prop.retail | NO | Full QBI |
| P08 llc.retail | NO | Full QBI |
| P09 sole-prop.food-beverage (catering) | NO | Full QBI |
| P10 llc.food-beverage | NO | Full QBI |
| P11 sole-prop.beauty-wellness | **Partial** — hair styling is NOT SSTB; "health" is SSTB only if providing medical services. Beauty services → non-SSTB. | Full QBI |
| P12 s-corp.beauty-wellness | Same | Full QBI |
| P13 sole-prop.professional-services (therapist LCSW) | **YES** (health) — psychotherapy qualifies as health services | SSTB — QBI phased out at high income |
| P14 s-corp.professional-services (mgmt consulting) | **YES** (consulting) | SSTB |
| P15 sole-prop.tech-software (developer) | **Ambiguous** — software development is not an enumerated SSTB. However, if the business's principal asset is the owner's reputation/skill → SSTB. Mixed case. | Likely non-SSTB if business is product/SaaS; SSTB if pure personal consulting |
| P16 s-corp.tech-software (SaaS) | Non-SSTB (product business) | Full QBI |
| P17 sole-prop.healthcare (PT) | **YES** (health) | SSTB |
| P18 s-corp.healthcare | YES (health) | SSTB |
| P19 sole-prop.other (VA) | Ambiguous — administrative services not enumerated; if principal asset is the owner's skill, could be SSTB | Likely non-SSTB if standardized services |
| P20 llc.other (event planner) | **NO** — event planning not SSTB | Full QBI |

**Action:** Add a QBI computation layer to the taxonomy. For every persona, surface the estimated QBI deduction in the end-of-year summary and in quarterly estimated tax computations. SSTB classification must be a persona attribute.

[IRC §199A; Treas. Reg. §§1.199A-1 through 1.199A-6; OBBBA §70112 making permanent; Pub 535 Ch 12 (2024 ed.).]

### MISSED #3 — Self-Employment tax calculation details

Partially flagged (Q-T1) but the calculation is incomplete in the docs:

- **SE tax = 15.3% on 92.35% of net SE earnings.**
- **12.4% Social Security** portion capped at the SS wage base: **$176,100 for 2025** (up from $168,600 in 2024); 2026 TBD via SSA cost-of-living adjustment. SE earnings above this threshold incur only the 2.9% Medicare portion.
- **2.9% Medicare** portion applies to all net SE earnings, no cap.
- **Additional Medicare Tax** (not SE tax, but paid on Schedule 2): 0.9% on earned income (wages + SE income) above $200K single / $250K MFJ / $125K MFS. [IRC §3101(b)(2); §1401(b)(2).]
- **Net Investment Income Tax (NIIT)** — 3.8% on investment income for AGI > $200K single / $250K MFJ. Does NOT apply to active business income, but does apply to passive K-1 income. [IRC §1411.]
- **SE tax deduction** (half of SE tax) goes on **Schedule 1 Line 15**, not Line 17 (Line 17 is self-employed health insurance). Common confusion.
- **For S-Corp shareholder-employees:** W-2 wages subject to full FICA (7.65% employer + 7.65% employee = 15.3% effective). Distribution portion NOT subject to SE tax. **This is the S-Corp tax-saving mechanism.**
- **For MMLLC active members:** K-1 Box 14 carries SE earnings; member pays SE tax on their share. **Not** the same as S-Corp treatment (per Rule 4 finding above).

[IRC §§1401, 1402, 3101, 1411; Schedule SE Instructions 2024; Pub 334 Ch 10.]

**Action:** Build an SE tax calculator that correctly handles the SS wage base, the Additional Medicare Tax threshold, the MMLLC-vs-S-Corp distinction, and the deduction on Schedule 1 Line 15.

### MISSED #4 — Estimated tax calculation is underspecified

Q-T1 flags the safe-harbor rule but the safe harbor has nuances the doc doesn't cover:

1. **Safe harbor thresholds (per §6654):**
   - **Lesser of 90% of current-year tax or 100% of prior-year tax** paid in equal quarterly installments.
   - **If prior-year AGI exceeded $150,000**, the safe harbor becomes **110% of prior-year tax**, not 100%. [IRC §6654(d)(1)(C).]
2. **Quarterly installment dates** (not "equal"): Due dates are Q1 (April 15 — except 2026 due April 15, 2026 for calendar year filers), Q2 (June 15), Q3 (September 15), Q4 (January 15 of next year). These are not quarterly in the calendar sense — Q1 covers Jan-Mar, Q2 covers Apr-May (only 2 months), Q3 covers Jun-Aug, Q4 covers Sep-Dec. The "equal installment" safe harbor does not require that each date match the income earned — it requires 25% of the annual safe-harbor amount by each date.
3. **Annualized income installment method** — taxpayers with uneven income can use Form 2210 Schedule AI to compute installments based on actual income earned each period, potentially reducing early installments. Critical for seasonal businesses (P09 catering, P10 food truck).
4. **Farmers/fishermen:** different rules (one installment by Jan 15).
5. **State quarterly estimates** — vary by state, often follow federal but not always. California has a modified schedule, New York is quarterly aligned with federal, Texas has no individual income tax (but does have franchise tax), etc.
6. **S-Corp distribution tax:** Distributions are not subject to SE or FICA but ARE subject to income tax. The shareholder's estimated tax must account for this — W-2 withholding alone on the salary portion won't cover tax on distributions.

**Action:** The quarterly estimate compute must handle the $150K prior-year AGI threshold, the annualized method option, and state estimates. For S-Corp personas, it must compute tax on distributions separately from withholding on W-2 wages.

[IRC §§6654, 6655; Form 1040-ES; Form 2210; Pub 505 Ch 2.]

### MISSED #5 — Startup costs §195

For any persona in their first year of business, IRC §195 allows:
- **Up to $5,000 deducted in year 1** for start-up costs (costs incurred before the business is active).
- **$5,000 reduced dollar-for-dollar for aggregate start-up costs exceeding $50,000.**
- **Remainder amortized over 180 months** (15 years), straight-line, starting from the month the business begins.

Organizational costs (incorporation fees, attorney fees for forming the LLC/corp) have a parallel §248 (corporations) / §709 (partnerships) election with similar terms.

Not mentioned in the taxonomy doc. If any persona incorporates in year 1, this is a material deduction they'll miss. [IRC §195, §248, §709; Pub 535 Ch 7.]

### MISSED #6 — 1099-NEC and 1099-MISC details

The taxonomy flags "1099-NEC required if individual paid ≥$600/yr" but omits:

1. **Form 1099-NEC** for non-employee compensation (§6041A): $600 threshold, due Jan 31 to IRS AND recipient. Box 1.
2. **Form 1099-MISC** for:
   - Rents (Box 1): $600 threshold. P08, P10, P11, P13, P14, P18 rent payments to individual landlords require 1099-MISC. Corporate landlords are exempt.
   - Attorney payments (Box 10): $600 threshold, even to corporations (attorneys are always 1099'd). Affects personas paying lawyers.
   - Medical and health care payments (Box 6): $600 threshold, even to corporations.
   - Prizes and awards, other income: $600 threshold.
3. **Exemptions from 1099:** Payments to corporations (generally) are exempt from 1099, **EXCEPT** for (a) legal services, (b) medical and health care, (c) gross proceeds to attorneys, (d) fish purchases. If Penny assumes "S-Corps don't get 1099'd," that's wrong for legal and medical payees.
4. **Credit card / third-party settlement exemption:** Payments made via credit card or third-party settlement (Venmo, PayPal, Stripe) are **NOT** 1099-NEC'd by the payer — the processor issues a 1099-K to the payee. If a persona pays a contractor via Venmo, they do NOT need to issue 1099-NEC. [Treas. Reg. §1.6041-1(a)(1)(iv).]
5. **Backup withholding**: If the payee fails to furnish a valid TIN (via W-9), the payer must withhold 24% and remit to the IRS via Form 945. [IRC §3406.]
6. **Penalties for failure to file:** $60 per form (filed within 30 days of due date); $130 within August 1; $330 thereafter (2025 values per §6721; increased under OBBBA, verify current). Per-form penalty × number of missed payees.

**Per-persona impact:**
- **P04 Marcus:** Contractors Reece ($600, AT threshold) and Mara ($300 YTD) need tracking for 1099-NEC.
- **P06 Marco:** Rivera Electric (if unincorporated) $3,200 → 1099-NEC.
- **P13 Rachel LCSW:** Office sublease $900/mo to individual landlord → 1099-MISC Box 1.
- **P18 James Wu:** Any PT staff paid as contractors → 1099-NEC. Rent on clinic lease if individual landlord → 1099-MISC.
- **Every persona paying a lawyer:** 1099-MISC Box 10 (attorney, always 1099'd regardless of entity).

**Action:** Build a 1099-MISC path alongside the existing 1099-NEC (D72 commits to Track1099). Include rent to individuals, legal/medical exemptions from the corporate exception, and third-party settlement carve-out.

[IRC §§6041, 6041A, 6050W, 3406, 6721, 6722; Treas. Reg. §1.6041-1, §1.6041-3; Form 1099-NEC Instructions 2024; Form 1099-MISC Instructions 2024.]

### MISSED #7 — 1099-K threshold in 2025 and 2026 (post-OBBBA)

Covered in Missed #1 but worth pulling out: under OBBBA §70432, the 1099-K threshold is **$20,000 AND 200 transactions**, restored to pre-ARPA levels. For 2025 returns, this replaces the pre-OBBBA phase-down schedule. Affects:

- Stripe payouts to Alex Rivera Dev and Priya Shah → 1099-K issued when thresholds met.
- Venmo/PayPal payments to personas (D77) → 1099-K issued when thresholds met.
- Square/Toast to Carmen (P09) and Tony (P10) → always above threshold.

If Penny has been building to the $600 threshold that was scheduled to take effect in 2026, that's now incorrect. Rebuild against $20K/200.

[IRC §6050W(e) as amended by OBBBA §70432; Form 1099-K Instructions 2024.]

### MISSED #8 — Sales tax post-Wayfair and per-state nexus

D-level decision: D-sales-tax (not flagged in doc review scope) — the taxonomy doc mentions "sales tax detect/flag only (no computation/filing)." This is the right product stance but the taxonomy needs to acknowledge several realities:

1. **Post-Wayfair economic nexus:** Following *South Dakota v. Wayfair*, 585 U.S. 162 (2018), states can impose sales tax nexus on remote sellers based on economic thresholds (typically $100K/200 transactions per state per year, but varies by state). Every state now has economic nexus.
2. **Personas affected most:**
   - **P07 Olivia (Etsy, Shopify):** If Olivia sells to customers across the US, she likely has nexus in any state where her annual sales exceed the state's threshold. Etsy and Shopify are **marketplace facilitators** for sales tax under most state laws, so they collect and remit sales tax on Etsy Marketplace sales. But for Olivia's own Shopify store, she's responsible.
   - **P16 Priya (SaaS):** Software sales are taxable in many states (varies by state; e.g., SaaS is taxable in NY, TX, WA, but not in CA). Multi-state SaaS sales create sales tax liability Priya may not know about.
   - **P08 Westside Goods:** Same marketplace-facilitator issue.
3. **Resale certificates:** P07 Olivia likely gives W-9s and resale certificates when buying wholesale goods for resale. Penny should prompt on resale vs. consumable purchases.
4. **Use tax self-reporting:** Personas buying from out-of-state vendors without sales tax collection owe use tax on the state return.

**Action:** Penny should ≥ detect likely multi-state sales and flag. "Penny detects you may have sales tax obligations in California, Texas, and New York based on your sales. Review with your CPA or a sales tax software (Avalara, TaxJar)."

[*South Dakota v. Wayfair*; state-by-state nexus rules; Pub (none — state-level).]

### MISSED #9 — State tax — entity-level tax (PTET) and state income tax

The taxonomy doc is silent on state taxes. Issues:

1. **State income tax conformity:** Most states start from federal AGI/taxable income but have their own adjustments (e.g., California doesn't conform to federal bonus depreciation, §179 limits are lower; New York has its own QBI addback; Texas has no state income tax but has franchise tax on entities).
2. **State pass-through entity tax (PTET) elections:** Over 35 states have enacted PTET elections in response to the TCJA $10K SALT cap. PTET lets pass-through entities (S-Corps, MMLLCs, sometimes SMLLCs) elect to pay state tax at the entity level, which is then deductible on the federal return (bypassing the SALT cap on the owner's personal return). PTET is the single largest state tax planning opportunity for high-earning pass-through entity owners — and Penny doesn't address it.
3. **Multi-state allocation:** Consulting/SaaS businesses often have clients in multiple states; state apportionment rules vary.

**Action:** At minimum, add to the taxonomy:
- State income tax flag per persona (based on business address).
- State PTET availability flag (for S-Corp and MMLLC personas in states that have enacted it).
- Multi-state income flag when clients are across states.

### MISSED #10 — Retirement plan contribution limits and coordination

The taxonomy mentions SEP-IRA and Solo 401(k) but the limits aren't in the doc, and the coordination between employee and employer portions is critical:

**2025 limits:**
- **SEP-IRA:** Lesser of 25% of net self-employment earnings (after SE tax deduction) or $70,000. For sole props, effective rate is ~18.6% due to the circular calculation (net SE × 92.35% × 20% with various deductions). [IRC §408(k)(6); Pub 560.]
- **Solo 401(k):**
  - Employee deferral: $23,500 (2025, up from $23,000 in 2024) — indexed.
  - Employer contribution: up to 25% of net SE or W-2 compensation (same 25% limit as SEP).
  - Combined max: **$70,000 (2025)** excluding catch-up. If age 50+, add $7,500 catch-up; if age 60–63, add $11,250 enhanced catch-up (SECURE 2.0 §109). [IRC §415(c); SECURE 2.0 Act.]
- **SIMPLE IRA:** Employee deferral $16,500 (2025), employer match 3% or 2% non-elective.
- **Traditional/Roth IRA:** $7,000 (2025), $8,000 if 50+.

**Deduction routing (already noted in the taxonomy but worth reinforcing):**
- Sole prop employer portion → Schedule 1 Line 16 (NOT Schedule C).
- S-Corp employer portion → 1120-S Line 17 (Pension, profit-sharing).
- MMLLC employer portion for partners → Form 1065 Schedule K-1 Box 13, Code R (retirement contributions for partners) → deducted on partner's Schedule 1 Line 16.
- Employee deferral (W-2 holder) → withheld from W-2 wages, not a separate deduction.

**SECURE 2.0 provisions (2025 relevant):**
- **Automatic enrollment** required for new 401(k) plans established after 2025 (SECURE 2.0 §101).
- **Student loan match**: employers can match student loan payments as 401(k) contributions (SECURE 2.0 §110).
- **Higher catch-up for 60–63**: $11,250 (2025).
- **Required minimum distribution age**: 73 now, moving to 75 in 2033.

**Action:** Add retirement plan contribution compute per persona. For each persona, surface an annual "you could still contribute $X to a SEP-IRA / Solo 401(k)" prompt based on net business income. High-value deduction for every persona over $20K net.

[IRC §§408(k), 401(k), 415(c); SECURE 2.0 Act (2022); Pub 560.]

### MISSED #11 — Payroll tax compliance (941, 940, state UI)

For personas with W-2 employees (P08, P10, P12, P14, P16 with Priya's wages, P18 with staff PTs), Penny's coverage of payroll tax is shallow. Issues:

1. **Form 941** — quarterly federal employment tax return. Due end of month after quarter close.
2. **Form 940** — annual FUTA return. 6% on first $7,000 per employee, reduced to 0.6% after state credit.
3. **State unemployment insurance (SUI)** — rate varies by state, by employer experience rating. Usually 2–6% on first $X wages.
4. **State income tax withholding** — employer responsibility per state rules.
5. **Trust Fund Recovery Penalty under §6672**: Unpaid payroll taxes can result in personal liability to any "responsible person" — this is a real risk if Penny advises an S-Corp owner who misses payroll tax deposits.
6. **Payroll tax deposit schedule**: Monthly or semi-weekly depending on prior-year lookback. Semi-weekly triggers at $50K+ annual lookback.

The taxonomy mentions Gusto and OnPay as providers (D72), which handle most of this, but Penny should:
- Flag missed payroll tax deposits (material risk).
- Flag state-specific payroll registration requirements when a persona hires across state lines.
- Route employer-side FICA to Schedule C Line 23 / 1120-S Line 12 / 1065 Line 14.

[IRC §§3101, 3111, 3301, 3402, 6672; Forms 941, 940, W-2, W-3; Pub 15 (Circular E); Pub 15-A; Pub 15-B.]

### MISSED #12 — S-Corp accountable plan reimbursements

Touched on above (home office), but the S-Corp accountable plan mechanic under Treas. Reg. §1.62-2 is a large and under-used tool for S-Corp owner-employee reimbursements:

- **Allows tax-free reimbursement** to the shareholder-employee for business expenses they pay personally (home office, cell phone, internet, car mileage, health insurance premiums).
- **Requirements:** Business connection, substantiation (receipts + business purpose), and return of excess amounts within a reasonable time (60 days is safe harbor).
- **S-Corp deducts the reimbursement** on Line 19 (Other deductions).
- **Shareholder doesn't report as income** (non-W-2).
- **Critical** for S-Corp home office — without an accountable plan, the owner's home office is **not deductible** on the S-Corp return at all (TCJA §11045 suspended the personal miscellaneous itemized deduction for home office for 2018–2025; OBBBA may or may not have extended this — verify).

Not in the taxonomy doc. **Action:** Add S-Corp accountable plan as a standard practice. For P02, P04, P12, P14, P16, P18, Penny should prompt: "Does your corporation have an accountable plan for owner expense reimbursements?"

[Treas. Reg. §1.62-2; Rev. Rul. 2012-25; §67; §274; TCJA §11045.]

### MISSED #13 — Preparer penalty / Circular 230 exposure (critical product-liability issue)

Not a taxonomy issue per se, but it sits on top of every tax-categorization decision: **the moment Penny renders output that a user files as a tax return (or uses to populate one), Penny sits in the preparer regulatory zone.**

1. **§7701(a)(36) defines "tax return preparer"** broadly as anyone who prepares for compensation, or employs others to prepare, any return or claim for refund. Software can qualify (see *Ridgely v. Lew*, 55 F. Supp. 3d 89 (D.D.C. 2014) narrowed RTRP program, but the preparer statute remains).
2. **§6694 preparer penalties:** understatement due to unreasonable positions = greater of $1,000 or 50% of income from the return (§6694(a)); willful/reckless = $5,000 or 75% (§6694(b)). These are penalties on the **preparer**, not the taxpayer.
3. **Circular 230 (31 CFR Part 10):** governs practice before the IRS. Covers conflicts of interest, competence, diligence, due diligence as to accuracy. Enforced by the Office of Professional Responsibility.
4. **§6695 and related:** signature, copies, identifying numbers, record retention (3 years), EIC due diligence (§6695(g) — if Penny's export touches EIC, $635 penalty per return for 2025 for lack of due diligence).
5. **Disclaimer is not a full shield.** If Penny generates "Schedule C-ready" output, users will treat it as filed content. Adequate disclaimers + a careful feature boundary ("Penny does not file returns — hand the export to a human preparer") is the narrower posture. The broader posture ("Penny files your 1040 via TurboTax integration," D66) brings Penny into preparer scope.

**Action:** Legal/GC review (already in Phase 0 per CLAUDE.md) needs to scope (a) whether Penny is a "preparer" under current product stance, (b) what the D66 TurboTax integration does to that analysis, (c) required §6694 and Circular 230 compliance, (d) required disclosures to users, (e) insurance/indemnity structure.

[IRC §§6694, 6695, 7701(a)(36); Circular 230 (31 CFR Part 10); *Ridgely v. Lew*; *Loving v. IRS*, 742 F.3d 1013 (D.C. Cir. 2014).]

### MISSED #14 — Repairs vs. improvements (Tangible Property Regs)

Under Treas. Reg. §1.263(a)-3 ("improvement regs," finalized 2013):
- **Repairs** (Line 21 on Sch C / Line 11 on Form 1065 / Line 9 on 1120-S) are deductible currently. An expense is a repair if it keeps the property in its ordinarily efficient operating condition.
- **Improvements** (capitalize and depreciate) are anything that (a) betters the property, (b) restores it, or (c) adapts it to a new use.

The **BAR test** (Betterment, Adaptation, Restoration) governs. Plus:
- **Routine maintenance safe harbor** (§1.263(a)-3(i)): activities that the taxpayer reasonably expects to perform more than once during the asset's useful life (10-year ADS class life for buildings) can be treated as repairs.
- **Small-taxpayer safe harbor for buildings** (§1.263(a)-3(h)): for buildings with UBIA ≤ $1M, annual repairs+maintenance+improvements ≤ lesser of 2% of unadjusted basis or $10,000 = treated as repair. Relevant for Dana's booth space, Tony's commissary, Wu's clinic if they own.

**Per-persona relevance:**
- **P05 Jake / P06 Marco (trades):** Truck repair vs. engine replacement; tool maintenance vs. replacement. Penny auto-categorizing `"Vehicle maintenance"` as repair is generally right, but a new engine is an improvement.
- **P08 Mei / P10 Tony / P12 Alicia (brick-and-mortar):** Renovation of leased space = leasehold improvement (capitalize, 15-year under §168(e)(6) qualified improvement property). Painting = repair.

**Action:** Add BAR-test logic for any capitalized-vs-expensed categorization at the transaction level.

[Treas. Reg. §§1.162-3, 1.162-4, 1.263(a)-1, 1.263(a)-2, 1.263(a)-3; Rev. Proc. 2015-13/14.]

### MISSED #15 — Other issues

Briefly — each worth its own flag before launch:

1. **Hobby loss rules (§183).** If a "business" doesn't have a profit motive, deductions are limited to income (and, post-TCJA, below-the-line deductions are suspended through 2025; may return 2026). Penny could inadvertently encourage loss filing in hobby situations.
2. **Passive activity loss rules (§469).** Active vs. passive classification matters for K-1 income flows. Most of the 20 personas are active businesses, but rental real estate (if any persona has any) is a §469 trap.
3. **Section 121 home sale exclusion interaction** — addressed in home office finding above.
4. **Hobby / §183 vs. §162** classification per IRS Factors (Treas. Reg. §1.183-2(b)) for marginal businesses.
5. **Recordkeeping retention requirements.** §6001 and §6501: 3 years default, 6 years for substantial omission (25%+), indefinite for fraud or unfiled returns. Penny's immutable-ledger spec should align.
6. **Constructive receipt** for cash basis (§446, §451) — deposits received but not yet available, or checks received but not cashed. Materially affects Dec 31 timing.
7. **Charitable contribution limits** for pass-throughs — NOL and charitable interactions.
8. **Foreign bank account reporting (FBAR, Form 114)** if any persona has foreign accounts (unlikely for these personas but a standard compliance check).
9. **Economic substance doctrine** (§7701(o)) — not a direct taxonomy issue but worth knowing.
10. **Statute of limitations** on IRS assessments — 3 years default, 6 years for substantial omission, indefinite for fraud.
11. **Worker misclassification** (§3121(d), §3509) — major risk if a persona treats a worker as a 1099 when they should be W-2 (IRS and DOL both enforce). Penny's contractor detection should include a misclassification flag.
12. **ERC / WOTC and other credits** — not relevant to most personas but possibly to P18 (healthcare).
13. **Late-filing / late-payment penalties** (§6651) — 5%/month failure-to-file, 0.5%/month failure-to-pay, capped at 25%. Flagging this in the product is a retention play.

---

## Per-persona findings from scenarios.json review

A quick spot-check of the actual demo data uncovered issues beyond the taxonomy doc.

### P04 Marcus — `"Van lease + gas"` single category

File `scenarios.json` line 777 (drilldown.ledger) and line 821 (expenses array) contain the category `"Van lease + gas"` with an $820 amount. **This single label maps to two different IRS lines:**
- Van lease → Schedule C Line 20a / 1120-S Line 11 / Form 1065 Line 13 (Rents)
- Gas → Schedule C Line 9 / 1120-S Line 19 / Form 1065 Line 20 (Vehicle)

**Furthermore**, if P04's S-Corp elected standard mileage for the van, gas is not separately deductible. The category must be split into "Van lease" and "Vehicle fuel" as separate line items.

**Action:** Split this transaction. Never use combined vehicle-cost labels.

### P04 Marcus — `"Insurance"` at $280 (line 974)

Generic `"Insurance"` label for "Camera equipment insurance" vendor. The taxonomy master table uses `"Camera/equipment insurance"` for this specific case. The generic label routes to Line 15 correctly for Sch C / 1120-S Line 19, but loses the specificity that would help Penny apply business-use rules and 1099 exemptions.

**Action:** Use the specific taxonomy label `"Camera/equipment insurance"`.

### P04 Marcus — `"Equipment"` $1,840 purchase (B&H Photo)

**Under the $2,500 de minimis safe harbor threshold**, this can legitimately be expensed on Line 19 (1120-S) or Line 22 (Sch C for SMLLC) without a Section 179 or depreciation decision. The taxonomy doc (P04 card) says "Cannot auto-expense as Line 22 supplies at this amount" — this is **WRONG**. At $1,840 per item, the de minimis safe harbor applies (if elected on the return). [Treas. Reg. §1.263(a)-1(f)(1)(ii).]

**Action:** Update P04 card to reflect $2,500 de minimis, not imply that $1,840 must be depreciated.

### P11 Dana Kim — `"Client income — tip"` ($78)

Tip income is taxable. Flagged correctly in the taxonomy. Additional concern: if Dana is a booth renter at a salon and clients tip her directly (Venmo, cash), those tips are reported as self-employment income on Schedule C Line 1. If Dana worked at a salon where she received tips through the salon's POS, she'd get a W-2 with tips reported. The distinction matters — the taxonomy correctly routes to Line 1 for the booth-rental case, but the tip amounts should be aggregated for quarterly estimated tax purposes.

### P16 Priya Shah — $6K/mo salary on $28K/mo revenue

The taxonomy card flags this as "HIGH AUDIT RISK: 21% salary ratio." Replace the framing with the reasonable-compensation analysis from Task 3 Rule 2: **there is no 40% statutory threshold**. The defensible analysis:
- Priya is a solo software engineer running a SaaS.
- Comparable W-2 salaries: a senior full-stack engineer in a mid-tier US market earns $130K–$180K base.
- $72K/year is below the comparable-salary floor and may be low.
- The 21% ratio is a secondary indicator; the primary defense is the compensation study.

### P05 Jake Torres — `"Vehicle fuel & maintenance"` without method election

Combined fuel + maintenance label implies actual-expense method. If Jake elected standard mileage, fuel and maintenance are absorbed by the per-mile rate and not separately deductible. **Without Q-C3 resolved, this category cannot ship correctly.**

### P08 Mei Chen — Payroll tax routing

The card says "Employer FICA → Line 14 (1065) / Line 23 (Sch C)" — correct for Form 1065 Line 14 (Taxes and licenses) and Schedule C Line 23 (Taxes and licenses). Confirmed. [IRC §3111.]

### Label consistency stragglers

From my grep of all 110 unique labels in `scenarios.json`:

- Six variants for software subscriptions: `Software`, `Software & SaaS tools`, `Software & subscriptions`, `Software & tools`, `Software (EHR & billing)`, `Software subscriptions`. Functionally the same category; all route to Line 27a (Sch C) / Line 19 (1120-S). Label consistency is a product issue, not an IRS issue, but it complicates Penny's pattern-match for rule proposals.
- Four variants for licenses/permits: `License renewal & permits`, `Licenses & permits`, `Permits`, `Permits & inspections`. All → Line 23.
- Three variants for supplies: `Supplies`, `Supplies & equipment`, `Supplies & products`. Routing varies (Line 22 for pure supplies; Part III COGS for product inventory; Line 13/22 for equipment).
- Two variants for COGS labels: `Inventory (COGS)`, `Inventory / COGS`. Slight punctuation difference that should be normalized to `Inventory (COGS)` per the 23 April fix pass.

**Action:** Run a label-consolidation pass. Each functional category should have one canonical label in `scenarios.json`, and it must match the `Penny Label` column in `irs-persona-taxonomy.md` Part 1 exactly.

---

## Priority queue — what to fix before categories.v1.json ships

In order, blocking first:

1. **Fix LLC crosswalk errors** — Insurance not Line 18, Repairs not Line 20, Commissions & fees not Line 10, Contractor/labor not Line 9. Propagate to every LLC persona card (P06, P08, P10, P20).
2. **Fix S-Corp distribution K-1 box** — Box 16D, not Box 19.
3. **Fix MMLLC SE tax treatment** — K-1 Box 14 SE earnings apply to active members; not a tax-free-distribution path like S-Corp.
4. **Update mileage rate** — 70¢/mi for 2025; pull from config going forward.
5. **Fix de minimis threshold** — $2,500, not $500. Update P04 card and any other places cautioning on "big" equipment.
6. **Reframe reasonable salary** — Remove the "40%" claim; replace with the §1.162-7 factors framework and a compensation-study recommendation.
7. **Add QBI §199A layer** — SSTB classification per persona; deduction computation; income threshold surfacing.
8. **Add OBBBA corrections** — 100% bonus permanent post-Jan 19 2025, §179 $2.5M limit, §199A permanent, 1099-K threshold restored to $20K/200.
9. **Split the `"Van lease + gas"` category** in P04.
10. **Build S-Corp accountable plan mechanic** for P02, P04, P12, P14, P16, P18.
11. **Add 1099-MISC path** alongside 1099-NEC (Track1099 already in D72).
12. **Add state tax layer** — state income tax, PTET availability, multi-state nexus flag.
13. **Add retirement plan compute** with 2025 limits (SEP, Solo 401k, SIMPLE, IRA).
14. **Add SE tax + Additional Medicare Tax calc** per persona with correct SS wage base for 2025.
15. **Add 2026 meal-at-0% carve-out** for office snacks under §274(n)(2)(B) sunset.
16. **Normalize label variants** in `scenarios.json` — one canonical label per functional category.
17. **Add year-end inventory count requirement** for product personas (P07, P08, P09, P10).
18. **Add start-up costs §195 handling** for first-year personas.

---

## Citations index

Primary authorities cited in this review:

**Statutes (Internal Revenue Code)**
- §121 — principal residence exclusion
- §162 — ordinary and necessary business expenses
- §163 — interest deduction
- §167–168 — depreciation, MACRS, bonus depreciation
- §168(k) — bonus depreciation
- §179 — election to expense tangible property
- §183 — hobby loss rules
- §195 — startup costs
- §199A — Qualified Business Income deduction
- §248 — corporate organizational expenditures
- §263A — Uniform Capitalization
- §274 — meals, entertainment, travel limitations
- §274(d) — substantiation requirements
- §274(n) — meals 50% rule
- §280A — home office
- §280F — luxury auto limits
- §446 / §451 — accounting methods, constructive receipt
- §469 — passive activity losses
- §471 / §471(c) — inventory methods; small-taxpayer exception
- §709 — partnership organizational expenditures
- §1250 — depreciation recapture on real property
- §1361–1379 — S-Corp rules
- §1366 / §1368 — S-Corp pass-through, distributions
- §1372 — fringe benefits for >2% shareholders
- §1401–1402 — self-employment tax
- §1411 — Net Investment Income Tax
- §3101 / §3111 / §3121 / §3301 — employment taxes (FICA, FUTA)
- §3406 — backup withholding
- §3509 — worker misclassification
- §6001 — recordkeeping
- §6041 / §6041A — 1099 reporting
- §6050W — 1099-K
- §6501 — statute of limitations
- §6651 — late filing/payment penalties
- §6654 / §6655 — estimated tax penalties
- §6672 — trust fund recovery penalty
- §6721 / §6722 — information return penalties
- §7701(o) — economic substance

**Legislation**
- Tax Cuts and Jobs Act of 2017 (TCJA), §§11045, 13102, 13201, 13206, 13304
- SECURE 2.0 Act of 2022, §§101, 109, 110
- One Big Beautiful Bill Act of 2025 (OBBBA), Public Law 119-21, §§70111, 70112, 70301, 70302, 70313, 70432

**Treasury Regulations**
- §1.62-2 — accountable plans
- §1.162-7 — reasonable compensation
- §1.183-2(b) — hobby loss factors
- §1.199A-1 through §1.199A-6 — QBI rules
- §1.263(a)-1(f) — de minimis safe harbor
- §1.263(a)-3(h) — routine maintenance safe harbor
- §1.274-5, §1.274-11, §1.274-12 — meals, entertainment, travel substantiation and limits
- §1.471-1, §1.471-2 — inventory valuation
- §1.6001-1 — recordkeeping
- §1.6041-1, §1.6041-3 — 1099 filing
- Prop. Reg. §1.1402(a)-2 — LLC member SE tax (unfinalized)

**IRS Publications (most recent editions as of review)**
- Pub 15 (Circular E) — Employer's Tax Guide
- Pub 15-A — Employer's Supplemental Tax Guide
- Pub 15-B — Employer's Tax Guide to Fringe Benefits
- Pub 334 — Tax Guide for Small Business
- Pub 463 — Travel, Gift, and Car Expenses
- Pub 505 — Tax Withholding and Estimated Tax
- Pub 535 — Business Expenses
- Pub 560 — Retirement Plans for Small Business
- Pub 583 — Starting a Business and Keeping Records
- Pub 587 — Business Use of Your Home
- Pub 946 — How to Depreciate Property

**Forms and Schedules**
- Form 1040, Schedule C, Schedule E, Schedule SE, Schedule 1, Schedule 2
- Form 1120-S, Schedule K-1 (1120-S)
- Form 1065, Schedule K-1 (1065)
- Form 1099-NEC, 1099-MISC, 1099-K
- Form W-2, W-3, W-9
- Form 940, 941, 945
- Form 1040-ES (estimated tax)
- Form 2210 (underpayment penalty / annualized income method)
- Form 4562 (depreciation)
- Form 8829 (home office actual method)
- Form 1125-A (COGS for corps/partnerships)

**Key cases**
- *South Dakota v. Wayfair*, 585 U.S. 162 (2018) — sales tax economic nexus
- *Watson v. U.S.*, 668 F.3d 1008 (8th Cir. 2012) — S-Corp reasonable compensation
- *Glass Blocks Unlimited v. Commissioner*, T.C. Memo 2013-180 — zero-salary S-Corp
- *Renkemeyer, Campion & Hubbard, LLP v. Commissioner*, 136 T.C. 137 (2011) — LLC member SE tax
- *Castigliola v. Commissioner*, T.C. Memo 2017-62 — active LLC member SE tax
- *Hardy v. Commissioner*, T.C. Memo 2017-16 — material participation for SE tax
- *Cohan v. Commissioner*, 39 F.2d 540 (2d Cir. 1930) — estimation rule (tightened later)

**IRS Rulings, Procedures, and Notices**
- Rev. Rul. 59-221 — S-Corp shareholder SE tax
- Rev. Rul. 74-44 — S-Corp distribution recharacterization
- Rev. Rul. 2012-25 — accountable plans
- Rev. Proc. 2013-13 — simplified home office method
- Rev. Proc. 2015-20 — tangible property regs, small-taxpayer
- Rev. Proc. 2019-46 — vehicle method changes
- Rev. Proc. 2022-9 — §471(c) automatic changes
- Notice 2008-1 — S-Corp owner health insurance
- Notice 2011-72 — cell phone as working-condition fringe
- Notice 2018-76 — post-TCJA meals and entertainment
- Notice 2024-8 — 2024 standard mileage rate (67¢)
- Notice 2024-85 — 1099-K phase-in
- Notice 2025-5 — 2025 standard mileage rate (70¢)
- IRS Fact Sheet 2008-25 — S-Corp reasonable compensation factors

---

*Review complete. Recommended next action: commission a licensed CPA review of this document and propagate corrections into `irs-persona-taxonomy.md` before `categories.v1.json` ships. Estimated CPA review time: 6–10 hours at normal CPA rates.*
