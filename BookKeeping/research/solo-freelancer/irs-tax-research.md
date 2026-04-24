# IRS & Tax Research — Detailed Work Required

**Status:** Partial resolution via CPA stress test (24 April 2026). Remaining items flagged per-question below. Licensed CPA sign-off still required before `categories.v1.json` ships.
**Owner:** Nik (CEO) — to be commissioned or consulted with a licensed CPA.
**Last updated:** 24 April 2026 (v1.1 — CPA stress-test resolutions applied, OBBBA items added)

---

## 24 April 2026 resolution update

An adversarial CPA stress test (`BookKeeping/reviews/irs-taxonomy-cpa-stress-test-apr-2026.md`) answered or partially answered every open question here. Status per question:

| Question | Prior status | New status | Resolution source |
|---|---|---|---|
| Q-C1 | Research pending | **Partially resolved** — full taxonomy in `BookKeeping/product/irs-persona-taxonomy.md` v1.2 and `BookKeeping/engineering/categories.v1.json` v1.0 | CPA stress test + taxonomy doc v1.2 |
| Q-C2 | Research pending | **Partially resolved** — required / recommended fields per category captured in `categories.v1.json` | Same |
| Q-C3 | Research pending | **Resolved** — standard mileage default, 2025 rate 70¢ (IRS Notice 2025-5), switch rules per Rev. Proc. 2019-46. See updated text below. | CPA stress test |
| Q-C4 | Research pending | **Partially resolved** — simplified default; §1250 recapture + S-Corp accountable plan mechanic documented | CPA stress test |
| Q-T1 | Research pending | **Partially resolved** — safe harbor 100%/110% threshold at $150K prior-year AGI, annualized-income method, state variance; S-Corp distribution tax compute documented | CPA stress test |
| Q-T2 | Research pending | **Partially resolved** — 1099-NEC $600 / 1099-MISC for rent + attorney / 1099-K post-OBBBA $20K+200; credit-card / third-party settlement exemption; backup withholding §3406 | CPA stress test |
| Q-T3 | Research pending | **Confirmed as stated** — 3-year statute default, 6-year substantial omission, indefinite for fraud | CPA stress test |

**New items added** (from Task 5 gap sweep):
- Q-L1 — Circular 230 / preparer penalty exposure (GC review required)
- Q-OBBBA — One Big Beautiful Bill Act (July 2025) verification against final text
- Q-QBI — §199A per-persona SSTB classification and compute
- Q-SE — Self-employment tax calc (SS wage base, Additional Medicare Tax, MMLLC vs. S-Corp)
- Q-PTET — State pass-through entity tax election detection
- Q-RetLim — Retirement contribution limits per persona per year (SEP / Solo 401k / SIMPLE / IRA)

---

## Why this document exists

Penny's correctness on tax categorisation, supporting fields, and tax calculations is non-negotiable. Getting these wrong breaks user trust permanently and can cause real financial harm.

The decisions in this area are **not product-opinion decisions** — they're factual questions grounded in IRS rules and tax code. This document captures every IRS-related open question from `BookKeeping/product/spec-brainstorm-decisions.md` (v2.1) and lists the research required to answer each.

**No product decision in this area is final until the corresponding research block below is completed.** The spec-brainstorm-decisions.md doc points to this file for all seven Q-C* and Q-T* questions.

---

## Primary IRS sources to consult

- **IRS Publication 334** — Tax Guide for Small Business (sole prop and LLC)
- **IRS Publication 535** — Business Expenses (complete list of deductible categories and rules)
- **IRS Publication 587** — Business Use of Your Home (home office deduction methods)
- **IRS Publication 463** — Travel, Gift, and Car Expenses (vehicle, meals, travel rules)
- **IRS Publication 505** — Tax Withholding and Estimated Tax (quarterly tax calculation)
- **IRS Schedule C instructions** — line-by-line category mapping for sole prop / single-member LLC
- **IRS Form 1120-S instructions** — line-by-line for S-Corp
- **IRS Form 1040-ES** — quarterly estimate worksheet
- **IRS Form 8829** — home office actual-expense method worksheet
- **IRS Form 1099-NEC rules** — non-employee compensation reporting (Section 6041A)
- **IRS standard mileage rate** — updated annually via IRS Notice

**Secondary (for comparative benchmarking only — not authoritative):**
- Sample CPA working papers for solo-freelancer and S-Corp clients
- QuickBooks / Xero category taxonomies

---

## Open questions

### Q-C1 — Full category taxonomy

**What we need:**
A complete mapping table — **Plain-English label → IRS Schedule C line → IRS Form 1120-S line (if different) → deductibility percentage → required supporting fields.**

