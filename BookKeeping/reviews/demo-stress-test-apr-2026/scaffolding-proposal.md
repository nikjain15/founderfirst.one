# Scaffolding Proposal — Ambiguity Bedrock Fix Pass

**Status:** Draft v1 — awaiting CEO approval to execute.
**Date:** 24 April 2026.
**Author:** Claude (this audit).
**Commissioned by:** Nik (CEO).
**Prerequisite for:** all further stress-test work under the AI-scalability lens, any future AI-built feature in `BookKeeping/demo/`.

---

## Why this exists

The Penny demo v5 codebase is structurally sound and voice-correct, but it contains a handful of places where **the rules in `CLAUDE.md` / `DESIGN.md` disagree with the code, or the code establishes two valid-looking patterns for the same concept.** These are documented in `01-founder-code.md §A`.

If we do not remediate these before the next round of AI-built features, every new session will amplify the drift: an agent reads the repo, finds two patterns, picks one, and by the third feature the codebase has five patterns for the same thing. The demo ships. The CPA view ships. New skills get built on top. The documentation becomes theater.

This proposal is the **single bedrock fix pass** that makes the repo AI-buildable at scale. After this pass, every subsequent AI session can read `CLAUDE.md`, `DESIGN.md`, the referenced constants/components, and produce code that is indistinguishable from what a careful human would produce.

---

## Guiding principles

1. **One pattern per concept.** Sheets, overlays, variants, copy, icons, spinners — each has exactly one canonical implementation. Docs name it. Code imports from it. Violations are impossible by construction (lint-gated) where practical and discouraged loudly (CLAUDE.md + visible comments) where not.
2. **Rules and code agree.** If a rule exists in CLAUDE.md / DESIGN.md, the code never violates it. If the code needs to violate a rule, the rule is amended first — not the other way around.
3. **Source of truth is importable.** Any constant an AI agent might need (variants, entity types, industry keys, IRS line map, default category list, approved emoji set, banned-phrase set) lives in a single importable module. No grepping.
4. **Prose explains the pattern; code enforces it.** CLAUDE.md says *why*. The constant/component/lint rule says *what*.
5. **Every fix is verifiable.** Every work item below has a test or a grep command that confirms the fix is in place.

---

## What this proposal does NOT do

- It does not change any product decision. D1–D86 are untouched.
- It does not change any visible Penny behavior. No copy changes. No flow changes.
- It does not refactor feature code. The 8 runtime bugs (`01-founder-code.md §B`) are **separate work** handled in the normal fix-by-fix workflow, not part of bedrock.
- It does not add TypeScript. The codebase stays `.jsx`. Constants use frozen objects + runtime validation.
- It does not add new dependencies unless absolutely necessary (the lint rule is likely a small custom ESLint plugin or a pre-commit grep).

---

## The work — 7 items, in execution order

Each item has: **Goal · Files touched · Acceptance criteria · AI-scalability payoff.**
Items are numbered `SCAF-1` through `SCAF-7` for traceability.

---

### SCAF-1 — Canonical Sheet + Overlay primitives

**Goal.** One `<Sheet>` component and one `<FullScreenOverlay>` component. Every existing sheet/modal refactors to use them. No screen implements its own sheet again.

**Files touched.**
- New: `demo/components/Sheet.jsx`, `demo/components/FullScreenOverlay.jsx`.
- Updated: `screens/card.jsx` (CategorySheet), `screens/books.jsx` (FlaggedSheet, ComingUpSheet, CpaSheet, InviteSheet, TaxFormPreviewSheet), `screens/add.jsx` (ProviderSheet, ImportSheet, ExportSheet, ConnectEmailSheet, VoiceModal, PhotoOverlay), `screens/avatar-menu.jsx` (EntityConfirmSheet, CheckinTimeSheet), `screens/invoice.jsx` (SendSheet, RecurringSheet).
- Updated: `demo/CLAUDE.md` — rename "Bottom sheet — canonical implementation" section to point at the imports and delete the inline JSX template.

**Acceptance criteria.**
1. `grep -rE "className=\"sheet-backdrop\"" demo/screens` returns 0 hits (every sheet uses the component).
2. `grep -rE "position: fixed" demo/screens` returns 0 hits.
3. Visual smoke test: open every sheet in the demo, confirm identical positioning and animation.
4. A new screen written against `CLAUDE.md` + importing `<Sheet>` renders a correct sheet without touching CSS.

**AI-scalability payoff.** This is the single highest-impact item. Agent asked "add a sheet for X" does one thing: `<Sheet title="X" onClose={fn}>...</Sheet>`.

---

### SCAF-2 — Central variants / keys registry

