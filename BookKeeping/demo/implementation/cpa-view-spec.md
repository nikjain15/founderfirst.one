# Penny CPA View — Product Specification

**Version:** 1.2
**Date:** 2026-04-25
**Status:** Locked — Ready for build
**Author:** Nik Jain

**Companion docs:**
- `cpa-data-model.md` — canonical `state.cpa` schema + mutation contracts
- `../public/prompts/cpa-chat.md` — CPA voice overlay
- `../screen-briefs/09-cpa-view.md` — screen-level build brief
- `../CLAUDE.md` — builder's map (CPA View section is the digest of this spec)

---

## Changelog

### v1.1 — 2026-04-24 (locked for build)

All 10 flow decisions, voice decision, responsive contract, and data model
locked. Build can begin.

**Changes from v1.0:**
- **Terminology:** "Things to Watch" retired everywhere → "Needs a look"
  (aligned with `books.jsx:1056`).
- **Invite entry point:** tabbed sheet from existing Send-to-CPA in
  `books.jsx` + mirrored "Your CPA" row in avatar menu. Replaces the
  ambiguous "settings or books screen" phrasing in v1.0.
- **Approval card:** new `variant: "cpa-suggestion"` on existing
  `ApprovalCard` (card.jsx). Not a new component.
- **Penny-question escalation:** four trigger cases defined (was: mentioned
  but unsourced in v1.0).
- **Prior-year access:** CPA-initiated request flow added (was: spec line 85
  and line 210 contradicted in v1.0).
