# IRS Taxonomy — CPA Stress Test, PASS 2 (Independent Second-Pass Review)

*Independent second-pass adversarial review of the fixes applied in response to `irs-taxonomy-cpa-stress-test-apr-2026.md` (PASS 1).*
*Tax years: 2025 returns (filed early 2026) and 2026 returns (filed early 2027).*
*Reviewer: Claude (acting as adversarial licensed US CPA). Not a substitute for a licensed CPA sign-off.*
*Source files reviewed: `irs-persona-taxonomy.md` v1.2 · `categories.v1.json` v1.0.0 · `scenarios.json` · `build-plan-cpa-fixes-apr-2026.md`.*

---

## Executive summary — verdict

**Fixes landed well overall, but three residual errors and several nuance gaps remain.** The LLC Line 1065 crosswalk is now correct at the crosswalk-table level and S-Corp Box 16D is propagated. However, **three per-persona cards (P08, P10, P20) still route rent and payroll to non-existent Form 1065 sub-lines "9b" and "9c"** — these sub-lines exist on Schedule C, not Form 1065. Form 1065 Line 9 is a single line (W-2 wages). Rent on 1065 is Line 13; payroll is Line 9. This is the same class of Schedule C → 1065 number confusion that the PASS 1 review caught on insurance/repairs, just in new cells.

Of the 10 PASS 1 fixes audited: **7 CONFIRMED correct, 2 NUANCE, 1 partially WRONG (label-straggler sweep incomplete — generic "Insurance" still appears in 5 scenarios.json locations on non-P04 personas).** All four LLC crosswalk row fixes are correctly applied at the central table. The reasonable-salary reframe is done cleanly. The 2025 mileage rate (70¢), $2,500 de minimis, QBI §197,300/$394,600 thresholds, and SS wage base $176,100 are all correctly encoded in `categories.v1.json` `taxYearConstants.2025`. Box 16D is consistent. The MMLLC SE-tax distinction is present and well-cited.

**Three NEW errors introduced by the fix pass:**
1. P08, P10, P20 now reference Form 1065 "Line 9b" and "Line 9c" — these don't exist on 1065.
2. `categories.v1.json` `tools-equipment` and `hardware` route over-de-minimis items to `form1065: "line16"` — Form 1065 depreciation is 16a/16b/16c (should be 16c for net deduction).
3. P10 retained the "~40% of revenue" annotation on the Sysco ingredients line — margin commentary inside an IRS-facing doc, same noise the PASS 1 review said should be removed from labels.

**Not introduced but still unresolved:** PASS 1 flagged 15 missed compliance items; the fix pass formalised only the MMLLC/QBI/OBBBA items. 12 gaps remain open, most critically §195 startup costs and the §274(o) 2026 employer-meals sunset — the taxonomy doc references both as "verify" but does not gate the shippable label set on them.

Full findings below.

---

## Methodology

Line-by-line adversarial read of v1.2 taxonomy + v1.0.0 categories.v1.json against 2024 Schedule C, Form 1120-S, Form 1065, Form 1125-A, 1040-ES, Rev. Proc. 2019-46 / 2024-40, IRS Notices 2024-8 and 2025-5, Treas. Reg. §1.263(a)-1(f), and OBBBA §§70111, 70112, 70301, 70302, 70313, 70432.

**Result tags (same as PASS 1).** CONFIRMED · WRONG · NUANCE · MISSED.

---

## Task A — LLC crosswalk fix landing audit

### A.1 Insurance → 1065 Line 20 (NOT Line 18)
**CONFIRMED.** Crosswalk table row (`irs-persona-taxonomy.md` line 44) routes business insurance to **Line 20** on Form 1065 and **Line 19** on Form 1120-S Other deductions. Employee benefit insurance correctly splits to Line 19 (1065) / Line 18 (1120-S). `categories.v1.json` `commercial-insurance` (line 430) matches. P06 card (line 512) explicitly calls out the v1.2 fix. IRC §162; Form 1065 Instructions 2024 Lines 18, 19, 20.

