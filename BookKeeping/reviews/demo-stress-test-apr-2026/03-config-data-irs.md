# 03 — Config, Data & IRS Taxonomy: Forensic Audit

**Audited:** 25 April 2026
**Surface:** `BookKeeping/demo/public/config/{industries,scenarios,personas,cpa-fixture}.json`, `util/irsLookup.js`, `implementation/irs-routing.md`, cross-checked against `constants/variants.js`, `App.jsx`, `screens/onboarding.jsx`, `screens/cpa/{Books,CashFlow,ProfitLoss,App}.jsx`, `implementation/cpa-data-model.md`, `workstream/02-phase2-audits.md`.
**Ground truth:** demo-local `CLAUDE.md` + `DESIGN.md`. Scope is `BookKeeping/demo/` only.
**Lens:** persona / IRS-routing correctness in shipped code **plus** AI-scalability — what a fresh agent would get wrong if asked to add an industry, a persona, or a category.

---

## How to read this file

Every finding carries: severity, **CURRENT / FUTURE / BOTH** time-tag, file refs, what is wrong, why, fix, and an explicit AI-scalability impact line.

| Tag | Meaning |
|---|---|
| **[CURRENT]** | Visible to the user / agent right now in shipped code. |
| **[FUTURE]** | Bug only triggers when an agent extends the data set or tries an unused code path. |
| **[BOTH]** | Both. |

---

## Counts

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 7 |
| Medium | 6 |
| Low | 4 |
| Positive | 5 |
| **Total** | **21 primary findings** |

---

## Critical

### 03.C.1 — Persona key separator is double-underscore (`__`) but scenarios + every consumer use dot (`.`); personas.json is therefore dead config
**Tag:** [BOTH] · **Files:** `public/config/personas.json:6` (`"keyFormat": "<entity>__<industry>` … "Avoids collision with the dot separator used in AI intent names."), `public/config/scenarios.json:9-…` (every top-level scenario key uses `<entity>.<industry>`), `App.jsx:30-33` (`scenarioKey()` joins with `.`), `screens/onboarding.jsx:265`, `screens/cpa/{Books,CashFlow,ProfitLoss}.jsx`.
**What is wrong:** `personas.json` documents and ships its own `<entity>__<industry>` key format and is the only file using that format. Every consumer in the codebase joins persona fields with `.` and looks up against `scenarios.json` (which uses `.`). No fetch, no import, no reference to `personas.json` exists in any `.jsx` or `.js` file (verified via grep — only `screen-briefs/00-seed-data.md`, `DEPLOY.md`, `README.md` mention it). The file is dead config.
**Why it matters:** Two opposing claims are shipping in the demo: a persona registry that says "the canonical key separator is `__`" (with a stated rationale) and a runtime that depends on `.`. A fresh agent told to "wire personas to scenarios" will read both, pick one, and any choice silently mismatches the other. The rationale comment in `personas.json` is also factually wrong — AI intent names like `card.approval` are namespaced by *file*, not by persona key, and never collide.
**Proposed fix:** Pick one separator (recommended: `.` to match every consumer and `scenarios.json`), rename keys in `personas.json`, delete the `keyFormat` note, then either (a) wire `personas.json` into `App.jsx` so persona attributes (firstName, business, voiceContext) actually seed onboarding/thread, or (b) delete `personas.json` and move the persona fields into the per-scenario object inside `scenarios.json`. Do not leave it as untethered documentation.
**AI-scalability impact:** The single highest-cost issue in this audit. Any agent told "add a new persona" will edit `personas.json`, run the demo, and observe nothing changed — because nothing reads it. They will then duplicate the persona into `scenarios.json` with the wrong key shape. Fix this before any new persona work.

---

