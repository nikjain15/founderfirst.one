# Build Plan — CPA Stress-Test Fixes

*Tracks every change applied in response to `BookKeeping/reviews/irs-taxonomy-cpa-stress-test-apr-2026.md`.*
*Audit trail for the 24 April 2026 fix pass.*

---

## Scope

The adversarial CPA stress test identified:
- **4 hard IRS errors** in the LLC Line Crosswalk table (Form 1065 side)
- **1 wrong K-1 box number** for S-Corp distributions
- **1 wrong MMLLC SE tax claim** (active members do pay SE tax)
- **2 outdated constants** (2024 mileage rate, $500 de minimis)
- **1 unsupported heuristic** (40% reasonable salary)
- **15 missed compliance gaps** (QBI, OBBBA, Circular 230, SE tax detail, startup costs, 1099-MISC, sales tax, state PTET, retirement, payroll, accountable plan, repairs-vs-improvements, hobby loss, passive activity, constructive receipt)

This document records every fix applied.

---

## Change log

### Files created

| File | Purpose |
|---|---|
| `BookKeeping/engineering/categories.v1.json` | Machine-readable authoritative taxonomy. Source of truth for Intelligence Service, Export Service, Tax Service, and AI Eval 04. |
| `BookKeeping/engineering/build-plan-cpa-fixes-apr-2026.md` | This file — fix audit trail. |
| `BookKeeping/demo/implementation/README.md` | Demo-local mapping doc explaining how `scenarios.json` labels feed the IRS routing. |
| `BookKeeping/demo/implementation/irs-routing.md` | Demo-local IRS routing logic for the P&L view. |

### Files updated

| File | Change |
|---|---|
| `BookKeeping/product/irs-persona-taxonomy.md` | v1.1 → v1.2. LLC crosswalk rewritten (4 Form 1065 line errors fixed). Added S-Corp column. Added MMLLC SE tax section. Added QBI §199A SSTB section (all 20 personas). Added OBBBA §70* changes section. Fixed P04 B&H Photo de minimis treatment. Fixed P06 subcontractor routing (Line 20, not Line 10). Fixed P06 insurance routing (Line 20, not Line 18). Fixed P16 Priya reasonable-salary framing. Fixed S-Corp K-1 distribution references (Box 16D, not Box 19). Updated mileage references to 2025 70¢. |
| `BookKeeping/demo/public/config/scenarios.json` | Split P04 "Van lease + gas" (820) → "Van lease" (680) + "Vehicle fuel" (140). Replaced generic "Insurance" label with "Camera/equipment insurance" on P04 B&H camera insurance. Normalized "Inventory / COGS" → "Inventory (COGS)" everywhere. |
| `BookKeeping/research/solo-freelancer/irs-tax-research.md` | Added 24 April resolution update. Marked Q-C3 RESOLVED. Added OBBBA / QBI / Circular 230 / SE tax / PTET / retirement new open items. |
| `BookKeeping/product/spec-brainstorm-decisions.md` | v2.2 → v2.3. Added D87–D94: tax-year constants configurable, de minimis $2,500, MMLLC dual-path + SE tax, S-Corp reasonable comp, accountable plan required, QBI surfacing, OBBBA conformance, Circular 230 boundary. |

---

## Finding → fix mapping

### Fix 1 — LLC Crosswalk Insurance routing
- **Finding:** Form 1065 Line 18 is Retirement plans, not Insurance. Insurance routes to Line 20 (business insurance) or Line 19 (employee benefits).
- **Old:** `| Insurance | Line 15 | Line 18 |`
- **New:** Explicit three-column crosswalk (Sch C / 1120-S / 1065). Line 20 for MMLLC business insurance, Line 19 for MMLLC employee benefits.
- **File:** `irs-persona-taxonomy.md` §"LLC IRS Line Crosswalk" + P06 card
- **IRS authority:** Form 1065 Instructions 2024 Line 18, Line 19, Line 20; IRC §162, §404
- **Acceptance:** Penny's Form 1065 export for an LLC persona places commercial insurance on Line 20, not Line 18.

### Fix 2 — LLC Crosswalk Repairs routing
- **Finding:** Form 1065 Line 11 is dedicated to Repairs and maintenance. Does not route to Line 20 catch-all.
- **Old:** `| Repairs | Line 21 | Line 20 |`
- **New:** `| Repairs and maintenance | Line 21 | Line 9 (1120-S) | Line 11 (1065) |`
- **File:** `irs-persona-taxonomy.md`; `categories.v1.json` id="repairs-maintenance"
- **Authority:** Form 1065 Instructions 2024 Line 11
- **Acceptance:** Penny's Form 1065 export routes repairs to Line 11.

### Fix 3 — LLC Crosswalk Commissions & fees routing
- **Finding:** Form 1065 Line 10 is "Guaranteed payments to partners" — not external commissions. External commissions go to Line 20.
- **Old:** `| Commissions & fees | Line 10 | Line 10 |`
- **New:** External commissions → Line 20 on 1065; Line 10 on 1065 reserved for guaranteed-payments-to-partners (new category id).
- **File:** `irs-persona-taxonomy.md`; `categories.v1.json` id="platform-fees" and new id="guaranteed-payments-partners"
- **Authority:** IRC §707(c); Form 1065 Instructions 2024 Line 10
- **Acceptance:** Shopify/Etsy/Stripe platform fees route to Line 20 on Form 1065; Line 10 stays empty unless actual partner payments exist.