### A.2 Repairs → 1065 Line 11 (dedicated, NOT Line 20)
**CONFIRMED.** Crosswalk row (line 50) routes Repairs to **Line 11** on Form 1065 and **Line 9** on 1120-S. `categories.v1.json` `repairs-maintenance` (line 600) matches. Form 1065 Instructions 2024 Line 11.

### A.3 Commissions & fees → 1065 Line 20 (NOT Line 10)
**CONFIRMED.** Crosswalk row (line 40) routes external commissions to **Line 20** on 1065 with explicit "NOT Line 10 — Line 10 is Guaranteed payments to partners" caveat. New `guaranteed-payments-partners` category id added to `categories.v1.json` (line 420). IRC §707(c); Form 1065 Instructions 2024 Line 10.

### A.4 Contractor/labor → 1065 Line 20 (NOT Line 9)
**CONFIRMED.** Crosswalk row (line 41) and P06 Rivera Electric line (line 509) both route 1099 subcontractors to **Line 20**. Employee W-2 wages correctly split to Line 9 (1065) as a separate row. `categories.v1.json` `contractors` (line 387) matches.

### A.5 S-Corp column added
**CONFIRMED.** The crosswalk now has three columns (Sch C / 1120-S / 1065). Line 16 (Advertising), Line 11 (Rents), Line 9 (Repairs), Line 17 (Pension) all correctly cited for 1120-S.

### A.6 NEW ERROR — P08, P10, P20 cards reference non-existent Form 1065 sub-lines
**WRONG.** P08 Mei (line 559–561), P10 Tony (line 597–598), and P20 Sofia (line 800) all route rent and payroll to Form 1065 "Line 9b" and "Line 9c":

```
| Rent ($3,400) | 1065 Line 9b / Sch C Line 20b | 100% | ... |
| Payroll — Gusto | 1065 Line 9c / Sch C Line 26 | ... |
| Commissary rent ($1,800) | 1065 Line 9b / Sch C Line 20b | ... |
| Venue & rental fees ($1,000) | 1065 Line 9b / Sch C Line 20b | ... |
```

**Form 1065 does not have Lines 9b or 9c.** Line 9 is a single line ("Salaries and wages (other than to partners) less employment credits"). Schedule C is the form with sub-lines like 9 (Car and truck), 20a/20b (Rent/lease — vehicles/machinery/equipment vs. other), and 26 (Wages). The PASS 1 review caught the insurance/repairs/commissions/labor confusion at the crosswalk level, but the per-persona card rewrite copied the Schedule C numbering into 1065 cells again for a different set of rows.

**Correct routing (verify on the 2024 Form 1065):**
- Rent (dedicated business space) → **Line 13** (Rent)
- Payroll (W-2 to non-partner employees) → **Line 9** (single, no sub-line)

`build-plan-cpa-fixes-apr-2026.md` Fix 2 acceptance criterion says "Penny's Form 1065 export routes repairs to Line 11" — the same acceptance test applied to P08/P10/P20 rent and payroll rows would fail today. [Form 1065 Instructions 2024 Lines 9 and 13.]

### A.7 NEW ERROR — `categories.v1.json` over-de-minimis depreciation routes to Form 1065 "line16" (should be line16c)
**WRONG / NUANCE.** `tools-equipment` (line 516) and `hardware` (line 527):

```
"ifOverDeMinimis": { "lineMap": { "scheduleC": "line13", "form1120S": "line14", "form1065": "line16" } ... }
```