### 03.C.2 — `irsLookup.js` does NOT handle the LLC dual-path; `llc-multi` silently routes to Schedule C
**Tag:** [BOTH] · **Files:** `util/irsLookup.js:69-73` (`lineKeyForEntity`), `:85-89` (`shortFormLabelForEntity`), `constants/variants.js:138-143` (`formLabelForEntity`), `implementation/irs-routing.md`, `CLAUDE.md` "LLC dual-path rule".
**What is wrong:** `lineKeyForEntity` returns `"form1065"` only for `entity === "partnership"`. Every LLC flavour (`"llc"`, `"llc-single"`, `"llc-multi"`) falls through to the `schedC` default. Same for `shortFormLabelForEntity` (returns `"Sch C"` for all LLC values). Yet `constants/variants.js → formLabelForEntity` *does* branch on `LLC_MULTI` and returns `"Form 1065"`. So the full-form heading on a multi-member LLC's preview will say "Form 1065 preview", but every chip and the lookup grouping inside that preview will pull the Sch C line numbers — a self-contradicting screen.
**Why it matters:** `CLAUDE.md` documents the LLC dual-path explicitly ("Single-member LLC → Schedule C; Multi-member LLC → Form 1065 + K-1") and the routing doc has the correct columns. The runtime helper that actually drives chips and grouping ignores the distinction entirely. Any MMLLC persona introduced later will display wrong tax form lines under a correct heading — the worst possible failure mode for a tax product.
**Proposed fix:** Update `lineKeyForEntity`:
```js
if (entity === "s-corp")    return "form1120S";
if (entity === "llc-multi" || entity === "partnership") return "form1065";
return "schedC"; // sole-prop, llc, llc-single, default
```
And `shortFormLabelForEntity` symmetrically. Add a unit test that asserts `lineKeyForEntity("llc-multi") === "form1065"` and that `formLabelForEntity` from `variants.js` agrees with `shortFormLabelForEntity` from `irsLookup.js` on every entity value (parity test).
**AI-scalability impact:** Two helpers, one source of truth violated. Agents copying either pattern propagate the bug. Worst-case: an agent introduces an MMLLC persona, the demo silently mis-files every expense, and a CPA reviewing the demo loses trust on the spot.

---

### 03.C.3 — `workstream/02-phase2-audits.md` requires "all 4 entity types" but only 3 are seeded; `llc-single` and `llc-multi` exist as enum members with zero scenarios or personas
**Tag:** [BOTH] · **Files:** `workstream/02-phase2-audits.md:130, 272`, `public/config/personas.json` (entity values: `sole-prop`, `s-corp`, `llc` only), `public/config/scenarios.json` (key prefixes: `sole-prop.*`, `s-corp.*`, `llc.*` only), `constants/variants.js:36-43` (`ENTITY_TYPES` defines `LLC`, `LLC_SINGLE`, `LLC_MULTI`, `PARTNERSHIP`).
**What is wrong:** The required spec lists `sole-prop, S-Corp, llc-single, llc-multi`. The shipped data uses a generic `llc` for the four LLC personas (Henderson Renovations, Westside Goods, Curbside Collective, Sparks Events). None of those four indicate single-member vs multi-member. `llc-single` and `llc-multi` are defined in the enum, referenced in `formLabelForEntity` and `isLlc`, and excluded by `lineKeyForEntity` — but no persona, no scenario, no fixture, and no UI ever produces those entity values.
**Why it matters:** Phase-2 audit-3 explicitly checks for this coverage. The data set fails the requirement. Agents asked to "add LLC dual-path support" cannot test against a real persona because none exists.
**Proposed fix:** Either (a) split the four LLC personas into `llc-single` and `llc-multi` flavours so each path has at least one seeded persona, or (b) write the audit requirement down as "generic `llc` (treated as SMLLC) covers the dual-path baseline; CLAUDE.md notes Penny asks at onboarding". Option (a) is preferred because it lets the runtime test 03.C.2's fix end-to-end.
**AI-scalability impact:** Without seeded personas, the dual-path code path is untestable in the running demo. Any agent fixing 03.C.2 will have no way to visually verify the fix.

---

### 03.C.4 — `cpa-fixture.json` clientName values do not match any persona in `personas.json`
**Tag:** [CURRENT] · **Files:** `public/config/cpa-fixture.json:15` (`"Sarah Lin — Studio Nine"`), `:123` (`"Alex Carter — Meridian Studio"`), `:201` (`"Marco Rivera — Rivera Contracting"`), `:286` (`"Kenji Park — Park Supply Co."`); compare against `personas.json` (Sarah **Chen** — Studio Nine Consulting; **no** Alex Carter or Meridian Studio; Marco **Henderson** — Henderson Renovations LLC; **no** Kenji Park, the retail LLC persona is Mei Chen — Westside Goods LLC).
**What is wrong:** Every CPA fixture client refers to a person and business that does not exist in the persona registry, but the `scenarioKey` is correct. So the CPA view will load Sarah Chen's ledger and label it "Sarah Lin — Studio Nine", load Marco Henderson's ledger and label it "Marco Rivera — Rivera Contracting", etc.
**Why it matters:** Demo coherence collapses the moment a viewer cross-checks the CPA view against the founder app. A CPA reviewing a demo will see one name in the dashboard and a different name in the source data.
**Proposed fix:** Replace clientName values with the actual persona business owners — `"Sarah Chen — Studio Nine Consulting"`, `"Marcus Webb — Marcus Webb Productions Inc."` (or pick a different scenario), `"Marco Henderson — Henderson Renovations LLC"`, `"Mei Chen — Westside Goods LLC"`. Add a unit test that asserts every `cpa-fixture.json` clientName starts with the firstName + lastName of the persona for that scenarioKey.
**AI-scalability impact:** Future agents will copy the existing fixture pattern, perpetuating the name-drift convention. Lock the contract now.

