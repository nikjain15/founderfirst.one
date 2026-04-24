# 17 — Mobile Screens and Flows
*Every mobile screen, every state, every flow. Self-sufficient for low-fidelity wireframing.*

> **Tab model change — settled 23 Apr 2026.**
> This document still describes a **four-tab** layout (Penny · Add · My Books · Connect). The MVP is moving to **three tabs**: Penny · Add · My Books. Connect functionality folds into Add. Profile / Memory / Preferences live behind the avatar menu (reached via ⋮ in the Penny thread header), not a tab.
>
> **Canonical reference** while this doc is being updated: the `BookKeeping/demo/` scaffolding and the three-tab entry in the root `CLAUDE.md` § 4.
>
> **What to treat as authoritative in this file:** every screen's content, copy, layout, and interactions (Parts A–O). **What to re-map:** Part F ("Tab 4: Connect") becomes a section of Part D (Add). Preferences / Memory / Profile move out of Part F into a new "Avatar menu" section. Face ID, data deletion, notification settings, and the connected-accounts list all move with them.
>
> A follow-up revision of this file will finish the propagation before MVP build begins.

**Platform primary:** iOS (React Native / Expo), 375px minimum width. Android follows post-launch at feature parity.

**Visual system:** all colors, typography, and components reference `../../design/design-system.md` v2.0 — the app-level extension of the FounderFirst.one tokens (`--ink`, `--paper`, `--line`, Inter font, pill buttons, solid P-mark avatar, asymmetric chat bubbles). Do not introduce accent colors, dashed avatars, or blue primary — those are retired.

Decisions referenced: D1–D86 from `../spec-brainstorm-decisions.md` v2.2. Engineering references: E1–E43 from `../../engineering/implementation-strategy.md` v2.

---

## How to use this document

This file is designed to be handed to a designer or wireframing tool and produce screens directly. Each section specifies:

- **Purpose** — what the screen is for
- **When Alex sees it** — entry points / triggers
- **Layout** — regions from top to bottom at 375px width
- **Content** — exact copy where locked, placeholder otherwise
- **Interactions** — taps, swipes, long-press, Face ID prompts
- **States** — empty, loading, error, offline, success
- **Exits** — where Alex goes next

Copy shown in quotes is the locked version. Copy shown in brackets `[like this]` is placeholder/dynamic. When a field name is UPPERCASE it's a data binding (e.g. `AMOUNT`, `VENDOR_NAME`).

---

## Global layout primitives

### Canvas

- Width: 375px min, 430px max (iPhone 14 Pro Max)
- Vertical scroll everywhere except inside bottom sheets
- Safe-area padding top and bottom respected
- Background: `--paper` (`#f6f6f4`, warm off-white — from FounderFirst.one tokens)

### Status strip (top of every screen)

- 20pt height
- Contains system status (time, battery, signal)
- No app chrome overlay

### Screen header (below status)

- 56pt height
- Left: back chevron (when deeper than tab root) OR tab label
- Centre: screen title (17pt semibold)
- Right: contextual action (e.g. filter, search) — optional

### Persistent bottom tab bar

- 84pt height including safe area
- 4 equal-width tabs, always visible, always in this order:

| Position | Icon | Label | Purpose |
|---|---|---|---|
| 1 | chat-bubble (ink outline) | Penny | Conversation thread — default landing |
| 2 | plus-in-circle | Add | Opens capture bottom sheet |
| 3 | book-with-bookmark | My Books | Financial review |
| 4 | link-icon | Connect | Integrations + preferences |

- Active tab: `--ink` (`#0a0a0a`, from FounderFirst.one design tokens) icon + label
- Inactive tabs: `#8E8E93` icon + label
- Tab 2 (Add) is a native tab, **not a floating action button** (D57, D73)

### Global elements

- Undo toast — 5 seconds, bottom centre, non-modal (Section 2 rule)
- Offline banner — 28pt strip under header, `#FFF3CD` background, "Offline — your captures will sync when you reconnect."
- Sync indicator — ambient, small dot in header right during active sync
- Face ID re-auth — full-screen overlay when app reopens after 5-minute timeout (E36, user-configurable under Connect → Preferences)

---

## Part A — Onboarding

7 screens in sequence. User can back up one step at a time. No forced forward motion. Alex can quit and resume (state saved per-session).

### A.1 Welcome

**Purpose:** Set the tone. Introduce Penny's identity before anything else.

**Layout (top to bottom):**

1. Full-bleed P-mark avatar (`p-mark-xl` — 96×96 solid `--ink` circle with white "P", centered, 80pt from top)
2. Display headline (28pt semibold, centered): "Hi — I'm Penny."
3. Subhead (17pt regular, `#444`, centered, 2 lines max): "A calm friend for your books. I'll help you keep track without the anxiety."
4. Primary CTA — pill button (full-width, `--ink` fill, `border-radius: 999px`): "Let's get started" — 48pt from bottom
5. Secondary link (14pt, `#666`, centered): "I already have an account" — below CTA

**Interactions:**
- CTA → A.2
- Secondary link → Sign-in flow (Apple ID / Google ID)

**States:** Single state.

### A.2 Entity type (D83)

**Purpose:** Establish tax-entity context upfront because every later system decision depends on it (D72, D83).

**Layout:**

1. Header: "First — how are you set up?"
2. Subhead (15pt, `#444`): "I ask so I can read your books the right way."
3. Four tappable cards, stacked vertically, 72pt each, with chevron right:
   - "Sole proprietor (just me, no LLC)"
   - "Single-member LLC"
   - "S-Corp-elected LLC"
   - "Not sure — help me figure it out"
4. Tiny footer link (13pt `#666`): "I can change this later."

**Interactions:**
- First three → A.3 with `entity_type` saved
- "Not sure" → A.2a diagnostic (3 questions below), saves result

