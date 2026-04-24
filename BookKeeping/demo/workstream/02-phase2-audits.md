# Phase 2 — Forensic Re-Audits (6 audit documents)

*Load this file only after SCAF-7 is approved by Nik.*
*Do not load Phase 3 until all 6 audits are complete.*

---

## How to run a Phase 2 audit

1. Read `workstream/00-master-prompt.md` (master context).
2. Read this file.
3. Identify the audit you are currently producing from the status table in
   `workstream/00-master-prompt.md`.
4. Read the audit brief below for that item only.
5. Produce the audit document. Save it to
   `BookKeeping/reviews/demo-stress-test-apr-2026/` using the filename
   specified below.
6. Every finding must carry [CURRENT] / [FUTURE] / [BOTH] and its
   AI-scalability impact.
7. Every audit that touches data or IRS logic must verify all entity types
   and all 10 industries — not just sole-prop consulting.
8. Present findings to Nik before moving to the next audit.

---

## Sequence

All 6 audits are unblocked simultaneously after SCAF-7, but run them
in this order to build context:

```
01-founder-code v2  →  02-prompts-voice  →  03-config-data-irs
→  04-cpa-spec-buildability  →  05-end-user-walkthrough
→  06-doc-consistency
```

---

## Audit 1 — Founder code re-audit (v2)

**Output file:** `BookKeeping/reviews/demo-stress-test-apr-2026/01-founder-code.md`
(overwrite / append v2 section to the existing file)

**Goal:** Re-audit all built code under the AI-scalability lens now that the
SCAF bedrock is in place. Confirm Category A [CURRENT] is reduced to ≤2 items.
Confirm no [FUTURE] Category A items remain.

**What to audit:**
- `screens/*.jsx` — all 7 built screens
- `components/*.jsx` — all components including the new SCAF-1/SCAF-6 additions
- `app.jsx`, `worker-client.js`

**Lenses to apply (both required — do not let one crowd out the other):**
1. Bug lens (CURRENT): does the code work correctly as shipped today?
2. AI-scalability lens (FUTURE): if a new agent reads this file to build
   the next screen, will it produce consistent, on-brand code?

**Entity-type coverage check:**
- Do S-Corp-specific card variants (`owners-draw`, `income-celebration` with
  S-Corp copy) render correctly?
- Does the LLC dual-path question appear correctly in onboarding?
- Are IRS line chips entity-aware (Sch C vs 1120-S vs 1065)?

**Output format:** Use the severity buckets from `00-README.md`. Tag every
finding [CURRENT] / [FUTURE] / [BOTH] and add its AI-scalability impact
as a sub-note.

**Success criterion:** Category A [CURRENT] ≤2 items. Zero Category A
[FUTURE] items (SCAF pass should have resolved all of them).

---

## Audit 2 — Prompts + voice system

**Output file:** `BookKeeping/reviews/demo-stress-test-apr-2026/02-prompts-voice.md`

**What to audit:**
- `public/prompts/*.md` — all prompt files
- `worker-client.js` — INTENT_MAP, cache logic, retry logic
- `guardrails/voice-validator.js`
- `guardrails/banned-phrases.js`
- `guardrails/retry-on-fail.js`

**Questions to answer:**

1. **JSON contract consistency:** Does every intent produce output in the
   same JSON shape? Are there intents where the fallback shape differs from
   the AI-generated shape?

2. **Overlay activation logic:** Does `cpa-chat.md` activate correctly for
   `viewer_role: "cpa"` and for `variant: "cpa-suggestion"` cards? Can an
   agent understand the activation rules from the files alone?

3. **Fallback completeness:** Does every intent have a fallback defined? What
   happens when the worker is unavailable — does every screen degrade
   gracefully?

4. **Test coverage:** Are there test cases for each intent in `tests/`? If
   not, which intents are untested?