### Fix 4 — LLC Crosswalk Contractor/labor routing
- **Finding:** Form 1065 Line 9 is W-2 employee wages, not guaranteed payments. 1099 contractors go to Line 20.
- **Old:** `| Contractor / labor | Line 11 | Line 9 (guaranteed payments) or Line 20 |`
- **New:** 1099 contractors → Line 20 (1065). W-2 employees → Line 9 (1065). Partner payments → Line 10 (separate category).
- **File:** `irs-persona-taxonomy.md`; `categories.v1.json` id="contractors", id="payroll-employees", id="guaranteed-payments-partners"
- **Authority:** Form 1065 Instructions 2024 Lines 9, 10, 20
- **Acceptance:** P06 Marco's Rivera Electric subcontractor routes to Line 20 on Form 1065, not Line 10.

### Fix 5 — S-Corp K-1 distribution box
- **Finding:** S-Corp distributions are K-1 Box 16 Code D, not Box 19. Box 19 does not exist on Form 1120-S K-1 (form ends at Box 17).
- **Old:** Per-persona cards and summary text implied Box 19 for S-Corp distributions.
- **New:** Every S-Corp owner-distribution reference now reads "K-1 Box 16 Code D". Partnership K-1 distinct reference "Line 19 Code A/B/C".
- **File:** `irs-persona-taxonomy.md` (4 table rows fixed); `categories.v1.json` id="owner-distribution-scorp" and id="owner-distribution-mmllc"
- **Authority:** Form 1120-S Schedule K-1 Instructions 2024; Form 1065 Schedule K-1 Instructions 2024
- **Acceptance:** When Penny describes an S-Corp distribution, the documentation references Box 16D, not Box 19.

### Fix 6 — MMLLC SE tax treatment
- **Finding:** Active MMLLC members pay SE tax on K-1 Box 1 (via Box 14). This differs materially from S-Corp treatment, where K-1 Box 1 is not SE-taxed.
- **Old:** Taxonomy doc conflated LLC and S-Corp pass-through treatment, implying both avoided SE tax.
- **New:** New "Self-Employment tax treatment" section in taxonomy doc with explicit entity comparison table. D89 locks the MMLLC dual-path disclosure.
- **File:** `irs-persona-taxonomy.md` §"Self-Employment tax treatment"; `spec-brainstorm-decisions.md` D89
- **Authority:** IRC §1402(a), §1402(a)(13); *Renkemeyer, Campion & Hubbard v. Commissioner*, 136 T.C. 137 (2011); *Castigliola v. Commissioner*, T.C. Memo 2017-62; Prop. Treas. Reg. §1.1402(a)-2 (unfinalized)
- **Acceptance:** When a user elects MMLLC at onboarding, Penny surfaces that active members pay SE tax on their share of ordinary income (distinct from S-Corp).

