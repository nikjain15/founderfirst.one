# IRS Schedule Mapping — Category Taxonomy v0.1

> **Status:** Draft — pending CPA review before any decision is locked.
> **Purpose:** First-pass answer to Q-C1 and Q-C2 from `BookKeeping/research/solo-freelancer/irs-tax-research.md`. Maps every category used in demo `scenarios.json` and `industries.json` to the exact IRS form line, deductibility rule, required supporting fields, and open flags.
> **Owner:** Nik + CPA reviewer (named in Phase 0, `implementation-strategy.md` §13).
> **Blocks:** `categories.v1.json` · Intelligence service taxonomy · Export service (Schedule C / 1120-S PDF) · AI eval 04 (Financial Computation).
> **Last updated:** 23 April 2026

---

## ⚠️ Critical issues found in current demo data

These are categorization errors in `scenarios.json` and `industries.json` that would produce incorrect tax output if shipped. Each maps to the relevant Part in this document.

| # | Issue | Demo location | IRS impact | Fix required before ship |
|---|---|---|---|---|
| 1 | **Meals shown at 100% deductible** | All sole-prop ledgers: "Client dinner — Tartine $140", "Meals $180" | Over-states deductions. Meals are 50% only (TCJA). | Penny must split meal amounts: 50% deductible, 50% non-deductible. Approval card must show the $Y deductible portion. See Part II Line 24b. |
| 2 | **Food/beverage ingredients booked as operating expenses** | `industries.json` food-beverage expenseCategories: "Food supplies", "Beverages" | Bypasses COGS section (Sch C Part III). Overstates operating expenses, misstates gross profit. | Food/bev ingredients must route to COGS (Lines 36–38), not Part II. Penny must ask: "Is this for resale?" See Part I COGS section. |
| 3 | **Inventory booked as an operating expense (retail)** | `industries.json` retail expenseCategories: "Inventory" | Same as #2 — inventory purchases are not directly expenses; COGS is recognized when goods are sold. | Add COGS category type. Penny must distinguish inventory purchase (asset) from COGS (recognized on sale). |
| 4 | **Utilities for home-based sole props shown at 100%** | sole-prop.consulting ledger: "Con Edison $201" booked as "Utilities" | Overstates deduction. Home utilities only deductible at business-use % via Form 8829, not directly on Line 25. | Onboarding must capture workspace type. Home utilities → Form 8829. Dedicated business premises utilities → Line 25 direct. See Part II Line 25. |
| 5 | **Phone shown as 100% business expense** | sole-prop.creative ledger: "Phone $95" | Only business-use % is deductible. A single shared phone requires proration. | Ask once at first phone transaction: "dedicated business line or shared?" Route accordingly. |
| 6 | **S-Corp owner's draw not distinguished from salary** | No scenario currently models the owner's draw card (C.9 variant), but payroll is modeled. | Distributions are non-deductible equity events — if booked as an expense, 1120-S is wrong. | Owner distribution must have a dedicated non-expense account type. Penny must never categorize a distribution as a deductible item. See Part III. |

---

## How to use this document

- **Engineers** — use the Penny Category Label column as the canonical name for `categories.v1.json`. Do not invent labels outside this table.
- **CPA reviewer** — validate Schedule C / 1120-S line assignments, deductibility rules, and "open flag" rows before any label ships to production.
- **AI eval authors** — use the Required Supporting Fields column to write test cases for eval 04 (Financial Computation) and eval 01 (Transaction Intelligence).

---

## Entity type → IRS form mapping

Before the category table, the right form depends on entity type. Penny must know the entity before it can map a category to the correct schedule.

| Entity type | Primary tax form | Owner income reported on |
|---|---|---|
| Sole proprietor | Schedule C (Form 1040) | Schedule C net profit → SE tax (Schedule SE) |
| Single-member LLC (default) | Schedule C (Form 1040) — treated as disregarded entity | Same as sole prop |
| Multi-member LLC (default) | Form 1065 (Partnership) + Schedule K-1 to each member | K-1 Box 1 → Schedule E Part II |
| S-Corporation | Form 1120-S + Schedule K-1 to shareholder | K-1 Box 1 → Schedule E Part II; owner salary on W-2 |
| LLC with S-Corp election | Form 1120-S (same as S-Corp) | Same as S-Corp |

