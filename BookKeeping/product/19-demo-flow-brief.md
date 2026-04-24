# 19 — Demo Flow Brief
*Self-sufficient build spec for the "Try Penny" interactive demo, for handoff to Claude Design / Claude Code.*

**Author:** Nik (CEO) + Claude advisor session · 23 Apr 2026
**Status:** v1.0 · ready for design/code handoff
**Supersedes (demo scope only):** parts of `17-mobile-screens-and-flows.md` — see §2 Scope deltas below.

---

## 0 · How to use this document

This brief is **self-sufficient**. A builder should be able to ship the demo from this doc alone, without re-opening product questions. Where this brief conflicts with `17-mobile-screens-and-flows.md`, **this brief wins for the demo** — the underlying product spec is unchanged.

Every screen below has: purpose · layout · copy · interaction rules · personalization rules. ASCII mockups are structural, not pixel-final — final styling inherits from `design/design-system.md` v2.0.

Key references (do not re-litigate):

- Voice & tone → `02-principles-and-voice.md`
- Entity decisions → `spec-brainstorm-decisions.md` v2.2 D72, D83, D84
- Design tokens → `design/design-system.md` v2.0

---

## 1 · Purpose & success criteria

**Purpose.** This demo is the instrument Nik will put in front of real users to collect feedback *before* building the production product. It is **not** a marketing trailer. It is **not** the production product. It is a playable sandbox.

**Success criteria.**

1. A user lands on the demo, picks a business type + industry, and in under 5 minutes has experienced the full arc: onboarding → first approval → Penny thread → My Books → settings.
2. Every screen feels personalized to the choices the user made upfront (industry, entity, payment methods, expense categories).
3. All four entity types (Sole Proprietor, LLC, S-Corp, C-Corp) plus "Not sure yet" have distinct, realistic paths.
4. First-time and returning user experiences are visibly different.
5. When asked "how did that feel?" in a post-demo survey, users describe Penny's voice as "a friend who understands my business" — not "a bank app" or "a form."

---

## 2 · Scope deltas from existing product spec

The demo extends scope beyond the settled MVP (which is Alex / solo freelancer only). These are **demo-scope-only extensions** — they do not change production MVP.

| # | Delta | Rationale |
|---|---|---|
| D1 | Demo covers all 4 entity types with unique flows (Sole Prop, LLC, S-Corp, C-Corp) + "Not sure yet" diagnostic | Nik's choice: collect feedback across the full entity spectrum before narrowing production scope |
| D2 | Demo has a 10-industry picker driving downstream personalization | Addresses original feedback that flows felt generic across industries |
| D3 | **Tab bar reduced from 4 to 3: Penny · Add · My Books.** Connect is merged into Add. Settings/preferences move to avatar menu. | Nik's structural change 23 Apr |
| D4 | Two entry points on first load: "New here" vs. "Returning" → different Penny thread states | Original spec B.1–B.4 covers these states, but demo must expose both in one session |
| D5 | Avatar menu becomes a 3-section drill-down: Profile · Memory · Preferences. All fields editable. | Supersedes implied "not editable" current demo state |
| D6 | Payroll list expands to 6–8 providers; integrations beyond the settled 3 show as "coming soon" | Demo-only; settled spec D72 stays as-is for production |
| D7 | Invoice customizer offers full designer mode (layout, fonts, colors, logo upload) | Supersedes "pixel-perfect template" interpretation of D80 for demo depth |
| D8 | Expenses covered in onboarding as a merged "categories + capture preferences" step | Addresses feedback that expenses flow was missing |
| D9 | State is fully simulated within a session — settings changes persist session-level | Enables real-feeling interactions without backend |

---

## 3 · Tab structure (3 tabs)

Persistent bottom bar, one tab always selected, tap switches root screen.

| # | Tab label | Purpose | Default landing |
|---|---|---|---|
| 1 | **Penny** | Active conversation thread (first-time or returning state) | After onboarding, this is the home |
| 2 | **Add** | Bring data in — one-shot captures + ongoing integrations + data actions | Secondary during onboarding |
| 3 | **My Books** | Financial review — state + actions + drill-downs | Reached from Penny thread or tab bar |

Settings / preferences / memory live under the **avatar menu** (tap the P avatar in the Penny thread header). Not a tab.

---

## 4 · Global patterns

### 4.1 Two entry points at first load

```
Welcome to Penny
──────────────────────────────

   [ I'm new here ]         [ I've used Penny before ]
```

- **New** → onboarding flow (§5)
- **Returning** → skip onboarding; lands in returning-user Penny thread with pre-seeded state (see §6.2 + §11)

### 4.2 Continuity of personalization

Every screen after onboarding **must** reference at least one upfront choice. Examples:

- Bank-connection screen references industry: *"Most photographers I talk to use Chase Business or Bluevine. Yours on this list?"*
- Expense categories default to the industry-tailored set
- Payroll step only appears for S-Corp / LLC-taxed-as-S-Corp entities
- First approval card uses a vendor name that matches the user's industry (see §7.3 examples table)
- Voice-capture placeholder text rotates industry-tailored examples

