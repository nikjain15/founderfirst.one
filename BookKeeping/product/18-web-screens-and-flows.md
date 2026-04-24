# 18 — Web Screens and Flows
*Every web screen, every state, every flow. Self-sufficient for low-fidelity wireframing.*

> **Tab/navigation model change — settled 23 Apr 2026.**
> This document still describes a layout derived from the earlier **four-tab** mobile model. The MVP now ships **three tabs** on mobile (Penny · Add · My Books) with Profile / Memory / Preferences behind an avatar menu. The web app's sidebar navigation should mirror that shape: three primary sections (Penny, Add, Books) plus a smaller Account dropdown for Profile / Memory / Preferences / sign-out. The standalone "Connect" section folds into Add.
>
> The desktop-only surfaces in this doc (CPA share-link, bulk-approve, /tax hub, command palette, /books multi-period grid) are unaffected by the tab change and remain authoritative.
>
> A follow-up revision will finish the propagation before MVP build begins.

**Platform:** Next.js responsive web app. Primary use case: sitting-down review on laptop/desktop. Not a mobile-to-web replica — designed for larger canvases and tasks that benefit from a bigger surface.

**Breakpoints:**
- `sm` ≥ 640px (small tablet / large phone landscape)
- `md` ≥ 768px (tablet)
- `lg` ≥ 1024px (laptop)
- `xl` ≥ 1280px (desktop) — **primary target**

Decisions referenced: D1–D86 from `../spec-brainstorm-decisions.md` v2.2. Engineering references: E1–E43 from `../../engineering/implementation-strategy.md` v2.

**Visual system:** This document uses the Penny app design system — see `../../design/design-system.md` v2.0, which extends the FounderFirst.one marketing-site tokens (`--ink` monochrome palette, Inter typography, solid `p-mark` avatar, pill buttons, asymmetric chat bubbles). Penny app and FounderFirst website are one unified brand. Color, typography, and component primitives in this file refer to those tokens rather than raw hex values.

---

## How to use this document

Identical format to `17-mobile-screens-and-flows.md`: each section specifies purpose, entry, layout, content, interactions, states, exits. Use with the mobile file as companion — screens with mobile parity are marked as such.

---

## Web vs. mobile — design philosophy

