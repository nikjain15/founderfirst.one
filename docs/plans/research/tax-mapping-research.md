# Tax Mapping Engine — Research Report + Architecture Spec (W1.3-A)

> Status: **research complete — awaiting Nik sign-off** · 1 Jul 2026 · Owner: Nik

**Status:** research + spec only — no code, no migrations. Gate: Nik sign-off on this doc unblocks W1.3-B (build).
**Date:** 1 Jul 2026 · **Inputs:** web research (cited), `apps/demo/util/irs-lookup.js` (critiqued §A.4), `apps/app/src/ledger/{types,reports}.ts`, Roadmap §2 Signals themes.

---

## Scope decision — LOCKED (Nik, 3 Jul 2026)

**Coverage: every industry sector/persona we build × US federal + all 50 states.** The seed
matrix is `sector × entity_type × jurisdiction (federal + 50 states) × tax_year` — all rows,
never code (the whole point of Part B). Because coverage is DATA, it ships progressively with
zero code changes: engine + federal + all-sector CoA templates first (unblocks the north-star
chain), then states seed in demand-first until all 50 are covered — each state is an added/
superseding row, never a code sweep. "Change once, update everywhere" (kernel principle 3b/3c)
holds at this scale: one seed edit → app, estimator, deadline cards, emails, marketing, Signals.

**Tax types — all book-derived:** income & franchise return mapping (this engine), 1099s, and
quarterly estimates, all computed from the books. Sales tax: *liability tracking + a
filing-ready summary* comes from the books; sales-tax **rate/nexus determination is a
third-party integration** (Stripe Tax / TaxJar-class), not a from-scratch build. **Payroll tax
stays a Gusto integration** (Roadmap "Don't build") — its numbers still flow into the books.

**This resolves US jurisdiction + sector breadth only.** The other 7 questions at the end of
this doc (1120 in v1, export targets, who edits mappings, Penny-proposed M-1 adjustments,
fixed-asset subledger, packaging/pricing, Canada) are still open and gate full sign-off.

---

## Executive summary