**Penny's current demo personas by entity:**

| Persona key | Entity | Form |
|---|---|---|
| sole-prop.* (10 personas) | Sole prop / single-member LLC | Schedule C |
| s-corp.* (6 personas) | S-Corp | Form 1120-S + K-1 |
| llc.* (4 personas — trades, retail, food-bev, other) | Multi-member LLC (assumed; no S-Corp election) | Form 1065 + K-1 |

> **Open flag (OE-1):** The `llc.*` personas in the demo are treated as multi-member LLCs (Form 1065). Confirm with CPA whether any should be modeled as single-member (Schedule C) instead. This affects category line assignments below.

---

## Part I — Income categories

### Schedule C income (sole prop / single-member LLC)

All income flows to **Schedule C, Line 1 (Gross receipts or sales)**. Penny does not need sub-lines for income at the Schedule C level — the IRS aggregates all business income on Line 1.

| Penny Category Label | IRS Line | Deductibility | Special rules | Required supporting fields |
|---|---|---|---|---|
| Client income | Sch C Line 1 | N/A — income | Recognized when received (cash basis) | Invoice number, client name, payment date, amount |
| Project fee | Sch C Line 1 | N/A — income | Same as above | Invoice number, client name, payment date, amount |
| Sales payout | Sch C Line 1 | N/A — income | Platform payouts (Shopify, Etsy, Square) net of platform fees — Penny should record gross and platform fee separately | Payout date, platform, gross sales, fees withheld |
| Insurance payout | Sch C Line 1 | N/A — income | Insurance reimbursements for services rendered are gross income. HIPAA note: use payer name, not patient name. | EOB or remittance advice, payer name, service period |
| Daily sales | Sch C Line 1 | N/A — income | POS (Toast, Square, Clover) daily batch deposits — record gross sales, not net-of-fees deposit | POS report date, gross sales, processing fees (separate expense line) |
| Subscription revenue | Sch C Line 1 | N/A — income | Stripe MRR: Penny records Stripe payout + separately records Stripe processing fees as expense | Stripe payout date, gross MRR, Stripe fees |
| Retainer payment | Sch C Line 1 | N/A — income | If advance payment, still recognized on receipt (cash basis) | Invoice, client, period covered |
| Job payment | Sch C Line 1 | N/A — income | Progress billing or project-complete billing | Invoice, job name/address, client |
| Client visit | Sch C Line 1 | N/A — income | Per-session or package payments | Client name (or anonymized ID for HIPAA), date, amount |
| Stock licensing | Sch C Line 1 | N/A — income | Royalties also go here for sole prop; Form 1099-NEC/MISC may be issued by the payer | 1099-MISC Box 2 (royalties) if > $10 |

### Schedule C — COGS section (Lines 33–42)

Product-based businesses (retail, food & beverage, trades where materials are purchased for resale) use the COGS section. Service businesses generally do not.

| Penny Category Label | IRS Line | Who uses it | Notes |
|---|---|---|---|
| Inventory (beginning) | Sch C Line 35 | Retail, food & bev | Opening inventory at start of year |
| Inventory purchased | Sch C Line 36 | Retail, food & bev | Purchases of goods for resale |
| Inventory (ending) | Sch C Line 41 | Retail, food & bev | Closing inventory at year end |
| Food supplies (COGS) | Sch C Lines 36–38 | Food & bev | Ingredients, food items purchased for service — COGS, not supplies |
| Materials (job COGS) | Sch C Lines 36–38 | Trades | Materials purchased for specific jobs — COGS if inventory method; Line 22 (Supplies) if expensed directly under de minimis safe harbor |
| Packaging | Sch C Line 38 | Retail | Boxes, bags, tape used for shipped products |

