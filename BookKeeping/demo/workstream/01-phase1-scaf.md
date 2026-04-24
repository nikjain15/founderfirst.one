# Phase 1 — Bedrock Fix Pass (SCAF-1 through SCAF-7)

*Load this file when you are working on any SCAF task.*
*Do not load Phase 2 or Phase 3 files until SCAF-7 is approved.*

**Prerequisite:** `04-open-questions.md` must be fully approved by Nik before
SCAF-1 begins.

---

## How to run a SCAF task

1. Read `workstream/00-master-prompt.md` (master context).
2. Read this file.
3. Identify the current active SCAF from the status table in
   `workstream/00-master-prompt.md`.
4. Read the SCAF detail section below for that item only.
5. Confirm acceptance criteria with Nik before writing any code.
6. Build. Show a diff. Mark every change as [CURRENT] fix or [FUTURE]
   scaffolding in your diff summary.
7. Do not start the next SCAF until Nik approves the current one.

---

## Sequence

```
SCAF-1 ── blocks ──► SCAF-2 ── blocks ──► SCAF-3 ── blocks ──► SCAF-4
SCAF-4 ── blocks ──► SCAF-5 ── blocks ──► SCAF-6 ── blocks ──► SCAF-7
```

---

## SCAF-1 — Sheet + FullScreenOverlay canonical components

**Issue class:** [BOTH] — two-pattern coexistence breaks current rendering
edge cases and will corrupt every future agent that reads the existing code.

**Problem:** Two sheet implementation patterns coexist in the codebase. Future
agents reading any screen file will pick up whichever pattern is local to that
file, producing inconsistent behavior across the app.

**What to build:**
- A canonical `<Sheet>` component (API surface approved via Q4 in
  `04-open-questions.md`)
- A canonical `<FullScreenOverlay>` component (for photo capture, voice modal,
  pulling screen)
- Both must use `createPortal` targeting `#sheet-root` (inside `.phone`) or
  `#sheet-root-cpa` (inside `.cpa-app`) — never `position: fixed`
- Both must respect the `position: absolute` anchoring rule from `demo/CLAUDE.md`

**CLAUDE.md amendment required:** Yes. Add the canonical component API, the
portal target rule, and the `position: absolute` constraint to `demo/CLAUDE.md`
in the same commit as the component.

**Files likely touched:**
- New: `components/Sheet.jsx`
- New: `components/FullScreenOverlay.jsx`
- Edit: every screen that currently rolls its own sheet (identify in the diff)
- Edit: `demo/CLAUDE.md`

**Acceptance criteria:**
- [ ] `<Sheet>` component exists with the approved API surface
- [ ] `<FullScreenOverlay>` component exists
- [ ] Zero instances of the old sheet pattern remain in any screen file
  (grep check: no `position: fixed` inside `.phone` context)
- [ ] Both components use `createPortal`
- [ ] `demo/CLAUDE.md` updated with canonical pattern in the same commit
- [ ] Nik has reviewed and approved the diff

---

## SCAF-2 — constants/variants.js

**Issue class:** [FUTURE] — no current breakage, but every future agent will
invent new magic strings without this file.

**Problem:** Card variants, entity types, industry keys, approval types, and
notification modes are scattered as magic strings across multiple files. There
is no single contract future agents can read.

**What to build:**
`constants/variants.js` — a frozen object (or TypeScript enum if migration was
approved in Q3) exporting:

```js
CARD_VARIANTS      // expense, income, income-celebration, owners-draw,
                   // rule-proposal, variable-recurring, cpa-suggestion,
                   // penny-question, year-access-request
ENTITY_TYPES       // sole-prop, s-corp, llc-single, llc-multi
INDUSTRY_KEYS      // consulting, trades, retail, food-bev, healthcare,
                   // beauty-wellness, professional-services, creative-media,
                   // real-estate, other
APPROVAL_TYPES     // reclassification, year-access-request, cpa-added-txn,
                   // penny-question
NOTIFICATION_MODES // real-time, daily-digest, off
```

Plus helpers:
```js
isSCorpOrLlc(entityType)   // true for owners-draw eligibility
isLlcDualPath(entityType)  // true for llc-single and llc-multi
formLabelForEntity(entity) // "Schedule C" | "Form 1120-S" | "Form 1065"
```

**Entity-type coverage check:** `ENTITY_TYPES` must cover all four types.
`INDUSTRY_KEYS` must cover all 10 industries. Cross-check against
`public/config/industries.json` and `public/config/scenarios.json` to confirm
no key is missing or misspelled.

