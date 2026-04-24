# Demo — scenarios.json label → IRS line routing

*Demo-local lookup. Maps every category label currently in `BookKeeping/demo/public/config/scenarios.json` to the correct IRS line per entity path.*
*Production source of truth: `BookKeeping/engineering/categories.v1.json` — consumed only for the demo.*
*Last updated: 24 April 2026 (post CPA stress-test fixes)*

---

## How to use this file

When a demo surface needs to show an IRS line next to a category (My Books → Explore → Schedule C preview, for example), look up the label here. Every row maps:

- **Label** — exact string as it appears in `scenarios.json`.
- **Type** — income, cogs, expense, nonDeductible.
- **Sch C** — line on Schedule C (Form 1040) for sole prop / SMLLC.
- **1120-S** — line on Form 1120-S for S-Corp.
- **1065** — line on Form 1065 for MMLLC.
- **Deduct %** — deductibility, or special note.
- **Notes** — flags, compliance items, v1.2 fixes.

---

## Income categories

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Client income | income | 1 | 1a | 1a | 100% | Cash basis. HIPAA-adjacent personas (P17 Lisa, P18 James) use payer name, never patient. |
| Client income — tip | income | 1 | 1a | 1a | 100% | Taxable per §61. P11 Dana booth renter. |
| Sales income | income | 1 | 1a | 1a | 100% | GROSS. Platform fees separate. |
| Subscription income | income | 1 | 1a | 1a | 100% | Stripe MRR gross. |
| Catering income | income | 1 | 1a | 1a | 100% | P09 Carmen. |
| Insurance income | income | 1 | 1a | 1a | 100% | Healthcare payer reimbursements (P17, P18). |
| Product income | income | 1 | 1a | 1a | 100% | P11, P12. |
| Service income | income | 1 | 1a | 1a | 100% | P12. |
| Job payment | income | 1 | 1a | 1a | 100% | Trades (P05, P06). |
| Other income | income | 6 | 5 | 7 | 100% | Rare; usually income-like outflows returned. |

## COGS categories (product businesses)

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Cost of goods | cogs | Part III L36 | 2 | 2 | 100% on sale | Retail resale. |
| Inventory (COGS) | cogs | Part III L35/36/41 | 2 | 2 | 100% on sale | v1.2 canonical label (was "Inventory / COGS" in some rows — normalized). |
| Product inventory (COGS) | cogs | Part III L36 | 2 | 2 | 100% on sale | P12 beauty retail. |
| Food & ingredients (COGS) | cogs | Part III L38 | 2 | 2 | 100% on sale | P09, P10. Raw materials consumed. |
| Packaging | cogs | Part III L38 or L22 | 2 or 19 | 2 or 20 | 100% | COGS if part of product. Supplies otherwise. |
| Packaging & supplies | cogs | Part III L38 or L22 | 2 or 19 | 2 or 20 | 100% | Same. |

## Vehicle / transportation

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Van lease | expense | 20a | 11 | 13 | Business % | v1.2 fix: split from "Van lease + gas" which was wrong-routing. |
| Vehicle fuel | expense | 9 | 19 | 20 | Business % | Only under actual method. Standard mileage absorbs fuel. |
| Fuel & mileage | expense | 9 | 19 | 20 | Business % | 2025 mileage 70¢ (Notice 2025-5). |
| Vehicle fuel & maintenance | expense | 9 | 19 | 20 | Business % | Only under actual method. |
| Truck fuel | expense | 9 | 19 | 20 | Business % | Same. |
| Truck fuel & maintenance | expense | 9 | 19 | 20 | Business % | Same. |
| Vehicle & fuel | expense | 9 | 19 | 20 | Business % | Same. |
| Vehicle maintenance | expense | 9 | 19 | 20 | Business % | Under actual. Major maintenance may be an improvement (BAR test, §1.263(a)-3). |
| Vehicle depreciation & loan interest | splitExpense | 13 + 16b | 14 + 13 | 16c + 15 | Principal 0% | Split: depreciation (from basis schedule), interest (business %), principal (never deductible). |
| Transportation | expense | 9 or 27a | 19 | 20 | Business % | Local transport. Overnight → Travel Line 24a. |