If a designer is about to ship a screen that does not reference any prior choice, flag and fix.

### 4.3 Status strip (persistent top bar)

Per spec 17 §Status strip — keep as-is. On every screen:

```
9:41             Penny            📶 100%
```

No "(Demo)" badge, no footer — demo should feel like the real product.

### 4.4 Penny avatar (header)

Solid p-mark per `design/design-system.md` v2.0: circle with `--ink` fill + white "P".
Tappable from every screen of the Penny thread → opens avatar menu (§10).

### 4.5 Bottom tab bar

```
┌─────────────┬─────────────┬─────────────┐
│   Penny     │     Add     │  My Books   │
│   (active)  │             │             │
└─────────────┴─────────────┴─────────────┘
```

No floating action button. Add is a native tab with a label.

### 4.6 Undo toast

Per spec L.1 — 5s toast, bottom, "Undo" button, dismissable. Used on every approval, split, rule proposal, settings change.

---

## 5 · Onboarding flow (6 steps)

Linear, with a progress indicator "Step N of 6" in the header. Back button on every step except Welcome. User can abandon and resume.

### Step 1 — Welcome + first branch

Copy:
> 👋 **I'm Penny.**
> I keep your books up to date so you don't have to.
> Before I start, two quick things.

Single button: **Let's go** →

### Step 2 — Entity type (D83, with branching per point 2)

Screen title: *How is your business set up for taxes?*
Penny subhead: *"I'll ask so I get things right from day one."*

Five options (large tappable rows):

1. Sole Proprietor — *"Just me, file Schedule C"*
2. LLC — *"LLC, default taxes"*
3. S-Corp — *"Paying myself through payroll"*
4. C-Corp — *"Separate corporate return"*
5. **Not sure yet — help me figure it out**

**Branching:**

- Options 1–4 → Step 3 (Industry picker)
- Option 5 → **Diagnostic substep (5a)**

#### Step 5a — Diagnostic (for "Not sure" users)

Three sequential questions, each on its own screen, Penny speech bubble at top:

**5a.1** — *"Do you file a Schedule C on your personal taxes, or a separate business return?"*
Options: Schedule C · Separate return · I don't know yet

**5a.2** — *"Do you pay yourself a salary through payroll?"*
Options: Yes · No · I don't have a salary yet

**5a.3** — *"Are you the only owner?"*
Options: Yes, just me · I have a partner · I have multiple owners

**Resolution screen:**

Penny proposes the entity type, shows her reasoning (one line per input), asks to confirm.

> *"Sounds like you're probably a Sole Proprietor. Here's why:*
> *· You file Schedule C*
> *· No salary through payroll yet*
> *· Just you*
> *Want to go with that?"*

Buttons: **Yes, that's me** · **Actually, it's different** (returns to entity picker)

### Step 3 — Industry picker

Screen title: *What do you do?*
Penny subhead: *"I'll tune myself to how your industry works."*

10 industry tiles, 2 columns × 5 rows. Tap to select (single-select, large tappable):

| Industry | Icon (placeholder) | Sets downstream |
|---|---|---|
| Consulting & coaching | 💼 | payment-methods preset, expense-categories preset, example copy |
| Creative & content | 🎨 | ... |
| Trades & construction | 🔧 | ... |
| Retail & e-commerce | 🛒 | ... |
| Food & beverage | 🍽 | ... |
| Beauty & wellness | 💆 | ... |
| Professional services | ⚖️ | ... |
| Tech & software | 💻 | ... |
| Healthcare (private practice) | 🩺 | ... |
| Other | ··· | falls back to universal presets |

(Emoji placeholders above are for structure — real build uses lucide icons matching design system v2.0.)

### Step 4 — Payment methods (tailored + conversational + search)

Screen title: *How do your clients pay you?*
Penny subhead: *"Pick all that apply — I'll watch for these automatically."*

Layout:

```
Top: 4–6 large tiles, industry-tailored defaults
(e.g. photographer: Stripe · Venmo · Bank transfer · Square · PayPal · Check)
(e.g. retailer: Shopify · Square · Stripe · Cash · PayPal)

[ ✓ Stripe ]  [   Venmo  ]  [   Square  ]
[   PayPal ]  [ ✓ Check  ]  [   Bank    ]

──────────────────────────────────

"Don't see yours?" [ 🔍 Search 25+ providers ]

Below (conditional, opens on search tap):
Search field + full list of ~25 providers grouped by category:
· Card processing (Stripe, Square, Clover, ...)
· Peer payments (Venmo, Zelle, Cash App, ...)
· Invoicing tools (FreshBooks, Wave, QBO, ...)
· Marketplaces (Shopify, Etsy, Amazon, ...)
· Cash / check

Can pick multiple. Minimum 1 required.
```

### Step 5 — Expenses (merged: categories + capture preferences)

Per Nik's wave-4 answer — shorter onboarding, combine expense categories with capture preferences on one screen.

Screen title: *How do you track expenses?*
Penny subhead: *"Two quick questions on one screen."*

Two sections:

**Section A — What do you usually spend on?** (industry-tailored presets, multi-select)
E.g. consultant: Software · Travel · Client meals · Contractors · Marketing · Office / home office · Continuing education · Other
E.g. trades: Materials · Tools · Vehicle & fuel · Subcontractors · Insurance · License & permits · Other

Multi-select, minimum 1 required. "Other" opens a free-text field.

**Section B — How do you capture receipts today?** (multi-select)

- 📷 Photos on my phone
- 📧 Forward from email (Penny will give you an address)
- 🎙 Voice notes
- ⬆ Upload PDFs
- I don't capture receipts yet — help me start

### Step 6 — Check-in preference

Screen title: *When should I check in?*
Penny subhead: *"Most people like one of these. You can change it anytime."*

Four options, large tappable rows:

1. **Monday 9am** — *"Ease into the week"*
2. **Friday 4pm** — *"Before the weekend"*
3. **Daily 6pm** — *"End-of-day wind-down"*
4. **Pick your own** → opens day + time picker

Button: **Continue** →

### Step 7 — Bank connection

Screen title: *Which bank should I pull from first?*
Penny subhead: *"[Industry]s often use one of these. Yours on the list?"*

Layout:

```
Top: 4–5 industry-common banks as tiles
(e.g. creative: Chase Business · Bluevine · Relay · Mercury · BofA Business)
(e.g. retail: Chase Business · Wells Fargo · BofA · Capital One · Square Banking)

[ Chase Business ]  [ Bluevine      ]
[ Relay          ]  [ Mercury       ]
[ BofA Business  ]

──────────────────────────────────

"Don't see yours?" [ 🔍 Search 10,000+ banks ]
(opens universal Plaid search)

──────────────────────────────────

[ Skip for now — Penny will use demo transactions ]
(skip leads to pre-seeded industry-matching transactions)
```

**Demo note:** This demo does not actually OAuth to Plaid. All three paths (tile tap, search-pick, skip) lead to the same outcome: Penny simulates a 3-second "pulling 30 days…" progress screen, then lands in the first approval card.

### Onboarding progress indicator

Every step shows:

```
Step 3 of 6 ─────────○○○             [ Back ]
```

(On "Not sure" branch, the diagnostic adds an internal sub-progress but the top-level still shows 6 steps.)

---

## 6 · Penny thread (Tab 1)

Two distinct states at demo entry:

### 6.1 First-time Penny thread

Lands here immediately after Step 7 (bank connection). Penny has pulled transactions and is ready to interact.

Layout:

```
──────────────────────────────────
  👤P  Penny                  ⚙
      online · watching your accounts ↓
──────────────────────────────────

     ╭─────────────────────────╮
     │ Hey, [First name] 👋    │
     │                         │
     │ I pulled in the last    │
     │ 30 days. Here's what    │
     │ I'm seeing.             │
     ╰─────────────────────────╯

     ╭─────────────────────────╮
     │ I'm still getting to    │
     │ know your business —    │
     │ tell me if I'm off.     │
     ╰─────────────────────────╯

  [ First approval card appears here ]

──────────────────────────────────
  [ Penny ]  [  Add  ]  [ My Books ]
──────────────────────────────────
```

**Copy replacements** (per point 9 + tone guide):

- ❌ *"I watch your accounts all day"* (creepy)
- ✅ Header subtitle: *"online · watching your accounts"* (present tense, tight, factual not ominous)
- ✅ Body: *"I pick up every transaction as it lands — so nothing slips past you."* (if expanded copy needed)

### 6.2 Returning user Penny thread

Lands here if user picked "I've used Penny before" at entry.

Layout:

```
──────────────────────────────────
  👤P  Penny                  ⚙
      last checked 2 hours ago
──────────────────────────────────

  Welcome back.
  3 things came in while you were away.

     ╭─────────────────────────╮
     │ Approval card #1        │
     │ (industry-tailored)     │
     ╰─────────────────────────╯

     ╭─────────────────────────╮
     │ Approval card #2        │
     ╰─────────────────────────╯

     ╭─────────────────────────╮
     │ Approval card #3        │
     ╰─────────────────────────╯

  ─────────────────────────────
  That's it for now. I'll keep watching.

──────────────────────────────────
  [ Penny ]  [  Add  ]  [ My Books ]
──────────────────────────────────
```

Differences from first-time:

- Header: "last checked 2 hours ago" not "online"
- No intro speech bubbles; direct to value
- Copy uses "welcome back" not "hey"
- 3 queued cards visible (first-time shows 1 at a time)
- Bottom line anchors the thread: *"That's it for now. I'll keep watching."*

**Shame-free framing per D61:** Never say "You have 3 items to review." Say "3 things came in while you were away." Same number, zero guilt.

---

## 7 · Universal approval card

### 7.1 Card anatomy (all variants)

```
 ╭───────────────────────────────╮
 │ [Vendor icon]                 │
 │                               │
 │  Studio Nine                  │
 │  $3,000.00 · today, 11:42am   │
 │                               │
 │  Penny thinks: Client payment │
 │  "Looks like project income"  │
 │                               │
 │  ● 96% confident              │
 │                               │
 │  [ Confirm ]  [ Change ]      │
 │                               │
 │  [Split]  [Rule]  [Skip for   │
 │                    now]        │
 ╰───────────────────────────────╯
```

