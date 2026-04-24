# IRS Persona Taxonomy — All 20 Personas
*Status: Draft — requires CPA sign-off before categories.v1.json ships*
*Last updated: 24 April 2026 (v1.2 — CPA stress-test corrections applied. Fixes: LLC crosswalk 4 line errors, S-Corp K-1 distribution box, MMLLC SE tax treatment, 2025 mileage rate, de minimis safe harbor threshold, reasonable-salary reframing, QBI §199A SSTB layer added, OBBBA post-July-2025 changes flagged. See `reviews/irs-taxonomy-cpa-stress-test-apr-2026.md` for the full adversarial review.)*
*Source data: `demo/public/config/scenarios.json` · `personas.json` · `industries.json`*
*Companion doc: `irs-schedule-mapping.md` (category-level detail), `ai-evals/06-cpa-review.md` (test cases)*

---

## How to read this document

This document answers: **for each of the 20 demo personas, what is the correct IRS form and line for every category they use?**

It is the direct input to `categories.v1.json`. Every category label here must match exactly what Penny shows the user. Every IRS line must be confirmed by a CPA before any tax-facing output ships.

**Three entity types → three different IRS forms:**

| Entity | Demo personas | Files with IRS | Owner's personal return |
|---|---|---|---|
| **Sole Proprietor** | 10 sole-prop.* | **Schedule C** (Form 1040) | Net profit from Sch C → SE tax (Schedule SE) |
| **S-Corporation** | 6 s-corp.* | **Form 1120-S** (corporate) + **Schedule K-1** | K-1 Box 1 → Schedule E Part II. Owner salary → W-2 |
| **LLC — Single-Member (SMLLC)** | 4 llc.* path A | **Schedule C** (Form 1040) — disregarded entity | Same as sole prop. No separate business return. |
| **LLC — Multi-Member (MMLLC)** | 4 llc.* path B | **Form 1065** (partnership) + **Schedule K-1** | K-1 Box 1 → Schedule E Part II. |

> **LLC dual-path rule (OE-1 — both paths now documented):** Penny must ask the LLC owner at onboarding: "Is this LLC owned by one person or multiple people?" Single owner → Schedule C (simpler, no partnership return). Multiple owners → Form 1065 (partnership return required). The underlying transaction data in scenarios.json is identical for both — only the IRS line routing changes. Both paths are documented in every LLC persona card below.

---

## LLC IRS Line Crosswalk — Schedule C vs. Form 1065 vs. Form 1120-S

