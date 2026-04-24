# Penny Demo Wireframe — UX/UI Stress Test &amp; Claude Design Brief

**Reviewers:** Head of Research + Head of Design (FounderFirst OS)
**Date:** 21 April 2026 (late evening)
**Artifact under review:** `Penny Demo Standalone.html` (31 screens, 9 sections)
**Audience for this doc:** Claude Design
**Demo context:** Real solo freelancer drives the phone, Nik observes, 30+ min, Apr 22. The session design / interview guide is NOT in this doc — see `penny-user-session-guide-apr-22-2026.md` alongside.

---

## How to read this brief

Every finding below is structured as a work ticket:

- **ID** — use this to track fixes
- **Screen** — exact screen function in the wireframe (e.g. `A1Welcome`, lines X–Y)
- **Issue** — what's wrong
- **Why it matters** — the user impact (research framing)
- **Fix** — what to change, concretely
- **Acceptance** — how we'll know it's resolved
- **Est.** — rough build time

Findings are organized by part (A–E). Within each part they are severity-ordered (🔴 Critical → 🟡 High → 🟢 Nice-to-have).

---

## TL;DR — the 10 critical fixes (🔴 must-fix before tomorrow)

| # | ID | Screen | Fix in one line |
|---|---|---|---|
| 1 | CR-1 | App chrome | Add `?demo=real` URL flag that hides the tour header + prev/next controls + "All screens" button |
| 2 | CR-2 | `B3Reentry` | Wire AskBar to live Claude (currently `onChange={()=>{}}`) |
| 3 | CR-3 | `D4Manual` | Replace styled div with real `<input type="number">` for amount |
| 4 | CR-4 | `C5Category` | Commit selected category back to the approval card |
| 5 | CR-5 | `ApprovalCard` | Rename "Edit" → "Change category" and route to C5 (5-min fix) |
| 6 | CR-6 | `E3Audit` | "Fix this ›" should surface the gap, not dump to cold Penny thread |
| 7 | CR-7 | `F1Connect` | Wire 9 dead `onClick={() => {}}` rows to at least a read-only detail |
| 8 | CR-8 | `G2NewInvoice` | Line-item client "Nik Jain" → "TripAdvisor" |
| 9 | CR-9 | `D1Add` | "Photo of a receipt" routes to `add-voice` — fix to real photo flow or honest placeholder |
| 10 | CR-10 | `ApprovalCard` | Wire the "Undo" toast to actually undo |

Additionally: **~40 tone-guide violations** across all 31 screens (Part D) — these are the copy changes that turn this from "wireframe" into "Penny speaking as Penny."

**Demo hero to add (Part F): FE-1 — conversational invoice creation from B1.** *"Invoice TripAdvisor $6,500 net 30"* → Penny drafts it inline. Extends the already-working B1 Claude loop; unlocks the biggest "yes, I want this" moment of the session. 60 min build. FE-2 (3 templates + "make it more minimal") and FE-3 (voice-to-invoice) are stretches on top of FE-1.

---

## Part A — Deal-breakers (flow / interactivity)

The 10 items summarized above, in full detail.

### 🔴 CR-1 — Wireframe chrome is visible during the session

- **Screen:** App container, lines 1624–1686
- **Issue:** Header shows `Penny — Lo-Fi Wireframe · Lindsay Morin · Sails Up Marketing & Consulting · S-Corp · 1/31 screens`. Bottom has prev/next tour arrows + "▾ All screens" toggle + progress bar + "← → arrow keys" hint.
- **Why it matters:** A user driving the phone reads "Lo-Fi Wireframe" in 2 seconds. Immersion collapses. Everything that follows is consumed as a demo, not a product.
- **Fix:**
  1. Read URL search params once at mount: `const demoMode = new URLSearchParams(location.search).get('demo') === 'real'`
  2. Wrap all chrome (header div, tour controls, progress bar, screen map toggle, keyboard hint) in `{!demoMode && (...)}`
  3. When `demoMode` is true, render ONLY the PhoneShell, centered, no page padding, full-screen on mobile.
- **Acceptance:** `?demo=real` renders only the phone with zero "wireframe" or "demo" language anywhere on screen, including browser title.
- **Est.** 20 min.

### 🔴 CR-2 — B3 re-entry AskBar is dead

- **Screen:** `B3Reentry`, line 614
- **Issue:** `<AskBar value="" onChange={()=>{}} onSend={() => navigate('approval-income')} onMic={() => {}} />`
- **Why it matters:** B3 is the product's emotional high point — Penny as the friend who kept things tidy while you were away. If the input is dead here, the moment dies.
- **Fix:** Lift the message array / input / Claude-complete handler pattern from `B1Thread` (lines 508–587) into `B3Reentry`. The B3 opening messages ("Good to see you," "Nothing's on fire") should remain as the seed, then the live loop takes over.
- **Acceptance:** She types "how's my cash position?" in B3, gets a real Penny answer in context.
- **Est.** 15 min (reuse B1 pattern).

### 🔴 CR-3 — D4 Manual entry amount field is read-only

- **Screen:** `D4Manual`, lines 873–877
- **Issue:** The `number` step renders `<div>${vals.amount || '0.00'}</div>` — no actual input element.
- **Why it matters:** Manual entry is table stakes. A product that cannot accept a typed number is not a product.
- **Fix:** Replace with `<input type="number" inputMode="decimal" value={vals.amount} onChange={e => setVals({...vals, amount: e.target.value})} style={{fontSize:52, fontWeight:700, color:T.ink, letterSpacing:'-0.03em', border:'none', borderBottom:`2px solid ${T.ink}`, background:'transparent', outline:'none', width:'100%', fontFamily:'inherit'}} />`. Prefix with "$" in a sibling span.
- **Acceptance:** She can type a number. Numbers-only keyboard appears on iOS.
- **Est.** 10 min.

### 🔴 CR-4 — C5 Category picker does not commit

- **Screen:** `C5Category`, lines 693–719
- **Issue:** Every category `onClick={() => navigate('approval-lowconf')}` — routes back but doesn't apply the category. The low-conf card stays "Help me categorize this."
- **Why it matters:** She'll pick a category, think she broke the app, and stop trusting the interface.
- **Fix:** Lift a `selectedCategory` state into the App root or use a shared store. On pick: `setSelectedCategory(c); navigate('approval-lowconf')`. In `C2LowConf` approval card, read the state — if set, render as a high-confidence card with "Looks right ✓" instead of "Help me categorize."
- **Acceptance:** Picking "Office / Co-working" from C5 returns to C2 with Regus card now showing that category and ready to confirm.
- **Est.** 20 min.

### 🔴 CR-5 — "Edit" on approval cards dead-ends to Penny thread