- **Chat on revocation:** Option A — chat is **deleted**, not archived
  (resolves v1.0's privacy contradiction).
- **CPA-added staleness:** soft reminders at day 7 and opt-in auto-accept at
  day 30. No hard timeout.
- **Invite-expired:** founder gets a silent notification in parallel.
- **CPA tabs:** merged Ledger + Books → **Books** tab. 6 tabs not 7.
- **Rejection surface:** Resolved section added to CPA work queue.
- **Voice:** **different** for CPA — new overlay prompt `cpa-chat.md`.
  Reverses v1.0 decision #9.
- **Responsive:** mobile-first from 375px. Breakpoints at 768px and 1024px.
- **Data model:** full schema and mutation contracts moved to
  `cpa-data-model.md`.

### v1.0 — 2026-04-24 (draft)

Initial spec. Superseded by v1.1.

---

## Problem Statement

Founders using Penny need to share their books with a CPA for tax filing,
quarterly reviews, and ongoing bookkeeping. Today, there is no structured
way for a CPA to access a client's Penny books — leading to manual exports,
email threads, and reclassification errors that never get learned from. The
cost of not solving this is double work for both parties, filing errors,
and Penny losing its value at the critical tax-preparation moment.

---

## Goals

1. **CPA can independently review and act on a client's books** without
   requiring the founder to be in the loop for every question.
2. **Reduce founder–CPA back-and-forth** by giving CPAs a structured work
   queue and the ability to suggest corrections inline.
3. **Build a per-client learning model** so that CPA corrections
   permanently improve Penny's categorization accuracy for that account.
4. **Make tax filing prep self-serve** — CPA has Books, P&L, and Cash Flow
   in one place, scoped to the years they've worked with that client.
5. **Zero cost barrier for CPAs** — free access drives adoption and makes
   Penny the default collaboration layer between founders and accountants.

---

## Non-Goals (v1)

| Non-Goal | Rationale |
|---|---|
| CPA mobile-only app | Responsive web — mobile-first from 375px, desktop density at 1024px+. One codebase. |
| CPA billing / invoicing to clients | Out of scope — Penny is not an accounting firm platform. |
| Multi-firm CPA account management (sub-users within a firm) | Too complex for v1; design does not block it architecturally. |
| Real-time collaborative editing (Google Docs-style) | Approval-based flow is safer and avoids conflicts; revisit in v2. |
| Audit trail of every CPA action | Nice-to-have for P2; approvals + flags + annotations give us enough for v1. |

---

## User Personas

### Persona A — The Founder (existing Penny user)
- Uses Penny daily for transaction tracking.
- Wants to hand off tax prep to their CPA with minimal effort.
- Needs to approve or reject CPA suggestions without context-switching.
- Does not speak accounting. Sees Penny's plain-English explanations.

### Persona B — The CPA
- Manages 10–50+ clients across different industries.
- Needs to quickly triage what needs attention per client.
- Values IRS line references, clean ledgers, and exportable financials.
- Does not want to chase clients for information — wants Penny to surface it.
- Reads Penny's CPA voice: terse, accounting-aware, data-forward.

---

## User Stories

### Persona A — Founder

- As a founder, I want to invite my CPA to my Penny account via a link so
  that they can access my books without me manually exporting anything.
- As a founder, I want to control what my CPA can see (tax-relevant data
  only, scoped to years they've worked with me) so that I don't expose
  unrelated personal information.
- As a founder, I want to receive a card in "Needs a look" when my CPA
  suggests a reclassification so that I can approve or reject it in one tap
  without interrupting my workflow.
- As a founder, I want to be notified of CPA-added transactions via my
  existing notification preference so that my books stay accurate and I'm
  always aware of changes.
- As a founder, I want approved CPA corrections to be remembered by Penny
  permanently for my account so that the same mistake doesn't happen again.
- As a founder, I want to see a gentle nudge if CPA-added transactions have
  been pending my acknowledgment for a week, and an opt-in to auto-accept
  going forward after a month.

### Persona B — CPA

- As a CPA, I want a multi-client dashboard showing all my Penny clients so
  that I can triage who needs my attention most urgently.
- As a CPA, I want a work queue per client showing pending items in
  priority order so that I always know exactly what to do next.
- As a CPA, I want to view the client's Books, P&L, and Cash Flow Statement
  so that I have everything I need for tax filing in one place.
- As a CPA, I want IRS form line references (Schedule C, 1120-S, 1065)
  surfaced on all financial views so that I can map transactions to the
  correct lines without manual lookup.
- As a CPA, I want to flag, annotate, and suggest reclassifications on any
  transaction so that I can correct errors without needing to call the
  founder.
- As a CPA, I want to chat with Penny scoped to a specific client's books
  so that I can ask data questions ("show all meals > $200 Q3") in a
  terser, more technical voice — without Penny talking to me like a
  founder.
- As a CPA, I want to add or upload transactions on behalf of a client so
  that the books are complete before filing.
- As a CPA, I want to request access to prior tax years when I need them
  so that I can reconcile opening balances — and the founder can approve
  or decline.
- As a CPA, I want to view the "Learned Rules" for each client so that I
  can see what Penny already knows and avoid redundant corrections.
- As a CPA, I want to see what happened to my suggestions in a "Resolved"
  section of my work queue — including founder rejections with their
  notes — so that I'm never left wondering.

---

## Requirements

### P0 — Must Have (v1 cannot ship without these)

#### Auth & Access
- [ ] Founder can generate a CPA invite link from one of two entry points:
      (a) tabbed sheet on the existing "Send to CPA" button in `books.jsx`
      (tab: "Invite to live books"), or (b) "Your CPA" row in
      `avatar-menu.jsx` → Profile.
- [ ] Invite link is time-limited (7 days) and single-use.
- [ ] Expired / revoked links show a clear error page with "Ask your client
      to resend." In parallel, the founder is notified silently per their
      `notifyCpaActivity` preference ("Priya tried to access your books —
      the invite expired. Resend?").
- [ ] CPA creates a free Penny CPA account via invite link. Required
      fields: name, email, password, **CPA license number**, **CPA license
      state**. No credit card.
- [ ] CPA account is scoped to tax-relevant data only — transactions,
      categories, receipts, financial statements, Penny's category notes.
- [ ] CPA can see current tax year by default. Past years require
      founder grant.
- [ ] CPA can request prior-year access via the year selector in the
      per-client sidebar → creates `type: "year-access-request"` approval
      in founder's Needs a look.
- [ ] CPA cannot see founder's chat history, personal notes, or non-tax
      annotations.

#### Multi-Client Dashboard
- [ ] CPA landing screen (`/cpa/dashboard`) shows all clients as cards.
- [ ] Each client card displays: client name, entity type, tax year
      selector (years founder has granted), open items count, pending
      approvals count, last activity timestamp, and tax readiness score
      with visual band (90+ clean / 70–89 amber / 0–69 error).
- [ ] Work queue is above the fold — global across all clients, sorted by
      priority: (1) pending founder approvals, (2) uncategorized
      transactions, (3) missing receipts / flagged items, (4) Penny
      questions needing CPA input.
- [ ] Priority indicators are stroke-SVG status dots using `var(--error)` /
      `var(--amber)` / `var(--ink-3)` / `var(--sage)`. Never emoji.
- [ ] CPA can click any client card to enter the per-client view.

#### Per-Client View — Six Tabs
Per-client view at `/cpa/client/:clientId`. Left sidebar at 768px+; bottom
tab bar at 375–767px. Six tabs:

1. **Work Queue** — default view. Same priority sort as global, scoped to
   this client. Includes collapsible "Resolved" section below active items
   showing approved + rejected items with founder notes; auto-archive
   after 7 days.
2. **Books** — full general ledger with CPA overlays. Merges v1.0's Books
   and Ledger into one tab.
3. **P&L Statement** — income vs. expenses by category, monthly/quarterly/
   annual, grouped by IRS form section.
4. **Cash Flow Statement** — operating / investing / financing; GAAP
   indirect method; net cash change per period.
5. **Chat** — Penny chat scoped to this client's books. Uses `books.qa`
   intent with `viewer_role: "cpa"` in context (activates
   `cpa-chat.md` overlay). CPA-scoped `chatHistory[]`.
6. **Learned Rules** — per-client rule table, editable (delete only).

All financial views filterable by date range, category, tax year, IRS form
type. Exportable as PDF and CSV.

#### Per-Client Books Tab — CPA Overlays
- [ ] CPA can flag any transaction with a reason
      (`needs-receipt`, `reclassify`, `confirm-with-client`) and optional
      note.
- [ ] CPA can annotate any transaction with a free-text note.
- [ ] CPA can suggest a reclassification → creates an approval in founder's
      Needs a look. Row status updates to "Pending founder approval"
      (amber badge).
- [ ] CPA can add a new transaction or upload a receipt on behalf of the
      client → tagged "Added by CPA", requires founder acknowledgment
      before moving from `pendingAdds[]` into the official ledger.
- [ ] Flagged rows: `var(--error)` 3px left border. Never a fill.
- [ ] CPA-added rows: `var(--amber)` "Added by CPA" text badge.
- [ ] Pending approval rows: `var(--amber)` "Pending" text badge.

#### Founder Approval Flow (all approval types)
- [ ] When CPA creates any approval type (reclassification, year-access
      request, CPA-added transaction, Penny-question answer), Penny creates
      a card in the founder's Needs a look.
- [ ] The card renders via `ApprovalCard` with the appropriate variant.
      Reclassifications use `variant: "cpa-suggestion"` and display
      original category, suggested category, CPA's note, and CTAs
      "Approve" / "Keep as is".
- [ ] Founder is notified per `notifyCpaActivity` preference — real-time,
      daily digest, or off.
- [ ] Approve → Penny applies the change + writes a new `learnedRules[]`
      entry.
- [ ] Reject → original state preserved. Founder can add an optional note;
      CPA sees it in the Resolved section of their work queue.

#### Penny-Question Escalations
Penny writes `approvals[].type = "penny-question"` in four cases only:

1. **Low-confidence streak** — same vendor pattern, 3+ repeats at
   confidence < 70% with competing candidates.
2. **Ambiguous IRS routing** — transaction could map to two IRS lines
   (e.g. Section 179 vs depreciation).
3. **Tax-sensitive edge case** — entity conversion mid-year, S-Corp owner
   payroll vs draw, 1099 eligibility threshold, foreign tax credit.
4. **Founder-initiated handoff** — founder tapped "ask my CPA" on any
   flagged card.

Escalation renders in the CPA's work queue priority-4 row. When the CPA
picks an answer, Penny closes the loop with the founder ("Priya confirmed
AWS goes to Cloud Infrastructure going forward — noted.").

#### CPA-Added Transaction Staleness (soft reminders)
- [ ] Day 7: Penny surfaces a gentle re-surface card in founder's Needs a
      look — "Priya added 3 transactions last week. Want to take a look?"
- [ ] Day 30: Once-only opt-in prompt — "Want me to auto-accept additions
      from Priya going forward?" Founder can enable per-CPA.
- [ ] No hard timeout. Items stay pending indefinitely otherwise.

#### Per-Client Chat
- [ ] CPA can open a Penny chat tab scoped to the selected client's books.
- [ ] Penny responds in the CPA voice (see `cpa-chat.md` overlay) — terser,
      accounting-aware, no celebration emojis, leads with the number.
- [ ] CPA chat history is CPA-scoped. Founder cannot see it live.
- [ ] Chat supports data queries, filtering, summarizing, flagging, and
      basic tax questions mapped via `util/irsLookup.js`.

#### Learned Rules
- [ ] Per-client Learned Rules tab shows all CPA-approved corrections
      stored for that client.
- [ ] Each rule shows: vendor/description pattern, original category,
      corrected category, date approved, who suggested it.
- [ ] Penny uses active rules to auto-suggest categories on future similar
      transactions for that client only.
- [ ] CPA can delete a rule (sets `active: false`). Penny does not
      moralize — rule deletion is metadata, not a ledger edit.

#### Revocation
- [ ] Founder can revoke CPA access from the avatar menu → "Your CPA" row.
- [ ] On revocation: CPA loses access immediately. `state.cpa.clients[id]`
      metadata (notes, flags, rules, pending-adds) moves to
      `archives[cpaId]`. **Chat history is deleted**, not archived.
- [ ] Founder can view the archive from the same avatar menu row.
- [ ] Outstanding approvals from this CPA auto-transition to
      rejected-by-revocation.
- [ ] Founder can re-issue an invite to the same or a new CPA at any time.

---

### P1 — Nice to Have (high-priority fast follows)

- [ ] Bulk actions in work queue — CPA can resolve multiple uncategorized
      transactions at once.
- [ ] CPA can leave a comment thread on a specific transaction (not just a
      flat annotation).
- [ ] Penny proactively flags unusual transactions to the CPA's work queue
      (anomaly detection).
- [ ] CPA can export a "Filing Package" — one-click PDF bundle of Books +
      P&L + Cash Flow + categorization summary with IRS lines.
- [ ] CPA dashboard search — search across all clients by name, EIN, or
      open item type.
- [ ] Email digest to CPA — daily or weekly summary of items needing
      attention across all clients.
- [ ] Per-CPA auto-accept toggle for CPA-added transactions (day-30 opt-in
      promotes to this state).

---

### P2 — Future Considerations (design must not block these)

- [ ] Sub-users within a CPA firm (senior CPA + junior associate both
      access same client).
- [ ] Multi-year comparison views (2024 vs 2025 P&L side-by-side).
- [ ] CPA billing integration — CPA invoices client directly from Penny.
- [ ] Direct IRS form pre-fill export (Schedule C auto-populated from
      Penny data).
- [ ] Audit trail — full log of every action taken by CPA on a client.
- [ ] CPA voice customization per-firm or per-CPA (tone presets).

---

## The Learning Loop (detailed)

```
1. CPA reviews transaction in Books tab
2. CPA suggests reclassification (e.g., AWS → Cloud Infrastructure)
3. Penny creates approvals[id] of type "reclassification"
   → Renders as ApprovalCard with variant: "cpa-suggestion" in founder's
     Needs a look
4. Founder receives notification (per notifyCpaActivity preference)
5. Founder taps Approve or Keep as is
6a. APPROVE → Penny reclassifies transaction + writes learnedRules[]:
       {
         pattern: "AWS*",
         fromCategory: "Software Subscriptions",
         toCategory: "Cloud Infrastructure",
         suggestedBy: "cpa",
         approvedBy: "founder",
         approvedAt: timestamp,
         active: true
       }
6b. KEEP AS IS → original category preserved, founder note saved
                 CPA sees item in Resolved queue with the note
7. On future transactions matching the pattern → Penny auto-suggests
   Cloud Infrastructure for this client only
8. CPA can view all rules in Learned Rules tab, and delete any that were
   saved in error (sets active: false)
```

**Key design invariant:** Rules are per-client, never cross-client. A rule
learned for Acme Corp does not apply to Globex Inc, even if both clients
are managed by the same CPA.

---

## IRS Integration

Existing `util/irsLookup.js` maps 60+ category labels to IRS form lines
(Schedule C, Form 1120-S, Form 1065). In the CPA view:

- Every transaction row in the Books tab shows the IRS line reference
  inline (e.g., `Sch C · Line 27a`) — reuse `irsLineChip()`.
- P&L line items group by IRS form section, not just by category (reuse
  `groupByIrsLine()`).
- Cash Flow maps to standard GAAP operating/investing/financing buckets.
- Chat can answer: "What's my Schedule C Line 27a total for Q3?" using the
  lookup.
- Tax-form preview sheet (existing in `books.jsx`) can be surfaced in the
  CPA view's P&L tab footer: "Preview Schedule C / Form 1120-S / Form 1065"
  scoped to the client's entity.

---

## Brand & Design Tokens

CPA view uses the same Penny design system — no separate theme.

**Reused tokens** (see `styles/tokens.css`):

| Token | Value | Usage |
|---|---|---|
| `--ink` | `#0a0a0a` | Primary text, headings |
| `--sage` | `#2B7A78` | Active-tab indicator, "Penny question" priority dot |
| `--paper` | `#f6f6f4` | Page backgrounds, row stripes |
| `--white` | `#ffffff` | Card backgrounds |
| `--income` | `#1A9E6A` | Positive amounts |
| `--error` | `#b2291e` | Flagged 3px left border, 0–69 tax-readiness band |
| `--amber` | `#C97D1A` | Pending approval + Added by CPA badges, 70–89 band |

**New tokens** added for this view:

| Token | Value | Usage |
|---|---|---|
| `--fs-data-row` | `clamp(13px, 1.4vw, 14px)` | Ledger / P&L / Cash Flow data rows |
| `--ls-chip`     | `0.06em`                   | IRS-line chip letter-spacing |

**Responsive breakpoints:**

- `<= 767px`: mobile single-column. Tabs render as bottom tab bar. Sheets
  render as bottom drawers.
- `768–1023px`: tablet two-column. Left sidebar 240px, content flex-fills.
- `>= 1024px`: desktop full density. Optional right-side detail pane on
  Books and Work Queue tabs.

**Typography:** Inter, same scale system. Column headers at
`--fw-semibold`, data rows at `--fw-regular`, IRS chips at monospace.

**Positioning contract:** `.cpa-app` replaces `.phone` as the overlay
context. All sheets, backdrops, and toasts use `position: absolute` rooted
on `.cpa-app`; portal target is `#sheet-root-cpa`. Never `position: fixed`.

---

## Decisions Log

| ID | Question | Decision | Status |
|---|---|---|---|
| OQ-1 | Tax readiness % formula | Weights locked as v1 final: `uncategorized × 3`, `missingReceipts × 2`, `flagged × 4`. Clamped to [0, 100]. Bands: 90+ clean, 70–89 amber, 0–69 error. Not tunable post-v1 without a spec revision. | Locked v1.2 |
| OQ-2 | Prior-year access — automatic or founder-controlled | **Founder-controlled.** CPA gets current year automatically. Prior years require explicit grant via `type: "year-access-request"` approval. | Locked v1.1 |
| OQ-3 | CPA-added transactions — how does founder get notified | New preference `notifyCpaActivity` (`real-time` / `daily-digest` / `off`). Day 7 gentle re-surface; day 30 opt-in for auto-accept. | Locked v1.1 |
| OQ-4 | Does CPA need to verify credentials | **Yes.** CPA license number + state required at signup. No bypass even with valid invite. | Locked v1.1 |
| OQ-5 | What happens when founder revokes CPA access | Action metadata (notes, flags, rules, pending-adds) archived to founder. **Chat history deleted**, not archived, per Option A — preserves CPA privacy contract. | Locked v1.1 |
| OQ-6 | Same voice or separate voice for CPA | **Separate voice.** New overlay `cpa-chat.md`. Same JSON contract, same validator, different tone rules. Activated by `viewer_role: "cpa"`. | Locked v1.1 |
| OQ-7 | Books tab vs Ledger tab — both or one | **One tab: Books.** The v1.0 spec split them; merged in v1.1. Six tabs total. | Locked v1.1 |
| OQ-8 | Zone name — "Things to Watch" or "Needs a look" | **"Needs a look."** Already matches `books.jsx`. "Things to Watch" retired. | Locked v1.1 |
| OQ-9 | Invite entry point — avatar menu or books screen | **Both.** Tabbed sheet on Send-to-CPA + mirrored "Your CPA" row in avatar menu Profile. | Locked v1.1 |
| OQ-10 | Penny-question escalation triggers | Four cases: low-confidence streak (3+ @ <70%), ambiguous IRS routing, tax-sensitive edge case, founder-initiated handoff. | Locked v1.1 |
| OQ-11 | CPA-added transaction timeout | **No hard timeout.** Day 7 gentle re-surface + day 30 opt-in auto-accept. | Locked v1.1 |
| OQ-12 | Invite-expired — who hears about it | Both. CPA sees "ask your client to resend" error; founder gets silent notification per `notifyCpaActivity`. | Locked v1.1 |
| OQ-13 | CPA rejection visibility | Collapsible "Resolved" section in CPA work queue. Rejected items show founder's optional note. Auto-archive after 7 days. | Locked v1.1 |
| OQ-14 | CPA app routing strategy | **`cpa.html` second HTML entry** (not path-based routing). Vite config emits two HTML entry points: `index.html` (founder demo at `#/`) and `cpa.html` (CPA app, path-based within itself using React Router or similar). Hash routing cannot be used for the CPA app because it requires server rewrites that GitHub Pages does not support at arbitrary sub-paths. | Locked v1.2 |
| OQ-15 | `notifyCpaActivity` UI control | **3-segment pill** in Preferences ("Real-time / Daily digest / Off"), replacing the 2-option pill used for the existing general notifications. Sits in its own "CPA notifications" sub-section below the general notifications row. | Locked v1.2 |
| OQ-16 | "Your CPA" row — 3 states | (a) **No CPA:** label "Your CPA", value "None — Invite", tap → invite sheet. (b) **Invite pending:** label "Your CPA", value `"Invite sent to ${cpaEmail}"`, tap → invite sheet with "Resend / Revoke" actions. (c) **Active CPA:** label "Your CPA", value CPA name, tap → CPA detail sheet (name + access date + revoke button). | Locked v1.2 |
| OQ-17 | Founder silent notification channel | When a CPA attempts access with an expired invite, Penny surfaces a `penny-question` type approval in the founder's Needs a look with the copy from `ERROR_COPY.founderInviteExpiredNotice(cpaEmail)`. Does NOT fire a toast (toast is ephemeral; this message must persist until acknowledged). Notification only fires if `notifyCpaActivity !== "off"`. | Locked v1.2 |
| OQ-18 | CPA top nav dropdown items | Logo + "Penny for CPAs" wordmark left-aligned. Right side: CPA name avatar (first initial) → dropdown with: "Account settings" (stub toast), "Sign out" (clears `state.cpa.account` + redirects to `/cpa`), divider, "Switch client" (same as client-switch breadcrumb). | Locked v1.2 |
| OQ-19 | Client-switch affordance | At 768px+: breadcrumb link "← All clients" at top of left sidebar. At 375–767px: "← All clients" in the mobile header row. Both navigate to `/cpa/dashboard`. No dropdown — the breadcrumb is the only switch affordance (the dashboard is one tap away). | Locked v1.2 |
| OQ-20 | Responsive CSS approach | CSS media queries on `.cpa-app` root. Breakpoint variables: `--bp-tablet: 768px`, `--bp-desktop: 1024px`. No container queries in v1. Pattern: mobile styles are the default; tablet/desktop styles use `@media (min-width: var(--bp-tablet))` / `@media (min-width: var(--bp-desktop))`. | Locked v1.2 |
| OQ-21 | Filter bar persistence | Per-tab, session-scoped only (React component state). Filters reset on tab switch and on navigation away. No URL serialisation. No localStorage persistence for filters. | Locked v1.2 |
| OQ-22 | Add-transaction form — auto-computed vs user fields | User-input: `date`, `vendor`, `amount`, `category` (picker), `receipt` (file, optional). Auto-computed by `addTransactionAsCpa()`: `addedBy` (from `state.cpa.account.id`), `addedAt` (timestamp). Do not render auto-computed fields in the form. | Locked v1.2 |
| OQ-23 | Suggest-reclassification category source | Load the client's industry list from `industries.json` merged with `DEFAULT_CATEGORIES` — same source as the founder's category picker in `screens/card.jsx`. Use the `clientData.industry` field from `state.cpa.clients[clientId]` to select the right industry key. Fallback: `DEFAULT_CATEGORIES` if industry has no list. | Locked v1.2 |
| OQ-24 | Receipt upload — demo behavior | Accept any file (`accept="*/*"`). On select: generate a blob URL via `URL.createObjectURL(file)` and store it as `receiptUrl`. No upload to a server. The URL is only valid for the current browser session — on refresh it will 404, which is acceptable for the demo. | Locked v1.2 |
| OQ-25 | Annotation max length and format | Plain text only. Maximum 500 characters. No rich text, no markdown rendering in the annotation note. Validate on submit with a live character counter below the textarea. | Locked v1.2 |
| OQ-26 | Cross-app state sync (founder ↔ CPA in adjacent tabs) | `App.jsx` listens to the `storage` event on `window`. When the `STATE_KEY` localStorage entry changes from another tab, it reads `incoming.cpa` and merges it into `state.cpa` via `setState`. This means CPA approvals, reclassifications, and added transactions become visible to the founder without a refresh. Wired in Phase 1. | Locked v1.2 |
| OQ-27 | CPA chat loading and error states | Loading: render a Penny bubble with `ERROR_COPY.cpaChatThinking` ("Thinking…") while the AI call is in flight. Error / no data: render a Penny bubble with `ERROR_COPY.cpaPennyNoData`. These copy keys live in `constants/copy.js`. | Locked v1.2 |
| OQ-28 | `ledgerSummary` shape for CPA chat context | `{ totalIncome: number, totalExpenses: number, netIncome: number, period: string, topCategories: { category: string, amount: number }[], flaggedCount: number, uncategorizedCount: number }`. Built from the client's scenario data + CPA overlays. Same structure as the founder's `books.qa` context; the `viewer_role: "cpa"` flag in the same object activates the CPA voice overlay. | Locked v1.2 |
| OQ-29 | Tax-readiness band conflict (error border + error approval badge) | Band border takes priority: the 3px `var(--error)` left border on the entire client card signals overall book health. The `var(--error)` pending-approvals count badge is still shown as a separate badge inside the card. The two do not conflict visually because the border is on the card edge and the badge is inside the content area. | Locked v1.2 |
| OQ-30 | Dashboard canonical URL | `/cpa/dashboard` is the primary URL for the multi-client dashboard. After `acceptInvite` succeeds, the CPA is redirected to `/cpa/dashboard`. The bare `/cpa` path redirects to `/cpa/dashboard` or the auth gate if not logged in. | Locked v1.2 |
| OQ-31 | Token-discipline exemptions in CPA view | Same rules as the founder app — raw hex, raw font-weight numbers, raw border-radius numbers, and `position: fixed` are blocked by `scripts/check-tokens.sh`. Exemptions require `// token-exempt: <reason>` or `// radius-literal: <reason>` inline comments. The `.cpa-app` `#sheet-root-cpa` CSS uses `position: fixed` because `.cpa-app` is a full-page scrollable context (unlike `.phone` which has a fixed pixel height) — this is a documented exemption in `styles/components.css`. | Locked v1.2 |

---

## Success Metrics

### Leading Indicators (measure at 30 days post-launch)

| Metric | Target | Method |
|---|---|---|
| CPA invite acceptance rate | >70% of sent invites result in CPA account creation | Funnel analytics on invite → signup flow |
| Work queue engagement | >80% of CPAs who log in interact with work queue within first session | Session event tracking |
| Reclassification suggestion rate | >1 suggestion per CPA per client per month | Event: `cpa_reclassification_suggested` |
| Founder approval rate | >60% of CPA suggestions approved (not rejected or ignored) | Approval card completion rate |
| Prior-year request acceptance | >85% of year-access-requests approved by founder | Approval flow analytics |

### Lagging Indicators (measure at 90 days post-launch)

| Metric | Target | Method |
|---|---|---|
| Learned rules per active client | >3 rules saved per client after 90 days | Rules table count per client |
| CPA retention | >70% of CPAs who onboard return the following month | Monthly active CPA accounts |
| Founder retention lift | Founders with an active CPA connection retain at a higher rate than those without | Cohort comparison |
| Support tickets re: tax filing | 30% reduction in founder support tickets about tax categorization | Support ticket tagging |
| Day-30 auto-accept adoption | >40% of founders who see the prompt enable it | Prompt-response event |

---

## Build Order (Recommended)

Phased per the CLAUDE.md build order. Data-model scaffolding (Phase 1's
`state.cpa` + fixture) is prerequisite for everything else.

| Phase | What | Why |
|---|---|---|
| 1 | `state.cpa` scaffolding + `public/config/cpa-fixture.json` + `variant: "cpa-suggestion"` on `ApprovalCard` wired into founder's Needs a look | Unblocks the approval loop using only founder-side UI |
| 2 | Invite flow — tabbed Send-to-CPA sheet + "Your CPA" row in avatar menu. Writes `state.cpa.invites[]` | Self-contained, testable end-to-end |
| 3 | `/cpa` route + AuthGate (token + license verification + account creation) | Must exist before CPA-facing work is testable |
| 4 | `.cpa-app` shell + portal target + responsive breakpoints + top nav + client-switch | Platform work that unblocks all tabs |
| 5 | Per-client tabs: Work Queue, Books, P&L, Cash Flow, Learned Rules (5 of 6) | Core tax filing value; most data already exists in scenarios |
| 6 | CPA overlays on Books — flag, annotate, suggest reclassification, add transaction | Requires Phase 5 views |
| 7 | Chat tab — `books.qa` with `viewer_role: "cpa"`; `cpa-chat.md` overlay active | Reuses existing chat infrastructure |
| 8 | Multi-client dashboard at `/cpa/dashboard` — global work queue + client cards | Depends on all per-client features being stable |

---

## Timeline Considerations

- No hard external deadline. Recommended phasing: Phases 1–5 as v1 MVP,
  Phases 6–8 as v1.1.
- Phase 1 can start immediately — no new infrastructure.
- Phase 3 (auth) is a dependency for all CPA-facing work — prioritize
  early.
- OQ-5 (chat deletion on revocation) must be implemented in Phase 1's
  `state.cpa` schema; it is not a separate phase.
- Responsive work is per-phase, not a final pass. Every CPA screen must
  render at 375px from the moment it lands.

---

*Source of truth for data shape: `cpa-data-model.md`.*
*Source of truth for voice: `../public/prompts/cpa-chat.md` layered on top
of `../public/prompts/penny-system.md`.*