### Fix 7 — 2025 mileage rate
- **Finding:** 2025 rate is 70¢/mi (IRS Notice 2025-5), not 67¢ (that's 2024).
- **Old:** Taxonomy doc and per-persona cards had "67¢/mi 2024".
- **New:** All references updated to 2025 70¢; tax year constant pulled from `categories.v1.json` taxYearConstants.2025.standardMileageRate. D87 locks configurability.
- **Files:** `irs-persona-taxonomy.md`; `categories.v1.json` taxYearConstants; `irs-tax-research.md` Q-C3; `spec-brainstorm-decisions.md` D87
- **Authority:** IRS Notice 2025-5 (19 Dec 2024); Rev. Proc. 2019-46
- **Acceptance:** No file in the repo hard-codes 67¢. All mileage display reads from config.

### Fix 8 — De minimis safe harbor threshold
- **Finding:** Threshold is $2,500/item for non-AFS taxpayers (not $500).
- **Old:** CPA review prompt asked whether it should be $500 or $2,500.
- **New:** D88 locks $2,500 (Treas. Reg. §1.263(a)-1(f)(1)(ii)). P04 B&H Photo $1,840 now correctly routes to Line 19 under de minimis, no depreciation decision.
- **Files:** `irs-persona-taxonomy.md` P04 card; `categories.v1.json` taxYearConstants.2025.deMinimisSafeHarbor_nonAFS = 2500
- **Authority:** Treas. Reg. §1.263(a)-1(f)(1)(ii); Rev. Proc. 2015-20
- **Acceptance:** Equipment purchase under $2,500 triggers no depreciation prompt; purchases over trigger §179/bonus/MACRS decision.

### Fix 9 — Reasonable compensation reframing
- **Finding:** The "40% minimum" rule is a CPA heuristic, not IRS authority.
- **Old:** P16 Priya card: "IRS reasonable salary for solo SaaS = minimum 40% suggested."
- **New:** P16 card now references IRS Fact Sheet 2008-25 nine factors, *Watson v. U.S.* 668 F.3d 1008, recommends compensation study. D90 retires the 40% heuristic.
- **File:** `irs-persona-taxonomy.md` P16; `spec-brainstorm-decisions.md` D90
- **Authority:** IRS Fact Sheet 2008-25; IRC §1366; *Watson v. U.S.*; *Glass Blocks Unlimited v. Commissioner*, T.C. Memo 2013-180
- **Acceptance:** Penny's reasonable-comp surfacing never displays a % threshold as IRS law; it references the nine factors and recommends a compensation study.

### Fix 10 — scenarios.json label splits and normalization
- **Finding:** P04 "Van lease + gas" combined two IRS lines (Line 20a lease + Line 9 fuel). Generic "Insurance" label lost specificity. "Inventory / COGS" variant inconsistent with canonical "Inventory (COGS)".
- **Old:** Single combined van-lease+gas entry; generic "Insurance"; "Inventory / COGS".
- **New:** Split to "Van lease" ($680) + "Vehicle fuel" ($140). "Insurance" → "Camera/equipment insurance". All "Inventory / COGS" → "Inventory (COGS)".
- **File:** `BookKeeping/demo/public/config/scenarios.json`
- **Acceptance:** `grep "Van lease + gas" scenarios.json` returns 0. `grep "Inventory / COGS" scenarios.json` returns 0. JSON validates.

---

## Gaps flagged but not fully addressed in this pass

The CPA stress test surfaced 15 gaps. Eight are locked as decisions (D87–D94). The remaining seven are tracked as open research items in `irs-tax-research.md`:

1. **Q-L1 — Circular 230 / preparer penalty** (GC review blocker)
2. **Q-OBBBA — One Big Beautiful Bill Act verification** (confirm against final bill text)
3. **Q-QBI — SSTB borderline cases** (P15 software dev, P19 VA) — CPA validation
4. **Q-SE — Self-employment tax calc detail** (SS wage base, Additional Medicare Tax threshold, MMLLC vs. S-Corp) — documented but needs compute implementation
5. **Q-PTET — State pass-through entity tax detection** per state
6. **Q-RetLim — Retirement plan contribution limits per persona per year** (SEP / Solo 401(k) / SIMPLE / IRA) — documented but needs per-persona compute
7. **Q-1099-MISC — 1099-MISC routing** alongside 1099-NEC (rent to individuals, attorneys, medical) — needs Track1099 integration update

## Remaining missed items (from Task 5 sweep) not yet formalized

- §195 startup costs (first-year businesses)
- §199A aggregation (multi-entity owners)
- §471(c) small-taxpayer inventory method election tracking
- §274(o) 2026 employer-meals sunset to 0%
- §121 + home office basis recapture UX
- §183 hobby loss / profit-motive safe harbor
- §469 passive activity loss (rental real estate)
- §280F luxury auto inclusion amount
- §263(a)-3 BAR test for repairs-vs-improvements at transaction level
- Worker misclassification §3121(d) / §3509 detection
- Form 941 / 940 deposit schedule compliance
- Constructive receipt timing (§451) for year-end

Each is a candidate for a dedicated product spec in `BookKeeping/product/` once CPA scope is confirmed.

---

## Engineering consumption guide

### Who consumes `categories.v1.json`?

| Service | Usage |
|---|---|
| Intelligence Service | Categorization model trained to produce the `id` field of a category. |
| Export Service | Schedule C / 1120-S / 1065 PDF export reads `lineMap` per entity type. |
| Tax Service | Quarterly estimate compute reads `taxYearConstants`. QBI engine reads SSTB classifications. |
| AI Eval 04 (Financial Computation) | Uses `categories` as the ground truth for expected IRS line per category. |
| AI Eval 01 (Transaction Intelligence) | Uses `requiredFields` / `recommendedFields` to test supporting-field capture. |

### Required validation before production

- [ ] CPA sign-off on every `lineMap` cell (20 personas × ~20 categories)
- [ ] CPA sign-off on SSTB classification per persona
- [ ] CPA validation of §471(c) inventory method default
- [ ] CPA validation of de minimis election default
- [ ] GC sign-off on Circular 230 boundary (D94)
- [ ] Verification of OBBBA final bill text (Q-OBBBA)
- [ ] SECURE 2.0 provisions check (catch-up age 60-63, automatic enrollment 2025+)

### Versioning

`categories.v1.json` is versioned via its top-level `version` field. Rules:
- **PATCH** (v1.0.1): typo, cite correction, field rename within same schema.
- **MINOR** (v1.1.0): new category, new tax-year constants, new SSTB classification.
- **MAJOR** (v2.0.0): schema change (new required field, new form supported).

Engineering service contracts must pin to a MAJOR version; consumers must handle MINOR additions without breaking.

---

*Authored 24 April 2026 by Nik + Claude (acting as CPA reviewer). Supersedes v1.1 taxonomy baseline. Ship CPA-review gate: see `irs-persona-taxonomy.md` v1.2 Part 3 checklist.*