1. **What a CPA needs from Penny is not "a line number chip" — it's a year-end package** whose spine is a *tax-line-grouped trial balance*: every book account carries an assignment to a tax-form line, plus the supporting schedules the TB can't carry (fixed assets/depreciation, officer comp, owner distributions/basis activity, book-tax adjustments, 1099 vendor totals). Every professional tax suite (Lacerte, UltraTax, Drake, CCH) imports exactly this shape: **account → tax code/line → balance** ([Lacerte TB utility](https://accountants.intuit.com/support/en-us/help-article/partnership/using-lacerte-trial-balance-utility-import-excel/L19njx4ka_US_en_US), [UltraTax tax codes](https://www.thomsonreuters.com/en-us/help/accounting-cs/integrate-with-cs-professional-suite/import-account-balances-into-ultratax-cs), [Drake TB import](https://kb.drakesoftware.com/kb/Drake-Tax/11166.htm)).
2. **The industry-standard architecture is already data-driven** — Thomson Reuters publishes a 67-page "[Tax code listing for Chart of Accounts setup](https://www.thomsonreuters.com/content/dam/helpandsupp/en-us/Topics/cross-product/files/tax-code-listing-2024.pdf)": numeric codes assigned to GL accounts that carry balances to form lines across four entity types, re-issued **per tax year**. Penny should adopt the same shape (jurisdiction → form@year → line → mapping rule), stored as seed data.
3. **Competitors' failure modes are Penny's opening**: QBO Online *removed* user-editable tax-line mapping that Desktop had (accountants complain loudly); Xero/FreshBooks/Wave have essentially no US tax-line layer; Bench's proprietary un-exportable ledger became a cautionary tale when it collapsed mid-tax-season. Trust + a clean, standard export is the moat (Signals theme #5).
4. **The demo's `irs-lookup.js` is not a viable base** — it's a hardcoded synonym table over category *strings*, expense-only, single-year, US-only, with forms as object keys (adding a form or country = code change). Useful only as a starting checklist of Schedule C expense-line semantics.
5. **Part B specifies 6 tables** where jurisdictions, forms (per entity type *and tax year*), lines, and mapping rules are rows, with an org-level CPA-editable override layer, an explicit unmapped workflow, and a book-tax adjustment (M-1) layer. Extensibility is proven by dry-mapping **Canada's T2125 entirely as seed rows** (§B.8) — zero schema or code changes.

---

## PART A — What CPAs actually need

### A.1 Per-form: books → return

The universal spine across all four returns: **trial balance (tax-line grouped) + P&L + balance sheet + GL detail + fixed-asset/depreciation schedule + payroll/owner-comp detail + book-tax adjustments**. A complete year-end package for an S-corp is described by practitioners as: "ledger, trial balance, depreciation schedules, AAA and basis schedules, distribution detail, payroll reports, bank statements, 1099 and W-2 filings" ([S-Corp bookkeeping guide](https://www.s-corptax.com/s-corporation-bookkeeping-guide)). The AICPA publishes per-form preparation checklists that mirror this ([1065 checklist](https://www.aicpa-cima.com/resources/download/partnership-llc-income-tax-return-checklist-form-1065-short)).

#### Schedule C (Form 1040) — sole prop / SMLLC
| Book source | Form target |
|---|---|
| Income accounts (sales, less refunds/returns) | Part I lines 1–3; other income → 6 |
| COGS accounts (opening/closing inventory, purchases, materials, direct labor) | **Part III lines 35–42** → carried to line 4 |
| Expense accounts | Part II lines 8–27a: 8 advertising · 9 car/truck · 10 commissions & fees · 11 **contract labor (1099 feed)** · 12 depletion · 13 depreciation/§179 (Form 4562) · 14 employee benefits · 15 insurance · 16a/b interest · 17 legal & professional · 18 office · 19 pension/profit-sharing (employer solo-401k; SEP-IRA for the owner goes on Schedule 1, *not* Sch C) · 20a equipment rent / 20b other rent · 21 repairs · 22 supplies · 23 taxes & licenses (employer payroll taxes) · 24a travel / 24b **meals (50%)** · 25 utilities · 26 wages · 27a other (itemized statement) |
| Home-office | Line 30 via Form 8829 — computed, not a book account |
Wrinkles: no balance sheet required; owner draws are not expenses (equity); meals limited to 50% *on the return* even though books carry 100%; vehicle actual-vs-mileage election.

#### Form 1120-S — S corporation
| Book source | Form target |
|---|---|
| Income | 1a–1c gross receipts/returns; 5 other income |
| COGS | **Form 1125-A** → line 2 |
| **Officer W-2 comp** | **Line 7** (Form 1125-E when receipts ≥ $500k) — must be separable from line 8 staff wages; "reasonable comp" is the #1 S-corp audit issue |
| Expenses | 8 salaries & wages · 9 repairs · 10 bad debts · 11 rents · 12 taxes & licenses · 13 interest · 14 depreciation (4562) · 16 advertising · 17 pension/profit-sharing · 18 employee benefits · 19 **other deductions (attached statement — most operating expenses land here, itemized)** |
| Balance sheet | **Schedule L** (book basis), required when receipts *or* assets ≥ $250k ([threshold](https://accountants.intuit.com/support/en-us/help-article/balance-sheet/suspend-calculation-schedules-l-1-2-form-1065-1120/L1wAf0Ejz_US_en_US); [Schedule L guide](https://support.taxslayerpro.com/hc/en-us/articles/360025902514-Form-1120-S-Schedule-L-Balance-Sheet-per-Books)) |
| Book-tax reconciliation | **Schedule M-1** ([guide](https://support.taxslayerpro.com/hc/en-us/articles/5716279518490-Form-1120-S-Schedule-M-1-Reconciliation-of-Income-Loss-per-Books-With-Income-Loss-per-Return)); **M-2** = AAA roll-forward — needs distributions by shareholder from tagged equity accounts |
| Per-shareholder | K-1s; basis schedules (Form 7203 support): contributions, distributions, loan activity per shareholder |

#### Form 1120 — C corporation
Same spine; deduction block is 12 officer comp · 13 salaries · 14 repairs · 15 bad debts · 16 rents · 17 taxes · 18 interest · 19 charitable contributions (10% limit — an *adjustment*, not a mapping) · 20 depreciation · 22 advertising · 23 pension · 24 employee benefits · 26 other deductions. Plus Schedule L, M-1 (or M-3 ≥ $10M assets), M-2 = retained earnings roll-forward ([Form 1120 checklist](https://www.taxgpt.com/blog/form-1120-checklist), [GAAP→1120 walk-through](https://www.taxgpt.com/blog/gaap-financials-to-form-1120-c-corporation-tax-return)). Only entity that pays tax itself (21% flat) — estimates are corporate, not owner-level.

#### Form 1065 — partnership / MMLLC
| Book source | Form target |
|---|---|
| Income/COGS | 1a–3, 2 via 1125-A |
| **Guaranteed payments to partners** | **Line 10** — must never be mixed into line 9 wages; partners cannot be W-2 employees |
| Expenses | 9 salaries (non-partner) · 11 repairs · 12 bad debts · 13 rent · 14 taxes & licenses · 15 interest · 16a/c depreciation · 18 retirement plans · 19 employee benefits · 20 other deductions (statement) |
| Balance sheet / recs | Schedule L; M-1; **M-2 = partners' capital**: beginning + contributions + net income − distributions = ending ([Becker K-1 guide](https://www.becker.com/blog/cpe/accounting-tips-schedule-k-1-form-1065)). L/M-1/M-2 waived only if receipts < $250k **and** assets < $1M ([threshold](https://profitjets.com/blog/form-1065-schedule-l/)) |
| Per-partner | K-1 item L capital account — **tax-basis method mandatory since tax year 2020** ([IRS 1065 instructions](https://www.irs.gov/pub/irs-pdf/i1065.pdf)); contributions/distributions must be tracked per partner in the books (tagged equity sub-accounts) |

#### Cross-entity wrinkles the engine must model (not just "map a line")
- **Deductibility % / disallowance**: meals 50%, entertainment 0%, penalties & fines 0%, tax-exempt interest excluded — these are *permanent* M-1 differences; book depreciation vs. tax depreciation (bonus/§179) is the classic *temporary* one ([TaxAct M-1 differences](https://www.taxact.com/support/22443/common-book-tax-differences-on-schedule-m-1-for-forms-1065-and-1120-s), [M-1 reconciliation guide](https://beancount.io/blog/2026/05/07/schedule-m1-m3-book-to-tax-reconciliation-gaap-corporate-tax-forms-guide)).
- **Same expense, different destination per entity**: health insurance for the owner (Sch C → Schedule 1 SE health; 1120-S → officer comp W-2 box 1); retirement (owner SEP → Schedule 1 for sole props, line 17/18 for entities); home office (Sch C only).
- **Owner money movements are equity, not P&L**: draws, distributions, contributions — the engine must map them to *info* lines (M-2/basis feeds), never to deductions.
- **1099 tracking**: accounts mapped to "contract labor"-type lines identify 1099-relevant vendor spend. Threshold is itself tax-year data: $600 through 2025 payments, **$2,000 for payments after 31 Dec 2025 (OBBBA), inflation-indexed from 2027** ([Avalara](https://www.avalara.com/blog/en/north-america/2025/07/one-big-beautiful-bill-act-1099-reporting-threshold.html), [Littler](https://www.littler.com/news-analysis/asap/tax-bill-changes-1099-reporting-thresholds)) — proof that thresholds must live in versioned seed data, not code.

### A.2 What tax software imports — the export target

| Suite | Import mechanism | Shape |
|---|---|---|
| **Lacerte** | Trial Balance Utility: Excel/CSV import; only *Account Name* strictly required; "SmartMap" pre-assigns accounts to input fields, preparer maps the rest ([docs](https://accountants.intuit.com/support/en-us/help-article/partnership/using-lacerte-trial-balance-utility-import-excel/L19njx4ka_US_en_US), [FAQ](https://accountants.intuit.com/support/en-us/help-article/federal-taxes/common-questions-lacerte-trial-balance-utility/L5uS9jw7Q_US_en_US)) |
| **ProConnect** | QBO-side "Prep for taxes" maps accounts→form lines, pushes to ProConnect or exports CSV; the QBO CSV carries a tax-line column but Lacerte's utility ignores it ([community](https://accountants.intuit.com/community/proconnect-tax-discussions/discussion/trial-balance-import-for-business-returns/00/63957), [QBO TB import](https://accountants.intuit.com/support/en-us/help-article/form-1040/import-quickbooks-online-trial-balance-data/L0wtCWYij_US_en_US)) |
| **UltraTax CS** | GL balances carried by **numeric tax codes** assigned per account; codes published annually as the [Tax Code Listing PDF](https://www.thomsonreuters.com/content/dam/helpandsupp/en-us/Topics/cross-product/files/tax-code-listing-2024.pdf); reserved codes 88888/99999 = "exclude from import" ([import docs](https://www.thomsonreuters.com/en-us/help/accounting-cs/integrate-with-cs-professional-suite/import-account-balances-into-ultratax-cs)) |
| **Drake** | Fixed Excel template per return type (1065/1120/1120-S/990); **modifying the template corrupts the import**; import overwrites return data ([KB](https://kb.drakesoftware.com/kb/Drake-Tax/11166.htm), [manual](https://www.drakesoftware.com/sharedassets/help/2022/trial-balance-import.html)) |
| **CCH (Axcess/ProSystem fx)** | Workpaper Manager exports TB via tax **groupings** (same account→code→line concept) ([CCH KB](https://support.cch.com/kb/solution.aspx/How-do-I-export-the-Trial-Balance-to-UltraTax)) |

**Implication for Penny's export (feeds W1.2):**
1. **Primary artifact = a generic mapped-TB CSV**: `account_code, account_name, debit, credit, tax_form, tax_line_code, tax_line_label` — every suite's TB utility can consume it with at most a column re-map; it doubles as the human-readable package spine.
2. **Secondary (later): per-suite profiles** — same data re-serialized (Drake's exact template; a UltraTax tax-code column using TR codes). These are *export serializers over the same mapping data*, not new mapping logic.
3. **PDF package** for the "just hand it to my CPA" case (most Signals users don't know what software their CPA runs).

### A.3 Competitor teardown — where books→tax handoff fails

| Product | Tax-mapping model | CPA complaints / gaps |
|---|---|---|
| **QBO (Online)** | Native account→tax-category mapping exists only inside accountant-facing "Prep for taxes" / newer S-corp tax-category flows ([docs](https://quickbooks.intuit.com/learn-support/en-us/help-article/map-forms-accounts/use-prep-taxes-map-export-clients-tax-info/L4EUJdqX3_US_en_US)) | Users/accountants **cannot edit tax-line mapping on accounts** as they could in Desktop — "the option to edit Tax-Line Mapping is unavailable… QBO is incredibly aggravating"; needed tax lines missing from dropdowns ([community](https://quickbooks.intuit.com/learn-support/en-us/taxes/tax-line-mapping/00/710571), [more](https://quickbooks.intuit.com/learn-support/en-us/other-questions/chart-of-accounts-tax-line/00/1180332)); export is Intuit-ecosystem-shaped (ProConnect first). Signals corpus: ~200 QBO-rage mentions (price hikes, "AI categorization correct <10% of the time") |
| **QB Desktop** | Per-account tax-line mapping baked into the CoA, flows to Lacerte/ProSeries — this is the *bar to meet*, and Intuit is sunsetting it | Migration to QBO loses the workflow ([community](https://quickbooks.intuit.com/learn-support/en-us/taxes/how-to-set-up-tax-line-mapping/00/683996)) |
| **Xero** | No US tax-line layer in the core ledger; relies on partner tax software and manual mapping ([Xero tax integrations](https://www.xero.com/us/accountants-bookkeepers/tax-software/)) | "Manual account mapping is sometimes needed; your CPA may need 1–2 extra hours per year to reconcile" ([comparison](https://taxstra.com/quickbooks-vs-xero/)) |
| **FreshBooks** | Invoice-first, no tax-line mapping; CoA is shallow | "Non-standard for tax-focused firms" ([sdocpa comparison](https://www.sdocpa.com/bookkeeping-software-comparison/)) |
| **Wave** | None; limited accountant access | "Accountant access more limited than QBO/Xero — creates friction with your CPA" ([sdocpa](https://www.sdocpa.com/bookkeeping-software-comparison/)) |
| **Bench** | Proprietary ledger, proprietary year-end package | Shut down 27 Dec 2024 mid-year-end; clients **couldn't export usable data**; transitioning CPAs found miscategorized COGS, missing depreciation/adjustments, "reconciled" accounts with unexplained variances ([Wiss](https://wiss.com/bench-accounting-shutdown-then-buyout-exposes-ai-bookkeeping-challenges/), [Acuity](https://acuity.co/bench-accounting-shuts-down/)) |
| **Digits** | AI-native GL, but tax handoff is still "export financials for your CPA" — no published line-level mapping layer | AI-distrust theme applies: "no hallucination-prone model near my taxes" (Signals #5) |

**Positioning conclusion:** nobody in Penny's price band offers a *CPA-editable, per-account, per-entity, versioned* tax-line layer with a standard export. QBO Desktop had it and is dying; QBO Online gates it behind Intuit's own tax stack. This is a differentiator that directly answers Signals themes #4 (tax anxiety) and #5 (trust/exportability — "your books are never hostage" is the anti-Bench pitch).

### A.4 Critique of `apps/demo/util/irs-lookup.js`

Treat as a *checklist of Schedule C expense semantics*, nothing more. Specific failures against the north star:

1. **Keyed on display-label strings** (~120 rows, most are synonym duplicates like "materials — home depot"). Real books key on *accounts* (type/code/tag). Unbounded synonym growth, breaks on rename, and vendor names baked into a "tax table".
2. **Forms are hardcoded object keys** (`schedC/form1120S/form1065`) and entity routing is code (`lineKeyForEntity`) — adding Form 1120, a state form, or Canada = code change everywhere. Exactly what W1.3 forbids.
3. **Expense-only.** No income, no COGS detail (1125-A), no balance sheet (Schedule L), no equity/owner movements (M-2, basis, K-1), no officer-comp separation beyond one label.
4. **No tax-year dimension** — line numbers and rules (e.g., meals %) change annually; the map silently goes stale.
5. **No deductibility metadata** — "business meals (50%)" encodes the 50% *in the label*; nothing computes or carries the M-1 adjustment.
6. **Ambiguous `null`** — means both "not deductible here" (home office on 1120-S) and "deducted on a different form" (SEP-IRA → Schedule 1). A CPA needs those distinguished (disallowed vs. flows-elsewhere).
7. **Over-aggregation** — nearly everything on 1120-S/1065 collapses to "19"/"20" (other deductions) with no itemized-statement support, and some routings are debatable (e.g., payment processing → Sch C 10 "commissions and fees" vs. 27a; bank fees → 27a is fine but processing fees for e-commerce are usually COGS-adjacent contra-revenue questions a CPA decides — which is *why* overrides must exist).
8. **No unmapped workflow** — `__unmapped__` renders a bucket; the real system needs a queue that blocks "package ready".

What it got right (keep): entity-aware line routing as a concept; grouped-by-line P&L presentation with subtotals; COGS sorting ahead of numbered lines; the instinct that vehicle *loan principal* isn't deductible.

### A.5 Signals demand → what the mapping engine feeds (Roadmap §2)

- **#4 Quarterly estimates / set-aside guidance:** the engine's mapped, adjustment-applied net income per entity is the *input* to any estimate calc (SE tax + income tax for Sch C; owner-level for pass-throughs; corporate for 1120). Without line-level mapping + M-1 layer, an estimate is a guess.
- **#4 1099 confusion (the "95-contractor mess"):** accounts mapped to contract-labor-kind lines × vendor dimension × the *versioned* threshold ($600→$2,000 for 2026) = the 1099 candidate report in the year-end package.
- **#5 Trust / provider-collapse:** the anti-Bench guarantee — the package is standard-format, complete, and exportable any day of the year, with a tie-out statement (TB ties to the cent; unmapped = 0).
- **#10 Lender/due-diligence package:** same generator, different artifact profile.

---

## PART B — Architecture spec: data-driven, country-extensible

### B.0 Design invariants

1. **Jurisdictions, forms, lines, and mapping rules are rows, never code.** Adding a country, entity type, form revision, or tax year = inserting seed rows (LEARNINGS #6: one concept, one source of truth).
2. **Forms are versioned by tax year.** Nothing references "Schedule C" unqualified; everything references `(jurisdiction, form_code, tax_year)`. Mappings reference stable **`line_key`s** (semantic, e.g. `meals`) not display line numbers (`24b`), so annual re-seeds don't orphan CPA work.
3. **The ledger stays tax-ignorant.** `ledger_accounts` (type/code/parent, per `apps/app/src/ledger/types.ts`) is untouched except for one additive column (`tags text[]`, B.2). Tax mapping is a *projection layer* over `accountBalances()`/`profitAndLoss()` in `apps/app/src/ledger/reports.ts` — reports remain derived, ledger remains truth.
4. **Every account resolves to exactly one line or to UNMAPPED — never silently dropped** (the OBTEST silent-drop incident is the cautionary tale). UNMAPPED is a first-class queue that blocks "package ready".
5. **Book-tax differences are recorded, not applied to the books.** The books stay book-basis; adjustments live in their own layer and appear as an M-1 draft. Penny may *propose* mechanical adjustments (meals 50%) but a human approves (Signals #5: grounded, no hallucination near taxes).

### B.1 Schema (6 tables + 1 additive column)

```sql
-- 1. Jurisdictions: countries / sub-national authorities
tax_jurisdictions (
  id uuid pk,
  code text unique,            -- 'US-FED', 'CA-FED', later 'US-CA' (state)
  name text, country_code char(2), currency char(3),
  params jsonb                 -- jurisdiction-wide, year-keyed params, e.g.
                               -- {"1099_nec_threshold": {"2025": 60000, "2026": 200000}}  (minor units)
);

-- 2. Forms: per jurisdiction + ENTITY TYPE + TAX YEAR
tax_forms (
  id uuid pk,
  jurisdiction_id uuid fk,
  form_code text,              -- 'SCH_C', '1120S', '1120', '1065', 'T2125'
  entity_type text,            -- 'sole_prop' | 's_corp' | 'c_corp' | 'partnership'
  tax_year int,
  name text,                   -- 'Schedule C (Form 1040)'
  params jsonb,                -- form-level thresholds, e.g.
                               -- {"schedule_l_required_over": {"receipts": 25000000, "assets": 25000000}}
  status text,                 -- 'active' | 'draft' | 'superseded'
  unique (jurisdiction_id, form_code, tax_year)
);

-- 3. Lines: the rows of the form (and its sub-schedules)
tax_form_lines (
  id uuid pk,
  form_id uuid fk,
  line_key text,               -- STABLE semantic key: 'advertising', 'meals', 'cogs_purchases',
                               -- 'officer_comp', 'sch_l_cash', 'm2_distributions'
  line_code text,              -- display: '8', '24b', 'Part III·36', 'L·1', '8521'
  label text,
  section text,                -- 'income' | 'cogs' | 'deductions' | 'balance_sheet' | 'equity_rollforward' | 'info'
  sort_order int,
  kind text,                   -- 'amount' (maps from books) | 'computed' | 'subtotal' | 'info'
  deductible_pct numeric,      -- null = 100; 50 for meals; 0 for penalties line
  flows_to text,               -- null | 'other_form' (e.g. SEP-IRA → 'Schedule 1') | 'disallowed'
  notes text,
  unique (form_id, line_key)
);

-- 4. Seeded mapping rules: ledger account → line (per form, priority-ordered)
tax_mapping_rules (
  id uuid pk,
  form_id uuid fk,
  priority int,                -- lower wins; evaluation order below
  match_kind text,             -- 'account_code_range' | 'account_tag' | 'account_name_pattern' | 'account_type'
  match_value text,            -- '6100-6199' | 'meals' | '%advertis%' (ILIKE, ESCAPE-safe) | 'expense'
  line_key text,               -- target on this form
  is_seed boolean default true
);

-- 5. Org-level override: THE CPA-editable layer (wins over all rules)
org_account_tax_map (
  id uuid pk,
  org_id uuid fk, account_id uuid fk,
  form_code text,              -- keyed by form_code + line_key (not line id) → survives annual re-seeds
  line_key text,
  tax_year_from int,           -- effective-dated; null = all years
  set_by uuid, note text, created_at timestamptz,
  unique (org_id, account_id, form_code, coalesce(tax_year_from, 0))
);

-- 6. Book-tax adjustment layer (the M-1 home)
tax_adjustments (
  id uuid pk,
  org_id uuid fk, tax_year int, form_id uuid fk,
  line_key text,               -- optional: which return line it adjusts
  m1_bucket text,              -- 'income_on_books_not_return' | 'expense_on_books_not_return'
                               -- | 'income_on_return_not_books' | 'deduction_on_return_not_books'
  kind text,                   -- 'permanent' | 'temporary'
  amount_minor bigint, memo text,
  source text,                 -- 'penny_proposed' | 'cpa_entered'
  status text,                 -- 'proposed' | 'approved' | 'rejected'  (proposed = draft only, never auto-filed)
  created_by uuid, created_at timestamptz
);

-- Additive column (only ledger change):
alter table ledger_accounts add column tags text[] default '{}';
-- e.g. {'meals','owner:maria','officer_comp','fixed_asset','distribution'}
-- Owner-scoped tags ('owner:<id>') let equity accounts feed per-shareholder/partner
-- M-2 / basis / K-1 reports without a subledger.

-- Org tax profile (fields on orgs or a 1:1 table):
--   entity_type, jurisdiction_code, fiscal_year_end, s_election_date, ein_last4
```

### B.2 Rule resolution (deterministic, explainable)

For each account, for the org's form@year:

1. `org_account_tax_map` row (effective for the year) → **use it** (CPA override always wins).
2. Else first matching `tax_mapping_rules` by `priority`: seeds are ordered **code-range (10) → tag (20) → name-pattern (30) → account-type fallback (40)**. Type fallbacks are catch-alls (`expense → other_deductions`, `asset → sch_l_other_assets`) so *typed* accounts never fall through on entity returns.
3. Else → **UNMAPPED** queue. (Sch C has no safe expense catch-all decision-free? It does — `27a other`; but income/equity accounts with no rule stay UNMAPPED deliberately: a mis-bucketed owner draw as income is worse than a question.)

Every resolved line in the UI shows *why* ("matched seed rule: name ~ '%advertis%'" / "set by Maria's CPA on 12 Feb") — the explainability requirement from Signals #5.

**Unmapped handling:** package generation runs a preflight — `unmapped_accounts = 0` (or each explicitly acknowledged "exclude, reason…") before the package is stamped "CPA-ready". Mirrors UltraTax's explicit 88888/99999 exclude codes rather than silent omission.

### B.3 Seed-file format (one JSON file per jurisdiction+form+year)

`seeds/tax/US-FED/SCH_C/2025.json` (excerpt):

```json
{
  "jurisdiction": "US-FED",
  "form_code": "SCH_C", "entity_type": "sole_prop", "tax_year": 2025,
  "name": "Schedule C (Form 1040)",
  "params": { "balance_sheet_required": false },
  "lines": [
    { "line_key": "gross_receipts", "line_code": "1",  "label": "Gross receipts or sales", "section": "income", "kind": "amount", "sort": 10 },
    { "line_key": "returns_allowances", "line_code": "2", "label": "Returns and allowances", "section": "income", "kind": "amount", "sort": 20 },
    { "line_key": "cogs", "line_code": "4", "label": "Cost of goods sold (Part III)", "section": "cogs", "kind": "computed", "sort": 40 },
    { "line_key": "advertising", "line_code": "8",  "label": "Advertising", "section": "deductions", "kind": "amount", "sort": 80 },
    { "line_key": "contract_labor", "line_code": "11", "label": "Contract labor", "section": "deductions", "kind": "amount", "sort": 110, "notes": "1099-NEC candidate feed" },
    { "line_key": "meals", "line_code": "24b", "label": "Deductible meals", "section": "deductions", "kind": "amount", "deductible_pct": 50, "sort": 245 },
    { "line_key": "owner_health_insurance", "line_code": null, "label": "Self-employed health insurance", "section": "info", "kind": "info", "flows_to": "1040 Schedule 1", "sort": 900 },
    { "line_key": "owner_draws", "line_code": null, "label": "Owner draws (not deductible)", "section": "info", "kind": "info", "flows_to": "disallowed", "sort": 910 }
  ],
  "rules": [
    { "priority": 10, "match_kind": "account_code_range", "match_value": "4000-4099", "line_key": "gross_receipts" },
    { "priority": 10, "match_kind": "account_code_range", "match_value": "5000-5999", "line_key": "cogs_purchases" },
    { "priority": 20, "match_kind": "account_tag", "match_value": "meals", "line_key": "meals" },
    { "priority": 20, "match_kind": "account_tag", "match_value": "contractor", "line_key": "contract_labor" },
    { "priority": 30, "match_kind": "account_name_pattern", "match_value": "%advertis%", "line_key": "advertising" },
    { "priority": 30, "match_kind": "account_name_pattern", "match_value": "%marketing%", "line_key": "advertising" },
    { "priority": 40, "match_kind": "account_type", "match_value": "expense", "line_key": "other_expenses" },
    { "priority": 40, "match_kind": "account_type", "match_value": "income", "line_key": "gross_receipts" }
  ]
}
```

Loader = idempotent upsert keyed on `(jurisdiction, form_code, tax_year, line_key)` — re-running a corrected seed is safe; a new tax year is a new file (usually copied + line_code/label/param diffs). **Default CoA templates per industry** (the demo's 10 personas ≈ Signals verticals) ship with codes/tags aligned to these rules, so a fresh org is ~fully mapped on day one; catch-up-mode imported charts rely on name-pattern + type rules and surface the rest in the unmapped queue.

### B.4 Book-tax adjustment layer (M-1 mechanics)

- **Mechanical, Penny-proposable** (status `proposed` until approved): meals × (1 − deductible_pct) from line metadata; penalties/fines (tag `penalties`, deductible_pct 0); entertainment 0%. Permanent differences.
- **CPA-entered**: depreciation book-vs-tax delta (until a fixed-asset subledger exists, tax depreciation is the CPA's number), accruals, §263A, charitable-limit carryovers. Temporary/permanent flagged.
- Output: **draft Schedule M-1** = book net income (from `profitAndLoss()`) + approved adjustments bucketed into the four M-1 directions; M-2/AAA roll-forward from tagged equity accounts (`contribution`, `distribution`, `owner:<id>`).

### B.5 Year-end package generator (contents, per entity)

All artifacts period-stamped, entity-stamped, tie-out-verified (extends W1.2 exports):

1. **Mapped trial balance** (CSV + PDF): account, balances, `tax_form`/`line_code`/`line_label` columns — the A.2 target shape.
2. **Tax-grouped P&L**: P&L re-grouped by form section/line with per-line subtotals and itemized detail for statement lines (1120-S 19 / 1065 20 / Sch C 27a).
3. **Balance sheet, Schedule-L-grouped** (entity returns) + comparative beginning/ending year.
4. **GL detail** (full entry/line dump — already W1.2).
5. **M-1 draft** (approved adjustments) + adjustments register with memos.
6. **Equity/owner report**: contributions, distributions, guaranteed payments per tagged owner → M-2, K-1 item L, basis worksheets, officer-comp summary (1120-S line 7, 1125-E trigger note at ≥$500k receipts).
7. **Fixed-asset listing** (accounts tagged `fixed_asset`, additions/disposals in year) — *input to* the CPA's 4562, explicitly labeled "book records; tax depreciation not computed" until a subledger exists.
8. **1099 candidate report**: vendors with year-total ≥ threshold (from jurisdiction params, year-keyed) on 1099-relevant lines.
9. **Unmapped/exceptions statement**: must be empty or acknowledged; plus tie-out statement (TB balanced, package totals = report totals to the cent).

### B.6 CPA-facing UX (sketch — detail in W1.3-B card)

- **Chart of accounts → "Tax" column**: every account shows its resolved line as a chip (the one good demo idea, upgraded); click → picker of the org-form's lines, writes an `org_account_tax_map` row (audit-logged, read_only CPAs excluded per role rules).
- **Unmapped queue** in the CPA workqueue (W1.4 integration).
- **Reports tab**: "Group by tax line" toggle on P&L; "Year-end package" button (W1.2 export machinery).
- Voice: chips are quiet metadata, no tax advice framing (VOICE.md).

### B.7 What feeds later Signals features

Quarterly estimates read `mapped net income + approved adjustments` per entity type; set-aside guidance = same number × configurable rate table (jurisdiction params, year-keyed); 1099 tracking reads B.5(8) continuously, not just at year-end ("deadline anxiety" theme → surface in January proactively).

### B.8 Extensibility proof — Canada T2125 (sole prop) as pure seed data

Zero schema/code changes. One jurisdiction row, one form row, line rows, rules — all through the existing tables. Line numbers per [CRA T2125](https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html) ([expense-section detail](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html), [line-by-line walkthrough](https://northos.ca/resources/t2125-line-by-line)):

```json
// seeds/tax/CA-FED/T2125/2025.json
{
  "jurisdiction": "CA-FED",          // row 1: tax_jurisdictions ('CA-FED','Canada — CRA','CA','CAD')
  "form_code": "T2125", "entity_type": "sole_prop", "tax_year": 2025,
  "name": "T2125 Statement of Business or Professional Activities",
  "params": { "balance_sheet_required": false, "meals_deductible_pct": 50 },
  "lines": [
    { "line_key": "gross_sales",        "line_code": "3A/8000", "label": "Gross sales, commissions or fees", "section": "income", "kind": "amount", "sort": 10 },
    { "line_key": "other_income",       "line_code": "8230",  "label": "Other income", "section": "income", "kind": "amount", "sort": 20 },
    { "line_key": "gross_income",       "line_code": "8299",  "label": "Gross business income", "section": "income", "kind": "subtotal", "sort": 30 },
    { "line_key": "cogs_opening_inventory","line_code":"8300","label":"Opening inventory","section":"cogs","kind":"amount","sort":40 },
    { "line_key": "cogs_purchases",     "line_code": "8320",  "label": "Purchases during the year", "section": "cogs", "kind": "amount", "sort": 41 },
    { "line_key": "cogs_direct_wages",  "line_code": "8340",  "label": "Direct wage costs", "section": "cogs", "kind": "amount", "sort": 42 },
    { "line_key": "cogs_subcontracts",  "line_code": "8360",  "label": "Subcontracts", "section": "cogs", "kind": "amount", "sort": 43 },
    { "line_key": "advertising",        "line_code": "8521",  "label": "Advertising", "section": "deductions", "kind": "amount", "sort": 50 },
    { "line_key": "meals",              "line_code": "8523",  "label": "Meals and entertainment", "section": "deductions", "kind": "amount", "deductible_pct": 50, "sort": 51 },
    { "line_key": "bad_debts",          "line_code": "8590",  "label": "Bad debts", "section": "deductions", "kind": "amount", "sort": 52 },
    { "line_key": "insurance",          "line_code": "8690",  "label": "Insurance", "section": "deductions", "kind": "amount", "sort": 53 },
    { "line_key": "interest_bank",      "line_code": "8710",  "label": "Interest and bank charges", "section": "deductions", "kind": "amount", "sort": 54 },
    { "line_key": "taxes_licences",     "line_code": "8760",  "label": "Business taxes, licences and memberships", "section": "deductions", "kind": "amount", "sort": 55 },
    { "line_key": "office",             "line_code": "8810",  "label": "Office expenses", "section": "deductions", "kind": "amount", "sort": 56 },
    { "line_key": "supplies",           "line_code": "8811",  "label": "Office stationery and supplies", "section": "deductions", "kind": "amount", "sort": 57 },
    { "line_key": "professional_fees",  "line_code": "8860",  "label": "Professional fees (legal, accounting)", "section": "deductions", "kind": "amount", "sort": 58 },
    { "line_key": "management_admin",   "line_code": "8871",  "label": "Management and administration fees", "section": "deductions", "kind": "amount", "sort": 59 },
    { "line_key": "rent",               "line_code": "8910",  "label": "Rent", "section": "deductions", "kind": "amount", "sort": 60 },
    { "line_key": "repairs",            "line_code": "8960",  "label": "Repairs and maintenance", "section": "deductions", "kind": "amount", "sort": 61 },
    { "line_key": "wages",              "line_code": "9060",  "label": "Salaries, wages and benefits", "section": "deductions", "kind": "amount", "sort": 62 },
    { "line_key": "property_taxes",     "line_code": "9180",  "label": "Property taxes", "section": "deductions", "kind": "amount", "sort": 63 },
    { "line_key": "travel",             "line_code": "9200",  "label": "Travel expenses", "section": "deductions", "kind": "amount", "sort": 64 },
    { "line_key": "utilities",          "line_code": "9220",  "label": "Utilities (incl. telephone)", "section": "deductions", "kind": "amount", "sort": 65 },
    { "line_key": "fuel_non_vehicle",   "line_code": "9224",  "label": "Fuel costs (except motor vehicles)", "section": "deductions", "kind": "amount", "sort": 66 },
    { "line_key": "delivery_freight",   "line_code": "9275",  "label": "Delivery, freight and express", "section": "deductions", "kind": "amount", "sort": 67 },
    { "line_key": "motor_vehicle",      "line_code": "9281",  "label": "Motor vehicle expenses (not CCA)", "section": "deductions", "kind": "amount", "sort": 68 },
    { "line_key": "other_expenses",     "line_code": "9270",  "label": "Other expenses", "section": "deductions", "kind": "amount", "sort": 69 },
    { "line_key": "total_expenses",     "line_code": "9368",  "label": "Total expenses", "section": "deductions", "kind": "subtotal", "sort": 70 },
    { "line_key": "cca",                "line_code": "9936",  "label": "Capital cost allowance (Area A)", "section": "deductions", "kind": "computed", "sort": 71, "notes": "CPA computes CCA; book depreciation is an adjustment, not a mapping" },
    { "line_key": "business_use_of_home","line_code": "9945", "label": "Business-use-of-home expenses", "section": "deductions", "kind": "computed", "sort": 72 },
    { "line_key": "net_income",         "line_code": "9946",  "label": "Your net income (loss)", "section": "deductions", "kind": "subtotal", "sort": 73 }
  ],
  "rules": [
    { "priority": 20, "match_kind": "account_tag", "match_value": "meals",       "line_key": "meals" },
    { "priority": 20, "match_kind": "account_tag", "match_value": "vehicle",     "line_key": "motor_vehicle" },
    { "priority": 20, "match_kind": "account_tag", "match_value": "contractor",  "line_key": "cogs_subcontracts" },
    { "priority": 30, "match_kind": "account_name_pattern", "match_value": "%advertis%",  "line_key": "advertising" },
    { "priority": 30, "match_kind": "account_name_pattern", "match_value": "%insurance%", "line_key": "insurance" },
    { "priority": 30, "match_kind": "account_name_pattern", "match_value": "%rent%",      "line_key": "rent" },
    { "priority": 30, "match_kind": "account_name_pattern", "match_value": "%software%",  "line_key": "office" },
    { "priority": 40, "match_kind": "account_type", "match_value": "expense", "line_key": "other_expenses" },
    { "priority": 40, "match_kind": "account_type", "match_value": "income",  "line_key": "gross_sales" }
  ]
}
```

Notes the proof surfaces (design confirmations, not gaps): CRA's 4-digit line codes and "3A/8000" hybrid fit `line_code text`; the same `meals` *line_key* carries the 50% rule in both countries so a US CoA re-based to Canada keeps its tag-based mappings; CCA (9936) is `computed` — same treatment as US depreciation (CPA's number via the adjustment layer); currency comes from the jurisdiction row. A Canadian org = `org.jurisdiction_code = 'CA-FED'` + this seed file. **Zero code.**

---

## Open questions for Nik (product/pricing/scope — flagged per card)

1. **v1 form scope:** Sch C + 1120-S + 1065 clearly; is **1120 (C-corp)** in v1? Signals demand is overwhelmingly pass-through; 1120 seed is cheap but its package (Schedule J, 21% tax, charitable limits) adds review surface. *Recommend: seed 1120 lines, defer its package polish.*
2. **Export targets:** generic mapped-TB CSV + PDF in v1 (recommended); are per-suite serializers (Drake's exact template, UltraTax tax-code column) a fast-follow or v1? Drake's template is "modify = corrupt", so it needs real fixture testing.
3. **Who edits mappings:** CPA-role only, or owners too? Recommend: full CPAs edit, owners view ("ask your CPA" affordance) — matches ARCHITECTURE.md lens model and limits foot-guns.
4. **Penny-proposed M-1 adjustments:** auto-propose mechanical ones (meals %, penalties) as *drafts*, or record-only what a CPA enters? Positioning tension: automation vs. "no hallucination near my taxes" (Signals #5). Recommend propose-with-approval, clearly labeled.
5. **Fixed-asset/depreciation subledger** is the biggest real gap for Schedule L/4562 quality — separate Wave-1.5 card, or accept "book listing + CPA computes" for the pilot?
6. **Packaging/pricing:** is the year-end CPA package part of the core $200–350/mo bundle (Signals #3 anchor) or a priced artifact like the due-diligence package (#10)? Affects where the "package ready" gate lives.
7. **Canada:** T2125 stays a paper proof, or do we actually ship CA-FED sole-prop in the pilot? (Corporate T2/GIFI is a much bigger seed job — explicitly out of scope here.)
8. **`ledger_accounts.tags` column + industry CoA templates with tax tags** — confirm this additive ledger change is acceptable in W1.3-B (it's the only ledger touch; everything else is new tables).

**Suggested W1.3-B build order** (after sign-off): migration (6 tables + tags) → seed loader + US-FED 2025 seeds (4 forms) → resolution fn + unmapped queue → CoA tax-chip UI + override editor → tax-grouped P&L → package generator (rides W1.2 export machinery) → adjustments layer → pgTAP over resolution precedence + a seed-lint CI check (every line_key referenced by a rule exists; every form has type-fallback coverage).