5. **New-intent buildability:** Could a fresh agent add a new intent + prompt
   file correctly, using only the existing files as a guide? What would they
   get wrong?

6. **Entity-type voice coverage:** Do prompts handle S-Corp owner's draw, LLC
   dual-path, and S-Corp mid-year election copy correctly? Or do they default
   to sole-prop framing silently?

**Output format:** Severity buckets from `00-README.md`. Tag every finding
[CURRENT] / [FUTURE] / [BOTH].

---

## Audit 3 — Config, data, and IRS taxonomy

**Output file:** `BookKeeping/reviews/demo-stress-test-apr-2026/03-config-data-irs.md`

**What to audit:**
- `public/config/industries.json`
- `public/config/scenarios.json`
- `public/config/personas.json` (if it exists)
- `public/config/cpa-fixture.json` (if it exists)
- `implementation/irs-routing.md`
- `util/irsLookup.js`

**Checks required (every single one):**

**Persona completeness:**
- All 20 personas present (10 industries × sole-prop + S-Corp)
- All 4 entity types covered (sole-prop, S-Corp, llc-single, llc-multi)
- All scenario keys match the lookup pattern in `App.jsx` exactly

**IRS routing correctness (verify for ALL entity types):**
- Every category in every scenario maps to a valid IRS line
- Sole-prop categories → Schedule C line numbers
- S-Corp categories → Form 1120-S line numbers
- LLC single-member categories → Schedule C line numbers (same as sole-prop)
- LLC multi-member categories → Form 1065 line numbers
- IRS routing in `irs-routing.md` matches the lookup table in `irsLookup.js`

**Banned label check (zero tolerance):**
- `"Meals"` (bare) — must always include `(50%)`
- `"Insurance"` (bare) — must be specific (e.g. "Commercial insurance",
  "Malpractice insurance")
- `"Other operating expenses"` — must be "Miscellaneous business expenses"
- `"Van lease + gas"` — must be split
- `"Truck payment"` — must be "Vehicle depreciation & loan interest"
- `"Inventory"` / `"Inventory / COGS"` — must be "Inventory (COGS)"
- `"Food & ingredients"` in food-bev — must be "Food & ingredients (COGS)"

**LLC dual-path documentation:**
- Is the single-member vs multi-member distinction documented in a way a
  fresh agent can follow?
- Does `irsLookup.js` handle both paths?

**New-persona buildability:**
- Could a fresh agent add a new industry + persona set (2 personas, both
  entity rows, full scenario, correct IRS routing) without reverse-engineering?
  What would they get wrong?

**CPA fixture (if present):**
- Does `cpa-fixture.json` match the schema in `implementation/cpa-data-model.md`?
- Are all required fields present?

**Output format:** Severity buckets from `00-README.md`. Tag every finding
[CURRENT] / [FUTURE] / [BOTH].

---

## Audit 4 — CPA spec buildability

**Output file:** `BookKeeping/reviews/demo-stress-test-apr-2026/04-cpa-spec-buildability.md`

**What to audit:**
- `implementation/cpa-view-spec.md` v1.1
- `implementation/cpa-data-model.md`
- `screen-briefs/09-cpa-view.md`
- `public/prompts/cpa-chat.md`

**Primary question:** Can a fresh Claude Code session build Phases 1–8 of the
CPA view from these four files alone, without asking Nik anything?

**Checks required:**

1. **Ambiguity:** Every decision point that requires interpretation — where a
   reasonable agent might make a different choice than intended.

2. **Missing state shape:** Fields referenced in the spec that are not defined
   in the data model.

3. **Undefined mutations:** State changes described in the spec that have no
   corresponding mutation contract in the data model.

4. **Missing component contracts:** Components referenced in the spec that have
   no prop definition or structure description.

5. **Missing error states:** Flows described in the spec that have no error
   or edge-case handling defined.

6. **Missing seed data:** References to initial/default data that is not
   provided anywhere a builder could find it.