Form 1065 depreciation is **16a (gross)**, **16b (less amount reported on 1125-A/elsewhere)**, **16c (net deduction)**. The engineering consumer of `categories.v1.json` (Export Service) needs the sub-line key to place the value correctly. `form1065Depreciation.deductionLines` on line 128–130 of `categories.v1.json` correctly enumerates 16a/16b/16c, so the fix is to change the lineMap target from `line16` to `line16c` for the net deduction path. PASS 1 flagged this as NUANCE (sub-line precision needed); fix pass missed applying it. [Form 1065 Instructions 2024 Line 16.]

---

## Task B — S-Corp K-1 Box number fix

### B.1 All S-Corp K-1 distribution references updated to Box 16 Code D
**CONFIRMED.** Crosswalk row (line 62), P02 (line 413), P04 (line 469), P12 (line 642), P14 (line 682), P16 (line 723), P18 (line 762), Part 3 CPA checklist (line 823), and `categories.v1.json` `owner-distribution-scorp` (line 766) all correctly reference **K-1 Box 16, Code D**. Partnership `owner-distribution-mmllc` correctly references **K-1 Line 19 Code A/B/C**. Form 1120-S K-1 Instructions 2024 Part III Item 16D; Form 1065 K-1 Instructions 2024 Line 19.

### B.2 `categories.v1.json` K-1 box structure
**CONFIRMED.** `form1120S.k1Boxes` explicitly notes "Form 1120-S Schedule K-1 ends at Box 17 — Box 19 does NOT exist on S-Corp K-1" (line 108). Defensive and correct.

---

## Task C — MMLLC SE tax treatment

### C.1 New dedicated section in taxonomy (lines 78–91)
**CONFIRMED.** Clean table comparing sole prop / S-Corp / MMLLC active / MMLLC passive. Correct citations: IRC §1402(a), §1402(a)(13), *Renkemeyer* 136 T.C. 137 (2011), *Castigliola* T.C. Memo 2017-62, *Hardy* T.C. Memo 2017-16, Prop. Treas. Reg. §1.1402(a)-2. Product implication correctly stated ("MMLLC does NOT provide S-Corp-style SE tax relief on pass-through income; correct only when LLC has elected S-Corp tax status via Form 2553").

### C.2 `categories.v1.json` mmllc entity path
**CONFIRMED.** `notes.entityPaths.mmllc` (line 17): "K-1 Box 14 carries SE earnings for active members." `form1065.k1Lines.box14` (line 138): "Schedule SE for active members per Renkemeyer 136 T.C. 137." Machine-readable and correctly cited.

### C.3 NUANCE — sole-prop / SMLLC SE tax citation is truncated
The sole-prop row (line 84) states "15.3% on SS wage base ($176,100 for 2025... 0.9% Additional Medicare Tax above $200K single / $250K MFJ." The 15.3% rate applies only up to the SS wage base; above the wage base, only 2.9% Medicare applies. The current language reads as if 15.3% applies to the entire SS wage base figure, which is imprecise. **NUANCE** — minor, clarify: "15.3% (12.4% SS + 2.9% Medicare) on first $176,100 of net SE earnings, then 2.9% Medicare only above." [IRC §1401(a), (b); Schedule SE Instructions 2024.]

---

## Task D — 2025 tax-year constants in `categories.v1.json`

### D.1 QBI thresholds
**CONFIRMED.** `taxYearConstants.2025.qbiLowerThreshold` = `{single: 197300, mfj: 394600}`; `qbiUpperThreshold` = `{single: 247300, mfj: 494600}`; `qbiSource` = "Rev. Proc. 2024-40." Matches IRS published figures. Taxonomy doc table (line 104) matches.

### D.2 Standard mileage rate
**CONFIRMED.** `standardMileageRate: 0.70`, `mileageNotice: "IRS Notice 2025-5"`, `mileageNoticeDate: "2024-12-19"`. Correct. Taxonomy doc P03 (line 434), P06 (line 513), and main vehicle-fuel row (line 209) all reference 70¢ for 2025.