---

## High

### 03.H.1 — `irsLookup.IRS_LINE_MAP` is missing ~60 labels that appear in `scenarios.json` and `irs-routing.md`
**Tag:** [BOTH] · **Files:** `util/irsLookup.js:7-66`, `implementation/irs-routing.md`, `public/config/scenarios.json`.
**What is wrong:** Spot-check labels in scenarios.json that have no entry in `IRS_LINE_MAP` (so `irsLineChip` silently returns `null` and the chip never renders): `cost of goods`, `inventory (cogs)`, `product inventory (cogs)`, `food & ingredients (cogs)`, `packaging`, `vehicle maintenance`, `vehicle fuel & maintenance`, `vehicle depreciation & loan interest`, `shareholder payroll`, `payroll taxes`, `permits`, `permits & inspections`, `neca membership`, `professional memberships` (present), `membership`, `education`, `education & licensing`, `ce & supervision`, `shipping & packaging`, `materials`, `job materials`, `materials — home depot`, `materials — graybar electric`, `home depot materials`, `lowe's / ace materials`, `builders firstsource materials`, `materials reimbursement (contra)`, `venue fees`, `venue & rental fees`, `event supplies`, `event supplies & florals`, `dump & disposal`, `safety & ppe`, `phone & internet`, `software & subscriptions`, `software & tools`, `software & SaaS tools`, `software (ehr & billing)`, `printing & albums`, `tools & small equipment`, `hard drives & storage`, `meals & entertainment (50%)`, `travel & client meals (50%)`, `travel & transport`, `home office / co-working`. The routing doc maps all of these correctly; the runtime lookup does not see them.
**Why it matters:** The IRS-line chip silently doesn't render for ~60 labels. Schedule C / 1120-S / 1065 preview groups them under "Other / unmapped". User-visible.
**Proposed fix:** Generate `IRS_LINE_MAP` from a single machine-readable source — promote `BookKeeping/engineering/categories.v1.json` to be that source and have `irsLookup.js` import it (or copy it into `public/config/`). Add a coverage test that grabs every distinct `category` value from `scenarios.json` and asserts `IRS_LINE_MAP` covers all expense-typed labels.
**AI-scalability impact:** Two parallel sources of truth (a hand-typed JS map and a markdown doc) will continue to drift. Each new persona/category will widen the gap. The coverage test forces them to stay in sync.

### 03.H.2 — Magic-string scenario fallback `"sole-prop.consulting"` repeated in 5 files
**Tag:** [BOTH] · **Files:** `App.jsx:141`, `screens/onboarding.jsx:265`, `screens/cpa/Books.jsx:456`, `screens/cpa/CashFlow.jsx:131`, `screens/cpa/ProfitLoss.jsx:76` (uses `${ENTITY_TYPES.SOLE_PROP}.${INDUSTRY_KEYS.CONSULTING}` — better, but still bespoke).
**What is wrong:** The default scenario key is hardcoded in five places with three formulations: bare string `"sole-prop.consulting"` (×4), interpolated enum (×1). No constant, no helper, no `DEFAULT_SCENARIO_KEY`.
**Proposed fix:** Add to `constants/variants.js`:
```js
export const DEFAULT_SCENARIO_KEY = `${ENTITY_TYPES.SOLE_PROP}.${INDUSTRY_KEYS.CONSULTING}`;
export function scenarioKeyFor(entity, industry) { return `${entity}.${industry}`; }
```
Replace every consumer.
**AI-scalability impact:** Five forks of the same string. Any agent who renames "consulting" → "consulting-coaching" must hunt all five. Constants close the gap.