**A.2a Diagnostic (D83 sub-flow):**
Three one-question cards in series:

- Q1: "Do you have an LLC filed with your state?" — Yes / No / I don't know
- Q2 (if Yes to Q1): "Did you file an S-Corp election (Form 2553) with the IRS?" — Yes / No / I don't know
- Q3: "How do you pay yourself from the business?" — Owner's draw / W-2 salary / Both / Just whatever I need

Penny shows a plain-English conclusion: "Sounds like you're a sole proprietor. If that's not right, tap here." Then proceeds to A.3.

**States:** Empty, in-progress (shows answered questions above current), confirmed.

### A.3 How you get paid

**Purpose:** Orient Penny to income channels. Not connecting yet — just understanding.

**Layout:**

1. Header: "How do people usually pay you?"
2. Subhead: "Tap all that apply."
3. Multi-select chips (wrap, 36pt tall each):
   - Stripe · PayPal · Square / Cash App · Venmo · Zelle · Check · Direct deposit · Cash · Other
4. Primary CTA: "Next" (enabled once any chip is selected)

**States:** None selected (CTA disabled) / one or more selected (CTA enabled).

### A.4 Connect your first account

**Purpose:** Earn-trust moment. The only account we insist on is the bank for the business (D5).

**Layout:**

1. Header: "Let's connect your business bank."
2. Subhead (15pt): "I'll only read — I never move money. I never share your data. (That's rule #1 and rule #4.)"
3. Hero visual: bank icon (1.5px `--ink` stroke)
4. Primary CTA: "Connect via Plaid"
5. Secondary CTA (outline): "I'll do this later"

**Interactions:**
- Primary → Plaid Link sheet (OAuth preferred, regular fallback per E17)
- Secondary → A.5 (skipped state saved; Penny nudges gently on day 1 home)

**States:**
- Linking (spinner overlay)
- Link success (inline ✓ confirmation: "Connected — [BANK_NAME] ✓")
- Link error (inline error with retry: "Something went wrong — let's try again")

### A.5 Notification preference

**Purpose:** Set floor. Alex chooses cadence — Penny adapts up/down from here (D42, D86).

**Layout:**

1. Header: "How should I reach out?"
2. Subhead: "Two modes. You can change this any time."
3. Two stacked radio cards, 96pt each:
   - "Real-time — I'll ping you as things happen"
     - Subtitle: "Best if you want to stay on top of every transaction"
   - "Daily digest — one quiet roundup, same time each day"
     - Subtitle: "Best if you want your day uninterrupted" — **this is recommended by default**
4. Time picker (only shows if Daily digest is selected): "What time works best?" default 6:00pm
5. Primary CTA: "Continue"

**Rule:** Language is "Real-time" or "Daily digest" — never "Instant" or "Batch" or British variants (CLAUDE.md §2).

**States:** Real-time selected / Daily digest selected (shows time picker).

### A.6 Penny getting set up

**Purpose:** Bridge screen while Plaid backfill runs (can take 20–90 seconds per E17).

**Layout:**

1. `p-mark-lg` avatar, gentle animation (breathing ring around the P-mark)
2. Headline: "Give me a minute — I'm reading your transactions."
3. Subhead: "I'll surface the ones I'm most confident about first."
4. Live status lines (1 per state, fade-in top to bottom):
   - "Connecting to [BANK_NAME]… ✓"
   - "Pulling 90 days of transactions… ✓"
   - "Matching vendors… ✓"
   - "Finding the clearest one to start with…"
5. No CTA — auto-advances when ready. If it takes >30s, show an inline "This is taking longer than usual — I'll ping you when I'm done" option and background the screen.

**States:** In-progress / stalled / ready-to-advance.

### A.7 First approval card (highest-confidence)

**Purpose:** Deliver the first approved transaction as fast as possible. Selection is **highest-confidence, not most-recent** (D7).

**Layout:** See **Section C — Universal approval card** below. This is the standard card shown in a welcoming context:

- Penny intro line above the card: "I found a clear one to start with."
- Standard approval card
- Helper microcopy below: "This is how I'll usually work — I suggest, you confirm or correct."

**Interactions:**
- Accept → B.1 (Penny tab, fresh thread with this first transaction above the line: "Got it. I'll remember that.")
- Edit → E.1 edit flow → returns to B.1
- Skip → B.1 with a quiet nudge: "No problem. It'll be waiting in your backlog."

**States:** Only one state shown — the single highest-confidence card.

---

## Part B — Tab 1: Penny (home thread)

### B.1 Thread — active state

**Purpose:** Default landing. Alex sees what Penny is working on, what needs a tap, and the mood stays calm.

**Layout:**

1. Header: "Penny" (17pt semibold) — centre. Right: small avatar-tap → Profile shortcut.
2. **Optional status strip** under header (D73 hypothesis — landing surface study active):
   - Three stat cards in a horizontal scroll: `90-day net income` · `Cash runway` · `Audit-readiness score`
   - Each card: label (12pt `#666`) + number (22pt semibold) + mini sparkline (32pt tall, monochrome)
   - Tap any card → jumps to My Books drill-down
3. Thread area (scrollable, newest at bottom):
   - System messages (left-aligned, 13pt `#666`) — "Today · Tuesday" date dividers
   - Penny messages (left-aligned with `p-mark-sm` avatar, white bubble `1px solid --line`, asymmetric radius `18px 18px 18px 4px`, 15pt)
   - Alex messages (right-aligned, `--ink` bubble, white text, asymmetric radius `14px 14px 4px 14px`, 15pt)
   - **Approval cards inline** (full-width card, see Section C)
   - Income celebration cards (see C.4)