**Goal.** Every string literal that names a concept (card variants, entity types, industry keys, integration provider keys, approval types, notification modes) lives in one frozen module. Every screen imports from it.

**Files touched.**
- New: `demo/constants/variants.js` exporting:
  - `CARD_VARIANTS` — `{ EXPENSE, INCOME, OWNERS_DRAW, RULE_PROPOSAL, VARIABLE_RECURRING, CPA_SUGGESTION, PENNY_QUESTION, YEAR_ACCESS_REQUEST }`
  - `ENTITY_TYPES` — `{ SOLE_PROP, LLC_SINGLE, LLC_MULTI, S_CORP, PARTNERSHIP }`
  - `INDUSTRY_KEYS` — the 10 industry keys that match `industries.json`
  - `APPROVAL_TYPES` — for `state.cpa.approvals[].type`
  - `NOTIFICATION_MODES` — `{ REAL_TIME, DAILY_DIGEST, OFF }`
  - `isKnownVariant(v)`, `isKnownEntity(e)` helpers.
- Updated: every screen that uses these strings switches to imports.
- Updated: `tests/validator.test.js` — new suite that verifies every variant referenced in `screens/*.jsx` is in `CARD_VARIANTS`.

**Acceptance criteria.**
1. `grep -rE '"income-celebration"|"owners-draw"|"rule-proposal"|"cpa-suggestion"|"variable-recurring"|"penny-question"|"year-access-request"' demo/screens` returns 0 hits (all via import).
2. Unit test passes: every card.variant literal in code is in the enum.
3. New variant added → compile-time discoverable (via the enum export).

**AI-scalability payoff.** Agent asked "add a new card type" reads `constants/variants.js`, sees the full set, knows where to add the new one. No grep required.

---

### SCAF-3 — Penny copy registry

**Goal.** Every static Penny utterance — onboarding, thread intro, approval fallbacks, toast strings, empty states — lives in one place. AI-generated copy comes through `renderPenny()` as today; static fallbacks come from the registry.

**Files touched.**
- New: `demo/constants/copy.js` exporting:
  - `ONBOARDING_COPY` (migrated from `FALLBACK_COPY` in `onboarding.jsx`)
  - `THREAD_INTRO_COPY` (migrated from `thread.jsx:43-50`)
  - `CARD_FALLBACK_COPY` (migrated from `card.jsx:fallbackMsg()`)
  - `EMPTY_STATE_COPY` (Needs-a-look empty, Coming up empty, Chat empty, etc.)
  - `TOAST_COPY` (every toast used in any screen)
- Updated: every screen imports from `copy.js`.
- Updated: `demo/CLAUDE.md` — new "Penny copy registry" section names this as the only legal home for static copy.

**Acceptance criteria.**
1. `grep -rE '"(Hi|Hello|Nice to meet|Let me|I'll watch|Tap 'Invite)' demo/screens` returns 0 hits — all copy via import.
2. Lint rule or grep test in CI: any Penny-tone string (heuristic: ≥4 words, first-person, ends in punctuation) in a screen file fails review.
3. Running the demo end-to-end, no copy changes. This is a zero-visual-diff refactor.

**AI-scalability payoff.** "Polish Penny's tone on X" becomes an edit to one file. An agent asked for the same thing edits one file. Tone consistency is enforced by structure.

---

### SCAF-4 — Token-discipline sweep + enforcement

**Goal.** Zero raw hex in JSX inline styles. Zero raw font-weight numbers. Zero un-commented raw borderRadius. PDF template tokenized via a helper.

**Files touched.**
- Sweep: `screens/invoice.jsx` (PDF template especially), `screens/books.jsx`, `screens/avatar-menu.jsx`, `screens/add.jsx`, `screens/card.jsx`.
- New: `demo/util/pdfTokens.js` — helper that inlines CSS custom properties into an HTML string for `handleDownloadPDF`.
- New: `demo/.eslintrc` (or equivalent) — custom rule rejecting raw hex / font-weight literals / radius literals in JSX inline `style={}` props. OR a pre-commit grep.
- Updated: `demo/CLAUDE.md` design-token-discipline section gets a link to the enforcement.

**Acceptance criteria.**
1. `grep -rE "#[0-9a-fA-F]{3,8}" demo/screens demo/components` returns only intentional exceptions (documented with `// token-exempt:` comment).
2. `grep -rE "fontWeight:\s*[0-9]" demo/screens` returns 0 hits.
3. `grep -rE "borderRadius:\s*[0-9]+(?![a-z])" demo/screens` returns only values accompanied by `// radius-literal:` comments (for documented 8 / 10 exceptions).
4. CI / pre-commit blocks violating PRs.