- **Screen:** `ApprovalCard` component, used in `C1Expense`, `C2LowConf`, `C3Income`, `A7FirstCard`
- **Issue:** `onEdit={() => navigate('penny-thread')}` — she expects to edit, gets dropped in the chat thread cold.
- **Why it matters:** "Edit" is the most common exploratory tap on any form. Routing to an unrelated screen breaks mental model.
- **Fix (pick one):**
  - **(a) Fast version:** Rename the button from "Edit" to "Change category" and route to C5. 5 min.
  - **(b) Proper version:** Build a minimal `EditSheet` overlay: category chip (tap → C5), amount field (editable), memo field, save/cancel. 60 min.
- **Recommended:** (a) tonight, ticket (b) for post-demo.
- **Acceptance:** Tapping "Change category" opens C5; picking returns to the updated card.
- **Est.** 5 min (option a).

### 🔴 CR-6 — E3 Audit "Fix this" dumps to cold Penny thread

- **Screen:** `E3Audit`, line 1048
- **Issue:** `onClick={() => navigate('penny-thread')}` for every "Fix this" link. She taps on the red "Quarterly tax estimate current" item and lands in Penny thread with no context.
- **Why it matters:** The audit score is the most research-rich screen — she's actively interrogating. Dead-ending her here kills the discovery.
- **Fix:** When she taps "Fix this" on the Q-tax row, route to `penny-thread` BUT seed the thread with a pre-placed Penny bubble: *"Your Q1 estimate was due Apr 15. Based on your books you owe about $4,800. Want me to walk you through paying it now?"* — then the live AskBar takes over.
- **Acceptance:** Each "Fix this" gets a context-aware Penny opener before handing to live chat.
- **Est.** 30 min.

### 🔴 CR-7 — F1 Connect has 9 dead rows

- **Screen:** `F1Connect`, lines 1160, 1163, 1166–1169, 1171–1173
- **Issue:** 9 list rows with `onClick={() => {}}`. App lock, Accounting basis, Entity type, Data & privacy, Discord support, Delete account, Add account, connected accounts, and the user row.
- **Why it matters:** Connect is where she'll explore the product's boundaries — security, deletion, data handling. All dead.
- **Fix:** Build one shared `DetailSheet` component. For each row, show a read-only panel with the current value and a note: *"This is how it will work in the real app — [one-line description]. You can change it here."* Example for App lock: *"Your app is locked with Face ID and unlocks after 5 minutes of inactivity. You can change the timeout or switch to passcode."*
- **Acceptance:** Every Connect row leads to a sheet, not a dead tap.
- **Est.** 45 min.

### 🔴 CR-8 — G2 new-invoice client is "Nik Jain"

- **Screen:** `G2NewInvoice`, line 1294
- **Issue:** Hardcoded client "Nik Jain" with line item "Marketing strategy consultation."
- **Why it matters:** She's Lindsay (Sails Up). "Nik" is not in her world. She asks "who's Nik?" and the demo framing breaks.
- **Fix:** Change client to `"TripAdvisor"` with line item `"April retainer — marketing strategy"` and `$6,500`. Already consistent with demo data in `D.clients`.
- **Acceptance:** All data on G2 is Sails-Up-native.
- **Est.** 2 min.

### 🔴 CR-9 — D1 Add → Photo routes to voice

- **Screen:** `D1Add`, line 771
- **Issue:** `{ icon:'📷', title:'Photo of a receipt', ..., target:'add-voice' }`
- **Why it matters:** Receipt photo is one of the product's core promises. Conflating it with voice is dishonest.
- **Fix:** Build a minimal `D2Photo` screen: fake iPhone camera viewfinder (dark background, rectangle overlay, shutter button), tap shutter → brief "Reading receipt…" spinner → parsed card showing vendor/amount/date + approval CTA. Mirror the structure of `D3Voice`'s parsed state.
- **Acceptance:** "Photo of a receipt" lands on a visibly photo-capture UI, produces a parsed card.
- **Est.** 45 min.

### 🔴 CR-10 — Undo toast is dead

- **Screen:** `Toast` component, lines 190–193; used in `ApprovalCard` confirm flow
- **Issue:** The word "Undo" is styled as clickable but has no handler.
- **Why it matters:** She'll confirm a card by accident (thumb brushes "Looks right"). Tapping "Undo" must work or she loses trust in the entire approval flow.
- **Fix:** Accept an `onUndo` prop on `Toast`, pass it from `ApprovalCard.confirm()`, and wire Undo to `setConfirmed(false); setToast(false);`.
- **Acceptance:** Tapping Undo reverts the card to pre-confirm state.
- **Est.** 10 min.

---

## Part B — Overwhelming screens (structure fixes)

Three screens violate the "max 3 items visible" rule from CLAUDE.md. Ranked by session impact.

### 🔴 ST-1 — B1 Penny Thread has 7 competing zones

- **Screen:** `B1Thread`, lines 548–586
- **Current zones above the fold:** Nav header, horizontal status strip (3 cards), thread body, inline review card, AskBar, TabBar, home indicator.
- **Fix:**
  1. Collapse the 3-card status strip into a single pill row: `This month: +$14.4k · Runway 7.2mo · Audit 82 ▾`. Tap to expand into the 3 cards.
  2. Move the inline review card INTO the thread as Penny's latest message: Penny says *"One thing needs your eyes"* and the Adobe card renders as her "bubble."
  3. Let the thread body grow vertically as a result.
- **Acceptance:** Above-the-fold count drops from 7 zones to 4 (header, collapsed status, thread, ask/tab at bottom).
- **Trade-off:** Loses at-a-glance dashboard. Document this as a settled decision — the thread is the hero, status strip is on-demand.
- **Est.** 45 min.

### 🟡 ST-2 — E1 My Books scrolls through 8 sections

- **Screen:** `E1Books`, lines 908–975
- **Current:** Lead card, side-by-side stats, period toggle, bar chart, income section, expenses section, invoices card, CPA export CTA. Long scroll.
- **Fix:** Render only the emphasis card (90-day net + sparkline) and a row of 4 pills: *Runway · Audit · Invoices · Export*. Each pill opens its drill-in. Put "Where money comes from / going" behind a single "See the breakdown ›" row under the emphasis card.
- **Acceptance:** My Books mobile fits in ~1.5 scroll heights.
- **Trade-off:** A QBO-literate user expects a dense dashboard. My view: keep density on web (spec 18), simplify on mobile (spec 17). You decide.
- **Est.** 60 min.

### 🟡 ST-3 — A3 Payment methods: 9 chips

- **Screen:** `A3Payment`, lines 306–331
- **Current:** Stripe, PayPal, Square/Cash App, Venmo, Zelle, Check, Direct deposit, Cash, Other.
- **Fix:** Group into two rows with a small label between: *Digital* (Stripe, PayPal, Square, Venmo, Zelle) and *Traditional* (Check, Direct deposit, Cash). Drop "Other."
- **Acceptance:** Visual scan takes <3 seconds.
- **Est.** 15 min.