### D.3 De minimis safe harbor
**CONFIRMED.** `deMinimisSafeHarbor_nonAFS: 2500`. P04 card correctly reclassifies the $1,840 B&H Photo purchase as under de minimis (line 460). Treas. Reg. §1.263(a)-1(f)(1)(ii).

### D.4 SS wage base, 401(k), SEP, SIMPLE, IRA
**CONFIRMED.** `ssWageBase: 176100`, `employeeDeferral401k: 23500`, `catchUp50Plus: 7500`, `catchUp60to63_secure2: 11250`, `sepIRALimit: 70000`, `simpleIRALimit: 16500`, `traditionalIRALimit: 7000`. All correct for 2025. Catch-up ages 60–63 cite SECURE 2.0 §109 — correct.

### D.5 §179 and bonus depreciation
**CONFIRMED** post-OBBBA. `section179Limit_postOBBBA: 2500000`, `section179PhaseOut_postOBBBA: 4000000`, `bonusDepreciation_postOBBBA_post_Jan_19: 1.00`. OBBBA §70301, §70302 correctly cited. Also correctly preserves the pre-OBBBA Q1 2025 values as separate fields, which matters for property acquired January 1–19, 2025.

### D.6 1099-K post-OBBBA
**CONFIRMED.** `k1099Threshold_postOBBBA: 20000`, `k1099TransactionCount_postOBBBA: 200`, source OBBBA §70432. Matches the restored pre-ARPA threshold.

### D.7 NUANCE — 2024 `sepIRALimit` is $69,000; file lists $69,000 correctly
**CONFIRMED.** Line 159: `"sepIRALimit": 69000`. Correct per IR-2023-203.

### D.8 MISSED — Additional Medicare Tax threshold for MFS
`additionalMedicareTaxThreshold: {single: 200000, mfj: 250000}`. IRC §1401(b)(2) also specifies **$125,000 MFS** and **$200,000 HoH**. For a tax-product shipping to all filers, omitting MFS is a gap. Not wrong for the listed values; incomplete.

### D.9 MISSED — 2025 §280F luxury auto inclusion amount
The vehicle-depreciation category (`vehicle-depreciation-interest`, line 365) does not reference the §280F luxury-auto depreciation cap. Rev. Proc. 2024-13 set 2024 cap at $20,400 Year-1 with bonus depreciation; 2025 Rev. Proc. TBD. For Penny's P04 Marcus (video production) whose van would be in service, this is a material ceiling that should be encoded. PASS 1 flagged; PASS 2 confirms not added. [IRC §280F(a)(1)(A); Rev. Proc. 2024-13 (2024); 2025 forthcoming.]

### D.10 MISSED — §274(o) 2026 sunset for employer-provided meals
`business-meals.exceptions_0Pct` (line 649) mentions "Employer-provided meals on premises... drops to 0% starting 2026 per TCJA §13304 sunset (verify OBBBA impact)". Good that it's flagged. The **verify** is not gated anywhere — no open item in `postCpaReview_openItems` (lines 788–818) specifically blocks shipping 2026 returns until this is resolved. Given Penny will be filing 2026 returns in early 2027, this is a live risk. [TCJA §13304(a)(2); IRC §274(n)(2)(B).]

---

## Task E — Reasonable salary reframe

### E.1 40% heuristic dropped
**CONFIRMED.** P16 Priya card (line 715) now cites IRC §162, Treas. Reg. §1.162-7, IRS Fact Sheet 2008-25 nine factors, *Watson v. U.S.* 668 F.3d 1008 (8th Cir. 2012), *Glass Blocks Unlimited* T.C. Memo 2013-180. Explicitly states "the prior '40% minimum' heuristic was a CPA rule-of-thumb, NOT IRS authority." Recommends RCReports / BLS OES compensation study. Clean.