**AI-scalability payoff.** DESIGN.md becomes actually enforced. Agents writing new screens cannot ship raw hex.

---

### SCAF-5 — Color-zone rule alignment

**Goal.** Every accent color use in shipped code matches the zone rules in `CLAUDE.md`. Where the rules need expansion (e.g. CPA view added 70-89 band usage), the rules are amended in one place.

**Files touched.**
- Updated: `screens/books.jsx:814-833` (tax banner), `:1240-1251` (Books stat pill) — remove amber backgrounds.
- Updated: `demo/CLAUDE.md` color-zone table — make sure it covers CPA view additions (already does, per the 24 Apr log).
- New: `demo/util/colorZones.js` (optional) — constants `ZONE_AMBER_ALLOWED_IN`, `ZONE_INCOME_GREEN_ALLOWED_IN` etc. that components can import to declare intent.

**Acceptance criteria.**
1. No `background: var(--amber)` or `background: var(--income)` outside the documented zones.
2. Manual review: every `--amber` / `--income` / `--error` / `--sage` / `--cat-*` usage in screens justified by the zone table.

**AI-scalability payoff.** Rule and code finally match. New agents can trust the rule.

---

### SCAF-6 — Shared micro-components (VoiceWaveform, Spinner, Toast, EyebrowLabel)

**Goal.** Visual primitives that exist in multiple screens get extracted. No more two-near-identical components.

**Files touched.**
- New: `demo/components/VoiceWaveform.jsx` (consolidates `books.jsx:VoiceAskModal` bars + `add.jsx:VoiceModal` bars, unit choice locked to one).
- New: `demo/components/Spinner.jsx` (replaces the inline spinner JSX scattered across add/books/invoice).
- New: `demo/components/Toast.jsx` (canonical; every screen imports instead of rolling its own `<div className="toast">`).
- New: `demo/components/EyebrowLabel.jsx` OR confirmed usage of `.eyebrow` CSS class everywhere — delete every inline style block that re-creates the eyebrow typography.
- Updated: `demo/CLAUDE.md` component catalog section (new) that lists every shared component an AI agent can rely on.

**Acceptance criteria.**
1. `grep -rE "<svg .*strokeDasharray=\"56\"" demo/screens` returns 0 hits (spinner consolidated).
2. `grep -rE "<div className=\"toast\"" demo/screens` returns 0 hits.
3. `grep -rE "fontSize:\s*11.*letterSpacing.*textTransform.*uppercase" demo/screens` returns 0 hits (`.eyebrow` class or `<EyebrowLabel>` everywhere).

**AI-scalability payoff.** New screen needs a spinner? Imports `<Spinner />`. Needs a toast? Imports `<Toast />`. Needs a voice waveform? Imports `<VoiceWaveform />`. No forking.

---

### SCAF-7 — Dead code + duplicate CSS sweep

**Goal.** Delete what's dead. Merge what's duplicated. Comment what's intentional-but-surprising.

**Files touched.**
- Delete: `STEP_INTENT` + `STEP_CONTEXT_KEY` in `screens/onboarding.jsx:19-39`.
- Delete: first `.sheet-handle` block in `styles/components.css:404-411`.
- Delete: empty `.thread-bubble {}` at `styles/components.css:518-520`.
- Delete: local `@keyframes spin` in `screens/books.jsx:443`.
- Rename: `cpaSheeet` → `cpaSheet` in `screens/books.jsx` (3 locations).
- Fix: `TabBar.jsx:44-62` ARIA — remove `role="tab"`/`role="tablist"` or complete the pattern.

**Acceptance criteria.**
1. `grep -rE "STEP_INTENT|STEP_CONTEXT_KEY|cpaSheeet|thread-bubble\s*{\s*}" demo/` returns 0 hits.
2. `grep -n "\.sheet-handle" demo/styles/components.css` returns 1 line.
3. `grep -rE "@keyframes spin" demo/screens` returns 0 hits.

**AI-scalability payoff.** Clean reading surface. Agents don't burn context on dead code.

---

## Execution sequence + gates

Each item ships as its own commit. Each commit passes all acceptance criteria before the next starts. CEO approves each commit before proceeding.

```
SCAF-1  (Sheet + Overlay primitives)  →  CEO approve  →
SCAF-2  (Variants registry)           →  CEO approve  →
SCAF-3  (Copy registry)               →  CEO approve  →
SCAF-4  (Token-discipline sweep)      →  CEO approve  →
SCAF-5  (Color-zone alignment)        →  CEO approve  →
SCAF-6  (Shared micro-components)     →  CEO approve  →
SCAF-7  (Dead code sweep)             →  CEO approve  →
DONE. Re-run forensic audit under AI-scalability lens.
```