Fields always present:

- Vendor name (matched via VendorStats projection)
- Amount + timestamp
- Penny's category guess ("thinks: …")
- One-sentence reasoning
- Confidence dot + percentage
- Primary: Confirm · Change
- Secondary: Split · Propose rule · Skip for now

### 7.2 Variants — entity-driven (which appear)

| Variant ID | When it appears | Entity gating |
|---|---|---|
| C.1 Base expense (high confidence) | Most expenses | All entities |
| C.2 Low-confidence expense | Any expense under 80% confidence | All entities |
| C.3 Income | Any income event | All entities |
| C.4 Income celebration 🎉 | First income of month or >3× average | All entities |
| C.6 Split | User taps Split on any card | All entities |
| C.7 Variable recurring | Detected recurring vendor with varying amount | All entities |
| C.8 Rule proposal | After 3 confirmations of same vendor | All entities |
| **C.9 Owner's-draw** | Transfer from business → owner's personal | **S-Corp · LLC-taxed-as-S-Corp only** |

Sole Proprietor and C-Corp **never** see C.9.

### 7.3 Variants — industry-driven (copy + vendor names)

Copy changes per industry. Same layout.

| Industry | Sample vendor (income) | Sample vendor (expense) | Penny's guess copy |
|---|---|---|---|
| Consulting | Studio Nine (Retainer) | Notion | "Looks like client retainer" / "Looks like software" |
| Creative | Bright Co (Project fee) | Adobe Creative Cloud | "Looks like project payment" / "Looks like creative tools" |
| Trades | Henderson Renovations | Home Depot | "Looks like job payment" / "Looks like job materials" |
| Retail | Shopify | UPS | "Looks like sales payout" / "Looks like shipping" |
| Food & bev | Toast | Sysco | "Looks like daily sales" / "Looks like food supplier" |
| Beauty | Square | Beauty Supply Co | "Looks like client visit" / "Looks like supplies" |
| Professional services | Law Firm Client A | Westlaw | "Looks like client fee" / "Looks like research" |
| Tech & software | Stripe | AWS | "Looks like subscription revenue" / "Looks like hosting" |
| Healthcare | Insurance Payor | Medical Supply Co | "Looks like insurance payout" / "Looks like supplies" |
| Other | Generic Client | Generic Vendor | "Looks like client payment" / "Looks like business expense" |

Builder: wire these into a lookup table keyed by selected industry.

### 7.4 Card interaction — Confirm

Tap Confirm → card collapses into a confirmed slug:

```
 ╭───────────────────────────────╮
 │ ✓ Studio Nine · $3,000        │
 │   categorized: Client payment │
 ╰───────────────────────────────╯
```

Toast: *"Got it. One more below."* (auto-dismiss 3s)

Next card appears or thread shows "That's it for now" if queue empty.

### 7.5 Card interaction — Change

Opens category picker bottom sheet per spec C.5 — unchanged from 17-mobile.

### 7.6 Card interaction — Skip for now (point 1 — bulk later)

Tap → card moves to backlog (silently). Toast: *"Saved for later. I'll bring it back."*

**Smart follow-up behavior:** At the user's next check-in time, the first card in that day's queue is a single consolidated card:

```
 ╭───────────────────────────────╮
 │ Ready when you are.           │
 │ 4 things I saved for later.   │
 │                               │
 │  [ Review them ]  [ Not now ] │
 ╰───────────────────────────────╯
```

One ping. No escalation. Matches voice rule 5 ("keep nudges light") and D61 (shame-free).

---

## 8 · Add tab (merged with Connect)

### 8.1 Layout

```
──────────────────────────────────
  Add                          ×
──────────────────────────────────

  Add something now

   📷  Snap a receipt          ›
   🎙  Just tell me            ›  ← rotating example
   ✎   Type it out             ›
   ⬆   Upload a file           ›

──────────────────────────────────

  Connected

   🏦 Chase Business ·4821    Active ›
   💳 Stripe                  Active ›
   💸 Venmo                   Active ›

──────────────────────────────────

  + Add a new integration      ›
     Banks · Payment processors ·
     Payroll · Email · Export tools

──────────────────────────────────

  Data in Penny                ›
     Export · Download · Delete

──────────────────────────────────
  [ Penny ]  [  Add (on) ]  [ My Books ]
──────────────────────────────────
```

### 8.2 Capture modes

Tapping any of the 4 capture rows:

- **📷 Snap a receipt** → camera opens full-screen. After shot, AI OCR extracts amount + vendor + date. User sees a pre-filled approval card. Demo simulates 2s OCR delay.
- **🎙 Just tell me** → voice recorder opens. Shows rotating example hint *"e.g. '$40 to John for graphic work'"*. On stop, AI parses, produces an approval card. See §13 for rotating examples.
- **✎ Type it out** → three-field form: amount · vendor · category (pre-filled by Penny if typed vendor is known). Save → approval card.
- **⬆ Upload a file** → file picker, accepts PDF + image. Simulates OCR.

