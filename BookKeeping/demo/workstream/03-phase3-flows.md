# Phase 3 — Per-Flow Consolidation (7 flow documents)

*Load this file only after all 6 Phase 2 audits are complete and Nik has
reviewed them.*

---

## Purpose

These flow documents are the primary reference a future AI agent will read
when asked to extend a single flow. They must be self-contained, unambiguous,
and complete enough that a fresh session can build or modify the flow without
asking Nik anything.

Each flow doc is a synthesis of the Phase 2 audit findings for that flow,
pulled into one place and written for a builder — not a reviewer.

---

## How to produce a flow document

1. Read `workstream/00-master-prompt.md` (master context).
2. Read this file.
3. Read all 6 Phase 2 audit files — pull every finding relevant to this flow.
4. Read the screen-brief(s) for this flow from `screen-briefs/`.
5. Read the relevant sections of `demo/CLAUDE.md` and `demo/DESIGN.md`.
6. Write the flow document to
   `BookKeeping/demo/workstream/flows/{flow-name}.md`.
7. Present to Nik for review before marking done.

---

## Rules for every flow document

**Entity-type scoping:** For every rule or decision documented, state whether
it applies to all entity types or is entity-specific. If entity-specific,
list which entities it applies to.

**Two required sections at the bottom of every flow doc:**

```
## Current known issues
[CURRENT]-tagged items from Phase 2 audits that are not yet fixed,
with fix priority (P0 / P1 / P2) and the file to fix.

## Future watch list
[FUTURE]-tagged items that future agents must not regress,
with the pattern to follow instead of the anti-pattern.
```

**Writing style:** Write for a builder who has never seen this codebase.
Define every component, prop, state key, and AI intent referenced. Do not
assume knowledge of `demo/CLAUDE.md` beyond what you quote directly.

---

## Flow 1 — Onboarding

**Output file:** `BookKeeping/demo/workstream/flows/flow-onboarding.md`

**Covers:** Welcome screen → Entity picker → LLC dual-path question →
Industry picker → Payment methods → Expense categories → Check-in time →
Bank connect → Pulling screen

**Must include:**

- Entity picker design and the "not sure" diagnostic path
- LLC dual-path: when to show the single-member vs multi-member question
  and what changes downstream
- All 8 locked onboarding copy strings (from the table in `demo/CLAUDE.md`)
  — state that these are LOCKED and require Nik's sign-off to change
- The settled decision that onboarding uses static `FALLBACK_COPY`, not AI
  calls — and why
- Custom day/time picker grid rules (4-column, `min-width: unset`)
- `persona.firstName` and `persona.business` are empty after onboarding —
  collected later in the thread intro
- The screen transition animation rule
- Entity-specific notes: which entity types see which questions differently

---

## Flow 2 — Thread and card

**Output file:** `BookKeeping/demo/workstream/flows/flow-thread-and-card.md`

**Covers:** Penny thread screen (header, greeting, card queue, ask bar,
first-time intro) + all approval card variants

**Must include:**

- Thread header spec (avatar, online dot, ⋮ menu)
- `thread.greeting` AI intent — context shape and what it receives
- Card queue: how scenarios.json is keyed, fallback behavior
- First-time intro: name → business name collection via the ask bar
  (NOT a separate input field)
- NOW separator pseudo-element spec
- Confirmed slug pattern (paper pill)
- Ask bar: chat bubble icon, `.thread-ask-inner` pill, enter → navigates
  to `#/books`

**All card variants — for each, document:**
- When it renders (trigger condition)
- Entity applicability (all / S-Corp only / LLC only / etc.)
- Visual treatment (background, border, amount color, button colors)
- AI intent called and context shape
- Fallback copy from `constants/copy.js`

| Variant | Entity applicability |
|---|---|
| expense | All |
| income | All |
| income-celebration | All (🎉 only on milestone income) |
| owners-draw | S-Corp and LLC only |
| rule-proposal | All |
| variable-recurring | All |
| cpa-suggestion | All (only when CPA is connected) |
| penny-question | All (4 trigger cases only — see CLAUDE.md) |
| year-access-request | All (only when CPA is connected) |

---

## Flow 3 — Add tab

**Output file:** `BookKeeping/demo/workstream/flows/flow-add.md`

**Covers:** Quick capture (photo / voice / upload / just tell me) +
Connected accounts + Data actions (import / export / connect email)

**Must include:**

- Capture tile layout: hero tile ("Just tell me") + 3-column secondary row
  — and why NOT 4-equal-column
- Photo capture flow: hidden file input → `PhotoOverlay` → stub `ApprovalCard`
- Voice capture flow: `VoiceModal` → "Penny is reading…" → stub `ApprovalCard`
  — 28-bar waveform, auto-stop at 4s
- Upload: opens Import sheet directly
- "Just tell me": textarea → `capture.parse` AI intent → live `ApprovalCard`
- Provider connect multi-step sheet: pick → connecting spinner (1.6s) →
  connected checkmark → state update
- Import multi-step sheet: drag-drop / browse → analyzing spinner (2s) →
  results summary → confirm
- Export: format pick → generating spinner (1.8s) → real Blob download
- Connect email: Gmail + Outlook, neutral badges (no brand colors),
  `emailConnections` state key (separate from `connections`)
