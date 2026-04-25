# Screen Brief 09 — CPA View (Responsive Web App)

*Version 1.2 — updated 2026-04-25 (findngs 3.C.1, 3.H.2, 5.H.3, 5.H.4, 5.H.5, 5.L.1, 8.C.1 resolved).*

**Read these files before writing any code, in this order:**

1. `CLAUDE.md` — builder's map (root of the demo)
2. `DESIGN.md` — machine-readable design system
3. `styles/tokens.css` — the CSS source of truth
4. `public/prompts/penny-system.md` — base voice
5. `public/prompts/cpa-chat.md` — CPA voice overlay
6. `implementation/cpa-view-spec.md` v1.1 — full product spec
7. `implementation/cpa-data-model.md` — `state.cpa` schema + mutations
8. This file

No other files needed. Do not edit founder screens unless a step explicitly
says so.

---

## What this screen is

A **responsive web app** for CPAs invited by founder-clients. It is a
distinct product surface at `/cpa` — not a tab inside the founder's
375px phone demo. Mobile-first from 375px; most CPAs will open it on
desktop (1024px+).

---

## Entry point

URL: **`/cpa`** (path route, not hash route). The CPA app is a separate
React entry from the founder demo at `/`. The build emits two HTML files
(`index.html` for founder, `cpa.html` for CPA) or uses a single bundle
with path-based routing — decide in Phase 3.

---

## Settled decisions — do not re-open

See `cpa-view-spec.md` §"Decisions Log" for the full list. Critical ones
for the builder:

- **6 tabs** in the per-client view: Work Queue · Books · P&L · Cash Flow ·
  Chat · Learned Rules. The v1.0 split between Books and Ledger is merged.
- **"Needs a look"** is the canonical name for the founder's review zone.
  "Things to Watch" is retired.
- **Approval card:** new `variant: "cpa-suggestion"` on the existing
  `ApprovalCard` component. Not a new component.
- **Voice:** CPA gets a different overlay (`cpa-chat.md`). Activated by
  `viewer_role: "cpa"` in context. Same JSON contract as founder.
- **Chat on revocation:** deleted, not archived.
- **Positioning:** `.cpa-app` + `#sheet-root-cpa` replaces `.phone` +
  `#sheet-root`. Never `position: fixed`.

---

## Auth gate (Phase 3)

Before any CPA can see client data:

1. Founder sends invite link (generated from the tabbed Send-to-CPA sheet
   in `books.jsx` or from the "Your CPA" row in `avatar-menu.jsx`).
2. CPA clicks link → lands on CPA signup page at `/cpa/accept/:token`.
3. CPA enters: name, email, password, **CPA license number**, **CPA
   license state** (two-letter US code).
4. Validation: email format, license number format regex
   `^[A-Za-z0-9-]{6,12}$` (alphanumeric + hyphens, 6–12 chars),
   license state must be one of the 50 US state codes. Demo does not
   validate against a real license database. Use `ERROR_COPY.fieldLicenseFormat`
   for the inline validation message.
5. On valid submission → `acceptInvite(token, cpaAccountFields)` →
   CPA account created → `clients[clientId]` record created with
   current-year grant → redirected to `/cpa/dashboard`.

Invite link is time-limited (7 days), single-use. Expired / revoked links
show a clear error with "Ask your client to resend." In parallel, the
founder receives a silent notification (per their `notifyCpaActivity`
preference).

---

## Screen 1 — Multi-client Dashboard (`/cpa/dashboard`)

**Layout:** full browser width. Top nav bar (Penny wordmark + CPA account
avatar dropdown). Below: global work queue (above the fold) + client card
grid.

### Global work queue

Spans all clients the CPA has access to. Sorted by priority:

1. **Pending founder approvals** (CPA suggested, waiting) — `var(--error)`
   SVG status dot.
2. **Uncategorized transactions** — `var(--amber)` SVG status dot.
3. **Missing receipts / flagged items** — `var(--ink-3)` SVG status dot.
4. **Penny questions needing CPA input** — `var(--sage)` SVG status dot.