### 8.3 Connected list

Shows currently-connected integrations. Each row:

- Icon · Name · Last 4 digits (if account) · Status badge · chevron
- Tap → integration detail screen (sync history, disconnect, re-auth)
- Status badges: **Active** · **Sync pending** · **Action needed** (re-auth required)

### 8.4 Add integration picker

Tap "+ Add a new integration" → grouped list:

```
 Banks
  [universal Plaid search]

 Payment processors
  Stripe · Square · PayPal · Shopify · Clover · Toast ...

 Payroll
  Gusto · OnPay · QBO Payroll · [ADP · Paychex · Rippling · Justworks  "Coming soon — tap to get notified"]

 Peer payments
  Venmo · Zelle · Cash App · PayPal.me

 Email receipts
  Gmail · Outlook (OAuth readonly, D74)

 Accounting exports
  QuickBooks Online · Xero · Wave · FreshBooks

 Tax tools
  TurboTax · H&R Block · Track1099 · IRS Direct Pay
```

**"Coming soon" behavior (per wave-5 payroll answer):** Providers beyond the settled 3 (Gusto, OnPay, QBO Payroll) show as tappable but tap → *"We're not live with [Provider] yet. Want to know when we are?"* → capture email. Doesn't pretend to be connected.

### 8.5 Data in Penny

Tap → drill-down with three actions:

- **Export everything** (CSV · PDF ledger · QBO export)
- **Download a copy** (machine-readable JSON)
- **Delete my account** → confirmation → 30-day soft delete per D71 · E39

No other data settings live here. Preferences (notifications, Face ID, language) live in avatar menu → Preferences.

---

## 9 · My Books (Tab 3)

### 9.1 Landing — 4-zone layout

```
──────────────────────────────────
  My Books                    This month ▾
──────────────────────────────────

 ┌───────┬───────┬───────┐
 │Runway │ Net   │ Books │
 │4.5mo  │+$8.4k │94/100 │    ← Tier 1: state
 │▼ 0.2  │▲ vs LM│▲ 3pts │
 └───────┴───────┴───────┘

──────────────────────────────────
 Needs a look (3)                ← Tier 2: actions

 ● Studio Nine — $3k uncategorized   ›
 ● Invoice #4 · Bright Co · 5d late  ›
 ● Duplicate charge at AWS?          ›
──────────────────────────────────
 Coming up                       ← Tier 3: calendar

 Quarterly estimate · Jun 15 · $2,100 ›
──────────────────────────────────
 P&L this month                     ›
 Invoices · 2 pending · $4.5k       ›
 Expenses                           ›
 Full ledger                        ›
 Export to CPA                      ›
──────────────────────────────────
  [ Penny ]  [  Add  ]  [ My Books (on) ]
──────────────────────────────────
```

### 9.2 Critical vs hidden

What's **critical** (visible on landing):

- Tier 1: Runway · Net this month · Books-clean score (all same font size / weight — matches point 21 fix)
- Tier 2: "Needs a look" items (0–3 at a time, section hides if 0)
- Tier 3: Single "Coming up" calendar item (most imminent only)

What's **hidden** (reached via drill-down rows at bottom):

- P&L breakdown by category
- Invoice list with status per invoice
- Expense breakdown
- Full transaction ledger (searchable · filterable · paginated)
- CPA export flow

### 9.3 Period selector

"This month ▾" at top right. Drives Tier 1 numbers + Tier 2 items. Options:

- This month
- This quarter
- This year
- Last month
- Custom range

Runway (forward-looking) always shows current state regardless of period.

### 9.4 Full ledger (opens via drill-down)

Own full-screen view. Default:

- Period: This month
- Filter: non-personal transactions only (business flag set)
- Layout: date · vendor · category tag · amount · confidence dot
- Top: 4 filter pills (Period · Account · Category · Amount range) — each opens a filter sheet
- Tap row → transaction detail (spec E.5)
- Long-press row → bulk-select mode (tap multiple, bulk-categorize · bulk-export · bulk-mark-personal)

### 9.5 Copy fixes in My Books

- ❌ "Drill-in" → ✅ "Needs a look" (section header) · row-level items use natural language, no "drill" noun
- ❌ repeated top data (three cards showing similar numbers) → ✅ three cards show *different dimensions* (runway, net, clean-ness); no dimension appears twice
- ❌ mixed fonts on top strip → ✅ all three cards use same font, weight, size per §9.1

---

## 10 · Avatar menu (Profile · Memory · Preferences)

Tap the P avatar in the Penny thread header → bottom sheet with 3 sections as drill-downs. All fields editable.

### 10.1 Profile

```
──────────────────────────────────
 ← Profile
──────────────────────────────────

 Your name          Alex Rivera         ›
 Business name      Rivera Studio       ›
 Industry           Creative & content  ›
 Entity type        Sole Proprietor     ›
                    change anytime (§12)
 State              California          ›
 Home office        Yes                 ›
 Business started   March 2023          ›
 EIN (optional)     •••••• (hidden)     ›
 Fiscal year end    Dec 31              ›
 CPA contact        not set             ›
──────────────────────────────────
```