## Platform and processing fees

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Platform fees | expense | 10 | 19 | **20** | 100% | v1.2 fix: Form 1065 Line 20, NOT Line 10 (which is Guaranteed payments to partners). |
| Platform fees & processing | expense | 10 | 19 | 20 | 100% | Same. |
| Payment processing | expense | 10 or 27a | 19 | 20 | 100% | Stripe, Square transaction fees. |

## Contractors and labor

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Contractors | expense | 11 | 19 | **20** | 100% | v1.2 fix: Form 1065 Line 20, NOT Line 9 (W-2 wages) or Line 10 (partner payments). 1099-NEC if ≥$600 and not via CC/third-party. |
| Subcontractors | expense | 11 | 19 | **20** | 100% | Same. P06 Rivera Electric. |
| Contractor — helper (1099) | expense | 11 | 19 | 20 | 100% | Same. |
| Contractors & vendor payments | expense | 11 (services) or 22 (supplies) | 19 | 20 | 100% | Split service vs. supply portion. |
| Rivera Electric (subcontractor) | expense | 11 | 19 | **20** | 100% | Critical fix — prior v1.1 routed to 1065 Line 10, which is partner guaranteed payments. |
| Payroll | expense | 26 | 8 | 9 | 100% | W-2 employees (non-owner). |
| Payroll taxes | expense | 23 | 12 | 14 | 100% | Employer FICA. |
| Shareholder payroll | expense | n/a | **7** | n/a | 100% | S-Corp officer comp. Reasonable-comp flag. |

## Insurance — critical v1.2 fix zone

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Insurance | expense | 15 | 19 | **20** | 100% | v1.2 fix: Form 1065 Line 20 for business insurance (NOT Line 18 — Line 18 is Retirement plans). Label is generic — prefer specific labels below. |
| Commercial insurance | expense | 15 | 19 | **20** | 100% | v1.2 fix: Line 20 on 1065 (NOT 18). |
| Camera insurance | expense | 15 | 19 | 20 | 100% | P03, P04. |
| Camera/equipment insurance | expense | 15 | 19 | 20 | 100% | Canonical for P04 (was generic "Insurance" pre-v1.2 fix). |
| Professional liability insurance | expense | 15 | 19 | 20 | 100% | E&O. |
| Malpractice insurance | expense | 15 | 19 | 20 | 100% | Healthcare, legal. |

## Legal, accounting

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Accounting | expense | **17** | 19 | 20 | 100% | CPA/bookkeeping → Line 17 (Legal and professional services), NOT Line 27a. |

## Office

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Office supplies | expense | 18 | 19 | 20 | 100% | Admin consumables. |
| Supplies | expense | 22 | 19 | 20 | 100% | Business-production supplies. |
| Supplies & equipment | expense | 22 or 13 | 19 or 14 | 20 or 16c | 100% | Conditional on de minimis $2,500. |
| Supplies & products | expense | 22 + Part III | 19 + 2 | 20 + 2 | 100% | Split product portion → COGS. |
| Props & supplies | expense | 22 | 19 | 20 | 100% | P03. |
| Hard drives & storage | expense | 22 | 19 | 20 | 100% | Under $2,500 de minimis. |
| Hardware | conditional | 22 or 13 | 19 or 14 | 20 or 16c | Business % | Under $2,500 → Line 22. Over → depreciate. P15 $280 → Line 22. |
| Equipment | conditional | 22 or 13 | 19 or 14 | 20 or 16c | 100% | P04 B&H $1,840 = under $2,500, routes to 1120-S Line 19 with de minimis election. |
| Tools & equipment | conditional | 22 or 13 | 19 or 14 | 20 or 16c | 100% | P05, P06 — tools under $2,500. |
| Tools & small equipment | expense | 22 | 19 | 20 | 100% | Under de minimis. |
| Safety supplies/PPE | expense | 22 | 19 | 20 | 100% | P05, P06 trades. |
| Safety & PPE | expense | 22 | 19 | 20 | 100% | Same. |
| Dump & disposal | expense | 27a | 19 | 20 | 100% | P05, P06. |
| Event supplies | expense | 22 | 19 | 20 | 100% | P20. |
| Event supplies & florals | expense | 22 | 19 | 20 | 100% | P20. |