**Priority dots are stroke-SVG status marks, not emoji.** Use an 8×8px
filled circle with `stroke: currentColor`, `stroke-width: 0`, `fill:
currentColor` wrapped in a 12×12 viewBox for alignment.

Each queue item shows: client name, transaction summary, age ("3d"),
quick-action CTA. Tapping navigates to `/cpa/client/:clientId` with the
relevant tab pre-selected.

Below the active queue: collapsible **Resolved** section showing approved +
rejected items with founder notes; auto-archive after 7 days.

### Client cards grid

Below the queue. Each card (CSS grid; `repeat(auto-fill, minmax(280px,
1fr))` at 768px+, single column at 375–767px):

- Client name + entity badge (Sole Prop / LLC / S-Corp / Partnership).
- Tax year selector (scoped to `yearGrants[]`; "Request prior year" link
  below it).
- Tax readiness score: 0–100, visual band — monochrome (90+), amber
  `var(--amber)` (70–89), error `var(--error)` 3px left border (0–69).
- Open items count (badge, `var(--amber)` if > 0).
- Pending approvals count (badge, `var(--error)` if > 0).
- Last activity timestamp.
- "Open" CTA → `/cpa/client/:clientId`.

---

## Screen 2 — Per-client View (`/cpa/client/:clientId`)

**Layout:**
- At 375–767px: mobile single-column. Top header with client name +
  entity. Bottom tab bar (same 6 tabs). Active tab fills content area.
- At 768–1023px: left sidebar (240px) with client nav + content area.
  Sidebar includes "Back to all clients" link, client name + entity badge,
  tax year selector, 6 tab items.
- At 1024px+: same sidebar + content, optional right-side detail pane
  (280px) on Books and Work Queue tabs for the selected transaction.

### Left sidebar nav

- Client name + entity badge
- Tax year selector (years in `yearGrants[]`; "Request prior year" button
  opens a small sheet that calls
  `requestPriorYearAccess(clientId, year, note)`).
  **No-grant empty state:** if `yearGrants[]` is empty, show
  `EMPTY_STATE_COPY.cpaNoYearsGranted` in place of the selector with a
  "Request access" CTA that opens the prior-year request sheet for the
  current calendar year.
- 6 nav items: Work Queue · Books · P&L · Cash Flow · Chat · Learned Rules
- "Back to all clients" link at top

### Tab 1 — Work Queue (default on open)

**Empty states:** active queue empty → `EMPTY_STATE_COPY.cpaWorkQueueEmpty`.
Resolved section empty → `EMPTY_STATE_COPY.cpaResolvedEmpty`.

Same priority sort as global queue, scoped to this client. Each item is
actionable inline:

- **Uncategorized transaction** → category picker (inline, uses
  `industries.json` merged with `DEFAULT_CATEGORIES`).
- **Missing receipt** → "Request from client" button → sends notification
  to founder.
- **Flagged item** → "Resolve" or "Escalate to founder" inline actions.
- **Pending approval** → shows what CPA suggested + waiting indicator.
- **Penny question** → shows Penny's candidates + free-text answer; picking
  an answer writes a learned rule and closes the approval.

Collapsible **Resolved** section below active items (same behavior as
global dashboard).

### Tab 2 — Books

**Empty state:** no transactions for selected year → `EMPTY_STATE_COPY.cpaBooksEmpty`.

Full general ledger. Columns at 1024px+:
`Date · Vendor · Category · IRS Line · Amount · Receipt · Status · Actions`

At 768–1023px: drop IRS Line into a secondary line under Category.
At 375–767px: 2-line card layout — line 1 vendor + amount, line 2 category
+ date + IRS chip. Actions become a ⋯ menu.

- **IRS line chip:** reuse `irsLineChip()` from `util/irsLookup.js`.
  Monospace, `var(--ink-3)`, `var(--fs-tiny)`, uppercase,
  `letter-spacing: var(--ls-chip)`.