### 03.H.3 — `personas.json` is unreachable; persona fields (firstName, business, voiceContext, monthlyRevenue, etc.) are never injected into AI prompts or screens
**Tag:** [CURRENT] · **Files:** `public/config/personas.json` (rich fields per persona), every consumer screen (none load it).
**What is wrong:** The fixture defines 20 personas with rich detail (business name, pronouns, monthly revenue, common clients, voice context). Nothing reads them. `App.jsx:121-130` sets `state.persona` from onboarding's free-text inputs (firstName/business collected in the thread intro), then loads only the scenario. The `voiceContext` string — exactly the kind of field the worker should pass to Claude — is dead.
**Why it matters:** The AI prompts are told "Sarah, Studio Nine" with no industry-realistic flavor. The demo loses persona authenticity that is already shipped in the data file.
**Proposed fix:** In `App.jsx`'s scenario-load effect, also fetch `personas.json` and merge the matching persona's `voiceContext`, `commonClients`, `monthlyRevenue`, `monthlyExpenses` into `state.persona` (or pass via context to `renderPenny`). If the file is intentionally not yet consumed, mark it `_meta.status: "draft, not wired"` and remove the misleading `description` claim "Selected after onboarding".
**AI-scalability impact:** Without wiring, every prompt-tuning experiment loses access to grounded persona attributes. Worse, agents will assume the file is wired and edit it expecting demo behavior to change.

### 03.H.4 — `personas.json` `keyFormat` rationale is factually wrong
**Tag:** [CURRENT] · **File:** `public/config/personas.json:6`.
**What is wrong:** Comment claims `__` "Avoids collision with the dot separator used in AI intent names." AI intent names live in `INTENT_MAP` in `worker-client.js` (`thread.greeting`, `card.approval`, etc.) — they are namespaced by file, do not appear as object keys in any config, and cannot collide with persona keys regardless of separator.
**Proposed fix:** Delete the `keyFormat` note as part of 03.C.1's resolution.
**AI-scalability impact:** Misleading rationale gets quoted in future reviews. Remove it.

### 03.H.5 — `cpa-data-model.md` "Seed file" example contradicts both the TS schema in the same doc and the actual `cpa-fixture.json`
**Tag:** [BOTH] · **Files:** `implementation/cpa-data-model.md:62-152` (TS schema, `clients: { [clientId]: {...} }`), `:237-265` (Seed file example, `clients: [ { clientId, ... } ]` — array of objects with `seeded: { learnedRules, flags, pendingAdds, approvalsPending }` counts), `public/config/cpa-fixture.json` (object map, full inline data).
**What is wrong:** Same doc shows two incompatible shapes. The fixture matches the TS schema (object map of full data) — the Seed file example is wrong.
**Proposed fix:** Replace the Seed file example with a faithful excerpt of the actual fixture shape. Or delete it and reference `cpa-fixture.json` directly.
**AI-scalability impact:** A fresh agent reading the spec to add a new client will follow the example, producing an array with `seeded` count fields the runtime can't hydrate. This is exactly the kind of doc/code drift that shipping a real seed file should make impossible.