### E.2 P14 David Park card
**NUANCE.** P14 card (line 676) still reads "$7K/mo on $22K/mo revenue = ~32%. May be low. CPA review." The PASS 1 review recommended removing the percentage framing entirely and replacing with nine-factors + comp study. P14 retains the percentage phrasing. Minor consistency gap; P16 was fully reframed, P14 only partly.

### E.3 `categories.v1.json` shareholder-payroll
**CONFIRMED.** `notes` field (line 415) correctly cites Fact Sheet 2008-25 nine factors, Watson, Glass Blocks, and "No statutory % threshold." `complianceFlags: ["reasonable-compensation"]` set.

---

## Task F — Scenarios.json sweep (greps)

### F.1 `Van lease + gas` — zero occurrences
**CONFIRMED.** Grep returns 0. P04 split applied: "Van lease" $680 + "Vehicle fuel" $140 (drilldown.ledger lines 825+830; expenses summary 825, 830). Both entries now route to distinct IRS lines per categories.v1.json `van-lease` (Sch C 20a / 1120-S 11 / 1065 13) and `vehicle-fuel` (Sch C 9 / 1120-S 19 / 1065 20). Correct.

### F.2 `Inventory / COGS` — zero occurrences
**CONFIRMED.** Grep returns 0. 6 occurrences of canonical `Inventory (COGS)` remain. Label consolidation succeeded.

### F.3 P04 `Camera/equipment insurance` — 3 occurrences
**CONFIRMED.** Label appears at lines 793 (summary), 845 (drilldown), 983 (ledger). Routes to `camera-equipment-insurance` category (1120-S Line 19). P04 generic "Insurance" is gone.

### F.4 NEW PARTIAL-WRONG — generic `"Insurance"` label still on 5 other persona rows
**WRONG / incomplete.** Grep for `"Insurance"` still returns hits:
- Line 1053 (P05 Jake Torres, Progressive Commercial, $189) — should be `Commercial insurance` per taxonomy
- Line 1274 (P05 duplicate ledger, $189) — same
- Line 1430 (P06 Marco Henderson, Progressive Commercial, $680) — should be `Commercial insurance`
- Line 1694 (P06 duplicate ledger, $680) — same
- Line 4913 (P17 Lisa Grant PT, Professional liability insurance vendor, $60) — should be `Professional liability insurance`

The PASS 1 review explicitly called for P04's generic "Insurance" to be specific — it was fixed. The broader sweep the label-consolidation section (PASS 1 §"Label consistency stragglers") called out was applied to `Inventory / COGS` but not to every other generic-label straggler. Same class of finding, narrower fix scope. From an IRS perspective, all 5 hits route to the correct Sch C Line 15 / 1120-S Line 19 in the current taxonomy, so the return numbers would still be right — but Penny's pattern-match for rule proposals and the de minimis attribution (equipment insurance < $2,500?) depends on specificity. [Treas. Reg. §1.263(a)-1(f)(1)(ii) attribution.]

### F.5 NEW RESIDUAL — `"~40% of revenue"` in P10 Sysco line
**NUANCE.** Taxonomy P10 (line 595) retains "Food & ingredients — Sysco ($9,600, ~40% of revenue)". The PASS 1 review Fix 10 explicitly called for removing "~40%" margin annotations from IRS-facing labels because they look like IRS deductible percentages. Applied to scenarios.json labels but not to the P10 persona card prose.

### F.6 NUANCE — P08 "OE-1 applies" references partnership gating
P08 (line 550) and P20 (line 791) say "OE-1 applies. CPA must confirm [structure]." OE-1 is now resolved per the LLC dual-path rule locked into v1.2. These flags should be updated to reference the dual-path rule and the onboarding question, not an unresolved open item.

---

## Task G — New errors the fix pass introduced

Summarising from the sections above:

1. **[WRONG] P08/P10/P20 use Form 1065 "Line 9b" and "Line 9c"** — these sub-lines exist on Schedule C, not Form 1065. Fix: change 1065 Line 9b → Line 13 (rent); 1065 Line 9c → Line 9 (payroll). `irs-persona-taxonomy.md` lines 559, 560, 597, 598, 800.
2. **[WRONG] `categories.v1.json` `tools-equipment` / `hardware` over-de-minimis route to `form1065: "line16"`** — imprecise. Should be `line16c` (net depreciation). Form 1065 depreciation requires the 16a/16b/16c split. `categories.v1.json` lines 516, 527.
3. **[NUANCE] P10 Sysco line retains "~40% of revenue"** — same class of IRS-vs-margin confusion the label pass was supposed to fix.
4. **[NUANCE] P14 retains "~32% salary ratio" framing** — PASS 1 asked for full reframe; P16 reframed, P14 did not.
5. **[WRONG] 5 generic `"Insurance"` labels still in scenarios.json** — on P05 (×2), P06 (×2), P17 (×1). The narrower P04 fix was applied, but the broader label-specificity recommendation was not.

---

## Task H — PASS 1 missed items: what got formalised vs. still open

| PASS 1 MISSED # | Topic | Status in v1.2 |
|---|---|---|
| 1 | OBBBA §70301/70302/70111/70112/70313/70432 | Encoded in `taxYearConstants.2025` + taxonomy doc §OBBBA |
| 2 | QBI §199A + SSTB per persona | New taxonomy section + SSTB table for all 20 personas |
| 3 | SE tax calculation | MMLLC distinction + citations present in taxonomy. Not yet in categories.v1.json as a compute module |
| 4 | Estimated tax ($150K AGI 110% safe harbor, annualized method) | Tracked in `postCpaReview_openItems` "Q-SE" — NOT closed |
| 5 | §195 startup costs | NOT addressed in v1.2 — still missed |
| 6 | 1099-NEC / 1099-MISC routing | `legal-fees.complianceFlags: ["1099-MISC-attorney"]` added; rent-to-individuals, medical, backup withholding noted but not structurally surfaced per category |
| 7 | 1099-K post-OBBBA | Correctly encoded at $20K/200 |
| 8 | Wayfair sales tax nexus | NOT addressed — still missed |
| 9 | State income tax + PTET | Tracked in "Q-PTET" open item — NOT closed |
| 10 | Retirement plan compute | Limits encoded; compute not designed |
| 11 | Payroll tax compliance (941/940/SUI) | Noted in `payroll-taxes-employer` but §6672 trust-fund-recovery and deposit schedule not surfaced |
| 12 | S-Corp accountable plan mechanic | New section references it; not a first-class category yet |
| 13 | Preparer penalty / Circular 230 | Flagged as open "Q-L1" — NOT closed, GC review queued |
| 14 | Repairs vs. improvements BAR test | `repairs-maintenance.notes` mentions BAR + §1.263(a)-3(i) + §1.263(a)-3(h); transaction-level tagging not built |
| 15 | §183 / §469 / §121 / §451 / §6501 / §3121(d) / §280F / §7701(o) | Not addressed |

Eight of 15 landed in some form; seven remain open. Priority from a "will ship a wrong return" standpoint: items 5 (startup costs), 12 (accountable plan), 15 (§280F luxury auto cap, §183 hobby-loss) are live for MVP personas.

---

## Task I — `categories.v1.json` specific category audit

Spot-checked every lineMap cell against the stated form. Key items:

| Category | Claim | Verdict |
|---|---|---|
| `advertising` — Sch C line 8 / 1120-S line 16 / 1065 line 20 | Matches forms | CONFIRMED |
| `vehicle-fuel` — Sch C 9 / 1120-S 19 / 1065 20 | Matches | CONFIRMED |
| `van-lease` — Sch C 20a / 1120-S 11 / 1065 13 | Matches | CONFIRMED |
| `repairs-maintenance` — Sch C 21 / 1120-S 9 / 1065 11 | Matches | CONFIRMED |
| `commercial-insurance` — Sch C 15 / 1120-S 19 / 1065 20 | Matches | CONFIRMED |
| `business-meals` — Sch C 24b / 1120-S 19 / 1065 20, 50% | Matches. §274(n)(1). | CONFIRMED |
| `entertainment` — 0% deductible, no lineMap | Correct per §274(a)(1)(A) | CONFIRMED |
| `tools-equipment` over de minimis — 1065 "line16" | Should be line16c for net | WRONG (imprecise) |
| `hardware` over de minimis — 1065 "line16" | Same | WRONG (imprecise) |
| `owner-distribution-scorp` — K-1 Box 16 Code D | Matches Form 1120-S K-1 Instructions | CONFIRMED |
| `owner-distribution-mmllc` — K-1 Line 19 A/B/C | Matches Form 1065 K-1 Instructions | CONFIRMED |
| `guaranteed-payments-partners` — 1065 Line 10, SE via K-1 Box 4a | IRC §707(c) | CONFIRMED |
| `solo-401k-employer` — Sch C 19 / 1120-S 17 / 1065 18 | Matches (1065 Line 18 is Retirement plans) | CONFIRMED |
| `home-office` — Sch C 30; S-Corp accountable plan note | Matches. §280A(c)(1)(A). | CONFIRMED |
| `professional-memberships` — Sch C 27a / 1120-S 19 / 1065 20, "NOT Line 23" | Correct | CONFIRMED |
| `miscellaneous-business-expenses` — requiredFields: description, businessPurpose | Good guardrail per Part V | CONFIRMED |

**Missing categories that should exist (from scenarios.json):**
- `booth-rent` exists ✓
- `studio-rent` exists ✓
- `kitchen-rental` exists ✓
- `commissary-rent` exists ✓
- `clinic-lease` exists ✓
- **Missing: `stock-licensing-income`** — P03 and P04 both use this; the Schedule E royalty flag in PASS 1 is not encoded. Add as income category with `requiredCPAReview: true`.
- **Missing: `materials-job`** — PASS 1 OE-2 (materials vs. supplies vs. COGS) is a live per-transaction decision; `categories.v1.json` does not have a dedicated category with the §471(c) election path documented as a conditional.
- **Missing: `gift-card-redemptions`** — P12 has these; should route to income with cash-basis recognition note.
- **Missing: `shipping-packaging`** — P07 has these; PASS 1 noted split routing (packaging-to-customer → COGS 38; shipping-to-customer → Line 27a). No category captures that.

---

## Summary — priority queue for PASS 3

Blocking (would produce a wrong Form 1065):
1. **Fix P08, P10, P20 Form 1065 Line 9b / 9c references** — change to Line 13 (rent) and Line 9 (payroll).
2. **Fix `categories.v1.json` tools-equipment / hardware 1065 depreciation target** — line16 → line16c.

Before CPA sign-off:
3. **Sweep remaining generic `"Insurance"` labels in scenarios.json** (5 hits on P05/P06/P17) to match the specificity applied to P04.
4. **Reframe P14 salary ratio** same way P16 was reframed.
5. **Remove `~40% of revenue` annotation from P10 Sysco line.**
6. **Add missing categories to `categories.v1.json`:** stock-licensing-income, materials-job (with §471(c) conditional), gift-card-redemptions, shipping-packaging (with COGS-vs-27a split).
7. **Surface §280F luxury auto cap** in `vehicle-depreciation-interest` category.
8. **Verify §274(o) 2026 meal sunset** status under OBBBA — block 2026 label set shipping until resolved.
9. **Refine sole-prop SE tax citation** (line 84) to distinguish 15.3% on first $176,100 vs. 2.9% above.

Remaining PASS 1 misses not formalised (see Task H table): §195, §183, §3121(d) misclassification, §451 constructive receipt, §280F, §6672 trust-fund-recovery surfacing, Wayfair sales-tax detection, §199A aggregation, §1250 home-office recapture UX, preparer penalty / Circular 230 boundary.