- **Receipt status:** `✓` text mark (present) or amber "missing" badge.
- **Status:** clean · flagged · CPA-added · pending-approval.
- **Flagged rows:** `var(--error)` 3px left border.
- **CPA-added rows:** `var(--amber)` "Added by CPA" text badge.
- **Pending approval rows:** `var(--amber)` "Pending" text badge.
- **Actions column (⋯ menu):** Flag · Annotate · Suggest reclassification.
- **"Add transaction"** button top-right → opens add-transaction sheet.
  Fields: date, vendor, amount, category, receipt upload (optional).
  Submit → `addTransactionAsCpa(...)` → pending founder acknowledgment.
- **Filter bar:** date range, category, IRS form, status, year.
- **Export:** PDF + CSV buttons (top right, `.btn-ghost` style).

### Tab 3 — P&L

**Empty state:** no data → `EMPTY_STATE_COPY.cpaProfitLossEmpty`.

Standard income statement grouped by IRS form section (uses
`groupByIrsLine()` from `util/irsLookup.js`). Structure:

```
Revenue
  [category] ........... $X,XXX    Sch C · Line 1
  Total Revenue ........ $XX,XXX

Expenses
  Sch C · Line 8 — Advertising
    [category] ......... $X,XXX
  Sch C · Line 27a — Other expenses
    [category] ......... $X,XXX
  Total Expenses ....... $XX,XXX

Net Income ............. $XX,XXX
```

- Toggle: Monthly / Quarterly / Annual.
- IRS line chips on every line item.
- Footer: "Preview Schedule C / Form 1120-S / Form 1065" link — opens the
  same `TaxFormPreviewSheet` used in founder's `books.jsx`, scoped to the
  client's entity.
- Export: PDF + CSV (`.btn-ghost`).

### Tab 4 — Cash Flow

**Empty state:** no data → `EMPTY_STATE_COPY.cpaCashFlowEmpty`.

Standard cash flow statement, GAAP indirect method:

```
Operating Activities
  Net income ........... $XX,XXX
  Adjustments:
    [item] ............. $(X,XXX)
  Net cash from operations ..... $XX,XXX

Investing Activities
  [item] ............... $(X,XXX)
  Net cash from investing ...... $(X,XXX)

Financing Activities
  [item] ............... $X,XXX
  Net cash from financing ...... $X,XXX

Net change in cash .... $XX,XXX
```

- Toggle: Monthly / Quarterly / Annual.
- Export: PDF + CSV (`.btn-ghost`).
- Cash flow categorization is computed from the ledger — assign each
  ledger entry a `cashFlowBucket` via a small mapping util (to be added as
  `util/cashFlow.js` in Phase 5). Seed mapping: income / expenses =
  operating; equipment purchases = investing; loan payments, owner draws,
  contributions = financing.

### Tab 5 — Chat

Penny chat — denser ledger-style layout, same JSON output contract:

- System context = this client's books only (ledgerSummary, flags,
  learned rules).
- Chat history is CPA-scoped (`clients[clientId].chatHistory`). Founder
  cannot see it.
- Uses `books.qa` intent with `viewer_role: "cpa"` in context — activates
  `cpa-chat.md` overlay automatically.
- Penny can answer: "Show all meals > $200 Q3", "What's Sch C Line 27a
  total?", "Flag all uncategorized items this month".
- Voice: terse, accounting-aware, no celebration emojis, leads with the
  number or answer. See `cpa-chat.md` for tone rules.

### Tab 6 — Learned Rules

Table of all CPA-approved corrections saved for this client:

```
Vendor/Pattern | Original Category | Corrected Category | Date | Suggested by | Actions
AWS*           | Software Sub.     | Cloud Infra.        | Apr 2026 | CPA Name  | Delete
```

- "Delete" sets `active: false` (with confirm dialog) — does not remove
  the row from audit.
- Empty state: "No rules yet. Corrections you approve will appear here."
- Rules are read-only except for deletion.

---

## The approval flow (CPA → Founder)

All four approval types use `state.cpa.approvals[]`. Each renders a card
in founder's Needs a look via `ApprovalCard`:

1. **`reclassification`** — `variant: "cpa-suggestion"`. Shows original
   category, suggested category, CPA's note. CTAs: "Approve" /
   "Keep as is".
2. **`year-access-request`** — shows CPA name, year requested, optional
   note. CTAs: "Grant access" / "Decline".
3. **`cpa-added-txn`** — shows the transaction CPA added. CTAs:
   "Acknowledge" / "Remove".
4. **`penny-question`** (CPA is answering one Penny escalated) — shows
   Penny's question + CPA's answer + reasoning. CTAs: "Apply rule" /
   "Skip".

When the CPA creates any approval, the row in their tab updates to
"Pending founder approval" (`var(--amber)` badge). On approve →
`approveApproval(id)` applies the change + writes learnedRules entry (for
reclassification + penny-question). On reject → `rejectApproval(id,
founderNote?)` preserves original state; CPA sees item in Resolved queue.

---

## CPA access revocation

Founder revokes from `avatar-menu.jsx` → Profile → "Your CPA" row →
"Revoke access" → confirm sheet.

On revoke:
- `revokeCpaAccess(cpaId)` moves `clients[clientId]` metadata into
  `archives[cpaId]` (notes, flags, rules, pending-adds).
- `chatHistory` is **deleted**, not archived.
- Outstanding approvals auto-transition to rejected-by-revocation.
- CPA sees "Access revoked" error on next request.
- Founder can re-issue an invite at any time from the same row.

---

## Design rules

- **No phone frame.** Responsive web layout rooted on `.cpa-app`.
- **Same tokens.** `styles/tokens.css` only. New tokens this view
  introduces: `--fs-data-row`, `--ls-chip` (added in Phase 4).
- **Responsive breakpoints:** 768px (sidebar appears, 2-column), 1024px
  (full density, optional detail pane).
- **Data rows:** `font-size: var(--fs-data-row)`, `--fw-regular`, `--ink`.
- **Column headers:** `var(--fs-eyebrow)`, `--fw-semibold`, `--ink-3`,
  uppercase, `letter-spacing: var(--ls-eyebrow)` — use `.eyebrow--col`
  class (to be added to `components.css` in Phase 4).
- **IRS chips:** reuse `irsLineChip()` from `util/irsLookup.js`.
- **Flagged rows:** `var(--error)` 3px left border. Never a fill.
- **CPA-added rows:** `var(--amber)` "Added by CPA" text badge.
- **Pending approval rows:** `var(--amber)` "Pending" text badge.
- **Priority dots:** stroke-SVG only, never emoji. Colors per the global
  queue section above.
- **No third-party brand colors.** Same rule as founder app.
- **No emoji as icons.** Stroke SVG only. In CPA context, `🎉 👋 💪` are
  **banned** in both UI and voice — `cpa-chat.md` rule 6 enforces the voice
  layer; UI code must not surface them either. `✓` (Unicode text character
  U+2713, not an emoji) is the only permitted mark in CPA context and is
  fine as a logged/confirmed indicator.
- **Export buttons:** use `.btn-ghost` class (to be added to
  `components.css` in Phase 4). Transparent background, `var(--ink)`
  `1.5px` border, `--fw-semibold`, `--r-pill`.
- **Overlays:** all sheets, toasts, portals rooted on `.cpa-app` +
  `#sheet-root-cpa`. Never `position: fixed`. Same `createPortal` pattern
  as the founder app.

---

## AI integration

| Intent | Where used | Prompt files (in order) |
|---|---|---|
| `books.qa` | CPA Chat tab, client-scoped | `penny-system.md` + `books-qa.md` + `cpa-chat.md` |
| `card.approval` | `cpa-suggestion` variant (founder app, Needs a look) | `penny-system.md` + `card-approval.md` + `cpa-chat.md` |

No new intents are added for this feature. The CPA voice overlay
(`cpa-chat.md`) is the only new prompt file. It is appended on top of the
existing intent-specific overlay when:
- `viewer_role: "cpa"` is present in the context block, OR
- `card.approval` is called with `variant: "cpa-suggestion"`.