All rows tap-to-edit inline. Entity type row has a caveat pill: *"changing this affects your tax logic — read more"* (opens §12).

### 10.2 Memory

List of learned facts Penny has built up. Each item editable or deletable.

```
──────────────────────────────────
 ← Memory
──────────────────────────────────
  What I remember

  Starbucks → Business Meal         [ edit ]  [ × ]
  Bright Co usually pays late       [ edit ]  [ × ]
  Chase ···4821 → Business account  [ edit ]  [ × ]
  Home office: 120 sqft             [ edit ]  [ × ]
  Mileage rate: standard IRS        [ edit ]  [ × ]

──────────────────────────────────
  Want me to forget something else?
  [ Ask Penny to forget ]
──────────────────────────────────
```

Tap **×** → *"Forget this? I'll start fresh next time I see it."* → confirm → fact removed. Toast: *"Forgotten."*

Tap **edit** → inline text editor → save updates the fact.

**Empty state** (new user): *"I'll learn as we go. Nothing here yet."*

### 10.3 Preferences

All Penny-behavior settings. **Nothing duplicates from the Connect/Add tab.**

```
──────────────────────────────────
 ← Preferences
──────────────────────────────────

 CHECK-IN
   Cadence          Monday 9am          ›
   Time zone        Pacific / Los Ang.  ›

 NOTIFICATIONS
   Mode             Daily digest        ›
                    (Real-time · Digest)

 VOICE
   Penny speaks     Female, US          ›
   Voice input      On                  ›

 LANGUAGE
   Display          English (US)        ›

 SECURITY
   Face ID lock     On                  ›
   Timeout          5 minutes           ›
   Device trust     Active              ›
──────────────────────────────────
```

---

## 11 · Industry → customization matrix

The single source of truth for what each industry changes.

| Industry | Payment tiles (top 4) | Expense categories | Common banks | Voice example hint |
|---|---|---|---|---|
| Consulting & coaching | Stripe, PayPal, Bank transfer, Check | Software, Travel, Client meals, Contractors, Marketing, Home office | Chase Biz, Bluevine, Mercury, Relay, BofA | "$150 to Zoom Pro" |
| Creative & content | Stripe, Venmo, PayPal, Bank transfer | Software subs, Equipment, Props, Travel, Contractors, Home office | Chase Biz, Mercury, Relay, Novo | "$80 for stock photo license" |
| Trades & construction | Check, Cash, Zelle, Square | Materials, Tools, Vehicle & fuel, Subcontractors, Insurance, Permits | BofA, Chase Biz, Wells Fargo, Local credit union | "$320 at Home Depot for materials" |
| Retail & e-commerce | Shopify, Square, Stripe, Cash | Inventory, Shipping, Ads, Platform fees, Packaging, Warehouse | Chase Biz, Square Banking, Shopify Balance | "$90 UPS for shipment 1042" |
| Food & beverage | Toast, Square, Clover, Cash | Food cost, Labor, Supplies, Rent, Utilities, Marketing | Chase Biz, BofA, Wells Fargo, Heartland | "$400 Sysco delivery" |
| Beauty & wellness | Square, Stripe, Venmo, Cash | Supplies, Rent, Tools, Marketing, Licensing, CE | Chase Biz, Square Banking | "$45 supplies at Salon Centric" |
| Professional services | Stripe, Bank transfer, Check, Escrow | Research subs, Licensing, Bar dues, Travel, Staff, Office | Chase Biz, BofA, First Republic | "$210 Westlaw month" |
| Tech & software | Stripe, ACH, Wire, PayPal | AWS/hosting, Software, Contractors, Travel, Ads, Equipment | Mercury, Brex, Chase Biz, SVB successor | "$1,200 AWS month" |
| Healthcare (private practice) | Insurance payor, Card, HSA, Patient pay | Supplies, Malpractice, Rent, Staff, CE, Licensing | Chase Biz, BofA, Local credit union | "$60 Quest Diagnostics" |
| Other | Stripe, Venmo, Bank transfer, Cash | Generic default set | Universal search | "$50 for business expense" |

Wire this into a JSON config keyed by industry. All downstream screens read from it.

---

## 12 · Entity-change flow (point 4 — legally honest)

Per wave-2 answer: **internal state only + guidance**, no filing support in demo.

When user edits **Entity type** from Profile:

```
──────────────────────────────────
 Change entity type
──────────────────────────────────

 You're currently: Sole Proprietor

 Most entity changes require filing with the IRS
 or your state — I can't do that for you, but
 here's a map.

 From Sole Proprietor to:
   · LLC
       You file Articles of Organization with
       your state. Here's your state's link [›]
   · S-Corp (from sole prop with LLC)
       File IRS Form 2553. Do this within 75
       days of formation or start of tax year.
       Here's the form [›]
   · C-Corp
       State incorporation + IRS Form 8832.
       Link [›]

 Once you've filed, come back and pick your
 new entity type. I'll update my tax logic
 immediately.

 [ I've filed — update Penny ]
 [ Come back later ]
──────────────────────────────────
```