### 03.H.6 — `IRS_LINE_MAP` lookup keys are case-sensitive (`.toLowerCase()` only) — exact label match required
**Tag:** [BOTH] · **File:** `util/irsLookup.js:94, 110`.
**What is wrong:** Lookup is `IRS_LINE_MAP[category.toLowerCase()]`. There is no trim, no whitespace normalization, no apostrophe normalization. Labels like `"Tools & Equipment "` (trailing space), `"Lowe’s / Ace materials"` (curly apostrophe vs straight in scenarios.json), `"Tools  & equipment"` (double space) all silently miss.
**Proposed fix:** `key = (category || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/[’]/g, "'")`. Add a unit test with each variation.
**AI-scalability impact:** Agents adding categories will introduce subtle label-typo misses that pass review (chip just doesn't render).

### 03.H.7 — Inconsistent "Sarah Chen" persona reuse: same name, two entity types — only difference is "Inc."
**Tag:** [CURRENT] · **Files:** `personas.json:14-23, 24-38`.
**What is wrong:** `sole-prop__consulting` and `s-corp__consulting` both name Sarah Chen of Studio Nine Consulting. May be intentional ("same person, different entity flavour") but no other industry pair shares a person — every other dual is two different people. Inconsistency is unflagged.
**Proposed fix:** Either rename one (say S-Corp → David Park already exists in pro services; pick a different consulting name) or document in `_meta.note` that consulting is the deliberate "same founder, two entities" pair. Pick one and document.
**AI-scalability impact:** Low. But agents extending personas will not know whether the convention is "always two distinct people" or "sometimes the same person at different stages."

---

## Medium

### 03.M.1 — `personas.json` includes `payrollProvider` only on S-Corp + LLC, not sole-prop — undocumented schema variance
**Tag:** [FUTURE] · **File:** `personas.json` (8 personas have `payrollProvider`, 12 do not).
**What is wrong:** Schema is conditional: present iff persona pays through payroll. Acceptable, but undocumented in `_meta`. New agents will not know whether to include it.
**Proposed fix:** Add `_meta.schema` description: `payrollProvider` is required for S-Corp and multi-member LLC, optional for sole-prop, omitted otherwise.

### 03.M.2 — `industries.json` "Software" is the only payment method that isn't a payment method
**Tag:** [CURRENT] · **File:** `industries.json:77` (`professional-services` paymentMethods includes `"QuickBooks"`).
**What is wrong:** `"QuickBooks"` is accounting software, not a payment method. Likely intended `"QuickBooks Invoices"` (which is what trades uses). Same for `"Insurance clearinghouse"` in healthcare — that's a payer category, not a payment rail. Minor data hygiene drift.
**Proposed fix:** Normalize payment-method labels.

### 03.M.3 — `industries.json` "tech-software" lists `"SVB (First Citizens)"` — possibly stale post-acquisition
**Tag:** [CURRENT] · **File:** `industries.json:90`.
**What is wrong:** Reasonable as-is, but the parenthetical is the sort of thing that ages out fast. Not blocking.
**Proposed fix:** Verify; if kept, document as deliberate.

### 03.M.4 — `irsLookup.js` `groupByIrsLine` sorts by `parseFloat(line)` which collapses "20a" and "20b" to identical 20
**Tag:** [BOTH] · **File:** `util/irsLookup.js:122-124`.
**What is wrong:** `parseFloat("20a") === 20` and `parseFloat("20b") === 20`. Lines 20a (lease) and 20b (rent) sort indeterminately within a group. Not a chip-rendering bug; just a sort instability.
**Proposed fix:** Sort by tuple `[parseFloat(line), line]`.

### 03.M.5 — `industries.json` "other" sample expense `"Generic Vendor"` / `"Business expense"` weakens the demo for the catch-all persona
**Tag:** [CURRENT] · **File:** `industries.json:113-116`.
**What is wrong:** The fallback persona path renders an unrealistic vendor in any onboarding sample card. Better to mirror the closest matched industry.
**Proposed fix:** Pick any specific value (e.g. `"Notion"` / `"Software"`).

### 03.M.6 — `cpa-fixture.json` `learnedRules[].pattern` casing varies (`"Notion*"`, `"SQ *WHOLESALE*"`, `"Home Depot*"`) — schema doesn't say
**Tag:** [FUTURE] · **Files:** `cpa-fixture.json` various, `cpa-data-model.md:84` (no normalization rule).
**What is wrong:** Patterns appear case-sensitive ad-hoc. No documented matcher (glob? regex? case-insensitive?).
**Proposed fix:** Spec the matcher in `cpa-data-model.md` (recommend case-insensitive glob with `*` wildcard).

---

## Low

### 03.L.1 — `industries.json` `_meta.source` path is wrong
**Tag:** [CURRENT] · **File:** `industries.json:5` (`"../product/19-demo-flow-brief.md §11"`).
**What is wrong:** Relative path is computed from the workspace root, not from the file. Mildly misleading.
**Proposed fix:** Change to absolute-from-workspace `BookKeeping/product/19-demo-flow-brief.md` or remove.

### 03.L.2 — `personas.json` `_meta.source` path is similarly off (extra `../`)
**Tag:** [CURRENT] · **File:** `personas.json:5`.
**Fix:** Same.

### 03.L.3 — `irs-routing.md` is dated 24 April; some `// v1.2 fix` annotations reference fixes already absorbed
**Tag:** [CURRENT] · **File:** `implementation/irs-routing.md:228-240`.
**What is wrong:** Useful traceability; but as the demo matures the fix-log will balloon. Consider moving to a CHANGELOG section near the bottom.
**Proposed fix:** Move the v1.2 fix list to a CHANGELOG section; keep the routing tables clean.

### 03.L.4 — `cpa-fixture.json` timestamps are hand-picked epoch seconds — readable but tedious to maintain
**Tag:** [FUTURE] · **File:** `cpa-fixture.json` throughout.
**Fix:** Generate at runtime from `now() - delta` deltas in the loader. Not blocking.

---

## Banned-label sweep (zero tolerance)

Result of grepping `scenarios.json` for the seven banned labels in this audit's brief:

| Banned label | Hits in scenarios.json |
|---|---|
| `"Meals"` (bare) | 0 |
| `"Insurance"` (bare in category context) | 0 |
| `"Other operating expenses"` | 0 |
| `"Van lease + gas"` | 0 |
| `"Truck payment"` | 0 |
| `"Inventory"` (bare, not "(COGS)") | 0 |
| `"Inventory / COGS"` | 0 |
| `"Food & ingredients"` (bare, in food-bev) | 0 |

✅ **All banned labels are absent from `scenarios.json`.** The 24 April taxonomy v1.2 sweep held.

---

## New-persona buildability — what would a fresh agent get wrong?

If asked to add an 11th industry plus 2 personas (sole-prop + S-Corp) using only the existing files, a fresh agent would:

1. **Edit `personas.json` and stop there** — assuming it's wired (it isn't). Demo state would not change. They'd be confused. *Root cause:* 03.C.1, 03.H.3.
2. **Use `__` separator on the new persona keys** — because that's what every other persona uses. The new scenarios in `scenarios.json` would use `.` (because they'd copy the existing scenario shape). The two would not key-match. *Root cause:* 03.C.1.
3. **Forget to add the industry to `INDUSTRY_KEYS`** in `constants/variants.js` — because no migration step in CLAUDE.md says so for industries (it does for variants). The coverage test in `tests/variants.test.js` would catch it, but only if they ran tests. *Root cause:* missing checklist.
4. **Forget to extend `IRS_LINE_MAP`** for any new category labels they introduce — because the map lives in `util/irsLookup.js` while the routing reference lives in `implementation/irs-routing.md`. They'd update the doc and call it done. Chips would silently not render. *Root cause:* 03.H.1.
5. **Copy the broken cpa-fixture clientName convention** — naming the fixture client whatever feels right rather than matching the persona. *Root cause:* 03.C.4.
6. **Skip the LLC dual-path entirely** — because the LLC pattern in seeded data is generic `llc`, not `llc-single`/`llc-multi`. *Root cause:* 03.C.3.