The `INTENT_MAP` in `worker-client.js` must be updated in Phase 3 to pull
in `cpa-chat.md` when either condition is true. Context block extension:

```js
{
  viewer_role: "cpa" | "founder",
  client: { id, name, entity, industry },   // CPA context only
  cpa:    { name },                         // CPA context only
  ...everything else from the base intent
}
```

---

## What NOT to build in v1

- Sub-users within a CPA firm (multiple CPAs per account).
- Multi-year comparison views (2024 vs 2025 side by side).
- Direct IRS form pre-fill export.
- CPA billing / invoicing to clients.
- CPA-specific Penny voice customization beyond the single `cpa-chat.md`
  overlay.
- Full audit trail of every CPA action.
- Bulk actions in work queue (P1, post-MVP).
- Transaction-level comment threads (annotations are flat in v1).
- Anomaly detection flagging to CPA queue (P1, post-MVP).

---

## Files this feature creates

**New files:**

- `screens/cpa/Dashboard.jsx` — multi-client dashboard (Phase 8)
- `screens/cpa/ClientView.jsx` — per-client shell with tab nav (Phase 5)
- `screens/cpa/WorkQueue.jsx` — Work Queue tab (Phase 5)
- `screens/cpa/Books.jsx` — Books tab with CPA overlays (Phases 5–6)
- `screens/cpa/ProfitLoss.jsx` — P&L tab (Phase 5)
- `screens/cpa/CashFlow.jsx` — Cash Flow tab (Phase 5)
- `screens/cpa/CPAChat.jsx` — Chat tab (Phase 7)
- `screens/cpa/LearnedRules.jsx` — Learned Rules tab (Phase 5)
- `screens/cpa/AuthGate.jsx` — invite accept + license verification (Phase 3)
- `screens/cpa/App.jsx` — `.cpa-app` shell + routing (Phase 4)
- `util/cashFlow.js` — ledger entry → cash flow bucket mapper (Phase 5)
- `util/cpaState.js` — `state.cpa` mutation helpers (Phase 1)
- `public/config/cpa-fixture.json` — seed data for demo (Phase 1)
- `public/prompts/cpa-chat.md` — CPA voice overlay ✅ **already created**
- `implementation/cpa-data-model.md` — data schema ✅ **already created**

**Files modified:**

- `screens/books.jsx` — Send-to-CPA button opens tabbed sheet
  (snapshot / invite). New sub-component `InviteCpaPanel` added to the
  sheet.
- `screens/avatar-menu.jsx` — Profile section gets new "Your CPA" row;
  Preferences gets new `notifyCpaActivity` toggle (Real-time / Daily digest
  / Off).
- `screens/card.jsx` — `ApprovalCard` gets new `variant: "cpa-suggestion"`;
  renders current/suggested category diff + CPA note verbatim.
- `worker-client.js` — `INTENT_MAP` loads `cpa-chat.md` overlay when
  `viewer_role: "cpa"` OR `variant: "cpa-suggestion"`.
- `styles/tokens.css` — add `--fs-data-row` and `--ls-chip`.
- `styles/components.css` — add `.cpa-app` positioning context,
  `#sheet-root-cpa` portal, `.eyebrow--col` column header modifier,
  `.btn-ghost` export button class.
- `App.jsx` (founder app) — extend `DEFAULT_STATE` to include
  `state.cpa = { account: null, invites: [], clients: {}, approvals: {},
  archives: {} }`.

---

## Phase-by-phase build checklist

### Phase 1 — State scaffolding + approval card variant
- [ ] Add `state.cpa` shape to `DEFAULT_STATE` in `App.jsx`
- [ ] Create `util/cpaState.js` with mutation helpers per `cpa-data-model.md`
- [ ] Create `public/config/cpa-fixture.json` with 3–5 seed clients
- [ ] Extend `ApprovalCard` in `screens/card.jsx` with `variant: "cpa-suggestion"`
- [ ] Wire `cpa-suggestion` cards into founder's "Needs a look" in `books.jsx`
- [ ] Unit test: approving a `cpa-suggestion` card writes a learnedRules entry