**Unit test required:** `tests/variants.test.js` — assert every exported
constant is frozen and every helper returns the correct value for every input.

**CLAUDE.md amendment:** No (covered by SCAF-1's amendment). Do document the
constants file in the relevant screen-brief if the brief currently uses magic
strings.

**Acceptance criteria:**
- [ ] `constants/variants.js` exists with all 5 constant groups
- [ ] All 4 entity types present in `ENTITY_TYPES`
- [ ] All 10 industry keys present in `INDUSTRY_KEYS`, matching
  `industries.json` exactly
- [ ] All helpers implemented and correct
- [ ] `tests/variants.test.js` passes (run `npm test`)
- [ ] At least 3 existing screens updated to import from `constants/variants.js`
  instead of using magic strings (identify which 3 in the diff)
- [ ] Nik has reviewed and approved the diff

---

## SCAF-3 — constants/copy.js

**Issue class:** [BOTH] — voice drift is observable today in shipped screens;
future agents will worsen it without a single registry.

**Problem:** Static Penny copy exists in multiple locations: `FALLBACK_COPY`
in `onboarding.jsx`, inline strings in `thread.jsx`, and scattered in other
screens. When voice rules change, there is no single file to update.

**What to build:**
`constants/copy.js` — using the format approved in Q2 of `04-open-questions.md`.

Must contain at minimum:
- All locked onboarding copy (the 8-row table in `demo/CLAUDE.md` under
  "Approved onboarding copy")
- All fallback card copy (from `fallbackMsg()` in `card.jsx`)
- All empty-state copy (queue-empty, no-books, no-invoices)
- All toast messages (current across all screens)
- All error messages visible to the user

**Zero visual diff:** No string that currently appears on screen should change.
This is a pure extraction.

**CLAUDE.md amendment required:** Yes. Add a rule: "All static Penny copy lives
in `constants/copy.js`. Do not hard-code copy in screen files. Import from the
registry." Ship in the same commit.

**Acceptance criteria:**
- [ ] `constants/copy.js` (or equivalent per Q2 decision) exists
- [ ] All 8 locked onboarding strings present and byte-identical to the table
  in `demo/CLAUDE.md`
- [ ] All fallback card messages extracted
- [ ] Zero new strings introduced (extraction only)
- [ ] `demo/CLAUDE.md` updated with the copy-registry rule
- [ ] Nik has reviewed and approved the diff

---

## SCAF-4 — Token-discipline sweep + enforcement

**Issue class:** [CURRENT] — violations exist in shipped screens today. Users
see wrong colors and weights.

**Problem:** Raw hex values (`#fff`, `#0a0a0a`), raw font-weight numbers
(`fontWeight: 600`), and raw border-radius numbers (`borderRadius: 12`) appear
in shipped JSX inline styles. The design system requires CSS custom properties
everywhere.

**What to do:**
1. Grep for all violations in `screens/*.jsx` and `components/*.jsx`:
   - Raw hex: `#[0-9a-fA-F]{3,6}`
   - Raw font-weight: `fontWeight:\s*[0-9]{3}`
   - Raw border-radius: `borderRadius:\s*[0-9]+[^p]` (not ending in "px" var)
2. Fix every violation to use the correct token from `styles/tokens.css`
3. Add enforcement so violations cannot re-enter the codebase (lint rule or
   pre-commit grep per Q1 decision in `04-open-questions.md`)

**Permitted exceptions** (document each one with a comment):
- `rgba(10,10,10,N)` and `rgba(255,255,255,N)` for layered transparency
- `borderRadius: 8` for icon container corners (no named token exists)
- `borderRadius: 10` for confirmed slug pill (no named token exists)

**CLAUDE.md amendment required:** Yes. Add the enforcement mechanism (lint
command or grep command) and note the two permitted borderRadius exceptions.
Ship in the same commit.

**Acceptance criteria:**
- [ ] Zero raw hex values in `screens/*.jsx` and `components/*.jsx`
  (grep confirms)
- [ ] Zero raw font-weight numbers (grep confirms)
- [ ] Zero un-excepted raw border-radius numbers (grep confirms)
- [ ] Enforcement mechanism in place (lint rule passing or pre-commit hook
  installed and tested)
- [ ] Each permitted exception commented in the source
- [ ] `demo/CLAUDE.md` updated with enforcement command
- [ ] Nik has reviewed and approved the diff

---

## SCAF-5 — Color-zone rule alignment

**Issue class:** [CURRENT] — amber-as-background and other color-zone
violations exist in shipped code today.

**Problem:** The color-zone rules in `demo/CLAUDE.md` are violated in shipped
screens. Specifically: amber used as a fill background (not permitted — amber
is only allowed as text/badge color), and potentially other accent colors
outside their permitted zones.

**What to do:**
1. Audit every use of `--amber`, `--income`, `--income-bg`, `--sage`,
   `--error`, and all `--cat-*` tokens in `screens/*.jsx` and
   `components/*.jsx`
2. Cross-check each use against the color-zone table in `demo/CLAUDE.md`
3. Fix every violation. Replace forbidden fills with the correct treatment
   (usually `var(--ink)` or `var(--paper)` depending on context)
4. Check CPA-view-specific zones (amber on "Pending approval" and "Added by CPA"
   badges; error as 3px left border on flagged rows — these are permitted)

**Acceptance criteria:**
- [ ] Zero amber fill backgrounds outside the permitted CPA badge zones
- [ ] Zero accent colors outside their defined zones
- [ ] All CPA-specific color zones preserved (amber badges, error border)
- [ ] No visual change to correctly-zoned elements
- [ ] Nik has reviewed and approved the diff

---

## SCAF-6 — Shared micro-components

**Issue class:** [BOTH] — duplicate implementations exist in shipped screens
today; future agents will add more without canonical components.

**Problem:** `VoiceWaveform`, `Spinner`, `Toast`, and `EyebrowLabel` are each
implemented multiple times across screens with slight variations. This causes
visual inconsistency today and will compound as future agents add screens.

**What to build:**

`components/VoiceWaveform.jsx`
- 28-bar animated waveform using `@keyframes voiceBar` from `components.css`
- Props: `bars` (seeded array from parent), `isRecording` (bool)
- Used by: `VoiceModal` in `add.jsx`, `VoiceAskModal` in `books.jsx`

`components/Spinner.jsx`
- Single canonical spinner matching current visual appearance
- Props: `size` (default 20), `color` (default `var(--ink)`)

`components/Toast.jsx`
- `position: absolute` (never fixed), anchored above tab bar
- Props: `message` (string), `visible` (bool), `duration` (default 2400ms)
- Auto-dismisses after `duration`

`components/EyebrowLabel.jsx`
- Wraps the `.eyebrow` CSS class
- Props: `children`, `style` (for margin overrides only)
- Prevents inline recreation of eyebrow styles

**CLAUDE.md amendment required:** Yes. Add the four components to the canonical
component list with their props. Add a rule: "Never re-implement these four
components inline in a screen file." Ship in the same commit.

**Acceptance criteria:**
- [ ] All 4 components exist in `components/`
- [ ] All existing screen files updated to import the canonical versions
- [ ] Zero duplicate implementations remain in `screens/*.jsx` (grep check)
- [ ] `demo/CLAUDE.md` updated with component list and no-reimplementation rule
- [ ] Nik has reviewed and approved the diff

---

## SCAF-7 — Dead code + duplicate CSS sweep

**Issue class:** [BOTH] — dead branches exist today and agents will mimic them.

**What to do:**
1. Identify and remove dead code in `screens/*.jsx` and `components/*.jsx`:
   - Commented-out code blocks
   - Unreachable branches (conditions that can never be true given current state)
   - Imported but unused variables or components
2. Identify and deduplicate CSS in `styles/components.css`:
   - Duplicate selector declarations
   - Overridden properties within the same selector
   - CSS rules for components that no longer exist
3. Document every removal with a one-line comment in the commit message

**Do not remove:**
- Code flagged as "stub" with a TODO — those are intentional placeholders
- Fallback copy in `FALLBACK_COPY` — that is canonical after SCAF-3

**Acceptance criteria:**
- [ ] No commented-out code blocks remain in `screens/*.jsx`
- [ ] No unused imports remain (ESLint `no-unused-vars` passes, or grep
  confirms if lint is not in place)
- [ ] No duplicate CSS selectors in `components.css`
- [ ] All removals listed in the commit message
- [ ] Zero functional change — diff shows only deletions
- [ ] Nik has reviewed and approved the diff

---

## After SCAF-7

Update the status table in `workstream/00-master-prompt.md`, then load
`workstream/02-phase2-audits.md` for the next phase.