4. Input dock (sticky bottom, above tab bar):
   - Text field ("Ask Penny or type to add…", 15pt placeholder)
   - Mic button (36×36, left of text field) — long-press to record (D6 voice capture)
   - Send button (right, appears when text typed)

**Rule:** Max 3 visible items at once on first load — no clutter (CLAUDE.md §5). Scroll for more.

**Interactions:**
- Tap approval card → expands inline if collapsed; else no-op (card's own CTAs drive action)
- Swipe right on any message → message details (timestamp, source, edit history)
- Long-press any Penny message → "Copy", "Correct Penny" (opens feedback flow)
- Pull to refresh → forces sync
- Tap any stat card at top → My Books drill-down

**States:**
- Empty (new user, post-onboarding) — see B.2
- Active (most common) — see layout above
- Loading more (pagination spinner when scrolling up)
- Offline — banner at top, thread still readable, captures queued

### B.2 Thread — empty state (new user)

**Purpose:** First visit to Penny tab after onboarding. No transactions yet.

**Layout:**

1. `p-mark-xl` avatar (96×96), centered
2. Headline (20pt): "I'm listening."
3. Subhead (15pt `#444`, 2-line max, centered): "As money moves, I'll catalogue it and bring the interesting ones to you."
4. Status line below: "Next: I'm watching for your first transaction."
5. No CTA. Input dock still present — Alex can type a question or tap mic.

### B.3 Thread — shame-free re-entry (D61, Q-R1)

**Purpose:** Alex opens the app after a gap (5, 14, or 30 days). Never lead with backlog count.

**Rule (D61):** Never open with "You have 47 items waiting." Always lead with a human moment.

**Layout differences from B.1:**

- Penny message at top of thread when app reopens after gap:
  - 5-day gap: "Hey — welcome back. Take your time."
  - 14-day gap: "Good to see you. I kept things tidy while you were out."
  - 30-day gap: "Welcome back. Nothing's on fire. I'll walk you through what's changed whenever you're ready."
- No item counts. No red badges on thread entry. (Badges allowed only on Tab 2 Add icon and only when Alex has explicitly opted into real-time notifications.)
- First action surfaced is the **most interesting one** (largest income, weirdest expense), not the oldest.

Variants 3–4 per gap-length to be produced by Head of Design per Q-R1.

### B.4 Thread — growing state

**Purpose:** Week 2+ user. Thread is getting long.

**Layout differences from B.1:**

- "Jump to today" floating chip (pill, `--ink` fill, `border-radius: 999px`, 32pt tall) appears when scrolled up >2 screens
- Inline "Week of [DATE]" dividers (13pt `#666`, centered) every 7 days
- Search icon in header right: opens natural-language search sheet (D50)

### B.5 Financial Q&A inline (D51)

**Purpose:** Alex asks "how am I doing this month?" right in the thread.

**Flow:**

1. Alex types question in input dock
2. Penny responds with a message bubble containing:
   - Short answer (1–2 sentences): "You're up $4,200 in April so far — about $900 ahead of March at this point."
   - Inline mini-card: three small stats (this month, last month, delta)
   - CTA chip: "See the full picture →" (tap → My Books filtered to this month)
3. If Penny doesn't have enough data (D25 hallucination-zero): "I don't have enough clean data for April yet — want to approve the last few transactions so I can?" with inline shortcut to backlog.

---

## Part C — Universal approval card

Used in Penny thread (B.1, A.7), in backlog digest, and in retroactive-correction views. One card format, many variants.

### C.1 Base card — expense, high confidence

**Layout (288pt tall, full-width inside 16pt margins):**

1. Top row (44pt): `SOURCE_ICON` (18×18) + `SOURCE_LABEL` (13pt `#666`) + timestamp (13pt `#666` right)
   - Sources (D76): `RECEIPT` · `VOICE` · `MANUAL` · bank name · processor (Stripe/PayPal/Square/Venmo/Zelle/Cash App) · `PENNY` (Penny-inferred, e.g. variable recurring confirmation)
2. Main body (140pt):
   - Vendor name (20pt semibold): `VENDOR_NORMALISED`
   - Raw vendor line (13pt `#999`): "as `VENDOR_RAW`" (only if different)
   - Amount (28pt semibold) with direction indicator: `- $AMOUNT` (red `#D32F2F`) or `+ $AMOUNT` (green `#2E7D32`)
   - Date (14pt `#444`): "Mon, Apr 14"
3. Category row (44pt):
   - Category chip (pill, 32pt tall, 1.5px `--ink` outline, `border-radius: 999px`): `CATEGORY_SUGGESTED`
   - Subtle right chevron
4. Confidence hint (D22, visible + language + reasoning — no raw score):
   - Plain-English micro-sentence (13pt `#666`, italic): "I recognize this — it's where you've bought software before."
5. CTA row (56pt, full-width):
   - Primary (full-width pill, `--ink` fill, white text): "Looks right ✓"
   - Secondary link below: "Edit" (`--ink` text, underlined on press) + "Not sure — ask me later"

**Interactions:**
- Tap "Looks right" → card collapses to confirmed slug ("Confirmed — [VENDOR] · [CATEGORY]"), 5-second undo toast appears bottom
- Tap category chip → category picker sheet (C.5)
- Tap "Edit" → edit modal (E.1)
- Tap "Not sure" → card moves to backlog, Penny says "No problem — I'll hold onto this until you're ready."

### C.2 Low-confidence variant

**Rule (D25):** Penny never fabricates a category when she has no signal. She asks.

**Layout differences:**

- Category row shows a 1.5px `--ink` dashed-outline chip (`border: 1.5px dashed var(--ink)`, pill-shaped) labeled "Help me categorize this" — dashed outline is the one place we use dashes, to signal "not yet answered"
- Confidence hint becomes: "I don't recognize [VENDOR] yet — can you help me?"
- Primary CTA changes to: "Pick a category" (opens C.5 picker sheet)
- Secondary: "Skip for now"

### C.3 Income variant (D32 asymmetry)

**Rule:** Income is **never** auto-confirmed. Every income event requires explicit tap.

**Layout differences:**

- Amount is `+ $AMOUNT` in green
- Primary CTA: "Confirm this is [CLIENT_INFERRED]" or "This is income — confirm"
- Source line often shows `Stripe` · `PayPal` · `Venmo` etc.
- Penny adds a line: "Client match: [CLIENT_INFERRED] — is that right?" with edit chevron
- After confirm, triggers C.4 (celebration)

### C.4 Income celebration card (D46)

**Purpose:** Emotional reward for income approval. Proportional to frequency — first of the month is bigger; fifteenth is a soft nod.

**Layout:**

1. Full-width 🎉 glyph (approved emoji per CLAUDE.md §2) with `--ink` micro-dots (FF.one `.conf-dot` pattern) radiating from it
2. Centered text (20pt): "Nice — `+$AMOUNT` from `CLIENT`."
3. Secondary text (14pt `#444`): "That's `X` this month. Last month was `Y`."
4. Close (X top right)
5. No CTAs — information only

**Rule:** Never shown for recurring micro-payments (e.g. Stripe subscription dribs). Only on meaningful-size income events (threshold: >$100 or >20% of monthly average, whichever is lower — tuning in AI eval 05).

### C.5 Category picker sheet

**Purpose:** When Alex edits a category or picks from scratch.

**Layout (bottom sheet, 70% screen height, drag to dismiss):**

1. Sheet handle (top centre, 4pt × 32pt grey bar)
2. Title: "What category fits?"
3. Search field (16pt): "Search categories…"
4. "Recently used" row (horizontal chip scroll, Alex's last 5 categories)
5. Category list (scrollable):
   - IRS Schedule C / 1120-S categories (flat list, sorted by relevance from Penny's guess)
   - Each row: icon (16×16, 1.5px `--ink` stroke) + label (16pt) + chevron (for subcategories where applicable)
6. "Split this transaction" button at bottom — opens C.6

### C.6 Split transaction flow (D31)

**Purpose:** Alex buys at Costco — some is groceries (personal, ignore), some is business supplies.

**Layout (full screen modal):**

1. Header: "Split [VENDOR] · `$AMOUNT`"
2. Editable split rows (each row: amount field + category chip + delete X):
   - Pre-filled with "1 row, full amount, original category"
   - Alex taps "+ Add split" to add another row
3. Live remainder indicator at bottom: "`$AMOUNT_REMAINING` unassigned"
4. "Save split" CTA (disabled until remainder = $0)
5. Format toggle (D31): "As total + splits" / "As list of separate transactions" — Alex's preferred format is remembered

### C.7 Variable recurring card (D76)

**Purpose:** Utility bill, phone bill, SaaS subscription — known recurring vendor but amount varies.

**Layout differences:**

- Activity line always visible (small inline chart, 48pt tall, last 6 months of this vendor's amounts as bars)
- If current amount is within 2× anomaly threshold: standard "Looks right" (auto-confirm allowed since it's an expense, per D32)
- If outside threshold: confidence hint reads "This is higher than usual — want to double-check?" and primary CTA becomes "Review this"

### C.8 Rule proposal card (D39)

**Purpose:** After Alex confirms the same vendor-category pairing 3 times, Penny proposes a persistent rule.

**Layout:**

1. Penny avatar + message bubble above card: "I'm noticing a pattern — can I remember this?"
2. Rule card:
   - "When `VENDOR` shows up, categorize as `CATEGORY`."
   - Toggle: "Also apply retroactively to past `N` transactions?" (off by default)
   - Primary CTA: "Yes, remember this"
   - Secondary: "Just this once"
   - Tertiary link: "Only for amounts under $X" (advanced, opens tuner)

### C.9 S-Corp owner's-draw card (D72)

**Purpose:** Alex is an S-Corp and transfers money from business to personal account. That's a distribution / draw, **not** payroll.

**Layout differences:**

- Source: `[BANK_NAME]` with outbound-to-personal indicator
- Category pre-filled as "Owner's Draw (distribution)"
- Penny message above: "Looks like you moved $X from business to personal — I'll log it as an owner's draw, not payroll. For payroll I'll look at your Gusto/OnPay feed."
- Link below card: "Why this matters →" (opens micro-explainer: draws vs. salary vs. distributions in plain English)

### C.10 Confirmed slug (post-tap)

**Purpose:** After Alex taps "Looks right", the card collapses.

**Layout:**

- 44pt slim row, light grey `#F7F7F7` background
- ✓ icon + "`VENDOR` · `CATEGORY` · `$AMOUNT`" + timestamp right
- 5-second undo toast at bottom: "Confirmed. [Undo]" — disappears after 5s, no auto-undo

---

## Part D — Tab 2: Add (capture)

### D.1 Add bottom sheet (entry)

**Purpose:** One-tap capture from anywhere. Opens from Tab 2 or from header "+" in any screen.

**Layout (bottom sheet, 40% screen height):**

1. Sheet handle
2. Three large cards (stacked vertically, 88pt each):
   - "📷 Photo of a receipt" (D6)
   - "🎤 Voice — tell me about it"
   - "✍️ Type — add by hand"
3. Dismiss chevron top right

**Rule:** Use the three bullet icons as placeholder — replace with 1.5px `--ink` stroke icons in final design.

### D.2 Photo capture (D6)

**Purpose:** Alex points camera at a receipt.

**Layout (full screen):**

1. Native camera viewfinder
2. Top overlay: close X + torch toggle
3. Bottom overlay: shutter (72pt), plus "Attach from library" icon left
4. After capture:
   - Photo preview (top half)
   - Penny parsing indicator: "Reading your receipt…" (E5 Claude Sonnet OCR)
   - Bottom sheet slides up with parsed approval card (C.1 variant, SOURCE = RECEIPT)
   - If OCR low-confidence on any field (amount, date, vendor): that field shows inline "Help me read this — what was the amount?" inline edit (D75 active follow-up loop)

### D.3 Voice capture

**Purpose:** Alex says "I just paid $35 cash for parking at the client site."

**Layout (full screen):**

1. Big mic icon (72×72) centered, pulsing ring when recording
2. Live transcription below (20pt, appears as Alex speaks)
3. Stop button (bottom)
4. After stop:
   - Penny parses → approval card (SOURCE = VOICE)
   - Fields Penny extracted shown confirmed; fields she didn't get shown as inline prompts

### D.4 Manual type

**Purpose:** Alex knows the details and wants to skip camera/voice.

**Layout (full screen modal):**

1. Form fields (progressive, one at a time):
   - Amount (large numeric keypad)
   - Direction (expense / income toggle)
   - Date (default today)
   - Vendor / who paid you (text, autocompletes from learned vendors)
   - Category (opens C.5 picker)
   - Optional: note (expandable)
2. Save CTA → produces approval card (SOURCE = MANUAL, confidence-high by construction since Alex entered it)

### D.5 Proactive cash prompt (D14)

**Purpose:** Penny notices Alex recently withdrew cash. Nudges to ask "what was the $200 for?"

**Triggered context:** Not an Add screen per se — appears as a Penny message with an inline mini-card in the thread, offering Add shortcuts.

---

## Part E — Tab 3: My Books

### E.1 My Books home (D47, D65, D68)

**Purpose:** Primary review surface. Lead number is **90-day trailing net income** (D47). Cash runway and audit-readiness are first-class (D65, D68).

**Layout (scrollable, top to bottom):**

1. Header: "My Books"
2. **Lead stat card** (120pt, full-width, 1.5px `--ink` outline, `border-radius: 16px`):
   - Label (13pt `#666`): "90-day net income"
   - Value (36pt semibold): `± $AMOUNT`
   - Trend delta (14pt): "↑ $1,200 vs. prior 90"
   - Tiny mini-chart underneath (32pt)
3. **Two stat cards side by side** (88pt each, 50/50 split):
   - Cash runway (D65): "`X` months at current burn" (tap → detail)
   - Audit-readiness score (D68): "`X` of 100" with color band (green/amber/red) (tap → detail)
4. **P&L period toggle** (segmented control 28pt tall): "90-day" (selected) / "6-month" / "YTD" / "Custom"
   - D48: default view is 90-day + 6-month shown side-by-side as two columns in one row when "side-by-side" mode is on (toggle in top right: "Side-by-side")
5. **Income vs. expenses stacked bar chart** (horizontal, 80pt tall):
   - Green income bar, red expense bar, net line
6. **Top income row** ("This is where your money is coming from"):
   - Top 3 clients with amounts, chevron right to drill
7. **Top expenses row** ("This is where it's going"):
   - Top 3 expense categories with amounts
8. **Outstanding invoices section** (if any):
   - Count + total ("3 unpaid · $4,200")
   - Next-due inline row
9. **CPA export pill** at bottom: "Export for my CPA →" → E.7

**Interactions:**
- Tap any stat card → drill-down screen
- Tap a client / category row → filtered transaction list
- Pull to refresh → forces reconciliation (E32 hourly background job)

### E.2 Cash runway detail (D65, E24)

**Purpose:** Alex wants to know "how long can I coast?"

**Layout:**

1. Header: "Cash runway"
2. Current state at top: "`X` months at current burn"
3. Explanation block (D65 scope — fixed + committed subscriptions + trailing 90-day average variable):
   - "Here's how I calculated this:"
   - Breakdown rows: "Fixed monthly costs: $X" / "Committed subscriptions: $Y" / "Trailing 90-day variable avg: $Z"
   - Denominator: "Current cash across all connected accounts: $N"
4. Scenario adjuster (optional, D65):
   - Slider: "What if I cut variable spend by X%?"
   - Live recalc of runway
5. Small disclaimer (13pt `#666`): "This is an estimate based on your patterns. Real life varies."

### E.3 Audit-readiness detail (D68)

**Purpose:** Alex sees her compliance score and what's missing.

**Layout:**

1. Header: "Audit-readiness"
2. Big score (72pt): `X of 100` with color band
3. Explanation: "A tax professional could pick up your books tomorrow with no cleanup needed" (if high) / "Here's what would need cleanup first:" (if lower)
4. Checklist of categories (each row has a tick, dash, or cross):
   - Receipts attached for expenses > $75 (IRS audit threshold)
   - Mileage logs for vehicle expenses
   - Client-matching for income
   - Quarterly tax status
   - 1099 vendor readiness (if applicable)
   - Entity-type-specific (payroll logged, draws categorized — D72)
5. Per-row: "Fix this" inline action → targeted flow

**Rule (D68):** Never a red nag. Tone is calm — "here's what would tighten this up", not "you're failing."

### E.4 Transaction list view (filtered)

**Purpose:** Drill into a client, category, period, or search result.

**Layout:**

1. Header: filter breadcrumb ("Client: Acme Corp · April")
2. Filter chips row (horizontal scroll): "Category" · "Date range" · "Amount range" · "Source" · "Status"
3. List of transactions (each row 72pt):
   - Date · Vendor/Client · Category chip · Amount (colored) · status icon
4. Tap row → transaction detail (E.5)
5. Bottom bar: "`N` transactions · Total: `±$X`"

### E.5 Transaction detail + edit flow (E1, IRS-aligned append-only audit trail)

**Purpose:** Alex wants to fix a transaction. Never destructive — always append-only (Principle: financial data is never overwritten, never hard-deleted).

**Layout:**

1. Header: transaction summary (vendor, amount, date)
2. **Editable field list** (not all fields are editable — see app-spec v1.2 table):
   - Category (editable)
   - Note (editable)
   - Split (editable via C.6)
   - Bank-sourced core fields (amount, date, counterparty) — read-only, shown with lock icon and "From [BANK]"
   - Self-captured fields (fully editable)
3. **Edit history** section at bottom:
   - Every prior state shown with timestamp + who (Alex/Penny/import)
4. Save CTA (if edits made) → append new event to ledger

### E.6 Search (D50)

**Purpose:** Alex searches "Figma" or "March income."

**Two search surfaces:**

- **Keyword search** — lives in My Books header (magnifying glass). Matches vendor, category, note, amount.
- **Natural-language search** — lives in Penny thread (D50, Postgres full-text + `pg_trgm` per E28). Example: "how much did I spend on software in March?" — Penny answers inline with Q&A pattern (B.5).

**Layout (keyword search sheet in My Books):**

1. Full-screen modal, search field focused
2. Recent searches below if no query
3. Live results: transactions + suggested filters ("Show all software category?")

### E.7 CPA export flow (D54, D55, D56)

**Purpose:** Alex prepares to hand off to her CPA or DIY tool.

**Entry:** "Export for my CPA →" from My Books home.

**Layout (full-screen flow, 3 steps):**

**Step 1 — Pick period:**
- "Tax year 2025" · "Q1 2026" · "Custom range"

**Step 2 — Pick format (D54):**
- Multi-select checkbox list:
  - PDF summary (Schedule C / 1120-S based on entity type)
  - CSV — all transactions
  - QuickBooks-compatible (QBO format)
  - Xero-compatible
  - TurboTax Self-Employed import format
  - H&R Block Self-Employed import format

**Step 3 — Pick delivery:**
- Email to me · Share via CPA link (D56) · Download to device

**Generating screen:**
- Progress indicator, "Preparing your export…"
- If blocked on missing data: "I need a category on these 4 transactions before I can finish this" with inline backlog

**Result screen:**
- Download button + preview of PDF summary
- "Share with CPA via expiring link →" → E.8

### E.8 CPA share-link flow (D56)

**Purpose:** Generate read-only, expiring link for CPA.

**Layout:**

1. Header: "Share with your CPA"
2. Settings:
   - Expiry (default 14 days, options 7/14/30/90)
   - Access scope: "Read-only books" (default) / "Read + let them add notes" (D56 CPA Penny view)
3. CPA email (optional, for audit trail)
4. Generate CTA → produces link
5. Post-generate screen: link shown + copy button + QR code + "Revoke access" button always visible
6. Back in Connect → "Active CPA links" section shows live shares and their remaining time

---

## Part F — Tab 4: Connect

### F.1 Connect home

**Purpose:** All integrations + preferences + account management.

**Layout (scrollable):**

1. Header: "Connect"
2. **Connected** section:
   - Each row: provider name + account label + status dot (green/amber/red) + last-synced timestamp + chevron
   - Long-press → disconnect with confirmation
3. **Add** section:
   - Primary "+ Add an account" CTA → F.2
   - Quick-add rows (e.g. Plaid bank, Stripe, PayPal, Square, Venmo, Zelle, Gmail for receipts, payroll provider)
4. **Preferences** section:
   - Notifications (opens F.3)
   - App lock (Face ID / passcode toggle + timeout — E36)
   - Accounting basis: Cash ↔ Accrual toggle (E26)
   - Default currency + display conventions (E25)
   - Entity type (D83) — editable, last-set date shown
   - Data & privacy (opens F.5)
5. **Account** section:
   - Email / Apple ID / Google sign-in
   - Subscription status
   - Discord channel (E41) — "Open my support channel" CTA
   - Sign out
   - Delete my account (E39) — opens F.6

### F.2 Add integration flow

**Purpose:** Connect Stripe, PayPal, Venmo (partner-gated), Zelle (bank-routed), Gmail, etc.

**Layout (per integration, similar):**

1. Provider logo + short purpose line ("Stripe is where your client payments land. I'll read them — never send.")
2. OAuth handshake (provider sheet)
3. Mapping step (if needed, e.g. Stripe accounts to Penny business)
4. Confirm screen: "Connected — I'll start reading your [PROVIDER] events now."

**Per-provider nuance:**
- Venmo — redirects to PayPal partner application path, shows "partnership in review" if API not yet approved (Section 15 scope)
- Zelle — two-step: "This reads from your bank feed plus I learn per-sender. You'll see a card the first time someone pays you."
- Gmail / Outlook — OAuth with scope preview (read-only, receipt-signal-only). D74, GC-reviewed copy.

### F.3 Notifications preferences

**Layout:**

1. Two-mode radio: Real-time / Daily digest (same as A.5)
2. Time picker (if Daily digest)
3. Quiet hours (always on): start / end times (default 9pm–8am)
4. Per-category toggles:
   - Approval nudges
   - Income celebrations
   - Weekly compliance review (D67 — batched, always Sunday 6pm default)
   - Quarterly tax reminders (E28)
   - Anomaly flags (D75, D76)
5. "Turn all off" safety option — shows explainer: "If off, I'll keep working but won't nudge. You'll see everything in your backlog when you next open the app."

### F.4 App lock & device security (D82, E36, E37)

**Layout:**

1. Face ID toggle (on by default)
2. Timeout (default 5 min, options 1/5/15/never-inactivity — E36 user-configurable)
3. Remote wipe: "Sign out all devices" + "Wipe this device's local data"
4. Device trust list: each device Alex has signed in on, with "Last seen" + "Remove"
5. MDM-compatible badge (for Alex who works with sensitive client data)

### F.5 Data & privacy

**Layout:**

1. "Your data is yours" block (non-negotiable rule 5):
   - Export all my data CTA (CSV + QBO + PDF bundle)
   - Visual timeline: soft-delete at 30 days → hard-delete + certificate
2. Federated learning opt-in (E10, D38):
   - Off by default
   - Toggle with long explainer: "I learn from patterns across users without ever seeing who did what. You can opt in to help Penny get smarter. You can turn it off any time and your contributions stop."
   - GC-reviewed copy (launch-blocking gap #6)
3. Support access grant (E40):
   - "Give Penny Support temporary access" CTA with per-session scope picker (duration 1/4/24 hours, scope read-only / specific records)
   - Log of past grants
4. Audit log preview (7-year comprehensive — E35):
   - Last 50 sensitive actions, each with timestamp + action + result

### F.6 Delete account flow (E39, D71)

**Purpose:** One-tap cancel. No dark patterns.

**Layout:**

1. Full-screen, single CTA: "Export my data and delete my account"
2. Confirm step shows what happens:
   - Immediate full export download (CSV + QBO + Xero + PDF + receipts bundle)
   - 30 days in read-only mode — Alex can restore by signing in
   - Day 30: hard delete + signed certificate emailed
3. Final confirmation (Face ID required)
4. Post-delete: certificate shown on screen + emailed; tab navigation disabled; "Restore access" link for 30 days

---

## Part G — Invoice creation

### G.1 Invoice home

**Entry:** from My Books → "Invoices" tab OR from Penny thread by asking "send an invoice."

**Layout:**

1. Header: "Invoices"
2. Filter strip: "Unpaid" · "Paid" · "Drafts" · "Recurring" (each with count)
3. List of invoices: client name + invoice # + amount + status chip + due date
4. Primary CTA floating: "+ New invoice"

### G.2 New invoice — pixel-perfect customizer (D80)

**Purpose:** Alex expects her invoices to look exactly like her brand. No shortcuts (D80).

**Layout (multi-step, full screen):**

**Step 1 — Who and what:**
- Client picker (autocomplete, or "+ Add client")
- Line items (each row: description + qty + rate + line total)
- Notes + payment terms

**Step 2 — Customize:**
- Logo upload + position
- Brand color picker
- Font picker (system fonts + common professional fonts)
- Header layout (3 template starting points, each fully editable)
- Footer: payment instructions, ACH details, Stripe pay-link toggle, late fee language
- Live preview on right half of screen (if landscape) or toggle (portrait)

**Step 3 — Schedule & send:**
- Send now / Schedule for date
- Payment plan? (D79) — if yes, set number of sub-invoices + dates
- Recurring? (D78) — if yes, set cadence. **Rule: never auto-send. Alex taps to send each recurrence.**
- Reminder cadence (D52) — default, custom, or off

**Generated preview:**
- Chromium-rendered PDF preview (E4)
- "Looks great" / "Edit again"

### G.3 Invoice sent confirmation

**Layout:**

1. Checkmark animation
2. "Sent to [CLIENT]"
3. Payment link (tap to copy)
4. "Go back to Penny" + "Create another"

### G.4 Invoice reminders (D52)

**Entry:** from invoice detail OR automatic based on schedule.

**Layout:**

- Reminder thread per invoice (shows sent reminders + payment activity)
- "Send another reminder now" — Penny drafts the reminder in Alex's learned tone (D52 — learnable Alex-specific voice)
- Alex reviews draft, edits if needed, taps send

### G.5 Payment plans (D79)

**Purpose:** Alex offers a client 3 monthly payments of $2k instead of one $6k invoice.

**Layout (Step 2 in G.2):**

1. Toggle: "Payment plan"
2. If on: number of instalments, amount per instalment, date for each
3. Schedule preview shows the `N` sub-invoices Penny will create
4. CTA: "Create payment plan"

**Post-create:**
- Parent invoice shows "Payment plan · 3 of 3 sent" + status of each sub-invoice inline

---

## Part H — S-Corp flows (D72)

### H.1 Payroll surface

**Purpose:** Alex is an S-Corp. Her W-2 salary pays herself. Penny reads payroll via Gusto / OnPay / QBO Payroll.

**Entry:** in My Books as a "Payroll" section row below Top Expenses.

**Layout:**

1. Payroll period summary (current pay period + next run)
2. Per-employee row: "Alex Smith — gross $X, net $Y, taxes $Z" (for solopreneur, usually just Alex)
3. Tap row → payroll detail (source, breakdown, link to payroll provider)

**Rule:** Penny **never runs payroll**. She reads it. Running payroll happens in Gusto / OnPay / QBO Payroll directly.

### H.2 Owner's-draw vs. payroll card

See C.9 above.

### H.3 Mid-year S-Corp election narration (D72 extension)

**Purpose:** Alex elected S-Corp in July. Penny needs to gracefully handle the transition — first half sole-prop income, second half S-Corp income.

**Layout (one-time conversational flow in Penny thread):**

1. Penny opens: "I noticed you filed S-Corp election effective [DATE]. Here's how I'll handle this…"
2. Explainer card (expandable):
   - Jan–Jun: treated as sole-prop (Schedule C)
   - Jul–Dec: treated as S-Corp (1120-S)
   - Income and expenses prior to election remain as they were; new ones follow S-Corp rules
3. Action prompt: "Want me to re-run your 2025 categorization to reflect this?" → yes / no
4. "Tell me more" link → micro-explainer (plain English, no CPA jargon)

### H.4 1120-S export

In E.7 format step, the PDF summary changes from Schedule C to 1120-S-mapped when entity type is S-Corp.

---

## Part I — Backlog & compliance

### I.1 Backlog surface

**Purpose:** Transactions waiting on Alex. Accessible from Penny thread (Tab 1) via header kebab, or from My Books sidebar.

**Rule (D61, D67):** Never show item counts at the thread entry. Backlog is a separate surface with calm framing.

**Layout:**

1. Header: "Your queue"
2. Quiet framing line: "No rush. Tackle these when you're ready."
3. Grouped list (by age — "From this week" / "From last week" / "Older"):
   - Each group shows count inline ("This week · 4")
   - Expandable
4. Per-row: compact approval card (tap expands to full C.1)

### I.2 Weekly compliance batch (D67)

**Purpose:** One quiet Sunday 6pm roundup (default, configurable in F.3). Never per-transaction nag.

**Layout:**

- Penny message in thread Sunday evening:
  - "Quick weekly check-in: here's what came up this week." [See details →]
- Tap → compliance view (one screen):
  - Stats for the week (income/expenses)
  - Items needing action (batched)
  - Estimated quarterly tax position (E28)
  - Any 1099 candidates (E27)
  - Audit-readiness delta from last week

---

## Part J — Offline & error states

### J.1 Offline banner (D81, E6)

- 28pt strip under header, `#FFF3CD` background
- Copy: "Offline — your captures will sync when you reconnect."
- Add tab still works (captures queued locally via WatermelonDB per E6)
- Penny thread readable from cache; new Penny messages deferred until sync

### J.2 Field-level error states

- Inline error below field, 13pt `#D32F2F`: "That's not a valid amount — try again?"
- Never a modal for field errors

### J.3 System error states

- Full-screen only for blocking errors (auth failure, catastrophic sync)
- `p-mark-lg` avatar, plain-English copy: "Something's off on my end. I'm trying again. If it keeps happening, ping me in Discord."
- CTA: "Retry" + "Open my Discord channel" (E41)

### J.4 Loading states

- Skeleton rows (grey rectangles matching layout) for lists
- Breathing ring for Penny-is-thinking in thread
- Progress bar at top for foreground sync operations (>500ms expected)

### J.5 Empty states

Every list or drill-down has a calm empty state:
- My Books with no connected accounts yet: "Once we're connected, this is where the picture lives. Tap Connect to get started."
- Invoices with none: "When you send your first invoice, it'll show up here. Want to send one now?"
- Backlog empty: "You're all caught up. Nice."

---

## Part K — Discord support surface (E41)

### K.1 Support entry

From Connect → Account → "Open my support channel". Also from error screens "Ping me in Discord".

**Layout:**

1. Deep-link opens Discord app OR in-app chat (fallback)
2. First visit: Penny-bot message explaining: "This is your private channel. I'm here 24/7 — Claude-powered. Anything I can't handle, a human on our team picks up."
3. Message history persists
4. Any attachments (receipts, screenshots) handled securely

---

## Part L — Global patterns

### L.1 Undo toast

- Appears bottom-centre after any destructive or category-setting action
- 5 seconds visible, non-modal
- Two lines max: primary action text + "Undo" link
- Example: "Confirmed. [Undo]"

### L.2 Confirmation modals — avoid

Modals only for:
- Account delete
- Sign out all devices
- Revoke CPA share link

Never for everyday actions (edits, approvals, category changes). Use toast + undo.

### L.3 Navigation rules

- Tap a tab while already on it → scroll to top; tap again → refresh
- Deep links in Penny messages open in-context (not in external browser)
- Back chevron always takes Alex one step back, never clears state

### L.4 Face ID re-auth (E36)

- Triggers after configurable timeout (default 5 min) in any foreground state
- Full-screen overlay with `p-mark-lg` avatar + "Quick check — it's you, right?"
- Fallback to passcode after 3 Face ID fails

### L.5 Accessibility

- All tap targets ≥44×44pt
- Dynamic type supported (min 14pt, max 21pt body)
- VoiceOver labels on every interactive element
- Color never the sole signal — always paired with icon or text

---

## Part M — Copy rules (recap from 02-principles-and-voice)

- American English throughout — `categorized`, `recognized`, `canceled`, `color`
- Plain English always; jargon immediately explained
- Penny's voice: calm, friendly, never pushy
- Approved emojis only: 🎉 👋 ✓ (char) 💪
- Banned emojis: 😊 👍 ✅ ⚠️
- No walls of text — one thought per message
- Complete sentences, never truncated
- Never "per-transaction nag" language — always weekly batch (D67) or proactive trigger (D42)

---

## Part N — What's out of scope for mobile (launch)

- Android is post-launch (parity with iOS once shipped)
- Multi-member LLC / C-Corp flows (feature-flagged, post-launch)
- Money movement (hard rule, rule 1)
- Tax filing (hard rule, rule 2)
- Sales tax computation / filing (detect + flag only, E29)
- Standing support access (per-session only, E40)
- Paid acquisition surfaces (word-of-mouth only)

---

## Part O — Wireframing checklist

Before handing wireframes to design/eng, verify:

- Every screen works at 375px width
- Every tab is reachable in ≤2 taps from any other tab
- Every approval card matches C.1 base format (with variant overlays)
- Every destructive action has a 5-second undo toast (L.1)
- Every empty state has calm, specific copy (J.5)
- Every error state lets Alex retry or escalate (J.3)
- Face ID re-auth path covered (L.4)
- Offline path covered for capture (J.1)
- Shame-free re-entry copy variants produced (B.3, Q-R1)
- S-Corp flows drawn explicitly where different from sole-prop (Part H)
- Mid-year S-Corp election narration flow drawn (H.3)
- CPA share-link flow drawn including revoke (E.8)
- 1099 candidate surface covered (in I.2 weekly batch)
- Quarterly-tax reminder copy drawn (E28)

---

*Next: [18-web-screens-and-flows.md](18-web-screens-and-flows.md) — web-specific screens and large-screen patterns.*