### Phase 2 — Invite flow
- [ ] Refactor `SendToCPASheet` in `books.jsx` into tabbed sheet
      (Send snapshot / Invite to live books)
- [ ] Add "Invite link" panel with generate/copy/revoke actions
- [ ] Add "Your CPA" row to `avatar-menu.jsx` Profile section
- [ ] Add `notifyCpaActivity` toggle to `avatar-menu.jsx` Preferences
- [ ] Write invite records to `state.cpa.invites[]`
- [ ] Day-7 and day-30 staleness cards surface in founder's Needs a look

### Phase 3 — CPA auth
- [ ] Create `cpa.html` as a **second Vite HTML entry** (`vite.config.js`
      `build.rollupOptions.input`). The CPA app is a separate React root —
      not a hash route inside the founder's `index.html`. Routing within the
      CPA app uses hash-based routes (`#/dashboard`, `#/client/:id`) so it
      works on any static host without server rewrites. (OQ-14 decision.)
- [ ] `screens/cpa/AuthGate.jsx` — invite token validation + license form
- [ ] Update `worker-client.js` `INTENT_MAP` to load `cpa-chat.md` overlay
      when context has `viewer_role: "cpa"` or
      `variant: "cpa-suggestion"`
- [ ] Invite-expired error page + silent founder notification

### Phase 4 — CPA app shell
- [ ] Add `.cpa-app` + `#sheet-root-cpa` to `styles/components.css`
- [ ] Add `--fs-data-row`, `--ls-chip` to `styles/tokens.css`
- [ ] Add `.eyebrow--col` and `.btn-ghost` classes to `styles/components.css`
- [ ] `screens/cpa/App.jsx` — top nav, client-switch, responsive breakpoints
- [ ] Smoke test: shell renders at 375px AND 1280px with tab bar +
      content area

### Phase 5 — Per-client view (5 of 6 tabs)
- [ ] `screens/cpa/ClientView.jsx` — sidebar + content with tab routing
- [ ] `screens/cpa/WorkQueue.jsx` — priority-sorted queue + Resolved section;
      active empty → `EMPTY_STATE_COPY.cpaWorkQueueEmpty`;
      resolved empty → `EMPTY_STATE_COPY.cpaResolvedEmpty`
- [ ] `screens/cpa/Books.jsx` — full ledger with IRS chips + filter bar;
      empty → `EMPTY_STATE_COPY.cpaBooksEmpty`
- [ ] `screens/cpa/ProfitLoss.jsx` — P&L grouped by IRS line;
      empty → `EMPTY_STATE_COPY.cpaProfitLossEmpty`
- [ ] `screens/cpa/CashFlow.jsx` — GAAP indirect-method cash flow;
      empty → `EMPTY_STATE_COPY.cpaCashFlowEmpty`
- [ ] `screens/cpa/LearnedRules.jsx` — rule table with delete;
      empty → `EMPTY_STATE_COPY.cpaLearnedRulesEmpty` (already in copy.js as the
      canonical "No rules yet" string in `EMPTY_STATE_COPY`)
- [ ] Create `util/cashFlow.js` with ledger → bucket mapping
- [ ] Extract `TaxFormPreviewSheet` into `components/TaxFormPreviewSheet.jsx`
      so both `screens/books.jsx` and `screens/cpa/ProfitLoss.jsx` can import
      the same component without duplication
- [ ] Year selector no-grant state: if `yearGrants[]` is empty, render
      `EMPTY_STATE_COPY.cpaNoYearsGranted` + "Request access" CTA
      (calls `requestPriorYearAccess` for current calendar year)
- [ ] **Toast in CPA view:** import `Toast` from `components/Toast.jsx` and
      always pass `bottom={24}` (no tab bar in CPA view). Never use the default
      `bottom={80}` — that value is correct only for the founder phone app above
      the tab bar.