**Remediation:** add a "How to add a new industry / persona" checklist to `CLAUDE.md` (or `screen-briefs/00-seed-data.md`) covering all 6 points. Wire `personas.json`. Promote `irs-routing.md` to a generated artifact off `categories.v1.json`. Then build it.

---

## Positive observations (preserve these)

1. **Banned-label discipline holds.** Zero hits in `scenarios.json` for any of the 7 banned labels — the v1.2 sweep documented in CLAUDE.md actually shipped clean.
2. **Industry coverage is complete and consistent.** 10 industries in `industries.json` exactly match `INDUSTRY_KEYS` in `constants/variants.js`. The coverage test enforces this.
3. **`cpa-fixture.json` matches the canonical TS schema** in `cpa-data-model.md` (the schema, not the misleading "Seed file" example) — clients keyed by id, full inline structure, all required fields populated.
4. **Income categories are correctly entity-routed** in `irs-routing.md` — Sch C Line 1, 1120-S Line 1a, 1065 Line 1a — cleanly distinguished. (Even though `IRS_LINE_MAP` is expense-only, the doc has it right.)
5. **`personas.json` content quality is high.** Voice contexts are specific and industry-realistic; revenue/expense numbers are differentiated per industry (food truck, therapist, SaaS founder all distinct). The data is good — it's just unwired.

---

## Top remediation order (matches scaffolding-proposal severity)

1. Fix 03.C.1 (key separator) + 03.H.3 (wire personas.json). Same edit.
2. Fix 03.C.2 (LLC dual-path in `irsLookup.js`).
3. Fix 03.C.3 (seed `llc-single` and `llc-multi` personas).
4. Fix 03.C.4 (clientName parity in cpa-fixture).
5. Fix 03.H.1 (single source of truth for IRS line map).
6. Then mediums and lows as a batched cleanup.

---
*End of audit.*