Every category Alex can see in Penny must appear in this table. The table is the engineering source of truth for the taxonomy data model.

**Research tasks:**
1. Enumerate all Schedule C expense categories (Part II lines 8–27a plus Other Expenses in Part V).
2. Map each to a plain-English label that matches a solo freelancer's mental model (e.g. "Advertising" vs. "Marketing & Advertising").
3. Identify 1120-S equivalents where they differ.
4. Capture deductibility percentages (e.g. business meals at 50% for most cases; 100% for specific exceptions).
5. Note categories requiring special handling (meals, travel, vehicle, home office; entertainment largely non-deductible post-TCJA — confirm exceptions).

**Deliverable:** Taxonomy table in this file (or linked spreadsheet), ready to feed engineering spec.

**Product decisions blocked:** D20 (category taxonomy).

---

### Q-C2 — IRS supporting fields per category

**What we need:**
For each category in the taxonomy, the exact IRS-required supporting fields needed to defend the deduction in an audit.

Known examples (to verify and complete):
- **Meals:** who attended, business purpose, location, date, amount
- **Travel:** business purpose, dates, destination, primary business activity
- **Vehicle:** mileage log (date, miles, business purpose) OR actual expense records + business-use %
- **Home office:** square footage, method elected, home total sq ft
- **Equipment / Section 179:** date of purchase, business use %, useful life
- **Gifts:** recipient, business relationship (capped at $25/recipient/year)
- **Entertainment:** generally non-deductible post-TCJA — confirm exceptions

**Research tasks:**
1. Walk through each category from Q-C1 and list the IRS-required supporting fields.
2. Note "best practice but not required" fields — these matter for audit defense but should not block booking (per D19).
3. Identify fields that require ongoing capture (mileage log) vs. one-time capture (equipment purchase).

**Deliverable:** Append columns to the Q-C1 taxonomy table — "Required fields" and "Recommended fields" per category.

**Product decisions blocked:** D19, D67, D68.

---

### Q-C3 — Vehicle expense method *(RESOLVED 24 April 2026)*

**Resolution from CPA stress test:**

1. **Standard mileage rate (per IRS annual Notice):**
   - 2024: 67¢/mi (Notice 2024-8)
   - 2025: **70¢/mi (Notice 2025-5, issued 19 Dec 2024)**
   - 2026: Not yet published (IRS publishes in December of prior year)
   - Rate components: fixed (depreciation) + variable (fuel, maintenance, insurance, tires). 2025 depreciation component = 33¢/mi.

2. **First-year election rule (per Rev. Proc. 2019-46):**
   - **Owned vehicle:** To preserve the option to ever use standard mileage, the taxpayer must **use standard mileage in the first year** the vehicle is placed in service for business. Once actual-expense method (with any MACRS/§168(k)/§179 depreciation) is used in year 1, the taxpayer is **locked into actual for the life of that vehicle**.
   - **Leased vehicle:** If standard mileage is elected in year 1, it must be used for the **entire lease term including renewals**.

3. **Switching rules (owned vehicles that started with standard mileage):**
   - Can switch to actual in any subsequent year, but depreciation going forward is straight-line only (not MACRS), and basis must be reduced by the depreciation-component portion accumulated in standard-mileage years. Rev. Proc. 2019-46 §5.06(2).

4. **Substantiation (§274(d) + Pub 463):** contemporaneous log with date, miles, business purpose, odometer. Apps like MileIQ accepted if they produce contemporaneous records.

**Product stance (confirmed):** Penny defaults to standard mileage in year 1 for any vehicle Penny onboards. Penny computes actual in the background and nudges annually if actual would have won by ≥$500. Rate is pulled from `categories.v1.json` taxYearConstants, never hard-coded.

**Resolved decisions:** D-mileage-configurable (new, see decision log); D-vehicle-method-default.

**Remaining CPA validation:** basis tracking precision when a user switches mid-vehicle-life.

---

### Q-C4 — Home office deduction method

**What we need:**
Rules for both IRS-allowed methods.

Two IRS methods:
1. **Simplified method** — $5/sq ft, max 300 sq ft = $1,500/year. Form 8829 not required.
2. **Actual expense method** — % of home × (rent/mortgage + utilities + insurance + maintenance + depreciation if owned). Form 8829 required.

**Research tasks:**
1. Confirm eligibility ("regular and exclusive use" test).
2. Confirm switching rules year-to-year.
3. For actual method: enumerate all deductible home-related expenses and how % of business use is calculated.
4. Identify edge cases (rent vs. own, depreciation implications on sale of home).