### 🟢 ST-4 — F1 Connect is 13 rows

- **Screen:** `F1Connect`
- **Fix (post-demo):** Collapse the 5 preferences under a single "Preferences ›" row that opens a sub-screen.
- **Est.** 30 min. Post-demo.

---

## Part C — Interactivity upgrades (make it feel real)

Ranked by demo impact per hour. Top items overlap with Part A but are framed here as "upgrade to feel product-grade."

### Tier 1 — must feel real tomorrow (addressed by Part A fixes CR-2, CR-3, CR-4)

Plus:

### 🟡 INT-1 — Verify live Claude call works in demo environment

- **Screen:** `B1Thread`, line 536 (`window.claude.complete`)
- **Issue:** The live AI call is environment-dependent. If it fails silently, the whole demo collapses.
- **Fix:**
  1. Run the demo URL, open B1, send 3 test prompts (general, number-specific, hypothetical). Verify all return in <6s.
  2. Add a visible 5-second timeout with fallback message: *"Hmm, give me a second — trying again."*
  3. Have a backup device with the same demo loaded.
- **Acceptance:** Cold-open, 3/3 prompts answered in <6s.
- **Est.** 15 min (verification).

### 🟡 INT-2 — E1 period toggle should change the chart

- **Screen:** `E1Books`, period toggle lines 942–945
- **Issue:** Toggle updates its own styling but the bar chart is a static `Box` label.
- **Fix:** Add 3 more chart datasets (6mo, YTD, custom) — even as different Box labels ("Apr–Oct income vs expenses," etc.). Real chart not needed; she just needs to see the screen change.
- **Est.** 20 min.

### 🟡 INT-3 — Transaction detail screen

- **Screen:** New — link from `E4Transactions`
- **Issue:** Tapping any transaction routes back to `mybooks-home`. She can't see one.
- **Fix:** Build `E5Transaction` — vendor name, amount (editable), date, raw bank descriptor, category chip (tappable → C5), memo field, source bank, attached receipt thumbnail placeholder. Save button.
- **Est.** 45 min.

### 🟡 INT-4 — Invoice detail screen

- **Screen:** New — link from `G1Invoices`
- **Issue:** Tapping any invoice routes to `new-invoice` — she ends up in a wizard to create, not a view of the one she tapped.
- **Fix:** Build `G3ViewInvoice` — the paid/unpaid invoice rendered as a mini PDF-like preview, with status timeline (sent, viewed, paid).
- **Est.** 30 min.

### 🟢 INT-5 — Search actually searches

- **Screen:** `E1Books` nav, `⌕` glyph
- **Issue:** Routes to transaction list, no search input.
- **Fix:** Add a real filter input at top of transaction list. Filters `txns` array as she types.
- **Est.** 20 min.

---

## Part D — Tone guide audit (every screen)

Every copy change needed to bring the wireframe into alignment with `BookKeeping/product/tone-guide.md` v2. Grouped by screen, with the principle violated cited for each.

**Rules referenced:**
- **P-Lead** = Lead with human moment, then number
- **P-Plain** = Plain English, no jargon without translation
- **P-Short** = Short sentences, max 2 per bubble
- **P-OneAsk** = Never end with more than one question
- **P-FYI/Action** = Signal which type; never mix
- **P-Proportion** = Celebrate proportionally
- **P-Names** = Use the actual name, always
- **P-Anticipate** = Answer the next question in the same breath
- **P-Ownership** = It's the user's data/setting — say "your," not "I"
- **E** = Emoji: only 🎉 👋 ✓ 💪

### D.A1 Welcome

| Current | Issue | Proposed |
|---|---|---|
| "Hi — I'm Penny." | Missing 👋 on first hello (E). | **"Hi 👋 I'm Penny."** |
| "A calm friend for your books. I'll help you keep track without the anxiety." | Names the negative ("anxiety"). Penny replaces the bad feeling, doesn't name it. Also drifts from the tagline. | **"Your bookkeeper. Here for you. I'll keep your books clean so you can focus on your work."** |
| "Let's get started" | ✓ | keep |
| "I already have an account" | Dead link in demo; remove for tomorrow. | Remove for demo, restore post-demo and route to sign-in. |

### D.A2 Entity type

| Current | Issue | Proposed |
|---|---|---|
| "First — how are you set up?" | ✓ conversational, but "set up" is slightly software-y | **"First — how's your business set up?"** |
| "I ask so I can read your books the right way." | ✓ explains why | keep |
| "Sole proprietor (just me, no LLC)" | ✓ | keep |
| "Single-member LLC" | Acronym without plain-English. | **"Single-member LLC (it's just you)"** |
| "S-Corp-elected LLC" | Jargon without translation. | **"S-Corp-elected LLC (you pay yourself a salary)"** |
| "Not sure — help me figure it out" | ✓ shame-free | keep |
| "I can change this later." | P-Ownership: her setting, not Penny's. | **"You can change this anytime."** |

### D.A3 Payment methods

| Current | Issue | Proposed |
|---|---|---|
| "How do people usually pay you?" | ✓ | keep |
| "Tap all that apply." | Form-instruction tone. | **"Pick any that apply."** |

### D.A4 Bank connect