---

## After bedrock: re-run the audits

Once SCAF-1 through SCAF-7 are complete:

1. **Re-audit founder code** (`01-founder-code.md` is regenerated forensically under the AI-scalability lens, not the bug-lens). Expected: vast reduction in Category A; Category B runtime bugs still present but flagged cleanly.
2. **Run audit #2 — prompts + voice layer** — writes to `02-prompts-voice.md`.
3. **Run audit #3 — config + data + IRS taxonomy** — writes to `03-config-data-irs.md`.
4. **Run audit #4 — CPA view spec buildability** — writes to `04-cpa-spec-buildability.md`.
5. **Run audit #5 — end-user walkthrough** — writes to `05-end-user-walkthrough.md`.
6. **Run audit #6 — doc consistency cross-reference** — writes to `06-doc-consistency.md`.
7. **Consolidate into per-flow docs** (`flow-*.md`).
8. **Triage remaining runtime bugs** from `01-founder-code.md §B` — work through one-by-one.

---

## CLAUDE.md amendments (required alongside SCAF-1 through SCAF-7)

The following sections of `demo/CLAUDE.md` must be updated when the bedrock pass ships, so the rules and the code stay aligned:

1. **New section: "Shared components catalog"** — lists `<Sheet>`, `<FullScreenOverlay>`, `<VoiceWaveform>`, `<Spinner>`, `<Toast>`, `<EyebrowLabel>`. Each entry: what it is, where it lives, when to use it, what props it accepts, a copy-paste example. This is the primary file a new AI session will read when asked to add a UI element.
2. **New section: "Constants catalog"** — lists `CARD_VARIANTS`, `ENTITY_TYPES`, `INDUSTRY_KEYS`, `APPROVAL_TYPES`, `NOTIFICATION_MODES`, `ONBOARDING_COPY`, `THREAD_INTRO_COPY`, `CARD_FALLBACK_COPY`, `EMPTY_STATE_COPY`, `TOAST_COPY`. One sentence per constant. Import path. A "how to add a new one" three-line instruction.
3. **Updated: "Design token discipline" section** — reference SCAF-4's enforcement (lint rule or grep). Replace the existing prose with "the lint runs on pre-commit; violations are automatic blockers."
4. **Updated: "Overlay / toast positioning rule"** — delete the inline backdrop-sheet pattern code; point at `<Sheet>` component.
5. **Updated: "Settled decisions"** — add SCAF-1 through SCAF-7 as the 23rd, 24th, … settled decisions so future sessions can see the bedrock is locked.

Draft text for each amendment is NOT in this file — it will be written at the time SCAF-1 ships, because the exact prose depends on the component API we land on.

---

## Acceptance of the scaffolding pass as a whole

Bedrock is complete when:

1. All 7 SCAF items have passing acceptance criteria.
2. `demo/CLAUDE.md` has been amended per the 5 required sections.
3. A fresh Claude Code session, given only the updated `CLAUDE.md` + `DESIGN.md` + `constants/*.js` + `components/*.jsx` (no screens), can produce a new screen in the Penny style that passes all four audit lenses on first read.
4. The re-run forensic audit (`01-founder-code.md` v2) shows Category A reduced to ≤2 items, and those items are either blocked by external dependencies or explicitly deferred by CEO.

Step 3 is the real test. If a fresh session can't produce on-brand code from the scaffolding alone, SCAF-1 through SCAF-7 are incomplete.

---

## Open questions for CEO before execution

1. **Lint enforcement strategy for SCAF-4.** ESLint custom rule, pre-commit grep, or CI check? Pref is pre-commit grep for simplicity unless a broader lint setup is desired.
2. **Copy registry format for SCAF-3.** `.js` frozen object, or `public/copy/*.json` (loaded at runtime like prompts)? JSON is i18n-ready but adds a fetch round-trip; JS is simpler today.
3. **TypeScript question.** Confirmed no for bedrock pass (per "no new deps" principle), but worth flagging that SCAF-2's variants would benefit hugely from TS union types. Revisit after bedrock?
4. **`<Sheet>` API surface.** Should `<Sheet>` accept `children`, a `footer` prop for sticky CTAs, and a `size` prop (`default / tall / full`)? Or start minimal and expand as needed?
5. **Does CLAUDE.md amendment ship as part of SCAF-1's commit, or as its own commit after SCAF-7?** Preference: amend as each SCAF lands, so docs never lag the code.

CEO answers to these lock the bedrock contract. After that, execution is mechanical.