> **Open flag (OE-2):** Trades personas (Jake Torres Electric, Henderson Renovations LLC) — confirm with CPA whether materials should flow through COGS (inventory method) or Line 22 (supplies / de minimis safe harbor). The answer affects the entire trades income statement structure. Most small trades use Line 22 if they don't carry meaningful inventory. Penny should ask this once during onboarding for trades entities and remember the answer.

---

## Part II — Expense categories (Schedule C, Part II Lines 8–27a + Part V)

### Line 8 — Advertising

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Marketing | Sch C Line 8 | 100% | Vendor, amount, business purpose | Includes paid social, Google Ads, sponsored posts, flyers, business cards |
| Paid advertising | Sch C Line 8 | 100% | Platform (Meta, Google, etc.), amount, campaign purpose | |

> **Note:** "Marketing" as a Penny label is broad. Penny should eventually distinguish advertising (Line 8) from marketing software (Line 27a) and promotional meals (Line 24b). For v1, Line 8 is correct for any direct ad spend.

---

### Line 9 — Car and truck expenses

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Vehicle & fuel | Sch C Line 9 | Business % only | For mileage method: date, origin, destination, business purpose, odometer start/end. For actual method: all receipts (gas, insurance, registration, repairs) | Must choose method in Year 1 (see Q-C3) |
| Fuel & mileage | Sch C Line 9 | Business % only | Same as above | Photography, trades, healthcare — common persona use |
| Mileage (business) | Sch C Line 9 | Per IRS standard mileage rate (2024: 67¢/mile; 2025: TBD) | Trip log: date, purpose, miles driven | Penny should default to mileage capture and compute standard rate |

> **Open flag (Q-C3):** Vehicle method selection is unresolved in `irs-tax-research.md`. Until resolved, Penny should capture mileage AND fuel/expense receipts so either method can be applied at year-end. Do not lock Alex into one method before this is answered.

---

### Line 10 — Commissions and fees

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Platform fees | Sch C Line 10 | 100% | Platform name, fee amount, month | Shopify, Etsy, Amazon, eBay — selling platform fees |
| Payment processing fees | Sch C Line 10 | 100% | Processor name, rate, transaction reference | Stripe, Square, PayPal, Toast — transaction fees |
| Marketplace fees | Sch C Line 10 | 100% | Platform name, amount | Etsy listing fees, eBay final value fees |

> **Note:** Platform fees and payment processing fees are deductible on Line 10 (Commissions and fees), not Line 27a. This is a common miscategorization that understates deductions if missed.

---

### Line 11 — Contract labor

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Contractors | Sch C Line 11 | 100% | Contractor name (individual or business), EIN or SSN, amount paid, service performed | **1099-NEC required if individual paid ≥ $600/year.** W-9 should be collected before first payment. |
| Subcontractors | Sch C Line 11 | 100% | Same as above | Common in trades, creative, healthcare |
| Freelancers | Sch C Line 11 | 100% | Same as above | |

> **Critical flag (Q-T2):** Penny must track cumulative payments per contractor across the year. At $600 to any individual, 1099-NEC is required (January 31 deadline). The Intelligence service must aggregate contractor spend by entity and surface the 1099 flag proactively. This is E21 in implementation-strategy.md.

---

### Line 13 — Depreciation (Form 4562)

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Equipment (purchased) | Sch C Line 13 + Form 4562 | Section 179 (up to $1.16M in 2024) or MACRS depreciation over 5–7 years | Asset description, purchase date, cost, business use % | Alex must choose: Section 179 immediate deduction vs. depreciation schedule |
| Camera gear | Sch C Line 13 | Section 179 or depreciation | Same as above | Creative personas |
| Computer / hardware | Sch C Line 13 | Section 179 or depreciation | Same as above; if mixed use (personal + business), only business % deductible | |
| Leasehold improvements | Sch C Line 13 | 15-year depreciation (QIP); Section 179 eligible | Same as above | Wellness studios, food & bev with physical location |