## Rent / lease

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Rent | expense | 20b | 11 | 13 | 100% | Commercial space. |
| Booth rent | expense | 20b | 11 | 13 | 100% | P11 salon. |
| Office sublease | expense | 20b | 11 | 13 | 100% | P13, P17. 1099-MISC if individual landlord ≥$600. |
| Clinic lease | expense | 20b | 11 | 13 | 100% | P18. |
| Kitchen rental | expense | 20b | 11 | 13 | 100% | P09. |
| Commissary rent | expense | 20b | 11 | 13 | 100% | P10. |
| Equipment rental | expense | 20a | 11 | 13 | 100% | BorrowLenses, United Rentals. |
| United Rentals equipment | expense | 20a | 11 | 13 | 100% | P06. Line 13 on 1065 (v1.2 fix — was Line 9b which doesn't exist). |
| Venue & rental fees | expense | 20b or pass-through | 11 | 13 | 100% | P20. Pass-through to client = reimbursable. |
| Venue fees | expense | 20b | 11 | 13 | 100% | Same. |
| Home office | specialRouting | 30 | accountable plan or n/a | n/a (CPA required) | Simplified $5/sqft max $1,500 or Actual via 8829 | P15, P19. S-Corp (P02, P04, etc.) uses accountable plan per D91. |
| Home office / co-working | expense | 30 (if home) or 20b (co-working) | 11 or 19 | 13 or 20 | Varies | Co-working fees → rent line. Home office → Line 30. |

## Repairs

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Equipment cleaning | expense | 21 | 9 | **11** | 100% | v1.2 fix: Line 11 on 1065 (NOT Line 20). |

## Licenses / taxes

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| License renewal & permits | expense | 23 | 12 | 14 | 100% | |
| Licenses & permits | expense | 23 | 12 | 14 | 100% | |
| Permits | expense | 23 | 12 | 14 | 100% | |
| Permits & inspections | expense | 23 | 12 | 14 | 100% | Job-specific. |
| NECA membership | expense | 27a | 19 | 20 | 100% | Trade association — NOT Line 23. |
| Professional memberships | expense | 27a | 19 | 20 | 100% | Same. |
| Membership | expense | 27a | 19 | 20 | 100% | Generic — prefer specific. |
| Education | expense | 27a | 19 | 20 | 100% | Must be current-business related. |
| Education & licensing | splitExpense | 23 (license) + 27a (CE) | 12 + 19 | 14 + 20 | 100% | P11 — split license renewal from CE. |
| CE & supervision | expense | 27a | 19 | 20 | 100% | Clinical supervision for LCSWs (P13). |
| Continuing education | expense | 27a | 19 | 20 | 100% | |
| Professional development | expense | 27a | 19 | 20 | 100% | |

## Travel and meals

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Travel | expense | 24a | 19 | 20 | 100% | Overnight only. §274(d) substantiation. |
| Travel & transport | splitExpense | 24a + 9 | 19 | 20 | 100% | Split overnight vs. local. |
| Transportation | expense | 9 or 27a | 19 | 20 | Business % | P09 event transport. |
| Business meals (50%) | expense | 24b | 19 | 20 | **50%** | §274(n)(1). Watch for 2026 office-meals 0% sunset §274(o). |
| Client meals (50%) | expense | 24b | 19 | 20 | **50%** | Same. |
| Travel & client meals (50%) | splitExpense | 24a + 24b | 19 | 20 | Travel 100% / Meals 50% | P14. |
| Meals & entertainment (50%) | caution | 24b | 19 | 20 | Meals 50%, Entertainment 0% | §274(a)(1)(A) — entertainment is 0%. Split needed. |

## Utilities and communications

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Utilities | expense | 25 or Form 8829 | 19 | 20 | 100% or biz % | Home-based → Form 8829. |
| Internet | expense | 25 or Form 8829 | 19 | 20 | 100% or biz % | Same. |
| Phone | expense | 25 | 19 | 20 | Business % | Shared phone needs business-use %. §274(d)(4) removed cell-phone listed property status. |
| Phone & internet | expense | 25 | 19 | 20 | Business % | Split. |

## Software / cloud / SaaS — canonical label

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Software subscriptions | expense | 27a | 19 | 20 | 100% | CANONICAL — consolidate variants into this. |
| Software | expense | 27a | 19 | 20 | 100% | Variant. |
| Software & subscriptions | expense | 27a | 19 | 20 | 100% | Variant. |
| Software & tools | expense | 27a | 19 | 20 | 100% | Variant. |
| Software & SaaS tools | expense | 27a | 19 | 20 | 100% | Variant. |
| Software (EHR & billing) | expense | 27a | 19 | 20 | 100% | Healthcare EHR. |
| Cloud infrastructure | expense | 27a | 19 | 20 | 100% | AWS, GCP. |
| Cloud & hosting | expense | 27a | 19 | 20 | 100% | Same. |

## Retirement

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| SEP-IRA contribution | specialRouting | n/a (Schedule 1 Line 16) | 17 | 18 | 100% up to 2025 limit $70K | Sole prop: NOT on Sch C. Personal deduction. |
| Solo 401(k) contribution | specialRouting | 19 (employer) | 17 (employer) | 18 (employer) | 100% up to limits | Employee deferral portion → Schedule 1 Line 16 on personal 1040. |

## Marketing (de-duplicated)

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Marketing | expense | 8 | 16 | 20 | 100% | Same as Advertising — 1120-S has dedicated Line 16. |
| Advertising | expense | 8 | 16 | 20 | 100% | Canonical. |

## Misc / other

| Label | Type | Sch C | 1120-S | 1065 | Deduct % | Notes |
|---|---|---|---|---|---|---|
| Miscellaneous business expenses | expenseWithRequiredDescription | 27a | 19 | 20 | 100% | REQUIRES description per Schedule C Part V. Bare "Miscellaneous" is audit trigger. |
| Shipping & packaging | expense | 27a or Part III L38 | 19 or 2 | 20 or 2 | 100% | Customer shipping → Line 27a. Product packaging → COGS. |
| Printing & albums | expense | 18 or 22 | 19 | 20 | 100% | Client deliverables (albums) → Line 22. Admin printing → Line 18. |
| Materials | splitExpense | 22 or Part III | 19 or 2 | 20 or 2 | 100% | Job-by-job → Line 22. Stocked inventory → Part III COGS. §471(c) small-taxpayer available. |
| Job materials | expense | 22 | 19 | 20 | 100% | P05 trades. |
| Materials — Home Depot | expense | 22 | 19 | 20 | 100% | |
| Materials — Graybar Electric | expense | 22 | 19 | 20 | 100% | |
| Home Depot materials | expense | 22 | 19 | 20 | 100% | |
| Lowe's / Ace materials | expense | 22 | 19 | 20 | 100% | |
| Builders FirstSource materials | expense | 22 | 19 | 20 | 100% | |
| Materials reimbursement (contra) | contraExpense | Contra to materials | Contra | Contra | — | Net against materials expense line. |

---

## v1.2 critical fixes applied to this map (24 April 2026)

1. **"Van lease + gas" → split** into "Van lease" (Line 20a / 11 / 13) and "Vehicle fuel" (Line 9 / 19 / 20). Done in `scenarios.json` P04.
2. **"Inventory / COGS" → normalized** to "Inventory (COGS)" canonical. Done.
3. **Generic "Insurance" label for camera insurance → specific** "Camera/equipment insurance". Done in P04.
4. **Form 1065 Line 18 is NOT insurance** — it's Retirement plans. All insurance labels route to 1065 Line 20 (business insurance) or Line 19 (employee benefits).
5. **Form 1065 Line 11 is Repairs and maintenance** — dedicated line, not Line 20 catch-all.
6. **Form 1065 Line 10 is Guaranteed payments to partners** — external commissions and platform fees route to Line 20.
7. **Form 1065 Line 9 is W-2 employee wages** — 1099 contractors route to Line 20.
8. **S-Corp K-1 distributions are Box 16 Code D** — not Box 19. (Box 19 is partnership K-1.)
9. **2025 mileage rate is 70¢/mi** per Notice 2025-5 — not 67¢ (that's 2024).
10. **De minimis safe harbor is $2,500/item** for non-AFS taxpayers.