**v1.2 update (24 April 2026):** LLC crosswalk rewritten after adversarial CPA review caught four hard errors on the MMLLC column. Insurance was wrongly mapped to Line 18 (that's Retirement plans on Form 1065); Repairs to Line 20 (Line 11 is dedicated); Commissions & fees to Line 10 (that's Guaranteed payments to partners); Contractor / labor to Line 9 (that's employee W-2 wages). The S-Corp column (Form 1120-S) is now explicit alongside the two LLC paths, since six personas are S-Corps.

For the 4 LLC personas (llc.trades, llc.retail, llc.food-beverage, llc.other), every category maps as follows depending on ownership structure. For the 6 S-Corp personas (s-corp.*), use the 1120-S column.

| Category type | SMLLC / Sole Prop → Schedule C | S-Corp → Form 1120-S | MMLLC → Form 1065 |
|---|---|---|---|
| Revenue | Line 1 (Gross receipts) | Line 1a (Gross receipts) | Line 1a (Gross receipts) |
| COGS | Part III Lines 33–42 (flows to Line 4) | Line 2 (Cost of goods sold, Form 1125-A attached) | Line 2 (Cost of goods sold, Form 1125-A attached) |
| Advertising | Line 8 | Line 16 (dedicated line) | **Line 20** (no dedicated line on 1065) |
| Car and truck | Line 9 | Line 19 (other deductions) | Line 20 (other deductions) |
| Commissions & fees | Line 10 | Line 19 | **Line 20** (NOT Line 10 — Line 10 is Guaranteed payments to partners. External commissions to non-partners go to Line 20.) |
| Contractor / labor (1099) | Line 11 (Contract labor) | Line 19 | **Line 20** (NOT Line 9 — Line 9 is W-2 employee wages. 1099 contractors go to Line 20.) |
| Employee wages (W-2) | Line 26 | Line 8 (Salaries and wages) | Line 9 (Salaries and wages, other than to partners) |
| Guaranteed payments to partners (MMLLC only) | n/a | n/a | **Line 10** (for payments to partners in lieu of salary — subject to SE tax via K-1 Box 4a) |
| Insurance — business (GL, property, E&O, workers' comp) | Line 15 (Insurance, other than health) | Line 19 | **Line 20** (NOT Line 18 — Line 18 on Form 1065 is Retirement plans.) |
| Insurance — group health for W-2 employees | Line 14 (Employee benefits) | Line 18 (Employee benefit programs) | Line 19 (Employee benefit programs) |
| Insurance — >2% S-Corp shareholder's health | n/a (sole prop → Schedule 1 Line 17) | **NOT on 1120-S Line 18** — added to W-2 Box 1 wages; deducted on shareholder's Schedule 1 Line 17 | n/a (partner health insurance → K-1 Box 13 Code M; partner's Schedule 1 Line 17) |
| Office expense | Line 18 | Line 19 | Line 20 |
| Rent / lease — vehicles, machinery, equipment | Line 20a | Line 11 (Rents) | Line 13 (Rent) |
| Rent / lease — other business property | Line 20b | Line 11 | Line 13 |
| Repairs and maintenance | Line 21 | Line 9 (Repairs and maintenance) | **Line 11** (Repairs and maintenance — NOT Line 20; dedicated line) |
| Supplies | Line 22 | Line 19 | Line 20 |
| Taxes and licenses | Line 23 | Line 12 (Taxes and licenses) | Line 14 (Taxes and licenses) |
| Interest (non-mortgage) | Line 16b | Line 13 (Interest) | Line 15 (Interest) |
| Travel | Line 24a | Line 19 | Line 20 |
| Meals (50%) | Line 24b (Deductible meals, 50%) | Line 19 (50% limit per §274(n)(1)) | Line 20 (50% limit per §274(n)(1)) |
| Utilities | Line 25 | Line 19 | Line 20 |
| Depreciation | Line 13 (from Form 4562) | Line 14 (from Form 4562) | Line 16c (net: 16a gross − 16b on 1125-A/elsewhere; Form 4562 attached) |
| §179 election | Line 13 subcomponent (Form 4562 Part I) | Line 14 subcomponent | Line 16a subcomponent |
| Retirement plans — employer portion | Line 19 (Pension and profit-sharing) | Line 17 (Pension, profit-sharing) | Line 18 (Retirement plans) — this is the ONLY use of 1065 Line 18 |
| Miscellaneous business expenses (catch-all) | Line 27a (Part V itemized) | Line 19 (itemized statement attached) | Line 20 (itemized statement attached) |
| **Non-deductible items** | | | |
| Owner distributions (S-Corp) | n/a | **NOT on 1120-S** — equity event, reduces AAA/stock basis. K-1 **Box 16, Code D** | n/a |
| Partner distributions (MMLLC) | n/a | n/a | **NOT on 1065** — equity event, reduces basis. K-1 **Line 19, Code A** (cash) / B (marketable securities) / C (other) |
| Sole-prop owner's draw | **NOT on Sch C** | n/a | n/a (use partner distribution for MMLLC) |
| Loan principal (vehicle, equipment) | NOT deductible anywhere — only depreciation (Line 13) + interest (Line 16b) | NOT deductible — only depreciation (Line 14) + interest (Line 13) | NOT deductible — only depreciation (Line 16c) + interest (Line 15) |

**Key line-number confusions to avoid (CPA stress-test findings):**
1. **Form 1065 Line 18 is Retirement plans**, NOT insurance. Insurance never goes on Line 18 of Form 1065 under any interpretation.
2. **Form 1065 Line 11 is Repairs**, with a dedicated name. Repairs never go to the Line 20 catch-all.
3. **Form 1065 Line 10 is Guaranteed payments to partners**, NOT external commissions. Unlike Schedule C Line 10 (Commissions and fees), Line 10 on Form 1065 is restricted to partner payments.
4. **Form 1065 Line 9 is W-2 employee wages** (other than to partners). 1099 contractors go to Line 20, not Line 9.
5. **S-Corp K-1 does NOT have Box 19.** Distributions are Box 16 Code D. Partnership K-1 Line 19 is for distributions on that form.

**Propagation to per-persona cards below:** All LLC persona cards (P06, P08, P10, P20) have been rewritten to reflect the corrected Form 1065 lines. Prior versions routed Insurance → Line 18 and Subcontractors → Line 10, both of which were wrong.

---

## Self-Employment tax treatment — critical MMLLC vs. S-Corp difference (v1.2)

This is the single largest tax-planning consideration between the two pass-through entity types and was under-specified in v1.1.

| Entity | SE tax on owner's K-1 Box 1 ordinary income? | Notes |
|---|---|---|
| Sole prop / SMLLC | YES — via Schedule SE, on 92.35% of net Sch C profit | IRC §1402(a). 15.3% on SS wage base ($176,100 for 2025; $168,600 for 2024), 2.9% Medicare uncapped, 0.9% Additional Medicare Tax above $200K single / $250K MFJ |
| S-Corp | **NO** — K-1 Box 1 flows to Schedule E Part II; only W-2 wages from the S-Corp are FICA-taxed | IRC §1402(a); Rev. Rul. 59-221. **This is the S-Corp tax-saving mechanic.** Trade-off: shareholder must take a reasonable salary. |
| MMLLC (active member) | **YES** — K-1 Box 14 carries SE earnings; member pays SE tax on their share of ordinary income | IRC §1402(a); *Renkemeyer, Campion & Hubbard v. Commissioner*, 136 T.C. 137 (2011); *Castigliola v. Commissioner*, T.C. Memo 2017-62. The §1402(a)(13) "limited partner" exception does NOT apply to an LLC member who materially participates. |
| MMLLC (passive member) | Usually NO — §1402(a)(13) exception often available | Fact-dependent. Safest when the member does not materially participate and the LLC operating agreement reflects that. |

**Product implication for Penny.** When a user elects an LLC at onboarding and Penny asks whether it's single-member (Path A → Schedule C) or multi-member (Path B → Form 1065), Penny must also signal — without rendering tax advice — that an MMLLC does NOT provide S-Corp-style SE tax relief on pass-through income. The often-quoted "LLC saves self-employment tax" framing is wrong for active MMLLCs and correct only when the LLC has elected S-Corp tax status under Form 2553.

[IRC §§1402, 1402(a)(13); Prop. Treas. Reg. §1.1402(a)-2 (unfinalized); *Renkemeyer* 136 T.C. 137; *Castigliola* T.C. Memo 2017-62; *Hardy v. Commissioner*, T.C. Memo 2017-16.]

---

## Qualified Business Income (QBI) §199A — per-persona SSTB classification (v1.2 new section)

Under IRC §199A, every pass-through persona potentially gets a 20% deduction on QBI. After OBBBA (2025), §199A is **permanent** (was scheduled to sunset 12/31/2025 under TCJA). The deduction is subject to (a) taxable income thresholds, (b) Specified Service Trade or Business (SSTB) restrictions above the upper phase-in threshold, and (c) W-2 wage / UBIA limitations.

**Income thresholds (IRS-indexed annually per Rev. Proc.):**

| Year | Lower (full QBI below) | Upper (SSTB fully excluded above) |
|---|---|---|
| 2024 | $191,950 S / $383,900 MFJ | $241,950 S / $483,900 MFJ |
| 2025 (per Rev. Proc. 2024-40) | $197,300 S / $394,600 MFJ | $247,300 S / $494,600 MFJ |
| 2026 | IRS publishes late 2025 | IRS publishes late 2025 |

**SSTB categories** (IRC §199A(d)(2), Treas. Reg. §1.199A-5(b)): health, law, accounting, actuarial science, performing arts, consulting, athletics, financial services, brokerage, investing/investment management, trading, dealing in assets, or any trade or business where the principal asset is the reputation or skill of 1+ employees/owners.

**Per-persona SSTB classification:**

| Persona | Business | SSTB? | QBI outcome above upper threshold |
|---|---|---|---|
| P01 sole-prop.consulting (Sarah) | Consulting | YES | No QBI above $247,300 S / $494,600 MFJ (2025) |
| P02 s-corp.consulting (Sarah) | Consulting | YES | Same |
| P03 sole-prop.creative (Jordan photography) | Creative — photography | NO (photography not enumerated; not "performing arts" per IRS) | Full QBI subject to wage/UBIA limits |
| P04 s-corp.creative (Marcus video) | Creative — video production | NO | Same |
| P05 sole-prop.trades (Jake electrical) | Trades | NO | Full QBI |
| P06 llc.trades (Marco renovations) | Trades | NO | Full QBI |
| P07 sole-prop.retail (Olivia) | Retail | NO | Full QBI |
| P08 llc.retail (Mei) | Retail | NO | Full QBI |
| P09 sole-prop.food-beverage (Carmen catering) | Food service | NO | Full QBI |
| P10 llc.food-beverage (Tony food truck) | Food service | NO | Full QBI |
| P11 sole-prop.beauty-wellness (Dana) | Beauty services | NO (not "health" under §1.199A-5(b)(2)(ii) — beauty ≠ health) | Full QBI |
| P12 s-corp.beauty-wellness (Alicia) | Beauty/wellness | NO | Full QBI |
| P13 sole-prop.professional-services (Rachel LCSW therapist) | Mental health services | **YES** (health) | No QBI above threshold |
| P14 s-corp.professional-services (David mgmt consulting) | Consulting | **YES** | No QBI above threshold |
| P15 sole-prop.tech-software (Alex developer) | Software development | Ambiguous — product dev is not SSTB; reputation-based consulting is | Product/SaaS → non-SSTB full QBI. Pure personal consulting → SSTB |
| P16 s-corp.tech-software (Priya SaaS) | SaaS product | NO | Full QBI |
| P17 sole-prop.healthcare (Lisa PT) | Physical therapy | **YES** (health) | No QBI above threshold |
| P18 s-corp.healthcare (James PT clinic) | Physical therapy | **YES** | No QBI above threshold |
| P19 sole-prop.other (Natalie VA) | Virtual assistance | Usually NO (admin services) | Full QBI unless reputation-based |
| P20 llc.other (Sofia events) | Event planning | NO | Full QBI |

**Action items for the product:**
- Every pass-through persona's annual summary and quarterly-estimate compute must surface QBI.
- SSTB classification must be a persona attribute stored at onboarding (derivable from the industry selection).
- For SSTB personas approaching the threshold, Penny should proactively flag that the deduction is about to phase out — a material tax-planning moment where CPA referral is appropriate.
- QBI aggregation (§1.199A-4) — if a persona owns multiple related businesses, they can be aggregated. Out of scope for MVP but must be non-blocking for the data model.

[IRC §199A; Treas. Reg. §§1.199A-1 through 1.199A-6; Rev. Proc. 2024-40; OBBBA §70112 (permanence); Pub 535 Ch 12.]

---

## OBBBA (One Big Beautiful Bill Act, P.L. 119-21) — 2025 changes affecting Penny (v1.2 new section)

OBBBA was signed July 4, 2025 and made several changes that directly affect Penny's per-persona returns. **All items below require verification against current IRS publications before production** — some effective dates and final thresholds may differ from first-pass understanding of the enacted bill.

| OBBBA § | Change | Per-persona impact |
|---|---|---|
| §70112 | **QBI §199A made permanent** (was scheduled to sunset 12/31/2025 under TCJA) | Every pass-through persona retains the 20% QBI deduction permanently |
| §70301 | **100% bonus depreciation permanent** for qualified property acquired after January 19, 2025 | Pre-OBBBA TCJA schedule was 40% for 2025, 20% for 2026, 0% for 2027. Post-OBBBA, 100% is permanent. P04 Marcus B&H Photo equipment (>de minimis), P18 Wu clinic equipment affected. |
| §70302 | **§179 election limit raised** to $2.5M (was $1.25M for 2025 pre-OBBBA); phase-out $4M (was $3.13M) | Not a constraint at solopreneur scale, but Penny should display the current-year limits correctly |
| §70313 | **§174 R&E expensing restored** for domestic research and experimentation (was 5-year amortization 2022–2024 under TCJA §13206) | P15 Alex dev and P16 Priya SaaS affected — software development expenses deductible in year incurred again |
| §70432 | **1099-K threshold restored to $20,000 AND 200 transactions** (undoing ARPA's $600 phase-in) | Stripe, Venmo, PayPal, Square payouts only 1099-K'd above $20K + 200 transactions. Affects D77 peer-payment integration expectations. |
| §70111 | **SALT cap raised to $40,000** (single and MFJ, indexed, phases out at $500K AGI), 2025–2029, expires 2030 | Individual return impact. Interacts with state PTET elections used by S-Corp and MMLLC owners. |

**Items to verify before shipping:** Exact effective dates, any state conformity issues, whether §174 retroactively reopens amended returns for 2022–2024, and whether OBBBA affected §274(o) (the TCJA sunset for de minimis employer-provided meals to 0% in 2026). Penny's R&D capture, bonus-depreciation routing, and 1099-K detection logic all depend on final OBBBA text.

[OBBBA, Public Law 119-21; verify all specifics against IRS guidance published in Q3–Q4 2025.]

---

## Part 1 — Master Category Taxonomy

Every unique category label appearing across all 20 demo personas, mapped to the correct IRS line per entity type.

**Legend:** `Sch C` = Schedule C line · `1120-S` = Form 1120-S line · `1065` = Form 1065 line (same as 1120-S in most cases) · `%` = deductible percentage · `⚠️` = flag required

### Income categories

| Penny Label | Sch C Line | 1120-S / 1065 Line | % | Notes / Flags |
|---|---|---|---|---|
| Client income | Line 1 | Line 1a | 100% income | Cash basis: record when received |
| Sales income | Line 1 | Line 1a | 100% income | Record GROSS sales. Platform fees = separate Line 10 expense |
| Subscription income | Line 1 | Line 1a | 100% income | Stripe MRR: record Stripe payout + separate Stripe fees as expense |
| Catering income | Line 1 | Line 1a | 100% income | Separate from daily truck sales if both exist |
| Insurance income | Line 1 | Line 1a | 100% income | Insurance reimbursements for services. HIPAA: use payer name, never patient name |
| Product income | Line 1 | Line 1a | 100% income | Retail product sales. If cost of goods → COGS (Part III) |
| Stock licensing | Line 1 or Line 6 | Line 1a or Other income | 100% income | ⚠️ If recurring royalties: CPA may recommend Line 6 + Schedule E treatment. Confirm. |
| Tip income | Line 1 | Line 1a | 100% income | Cash/Venmo tips are taxable income. Must be reported. |
| Retainer payment | Line 1 | Line 1a | 100% income | Advance retainers: taxable on receipt (cash basis) |
| Job payment | Line 1 | Line 1a | 100% income | Trades: payment on job completion |

### Cost of Goods Sold (COGS) — product businesses only

> Applies to: sole-prop.retail, llc.retail, sole-prop.food-beverage, llc.food-beverage, and any persona selling physical products. These categories go on **Schedule C Part III (Lines 33–42)**, NOT in the expense section (Lines 8–27a). S-Corp: **Form 1120-S Line 2**.

| Penny Label | Sch C Line | 1120-S Line | % | Notes |
|---|---|---|---|---|
| Cost of goods | Part III Line 36 (Purchases) | Line 2 (COGS) | 100% of goods sold | COGS recognized when goods are sold, not when purchased |
| Inventory purchased | Part III Line 36 | Line 2 | 100% of goods sold | Inventory = asset until sold |
| Food & ingredients | Part III Line 38 (Materials) | Line 2 | 100% | Food/bev: ingredients that become the product. NOT Line 22 (supplies). |
| Food supplies (COGS) | Part III Line 38 | Line 2 | 100% | Same as above |
| Packaging & supplies | Part III Line 38 | Line 2 | 100% | Packaging that becomes part of the sold product |
| Materials — job materials | Line 22 OR Part III | Line 19 or Line 2 | 100% | ⚠️ See OE-2: if job-by-job (no inventory) → Line 22. If stocking materials → Part III COGS. |

### Advertising and marketing

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Marketing | Line 8 (Advertising) | Line 16 | 100% | Ad spend, Google/Meta ads, print materials, sponsorships |
| Advertising | Line 8 | Line 16 | 100% | Same as Marketing — Penny should use one consistent label |
| Paid advertising | Line 8 | Line 16 | 100% | Same |

### Vehicle

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Vehicle fuel | Line 9 (Car and truck) | Line 19 | Business % | ⚠️ Q-C3 open. Must elect method year 1: standard mileage (70¢/mi 2025 per IRS Notice 2025-5 (was 67¢/mi for 2024)) OR actual. Cannot switch once actual is elected for that vehicle. |
| Fuel & mileage | Line 9 | Line 19 | Business % | Same as above |
| Vehicle fuel & maintenance | Line 9 | Line 19 | Business % | Maintenance included in actual method; not separately deductible under standard mileage |
| Vehicle & fuel | Line 9 | Line 19 | Business % | Same |
| Truck payment | Line 9 (lease) or Line 13 (owned + depreciation) | Line 19 | Business % | ⚠️ Lease payment = Line 9. Loan payment on owned truck = NOT deductible as loan payment — depreciation is the deduction (Line 13 + Form 4562). |
| Van lease | Line 20a (Equipment/vehicle lease) | Line 11 (Rents) | Business % | Lease payments are Line 20a. Business use % applies. |

### Platform and processing fees

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Platform fees | Line 10 (Commissions and fees) | Line 19 | 100% | Shopify, Etsy, Amazon, eBay selling platform fees |
| Payment processing fees | Line 10 | Line 19 | 100% | Stripe, Square, Toast, PayPal transaction fees. Book separately from gross revenue. |

### Contractors and labor

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Contractors | Line 11 (Contract labor) | Line 19 | 100% | ⚠️ 1099-NEC required if individual paid ≥$600/yr. Collect W-9 before first payment. |
| Subcontractors | Line 11 | Line 19 | 100% | Same 1099-NEC rules. Common: trades, creative, events |
| Contractor & vendor payments | Line 11 (for services) or Line 22 (for supplies) | Line 19 | 100% | ⚠️ Split: service portion → Line 11 (may trigger 1099). Supply/rental portion → appropriate line. |
| Payroll (employees) | Line 26 (Wages) | Line 8 (Salaries and wages) | 100% | W-2 issued. Employer's share of payroll taxes → Line 23. |
| Shareholder payroll / Officer compensation | N/A on Sch C | Line 7 (Compensation of officers) | 100% | S-Corp only. ⚠️ Must be reasonable salary per IRS. Major S-Corp audit trigger if too low. |

### Depreciation and equipment

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Equipment (purchased, >$2,500) | Line 13 + Form 4562 | Line 14 | 100% (Sec. 179) or spread over years | ⚠️ Penny must ask: "Take the full deduction now (Section 179) or spread it over years (depreciation)?" Annual election. |
| Hardware | Line 13 or Line 22 | Line 14 or Line 19 | Business % | <$2,500 per item: Line 22 (de minimis safe harbor). >$2,500: depreciate or Section 179. ⚠️ Mixed personal/business use: business % only. |
| Tools & equipment | Line 22 (if expensed) or Line 13 (if depreciated) | Line 19 | 100% | Small tools typically Line 22. Large equipment → Section 179 election. |
| Tools & small equipment | Line 22 | Line 19 | 100% | "Small" implies under de minimis threshold → Line 22 acceptable |

### Insurance

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Commercial insurance | Line 15 (Insurance, other than health) | Line 19 | 100% | General liability, commercial property |
| Camera insurance | Line 15 | Line 19 | 100% | Equipment insurance |
| Camera/equipment insurance | Line 15 | Line 19 | 100% | Same |
| Professional liability insurance | Line 15 | Line 19 | 100% | E&O, malpractice |
| Malpractice insurance | Line 15 | Line 19 | 100% | Healthcare, legal, professional services |
| Equipment insurance | Line 15 | Line 19 | 100% | |
| Health insurance (employees) | Line 14 (Employee benefits) | Line 18 | 100% | For W-2 employees only — NOT the S-Corp owner |
| Owner's health insurance (sole prop) | NOT on Sch C | N/A | Schedule 1 Line 17 | ⚠️ Self-employed health insurance deduction is on the owner's personal Schedule 1, not Schedule C. Common error. |
| Owner's health insurance (S-Corp ≥2% shareholder) | NOT on Sch C | NOT on 1120-S Line 18 | Add to W-2 Box 1, deduct on personal Schedule 1 Line 17 | ⚠️ Must be processed through payroll first — added to W-2 wages, then deducted on personal return. Critical S-Corp compliance item. |
| Workers' comp | Line 15 | Line 19 | 100% | |

### Legal, accounting, research

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Accounting | Line 17 (Legal and professional services) | Line 19 | 100% | CPA fees, bookkeeping |
| Accounting fees | Line 17 | Line 19 | 100% | Same |
| Legal fees | Line 17 | Line 19 | 100% | Business legal fees only |

### Office expense

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Office supplies | Line 18 (Office expense) | Line 19 | 100% | Consumables: paper, ink, small office items |
| Supplies | Line 22 (Supplies) or Line 18 | Line 19 | 100% | ⚠️ Penny distinguishes: administrative consumables → Line 18. Materials used in business production → Line 22. Be consistent. |
| Printing & albums | Line 18 or Line 22 | Line 19 | 100% | ⚠️ Context-dependent: if client deliverables (photo albums) → Line 22. If general printing → Line 18. |
| Props & supplies | Line 22 | Line 19 | 100% | Creative: props used in shoots |
| Hard drives & storage | Line 22 (if <$2,500) | Line 19 | 100% | External drives for client work. De minimis safe harbor if <$2,500/item. |
| Safety supplies/PPE | Line 22 | Line 19 | 100% | Trades: safety equipment used in the field |
| Dump & disposal | Line 22 | Line 19 | 100% | Trades: waste disposal, haul-away. Ordinary and necessary for construction work. |
| Event supplies & florals | Line 22 | Line 19 | 100% | Events: supplies for specific events. Document per event. |

### Retirement and pension

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Solo 401(k) contribution | Line 19 (employer portion) | Line 17 | 100% up to limits | ⚠️ Employee deferral portion goes on personal Schedule 1 Line 16, NOT Schedule C. Employer match/profit-sharing portion goes on Line 19. |
| SEP-IRA contribution | NOT on Sch C | NOT on 1120-S | Schedule 1 Line 16 | ⚠️ For sole prop owners: deducted on personal Schedule 1, not Schedule C. High-value deduction Penny should proactively surface. |

### Rent and lease

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Booth rent | Line 20b (Rent — other business property) | Line 11 (Rents) | 100% | Salon/studio booth rental |
| Studio rent | Line 20b | Line 11 | 100% | |
| Clinic lease | Line 20b | Line 11 | 100% | Healthcare — dedicated clinical space |
| Office sublease | Line 20b | Line 11 | 100% | Professional services — subleased office space |
| Commissary rent | Line 20b | Line 11 | 100% | Food & bev — commercial kitchen rental |
| Kitchen rental | Line 20b | Line 11 | 100% | Same |
| Venue & rental fees | Line 20b | Line 11 | 100% | Events — event venue rental fees. Billed through to client → COGS or client reimbursable. If absorbed → Line 20b. |
| Storage unit | Line 20b | Line 11 | 100% | Business use only |
| Rent — studio lease | Line 20b | Line 11 | 100% | S-Corp beauty/wellness dedicated space |
| Home office | Line 30 (Form 8829 or simplified) | NOT on 1120-S (2% shareholder home office is complex — CPA required) | Simplified: $5/sq ft max 300 sq ft. Actual: business % of home costs | ⚠️ Q-C4 open. Regular and exclusive use required. Cannot claim both Line 20b rent AND home office on Form 8829 for the same space. |
| Equipment rental | Line 20a (Rent — vehicles, machinery, equipment) | Line 11 | 100% | Camera rentals, tool rentals, BorrowLenses, United Rentals |

### Repairs and maintenance

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Truck fuel & maintenance | Line 9 (if actual method) | Line 19 | Business % | ⚠️ Maintenance is part of actual vehicle method. Not separately deductible if standard mileage elected. |
| Vehicle fuel & maintenance | Line 9 | Line 19 | Business % | Same |

### Taxes and licenses

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| License renewal & permits | Line 23 (Taxes and licenses) | Line 12 | 100% | Contractor licenses, business licenses, health permits |
| Permits & inspections | Line 23 | Line 12 | 100% | Trades: job-specific permits. If billed to client → contra-income or reimbursable. If absorbed → Line 23. |
| NECA membership | Line 27a (Other expenses) | Line 19 | 100% | Professional trade association — not Line 23 (taxes). |
| Professional memberships | Line 27a | Line 19 | 100% | Same treatment |
| Payroll taxes (employer) | Line 23 | Line 12 | 100% | Employer share of FICA: 6.2% SS + 1.45% Medicare |

### Travel and meals

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Travel | Line 24a (Travel) | Line 19 | 100% | Overnight trips away from tax home only. Local client trips = Line 9 (vehicle), not Line 24a. |
| Travel & transport | Line 24a (travel) + Line 9 (local) | Line 19 | 100% | ⚠️ Must split: overnight travel = Line 24a. Local transportation = Line 9. |
| Transportation (food-bev) | Line 9 or Line 27a | Line 19 | Business % | Catering transport to events. If vehicle: Line 9. If Uber/rideshare to event: Line 27a. |
| Meals | Line 24b (Deductible meals) | Line 19 (50% limit) | **50% only** | ⚠️ ALWAYS 50%. Penny must never show full meal amount as deductible. |
| Client meals | Line 24b | Line 19 (50%) | **50% only** | Same. Client present does not change the 50% rule. |

### Utilities and communications

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Utilities | Line 25 (Utilities) OR Form 8829 | Line 19 | ⚠️ See note | ⚠️ Dedicated business location (not home) → Line 25, 100%. Home-based → utilities go through Form 8829 at business-use %. |
| Phone | Line 25 | Line 19 | Business % | ⚠️ Dedicated business line → 100%. Shared personal/business phone → business use % only. Penny asks once: "is this a dedicated business phone?" |
| Phone & internet | Line 25 | Line 19 | Business % | Same rule — must apportion if shared |
| Internet | Line 25 or Form 8829 | Line 19 | Business % | Home-based: internet flows through Form 8829. Dedicated office: Line 25 direct. |

### Wages

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Payroll | Line 26 (Wages) | Line 8 (Salaries and wages) | 100% | W-2 employees. ⚠️ For S-Corp: Gusto payroll label must split officer compensation (Line 7) from employee wages (Line 8). |

### S-Corp equity events (non-deductible)

| Penny Label | Sch C Line | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Owner's distribution | **NOT an expense — ever** | NOT on 1120-S; reported on shareholder's **K-1 Box 16, Code D** (S-Corp). Partnership K-1 uses **Line 19, Code A** (MMLLC). | 0% deductible | ⚠️ CRITICAL. Distribution is a return of equity (IRC §1368 for S-Corp, §731 for partnership). Reduces AAA + shareholder stock basis. Penny must never categorize this as a deductible expense. Penny copy: "This is a distribution from your business — it doesn't reduce your taxes." Distributions in excess of basis are capital gain per §1368(b)(2) / §731(a)(1). |

### Other expenses (Schedule C Part V / Line 27a)

| Penny Label | Sch C Part V → Line 27a | 1120-S / 1065 | % | Notes |
|---|---|---|---|---|
| Software subscriptions | Part V → Line 27a | Line 19 | 100% | Notion, Adobe CC, GitHub, Zoom, Dropbox, Frame.io, Squarespace, etc. |
| Software & tools | Part V → Line 27a | Line 19 | 100% | Same |
| Software & SaaS tools | Part V → Line 27a | Line 19 | 100% | Same |
| Cloud infrastructure | Part V → Line 27a | Line 19 | 100% | AWS, GCP, Vercel, Cloudflare |
| Cloud & hosting | Part V → Line 27a | Line 19 | 100% | Same |
| Payment processing | Part V → Line 27a or Line 10 | Line 19 | 100% | Stripe fees, Square fees. Penny: categorize consistently on Line 10. |
| Professional development | Part V → Line 27a | Line 19 | 100% | Workshops, certifications directly related to current work. NOT preparation for a new career. |
| Continuing education | Part V → Line 27a | Line 19 | 100% | Same — must be to maintain/improve skills in current business |
| CE & supervision | Part V → Line 27a | Line 19 | 100% | Healthcare/therapy: clinical supervision and CE. Correct. |
| Education & licensing | Part V → Line 27a | Line 19 | 100% | Beauty/wellness: CE + license renewal fees (license renewal portion → Line 23; CE portion → Line 27a) |
| Bank fees | Part V → Line 27a | Line 19 | 100% | Business account fees |
| Other operating expenses | Part V → Line 27a | Line 19 | TBD | ⚠️ "Other operating expenses" in demo ledgers is a catch-all. Must be broken down into actual categories before any tax-facing output. This label cannot ship as-is. |

---

## Part 2 — Per-Persona IRS Cards

One card per persona. Each shows: entity type, applicable IRS form, and every category used in their demo scenario with the correct IRS line.

---

### P01 — sole-prop.consulting
**Sarah Chen · Studio Nine Consulting · Sole Proprietor**
**IRS Form: Schedule C (Form 1040) + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income (Bright Co, Meridian, Sunnyside, Design Co) | Sch C Line 1 | 100% income | Cash basis — record when received |
| **EXPENSES** | | | |
| Software subscriptions (Notion, Adobe, Figma, GitHub, Zoom) | Line 27a (Part V) | 100% | |
| Contractors (Upwork @jsmith_design) | Line 11 | 100% | ⚠️ $900 > $600 — 1099-NEC required. Track W-9. |
| Utilities — Con Edison (electricity) | Form 8829 if home office | Business % | ⚠️ If home-based: route through Form 8829, not Line 25 directly |
| Utilities — Comcast Business (internet) | Line 25 (dedicated business line) or Form 8829 | Business % | ⚠️ If shared with home: Form 8829 |
| Office supplies (Amazon, Staples, Best Buy) | Line 18 | 100% | |
| Meals (SQ *BUCKLEY'S, Client dinner — Tartine) | Line 24b | **50% only** | ⚠️ $40 deductible = $20. $140 deductible = $70. Must flag. |
| **NOT ON SCHEDULE C — COMMON ERRORS** | | | |
| Sarah's own health insurance (if any) | Schedule 1 Line 17 | 100% | NOT on Sch C. Above-the-line personal deduction. |
| Sarah's SEP-IRA or Solo 401(k) (if any) | Schedule 1 Line 16 | 100% | NOT on Sch C. |
| **TAX OBLIGATIONS** | | | |
| Self-employment tax | Schedule SE | 15.3% on 92.35% of net profit | Quarterly estimates due: Apr 15, Jun 15, Sep 15, Jan 15 |

---

### P02 — s-corp.consulting
**Sarah Chen · Studio Nine Consulting Inc. · S-Corporation**
**IRS Form: Form 1120-S (corporate) + Schedule K-1 → personal Schedule E Part II**
**Payroll provider: Gusto**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income (Bright Co, Meridian, Henderson Partners) | 1120-S Line 1a | 100% income | Corporate revenue |
| **EXPENSES** | | | |
| Officer compensation — Sarah's Gusto payroll | 1120-S Line 7 | 100% | ⚠️ REQUIRED. Must be reasonable salary. $14.5K/mo revenue → low salary is audit risk. |
| Software subscriptions | 1120-S Line 19 (Other deductions) | 100% | Attach schedule itemizing |
| Contractors | 1120-S Line 19 | 100% | ⚠️ 1099-NEC if individual ≥$600/yr |
| Client meals | 1120-S Line 19 (50% limit) | **50% only** | K-1 Box 7 reports non-deductible 50% |
| Phone | 1120-S Line 19 | Business % | ⚠️ Business use % only |
| **NON-DEDUCTIBLE — DO NOT BOOK AS EXPENSE** | | | |
| Owner's distribution | NOT on 1120-S | 0% | ⚠️ Distribution reduces shareholder equity. Reported on **K-1 Box 16, Code D** (distributions). Stock basis tracked via Form 7203 starting with 2021 returns. |
| Sarah's health insurance (if paid through corp) | NOT on 1120-S Line 18 | — | ⚠️ Add to W-2 Box 1, deduct on Sarah's personal Schedule 1 Line 17 |
| **OWNER'S PERSONAL RETURN** | | | |
| K-1 Box 1 ordinary income | Schedule E Part II | — | NOT subject to SE tax — key S-Corp benefit |
| Sarah's W-2 wages | Wages on Form 1040 | — | Payroll taxes apply to W-2 wages only |

---

### P03 — sole-prop.creative
**Jordan Reyes · Jordan Reyes Photography · Sole Proprietor**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income (weddings, editorial, portraits) | Line 1 | 100% income | |
| Stock licensing — Shutterstock | Line 1 (or Line 6) | 100% income | ⚠️ If passive royalties grow, CPA may advise Schedule E treatment |
| **EXPENSES** | | | |
| Printing & albums (Miller's Lab) | Line 22 (client deliverables) | 100% | Client-deliverable prints = supplies |
| Professional development (CreativeLive) | Line 27a | 100% | Must relate to current photography work |
| Props & supplies (SQ *PACIFIC PROPS) | Line 22 | 100% | |
| Fuel & mileage (SHELL GAS) | Line 9 | Business % | ⚠️ Q-C3: elect method. Mileage: 70¢/mi (2025). Actual: track all vehicle costs. Must choose by first use in year. |
| Equipment rental (BorrowLenses) | Line 20a | 100% | |
| Hard drives & storage (SanDisk) | Line 22 | 100% | <$2,500/item = de minimis safe harbor → Line 22 acceptable |
| Software subscriptions (Adobe, Dropbox, Squarespace) | Line 27a | 100% | |
| Camera insurance (State Farm) | Line 15 | 100% | |
| Phone — AT&T | Line 25 | Business % | ⚠️ If shared personal/business phone: ask business use % once |
| Client meals | Line 24b | **50% only** | ⚠️ $68 → $34 deductible |
| Other operating expenses | ⚠️ MUST BREAK DOWN | — | ⚠️ This catch-all label cannot ship. Must be itemized. |

---

### P04 — s-corp.creative
**Marcus Webb · Marcus Webb Productions Inc. · S-Corporation**
**IRS Form: Form 1120-S + K-1 → Schedule E Part II**
**Payroll provider: Gusto**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income (Apex Media, Hartfield, Johnson Wedding, Summit recap) | 1120-S Line 1a | 100% income | |
| Stock footage licensing (Artlist) | 1120-S Line 1a or Other income | 100% income | ⚠️ Same CPA question as P03 |
| **EXPENSES** | | | |
| Payroll — Gusto April payroll (officer + any employees) | 1120-S Line 7 (Marcus) + Line 8 (others) | 100% | ⚠️ Must split officer comp (Line 7) from any other employee wages (Line 8) |
| Van lease — April | 1120-S Line 11 (Rents) | Business % | Lease payments. ⚠️ Luxury auto rules may apply if FMV over IRS threshold. |
| Gas — BP fill-up | 1120-S Line 19 (actual method expense) | Business % | Only if using actual vehicle method for the van |
| Contractors (Reece 2nd shooter $600, Mara editor $300) | 1120-S Line 19 | 100% | ⚠️ Reece: $600 single payment = AT threshold. Track YTD. Mara: $300 YTD — watch for total ≥$600. |
| Equipment (B&H Photo $1,840) | 1120-S Line 19 (de minimis safe harbor per §1.263(a)-1(f)) | 100% in year of purchase | ✓ **$1,840 is UNDER the $2,500 de minimis safe harbor** per Treas. Reg. §1.263(a)-1(f)(1)(ii) for taxpayers without an AFS. Expense in year of purchase, no depreciation required. Attach annual safe-harbor election statement. (Prior v1.1 incorrectly flagged this as requiring Section 179 vs. depreciation decision.) |
| Equipment rental | 1120-S Line 11 (Rents) | 100% | |
| Camera/equipment insurance | 1120-S Line 19 | 100% | |
| Client meals (Per Se $180) | 1120-S Line 19 (50% limit) | **50% only** | K-1 Box 7 tracks non-deductible portion |
| Software subscriptions (Adobe, Frame.io, Squarespace) | 1120-S Line 19 | 100% | |
| Marketing | 1120-S Line 16 (Advertising) | 100% | |
| Phone — Verizon | 1120-S Line 19 | Business % | |
| Professional development | 1120-S Line 19 | 100% | |
| **NON-DEDUCTIBLE** | | | |
| Owner's distribution ($3,500 transfer to personal) | NOT on 1120-S | 0% | ⚠️ This is the owners-draw card variant in the demo. Must be categorized as equity event, not expense. |

---

### P05 — sole-prop.trades
**Jake Torres · Jake Torres Electric · Sole Proprietor**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Job payment (Martinson Residence, Riverdale Office, Williams, small repairs) | Line 1 | 100% income | Service business — no COGS section needed |
| **EXPENSES** | | | |
| Materials — Home Depot ($1,240) | Line 22 (Supplies) | 100% | ⚠️ Jake is job-by-job, no inventory stocking → Line 22 correct. CPA to confirm OE-2. |
| Materials — Graybar Electric ($620) | Line 22 | 100% | Same |
| Vehicle fuel & maintenance ($340) | Line 9 | Business % | ⚠️ Q-C3: method election. Truck used for job sites. |
| Tools & equipment ($340) | Line 22 (small tools) or Line 13 (large) | 100% | ⚠️ Small tools (<$2,500/item) → Line 22. Larger tools → ask Section 179 election. |
| License renewal & permits ($280) | Line 23 | 100% | Electrician's license, business license |
| NECA membership ($180) | Line 27a | 100% | Trade association — not a "tax" → Line 27a not Line 23 |
| Truck payment ($196) | NOT a deductible loan payment | — | ⚠️ Loan principal is NOT deductible. Depreciation of the truck is deductible (Line 13 + Form 4562). Interest portion of payment → Line 16b. |
| Commercial insurance — Progressive ($189) | Line 15 | 100% | Commercial auto + general liability |
| Safety supplies/PPE ($130) | Line 22 | 100% | |
| Phone — Verizon ($85) | Line 25 | Business % | |
| **TAX OBLIGATIONS** | | | |
| Self-employment tax | Schedule SE | 15.3% on 92.35% of net profit | |

---

### P06 — llc.trades
**Marco Henderson · Henderson Renovations LLC · LLC**
**Path A — SMLLC (single-member): Schedule C + Schedule SE**
**Path B — MMLLC (multi-member): Form 1065 + Schedule K-1 → members' Schedule E Part II**

> Penny must ask at onboarding: "Is this LLC owned by just you, or do you have a co-owner?" One owner → Path A (Schedule C). Co-owner → Path B (Form 1065).

| Category | SMLLC → Sch C | MMLLC → Form 1065 | Deduct % | Flag |
|---|---|---|---|---|
| **INCOME** | | | | |
| Client income (contractor jobs) | Line 1 | Line 1a | 100% income | |
| **EXPENSES** | | | | |
| Subcontractors — Rivera Electric ($3,200), helper ($1,400) | Line 11 (Contract labor) | **Line 20** (Other deductions — NOT Line 10; Line 10 is Guaranteed payments to PARTNERS, not external subcontractors) | 100% | ⚠️ Both likely individuals/unincorporated → 1099-NEC if ≥$600/yr. Rivera at $3,200, helper at $1,400 — both need W-9 + 1099-NEC. |
| Materials — Home Depot, Builders FirstSource, Lowe's | Line 22 or Part III | Line 20 or COGS | 100% | ⚠️ Job-by-job (no inventory) → Line 22 (Sch C) / Line 20 (1065). Stocked inventory → COGS. §471(c) small-taxpayer inventory method available. |
| Equipment rental — United Rentals ($1,480) | Line 20a | Line 13 (Rent) | 100% | (v1.2 fix: was incorrectly "Line 9b" — Form 1065 Line 13 is the correct Rent line) |
| Commercial insurance ($680) | Line 15 | **Line 20** (Other deductions — NOT Line 18; Line 18 on Form 1065 is Retirement plans) | 100% | v1.2 CRITICAL FIX: Prior v1.1 routed insurance to Line 18, which would have generated an incorrect Form 1065. |
| Vehicle & fuel ($1,020) | Line 9 | Line 20 | Business % | ⚠️ Q-C3 method election applies. 2025 standard mileage rate = 70¢/mi per IRS Notice 2025-5. |
| Permits & inspections ($480) | Line 23 | Line 14 | 100% | Job-specific permits |
| Tools & small equipment ($420) | Line 22 | Line 20 | 100% | Items <$2,500/item per de minimis safe harbor §1.263(a)-1(f) |
| Dump & disposal ($380) | Line 27a | Line 20 | 100% | |
| Accounting ($320) | Line 17 (Legal and professional services) — (v1.2 fix: was Line 27a) | Line 20 | 100% | CPA/bookkeeping fees → Line 17, not Line 27a |
| Phone & internet ($280) | Line 25 | Line 20 | Business % | |
| Materials reimbursement — contra ($-325) | Contra to materials | Contra to materials | — | Net against the corresponding materials expense |
| **DISTRIBUTIONS** | | | | |
| Member distributions | NOT on Sch C | NOT on Form 1065 | 0% | SMLLC: equity withdrawal (drawing account). MMLLC: tracked on partner's **K-1 Line 19, Code A** (cash distributions) / B (marketable securities) / C (other). Neither is deductible. Distributions in excess of basis are capital gain per IRC §731(a)(1). |

---

### P07 — sole-prop.retail
**Olivia Park · Olive & Oak Co. · Sole Proprietor**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Sales income (Shopify, Etsy, Maison Home wholesale) | Line 1 | 100% income (GROSS) | ⚠️ Record gross sales. Platform fees are separate expense. |
| **COGS (Schedule C Part III)** | | | |
| Cost of goods / Inventory purchased | Part III Lines 35–41 | 100% of goods sold | ⚠️ COGS only recognized when goods are sold. Opening and closing inventory must be tracked. |
| **EXPENSES** | | | |
| Shipping & packaging ($520) | Line 27a or Part III Line 38 | 100% | ⚠️ Packaging that leaves with the product → COGS. Shipping cost to customer → Line 27a (Other expenses). |
| Platform fees ($460 — Shopify, Etsy) | Line 10 (Commissions and fees) | 100% | Not Line 27a — Line 10 is more accurate for marketplace fees |
| Advertising ($340) | Line 8 | 100% | |
| Supplies ($180) | Line 22 | 100% | Business supplies (non-COGS) |
| **TAX OBLIGATIONS** | | | |
| Self-employment tax | Schedule SE | 15.3% on 92.35% of net profit | |

---

### P08 — llc.retail
**Mei Chen · Westside Goods LLC · LLC (with employee)**
**IRS Form: Form 1065 (multi-member) or Schedule C (single-member)**
**Payroll provider: Gusto**

> ⚠️ OE-1 applies. Gusto payroll for one part-time employee does not determine LLC membership. CPA must confirm.

| Category | IRS Form 1065 / Sch C | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Sales income (Square in-store, Shopify, wholesale coffee shops) | 1065 Line 1a / Sch C Line 1 | 100% income (GROSS) | Record gross, separate platform fees |
| **COGS** | | | |
| Inventory / COGS ($5,600) | 1065 COGS section / Sch C Part III | 100% of goods sold | ⚠️ Opening/closing inventory must balance. |
| **EXPENSES** | | | |
| Rent ($3,400) | 1065 Line 13 / Sch C Line 20b | 100% | Dedicated retail space — not home office. (v1.2 fix: was erroneously "1065 Line 9b" — Line 9b/9c don't exist on Form 1065; Rent is Line 13.) |
| Payroll (Gusto — part-time employee, $2,400) | 1065 Line 9 / Sch C Line 26 | 100% | W-2 issued to employee. Employer FICA → Line 14 (1065) / Line 23 (Sch C). (v1.2 fix: was erroneously "1065 Line 9c" — there's no sub-line; Line 9 on 1065 is Salaries and wages other than to partners.) |
| Platform fees & processing ($780) | 1065 Line 20 / Sch C Line 10 | 100% | |
| Marketing ($620) | 1065 Line 20 / Sch C Line 8 | 100% | |

---

### P09 — sole-prop.food-beverage
**Carmen Vega · Carmen Vega Catering · Sole Proprietor**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Catering income (Meridian Group, Hartfield wedding, private events) | Line 1 | 100% income | |
| **COGS** | | | |
| Food & ingredients ($1,840) | Part III Line 38 (Materials) | 100% | ⚠️ Ingredients are COGS, not supplies. Must track COGS separately from operating expenses. |
| **EXPENSES** | | | |
| Kitchen rental ($480) | Line 20b | 100% | Commercial kitchen hourly rental |
| Packaging & supplies ($380) | Part III Line 38 (if product-related) or Line 22 | 100% | ⚠️ Packaging that goes with catered meals → COGS. Cleaning supplies → Line 22. |
| Transportation ($300) | Line 9 or Line 27a | Business % | ⚠️ If driving personal vehicle to events → Line 9. Rideshare/delivery to event → Line 27a. |
| Equipment cleaning ($200) | Line 22 or Line 21 (Repairs & maintenance) | 100% | |

---

### P10 — llc.food-beverage
**Tony Russo · Curbside Collective LLC · LLC with employee**
**IRS Form: Form 1065 (multi-member) or Schedule C (single-member)**
**Payroll provider: Gusto**

| Category | IRS Form 1065 / Sch C | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Daily food truck sales (Toast/Square daily deposits) | 1065 Line 1a / Sch C Line 1 | 100% income (GROSS) | Record gross; POS fees = separate expense |
| Catering income (Apex Corp, private events) | 1065 Line 1a / Sch C Line 1 | 100% income | |
| **COGS** | | | |
| Food & ingredients — Sysco ($9,600) | 1065 COGS / Sch C Part III Line 38 | 100% | ⚠️ Dominant cost driver for food-truck business. Must route to COGS, not supplies. (v1.2 clean-up: removed "~40% of revenue" margin annotation — it's demo commentary, not IRS guidance.) |
| **EXPENSES** | | | |
| Payroll — Gusto ($3,200) | 1065 Line 9 / Sch C Line 26 | 100% | W-2 for part-time helper. Employer FICA → Line 14 (1065) / Line 23 (Sch C). (v1.2 fix: was "Line 9c" — no sub-line exists.) |
| Commissary rent ($1,800) | 1065 Line 13 / Sch C Line 20b | 100% | Commercial kitchen anchor cost. (v1.2 fix: was "Line 9b" — Rent is Line 13 on Form 1065.) |
| Truck fuel & maintenance ($1,400) | 1065 Line 20 / Sch C Line 9 | Business % | ⚠️ Truck is a business vehicle. Method election applies. |
| Packaging & supplies ($1,400) | 1065 COGS or Line 22 / Sch C Part III or Line 22 | 100% | ⚠️ Food packaging → COGS. Non-product supplies → Line 22. |

---

### P11 — sole-prop.beauty-wellness
**Dana Kim · Dana Kim Studio · Sole Proprietor (booth renter)**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income — Square weekly payouts | Line 1 (GROSS) | 100% income | Record gross; Square fees = separate Line 10 expense |
| Tip income — Venmo/cash tips | Line 1 | 100% income | ⚠️ Tips are taxable income. Must be reported even if cash-only. |
| Product income — retail product sales | Line 1 | 100% income | If products have COGS → Part III. If no inventory tracking → Line 22 cost of products. |
| **EXPENSES** | | | |
| Booth rent ($640) | Line 20b | 100% | Salon booth rental. Not home office. |
| Supplies & products ($480) | Line 22 | 100% | Professional supplies used in services |
| Tools & equipment ($220) | Line 22 or Line 13 | 100% | ⚠️ Small tools (<$2,500) → Line 22. Larger equipment → Section 179 question. |
| Education & licensing ($100) | Line 27a (CE) + Line 23 (license portion) | 100% | ⚠️ Split: license renewal fee → Line 23. CE coursework → Line 27a. |
| Phone ($40) | Line 25 | Business % | |

---

### P12 — s-corp.beauty-wellness
**Alicia Monroe · Serene Wellness Studio Inc. · S-Corporation**
**IRS Form: Form 1120-S + K-1 → Schedule E Part II**
**Payroll provider: Gusto**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Service income — Square daily deposits | 1120-S Line 1a | 100% income | |
| Product income — retail product sales | 1120-S Line 1a | 100% income | Products have COGS → 1120-S Line 2 |
| Gift card redemptions | 1120-S Line 1a | 100% income | Recognize as income when redeemed (cash basis) |
| **EXPENSES** | | | |
| Payroll incl. owner salary (Gusto, $4,800) | 1120-S Line 7 (Alicia) + Line 8 (contractors/staff) | 100% | ⚠️ Alicia's salary = Line 7 (officer). Staff = Line 8. Reasonable salary check required. |
| Rent — studio lease ($4,200) | 1120-S Line 11 | 100% | Dedicated studio space |
| Product inventory ($1,400) | 1120-S Line 2 (COGS) | 100% | Products sold = COGS, not supplies |
| Software & subscriptions ($480) | 1120-S Line 19 | 100% | Booking software (Vagaro/Mindbody), etc. |
| Professional liability insurance ($220) | 1120-S Line 19 | 100% | |
| Supplies ($100) | 1120-S Line 19 | 100% | |
| **NON-DEDUCTIBLE** | | | |
| Owner's distribution (Alicia) | NOT on 1120-S | 0% | Equity event only |
| Alicia's health insurance (if corp pays) | NOT on 1120-S Line 18 | — | ⚠️ Add to W-2, deduct on personal Schedule 1 Line 17 |

---

### P13 — sole-prop.professional-services
**Rachel Moore LCSW · Rachel Moore LCSW · Sole Proprietor (therapist)**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income — session fees, coaching packages | Line 1 | 100% income | Cash basis |
| **EXPENSES** | | | |
| Office sublease ($900) | Line 20b | 100% | Subleased office for therapy practice |
| Software & tools — EHR, billing ($480) | Line 27a | 100% | Practice management software |
| CE & supervision ($280) | Line 27a | 100% | Clinical supervision = continuing education for LCSWs |
| Office supplies ($120) | Line 18 | 100% | |
| Professional memberships ($60) | Line 27a | 100% | NASW, state association |
| **TAX OBLIGATIONS** | | | |
| Self-employment tax | Schedule SE | 15.3% on 92.35% of net | |

---

### P14 — s-corp.professional-services
**David Park · Park & Associates PC · S-Corporation**
**IRS Form: Form 1120-S + K-1 → Schedule E Part II**
**Payroll provider: Gusto**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income — retainers (Davis Holdings, Meridian Ventures, Harmon, Nexus) | 1120-S Line 1a | 100% income | |
| **EXPENSES** | | | |
| Shareholder payroll (David, Gusto, $7,000/mo) | 1120-S Line 7 | 100% | ⚠️ **Reasonable compensation review required** (v1.2 reframe): no statutory % threshold exists. Defensibility rests on IRS Fact Sheet 2008-25 nine-factor test and comparable-market wage data. For a management-consulting S-Corp owner in most US markets, $84K/year is below senior-consultant W-2 comparables; the defense is a compensation study (RCReports, BLS OES), NOT a % ratio. Case law: *Watson v. U.S.* 668 F.3d 1008 (8th Cir. 2012). |
| Rent ($3,200) | 1120-S Line 11 | 100% | |
| Software & tools ($320) | 1120-S Line 19 | 100% | |
| Travel & client meals ($280) | 1120-S Line 19 (50% for meals portion) | Travel 100% / Meals **50%** | ⚠️ Must split travel from meals in the data. Meals always 50%. |
| Professional development ($200) | 1120-S Line 19 | 100% | |
| **NON-DEDUCTIBLE** | | | |
| Owner's distribution | NOT on 1120-S | 0% | |
| David's health insurance (if corp pays) | W-2 add-back + personal Schedule 1 | — | ⚠️ Standard S-Corp health insurance rule |

---

### P15 — sole-prop.tech-software
**Alex Rivera · Alex Rivera Dev · Sole Proprietor (freelance developer)**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income — Verdo Labs retainer, Bright Co project, Northlight Media consulting | Line 1 | 100% income | |
| **EXPENSES** | | | |
| Cloud infrastructure ($680) | Line 27a | 100% | AWS, GCP, etc. — business infrastructure |
| Software subscriptions ($540) | Line 27a | 100% | Dev tools, productivity apps |
| Home office ($480) | Line 30 (Form 8829 or simplified) | Simplified: up to $1,500/yr. Actual: business % | ⚠️ Q-C4: method not yet specified. Regular and exclusive use required. |
| Hardware ($280) | Line 22 (if <$2,500) or Line 13 | Business % | ⚠️ Mixed use hardware → business % only. Penny must ask once. |
| Professional development ($120) | Line 27a | 100% | |

---

### P16 — s-corp.tech-software
**Priya Shah · Shah Software Inc. · S-Corporation**
**IRS Form: Form 1120-S + K-1 → Schedule E Part II**
**Payroll provider: Gusto**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Subscription income — Stripe MRR | 1120-S Line 1a | 100% income | Record Stripe gross payouts; Stripe fees = separate expense |
| Client income — enterprise invoices | 1120-S Line 1a | 100% income | |
| **EXPENSES** | | | |
| Shareholder payroll (Priya, Gusto, $6,000/mo) | 1120-S Line 7 | 100% | ⚠️ **Reasonable compensation review required** (v1.2 reframe — the prior "40% minimum" heuristic was a CPA rule-of-thumb, NOT IRS authority). Under IRC §162 and Treas. Reg. §1.162-7 (via IRS Fact Sheet 2008-25), reasonable compensation is a facts-and-circumstances test based on what a non-owner employee would be paid for the same role. Priya at $72K/year for a solo senior full-stack engineer/SaaS founder is below comparable-market wages in most US tech hubs. The defense is a compensation study (RCReports, Bureau of Labor Statistics) — not a % ratio. Case law: *Watson v. U.S.* 668 F.3d 1008 (8th Cir. 2012), *Glass Blocks Unlimited* T.C. Memo 2013-180. |
| Payroll taxes (employer, $600) | 1120-S Line 12 | 100% | Employer FICA on Priya's W-2 |
| Cloud infrastructure (AWS, $2,100) | 1120-S Line 19 | 100% | |
| Software & SaaS tools ($680) | 1120-S Line 19 | 100% | |
| Payment processing — Stripe fees ($420) | 1120-S Line 19 or Line 7 (as deduction of revenue) | 100% | Stripe 2.9%+30¢ fees — book as Line 19 expense or contra to gross revenue (pick one, be consistent) |
| Contractors ($200) | 1120-S Line 19 | 100% | ⚠️ Monitor for $600 YTD threshold |
| Solo 401(k) contribution ($400) | 1120-S Line 17 (employer match portion) | 100% | ⚠️ Employee deferral portion → Priya's personal Schedule 1 Line 16, not on 1120-S |
| **NON-DEDUCTIBLE** | | | |
| Owner's distribution | NOT on 1120-S | 0% | Key S-Corp benefit: distributions avoid SE tax |

---

### P17 — sole-prop.healthcare
**Lisa Grant · Lisa Grant Physical Therapy · Sole Proprietor**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Insurance income — Aetna, BlueCross reimbursements | Line 1 | 100% income | ⚠️ HIPAA: use payer (insurance company) name, never patient name. Record when received (cash basis). |
| Client income — private pay sessions | Line 1 | 100% income | |
| **EXPENSES** | | | |
| Office sublease ($1,100) | Line 20b | 100% | Clinical office sublease |
| Software — EHR & billing ($360) | Line 27a | 100% | Jane App, SimplePractice, billing software |
| Supplies & equipment ($320) | Line 22 or Line 13 | 100% | ⚠️ Clinical supplies → Line 22. Equipment >$2,500 → Section 179 question. |
| Continuing education ($120) | Line 27a | 100% | PT licensure requires CE credits |
| Professional liability insurance ($60) | Line 15 | 100% | Malpractice insurance |

---

### P18 — s-corp.healthcare
**James Wu · Wu Family Wellness Inc. · S-Corporation (PT clinic)**
**IRS Form: Form 1120-S + K-1 → Schedule E Part II**
**Payroll provider: Gusto**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Insurance income — BCBS, Aetna, UHC reimbursement batches | 1120-S Line 1a | 100% income | ⚠️ HIPAA: payer name only. Recognize when ERA/remittance received. |
| Private pay & wellness programs | 1120-S Line 1a | 100% income | |
| **EXPENSES** | | | |
| Payroll — Gusto ($8,400 — James + 2 staff PTs) | 1120-S Line 7 (James) + Line 8 (staff PTs) | 100% | ⚠️ Highest expense line — payroll dominates. James's reasonable salary vs. distributions must be defensible. |
| Clinic lease ($4,800) | 1120-S Line 11 | 100% | Dedicated clinical space |
| Malpractice insurance ($700) | 1120-S Line 19 | 100% | |
| Supplies & equipment ($460) | 1120-S Line 19 | 100% | ⚠️ Equipment >$2,500 → Line 14 (depreciation) |
| Software — EHR & billing ($440) | 1120-S Line 19 | 100% | |
| **NON-DEDUCTIBLE** | | | |
| Owner's distribution (James) | NOT on 1120-S | 0% | |
| Staff health insurance (if any) | 1120-S Line 18 | 100% | For non-owner employees only |
| James's health insurance (if corp pays) | W-2 add-back + personal Schedule 1 | — | ⚠️ Standard S-Corp rule |

---

### P19 — sole-prop.other
**Natalie Brooks · Natalie Brooks VA · Sole Proprietor (virtual assistant)**
**IRS Form: Schedule C + Schedule SE**

| Category | IRS Line | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income — TechStart Co retainer, Bloom Consulting, Meridian Partners | Line 1 | 100% income | |
| **EXPENSES** | | | |
| Software & tools ($560) | Line 27a | 100% | VA tools: project management, communication, file sharing |
| Home office ($400) | Line 30 (Form 8829 or simplified) | See Form 8829 | ⚠️ Natalie is fully remote. Home office is critical deduction. Q-C4: method election. "Regular and exclusive use" required — can't deduct a kitchen table. |
| Phone & internet ($140) | Line 25 | Business % | ⚠️ Home internet → business % or Form 8829. Dedicated phone → 100%. |
| Professional development ($60) | Line 27a | 100% | |
| Supplies ($40) | Line 22 or Line 18 | 100% | |
| **NOTE FOR CPA** | | | |
| Natalie's "can I deduct my home office?" question (voiceContext) | Form 8829 | Simplified or actual | Home office deduction is one of Penny's highest-value proactive alerts for this persona type |

---

### P20 — llc.other
**Sofia Espinoza · Sparks Events LLC · LLC (event planner)**
**IRS Form: Form 1065 (multi-member) or Schedule C (single-member)**

> ⚠️ OE-1 applies. Confirm entity structure with CPA.

| Category | IRS Form 1065 / Sch C | Deduct % | Flag |
|---|---|---|---|
| **INCOME** | | | |
| Client income — event deposits and balances (Henderson wedding, Northfield Corp, Murphy baby shower) | 1065 Line 1a / Sch C Line 1 | 100% income | ⚠️ Client deposits (advance payments): taxable on receipt (cash basis). Track separately to ensure deposit → final payment reconciliation. |
| **EXPENSES** | | | |
| Contractors & vendor payments ($2,400) | 1065 Line 10 / Sch C Line 11 | 100% | ⚠️ Floral vendors, AV, musicians — individuals ≥$600/yr → 1099-NEC. Corporate vendors exempt. |
| Event supplies & florals ($1,400) | 1065 Line 20 / Sch C Line 22 | 100% | Per-event supplies. Document per event. |
| Venue & rental fees ($1,000) | 1065 Line 13 / Sch C Line 20b | 100% | ⚠️ If billed to client as a pass-through → this is a reimbursable that nets out. If absorbed as a cost → Line 20b. Penny must distinguish. (v1.2 fix: was "Line 9b" — Rent is Line 13 on Form 1065.) |
| Software & tools ($340) | 1065 Line 20 / Sch C Line 27a | 100% | Planning software, CRM |
| Travel & transport ($260) | 1065 Line 20 / Sch C Line 24a + Line 9 | Varies | ⚠️ Split: overnight travel → Line 24a. Local transport → Line 9. |

---

## Part 3 — CPA Review Checklist (per entity type)

### All sole props and single-member LLCs (Personas P01, P03, P05, P07, P09, P11, P13, P15, P17, P19)
- [ ] COGS correctly separated from operating expenses for product-based personas (P07, P09)
- [ ] Meals confirmed at 50% deductibility everywhere
- [ ] Vehicle method election specified (Q-C3)
- [ ] Home office method specified (Q-C4) — especially P15 Alex Rivera Dev, P19 Natalie Brooks VA
- [ ] "Other operating expenses" catch-all label removed from all ledgers before shipping
- [ ] Stock licensing income (P03) — confirm Sch C Line 1 vs. Schedule E royalty treatment
- [ ] Sole prop owner health insurance / retirement — NOT on Sch C, confirmed excluded
- [ ] Contractor 1099-NEC tracking confirmed for all personas with contractor spend
- [ ] Tip income (P11 Dana Kim) — confirmed as taxable income
- [ ] Truck payment (P05 Jake Torres) — confirmed loan principal is not deductible; only depreciation + interest

### All S-Corps (Personas P02, P04, P12, P14, P16, P18)
- [ ] Reasonable salary check for each persona (especially P16 Priya Shah at 21% salary ratio)
- [ ] Officer compensation (Line 7) split from employee wages (Line 8) for all Gusto payroll entries
- [ ] Owner's distributions confirmed as non-deductible equity events — reported on K-1 **Box 16 Code D** (S-Corp 1120-S K-1) or **Line 19 Code A/B/C** (partnership 1065 K-1). Never on the entity-level deduction section.
- [ ] Owner's health insurance routing confirmed (W-2 add-back + Schedule 1 Line 17 — not 1120-S Line 18)
- [ ] K-1 Box 1 ordinary income correctly flows to Schedule E Part II (not subject to SE tax)
- [ ] Meals at 50% — K-1 Box 7 reporting for non-deductible portion confirmed
- [ ] Solo 401(k) / retirement split (P16 Priya Shah) — employer portion on 1120-S, employee deferral on personal Schedule 1

### All LLCs (Personas P06, P08, P10, P20)
- [ ] Confirm multi-member vs. single-member for each LLC at user onboarding — both IRS paths now documented in this file
- [ ] Member distributions confirmed as non-deductible equity events (neither Sch C nor Form 1065 deduction)
- [ ] COGS correctly applied for P08 (retail) and P10 (food-bev)
- [ ] Contractor 1099-NEC confirmed for P06 (trades) and P20 (events)
- [ ] For MMLLC path: confirm guaranteed payments to members (Form 1065 Line 10) are properly distinguished from non-deductible distributions

---

## Part 4 — Category label status in scenarios.json

### ✅ Fixed in scenarios.json (23 April 2026)

These were corrected by the automated fix pass. New labels are IRS-defensible.

| Old label | New label | IRS basis |
|---|---|---|
| `"Meals"` | `"Business meals (50%)"` | Sch C Line 24b / 1120-S Line 16 at 50% |
| `"Client meals"` | `"Client meals (50%)"` | Same |
| `"Travel & client meals"` | `"Travel & client meals (50%)"` | Same |
| `"Meals & entertainment"` | `"Meals & entertainment (50%)"` | Same |
| `"Other operating expenses"` | `"Miscellaneous business expenses"` | Sch C Line 27a / Form 1065 Line 20 — legitimate IRS catch-all |
| `"Truck payment"` / `"Truck payment — Ford Credit"` | `"Vehicle depreciation & loan interest"` | Sch C Line 9 (depreciation) + Line 16b (interest). Principal not deductible. |
| `"Inventory"` | `"Inventory (COGS)"` | Sch C Part III / Form 1065 COGS — recognized when goods sold |
| `"Product inventory"` | `"Product inventory (COGS)"` | Same |
| `"Food & ingredients"` (food-bev only) | `"Food & ingredients (COGS)"` | Part III Line 38 / 1065 COGS — not supplies |
| `"Food & ingredients (COGS ~40%)"` | `"Food & ingredients (COGS)"` | Simplified label — ~40% note is a margin note, not IRS |

### ⚠️ Still requires CPA decision before shipping

These remain in scenarios.json but require a product or CPA decision before any tax-facing output ships.

| Label | Problem | Required decision |
|---|---|---|
| `"Miscellaneous business expenses"` | Legitimate Sch C Line 27a, but Penny should prompt the user to provide a description. A bare catch-all is audit risk if overused. | Product decision: prompt user to name the expense when this category is selected. |
| `"Materials"` (as a flat expense) | May be COGS or Line 22 depending on business type | Add COGS vs. supplies distinction at transaction level (Q-C1) |
| `"Utilities"` (for home-based) | Needs home office routing through Form 8829 | Onboarding workspace type determines routing (Q-C4) |
| `"Phone"` (at 100%) | Business use % required for shared phones | Ask-once rule: dedicated business phone vs. shared? |
| `"Van lease"` and `"Vehicle fuel"` as separate entries | Risk of double-counting under standard mileage | Q-C3: method election must be captured and enforced |
| `"Equipment"` / `"B&H PHOTO VIDEO"` ($1,840) | Auto-categorized without Section 179 / depreciation prompt | Flag any single purchase >$500 for depreciation decision |

---

*This document is the per-persona source of truth for `categories.v1.json`. CPA sign-off required on every row before any Schedule C, 1120-S, P&L export, or "tax-ready" claim ships. See `irs-schedule-mapping.md` for category-level detail and `ai-evals/06-cpa-review.md` for test cases.*