> **Open flag (OE-3):** For demo purposes, equipment purchases are categorized as a flat expense line. Before launch, Penny needs a depreciation prompt: when a transaction is above a threshold (suggest $500), Penny should ask "Is this a one-time equipment purchase or a recurring expense?" and route accordingly. Section 179 vs. depreciation choice affects tax year significantly.

---

### Line 14 — Employee benefit programs

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Health insurance (employees) | Sch C Line 14 | 100% for employees | Insurer, premium amount, employee name(s) | Note: self-employed health insurance for the owner goes on Schedule 1, Line 17 — NOT Line 14 |
| Retirement contributions (employees) | Sch C Line 14 | 100% for employee portion | Plan type, contribution amount per employee | |

> **Important:** Self-employed health insurance (Alex's own) is NOT on Schedule C. It is deducted above-the-line on Schedule 1 (Form 1040). Penny must not categorize Alex's own health insurance as a Schedule C expense.

---

### Line 15 — Insurance (other than health)

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Business insurance | Sch C Line 15 | 100% | Insurer, policy type, premium amount | General liability, property, commercial auto |
| Camera insurance | Sch C Line 15 | 100% | Insurer, policy, premium | Creative personas |
| Malpractice insurance | Sch C Line 15 | 100% | Insurer, policy, premium | Healthcare, professional services |
| Errors & omissions (E&O) | Sch C Line 15 | 100% | Insurer, policy, premium | Consulting, professional services |
| Workers' comp | Sch C Line 15 | 100% | Insurer, premium | LLC personas with subcontractors |

---

### Line 17 — Legal and professional services

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Accounting fees | Sch C Line 17 | 100% | Firm/individual, amount, service description | CPA fees for tax prep, bookkeeping, advisory |
| Legal fees | Sch C Line 17 | 100% | Firm/individual, amount, service description | Business-related legal fees only; personal legal costs not deductible |
| Research (Westlaw, etc.) | Sch C Line 17 | 100% | Vendor, amount, business purpose | Professional services persona |

---

### Line 18 — Office expense

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Office supplies | Sch C Line 18 | 100% | Vendor, items purchased, amount | Paper, pens, printer ink, small items. NOT equipment |
| Printing & albums | Sch C Line 18 | 100% | Vendor, purpose, amount | Creative persona — client deliverables |
| Postage | Sch C Line 18 | 100% | Vendor, amount | |

> **Note:** The IRS draws a loose line between Line 18 (Office expense) and Line 22 (Supplies). The practical rule: consumable items used in the office → Line 18. Materials used in the business to produce something → Line 22. For Penny v1, either is acceptable; what matters is consistency year-over-year.

---

### Line 19 — Pension and profit-sharing plans

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| SEP-IRA contribution | Sch C Line 19 | Up to 25% of net self-employment income (max ~$69K 2024) | Plan type, contribution amount, tax year | Reduces SE income; Penny should flag the contribution limit |
| Solo 401(k) contribution | Sch C Line 19 (employer portion) | Employer: 25% of compensation; Employee: up to $23K (2024) | Contribution type (employee vs. employer), amount | Employee deferral goes on Schedule 1; employer match goes on Line 19 |
| SIMPLE IRA | Sch C Line 19 | Per IRS SIMPLE rules | Same as above | |

---

### Line 20a — Rent/lease (vehicles, machinery, equipment)

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Equipment rental | Sch C Line 20a | 100% | Vendor, equipment type, rental period, amount | Camera rentals (creative), tool rentals (trades) |
| Vehicle lease | Sch C Line 20a | Business % only | Lease payments, business use %, inclusion amount if luxury vehicle | Luxury auto rules apply if FMV over IRS threshold |

---

### Line 20b — Rent/lease (other business property)

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Office rent | Sch C Line 20b | 100% (separate dedicated office) | Landlord, address, monthly amount, lease period | If home office, use Form 8829 instead — not Line 20b |
| Studio rent | Sch C Line 20b | 100% | Landlord, address, monthly amount | Creative, beauty/wellness |
| Booth rent | Sch C Line 20b | 100% | Salon/facility name, monthly amount | Beauty/wellness — stylists renting booth |
| Commissary rent | Sch C Line 20b | 100% | Kitchen facility name, monthly amount, hours rented | Food & bev |
| Commercial kitchen rent | Sch C Line 20b | 100% | Same as above | |
| Storage unit | Sch C Line 20b | 100% (business use) | Facility name, unit number, monthly rent | |

> **Open flag (Q-C4):** Home office deduction is separate from Line 20b. If Alex works from home, rent paid for the home is not deductible on Line 20b — it goes through Form 8829. Penny must ask this during onboarding (settled as D83 entity-upfront). The home office question determines whether Line 20b is used for outside rent or Form 8829 is used for home office.

---

### Line 21 — Repairs and maintenance

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Repairs | Sch C Line 21 | 100% | Vendor, asset repaired, amount, date | Must be a repair (restoring to working condition), not an improvement (which is capitalized) |
| Maintenance | Sch C Line 21 | 100% | Vendor, service type, amount, date | Regular upkeep — vehicle oil changes, equipment servicing |
| IT support | Sch C Line 21 | 100% | Vendor, service, amount | Computer/network repairs |

---

### Line 22 — Supplies

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Supplies | Sch C Line 22 | 100% | Vendor, item description, amount | Materials consumed in the business, not inventoried |
| Materials (trades, expensed) | Sch C Line 22 | 100% | Job name, vendor, amount | See OE-2 re: COGS vs. supplies for trades |
| Props & supplies | Sch C Line 22 | 100% | Vendor, items, amount, business purpose | Creative persona |
| Hard drives & storage | Sch C Line 22 | 100% | Vendor, item, amount | Creative — treated as supplies if under de minimis threshold ($2,500 per invoice/item) |
| Medical supplies | Sch C Line 22 | 100% | Vendor, items, amount | Healthcare |
| Cleaning supplies | Sch C Line 22 | 100% | Vendor, amount | Food & bev, wellness |
| Beverages | Sch C Line 22 | 100% if used in production | Vendor, amount, business use | Food & bev only — cost of goods used to serve customers |
| Product inventory (expensed) | Sch C Line 22 | 100% | Vendor, items, amount | Beauty/wellness retail products if not using inventory method |

---

### Line 23 — Taxes and licenses

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| License & permits | Sch C Line 23 | 100% | Issuing authority, license type, amount, period | Business licenses, contractor licenses, health permits |
| Business registration | Sch C Line 23 | 100% | State, amount, year | Annual state filing fees |
| Payroll taxes (employer) | Sch C Line 23 | 100% | Tax type (FUTA, SUTA, etc.), amount | Employer portion only; employee-withheld taxes are not here |

---

### Line 24a — Travel

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Travel | Sch C Line 24a | 100% (ordinary and necessary business travel) | Date, destination, business purpose, transportation method, amount | Overnight trips away from tax home only. Commuting is not deductible. |
| Airfare | Sch C Line 24a | 100% | Date, origin, destination, business purpose, amount | |
| Hotel | Sch C Line 24a | 100% | Hotel name, dates, business purpose, amount | |
| Conference / trade show | Sch C Line 24a | 100% | Event name, dates, location, business purpose | Registration fees also here or Line 27a (education) |

> **Note:** "Travel" must be for business away from the tax home. Local travel (driving to client meetings) goes on Line 9 (vehicle), not Line 24a.

---

### Line 24b — Deductible meals

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Meals | Sch C Line 24b | **50% only** | Date, restaurant/vendor, business purpose, who attended (if client meal), amount | TCJA eliminated entertainment deduction; meals remain at 50% |
| Client meals | Sch C Line 24b | **50% only** | Same as above, plus client name and business discussed | |
| Client dinner | Sch C Line 24b | **50% only** | Same as above | |

> **Critical flag:** Meals are always 50% deductible. **Penny must never display the full meal amount as a deduction.** The approval card should show: "50% of $140 = $70 deductible." The remaining 50% is a non-deductible personal expense. This is one of the most common errors in DIY bookkeeping. Penny flagging this correctly is a trust-building moment.

> **Exception:** Meals provided to employees at the business premises for the employer's convenience — 50% through 2025, 0% after 2025 (TCJA phase-out). For Alex's use case this exception rarely applies.

---

### Line 25 — Utilities

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Utilities | Sch C Line 25 | Business % only (if home office) or 100% (if separate business location) | Vendor, service type, amount | If home office, only the business % of home utilities is deductible via Form 8829 |
| Internet | Sch C Line 25 | Business % only | Provider, monthly amount, business use % | Mixed personal/business — Alex must estimate business use % |
| Phone | Sch C Line 25 | Business % only | Provider, monthly amount, business use % | Same rule — Penny should ask once: "What percent of your phone use is for business?" |
| Electricity (business location) | Sch C Line 25 | 100% | Provider, amount | Only if separate dedicated business location |

> **Open flag (Q-C4 related):** If Alex uses a home office, all utility deductions must route through Form 8829, not directly to Line 25. Penny must not double-count by putting utilities on Line 25 AND running them through 8829. The entity-onboarding question (D83) must surface this.

---

### Line 26 — Wages (not including owner's compensation)

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Employee wages | Sch C Line 26 | 100% | Employee name(s), gross wages, payroll provider, period | W-2 must be issued. Owner's own wages are not deductible on Sch C — owner's profit is taxed as SE income |
| Payroll (employees) | Sch C Line 26 | 100% | Payroll provider (Gusto, etc.), gross pay, period | |
| Staff | Sch C Line 26 | 100% | Same as above | Healthcare, beauty/wellness, food & bev personas with employees |

---

### Line 27a — Other expenses (Part V)

This is where categories that don't fit the named lines above go. IRS allows a free-form list on Schedule C Part V.

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Software subscriptions | Sch C Line 27a | 100% | Vendor, subscription name, monthly/annual amount, business purpose | Notion, Adobe CC, Figma, GitHub, Zoom, Dropbox, etc. IRS treats SaaS as a business expense, not a capital asset |
| Cloud & hosting | Sch C Line 27a | 100% | Provider, service, amount | AWS, GCP, Vercel, Netlify |
| Domains & SSL | Sch C Line 27a | 100% | Registrar, domain, amount | Annual renewal |
| Continuing education | Sch C Line 27a | 100% | Course/provider, topic, amount, business relevance | Must be to maintain or improve skills in current business, not to qualify for a new career |
| Professional development | Sch C Line 27a | 100% | Same as continuing education | Photography workshops, coaching programs, certifications |
| Research (Westlaw, databases) | Sch C Line 27a | 100% | Vendor, purpose, amount | Professional services |
| Professional memberships | Sch C Line 27a | 100% | Organization, amount, year | Trade associations, professional societies — not social clubs |
| Books & publications | Sch C Line 27a | 100% | Title, vendor, amount, business purpose | |
| Bank fees | Sch C Line 27a | 100% | Bank, fee type, amount | Business checking fees, wire transfer fees |
| Merchant fees | Sch C Line 27a | 100% | Processor, fee, transaction reference | Can also go on Line 10 — pick one and be consistent |

---

### Line 30 — Business use of home (Form 8829)

| Penny Category Label | IRS Line | Deductibility | Required supporting fields | Notes |
|---|---|---|---|---|
| Home office | Sch C Line 30 via Form 8829 | Simplified: $5/sq ft up to 300 sq ft ($1,500 max). Actual: home expenses × business use % | Office square footage, total home square footage (actual method); or just sq footage (simplified) | Regular and exclusive use required. Cannot deduct beyond net business profit. |

> **Open flag (Q-C4):** Home office method choice (simplified vs. actual) is unresolved in `irs-tax-research.md`. Penny's onboarding must capture: (a) does Alex work from home? (b) is there a dedicated space used exclusively for business? (c) square footage. This information enables Form 8829 computation at year-end.

---

## Part III — S-Corp specific (Form 1120-S)

S-Corp personas in the demo: `s-corp.*` — consulting, creative, beauty-wellness, professional-services, tech-software, healthcare.

### Key differences from Schedule C

| S-Corp concept | Treatment | Penny implication |
|---|---|---|
| Owner's salary | **Required by IRS** — must be reasonable compensation. Goes on 1120-S Line 7 (Compensation of officers) + W-2 issued. Payroll taxes withheld. | Penny must record owner payroll as a W-2 expense at the corporate level, not as owner's draw |
| Owner's draw / distribution | **Not deductible** — it's a distribution of after-tax profit. Does not reduce 1120-S taxable income. | Penny must categorize as "Owner's distribution" — a non-deductible equity event, not an expense |
| Ordinary business income | **K-1 Box 1** flows through to owner's personal Schedule E Part II. Subject to income tax but NOT self-employment tax. | This is the key S-Corp advantage — the profit above salary avoids SE tax (15.3%) |
| Health insurance (≥2% shareholder) | **Not deductible on 1120-S Line 18** — must be added to W-2 wages (Box 1, not Box 3/5) and deducted on Schedule 1 Line 17 of the owner's personal return | Common S-Corp tax trap. Penny must route owner's health insurance correctly |
| Retirement contributions | **Line 17 of 1120-S** — employer contributions to retirement plans | |
| Expenses | Most Schedule C categories translate directly to 1120-S (see mapping below) | Category labels are the same; line numbers differ |

### 1120-S expense line mapping

| Penny Category Label | 1120-S Line | Notes |
|---|---|---|
| Compensation of officers (owner salary) | Line 7 | Must be reasonable salary per IRS — S-Corp audit risk if too low |
| Employee wages (non-owner) | Line 8 | W-2 employees other than the owner |
| Repairs and maintenance | Line 9 | Same criteria as Sch C |
| Bad debts | Line 10 | Accrual basis only |
| Rent | Line 11 | Office, equipment — same as Sch C Lines 20a/20b |
| Taxes and licenses | Line 12 | Same as Sch C Line 23 |
| Interest | Line 13 | Business loan interest |
| Depreciation (Form 4562) | Line 14 | Same as Sch C |
| Depletion | Line 15 | Rarely applies to demo personas |
| Advertising | Line 16 | Same as Sch C Line 8 |
| Pension/profit-sharing | Line 17 | Same as Sch C Line 19 |
| Employee benefit programs | Line 18 | **Not** owner's health insurance (see above) |
| Other deductions | Line 19 (detail on Schedule attached) | Software, meals, travel, contractors, etc. — same labels as Sch C |

### S-Corp K-1 items to track

| K-1 Box | What it is | Penny implication |
|---|---|---|
| Box 1 | Ordinary business income (loss) | Primary income item — flows to owner's Schedule E |
| Box 2 | Net rental real estate income | Rarely applies |
| Box 7 | Non-deductible expenses | Meals (non-deductible 50%) reported here |
| Box 16 | Items affecting shareholder basis | Distributions, contributions |
| Box 17 | Other information | Health insurance (Code A), home office (2% shareholder rules) |

---

## Part IV — LLC (multi-member, Form 1065)

For `llc.*` demo personas (trades, retail, food-bev, other):

The LLC files Form 1065 (Partnership). Each member gets a K-1. **Expense categories are identical to Schedule C.** The 1065 uses similar line structure. For Penny's purposes, the category labels can be the same — the routing to the correct form line is handled at export time.

---

## Part V — Categories present in the demo that need IRS flags

These categories appear in `scenarios.json` with labels that require Penny to surface an IRS rule at the approval card stage.

| Category | IRS flag to surface | Penny copy (draft) |
|---|---|---|
| Meals | 50% deductibility rule | "Meals are 50% deductible. I'll track $X — your deduction is $Y." |
| Client meals | Same | Same as above |
| Contractors | 1099-NEC at $600+ | "I'm tracking [Name] payments. I'll remind you in January if you hit $600." |
| Vehicle & fuel | Method election required | "I'll track your miles and actual costs. At year-end I'll tell you which saves more." |
| Phone | Business use % required | "What percent of your phone is for business? I'll ask just this once." |
| Internet (if home) | Business use % required | Same pattern |
| Home office | Form 8829 routing | "I'll track your home office separately — it gets its own tax form." |
| Equipment (>$500) | Section 179 vs. depreciation | "Is this a one-time purchase? I want to make sure you get the right deduction." |
| Owner's distribution | Non-deductible | "This is a distribution from your business — it doesn't reduce your taxes." (S-Corp only) |
| Owner's health insurance | Schedule 1, not Sch C | "Your health insurance as an S-Corp owner has special rules. I'm routing it correctly." |
| Inventory (retail, food) | COGS vs. supplies question | "Are these for resale or for running the business?" |

---

## Part VI — Open questions for CPA review

These items require a licensed CPA's confirmation before `categories.v1.json` is finalized and before any tax-facing output ships.

| ID | Question | Blocks | Priority |
|---|---|---|---|
| OE-1 | Confirm Form 1065 vs. Schedule C for LLC personas in the demo | `llc.*` export path | Medium |
| OE-2 | Trades: confirm COGS vs. supplies (Line 22 vs. Lines 33–42) for materials | trades scenarios, export | High |
| OE-3 | Confirm Section 179 vs. depreciation prompt threshold ($500 suggestion) | equipment categorization | High |
| Q-C3 | Vehicle method (standard mileage vs. actual) — default and switching rules | vehicle categories, AI prompt | High |
| Q-C4 | Home office method (simplified vs. actual) — when each is better | home office, Form 8829 | High |
| Q-T1 | Quarterly estimated tax methodology (safe harbor vs. 90% of current year) | quarterly tax compute (E22) | Critical |
| Q-T2 | 1099-NEC: confirm all edge cases (LLC vs. individual threshold, S-Corp exception) | contractor tracking (E21) | Critical |
| Q-T3 | Year-boundary / prior-year amendment rules | ledger immutability spec | Medium |
| DN2 | TurboTax / H&R Block export path — confirm QBO-as-interchange is the best available option | export (E20), marketing claim D55 | High (CEO sign-off) |

---

## Part VII — Categories to add to the demo (not yet in scenarios.json)

These are categories that Penny will encounter in real use but that are missing from the current demo scenarios. They should be added before the demo is used with beta users.

| Missing category | Who needs it | IRS line | Notes |
|---|---|---|---|
| Self-employed health insurance | All S-Corp personas | Schedule 1 Line 17 (personal return) | Must be flagged as NOT a Sch C expense |
| SEP-IRA / Solo 401(k) | Sole prop / S-Corp consulting, tech, professional-services | Sch C Line 19 / 1120-S Line 17 | High-value deduction that Penny should proactively surface |
| Startup costs | Any first-year persona | Schedule C / Form 4562 amortization | $5K immediate + remainder over 180 months |
| Sales tax collected | Retail, food & bev | Not an expense — a liability (sales tax payable) | Penny must separate gross sales from sales tax collected |
| Estimated tax payments | All personas | Not a business expense | Sch C owners make quarterly payments — these are personal, not business expenses |
| Owner's distribution | All S-Corp personas | Non-deductible equity | Currently in demo only as "Owner's draw" |
| Bad debt | Consulting, professional-services | Sch C Line 27a (accrual only) | Cash-basis sole props cannot deduct bad debt |

---

*This document is a first-pass draft based on IRS Publication 334, 535, 463, and Schedule C instructions. It must be reviewed and signed off by a licensed CPA before any IRS-facing output ships. See `BookKeeping/research/solo-freelancer/irs-tax-research.md` for the research questions this document partially addresses (Q-C1, Q-C2).*