| Current | Issue | Proposed |
|---|---|---|
| "Let's connect your business bank." | ✓ | keep |
| "I'll only read — I never move money. I never share your data. (That's rule #1 and rule #4.)" | References undeclared rules. Violates P-Plain (assumes context she doesn't have). | **"I'll only read your transactions. I'll never move money, and I'll never share your data. Those are two rules I never break."** |
| "Connect via Plaid" | "Plaid" is a brand most consumers don't know. For Alex-persona, fine to show — it signals security. OK to keep. | keep |
| "I'll do this later" | ✓ | keep |

### D.A5 Notifications

| Current | Issue | Proposed |
|---|---|---|
| "How should I reach out?" | ✓ | keep |
| "Two modes. You can change this any time." | "Modes" is software-y. | **"You've got two choices. Change anytime."** |
| "Real-time / Best if you want to stay on top of every transaction" | Marketing-copy style, not Penny's voice. | **"Real-time / I'll ping you the moment money moves."** |
| "Daily digest / Best if you want your day uninterrupted" | Same. | **"Daily digest / One summary at the end of the day. Nothing in between."** |
| "What time works best?" | ✓ | keep |

### D.A6 Setup loading

| Current | Issue | Proposed |
|---|---|---|
| "Give me a minute — I'm reading your transactions." | ✓ | keep |
| "I'll surface the ones I'm most confident about first." | "Surface" is UX/product jargon. | **"I'll start with the ones I'm most sure about."** |
| "Connecting to Chase Business Checking… ✓" | ✓ functional log | keep |
| "Pulling 90 days of transactions… ✓" | ✓ | keep |
| "Matching vendors… ✓" | ✓ | keep |
| "Finding the clearest one to start with…" | ✓ | keep |

### D.A7 First card

| Current | Issue | Proposed |
|---|---|---|
| "I found a clear one to start with." | ✓ | keep |
| Card conf: "I recognize this — it's where you manage your marketing contacts." | ✓ P-Plain | keep |
| "This is how I'll usually work — I suggest, you confirm or correct." | ✓ sets expectation | keep |

### D.B1 Penny Thread — seed messages

| Current | Issue | Proposed |
|---|---|---|
| "👋 Welcome to Sails Up's books, Lindsay. I've pulled in 90 days of transactions — here's where we stand." | "here's where we stand" is corporate. Also: P-Short — "Welcome" and "here's where we stand" is two ideas per bubble (borderline). | **Bubble 1:** "Welcome back, Lindsay 👋"  **Bubble 2:** "I've pulled in 90 days of transactions. Here's the quick read." |
| "Your 90-day net income is $52,400. That's up $4,100 from the prior 90 days. 💪" | P-Plain: "net income" is jargon. P-Lead: leads with number not human moment. 💪 here risks over-celebrating a routine trend. | **"You took home $52,400 over the last three months. That's $4,100 more than the three before."** (drop 💪 — reserve for real milestones) |
| Mock user: "Nice! What was my biggest expense last month?" | ✓ | keep |
| "HubSpot was your biggest at $800 — your CRM subscription. Right behind it is your Regus Nashua co-working space at $350." | "CRM subscription" — inconsistent with A7 which says "where you manage your marketing contacts." Pick one. | **"HubSpot was your biggest — $800. That's where you manage your marketing contacts. Right behind: Regus Nashua, your co-working space, at $350."** |

### D.B1 Penny Thread — status strip labels

| Current | Issue | Proposed |
|---|---|---|
| "90-day net" | Jargon. | **"Last 3 months"** (and show the take-home number directly) |
| "Cash runway" | Startup-VC jargon — a consultant doesn't "burn." | **"Cash cushion"** or **"Months of cash"** |
| "at current burn" | Same. | **"at this spending rate"** |
| "Audit score" | Inconsistent — E3 uses "Audit-readiness." Pick one. | **"Audit-readiness"** everywhere |
| "↑ 3 pts" | ✓ | keep |

### D.B1 Inline review row

| Current | Issue | Proposed |
|---|---|---|
| "1 item needs your review ›" | Terse, app-y. | **"One thing needs your eyes ›"** |

### D.B1 Error bubble

| Current | Issue | Proposed |
|---|---|---|
| "Something's off on my end — I'm trying again. If it keeps happening, ping me in Discord." | ✓ calm. But "ping me in Discord" — most users don't know Discord. | **"Something's off on my end — I'm trying again. If it keeps happening, open the support chat."** |

### D.B3 Shame-free re-entry

| Current | Issue | Proposed |
|---|---|---|
| "Good to see you. I kept things tidy while you were out." | P-Short: two ideas per bubble. | **Bubble 1:** "Good to see you."  **Bubble 2:** "I kept things tidy while you were out." |
| "Nothing's on fire. You have a few transactions waiting whenever you're ready." | ✓ light, two bubbles? Currently one — acceptable. | keep |
| "MOST INTERESTING TO CATCH UP ON" | Label OK but "most interesting" is subjective/weird. | **"WORTH A LOOK"** |
| "Want to tackle these now, or start with the income? Your call." | ❌ P-OneAsk: two questions in one bubble. | **"Want to tackle these now? Or save them for later — your call."** (reshape as statement + one question) |

### D.C1 Expense card (HubSpot)

| Current | Issue | Proposed |
|---|---|---|
| "I recognize this — it's your CRM and marketing platform. You've confirmed it twice before." | Inconsistent with A7. Also mild redundancy. | **"I recognize this — where you manage your marketing contacts. You've confirmed it twice before."** |
| "Looks right ✓" | ✓ | keep |
| "Edit" | Misleading per CR-5. | **"Change category"** |
| "Not sure — ask me later" | ✓ shame-free | keep |

### D.C2 Low-confidence card (Regus)

| Current | Issue | Proposed |
|---|---|---|
| Bubble: "I don't recognize this one yet — can you help me?" | ✓ | keep |
| Card conf line: "I don't recognize this vendor yet — can you help me categorize it?" | ❌ P-Never-repeat — duplicates the bubble above. | **"New vendor. Categorize it once and I'll remember forever."** |
| "Help me categorize this" (dashed chip label) | ✓ | keep |
| "Pick a category" | ✓ | keep |

### D.C3 Income card (TripAdvisor)

| Current | Issue | Proposed |
|---|---|---|
| Bubble: "Income always needs your confirmation — I never auto-approve it." | ✓ trust-building | keep |
| Card conf: "Looks like your Needham, MA retainer client. Is this April's payment?" | ✓ uses context, one question | keep |
| "Client match: TripAdvisor — is that right? ›" (income row) | P-Never-repeat — asks what the conf line already asks. | **Drop this line.** The conf line already asks. |
| Confirm button: "Confirm — income from TripAdvisor" | ✓ | keep |

### D.C4 Income celebration

| Current | Issue | Proposed |
|---|---|---|
| "Nice — +$6,500 from TripAdvisor." | P-Lead: leads OK with "Nice" but not quite the "you just got paid" emotional frame. Scenario 1 model: "You just got paid 🎉" | **"TripAdvisor just paid 🎉"** — then below, `+$6,500` as the big number |
| "That's $20,000 confirmed this month. Last April you were at $17,200 at this point." | ✓ P-Anticipate (monthly total + YoY). Excellent. | keep |
| "Back to Penny" | ✓ | keep |
| "See my books →" | ✓ | keep |

### D.C5 Category picker

| Current | Issue | Proposed |
|---|---|---|
| "What category fits?" | ✓ | keep |
| Search placeholder: "Search categories…" | ✓ | keep |
| "Recently used" | ✓ | keep |
| "All categories" | ✓ | keep |
| "Split this transaction" | "Split" is accounting jargon for non-Alex users. | **"This was more than one thing"** |
| Category "Other Business Expense" | Fine for tax prep. | keep |

### D.C8 Rule proposal

| Current | Issue | Proposed |
|---|---|---|
| "I'm noticing a pattern — can I remember this?" | ✓ | keep |
| Card text: "When HubSpot shows up, categorize as Software & Subscriptions." | ✓ clear rule | keep |
| "Also apply to past 3 transactions?" | ✓ one question | keep |
| "Yes, remember this" | ✓ | keep |
| "Just this once" | ✓ | keep |

### D.D1 Add bottom sheet

| Current | Issue | Proposed |
|---|---|---|
| Title: "Capture a transaction" | "Transaction" is software-y; "capture" is slightly corporate. | **"Add something to your books"** |
| "Photo of a receipt" | ✓ | keep |
| "Point your camera at any receipt" | ✓ | keep |
| "Voice — tell me about it" | ✓ | keep |
| "Say what you bought and where" | ✓ | keep |
| "Type — add by hand" | ✓ | keep |
| "Enter the details manually" | "Manually" is slightly computer-ish. | **"Type in the details yourself"** |
| "Cancel" | ✓ | keep |

### D.D3 Voice capture

| Current | Issue | Proposed |
|---|---|---|
| Label: "Tap to start recording" | ✓ | keep |
| "Recording…" | ✓ | keep |
| Bubble: "Got it — let me parse that for you." | ❌ P-Plain: "parse" is NLP/developer jargon. | **"Got it — let me sort this out."** |
| Eyebrow: "Parsed from voice" | Same issue. | **"What I heard"** |
| "Looks right ✓" | ✓ | keep |
| "Re-record" | Technical. | **"Try again"** |

### D.D4 Manual entry

| Current | Issue | Proposed |
|---|---|---|
| Step header: "Step 1 of 4" etc. | ✓ | keep |
| "What was the amount?" | ✓ | keep |
| "Income or expense?" | Forces Alex to categorize a paradigm. | **"Did you pay, or get paid?"** |
| "Who did you pay (or who paid you)?" | ✓ conversational | keep |
| "What category fits?" | ✓ | keep |
| "Save transaction" | "Transaction" is software-y. | **"Save it"** |

### D.E1 My Books

| Current | Issue | Proposed |
|---|---|---|
| Title: "My Books" | ✓ | keep |
| Eyebrow: "90-day net income" | Jargon. | **"Last 3 months — take-home"** |
| Sub: "↑ $4,100 vs. prior 90 days" | ✓ | **"↑ $4,100 vs. the three before"** |
| Eyebrow: "Cash runway" | Jargon per D.B1. | **"Cash cushion"** |
| Sub: "at current burn" | Jargon. | **"at this spending rate"** |
| Eyebrow: "Audit score" | Inconsistency. | **"Audit-readiness"** |
| Sub: "↑ 3 pts this week" | ✓ | keep |
| Period toggle labels | ✓ | keep |
| Chart placeholder: "[ income vs. expenses bar chart ]" | N/A — placeholder | N/A |
| Section: "Where your money comes from" | ✓ excellent plain English | keep |
| Section: "Where it's going" | ✓ | keep |
| Section: "Outstanding invoices" | "Outstanding" is accounting. | **"Still to be paid"** |
| Card: "2 unpaid · $10,300" | ✓ | keep |
| Sub: "Next due: Segue Technologies · Apr 28" | ✓ P-Names | keep |
| CTA: "Export for my CPA →" | ✓ | keep |

### D.E2 Cash runway

| Current | Issue | Proposed |
|---|---|---|
| Title: "Cash runway" | Jargon. | **"How long your cash lasts"** |
| Value: "7.2 months" | ✓ | keep |
| Sub: "at current burn rate" | Jargon. | **"at this spending rate"** |
| Section label: "Here's how I calculated this:" | ✓ transparency | keep |
| Line: "Fixed monthly costs" | ✓ | keep |
| Line: "Committed subscriptions" | ✓ | keep |
| Line: "Trailing 90-day variable avg" | ❌ Finance/data jargon. | **"Variable spending (3-month average)"** |
| Line: "Current cash (Chase + Mercury)" | ✓ names accounts | keep |
| Card header: "What if I cut variable spend?" | "Variable spend" is accounting. | **"What if you spent less each month?"** |
| Slider label: "Cut by X%" | ✓ | keep |
| Footer: "This is an estimate based on your patterns. Real life varies." | ✓ calm caveat | keep |

### D.E3 Audit-readiness

| Current | Issue | Proposed |
|---|---|---|
| Title: "Audit-readiness" | ✓ | keep |
| Score "82 / 100" | ✓ | keep |
| Sub: "A tax professional could pick up your books with minimal cleanup. Here's what would tighten this up:" | ✓ excellent translation of score | keep |
| Item: "Receipts attached for expenses > $75" | Could clarify the $75 threshold. | **"Receipts attached for expenses over $75 (IRS threshold)"** |
| Item: "Client-matching for income" | Vague. | **"Each income matched to a known client"** |
| Item: "S-Corp salary on record (Gusto)" | ✓ | keep |
| Item: "Owner draws categorized" | "Draws" — S-Corp user knows, but plain English helps. | **"Owner distributions logged separately"** |
| Item: "Mileage logs for vehicle expenses" | ✓ | keep |
| Item: "1099 vendor readiness" | Jargon. | **"Contractors tracked for 1099 filing"** |
| Item: "Quarterly tax estimate current" | Terse + jargon. | **"Quarterly tax payment up to date"** |
| "Fix this ›" | ✓ | keep |

### D.E4 Transaction list

| Current | Issue | Proposed |
|---|---|---|
| Title: "All transactions · Apr" | "Transactions" is fine here (standard). | keep |
| Filter chips (Category, Date range, Amount, Source, Status) | ✓ | keep |
| Footer: "9 transactions · Net: +$14,351.01" | "Net" is accounting. | **"9 items · $14,351.01 after expenses"** |

### D.E7 CPA export

| Current | Issue | Proposed |
|---|---|---|
| Title: "Export — Step 1 of 3" | ✓ | keep |
| "Pick a period" | ✓ | keep |
| "Pick format" | ✓ | keep |
| Option: "PDF summary (1120-S mapped)" | Jargon without plain English. | **"PDF summary — organized for S-Corp tax filing (Form 1120-S)"** |
| Option: "CSV — all transactions" | ✓ | keep |
| Option: "QuickBooks-compatible (QBO)" | ✓ (QBO is known acronym) | keep |
| Option: "TurboTax Self-Employed" | ✓ | keep |
| Option: "H&R Block Self-Employed" | ✓ | keep |
| "How to deliver?" | ✓ conversational | keep |
| "Email to me" | ✓ | keep |
| "Share via CPA link (expiring)" | ✓ | keep |
| "Download to device" | ✓ | keep |
| "Generate export" | "Generate" is software-y. | **"Send it"** |

### D.F1 Connect home

| Current | Issue | Proposed |
|---|---|---|
| Title: "Connect" | Tab label — standing decision per app-spec. | keep |
| Section: "Connected" | ✓ | keep |
| Row sublabel: "Synced 2 min ago" | ✓ | keep |
| Row: "Gmail (receipt scanning)" / "Active" | ✓ | keep |
| "+ Add an account" | ✓ | keep |
| Section: "Preferences" | ✓ | keep |
| Row: "Notifications / Daily digest · 6:00 PM" | ✓ | keep |
| Row: "App lock / Face ID · 5 min timeout" | ✓ | keep |
| Row: "Accounting basis / Cash basis" | Accounting jargon without translation. | **"Accounting method / Cash basis"** with a sublabel "(you count money when it moves, not when it's earned)" — or a short info icon |
| Row: "Entity type / S-Corp elected LLC" | ✓ | keep |
| Row: "Data & privacy" | ✓ | keep |
| Section: "Account" | ✓ | keep |
| Row: "Open my support channel / Discord · powered by Penny" | "Discord · powered by Penny" — Discord as user-facing is confusing. | **"Chat with Penny support / Private, secure"** (Discord is the invisible tech) |
| Row: "Delete my account / Export and delete" | ✓ but could soften | **"Close my account / Download your data and close down"** |

### D.F3 Notifications prefs

| Current | Issue | Proposed |
|---|---|---|
| "Real-time" / "Daily digest" | ✓ | keep |
| Section: "Quiet hours" | ✓ | keep |
| "9:00 PM — 8:00 AM / Always on" | ✓ | keep |
| Section: "What to notify me about" | ✓ | keep |
| Row: "Approval nudges" | Slightly software-y. | **"When I need your eyes on something"** |
| Row: "Income confirmations" | Plain but terse. | **"When money comes in"** |
| Row: "Weekly compliance review · Sun 6 PM" | ❌ "Compliance review" is auditor jargon. | **"Sunday wrap-up · 6 PM"** |
| Row: "Quarterly tax reminders" | ✓ | keep |
| Row: "Anomaly flags" | ❌ "Anomaly" is data/fraud jargon. | **"When something looks off"** |
| CTA: "Turn all notifications off" | ✓ | keep |

### D.G1 Invoices

| Current | Issue | Proposed |
|---|---|---|
| Title: "Invoices" | ✓ | keep |
| Tabs: "Unpaid", "Paid", "Drafts", "Recurring" | ✓ | keep |
| Status: "Unpaid" / "Paid" / "Draft" / "Active" | ✓ | keep |
| "Due Apr 28" | ✓ | keep |

### D.G2 New invoice

| Current | Issue | Proposed |
|---|---|---|
| "New Invoice — Step 1 of 3" | ✓ | keep |
| Step 1 header: "Who and what" | Slightly flippant for an invoicing moment. | **"Client and line items"** |
| "Client" | ✓ | keep |
| Button: "+ Add line item" | ✓ | keep |
| "Total" | ✓ | keep |
| Step 2 header: "Customize" | ✓ | keep |
| Rows: "Logo / Brand color / Font / Payment terms" | ✓ | keep |
| Step 3 header: "Schedule & send" | ✓ | keep |
| Option: "Send now / Deliver immediately" | "Deliver" is email-platform speak. | **"Send now / I'll send it right away"** |
| Option: "Schedule / Pick a date" | ✓ | keep |
| Option: "Make recurring / Monthly, quarterly, custom" | ✓ | keep |
| Card: "Reminder cadence / 7 days before due · Day of due · 7 days after" | "Cadence" is business-speak. | **"Reminder schedule / A week before it's due · On the due date · A week after"** |
| CTA: "Send invoice" | ✓ | keep |

### D.H1 Payroll

| Current | Issue | Proposed |
|---|---|---|
| Title: "Payroll" | ✓ | keep |
| Sub: "Penny reads your payroll from Gusto. Running payroll happens in Gusto directly." | ✓ sets boundary | keep |
| Eyebrow: "Current pay period" | ✓ | keep |
| "Next run: May 1 · via Gusto" | ✓ | keep |
| Employee sublabel: "W-2 Owner-Employee · S-Corp" | Very jargon-dense. | **"You pay yourself a W-2 salary (S-Corp)"** |
| Line: "Gross salary" | ✓ | keep |
| Line: "Federal taxes withheld" | ✓ | keep |
| Line: "State taxes (NH)" / sub "$0 — no income tax" | ✓ | keep |
| Line: "Net pay" | ✓ | keep |
| Line: "Employer FICA (business cost)" | FICA is acronym. | **"Employer payroll tax (FICA) — paid by the business"** |
| Section: "Owner distributions (this month)" | ✓ | keep |
| Row: "Apr 3 — Business → Personal" | ✓ | keep |
| Sub: "Logged as owner's draw (distribution) — not payroll" | ✓ | keep |
| Link: "Why this matters →" | ✓ | keep |

### D.H3 S-Corp election

| Current | Issue | Proposed |
|---|---|---|
| Bubble: "I noticed you filed S-Corp election effective July 1, 2025. Here's how I'll handle your 2025 books…" | "I noticed" is passive/surveillance-y. | **"You filed S-Corp election on July 1, 2025. Here's how I'll handle your 2025 books."** |
| Card header: "2025 transition breakdown" | ✓ | keep |
| Item: "Sole proprietor rules (Schedule C)" | Jargon-dense. | **"Sole proprietor taxes (Schedule C on your personal return)"** |
| Item: "Profit and loss on your personal return" | ✓ | keep |
| Item: "S-Corp rules (1120-S)" | Same. | **"S-Corp taxes (Form 1120-S for the business)"** |
| Item: "Corporate return + K-1 for your personal return" | "K-1" assumed. | **"Business tax return + K-1 (your personal share of the business income)"** |
| Bubble 2: "Want me to re-run your 2025 categorization to reflect this? It only affects Jul–Dec transactions." | ✓ | keep |
| Button: "Yes, re-run 2025 categorization" | "Re-run categorization" is technical. | **"Yes — fix 2025"** |
| Button: "Not now" | ✓ | keep |
| Link: "Tell me more about draws vs. salary →" | ✓ | keep |

### D.I1 Backlog

| Current | Issue | Proposed |
|---|---|---|
| Title: "Your queue" | ✓ acceptable. Could be "To review" but "queue" reads fine. | keep |
| Sub: "No rush. Tackle these when you're ready." | ✓ excellent shame-free framing | keep |
| Group label: "From this week · 3" | ✓ | keep |
| Group label: "From last week · 2" | ✓ | keep |
| Dashed chip: "Help me categorize" | ✓ | keep |

### D.I2 Weekly batch

| Current | Issue | Proposed |
|---|---|---|
| Title: "Week of Apr 14" | ✓ | keep |
| Bubble: "Quick weekly check-in — here's what came up this week." | ✓ | keep |
| Row: "Income confirmed" | ✓ | keep |
| Row: "Expenses logged" | ✓ | keep |
| Row: "Items pending" | ✓ | keep |
| Row: "Quarterly tax estimate" / "$4,800 due Jun 15" | ✓ P-Anticipate | keep |
| Card: "Audit-readiness this week / 82 / ↑ 3 points from last week" | ✓ | keep |
| Card: "1099 candidates this year / 2 contractors paid over $600 YTD — I'll flag them in Q4." | ✓ | keep |
| Bubble: "3 transactions still need your eyes. Want to knock them out now?" | ✓ one question, light | keep |
| CTA: "See my queue →" | ✓ | keep |
| "I'll come back to it" | ✓ | keep |

---

## Part E — Flow breaks, inconsistencies, design-system drift

Non-copy issues that don't fit A/B/C/D.

### 🟡 E-1 — Inconsistent screen name: "Audit score" vs. "Audit-readiness"

- **Where:** B1 status strip says "Audit score", E3 title says "Audit-readiness", E1 card says "Audit score."
- **Fix:** Standardize on **Audit-readiness** everywhere. (Covered in Part D but flagged here as a global rename.)

### 🟡 E-2 — Inconsistent vendor description

- **Where:** A7 says "where you manage your marketing contacts." C1 says "your CRM and marketing platform."
- **Fix:** Use the A7 plain-English phrasing everywhere HubSpot appears.

### 🟡 E-3 — Transaction universe inconsistency

- **Where:** `I1Backlog` includes "Canva Pro $12.99" and "Zoom Pro $14.99" and "AWS $23.10" — none of these appear in `E4Transactions`.
- **Fix:** Add the three to the `E4Transactions` array so a user navigating between backlog and the list sees continuity.

### 🟡 E-4 — Date inconsistency: Segue Technologies

- **Where:** E1 says "Next due: Segue Technologies · Apr 28." G1 says "Due Apr 30."
- **Fix:** Standardize on Apr 28 everywhere.

### 🟢 E-5 — Iconography emoji vs. approved emoji

- **Where:** F1 Connect uses `🏦 🌊 💳 📧 🔔 🔒 ⚖️ 🏢 🔏 👤 💬 ⬇️`. D1 Add uses `📷 🎙 ✍️`. None are in the banned set (😊 👍 ✅ ⚠️), but the tone guide's emoji rule says only 🎉 👋 ✓ 💪 are allowed.
- **Fix (post-demo):** Either (a) formally add an "iconography emoji" exception to the design system and tone guide, or (b) replace with outline SVG glyphs. For tomorrow — leave as is; not session-critical.

### 🟢 E-6 — F1 "Open my support channel · Discord · powered by Penny"

- Copy change covered in D.F1. But also: the Discord branding itself is a trust signal risk for non-gaming users. Research lane — post-demo, test whether to mention Discord at all or just show "Penny support chat."

### 🟢 E-7 — Design system: clean, no drift

- PMark avatar: solid ink circle with white P ✓ per v2.0 (no old dashed style)
- Asymmetric bubbles: Penny 18/18/18/4, User 14/14/4/14 ✓
- Pill buttons (border-radius 999) ✓
- No Deep Ocean blue, no `#FAFAFA` ✓
- American English throughout ✓
- **No action needed.** Noting for completeness.

### 🟢 E-8 — localStorage persistence

- **Where:** Line 1608 persists the current screen ID to `localStorage`. Good for dev.
- **Issue for demo:** If the session is paused or app reloaded, the screen state is remembered. Could be helpful or confusing.
- **Fix for tomorrow:** Clear localStorage at session start. Or gate persistence behind `!demoMode`.

---

## Part F — New feature proposal: Conversational invoice creation (demo hero)

**Why this belongs in tomorrow's demo.** The whole pitch is *"Penny is an AI-first bookkeeper — conversation is the product."* Right now Penny answers questions. She cannot yet *do* things by conversation. The single highest-leverage thing we can add before tomorrow is letting Lindsay **create an invoice by typing or speaking one sentence**, then letting her restyle it by talking to Penny. It extends the already-wired B1 Claude integration, it plays to the existing S-Corp persona (she invoices clients like TripAdvisor monthly), and it directly anticipates what Lindsay will try when prompted *"ask Penny something you wish you could ask your bookkeeper."* If she says *"can you just send the TripAdvisor invoice for March?"* and Penny does it, the session ends with a signature.

Three tickets, in priority order. **FE-1 is the demo hero.** FE-2 and FE-3 are stretch.

### 🟡 FE-1 — "Invoice TripAdvisor $6,500 net 30, for March retainer" → Penny drafts it

- **Screen:** New intent inside `B1Thread` + existing `G2NewInvoice` as the preview surface.
- **Issue / gap:** Today invoicing is only reachable through the 3-step wizard at G1 → G2. A user who says it out loud to Penny (which she will) gets nowhere.
- **Why it matters (research framing):** In Q4 of the session guide we ask *"show me the moment you felt 'yes, I want this'."* Conversational invoice creation is the most likely moment she'll point to — it's the clearest demonstration that Penny is a *different kind* of tool than QBO. It's also the only feature that makes Penny feel like an *assistant* rather than a *reporting app*.
- **Fix (build spec):**
  1. Extend B1 Claude prompt with a lightweight intent classifier. If user message matches an invoice-create intent (keywords: "invoice," "bill," "send … $…," "charge …"), Penny replies in two parts:
     - **Part A (inline bubble, Penny voice):** *"Drafting that now — give me a second."*
     - **Part B (approval-card-style invoice draft bubble):** renders a new `InvoiceDraftCard` inside the thread with:
       - Client name (parsed or "Who's this for?" if missing)
       - Amount (large hero)
       - Terms (Net 30 default, or parsed)
       - One-line description ("March retainer")
       - 2 CTAs: **Send** (primary, pill, `--ink`) · **Preview / edit** (secondary, routes to G2 pre-filled)
  2. If any field is missing, Penny asks **one** follow-up question, never a form. *(Tone: P-OneAsk.)*
  3. Parsing: use Claude with a structured JSON schema prompt (`{ client, amount, terms, description }`). Temperature 0. Retry once on malformed output, then fall back to "I'll open the invoice screen for you — you can fill it in there ›" routing to G2.
  4. On **Send** tap, Penny replies *"Sent to TripAdvisor. I'll nudge them if it's still open on May 15. 🎉"* (using the 🎉 per emoji rule, and the anticipate-next-question tone rule).
- **Copy (tone-guide-compliant):**
  - Drafting: *"On it. Drafting a $6,500 invoice for TripAdvisor, Net 30. Give me 2 seconds."*
  - Missing client: *"Who am I sending this to?"*
  - Missing amount: *"How much is this one?"*
  - After send: *"Sent. TripAdvisor has 30 days. I'll follow up on May 15 if it's still open. 🎉"*
- **Acceptance:**
  - Typing *"send tripadvisor $6500 invoice net 30 for march retainer"* in B1 produces an InvoiceDraftCard with all fields correctly parsed, rendered in the thread, within 6 seconds.
  - Typing *"invoice zappos"* (amount missing) produces **one** follow-up question — not a form, not a wall of text.
  - Tapping **Preview / edit** lands in G2 with all parsed fields pre-filled (including client "TripAdvisor" — fixes CR-8 on this path too).
  - Tapping **Send** returns the confirmation bubble and appends an "Open · TripAdvisor · $6,500" row to G1 invoices list.
- **Est.** 60 min (intent classifier + InvoiceDraftCard component + G2 pre-fill plumbing).

### 🟢 FE-2 — "Make it more minimal" / 3 template variants

- **Screen:** New `G2aStyles` modal reached from G2 **Customize** button, plus conversational restyle from B1.
- **Issue / gap:** D80 (from spec-brainstorm v2.2) commits to pixel-perfect customization as a hard rule. Tomorrow we can showcase the *conversational* path to it without building the full customizer.
- **Why it matters:** This is the moment Penny stops being *a form with a chatbot glued on* and becomes *a designer who listens*. Even if only 3 templates exist, watching Lindsay say *"make it less corporate"* and see the invoice restyle live is the shortest path to *"I've never seen a product do that."*
- **Fix (build spec):**
  1. Define 3 templates as CSS variants of the same invoice HTML — no new layout engine:
     - **Classic** — black ink on white, serif-free, left-aligned — current default.
     - **Minimal** — hairline rules only, no filled blocks, extra white space, amount right-aligned hero.
     - **Bold** — `--ink` color block header, logo top-left, amount as 72pt hero, single accent rule.
  2. In G2, add a **Style** label row with 3 thumbnails. Tapping a thumbnail swaps the preview immediately.
  3. In B1, extend the intent classifier for restyle verbs ("more minimal," "add my logo," "bolder," "simpler," "less corporate," "more professional"). On match, Penny replies *"Try this."* and re-renders the InvoiceDraftCard preview thumbnail with the matching template. The style toggle persists on the draft.
  4. No free-form CSS generation for tomorrow. Map restyle phrases → {Classic, Minimal, Bold} via Claude with a closed label set. Unknown phrases get: *"I've got three looks for now — Classic, Minimal, Bold. Want to try one?"*
- **Copy:**
  - On restyle: *"Try this — the Minimal version."*
  - Unknown style request: *"I've got Classic, Minimal, and Bold for now. Want me to try one?"*
  - Logo add: *"Added your logo up top. Want me to keep that for all future invoices?"* (this earns us a rule-proposal moment — links to C.8 pattern.)
- **Acceptance:**
  - G2 Style row visible; tapping each thumbnail swaps preview under 200ms.
  - Saying *"make it more minimal"* in B1 after FE-1 swaps the draft's preview to Minimal.
  - Saying *"can you make it bolder and add my logo"* swaps to Bold variant with a placeholder Sails Up logo block.
- **Est.** 60 min (3 CSS variants + thumbnail row + restyle intent branch).

### 🟢 FE-3 — Voice-to-invoice

- **Screen:** Existing mic button on `B1Thread` AskBar + `D3Voice` capture mode.
- **Issue / gap:** The mic is currently decorative on B1. If Lindsay taps it and it doesn't work, the entire voice narrative collapses.
- **Fix (build spec for tomorrow):**
  1. Option A (honest, 10 min): disable the mic button visually when demo mode, or add a tiny helper on first tap: *"Voice dictation is live on iOS — try it from the Penny app."* This at least explains the gap.
  2. Option B (real, 45 min): wire `SpeechRecognition` Web API behind the mic button. On permission grant, capture the utterance, drop it in the AskBar as text, fire the same B1 send handler. Everything else routes through FE-1. This gives Lindsay the full voice-to-invoice moment: she taps mic, says "send tripadvisor sixty-five hundred net thirty," watches Penny draft it.
  3. For Safari-only fallback, add a 3-second "I'm listening…" indicator on the AskBar (simple animated dot row).
- **Acceptance (Option B):**
  - Tap mic → browser permission prompt once → utterance appears in AskBar text field → on stop, auto-fires send handler → InvoiceDraftCard appears.
- **Est.** 10 min (Option A) · 45 min (Option B).

---

## Build order recommendation for Claude Design

Given ~3 hours of build time tonight, hit in this order:

**Hour 1 (must-ship, foundation):**
- CR-1 (`?demo=real` chrome toggle) — 20 min
- CR-2 (B3 AskBar live) — 15 min
- CR-3 (D4 amount input) — 10 min
- CR-8 (G2 client rename) — 2 min
- CR-10 (Undo toast) — 10 min
- E-1 global rename ("Audit-readiness") — 5 min

**Hour 2 (interactivity realism):**
- CR-4 (C5 commits) — 20 min
- CR-5 (Edit → Change category, option a) — 5 min
- CR-7 (Connect 9 dead rows, read-only panels) — 35 min

**Hour 3 (demo hero — FE-1):**
- **FE-1 (Conversational invoice creation from B1 → InvoiceDraftCard → send / preview) — 60 min.** This is the single highest-leverage addition for tomorrow. Without it, Penny answers questions; with it, Penny does work.

**Hour 4 (copy pass — Part D):**
- Apply all tone-guide fixes in Part D. Alphabetized by screen makes this a linear find-and-replace pass — est. 60–75 min if done carefully.

**If time remains (Tier 2 / stretch):**
- FE-2 (3 invoice templates + restyle-by-voice) — 60 min — the "I've never seen a product do that" moment.
- FE-3 Option B (real voice-to-invoice) — 45 min — use only if Safari testing clean; fall back to FE-3 Option A otherwise (10 min).
- CR-6 (E3 Fix this → seeded Penny bubble) — 30 min
- CR-9 (D1 Photo → new D2Photo screen) — 45 min
- INT-2 (period toggle changes chart) — 20 min
- ST-1 (B1 thread zone collapse) — 45 min

**Explicit non-goals for tomorrow:**
- INT-3 transaction detail · INT-4 invoice detail · INT-5 real search · ST-2 My Books restructure · ST-4 Connect grouping · E-5 iconography emoji decision. These are post-demo tickets.

---

## LEARN
The most expensive mistake in usability testing is **running the session while the prototype is broken in places the user will touch.** A user who hits 3 dead ends in the first 10 minutes stops exploring and starts narrating to be polite. The copy work in Part D matters because the product's voice IS the product — if HubSpot is "your CRM and marketing platform" on one screen and "where you manage your marketing contacts" on another, the user senses they're talking to a system, not a friend.

## NEXT
Once Claude Design has the Hour 1 fixes in, the next best question to ask is: *"Can you run the entire tour end-to-end as if you were Lindsay and flag any additional click I thought would work but doesn't?"* That catches anything this review missed.