**Product stance (v2.1 hypothesis):** Default simplified, calculate actual in background, annual nudge if actual wins. Confirm.

**Product decisions blocked:** D20, home-office UX flow.

---

### Q-T1 — Quarterly estimated tax calculation

**What we need:**
Exact methodology for Penny to calculate Alex's quarterly estimate, plus the caveat language.

**Research tasks:**
1. Confirm **safe-harbor** rules: 100% of prior-year tax liability (110% if prior-year AGI > $150k) paid in equal quarterly installments. Due dates: April 15, June 15, September 15, January 15.
2. Enumerate inputs for **projection** method: YTD net SE income → annualised → federal income tax per bracket + SE tax (15.3% on net SE earnings up to SS wage base; 2.9% Medicare on remainder; 0.9% Additional Medicare Tax above threshold) + state income tax.
3. Confirm **S-Corp variant** — Alex pays herself W-2 salary with withholding; quarterly estimate covers shortfall on salary + tax on distributions (distributions not subject to SE tax, this is the key S-Corp benefit).
4. Specify caveat language Penny uses ("This is an estimate — confirm with your CPA or TurboTax").
5. Identify state-by-state complexity (some states require state-level estimated tax; thresholds vary).

**Product decisions blocked:** D42 (proactive outreach on deadlines), D54 (year-end Q4 estimate).

---

### Q-T2 — Contractor payments / 1099-NEC tracking

**What we need:**
Exact rules for when a 1099-NEC must be filed, and the filing mechanism.

**Research tasks:**
1. Confirm **threshold:** $600 cumulative per calendar year. Exemptions: payments to corporations (with limited exceptions for legal and medical services), payments via credit card / third-party settlement (those get 1099-K from the processor).
2. Confirm **filing deadlines:** January 31 to recipient and IRS.
3. Identify **W-9 collection requirement** — Alex should collect W-9 from contractor before first payment (otherwise backup withholding may apply).
4. Research **e-filing partners** — Track1099, Tax1099 — for integration feasibility.
5. Confirm **penalties** for late or missed filings (tiered, escalating).

**Product stance (v2.1):** Track from day one. Alert at $600. Year-end generate + e-file via partner or hand to CPA. W-9 collection flow at contractor setup.

**Product decisions blocked:** new decision needed on contractor-tracking module; affects Data Input section.

---

### Q-T3 — Year boundary

**What we need:**
IRS rules on prior-year amendment, plus product UX for the year transition.

**Research tasks:**
1. Confirm **amendment rules:** Form 1040-X for individuals, Form 1120-S amendment for S-Corps. Generally 3 years from original filing to amend.
2. Confirm **record-retention requirements:** IRS requires 3 years minimum (7 for certain cases; indefinite for fraud or unfiled returns).
3. Confirm **"tax year" definition** (calendar year is default for sole prop / LLC / S-Corp; fiscal year possible with election).
4. Confirm no conflict with Penny's immutable-ledger architecture.

**Product stance (v2.1):** Soft boundary — editable through filing deadline, then "amend prior year" action with audit trail. Confirm.

**Product decisions blocked:** Q-T3 resolution for final UX.

---

## Research execution options

**Option A — Self-research with CPA review**
Nik or a research analyst works through each question using the IRS publications above. Output drafted in this file. CPA reviews before decisions are locked.

**Option B — CPA-led research**
Engage a CPA with solo-freelancer and S-Corp expertise. They answer each question, author the deliverables, and sign off.

**Option C — Hybrid**
Self-research for the factual parts (Q-C1 taxonomy enumeration, Q-T3 amendment rules). CPA-led for the interpretive parts (Q-T1 methodology choices, Q-C3/Q-C4 default selection, caveat language).

**Recommendation:** Option C. Factual enumeration is tractable from IRS publications; interpretive work benefits from a CPA's real-world audit experience.

---

## What happens when this is done

Once research is complete and reviewed:
1. Taxonomy table (Q-C1 + Q-C2) becomes the engineering source of truth for categorisation.
2. Vehicle and home-office method specs (Q-C3, Q-C4) feed settings UX and calculation logic.
3. Quarterly estimate methodology (Q-T1) feeds the tax-calculation microservice.
4. 1099 tracking rules (Q-T2) feed the contractor-tracking module and W-9 collection flow.
5. Year-boundary rules (Q-T3) feed the ledger-immutability spec and year-end UX.
6. The seven Q-C* and Q-T* questions move from "open" to "settled" in spec-brainstorm-decisions.md.

---

*This document is the single source of truth for IRS-related research. No tax-related decision in the product spec is final until the corresponding section here is filled in and reviewed.*