**What web does that mobile cannot (or shouldn't try to):**

1. **Bulk operations** — select 20 transactions and recategorize in one go (L.3)
2. **Multi-period comparisons** — 3 months / 6 months / YTD side by side as actual grids (E.2)
3. **Invoice customizer at scale** — full WYSIWYG editor with live preview, not step-by-step
4. **CPA-facing views** — CPA opens share-link on laptop, expects a proper review interface
5. **Export management** — generate, preview, download, queue in background
6. **Search with advanced filters** — date range + amount range + category + source all at once
7. **Full reconciliation views** — bank statement compared to Penny ledger side-by-side

**What web does the same as mobile:**

- Core approval-card interaction (ported, larger canvas)
- Penny conversation thread (right-hand rail in many layouts)
- Add capture (drag-and-drop receipt image, paste from clipboard, file upload)
- Audit-readiness score and cash runway (first-class, top of every review page)

**What web does NOT do (explicitly out of scope at launch):**

- Spreadsheet-style grid editing of raw ledger (we own the ledger; grids reopen questions we've closed)
- Sidebar chat that's ever-present and distracting — Penny is opt-in on the right, collapsible

---

## Global layout primitives

### Shell

- Fixed top app bar (56pt)
- Left nav rail (72pt wide collapsed, 240pt expanded)
- Main content area (fluid, max-width 1400pt centered at xl)
- Optional right-hand Penny rail (360pt wide, toggleable, collapses on md and below)

### Top app bar

- Left: Penny wordmark + `p-mark-sm` avatar (solid `--ink` circle with white "P", 28pt)
- Centre: global search (always-visible search field, 480pt wide, placeholder "Search anything or ask Penny…")
- Right: avatar menu (Alex's initials or photo) + settings gear + status dot (sync indicator)

### Left nav rail (fixed)

Sections, top to bottom:

| Icon | Label | Route |
|---|---|---|
| chat-bubble | Penny | `/penny` — conversation |
| plus-circle | Add | `/add` — capture (full-page) |
| book | My Books | `/books` — reports, P&L, transactions |
| invoice | Invoices | `/invoices` — invoice list + new |
| tax-form | Tax & Export | `/tax` — CPA export, quarterly, 1099 |
| link | Connect | `/connect` — integrations, preferences |

- Collapsed rail shows icons only; expanded shows icons + labels
- Active item: `--ink` fill with white label, rounded-left indicator
- Badges on items only when explicitly opted into real-time notifications (parity with mobile)

### Right-hand Penny rail (toggleable)

- Default collapsed on lg; expanded on xl
- Shows Penny thread in miniature (last ~5 exchanges visible)
- Input dock at bottom
- "Expand to full" chevron top right → takes user to `/penny` page

### Canvas rules

- Background: `--paper` (`#f6f6f4`)
- Card surface: `--white` with 1pt `--line` (`#e8e8e5`) border, 12pt radius
- Spacing: 24pt between sections, 16pt between cards
- Max content width: 1200pt (grid inside this)

---

## Part A — Authentication & first sign-in

### A.1 Landing / sign-in page

**Purpose:** Web is not where Alex onboards for the first time — she starts on mobile. Web sign-in is for: returning users, CPA share-link openers, desktop reviewers.

**Layout:**

1. Full-bleed marketing top strip (thin, 48pt): "New to Penny? Get the iOS app to start."
2. Centered sign-in card (480pt wide):
   - Penny wordmark + avatar
   - "Sign in to Penny"
   - Apple Sign-In button (full-width)
   - Google Sign-In button (full-width)
   - Face ID prompt if device has WebAuthn credential registered
   - "Continue with your invite code" (small link — for CPA share-links)

**States:**
- Standard sign-in
- CPA share-link landing (see B.1)
- MFA prompt (if enabled)
- Account deleted state (shows "This account was deleted [date]. Contact support if this is in error.")

### A.2 First web visit by existing user

**Purpose:** Alex has been using the app on mobile; she opens `penny.com` on her laptop for the first time.

**Flow:**

1. Sign in via Apple / Google (same identity as mobile)
2. Device trust step: "We don't recognize this device. Confirm with Face ID / 6-digit code sent to your mobile app."
3. Landing on `/books` (desktop default is the review surface — not the conversation)

---

## Part B — CPA-facing experience

### B.1 CPA share-link landing (D56, E.8 in mobile doc)

**Purpose:** Alex's CPA clicks the share-link Alex generated. They've never used Penny.

**Layout:**

1. Branded greeting card:
   - "You've been invited to review Alex's books."
   - Penny wordmark
   - Short explainer: "This is a read-only view. You can leave notes. Nothing you do changes Alex's ledger directly — changes come to her as proposals."
2. No sign-up required for CPA — link is self-authenticating with expiry
3. "Open Alex's books →" CTA

### B.2 CPA Penny view (D56)

**Purpose:** What the CPA actually sees after opening the share link.

**Layout:**

1. Top banner (sticky, persistent, amber): "You're reviewing Alex Smith's books · Read-only · Link expires in 7 days"
2. Left nav: restricted set — `Books`, `Reports`, `Notes`, `Download bundle`
3. Main content:
   - Default view = 90-day P&L (same as E.1 in mobile)
   - Drill-downs available to transaction level (read-only)
4. Right rail: "Notes for Alex"
   - CPA writes inline notes, flagged by transaction or general
   - Notes appear in Alex's Penny thread on her next open ("Your CPA Jane left some notes — want to go through them?")
5. If CPA view is granted write-adjacent scope ("CPA Penny view" per D56):
   - On any transaction, CPA can "propose correction" — generates a card in Alex's backlog for her to accept or reject
   - CPA never directly edits the ledger

**Interactions:**
- Same read/drill behaviors as Alex's own My Books
- Add note to transaction → right-rail note appears
- Propose correction (if granted) → opens a small proposal modal with corrected category + reason text
- Download bundle → same CSV + PDF + QBO package Alex could download (D54)

**States:**
- Active share (everything usable)
- Expiring soon (warning in top banner at 24 hours left)
- Expired (read-only freeze, CTA "Request a new link from Alex")
- Revoked (full lockout screen — "Alex revoked this link. Contact her directly.")

### B.3 CPA notes management (Alex's view)

**Purpose:** Alex opens her app and sees her CPA left notes.

**Layout:**

1. Penny thread message: "Jane left 4 notes on your books. Want to go through them?"
2. Inline list of notes on tap:
   - Each note: transaction summary + CPA's comment + action button ("Accept correction", "Reply to Jane", "Dismiss")
3. Accepted corrections append to ledger as events (never overwrite)

---

## Part C — Web Penny thread

### C.1 `/penny` — full conversation page

**Purpose:** Larger canvas for longer reviews, inline Q&A, message search.

**Layout (lg+):**

1. Left: sticky thread timeline (240pt wide) — "Jump to date" scrubber, week dividers
2. Centre: main thread (600pt wide, centered)
3. Right: context rail (320pt wide):
   - Currently hovered/selected transaction's detail
   - Quick actions (approve, edit, split, ask)

**Differences from mobile:**
- Approval cards are wider (640pt) and show the full activity line + richer vendor history
- Keyboard shortcuts: `A` approve, `E` edit, `S` skip/snooze, `/` focus search, `?` show all shortcuts
- Multi-select: `Shift`+click selects range of messages/cards → bulk-approve bar appears at top

### C.2 Bulk-approve mode (web-only)

**Purpose:** Alex has been away 2 weeks, 40 confirmed-pattern items waiting. She wants to approve them all at once.

**Entry:** `Shift`-click or "Select" button in thread header.

**Layout:**

1. Multi-select checkboxes appear next to each approval card
2. Sticky top bar: "`N` selected · Total: `±$X` · [Approve all] [Edit category for all] [Skip all]"
3. On "Approve all": single confirmation modal (the rare case where modal is warranted):
   - Shows summary: counts per category
   - Warning if any card is low-confidence ("3 of these are low-confidence — I recommend reviewing them one at a time")
   - CTA: "Approve the `N-3` high-confidence ones, leave the rest for me to review"

**Rule (D25 hallucination-zero):** Bulk-approve **never** auto-confirms low-confidence items. The UI forces the split.

---

## Part D — Web `/books` (primary desktop surface)

### D.1 Overview

**Purpose:** Desktop default landing for returning users. Rich review surface — the "sit-down Sunday morning" experience.

**Layout (xl, 1280pt+):**

1. Top strip — three large stat cards, equal width:
   - Lead: 90-day net income (D47) — large number + 180-day sparkline
   - Cash runway (D65) — months + scenario adjuster chip
   - Audit-readiness (D68) — score + color band + "Fix 3 things" shortcut
2. Period toggle row (segmented): "90-day" / "6-month" / "YTD" / "Custom" / "Side-by-side" (D48)
3. **P&L table block (600pt tall):**
   - Two columns side by side when "Side-by-side" active (90-day | 6-month)
   - Each column: category rows with amounts, expandable to transaction level
   - Totals row at bottom
4. **Income vs. expenses chart block (400pt tall):**
   - Monthly bars (income green, expenses red) + net line
   - Toggle: Cash vs. Accrual basis (E26)
5. **Top clients / top expense categories — 2-column block**
6. **Outstanding invoices quick view** — list of unpaid with ageing
7. **Connected accounts health strip** — row of account chips, green/amber/red dots, last-synced stamps

### D.2 P&L detail view

**Purpose:** Drill into any line item. Clicking a category row expands inline to transaction list.

**Layout:**

- Expandable rows (accordion style)
- Expanded state: table of transactions (columns: Date, Vendor, Amount, Source, Confidence, Actions)
- Per-row action icons: view detail, edit, split, ask Penny about this
- Right-click context menu (web-only): "Recategorize this and all future", "Mark as personal (exclude)", "Add note"

### D.3 Multi-period comparison grid

**Purpose:** Alex wants to see Jan-Mar vs. Apr-Jun vs. Jul-Sep vs. Oct-Dec for 2025.

**Layout:**

1. Configurable column selector: "Compare `N` periods" (up to 6)
2. Period-picker drawer: Alex picks periods
3. Grid:
   - Categories as rows
   - Periods as columns
   - Cell values with inline delta vs. previous period (arrow + color)
4. Export: "Export this comparison as PDF / CSV"

### D.4 Transaction list (full)

**Purpose:** `/books/transactions` — every transaction, filterable.

**Layout:**

1. Sticky filter bar at top:
   - Date range picker (presets + custom)
   - Category multi-select
   - Source multi-select (bank / stripe / manual / receipt / voice / processor)
   - Amount range (min / max inputs)
   - Status multi-select (approved / pending / needs-review / split)
   - Search field (free text)
2. Sortable table (Date / Vendor / Category / Amount / Source / Status / Actions)
3. Bulk-action bar appears when rows selected: approve, recategorize, split, export, delete-personal

### D.5 Cash runway detail (`/books/runway`)

- Same data as mobile E.2 but with a proper scenario canvas on the right
- Scenario adjuster becomes a full panel: adjust fixed, committed, variable — see live recalc against a 12-month forward projection chart

### D.6 Audit-readiness detail (`/books/audit`)

- Same checklist as mobile E.3, larger canvas
- Each check-line expands to show the specific transactions/items that are missing evidence
- "Fix this batch" shortcut performs the specific flow (e.g. "Attach receipts to these 6 expenses > $75") without leaving the page

---

## Part E — Web invoicing

### E.1 `/invoices` list

**Layout:**

1. Filter tabs: All / Unpaid / Paid / Drafts / Recurring / Payment plans
2. Sortable table: Client / Invoice # / Issued / Due / Amount / Status / Actions
3. Primary CTA top right: "+ New invoice"

### E.2 `/invoices/new` — invoice customizer (D80 pixel-perfect)

**Purpose:** Where web pulls ahead of mobile — WYSIWYG editor on a real canvas.

**Layout (lg+, split screen):**

1. **Left pane (480pt) — editor:**
   - Client section (picker + fields)
   - Line items (editable table rows, drag to reorder, `Tab` to next field)
   - Notes + payment terms
   - Schedule & send controls
   - Recurring / payment-plan toggles (D78, D79)
2. **Right pane (fluid) — live preview:**
   - Full Chromium-rendered PDF preview (E4)
   - Updates live as Alex edits
   - Pan / zoom controls bottom-right
3. **Top toolbar:**
   - Customize visual: logo, colors, fonts, layout — opens a panel on left that replaces editor temporarily
   - Preview on device (mock phone preview)
   - Save draft / Send now / Schedule

**Customize panel:**

- Logo upload (drag-drop or click)
- Brand color: hex picker + palette (stores last 6 used)
- Typography: body font, heading font, size scale
- Layout: header position, footer content, margin/padding
- Templates: 3 starting points — each fully editable, none locked

**Rule (D80):** Every field is editable. No "pro plan only" gating. No shortcuts. Web's job is to make pixel-perfect effortless.

### E.3 Recurring invoice management

- Recurring invoices listed under Recurring tab in E.1
- Each row shows: template name, cadence, next send date, "Send now" button (D78 rule — never auto-send)
- Tap template → opens customizer with recurring schedule editable

### E.4 Payment plans view (D79)

- Per parent invoice, shows sub-invoice schedule as a mini-gantt
- Per sub-invoice: status, amount, due date, reminder history
- "Adjust schedule" button — reshapes remaining sub-invoices

---

## Part F — Web `/tax` — export, quarterly, 1099

### F.1 Tax home

**Layout:**

1. Top banner — contextual:
   - If within 30 days of a quarterly deadline: "Next quarterly tax due [DATE] · Est. `$AMOUNT` owed" (E28 compute)
   - Else: "Next quarterly in `N` weeks" (quieter)
2. Three main cards:
   - "Export for my CPA / DIY tool" → F.2
   - "Quarterly estimated tax" → F.3
   - "1099 vendors" → F.4
3. Sales tax card (if applicable, E29): "I've flagged `N` potentially taxable transactions. Your CPA can review in the export." — detect/flag only, no computation/filing

### F.2 Export flow (web version of mobile E.7)

**Layout (full-width page, 3 columns at xl):**

1. Column 1: Period selection (presets + custom range)
2. Column 2: Format selection (multi-select, same list as mobile: PDF / CSV / QBO / Xero / TurboTax SE / H&R Block SE)
3. Column 3: Delivery (download / email / CPA share link)

Below: live preview of PDF summary (first 2 pages) + transaction count + estimated file sizes.

Bottom: "Generate export" CTA → progress state → download + optional auto-email.

### F.3 Quarterly estimated tax (E28, D70 per entity-type)

**Layout:**

1. Big current-quarter number: "Estimated Q2 2026: `$AMOUNT`"
2. Explainer panel:
   - "Here's how I calculated this" — breakdown rows
   - Entity-type-specific: Sole prop / LLC uses 1040-ES path; S-Corp uses 1120-S + W-2 path (payroll tax is separate, D72)
3. Timeline of past quarters (paid / unpaid / Penny-estimated vs. actual filed)
4. Rule reminder (hard rule 1): "I can't pay this for you — but I'll remind you the day before it's due and explain what the IRS wants."

### F.4 1099 vendors (E27, Track1099)

**Layout:**

1. Vendor list — each vendor Penny has flagged as 1099-eligible:
   - Vendor name, total paid in year, W-9 status (requested / received / missing), 1099-NEC status (not yet / drafted / filed)
2. Per-row actions:
   - "Request W-9" (sends email template Alex can edit)
   - "Upload W-9" (if vendor sent one back)
   - "Review 1099-NEC draft" (Track1099-generated, opens viewer)
   - "File via Track1099" (E27 — handoff, Track1099 does the submission)
3. Year-end bulk action: "File all eligible 1099s"

---

## Part G — Web `/add` — capture on web

### G.1 Web capture entry

**Layout:**

1. Drop zone (full-width, 400pt tall, 1.5pt `--ink` dashed stroke, `--paper` fill, 12pt radius): "Drop receipt images here · or click to browse · or paste from clipboard"
2. OR: "Type a transaction manually" → full form
3. OR: "Record a voice note" (uses WebAudio, produces WAV → sent to Penny for parsing)
4. Side panel: "Recent captures" — last 10, each with status (parsing / approved / needs review)

### G.2 Batch receipt upload

- Alex drops 15 receipts at once
- Each gets its own card in a grid, showing:
  - Thumbnail
  - Parsing state (spinner → parsed → approval card)
  - Inline approval controls once parsed
- Bulk action: "Approve all parsed" (respects D25 — only high-confidence ones are offered in bulk, others forced individual)

---

## Part H — Web `/connect` — integrations & settings

### H.1 Connect home

**Layout:**

1. Left sidebar nav within Connect: Accounts · Preferences · Security · Data & privacy · Subscription · Support
2. Main area adjusts per selection

### H.2 Accounts section

- Connected table: provider / account label / status / last sync / actions
- Add integration row with search + category filters
- Inline status detail: "Why is this amber?" link → explainer

### H.3 Preferences section

Same as mobile F.3 but laid out with more context:
- Notifications (cadence + per-category toggles + quiet hours on a day/week calendar view)
- Entity type (D83) — shows history: "Sole prop until July 2026 → S-Corp from July 2026"
- Accounting basis (E26) cash/accrual toggle
- Default currency (E25) + display conventions (date formats, number formats)

### H.4 Security section

- App lock settings (same as mobile F.4 but with desktop-specific "browser session timeout")
- Device trust list (each device: name, type, last seen, location, "Revoke")
- Active CPA share links with "Revoke" per link
- Active support-access grants (E40) with "Revoke" per grant
- Audit log — full-screen table, 7-year comprehensive (E35), searchable + filterable

### H.5 Data & privacy section

- Export everything CTA (generates ZIP bundle in background, emailed when ready)
- Federated learning opt-in toggle (E10, D38) with long explainer + "What does this share?" collapsible detail
- Delete account flow (E39, D71) — full-screen confirm with export-first step
- Soft-delete status (if 30-day clock is running): "You requested deletion on [DATE]. Hard delete in `N` days. [Restore access]"

### H.6 Subscription section

- Current plan, next renewal, payment method
- Billing history table
- Manage plan (upgrade / downgrade / cancel)
- Cancel flow — one-tap, triggers full export + 90-day read-only retention (D71)

### H.7 Support section

- Discord channel link (E41) — "Open your private support channel in Discord"
- In-app chat (fallback surface if Alex prefers not to use Discord)
- Per-session support access grant UI (E40):
  - Grant new access: scope (read-only / specific records) + duration (1/4/24 hours) + optional note
  - Active grants list with revoke
  - History of all past grants (audit log)

---

## Part I — Web-specific patterns

### I.1 Keyboard shortcuts

Always-available shortcuts (shown via `?`):

| Key | Action |
|---|---|
| `/` | Focus search |
| `g p` | Go to Penny |
| `g b` | Go to My Books |
| `g i` | Go to Invoices |
| `g t` | Go to Tax |
| `g c` | Go to Connect |
| `n` | New (contextual: invoice / capture / transaction) |
| `a` | Approve focused card |
| `e` | Edit focused card |
| `s` | Skip/snooze focused card |
| `Shift`+`A` | Bulk-approve selected |
| `⌘`/`Ctrl` + `K` | Command palette |

### I.2 Command palette

- Opens with `⌘K` / `Ctrl+K`
- Fuzzy search across: actions ("Export for CPA", "New invoice"), records ("Acme Corp", "April"), and navigation
- Recent commands pinned to top

### I.3 Right-click context menus

Available on transactions, invoices, categories:

- "View detail"
- "Edit"
- "Split"
- "Recategorize this and future"
- "Mark as personal (exclude)"
- "Ask Penny about this"
- "Copy link to this"

### I.4 Drag-and-drop

- Drop receipt images on capture page (G.1)
- Drop receipt on a transaction row in `/books` → attach receipt
- Drop CSV on `/connect` (for historical import, D84 fallback path)

### I.5 Responsive collapse

- xl (primary): full 3-pane layout with right Penny rail expanded
- lg: right Penny rail collapses to icon; click expands overlay
- md: left nav collapses to hamburger; right rail gone
- sm: web essentially becomes a mobile-web mirror (limited use case — we steer users to the app)

### I.6 Tables

- Sortable columns (click header)
- Column visibility toggle
- Row density toggle (comfortable / compact)
- Sticky headers when scrolling
- Infinite scroll or paginated at 100 rows per page (Alex choice in preferences)

### I.7 Exports

Every table and chart has an "Export" overflow menu:

- CSV (current view)
- PDF (current view, formatted)
- Copy to clipboard (TSV)

---

## Part J — Offline & error (web)

### J.1 Offline handling

- Web expects connection; losing it shows a gentle persistent banner: "You're offline. Data shown is from your last sync. You can read, but not save."
- No local capture on web (that's what the mobile app is for) — if offline on web, "Add" surfaces are disabled with explainer

### J.2 Sync conflicts

- Rare (event-sourced, append-only) but possible in theory: if the same transaction is edited from mobile and web simultaneously, the later event wins (timestamp-based), both are preserved in history
- Penny surfaces the reconciliation in the thread: "I noticed two edits on [TX] at almost the same time. I kept the later one. Here's both for reference."

### J.3 Error surfaces

- Inline field errors (same as mobile)
- Page-level error banner at top
- Full-page error only for catastrophic (auth lost, session expired)
- Always offer: Retry · Open Discord channel (E41) · Sign out

---

## Part K — CPA view detail expansion (reprise)

This is the single most important web surface that does not exist on mobile. Covered in Part B above.

Key properties to emphasize in wireframes:

- CPA never uses email/password — they use Alex's expiring share-link exclusively
- Top banner is always visible (ambient reminder of scope + expiry)
- All CPA actions are additive (notes, proposed corrections) — never destructive
- Proposed corrections go to Alex for accept/reject (never auto-applied)
- CPA can download the same bundle Alex can — for their own tools
- Revoke is one click from Alex's side, effective immediately

---

## Part L — Embedded experiences

### L.1 Embedded Penny Q&A (for any record page)

On any transaction detail, invoice detail, client detail page:
- Right-hand Penny rail (when expanded) pre-contexts to that record
- "Ask about this [transaction/invoice/client]" input at top
- Penny's answer shows inline with drill-through to detail

### L.2 Notifications surface

A bell icon in top app bar (only lit when user has opted into real-time notifications):
- Dropdown shows last 10 notification events with inline accept/dismiss
- "See all" → `/notifications` page with history

### L.3 Global search results page

When user enters query in top search bar and hits Enter:
- Results grouped by type: Transactions · Invoices · Clients · Categories · Penny conversations
- Each group shows top 5 with "See all `N`" link
- Saved searches (preferences section) surface at top with recency

---

## Part M — Copy rules (same as mobile)

- American English throughout
- Plain English, jargon immediately explained
- Calm, never pushy
- Approved emojis: 🎉 👋 ✓ 💪. Banned: 😊 👍 ✅ ⚠️
- Specific empty states, not generic
- Never "item count" panic framing (D61)

---

## Part N — What's out of scope for web (launch)

- No browser extension (future)
- No offline capture (mobile only, via WatermelonDB — E6)
- No money movement (hard rule, parity with mobile)
- No tax filing (hard rule)
- No raw-grid ledger editing (reopens closed questions)
- No standing Penny-always-listening mode (Penny rail is toggleable on web)
- No paid acquisition surfaces
- No Android parity page at launch (Android is mobile-post-launch)

---

## Part O — Wireframing checklist (web)

Before handing web wireframes to design/eng, verify:

- Every page works at lg (1024pt) and xl (1280pt)
- Left nav rail is collapsible and sticky
- Right Penny rail is toggleable, never blocking
- Every table supports: sort, filter, bulk select, export
- Every destructive action has a 5-second undo toast (not a modal)
- Every approval card has: full C.1 base + bulk-mode checkbox
- CPA share-link view has amber top banner + restricted nav + read-only lock
- CPA note flow round-trips to Alex's thread and her accept/reject UI
- Invoice customizer has live PDF preview + every field editable
- Quarterly tax page has explainer + "I can't pay this for you" rule reminder
- 1099 page uses Track1099 flow, never claims to file directly
- Export flow offers all 6 formats (PDF, CSV, QBO, Xero, TurboTax SE, H&R Block SE)
- Audit-readiness checklist has per-row "Fix this batch" web-efficient shortcuts
- Keyboard shortcuts covered + `?` overlay drawn
- Command palette drawn (`⌘K`)
- Sync-conflict message drawn (J.2)
- Session timeout + Face ID / WebAuthn re-auth drawn
- Device trust page drawn
- Delete-account flow (E39) drawn including 30-day soft-delete state

---

## Appendix — Cross-reference index

### Decision IDs referenced in this file

D1, D25, D32, D38, D42, D47, D48, D52, D54, D56, D57, D61, D65, D67, D68, D70, D71, D72, D74, D75, D76, D78, D79, D80, D81, D83, D84, D86

### Engineering decision IDs referenced

E4, E5, E6, E10, E17, E24, E25, E26, E27, E28, E29, E32, E33, E35, E36, E37, E39, E40, E41, E43

### Related files

- `17-mobile-screens-and-flows.md` — mobile companion
- `../app-spec.md` v1.2 — original screen-level spec (pre-v2.2)
- `../../design/design-system.md` v2.0 — visual system (extends FounderFirst.one tokens: `--ink` palette, Inter, solid `p-mark`, pill buttons, asymmetric bubbles)
- `../../design/wireframes/` — 19 existing screen wireframes (mobile, pre-v2.2)

---

*End of screens-and-flows docs. For rendered designs, see `../../design/wireframes/`. For tracker, see [BUILD-TRACKER.md](BUILD-TRACKER.md).*