- `DataActionRow` must never nest a `<button>` inside it
- State keys: `connections` and `emailConnections`

---

## Flow 4 — My Books

**Output file:** `BookKeeping/demo/workstream/flows/flow-books.md`

**Covers:** Stat cards → Needs a look → Coming up → Explore drill-downs →
Invoice entry point → Ask Penny bar → Tax form preview → CPA suggestion
surfacing

**Must include:**

- Stat card hierarchy: Runway hero (full-width, ink bg) → Net + Books row
  (2-column, NOT 3-equal)
- Needs a look: taps open `ApprovalCard` in a sheet
- Coming up: from `scenario.upcoming`, type icons (tax / invoice / recurring)
- Explore: 4 rows, all stub to "Coming soon" toast — except Tax form preview
- Tax form preview — entity-specific:
  - Sole-prop / LLC single-member → "Schedule C preview"
  - S-Corp → "Form 1120-S preview"
  - LLC multi-member → "Form 1065 preview"
  - Data sourced from `util/irsLookup.js` — `groupByIrsLine`, `formLabelForEntity`
  - Footer disclaimer required: "Preview — CPA review required before filing."
- Invoice entry point: dashed "New invoice" tile, navigates to `#/invoice`
- Ask Penny bar: `books.qa` intent, renders `BooksBubble` inline,
  auto-scrolls to answer. Bar is `flex-shrink: 0` — never `position: fixed`
- CPA suggestion surfacing: when and how `cpa-suggestion` cards appear in
  Needs a look

---

## Flow 5 — Avatar menu

**Output file:** `BookKeeping/demo/workstream/flows/flow-avatar.md`

**Covers:** Full-screen overlay → Profile → Memory → Preferences

**Must include:**

- Entry point: ⋮ in thread header → `#/avatar`. This is NOT a tab.
- Three sub-screens managed by local `sub` state
- Profile: editable fields, entity-change confirm sheet with IRS disclaimer
  copy (must be documented verbatim or sourced from `constants/copy.js`)
- Memory: read-only list, "Forget" removes from local state
- Preferences full list:
  - Check-in time picker (reuses `.checkin-days` / `.checkin-times` grid)
  - Notification toggle: "Real-time" / "Daily digest" (not "Instant"/"Batch")
  - Face ID toggle
  - AI training toggle (default off)
  - IRS line display toggle (`showIrsLines`, default false) — affects cards
  - CPA activity notify (`notifyCpaActivity`) — one of
    "real-time" | "daily-digest" | "off"
- Footer: "Export my data" + "Cancel my account" — both stub to toast
- No AI calls anywhere in this screen

---

## Flow 6 — Invoice designer

**Output file:** `BookKeeping/demo/workstream/flows/flow-invoice.md`

**Covers:** Edit mode → Preview mode → Line items → Tax rate → Payment
methods → Actions (Send / Save / Download / Recurring)

**Must include:**

- Edit/preview toggle in header
- No AI calls — all formatting is deterministic
- `persona.business` pre-populates business name field
- Invoice number: random `INV-XXXX` on mount
- Line items grid: `grid-template-columns: 1fr 56px 72px 28px`
  — `min-width: unset` on remove button
- Tax line only shown in preview if rate > 0
- Payment methods: 8 options, multi-select pills
- All 4 actions stub to toasts
- Entry point: dashed tile in My Books Zone 5 → `#/invoice`
- Back chevron → `#/books`
- Outer div must have `position: relative` for toast anchoring
  (toast is `position: absolute`)

---

## Flow 7 — CPA view

**Output file:** `BookKeeping/demo/workstream/flows/flow-cpa.md`

**Covers:** Invite flow → Auth → Multi-client dashboard → Per-client view
(Work Queue / Books / P&L / Cash Flow / Chat / Learned Rules) →
All 8 build phases → All locked decisions

**Must include:**

- Invite entry points (two): Send-to-CPA sheet in `books.jsx` +
  "Your CPA" row in avatar menu → Profile
- Auth gate: license number + state required before any client data access
- `.cpa-app` positioning wrapper — mirrors `.phone` contract
- `#sheet-root-cpa` portal target — same rules as `#sheet-root` but inside
  `.cpa-app`
- Responsive breakpoints: 375px (mobile) / 768px (sidebar) / 1024px (full
  density)
- Tax readiness score formula (from `implementation/cpa-data-model.md`)
  — entity-aware if applicable
- Work queue priority order (4 levels, stroke-SVG status dots)
- All 4 approval types and their state mutations
- Penny-question trigger cases (exactly 4 — document each)
- Multi-entity handling: how Books, P&L, IRS chips, and tax readiness
  differ across sole-prop / S-Corp / LLC client types
- CPA voice overlay activation: `viewer_role: "cpa"` in context block
  → `cpa-chat.md` appended. Same JSON contract.
- Chat history is CPA-scoped. On revocation: deleted (not archived).
- On revocation: notes, flags, rules, pending-adds → archived to founder.
- Build phase sequence (1–8) with dependencies

---

## After all 7 flow docs

Update the status table in `workstream/00-master-prompt.md`.
The workstream is complete. All three phases done.

Future agents building any new screen or extending any existing flow should
read `workstream/00-master-prompt.md` + the relevant `flows/flow-{name}.md`
as their primary context — not this file.