7. **Entity-type handling:** Does the CPA view correctly accommodate clients
   on different entity types? Does the spec tell a builder how IRS chips,
   tax-readiness score, and P&L grouping should differ by entity type?

8. **Multi-client dashboard:** Is the dashboard spec detailed enough to build
   without ambiguity?

**Output format:** Severity buckets from `00-README.md`. Tag every finding
[CURRENT] / [FUTURE] / [BOTH]. Group findings by build phase (Phase 1–8).

---

## Audit 5 — End-user walkthrough

**Output file:** `BookKeeping/reviews/demo-stress-test-apr-2026/05-end-user-walkthrough.md`

**What to do:** Walk through the live demo twice — once as Alex (sole-prop,
consulting) and once as Sam (S-Corp, consulting). Document every moment that:

- Feels off, breaks trust, or sounds robotic
- Has an ambiguous tap outcome (user doesn't know what will happen)
- Drifts from Penny's voice rules
- Shows wrong data, wrong entity framing, or wrong IRS context for the
  active persona
- Creates friction that would cause a real user to stop and question

**Walkthrough path (both personas):**
Onboarding → thread intro (name + business collection) → first approval card →
Add tab (quick capture) → My Books → Avatar menu → Invoice designer

**Additional check for Sam (S-Corp persona):**
- Does the onboarding correctly ask the S-Corp-specific questions?
- Do approval cards show "Owner's draw" variant where appropriate?
- Does the Tax form preview show "Form 1120-S preview" (not Schedule C)?
- Does the S-Corp mid-year election narration appear if applicable?

**Lens:** End-user only. No code reading. Observe what a real first-time user
would experience.

**Output format:** Severity buckets from `00-README.md`. Tag every finding
[CURRENT] (user sees this today) / [FUTURE] (will become a problem as the
demo extends) / [BOTH].

---

## Audit 6 — Doc consistency

**Output file:** `BookKeeping/reviews/demo-stress-test-apr-2026/06-doc-consistency.md`

**What to audit (within `BookKeeping/demo/` only):**
- `CLAUDE.md`
- `DESIGN.md`
- All 10 screen-briefs in `screen-briefs/`
- `implementation/cpa-view-spec.md`
- `implementation/cpa-data-model.md`
- `implementation/irs-routing.md`
- `workstream/*.md` (this workstream folder)

**Cross-reference checks:**

1. **Rule consistency:** Every rule stated in `CLAUDE.md` — is it reflected
   correctly in `DESIGN.md` and in the relevant screen-brief? If a screen-brief
   contradicts `CLAUDE.md`, flag it.

2. **Token consistency:** Every token in `DESIGN.md` — does it exist in
   `styles/tokens.css`? Does any screen-brief reference a token that doesn't
   exist?

3. **Entity-type consistency:** Does every doc that mentions entity types cover
   the same set (sole-prop, S-Corp, llc-single, llc-multi)? Do any docs
   silently default to sole-prop only when entity-type variance matters?

4. **Decision consistency:** Every locked decision in `CLAUDE.md` — is it
   reflected consistently in all screen-briefs and implementation docs? Or do
   some docs pre-date a locked decision and still show the old pattern?

5. **Terminology consistency:** Is "Needs a look" used consistently (not
   "Things to Watch")? Are notification labels "Real-time" and "Daily digest"
   everywhere (not "Instant"/"Batch")? Are emoji rules applied consistently?

6. **Workstream consistency:** Do the workstream files in this folder accurately
   reflect the current state of the codebase after the SCAF pass?

**Output format:** Severity buckets from `00-README.md`. Tag every finding
[CURRENT] / [FUTURE] / [BOTH]. Group findings by document pair (e.g.
"CLAUDE.md ↔ screen-brief 03").

---

## After all 6 audits

Update the status table in `workstream/00-master-prompt.md`, then load
`workstream/03-phase3-flows.md` for the final phase.