**Demo simulates the "I've filed" click** → Profile updates instantly to new entity type. Penny thread surfaces a confirmation message: *"Got it — I'll treat you as [new entity] starting today."* No forms, no uploads. Legal guidance is display-only.

**Copy rule:** Never say "change it anytime" without the caveat. Always use *"change whenever your legal setup changes."*

---

## 13 · Rotating voice + Add-screen examples (points 14, 15, 19)

### 13.1 Library structure

Each industry has a library of 25 example prompts, tagged by capture mode:

```json
{
  "industry": "creative",
  "examples": [
    {"mode": "voice", "text": "$80 for a stock photo license", "context_tag": "general"},
    {"mode": "voice", "text": "paid $500 to my editor", "context_tag": "after-expense"},
    {"mode": "voice", "text": "got $3k from Bright Co for the shoot", "context_tag": "after-income"},
    ...
  ]
}
```

**Tags:**

- `general` — no context needed
- `after-income` — shown when user's last action was a confirmed income card
- `after-expense` — shown when user's last action was a confirmed expense card
- `first-time` — shown only in the first session

### 13.2 Context-aware rotation

Rotation algorithm:

1. When opening Add sheet or voice recorder, look up last-confirmed card's type (income / expense / none).
2. Filter library by matching tag (`after-income` if last was income; `general` if no recent action).
3. Pick 3 examples not shown in this session; mark as shown; if library exhausted, reset.
4. Render the examples as hint text rotating every 4 seconds (slow rotation, readable).

### 13.3 Initial library seed (deliverable: 250 examples)

Builder: author 25 examples per industry × 10 industries = 250 total. For demo launch, seed with at least 10 per industry (100 total); full library follows in iteration.

### 13.4 Voice-capture edit affordance (point 14)

When a voice note is recorded, Penny shows the transcription in a bubble. User can tap any word → inline edit cursor appears. No "Edit" button — the text itself is tappable.

```
 Just tell me
 ──────────────────────
 "Paid $40 to John for graphic work"
                ↑
         tap any word to edit

 [ 🎙 Redo ]          [ Looks good → ]
```

**No explicit "edit" label.** The tap-to-edit interaction matches how mobile users already interact with text fields. Friction = zero.

---

## 14 · Invoice customizer — full designer mode (point 17)

Per wave-2 answer: full designer mode.

### 14.1 Entry

From Penny thread: tap **Send an invoice** (suggested action after rule learns client name) OR Add tab → *"Create invoice"* (a 5th capture-mode row for users who bill). Opens customizer.

### 14.2 Customizer layout

```
──────────────────────────────────
 ← New invoice           [ Preview ]
──────────────────────────────────

 LAYOUT
   Template   [ Classic ▾ ]    (Classic · Modern · Minimal · Bold)
   Columns    [ 2-col ▾ ]

 BRAND
   Logo       [ ⬆ Upload ]
   Color      [ #1A4D3A 🎨 ]
   Font       [ Inter ▾ ]      (Inter · Serif · Display · Mono)

 CONTENT
   Your business
     Name     Rivera Studio
     Address  [ add ]
     Email    alex@rivera.studio
   Client
     Name     [ Bright Co ]    ← autofills from memory
     Address  [ add ]
   Line items
     [ + Add line ]
   Payment terms
     [ Net 15 ▾ ] (Net 7 · 15 · 30 · 60 · Due on receipt)
   Payment plan
     [ ☐ Offer 2 payments ]    ← per D79
   Notes / thank you
     [ Thank you for your business. ]

──────────────────────────────────

 [ Preview ]   [ Save draft ]   [ Send → ]
```

### 14.3 Preview

Full-screen rendered invoice. Brand applies. Tap to edit any element inline.

### 14.4 Demo simulation

"Send" triggers a 2s spinner, success screen: *"Invoice sent to [client email]. I'll watch for payment."* Returns to Penny thread with a confirmed slug card.

---

## 15 · Error & empty states

Three must-have error states in the demo:

### 15.1 Voice didn't parse

When Penny's transcription confidence is low or message is unparseable:

```
 Just tell me
 ──────────────────────
 "......"

 Hmm, I didn't catch that. Mind typing it
 or trying again?

 [ 🎙 Try again ]   [ ✎ Type instead ]
```

### 15.2 Bank connect timeout

On bank-connection simulation failure:

```
 Your bank didn't respond.

 This happens sometimes — nothing wrong on
 your end.

 [ Try again ]   [ Skip for now ]
```

Skip leads to pre-seeded demo transactions.

### 15.3 Low-confidence category

On an approval card when confidence < 60%:

```
 [Vendor icon]
 Unknown Vendor LLC
 $432.11 · today

 I'm not sure what this is.

 What should I call this?
 [ Category picker ]
```

No guess shown. Matches principle 10 *"Never guess with no signal."*

---

## 16 · Day-2 experience (returning user deep state)