### Phase 6 — CPA overlays on Books
- [ ] Row ⋯ menu with Flag · Annotate · Suggest reclassification
- [ ] Annotation drawer / modal
- [ ] Suggest-reclassification sheet (category picker + note field)
- [ ] Add-transaction sheet with receipt upload
- [ ] Approvals write to `state.cpa.approvals[]` and render in founder's
      Needs a look

### Phase 7 — Chat tab
- [ ] `screens/cpa/CPAChat.jsx` — chat UI with CPA-scoped history
- [ ] Context injection: `viewer_role: "cpa"` + client identity
- [ ] Verify `cpa-chat.md` overlay is active via a manual test: ask
      "Q3 Sch C Line 27a total?" and confirm terse numeric response with
      no 🎉

### Phase 8 — Multi-client dashboard
- [ ] `screens/cpa/Dashboard.jsx` at `/cpa/dashboard`
      (canonical URL: `cpa.html#/dashboard` per OQ-30)
- [ ] **Global work queue** — spans all `state.cpa.clients` the CPA can access.
      Priority sort: (1) pending founder approvals `var(--error)` dot,
      (2) uncategorized `var(--amber)` dot, (3) missing receipts / flagged
      `var(--ink-3)` dot, (4) Penny questions `var(--sage)` dot.
      Each item: client name · transaction summary · age ("3d") · quick-action
      CTA → navigates to `/cpa/client/:clientId` with relevant tab pre-selected.
      Collapsible **Resolved** section below active items; auto-archive after 7d.
      Active queue empty → `EMPTY_STATE_COPY.cpaWorkQueueEmpty`.
      Resolved section empty → `EMPTY_STATE_COPY.cpaResolvedEmpty`.
- [ ] **Client card grid** — CSS grid `repeat(auto-fill, minmax(280px, 1fr))`
      at 768px+; single column at 375–767px. Each card fields (sources):
      - Client name: `clients[clientId].name`
      - Entity badge: `clients[clientId].entity` — render via `formLabelForEntity()`
        short form: "Sole Prop" / "LLC" / "S-Corp" / "Partnership"
      - Tax year selector: years in `clients[clientId].yearGrants[]`
      - Tax readiness score (0–100): `recomputeTaxReadiness(cpa, clientId)`;
        band colors: 90+ monochrome, 70–89 `var(--amber)`, 0–69
        `var(--error)` 3px left border on the card
      - Open items count badge: `var(--amber)` if > 0; computed as
        flagged.length + uncategorized.length + missingReceipts.length
      - Pending approvals count badge: `var(--error)` if > 0; count of
        `approvals` where `clientId` matches and status is `"pending"`
      - Last activity: `clients[clientId].lastActivityAt` formatted as
        relative time ("3d ago", "Just now") via `util/time.js`
      - "Open" CTA → navigate to `/cpa/client/:clientId`
      No clients yet → `EMPTY_STATE_COPY.cpaDashboardEmpty`.
- [ ] **Top nav bar** — Penny wordmark (left) + CPA account avatar dropdown
      (right). Dropdown items: "My account" (stub toast), "Sign out" (clears
      `state.cpa.account` + redirects to auth gate). Dropdown is a small
      absolute-positioned menu anchored on `.cpa-app` — never `position: fixed`.
- [ ] **Responsive layout** — 375–767px: single column, no sidebar.
      768px+: global queue top, client grid below. Full browser width — no
      `.phone` frame.
- [ ] **Tax-readiness band conflict guard** — if a client's computed score
      qualifies for both amber and error bands (impossible by the formula, but
      check edge case of score exactly at 70), amber wins; error only at < 70.
      (OQ-29 locked decision.)
- [ ] Dashboard search: **P1, post-MVP** — omit entirely in v1. Do not add a
      placeholder search bar.

---

## Questions to ask me (Nik) before starting a phase

Before starting any phase, confirm:
- The brief is unambiguous to you.
- You've read `cpa-view-spec.md` and `cpa-data-model.md`.
- The previous phase's tests pass.
- You understand which AI intents and prompt overlays apply.

If any of the above is unclear, stop and ask.

---

*Last updated: 2026-04-24 — v1.1 locked for build.*