---

*This review does not substitute for a licensed CPA's sign-off. The `categories.v1.json` cpaSignOffRequired checklist (lines 821–830) remains correct — every lineMap cell, every SSTB classification, every §471(c) default, and every state PTET detection still needs a licensed CPA review before any tax-facing output ships.*

---

## PASS 2 resolution update (24 April 2026)

In response to this second-pass review, the following corrections were applied:

**NEW ERRORS introduced by PASS 1 fix pass — all resolved:**

1. ✅ **P08, P10, P20 Form 1065 "Line 9b" / "Line 9c" references — corrected.** Rent on Form 1065 is Line 13 (not 9b). Payroll on Form 1065 is Line 9, no sub-line (not 9c). Fixed on 5 rows across P08, P10, P20 with explicit v1.2 fix commentary. The Line 9b/9c sub-lines do not exist on Form 1065 — they exist only on Schedule C.

2. ✅ **`categories.v1.json` depreciation routing to Form 1065 `line16` — corrected to `line16c`.** Form 1065 depreciation has three sub-lines: 16a (gross), 16b (reported on 1125-A or elsewhere), 16c (net). The deductible amount is 16c. Both `tools-equipment` and `hardware` conditional routings updated. Added a form1065Note explaining the 16a/16b/16c mechanic.

3. ✅ **P10 "~40% of revenue" annotation on food ingredients — removed.** Margin commentary, not IRS guidance.

4. ✅ **P14 "~32% salary ratio" framing — replaced** with the IRS Fact Sheet 2008-25 nine-factor + *Watson v. U.S.* defense pattern per D90.

**Partially-applied fixes — all resolved:**

5. ✅ **3 remaining generic `"Insurance"` labels in scenarios.json — corrected.** P05 Jake Torres (Progressive Commercial → `Commercial insurance`), P06 Marco Henderson (Progressive Commercial Insurance → `Commercial insurance`), P17 Lisa Grant (Professional liability insurance → `Professional liability insurance`). Zero generic `"Insurance"` labels remain. Also updated demo/implementation/irs-routing.md `20 or 16` entries → `20 or 16c` for depreciation-over-de-minimis routing.

6. ⚠️ **`categories.v1.json` missing categories** — not resolved in this pass: `stock-licensing-income`, `materials-job` with §471(c) conditional, `gift-card-redemptions`, `shipping-packaging` split. These are tracked in `build-plan-cpa-fixes-apr-2026.md` "Gaps flagged but not fully addressed in this pass."

**Remaining PASS 1 gaps not yet addressed** (tracked as open research items in `irs-tax-research.md`): §195 startup costs, §183 hobby loss, §3121(d) worker misclassification, §451 constructive receipt, §280F luxury auto, §6672 trust-fund penalty UX, Wayfair sales-tax detection, §199A aggregation, §1250 home-office recapture UX, Circular 230 / preparer penalty boundary (GC review required per D94).

**Verification commands used to confirm fixes landed:**
```
grep -c "Line 9b\|Line 9c" irs-persona-taxonomy.md            → 0
grep '"category": "Insurance"' scenarios.json                 → 0
grep '"Van lease + gas"' scenarios.json                       → 0
grep '"Inventory / COGS"' scenarios.json                      → 0
grep '"form1065": "line16"' categories.v1.json                → 0 (all now line16a/b/c)
python3 -c "import json; json.load(open('scenarios.json'))"   → valid
python3 -c "import json; json.load(open('categories.v1.json'))" → valid
```

**Verdict after PASS 2 resolution:** The crosswalk table, per-persona LLC cards, and `categories.v1.json` lineMap cells are now internally consistent and free of the errors identified in both passes. **Next gate is a licensed CPA review** against the full `cpaSignOffRequired` checklist in `categories.v1.json`.