Triggered when user completes onboarding then (simulated) returns 24h later (demo shows a "fast-forward" button or auto-advances on the user's second Penny-tab visit).

### 16.1 Pre-seeded state

- Penny header: *"last checked 2 hours ago"* (changes from "online")
- 3 new approval cards queued (industry-appropriate vendors)
- 1 new item in "Needs a look" (My Books)
- Memory has grown: 2–3 new learned facts visible
- Cash runway number updates (+0.1 or -0.1 mo)

### 16.2 Behavior

- Returning-user landing copy per §6.2
- If user left a card "Skip for now" on day 1 → first card on day 2 is the consolidated "4 things I saved for later" card per §7.6

---

## 17 · Copy rewrites — single source of truth

All copy replacements triggered by points 9, 18, 22 (and adjacent):

| Location | Old (bad) | New (ship this) |
|---|---|---|
| Penny thread header | "I watch your accounts all day" | "online · watching your accounts" (status-strip) |
| Penny first-message body | "I watch your accounts all day" | "I pick up every transaction as it lands — so nothing slips past you." |
| My Books section header | "Drill-in" | "Needs a look" |
| My Books row label | "Drill into transaction" | "See detail" or row is tap-to-open without a label |
| Add-screen fifth option | "Or just what happened" | Folded into "Just tell me" capture mode (§8.2) — standalone screen removed |
| Returning user landing | "You have N items to review" | "N things came in while you were away." (D61 compliant) |
| Skip-for-now feedback | [silent or "Dismissed"] | "Saved for later. I'll bring it back." |
| Bulk-later resurfacing | "You have unreviewed items" | "Ready when you are. N things I saved for later." |
| Change entity button | "You can change this anytime" | "Change whenever your legal setup changes." |

**Voice checklist for every new string added by builder:**

1. Would a calm, knowledgeable friend say this? (Principle 6)
2. Is it one idea per bubble? (Voice rule)
3. Is the number preceded by the human moment? (Voice rule)
4. American English? (Global rule)
5. No banned phrases? ("N items to review", streaks, shame)

---

## 18 · Entity-specific behaviors summary

Single-table reference for what each entity sees.

| Behavior | Sole Prop | LLC (default tax) | S-Corp / LLC-S | C-Corp |
|---|---|---|---|---|
| Payroll step in onboarding | — | — | Shown | Shown |
| Approval card C.9 (owner's-draw) | — | — | Appears | — |
| Export format | Schedule C (Form 1040) | Schedule C or 1065 | 1120-S | 1120 |
| Quarterly estimated tax | Personal estimated | Personal estimated | Varies (wages + K-1) | Corporate |
| 1099 issuance | If applicable | If applicable | Required | Required |
| Payroll integrations offered | — | — | Gusto / OnPay / QBO Payroll + "coming soon" tier | Same |
| Home office deduction UI | Shown in onboarding | Shown if electing | Hidden | Hidden |

---

## 19 · What's explicitly NOT in demo scope

- Real bank connection (Plaid OAuth) — all banks simulate
- Real Stripe / payment processor webhook ingestion
- Real AI inference — all category guesses are pre-scripted per scenario
- Real email receipt ingestion
- Real invoice email delivery
- Real tax filing export (form generation shown but PDF download is a placeholder)
- Multi-user / CPA share-link flows (spec 18 web-only; not in mobile demo)
- Multi-currency (domestic USD only in demo)
- Offline capture persistence across page reload (simulated state resets if user closes tab)

---

## 20 · Build-order recommendation for Claude Design / Code

Suggested sequence so you can stage and test incrementally:

1. **Tab shell + Penny thread first-time state** — placeholder copy, 1 approval card hardcoded. Proves the chrome.
2. **Onboarding Steps 1–7** — with entity branching + industry picker. Validates the single biggest UX change.
3. **Industry customization JSON** (§11 matrix) — wire into copy + vendor names.
4. **Universal approval card** — all 9 variants + confirm / change / skip.
5. **Add tab (merged)** — capture modes + Connected list + integration picker.
6. **My Books landing** (§9.1 4-zone layout).
7. **Avatar menu** — 3-section drill-down.
8. **Full ledger drill-down, invoice designer, entity-change flow** — lower-priority polish.
9. **Day-2 returning state** — pre-seed + fast-forward.
10. **Error / empty states** — wire in the 3 key ones.

---

## 21 · Open items for post-handoff

Things the builder may hit and should flag back to Nik rather than invent:

1. **Industry icons** — lucide-react set or custom? Design system v2.0 doesn't yet specify.
2. **Voice example library full 250** — seed with 100 (10/industry) for demo launch; full library per iteration.
3. **"Coming soon" email capture** — real waitlist signup or simulated? Assume simulated unless told otherwise.
4. **Device time-zone detection** — if the user is in ET and picks "Monday 9am," demo should default to their local time. Confirm builder handles.
5. **Demo reset button** — should there be a "start over" option visible somewhere (e.g. footer of Profile)? Not in this spec; ask Nik.

---

*End of brief. Everything else about Penny — voice, decisions, spec — lives in the canonical product/ folder. This brief is the demo-specific superset.*
