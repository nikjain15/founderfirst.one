# Penny Demo v2 — Wireframe Stress Test & Hi-Fi Handoff Brief

*Written for Claude Design. Feedback only — not implementation. Every item is screen-level, actionable, and grounded in either the spec, the design system, or the tone guide.*

*Last updated: 21 April 2026 (late evening) · Input file: `Penny Demo v2 Standalone.html` · 34 screens across 10 sections.*
*Revision: added PART J — Entity-Type Parity Audit (Sole Prop / Single-member LLC / S-Corp / Partnership) per CEO request to ensure the demo holds up for any entity Lindsay might turn out to be.*

---

## 1. Purpose of this document

Nik is demoing Penny Demo v2 to a real prospect tomorrow — **a close match to the Lindsay persona: S-Corp-elected LLC, marketing/consulting agency, ~$20k/mo, based in NH**. The goal is **to convert her into a beta design partner**.

The prospect's bar is high: *"even one thing missed, she won't sign up."* This document is the audit that gets us there, and the brief for taking the wireframe from lo-fi to a production-quality hi-fi that can be shipped to a small beta.

Three roles read the wireframe, in order:

1. **UX/UI researcher** — can a real user get from screen 1 to "I want this" without a single friction point that breaks trust or clarity?
2. **Product manager** — is the signup flow complete and is every feature represented faithfully to the spec we agreed?
3. **Bookkeeper expert** — would a CPA looking over the prospect's shoulder nod or wince?

Anchors used throughout:

- `BookKeeping/design/design-system.md` v2.0 (FF.one-aligned tokens)
- `BookKeeping/product/tone-guide.md` v2 (7 conversation rules + 8 scenarios)
- `BookKeeping/product/solopreneurs/17-mobile-screens-and-flows.md` (current mobile spec)
- `BookKeeping/product/spec-brainstorm-decisions.md` v2.2 (86 locked decisions)
- `BookKeeping/engineering/implementation-strategy.md` v2 (tech scope)

---

## 2. Summary verdict

Penny Demo v2 is a **strong prototype with a clean structure, tight component set, and real live-AI hooks** (Claude parses invoices, SpeechRecognition drives the mic, status strip summarizes metrics). The core loop — approve → celebrate → rule propose — works. The spine is sound.

It is **not yet ready for a signup-conversion demo** because:

- **Three brand/design compliance violations** break the "one visual system" promise (color used as primary income/expense signal, wrong error red, warn-yellow background). If the prospect also looks at FounderFirst.one or expects production polish, these read as "early prototype" and erode credibility.
- **Five tone violations** slip into copy that the spec explicitly bans ("forever", "I recognize this" before any confirmation, 3rd-person "she" references, two-idea bubbles, a canned "Welcome back" at minute 1).
- **Seven onboarding friction points** leave the prospect without a value hook, without trust signals at the right moment, and without a pre-committed "here's how Penny works" explainer — the three things a prospect needs to say yes.
- **Four bookkeeper-expert gaps** — reasonable-compensation signal, multiple owner draws, mileage logging, CPA preview — will raise eyebrows from an S-Corp owner whose CPA is judging this with her.
- **One consistency bug** (Q1 tax due date shown as Apr 15 on one screen and Jun 15 on another) will be spotted immediately by a demanding user.
- **The entire wireframe is S-Corp-coded** — A2 pre-selects S-Corp, C.9 is S-Corp owner's-draw, H1/H3 are S-Corp dashboards, the tax hub defaults to 1120-S. If Lindsay turns out to be a Sole Proprietor, a Single-member LLC (no S-Corp), or a Partnership, the demo breaks. Part J audits this in full.

**Recommended outcome:** a ~1-day pass that fixes Part A (10 items), tightens Part B (10 items), passes the design-system and tone audits (Part C, D), addresses Part E bookkeeper gaps, and layers in Part J entity-parity (minimum: A2 5-option, 4-question diagnostic, thread reads entity state, partnership realistic mock). Part F, G, H describe the hi-fi upgrade Claude Design should undertake once the demo is done.

---

## 3. How to read this document

Every item in Parts A–E follows the same shape:

> **ID** — Screen reference
> **What it does today:** the current behavior in Demo v2.
> **Why it breaks the demo:** which lens flags it (UX / PM / Bookkeeper) and how it reads to Lindsay.
> **Change to make:** a concrete, unambiguous direction Claude Design can execute. No multiple options — one recommendation.

Numbered so Nik can triage and hand cleanly to Claude Design.

---

## PART A — Critical demo fixes (must-fix before tomorrow)

These are the items that, if left as-is, make Lindsay hesitate, ask an uncomfortable question, or leave without signing up. **Ship none of the rest if you only have time for these 10.**

---

### A-1 — A1 Welcome: missing "why me, why now" hook

**What it does today:** "Hi 👋 I'm Penny. Your bookkeeper. Here for you. I'll keep your books clean so you can focus on your work."
**Why it breaks the demo:** (UX + PM) Lindsay has been pitched Bench, QuickBooks Self-Employed, Xero, and Wave. She has skin-in-the-game scars from bad bookkeepers. Generic friendly copy makes Penny feel like "yet another tool." There's no specificity that says *this is built for my situation.*
**Change to make:** Rewrite as two bubbles that name her situation by 6 AM. First bubble: "Hi 👋 I'm Penny. I'm a bookkeeper built for owners like you — solo, LLC or S-Corp, running everything yourself." Second bubble: "Clean books, ready for your CPA, without the spreadsheet shame. Sound useful?" The "Let's get started" button becomes "Yes, let's go" (conversational commit), secondary link "Not sure yet — show me first" opens a 30-second demo-mode thread with canned data.

---

### A-2 — A2 Entity type: pre-selected S-Corp feels coerced

**What it does today:** The S-Corp LLC option is visually pre-selected with an ink background, the other three are outline. Tapping any option advances the flow.
**Why it breaks the demo:** (UX + PM) Pre-selecting an option before the user has read the question is a dark pattern. The prospect will notice. Also, D83 (our locked decision) requires a real "Not sure — help me figure it out" diagnostic, not a cosmetic option that just advances.
**Change to make:** No pre-selection. All four options look equal at load. Tapping "Not sure" opens a 3-question diagnostic in-thread: (1) Do you take a regular salary from your business? (2) Did you file Form 2553? (3) Did you set up an LLC? — then Penny explains the result and sets the entity. This matches D83. For the demo, have the diagnostic work end-to-end for at least the S-Corp path.

---

### A-3 — A4 Bank connect: "I'll do this later" is a conversion hole

**What it does today:** Below "Connect via Plaid", a ghost button "I'll do this later" routes to A5 notifications and onward into the app with no bank data.
**Why it breaks the demo:** (PM) Per the spec, "first approved transaction as fast as possible" is the defining onboarding promise. Without a bank, the app can show nothing real. If Lindsay defers here during the demo, everything after this is theater. This escape route actively undermines the single most important moment in the conversion funnel.
**Change to make:** Remove "I'll do this later" entirely. Replace with a secondary link: "See a sample book first (takes 30 seconds)." This enters demo mode with pre-populated fake data — same screens, clearly labeled "Sample" in the status strip. Once the prospect is hooked, a persistent in-thread nudge asks to connect the real bank. The Plaid connect stays the main path.

---

### A-4 — A6 Setup loading: too fast to be credible, too generic to be specific

**What it does today:** 4 steps cycle every ~1.1s: "Connecting to Chase… ✓", "Pulling 90 days of transactions… ✓", "Matching vendors… ✓", "Finding the clearest one to start with…". Total ~5 seconds.
**Why it breaks the demo:** (UX) Real Plaid + matching takes 15–30s. The demo's 5 seconds reads as either "this is fake" or "this product doesn't actually do much." Generic "matching vendors" lines don't show the work. Lindsay needs to see Penny actually reading *her* data.
**Change to make:** Stretch to ~18–22 seconds total. Replace generic steps with specific, named finds as they stream in: "Reading your Chase transactions… 483 found." "Found HubSpot, Adobe Creative Cloud, Regus Nashua, Gusto…" "Recognized TripAdvisor, BAE Systems, Stonyfield as your clients." "Flagged 2 charges I don't know yet — I'll ask about those." "Setting up your books the S-Corp way (salary + distributions)." End with one personalized insight: "You took home $17,200 this April. That's $4,100 more than last April." This is where Penny *earns* the next screen.

---

### A-5 — A7 First card: "I recognize this" contradicts zero history

**What it does today:** HubSpot card conf line: "I recognize this — where you manage your marketing contacts. Confirming it once will set the rule forever."
**Why it breaks the demo:** (UX + Tone) Lindsay has just signed up 30 seconds ago. Penny has *no prior confirmation* to recognize. The copy is a lie Lindsay's intuition will catch. Also: "forever" is too strong per tone guide (Scenario 5 uses "from now on"). And C1 later says "You've confirmed it twice before" on the exact same vendor — contradicting A7.
**Change to make:** Rewrite A7 conf line: "This one looks clean — HubSpot is a marketing software you've been paying $800/month for since January. I'll suggest **Software & Subscriptions**." No "I recognize," no "forever." In C1 (later in the flow, after some approvals), the copy can legitimately say "You've confirmed this twice — safe to auto-categorize going forward." Keep the two consistent in time sequence.

---

### A-6 — B1 Penny thread: the "$52,400 over 3 months" message is unearned

**What it does today:** Opens with "Welcome back, Lindsay 👋", then immediately: "I've pulled in 90 days of transactions. Here's the quick read. You took home $52,400 over the last three months. That's $4,100 more than the three before."
**Why it breaks the demo:** (UX + Tone) (a) "Welcome back" — Lindsay just finished onboarding; she never left. (b) "Pulled in" is jargon. (c) The "$4,100 more than before" comparison is suspicious when Penny has only had access to the bank for 5 seconds of setup. Lindsay will ask "how do you know what 'before' was?" This is the #1 credibility trap.
**Change to make:** Replace opener with: "All set, Lindsay — I've read your books." Second bubble: "You've taken home **$52,400** these past 3 months. Your biggest client is TripAdvisor at $6,500/month." Drop the "vs. the 3 before" claim entirely for first-run; it can appear after 2 weeks of real data. Replace with "Want me to show you what I found, or would you rather poke around?"

---

### A-7 — B1 inline approval nudge: broken affordance

**What it does today:** A Penny bubble contains: "One thing needs your eyes — [Adobe Creative Cloud $54.99 ›]" where only the second half is tappable as a link.
**Why it breaks the demo:** (UX) Mixing tappable and non-tappable text inside the same bubble is ambiguous. Tap target < 44pt. Tap-misses feel sloppy.
**Change to make:** Replace with a dedicated bubble-adjacent chip: below the bubble, a full-width card "1 thing needs your eyes → Adobe Creative Cloud · $54.99" with chevron, tappable anywhere. Distinct from Penny's bubbles visually (smaller border, paper background).

---

### A-8 — E3 Audit-readiness: the red ✗ during a demo is an anxiety grenade

**What it does today:** "Quarterly tax payment up to date" shows red ✗ with "$4,800 due" and a seeded message about being 6 days late.
**Why it breaks the demo:** (Bookkeeper + PM) Showing a real user a red ✗ on her tax status *mid-demo* plants anxiety in the wrong moment. She's not here to be reminded she's late. Worse, I-2 Weekly Batch later says the same quarterly payment is "$4,800 due Jun 15" — but Q1 was Apr 15, Q2 is Jun 15. One demo, two different stories. Inconsistency = credibility collapse.
**Change to make:** For tomorrow's demo, swap the ✗ item to something less loaded: "Mileage logs for vehicle expenses" shown as dashed "–" with "Fix this" as an optional nudge. Score stays 82. Keep Q1 tax as a "–" (pending) shown with "Your Q1 estimate was filed — I'll remind you 14 days before Q2 (due Jun 15)." Align I-2 to the same Q2 date. One consistent tax story throughout.

---

### A-9 — C3 Income card: only one CTA, no verification path

**What it does today:** "Confirm — income from TripAdvisor" is the only button besides "Not sure — ask me later." No way to add a note, no way to say which month's payment this is for.
**Why it breaks the demo:** (Bookkeeper) S-Corp owner tracking retainers across months needs to know: is this April's retainer or May's early? Does she want to log it as a specific invoice payment? The single CTA reduces the card to a trust fall — fine for a first demo click, but a real user will ask "which month is this?"
**Change to make:** Below the confirm CTA, add a subtle meta row: "Marked as April 2026 retainer · [Change month ›]". Tapping opens a month picker. Also add an optional "Add a note" affordance that defaults hidden. Keep the card minimal; expose depth when asked.

---

### A-10 — Missing screen: "Here's how I work" explainer (90-second onboarding value hook)

**What it does today:** Nothing. Between A4 bank connect and A5 notifications, there's no moment that tells Lindsay *what Penny will actually do for her*.
**Why it breaks the demo:** (PM) Prospects convert when they can mentally picture the product's loop: *money moves → Penny catches it → I tap approve → done.* Without that mental model, onboarding is a series of forms. No "aha."
**Change to make:** Insert a new screen A4.5 between bank connect success and notifications. Three short Penny bubbles, each with one micro-illustration: (1) "When money moves in your accounts, I'll see it first." (2) "I'll sort it into the right category, and ask you once." (3) "You tap **Looks right ✓** — and your books stay clean. That's it." CTA: "Got it — keep going." 10 seconds of reading, but it's the moment the concept clicks.

---

## PART B — High-priority polish (should-fix before demo)

These are second-tier — not signup-blockers, but they visibly separate a polished product from a prototype. Prioritize in order.

---

### B-1 — A2 Entity: "S-Corp-elected LLC (you pay yourself a salary)" is reductive

**Problem:** "you pay yourself a salary" misses distributions — which are half the point of S-Corp. Lindsay knows this.
**Change:** "S-Corp-elected LLC (salary + distributions)." Reads competent.

---

### B-2 — A3 Payment methods: unclear why we're asking

**Problem:** No context line explaining why Penny needs this.
**Change:** Add a single sentence above the chips: "So I know what to look for in your bank feed — and what to send invoices through when you're ready." Covers both the read-side purpose and sets up invoicing later.

---

### B-3 — A3 Payment methods: "Check" and "Direct deposit" both belong in "Traditional" but overlap

**Problem:** Direct deposit IS an ACH bank transfer, which Chase already reads. Showing it as a separate input source confuses.
**Change:** Rename to "Wire or ACH (paid into my bank)" and keep "Check" and "Cash" as the other two. Remove the duplicate semantics.

---

### B-4 — B1 Status strip: tap targets route everywhere to mybooks-home

**Problem:** All three chips (Cash cushion, Audit-readiness, Still to be paid) navigate to the same screen. Cash cushion should go to E2, audit to E3, "still to be paid" should go to G1 Invoices/Unpaid.
**Change:** Wire each chip to its specific deep link.

---

### B-5 — B1 Thread: two-idea bubble breaks tone rule

**Problem:** Bubble 2 says "I've pulled in 90 days of transactions. Here's the quick read." — that's two ideas ("I did the thing" + "here's the result") in one bubble. Tone guide rule 1: one idea per bubble.
**Change:** Split into two bubbles: "I've read your books 📖" / "Here's what I found." (First avatar shown, second avatar hidden per spec.)

---

### B-6 — C2 Low-confidence vendor: Regus Nashua is too easy a case

**Problem:** Lindsay will recognize her own co-working space in 2 seconds. Low-conf case is supposed to stress-test the ambiguous-vendor UX.
**Change:** Swap to a harder low-conf case for the demo: `AMZN MKTP US*9H4V2 · -$127.43` with conf line "This is from Amazon but I can't see what you bought — could be office supplies, equipment, or personal. What should I call it?" This showcases Penny's genuine limits and honesty. Lindsay will respect this more than a softball case.

---

### B-7 — C4 Income celebration: tone is too loud for an S-Corp owner

**Problem:** 56pt 🎉 + 48pt $6,500 + "Last April you were at $17,200" — feels more Robinhood than bookkeeper. Tone guide: "celebrate proportionally" — a recurring retainer isn't a windfall.
**Change:** Calm the screen. 🎉 stays (it's the approved emoji for income per tone guide) but at 36pt. Headline: "TripAdvisor came through — +$6,500." Under it: "That's $20,000 confirmed this month." Kill the YoY comparison on a routine retainer. Reserve big celebration for a genuine best-month-ever moment.

---

### B-8 — D1 Add sheet: three equal options miss the hero

**Problem:** Photo/Voice/Type listed as equals. Photo is the killer feature (receipts, mileage, equipment). Voice is novel but rarely used for bookkeeping. Type is fallback.
**Change:** Re-order to emphasize Photo. First item bigger (camera icon larger, short caption "Most receipts land here"). Voice and Type in a compact row below. For first-time users, consider auto-opening the camera when they hit the Add tab — skip the menu.

---

### B-9 — D4 Manual entry: 4-step wizard is too many taps for a small addition

**Problem:** Amount → dir → vendor → category = 4 screens for "I bought a $12 coffee." Compare to Venmo's one-screen flow.
**Change:** Collapse to a single screen with all four fields visible. Amount is the hero at top; dir is a toggle below; vendor is an autocomplete text input; category is a picker. Save button at bottom. Wizard mode only if user explicitly asks for "walk me through it."

---

### B-10 — E7 CPA Export: TurboTax option isn't validated yet

**Problem:** Option "TurboTax Self-Employed" is listed but per implementation-strategy §C4, the path is TurboTax-via-QBO, not direct TurboTax export. Shipping this before the partnership is confirmed is a promise we can't keep.
**Change:** Remove "TurboTax Self-Employed" as a standalone option. Keep "QuickBooks-compatible (QBO)" — which TurboTax imports natively. If the prospect asks "what about TurboTax?", the answer is: "The QBO export works straight into TurboTax Self-Employed."

---

## PART C — Design-system v2.0 compliance audit

The wireframe is ~80% compliant with `design-system.md` v2.0 and the FF.one tokens. These are the gaps. Fix all of them in the hi-fi pass.

---

### C-1 — Color used as primary signal for income/expense (CRITICAL violation)

**Design-system says:** "Income vs. expense is distinguished by `+` / `−` prefix, not color. Do not introduce additional accent colors."
**Wireframe does:** Income shown in `#2E7D32` green, expenses in `#D32F2F` red, in approval cards, transaction lists, transaction detail, backlog.
**Fix:** Amounts are always `--ink`. The `+` or `−` prefix and the size is the signal. Red reserved for error states only (e.g., E3 audit-readiness failure icon), and only at the spec'd `#b2291e` hue.

---

### C-2 — Error red uses wrong hex

**Design-system says:** Error `#b2291e` — inline use only.
**Wireframe does:** `errRed:'#D32F2F'` everywhere.
**Fix:** Replace `#D32F2F` → `#b2291e`.

---

### C-3 — Warn-yellow background on Close-account detail

**Design-system says:** No warn-yellow in the palette. Destructive actions use `.btn-ghost` plus a confirm step, not color highlight.
**Wireframe does:** `background:'#FFF3CD'` warning block on ConnectDetail.close.
**Fix:** Replace with a paper-background Card, ink body text, italic 13px caption. No color.

---

### C-4 — Ask Penny bar uses wrong styling

**Design-system says:** `.ask-bar` is 6px 11px padding, `--paper` background (warm off-white), 14px placeholder, 32×32 button.
**Wireframe does:** 8px 16px padding, mixes `--paper` and `--ink` border incorrectly, placeholder is 14px but input font is 16px (correct for iOS), button is 32×32 (correct).
**Fix:** Match spec exactly: `padding: 6px 11px`, `background: var(--paper)`, `border: 1.5px solid var(--ink)`, placeholder "Ask Penny or add something…".

---

### C-5 — PBubble radius is 18/18/18/4 but padding is 12/14, spec is 16/20

**Design-system says:** Penny bubble padding `16px 20px`.
**Wireframe does:** `12px 14px`.
**Fix:** Increase padding to spec. Thread looks cramped at 12/14.

---

### C-6 — Missing PENNY eyebrow label on first-in-group bubbles

**Design-system says:** "First bubble in a group: P-mark to the left + **PENNY** label (eyebrow style: 10px/600/0.12em uppercase)."
**Wireframe does:** Avatar appears on first bubble in group, no eyebrow label.
**Fix:** Add PENNY label above the first bubble's text (small eyebrow, grey `--ink-4`). Subsequent bubbles in the group keep no avatar and no label.

---

### C-7 — Phone shell border color

**Design-system says:** `border: 2.5px solid var(--ink)`.
**Wireframe does:** Correct (`2.5px solid ${T.ink}`). ✓

---

### C-8 — Tab bar Add icon looks like an outline circle

**Design-system says:** Add is a native tab with a label, not a FAB.
**Wireframe does:** Correct (it's a tab). ✓ — but the icon "⊕" is generic. Consider a plus-in-square for stronger affordance matching the other tab icons.

---

### C-9 — Income celebration uses a 56pt emoji

**Design-system says:** No rule explicitly sets emoji size but spacing/sizing specs cap card values at 46px.
**Wireframe does:** 56pt 🎉 above a 48pt $ amount.
**Fix:** Reduce emoji to 36pt per B-7 above; amount to 46pt max.

---

### C-10 — Toast positioning

**Design-system says:** Toast `bottom: 28px`, fixed.
**Wireframe does:** `bottom: 100` (positioned absolutely inside phone shell to clear the tab bar).
**Fix:** The 100px offset is actually correct for app context (needs to clear the tab bar + ask bar). Update the design-system doc to reflect app-specific positioning: "Toast above the ask bar — `bottom: 100px` inside phone shell."

---

### C-11 — Phone shell padding at `16px` for content margins

**Design-system says:** Screen horizontal padding (mobile) 20–24px.
**Wireframe does:** 16px on most screens.
**Fix:** Increase to 20px minimum for all content margins. The current tight padding is why the thread feels cramped (see C-5).

---

### C-12 — Home indicator opacity

**Design-system says:** `--ink` at 18% opacity.
**Wireframe does:** `opacity:0.18`. ✓

---

## PART D — Tone-guide v2 compliance audit

The 7 rules from `tone-guide.md`. Sweep every Penny string against these.

---

### D-1 — Rule 1 (Use names and context): inconsistently applied

**Pass:** "HubSpot was your biggest — $800." ✓
**Fail:** A7 conf line "This one looks clean" — doesn't use "HubSpot" in the opener.
**Fix:** Always name the vendor first where possible. "HubSpot looks clean — $800 a month since January."

---

### D-2 — Rule 2 (Anticipate the next question): underused

**Fail:** B1 thread, "HubSpot was your biggest — $800. That's where you manage your marketing contacts. Right behind: Regus Nashua, your co-working space, at $350." — good. But doesn't answer the implicit "is that normal?" question.
**Fix:** Add one more bubble: "Your software spend is about 4% of revenue — that's healthy for your type of business." Scenarios 3 and 4 model this pattern.

---

### D-3 — Rule 3 (FYI vs action needed): not visually distinguished

**Problem:** Every Penny bubble looks the same. User can't tell at a glance if she needs to act.
**Fix:** For hi-fi, introduce a subtle differentiator: action bubbles end with a visible inline chip or card (existing approval card pattern works). FYI bubbles never end with a question or a chip. Also — add the eyebrow label "FYI" or "NEEDS YOU" to the very first bubble in a group to set expectation. Use sparingly.

---

### D-4 — Rule 4 (Remember what Alex tells her): not demonstrated in demo

**Problem:** Nowhere in Demo v2 does Penny show she remembered something the user said. This is the scenario 2 moment — the one that builds trust.
**Fix:** Add to demo: after user confirms TripAdvisor income, next session bubble: "I'll look for TripAdvisor around the 15th each month — their usual day. I'll stop asking." This is a high-trust-earning line.

---

### D-5 — Rule 5 (Keep nudges light): "forever" violates

**Problem:** "Categorize it once and I'll remember forever" (C2). "Confirming it once will set the rule forever" (A7). "Forever" is a heavy word and tonally too strong.
**Fix:** Replace "forever" with "from now on" everywhere. Scenario 5 models this: *"I'll recognize Cloudways automatically from now on."*

---

### D-6 — Rule 6 (Never repeat herself): breaks at A7 → C1

**Problem:** A7 shows HubSpot for the first time. C1 shows HubSpot again with "You've confirmed it twice before." The demo has Penny confirming the same vendor twice in ~30 seconds of tour.
**Fix:** For demo flow coherence, A7 uses HubSpot for the first-ever confirm. C1 demonstrates a *different* high-confidence approval — e.g., Google Workspace $36 — with copy "I've seen this three months in a row — confident it's Software & Subscriptions." This prevents the same-vendor-twice inconsistency.

---

### D-7 — Rule 7 (Close the loop): mostly fine, but confirmation toast copy is thin

**Problem:** Toast "✓ Confirmed." doesn't add the one useful follow-up number per scenario 4.
**Fix:** Post-confirm toast evolves to carry context: "✓ HubSpot · Software · $800 this month." The running-total hint is the Scenario 4 "Adobe came through again — $320 in software this month total" pattern.

---

### D-8 — Third-person "she" references break voice

**Problem:** ConnectDetail ('add-account'): "She supports Plaid (for banks), Stripe, PayPal…" — suddenly Penny is described in 3rd person. Voice should be first-person Penny.
**Fix:** Rewrite all Connect detail bodies in Penny's voice. "I work with Plaid (for banks), Stripe, PayPal, Venmo (through PayPal's partner path), Zelle (through your bank feed), and Gmail or Outlook for receipt scanning. I only read — I never move money or share what I see."

---

### D-9 — "Pulled in" is jargon

**Problem:** B1 thread "I've pulled in 90 days of transactions." "Pulled" is dev-speak.
**Fix:** "I've read your last 90 days."

---

### D-10 — "Canceled" not "cancelled"

**American English sweep:** Spot-check the whole wireframe for British spellings. One I caught: none in the code, but sweep anyway. Also "categorize" (✓), "recognize" (✓) look correct. Verify in the hi-fi pass.

---

## PART E — Bookkeeper-expert gaps (S-Corp specific)

Lindsay's CPA is watching this demo over her shoulder. These are the things the CPA will flag.

---

### E-1 — Reasonable compensation is unspoken

**Issue:** H1 Payroll shows Lindsay taking $5,500/mo W-2 ($66k/yr) on ~$240k revenue. The IRS "reasonable compensation" test often flags this as low for a marketing consultant (typical comp: $85k–$130k). If Penny silently records this without a reasonable-comp signal, the CPA will say "that's a red flag you didn't catch."
**Fix:** Add a discreet reasonable-comp advisor nudge in H1, not as a warning, but as a one-line check. "Your W-2 salary is $66k this year — I can help you check if this matches what the IRS considers reasonable for your role. [Let's check ›]" — routes to a conversational check-in that asks about role, location, hours, and returns a range. Non-blocking, non-judgmental.

---

### E-2 — Only one owner distribution shown

**Issue:** H1 shows Apr 3 distribution of $14,500 as the only draw for the month. Real S-Corp owners draw 2–4 times a month (variable). Showing one looks like Penny only catches round numbers.
**Fix:** Show 3 draws (e.g., Apr 3: $10,000 · Apr 15: $3,500 · Apr 28: $1,000) with a monthly total of $14,500 at top. Models real cash flow. Demonstrates Penny's ability to track all of them.

---

### E-3 — Mileage logging is in audit-readiness but not in capture

**Issue:** E3 audit-readiness lists "Mileage logs for vehicle expenses" as an item to fix. But D1 Add sheet has no mileage option. The prospect will ask: "how do I log a trip?"
**Fix:** Add a fourth option to the Add sheet: "Log a trip (miles)." Routes to a mini-flow: start/end location (with Google Maps autofill), or just "home to client in Needham" and Penny infers the mileage from past trips. Include a "I drove about X miles" voice entry path.

---

### E-4 — Contractors 1099 tracking is "hidden in Q4"

**Issue:** I2 Weekly batch mentions "I'll flag them in Q4." E3 audit-readiness shows "–" for contractors. But Lindsay's current year contractor spend is invisible. CPAs want this visible year-round.
**Fix:** In E1 My Books, add a fifth quick-access pill: "1099 contractors" → "2 tracked · $4,200 YTD." Tapping opens a list of vendors-paid-over-$600 with YTD totals and a "Issue 1099" link for Q1 2027.

---

### E-5 — Cash vs accrual toggle not visible to user

**Issue:** F1 Connect → Accounting method shows "Cash basis" as static detail. Per spec, cash+accrual toggle is in launch scope — user should be able to switch and see how it changes the reports.
**Fix:** Make the Accounting method row in F1 a real toggle screen: "Cash (default) / Accrual" radio with plain-English description. Preview the P&L change: "If you switched to accrual, your April income would go from $20,000 to $23,800 because TripAdvisor's May invoice was sent in April."

---

### E-6 — No depreciation or asset tracking

**Issue:** S-Corp owners with equipment (laptop, phone, vehicle if used for business) expect to see depreciation in reports. It's not mentioned anywhere in the demo. Sophisticated prospects will ask.
**Fix:** In E3 audit-readiness, add an 8th line item: "Equipment depreciation tracked." Default `–` (pending setup). Tapping routes to a "Tell me about equipment you use for your business" conversational flow. This isn't a demo-blocker but shows the roadmap intent.

---

## PART F — Simplification opportunities (minimalism)

Things the wireframe has that can be cut, collapsed, or defaulted — without losing features from the spec.

---

### F-1 — Collapse A3 Payment methods into the A4 bank connect screen

The payment methods picker is asking a question we can mostly answer from the bank feed itself. If Stripe payouts hit Chase, we know Stripe is in use. Make A3 an optional follow-up after A6 loading, not a pre-bank step. This saves 20 seconds in onboarding.

---

### F-2 — Default A5 Notifications to daily digest, skip the screen

Daily digest is already pre-selected and marked recommended. Most users accept the default. Move notifications to an in-thread "Just so you know — I'll send a daily digest at 6 PM. Change anytime in Connect." bubble. Saves a full screen from onboarding.

---

### F-3 — Merge F1 Connect's "Accounting method" and "Entity type" into one "How I read your books"

These are two rows that map to one concept ("how Penny interprets your books"). Merge into one row that expands inline when tapped. Reduces the Preferences section from 5 items to 4.

---

### F-4 — Kill "See the breakdown ›" + "income + spending by category" redundancy in E1

Two lines saying the same thing. Keep one: "See the breakdown ›" with chevron.

---

### F-5 — Category picker: suggest top 3, offer search

C5 currently shows 10 categories + recent. For a first-time user, this is overwhelming. Penny should suggest the top 3 most likely categories based on the vendor, with "Search all categories" as fallback. If Penny is 80%+ confident in one, pre-select it and offer "Change."

---

### F-6 — Status strip (B1) and My Books (E1) are duplicating metrics

Status strip in B1 shows: "Last 3 months: +$52.4k · Cash cushion 7.2mo · Audit-readiness 82." E1 shows the same + more. Recommend: B1 collapses into a single tiny pill "3 items need your eyes" (most-urgent action cue). Full metrics live in E1 only. One source of truth.

---

## PART G — Interactivity upgrades for "more real" demo

These are the things that make a lo-fi wireframe feel like a working product when demoed. High-leverage, most are small.

---

### G-1 — Seed the A6 loading with Lindsay's actual vendors

Per A-4 above, name specific vendors as Penny "finds" them. This is the #1 "wow" moment of the demo.

---

### G-2 — B1 thread opens with a 30-second tour offer

First Penny bubble: "Want a 30-second tour of what I found, or would you rather poke around?" Two chips: [Show me the tour] [Let me poke around]. The tour is a scripted walkthrough (money in → money out → cushion → audit → first approval). Poke-around drops into free-chat. Gives the demo-giver a clean path and also works as a real first-run feature.

---

### G-3 — Voice capture actually works (SpeechRecognition already wired)

The code has `useSpeechRecognition` using `webkitSpeechRecognition`. Make sure it works on the demo device. Prompt Nik to say "I paid $35 cash for parking at the client site" and watch Penny parse it live. This is a signature demo moment — live voice → live category.

---

### G-4 — Invoice parse via Claude (already wired)

`parseInvoiceWithClaude` is in the code. Demo script should include: in B1 Penny thread, type "send an invoice to TripAdvisor for $6,500 for April retainer." Claude parses, Penny shows the InvoiceDraftCard inline. This is the second signature "wow" moment — conversation → action.

---

### G-5 — Tab bar badge on Penny tab

When items are in the backlog, Penny tab shows a small badge: 1 ⦿. Subtle, production-feeling.

---

### G-6 — Status bar time shows live or scripted time

Currently hardcoded "9:41" (Apple marketing time). For demo, set to live device time — matches the sense that this is *my* phone. Or script it to match the story ("9:02 AM, Apr 21" to align with the HubSpot transaction).

---

### G-7 — D2 photo capture shutter feedback

Add a haptic-like micro-feedback on shutter tap: whole viewfinder flashes white for 80ms, a faint click sound if possible. Tiny detail but reads as "real camera app."

---

### G-8 — E2 Cash cushion slider updates live

The slider already updates the number. Make sure the demo-giver scrubs it to show Penny's math adjusting in real-time. This is a high-agency moment for the prospect — "I can see what happens if I cut spending."

---

## PART H — Hi-fi handoff brief for Claude Design

*This is the brief for the post-demo upgrade from lo-fi wireframe to a production-quality hi-fi. Written for Claude Design to pick up and execute after the demo.*

### H-1 — What "hi-fi" means for Penny

A hi-fi Penny build is **not** a pixel-perfect mockup. It is:

- **A functional, demo-able app** rendered in HTML/React that runs in-browser exactly as it would on a real phone.
- **Production-quality visual polish** — type hierarchy, whitespace, hierarchy, animation timing all match what a shipped iOS app looks like at launch. No placeholder text, no `[chart]` boxes, no italic grey "sparkline goes here" labels.
- **Design-system v2.0 compliance** — every token, component, spacing value matches the spec exactly. Zero custom hex codes outside the palette.
- **Tone-guide v2 compliance** — every Penny string passes the 7 rules.
- **Real interactions** — voice input works, invoice parse works, all transitions are animated (slide-in sheets, fade-in messages, smooth tab switches), approval cards animate confirm-to-toast, runway slider updates live.

### H-2 — What to keep from v2

- 34-screen structure — no screens to add or remove beyond the A4.5 explainer and the mileage capture flow (E-3 above).
- Live Claude integration points — invoice parse, Penny thread responses, shame-free re-entry.
- SpeechRecognition voice capture.
- PhoneShell with keyboard-arrow navigation for presenter mode.
- Demo mode via `?demo=real` URL param.
- `localStorage` state persistence for screen memory across refreshes.
- Tab-bar structure (Penny / Add / My Books / Connect).

### H-3 — What to change (summary from Parts A–E)

**Top-priority structural changes (affects flow):**
1. Onboarding: remove "I'll do this later" (A-3), extend setup loading with specific vendors (A-4), add "how I work" explainer A4.5 (A-10), remove entity pre-selection (A-2).
2. Penny thread: rewrite opening bubbles (A-6), replace inline link with adjacent card (A-7), wire status-strip chips to individual deep links (B-4).
3. Audit-readiness: fix the Q1/Q2 date consistency and soften the red ✗ (A-8).
4. Income card: add month-picker meta (A-9).
5. First approvals: rewrite HubSpot copy and sequence (A-5, D-6).

**Top-priority component/visual changes:**
1. Remove all income/expense color coding (C-1). Amounts in ink.
2. Error red → `#b2291e` (C-2).
3. Warn-yellow → paper Card (C-3).
4. Ask Penny bar → match spec (C-4).
5. Bubble padding 16/20 (C-5).
6. Add PENNY eyebrow labels (C-6).
7. Screen padding 20px (C-11).

**Top-priority copy changes:**
1. "Forever" → "from now on" everywhere (D-5).
2. Third-person "she" → first-person in Connect details (D-8).
3. "Pulled in" → "read" (D-9).
4. Split two-idea bubbles (B-5).
5. Post-confirm toast carries running total (D-7).

**Top-priority bookkeeper additions:**
1. Reasonable-comp advisor nudge in H1 (E-1).
2. Multiple owner draws (E-2).
3. Mileage capture in Add sheet (E-3).
4. 1099 contractors pill in My Books (E-4).
5. Accounting-method toggle in F1 (E-5).

### H-4 — New screens to design for hi-fi

- **A4.5** "How I work" explainer (3 bubbles + illustrations).
- **Entity diagnostic** for A2 "Not sure" path.
- **Reasonable-comp check-in** from H1.
- **Mileage capture** under D1 Add.
- **Accounting method toggle + preview** under F1.
- **1099 contractors list** from E1.

### H-5 — Screens that can stay close to v2

B3 (re-entry), D2 (photo capture), D3 (voice capture), E2 (cash runway), E4 (transactions), E5 (transaction detail), F3 (notifications prefs), G3 (invoice detail), H3 (S-Corp election), I2 (weekly batch) — all are solid as-is with just the Part C/D polish.

### H-6 — Success criteria for hi-fi

The hi-fi is ready when:

- A second prospect (different from Lindsay) can be handed the phone cold and reach "I want to be a beta partner" within 3 minutes.
- A CPA can look over a user's shoulder and not find a red flag in 5 minutes of review.
- A designer can open the HTML file and tick every row in the design-system compliance checklist.
- Every Penny string passes tone-guide Rule 1–7 review.
- Voice and invoice-parse work reliably in Chrome and Safari on iOS.
- The demo runs without a single hardcoded shortcut or faked interaction — every screen responds to real input.

### H-7 — Out of scope for hi-fi v3

- Federated learning UI (launch scope, but not demo critical).
- Discord support chat integration (E41 per implementation-strategy).
- Multi-currency mode (spec'd for launch, not demo critical).
- Full CPA share-link landing page (web-only surface per 18-web-screens).
- Web desktop version (stays wireframe until mobile hi-fi is shipped).

---

## PART I — Consistency bugs and housekeeping

Small catch-all items that don't belong in Parts A–E but should be fixed.

---

### I-1 — Q1 tax due date: Apr 15 in E3, Jun 15 in I2

See A-8. Pick one quarter and tell one story throughout.

---

### I-2 — Lindsay's entity state is inconsistent

A2 offers entity selection (Lindsay picks S-Corp LLC). H3 says "You filed S-Corp election on July 1, 2025." These should be consistent: the onboarding picker and the historical context line should agree on entity + effective date. For demo, pick "S-Corp-elected LLC, elected July 1, 2025."

---

### I-3 — Bank feed shows "Synced 2 min ago" but loading took 5 seconds

A6 loading lasts 5 seconds. F1 shows "Chase · Synced 2 min ago." Inconsistent time frames. Fix: F1 shows "Synced just now" after fresh onboarding, evolves to "2 min ago" after time passes.

---

### I-4 — Edit history in E5 uses three different author types

`Bank import`, `Penny`, `Lindsay` as authors in the edit history. Clean convention: `Bank` (not "Bank import"), `Penny`, `You` (not "Lindsay" — the user reading their own history expects "You").

---

### I-5 — Currency formatting inconsistency

Some amounts show as `$800` (no decimals), others as `$54.99`. Rule: always 2 decimals for amounts under $1000, no decimals for whole amounts ≥ $1000. Example: `$54.99`, `$800.00`, `$6,500`, `$52,400`.

---

### I-6 — Emoji in copy: only 4 allowed per tone guide

Sweep for: 🎉 ✓ 👋 💪. Reject: 😊 👍 ✅ ⚠️. I see `⚡` used as a flash icon in D2 photo capture — acceptable as a UI icon (not a message emoji). OK to keep.

---

## PART J — Entity-Type Parity Audit (Sole Prop / Single-member LLC / S-Corp / Partnership)

### J-0 — Why this audit exists

Demo v2 is S-Corp-coded throughout: A2 pre-selects S-Corp, the approval card C.9 is S-Corp owner's draw, H1/H3 are S-Corp dashboards, the tax hub defaults to 1120-S. That's an artifact of building around the Lindsay persona — but Lindsay's actual entity is not yet confirmed and she could turn out to be any of:

- **Sole Proprietor** — Schedule C, Schedule SE, quarterly estimated tax, no payroll, no reasonable-comp rule
- **Single-member LLC (no S-Corp election)** — federally identical to sole prop (disregarded entity), different liability framing
- **LLC with S-Corp election** — 1120-S, required W-2 reasonable compensation, distributions, K-1 to owner
- **Partnership / Multi-member LLC** — 1065, K-1 per partner, capital accounts, guaranteed payments

If the wireframe doesn't reflow convincingly for the path she actually picks, the demo breaks. Worse: it reads as "this product is built for one situation and I'm not it."

**Scope rule (CEO decision):** Partnership is **demo-only at launch**. The wireframe must render a convincing partnership flow end-to-end so a partnership prospect can say yes, but engineering scope for v1 stays solo-only (Sole Prop / Single-member LLC / S-Corp LLC). Spec updates required — see J-11.

Every rule below is grounded in IRS tax law and current Penny spec. Where tax law and spec disagree, flagged explicitly.

---

### J-1 — Entity-surface matrix (IRS-grounded)

This is the spine Claude Design should build against. For every entity, these surfaces appear / don't appear / reshape.

| Surface | Sole Prop | Single-member LLC | S-Corp LLC | Partnership |
|---|---|---|---|---|
| **Federal filing** | Schedule C (Form 1040) | Schedule C (disregarded entity) | Form 1120-S | Form 1065 |
| **Self-employment tax** | Schedule SE on net profit | Schedule SE on net profit | FICA on W-2 only; no SE on distributions | Schedule SE on active partners' share |
| **Owner compensation** | Owner's draws from net profit (not deductible) | Same as sole prop | **Required W-2 salary** (reasonable comp) + distributions | **Guaranteed payments** (deductible) + distributive share |
| **Payroll connection** | N/A | N/A | **Required** (Gusto / OnPay / QBO Payroll per D72) | Optional — only for non-partner W-2 employees |
| **Quarterly estimated tax** | Form 1040-ES on owner | Form 1040-ES on owner | 1040-ES on distributions + W-2 withholding | 1040-ES per partner |
| **K-1** | — | — | K-1 (1120-S) to sole owner | K-1 (1065) per partner |
| **Reasonable-comp advisor** | — | — | **Required** — industry benchmark + safe-harbor flag | — (no reasonable-comp rule for partnerships) |
| **Capital-account tracking** | — | — | Simplified basis (stock + debt basis) | **Full per-partner capital account** |
| **Owner draw in approval cards** | Generic transfer — not a special card | Same as sole prop | **C.9 Owner distribution** — distinct card, affects basis | Two cards: **C.10 Guaranteed payment** (deductible) + **C.11 Partnership distribution** (not deductible) |
| **1099-NEC received** | Yes, from clients | Yes, from clients (EIN) | — (clients pay S-Corp TIN; owner gets W-2) | Received by partnership, flows through 1065 |
| **1099-NEC issued** | Yes, contractors >$600 | Yes | Yes | Yes |
| **Mileage / home office** | Schedule C line 9 + Form 8829 | Same as sole prop | **Accountable-plan reimbursement** (not Schedule C) | Per partnership agreement; may use accountable plan |
| **Depreciation / §179** | Schedule C line 13 + Form 4562 | Same | Form 4562 on 1120-S | Form 4562 on 1065 |
| **Audit-readiness components** | Categorization + receipts + mileage + SE accuracy | Same as sole prop | Adds reasonable-comp + distribution recording | Adds capital-account accuracy + K-1 math + guaranteed-payment classification |
| **Tax Hub default view** | Schedule C + SE + 1040-ES | Same | 1120-S + reasonable-comp + K-1 + 1040-ES | 1065 + per-partner K-1 + capital accounts + per-partner 1040-ES |
| **P&L framing** | "Your net profit" | "Your LLC's net profit" | "Your S-Corp's net income" | "Partnership net income" + per-partner allocation |
| **Entity phrase in copy** | "your business" / "Schedule C" | "your LLC" / "Schedule C" | "your S-Corp" / "1120-S" | "the partnership" / "1065" |
| **Multi-user / share links** | Owner + CPA | Owner + CPA | Owner + CPA + bookkeeper | **Each partner as a user** + CPA + bookkeeper |

---

### J-2 — A2 onboarding: five equal options, no pre-selection

**What Claude Design must change on A2:**

- Five equally-weighted options, **none pre-selected** at load:
  1. **Sole Proprietor** — *"Just me, no separate business entity."*
  2. **LLC (single-member)** — *"I set up an LLC, but it's just me and I haven't elected S-Corp."*
  3. **LLC with S-Corp election** — *"I filed Form 2553 and pay myself a salary."*
  4. **Partnership / Multi-member LLC** — *"Two or more owners sharing profit."*
  5. **Not sure — help me figure it out** — *"I'll ask 4 quick questions and we'll work it out together."*
- All five are outlined pill buttons at load. No dark pre-fill. User taps one to select, taps "Continue" to advance. (Fixes Part A-2 dark pattern and extends it to 5 options.)
- Each sub-label is the plain-English test that identifies the entity. If you recognize yourself in the sub-label, you pick it.
- Heading copy: *"What's the legal structure of your business?"* — single question, no paragraph.
- Secondary eyebrow below heading: *"This determines how I'll track your books and what tax forms we'll be prepping for."*

---

### J-3 — "Not sure" diagnostic: 4 questions (extends D83)

D83 locked the diagnostic at 3 questions. Adding partnership as an entity type requires a partnership-detection question first. Log as **D83.1**.

**New 4-question tree:**

**Q1** — *"Is your business just you, or do you have co-owners or partners?"*
- *"Just me"* → continue to Q2
- *"I have co-owners"* → **Partnership / Multi-member LLC**. Penny narrates: *"You're in a partnership. Each partner reports their share on a K-1. I'll track the partnership's books and each partner's capital account."* → "Got it" advances to A3.

**Q2** — *"Do you take a regular salary — a W-2 paycheck — from your business?"*
- *"Yes, regular W-2"* → continue to Q3
- *"No, I just transfer money to myself when I need it"* → continue to Q4
- *"Not sure what that means"* → inline explainer bubble: *"A W-2 salary means your business runs payroll and withholds taxes from each paycheck, like an employer. A draw is when you just move money from your business account to your personal one."* → re-ask Q2.

**Q3** — *"Did you file Form 2553 with the IRS?"*
- *"Yes"* → **LLC with S-Corp election**. Penny narrates: *"You're an S-Corp. I'll track your W-2 salary, distributions, and make sure you're at a reasonable compensation level."* → advance.
- *"No" / "Not sure"* → continue to Q4 (S-Corp requires Form 2553; if they don't know, they're not an S-Corp).

**Q4** — *"Did you register an LLC with your state?"*
- *"Yes"* → **LLC (single-member)**. Penny narrates: *"You're a single-member LLC. For tax purposes, the IRS treats you the same as a sole proprietor — you'll file Schedule C. But your LLC gives you liability protection. I'll remember both."*
- *"No"* → **Sole Proprietor**. Penny narrates: *"You're a sole proprietor. Your business income flows straight to your personal tax return on Schedule C. Simple."*

**Copy rule:** every resolution names the entity plainly, explains the one thing it means for her in a sentence, then advances with a single "Got it" button. Never stacks two ideas in one bubble (tone rule).

---

### J-4 — Per-entity path audit

For each entity: what appears, what must be suppressed from the S-Corp default, what copy changes.

#### J-4.a — Sole Proprietor path

**Tab 1 — Penny thread:**
- Welcome: *"You run your business as a sole proprietor. Your income and expenses flow to your Schedule C on your 1040. I'll keep that clean."*
- **Suppress:** payroll connection prompt (A3), reasonable-comp advisor, distribution cards (C.9), W-2 capture flow, K-1 references.
- **Surface:** Schedule SE impact on net-income updates, quarterly 1040-ES reminders with specific amount + due date, transfer-to-personal as a benign narration (not a nag).
- **Approval cards available:** C.1 / C.2 / C.3 / C.4 / C.5 / C.6 / C.7 / C.8. **Not:** C.9 / C.10 / C.11.
- Transfer-to-personal handling: appears inside C.1 with suppressed-expense framing — *"Looks like a personal transfer. I won't count it as a business expense."* No basis math.

**Tab 3 — My Books:**
- P&L header: "Net profit" (not "Net income").
- Under net profit, estimated SE tax line: *"Estimated self-employment tax on this profit: $X"*.
- Quarterly ES tax card with next due date + amount.
- **Suppress:** reasonable-comp section, W-2 section, distribution tracking.

**Tab 3 — Tax Hub** *(when shipped):*
- Primary: Schedule C preview.
- Secondary: Schedule SE worksheet.
- Quarterly: 1040-ES with next date + amount.
- 1099s: contractors paid (NEC-issuance tracking).

**Copy replacements vs. S-Corp default:**
- "your S-Corp" → "your business"
- "your 1120-S" → "your Schedule C"
- "W-2 salary" → (suppressed)
- "distribution" → "owner draw" / "transfer to personal"

#### J-4.b — Single-member LLC (no S-Corp election)

Federally identical to Sole Prop (disregarded entity). Everything in J-4.a applies. **Differences:**

- Copy says "your LLC" where relevant (welcome bubble, My Books header).
- Tab 4 Connect adds **state-registration prompt**: *"What state is your LLC registered in?"* — drives annual state-report reminder. Ask once, remember.
- Business-banking gentle nudge: *"Is your bank account in your LLC's name? Keeping it separate protects your liability shield."* Educational, one-time, not a blocker.
- Welcome bubble tweak: *"You run a single-member LLC. For taxes, the IRS treats you like a sole proprietor — Schedule C. But your LLC gives you liability protection. I'll remember both."*

**Why this distinction matters even though the tax treatment is the same:** her CPA will ask *"Did you preserve the corporate veil?"* Penny surfacing LLC hygiene reads as expert.

#### J-4.c — LLC with S-Corp election (current default — gaps vs. spec)

This is what Demo v2 codes to. Mostly correct. Gaps to fill before this path reads credibly to a CPA:

**Confirmed correct:**
- 1120-S framing in thread and My Books.
- C.9 distribution card.
- H1 S-Corp dashboard, H3 mid-year S-Corp election narration (per D72).

**Gaps that must be filled (overlaps with Part E):**
- **E-1: Reasonable-compensation advisor is missing.** Must add, fired unprompted within first 60 seconds post-onboarding: *"As an S-Corp owner, the IRS requires a reasonable W-2 salary. Based on your industry (marketing consulting) and revenue ($20k/mo), a reasonable range is $X–$Y. You're currently at $W — inside / outside the safe harbor."* Static safe-harbor table is acceptable for tomorrow's demo; live benchmarking (RC Reports or equivalent) for beta-1.
- **E-2: Multiple owner distributions in a month aren't batched.** Must narrate: *"That's your 3rd distribution this month, $12k total. Want me to track these toward year-end K-1?"*
- **Mileage capture is referenced in audit-readiness but has no capture flow.** Must add — voice or photo capture into an accountable-plan reimbursement log.
- **1099-NEC issuance is hidden.** Must surface in Tax Hub as a contractor-paid list with per-contractor totals.

**S-Corp copy rules:**
- "your S-Corp" / "your 1120-S" consistent across thread and My Books.
- W-2 section always visible in My Books, showing YTD salary vs. reasonable-comp benchmark.
- Distributions section shows basis impact in plain English: *"$X of your $Y basis remaining."*

#### J-4.d — Partnership / Multi-member LLC (demo-only, must feel realistic)

**Onboarding delta — after A2 resolves to Partnership, A3 is extended:**

- *"How many partners in total, including you?"* — options 2 / 3 / 4+ (for the demo, hardcoded to 2).
- *"What's the profit-split arrangement?"* — equal / custom percentages / per partnership agreement. For the demo, hardcoded to 60/40 with Lindsay at 60.
- Per partner: name + email + role (managing / active / silent). For the demo, one hardcoded named co-founder (e.g., "Sarah Kim").
- Penny narrates: *"Each partner will be a user in Penny. I'll send invites after the bank connection. Your CPA gets view access too. The partnership files a 1065, and each of you gets a K-1 for your personal taxes."*

**Tab 1 — Penny thread:**
- Welcome bubble: *"You run a partnership. Each partner's share of profit and loss flows to their personal 1040 via K-1. I'll track the partnership's books and each partner's capital account."*
- **New card C.10 — Guaranteed payment** — for fixed payments to active partners (salary-equivalent). Deductible by partnership. Example narration: *"$3,000 monthly guaranteed payment to Sarah, per your partnership agreement. Recording as deductible — it reduces partnership net income and shows up on Sarah's K-1 as guaranteed-payment income."*
- **New card C.11 — Partnership distribution** — profit distribution beyond guaranteed payments. Not deductible; affects capital account. Example narration: *"You took a $5,000 partnership distribution. That's not deductible — it reduces your capital account from $42k to $37k. Approve?"*
- Deposit narration includes per-partner split: *"This Stripe deposit of $18,500 will be allocated 60/40 between you and Sarah per your agreement — $11,100 to you, $7,400 to Sarah. Approve?"*
- **Suppress:** W-2 salary flow (partners can't be W-2 from their own partnership — IRS rule), reasonable-compensation advisor, S-Corp distribution card C.9.

**Tab 3 — My Books:**
- P&L header: "Partnership net income".
- **New section — Partner allocation:** 2-column table with Lindsay and Sarah, each row showing YTD share of profit, guaranteed payments received, distributions taken, ending capital account.
- Audit-readiness includes **capital-account accuracy** and **guaranteed-payment classification** as components (see J-9).

**Tab 3 — Tax Hub** *(when shipped):*
- Primary: 1065 preview.
- Per-partner K-1 (each partner sees their own when signed in).
- Per-partner 1040-ES based on distributive share.
- Guaranteed-payments section: YTD per partner.

**Realistic-mock demo requirements (must render end-to-end tomorrow):**
- Hardcoded 2-partner scenario: Lindsay + Sarah Kim, 60/40 split.
- Plaid connection shows a partnership business account.
- One guaranteed-payment card fires during the demo thread.
- One partnership-distribution card fires (Lindsay takes a draw).
- One Stripe deposit fires with 60/40 split narration.
- My Books shows the partner-allocation table with real numbers.
- Tax Hub shows 1065 summary + one K-1 per partner.

**What the demo must NOT fake:**
- Don't let the prospect add a 5th or 6th partner live — if asked, Penny: *"The demo's set up with your 2-partner scenario. In the live product, you'd add all partners during setup."*
- Don't show a full line-by-line 1065 — a preview (gross receipts, deductions, net income, allocation schedule) is enough.
- Don't promise launch timing in copy — all partnership-path strings should read as production copy that would be accurate whenever partnership ships.

---

### J-5 — Approval card variants per entity

Expand the current 8 approval cards (C.1–C.8) to 11 total to cover all entities:

| Card | Sole Prop | Single-member LLC | S-Corp LLC | Partnership |
|---|---|---|---|---|
| C.1 Expense | ✓ | ✓ | ✓ | ✓ (with partner-allocation note when relevant) |
| C.2 Income | ✓ | ✓ | ✓ | ✓ (with partner-split narration) |
| C.3 Duplicate check | ✓ | ✓ | ✓ | ✓ |
| C.4 Celebration | ✓ | ✓ | ✓ | ✓ (split across partners) |
| C.5 Receipt match | ✓ | ✓ | ✓ | ✓ |
| C.6 Uncategorized ask | ✓ | ✓ | ✓ | ✓ |
| C.7 Variable recurring | ✓ | ✓ | ✓ | ✓ |
| C.8 Rule proposal | ✓ | ✓ | ✓ | ✓ |
| **C.9 Owner distribution (S-Corp)** | — | — | ✓ | — |
| **C.10 Guaranteed payment (new)** | — | — | — | ✓ |
| **C.11 Partnership distribution (new)** | — | — | — | ✓ |

For transfer-to-personal on Sole Prop / Single-member LLC: handled inside C.1 with suppressed-expense framing. Not a separate card.

C.10 and C.11 should visually follow C.9's geometry (same card component, same approval/edit affordance) but with entity-appropriate copy and metadata fields.

---

### J-6 — Entity change after onboarding (Tab 4 — Connect → Business Profile)

The wireframe doesn't currently support changing entity after onboarding. It must — especially for the demo, where Lindsay might want to probe what happens if she picks the "wrong" entity.

**Flow:**
- Tab 4 Connect → Business Profile → row: "Business structure: [Current entity]".
- Tap row → opens the 5-option A2 list, pre-filled with current selection.
- Change selection → Penny's bubble in thread: *"Got it — you've changed to [new entity]. Here's what changes:"* — narrates in plain English which surfaces appear/disappear, which cards change, which requirements kick in or fall away (e.g., *"I'll stop asking about reasonable compensation. I'll start treating owner transfers as simple draws, not distributions."*).
- **Warning on S-Corp revocation** (S-Corp → anything else): *"Changing out of S-Corp is unusual. It requires filing a formal revocation with the IRS. Did you file revocation paperwork?"* If no, offer to pause the change and link to IRS guidance.
- Mid-year S-Corp election (D72) is separate — already scoped in H3.

**Tomorrow's demo bar:** entity change works end-to-end for all 5 onboarding options. If prospect picks Sole Prop at A2 and then says "can I switch this to S-Corp?" — must reflow without app reload.

---

### J-7 — Tax Hub variants per entity (when Tax Hub ships)

Tax Hub isn't in Demo v2 but is in the solopreneur spec. Flagging here so Claude Design builds it entity-aware from day one.

- **Sole Prop / Single-member LLC:** Schedule C preview → SE worksheet → quarterly 1040-ES card → 1099-NEC issued/received lists.
- **S-Corp LLC:** 1120-S preview → reasonable-comp YTD check → distributions YTD → owner K-1 preview → owner 1040-ES → 1099-NEC issued list.
- **Partnership:** 1065 preview → per-partner allocation table → per-partner K-1 preview → per-partner guaranteed payments YTD → 1099-NEC issued/received lists.

Breadcrumb at top of Tax Hub always shows current entity: *"Sole Proprietor · 2026 tax year"*. Tap to change entity in one jump.

---

### J-8 — Copy-style rules per entity (apply everywhere)

These are find-replace rules applied based on current entity state — not hardcoded strings. Implement as a copy-layer map in React state so J-6 entity change is seamless.

| Phrase in S-Corp default | Sole Prop | Single-member LLC | Partnership |
|---|---|---|---|
| "your S-Corp" | "your business" | "your LLC" | "the partnership" |
| "your 1120-S" | "your Schedule C" | "your Schedule C" | "your 1065" |
| "your salary" | *(suppressed)* | *(suppressed)* | "your guaranteed payment" (if applicable) |
| "your distribution" | "your owner draw" | "your owner draw" | "your partnership distribution" |
| "your K-1" | *(suppressed)* | *(suppressed)* | "your K-1" |
| "reasonable compensation" | *(suppressed)* | *(suppressed)* | *(suppressed)* |
| "your basis" | *(suppressed)* | *(suppressed)* | "your capital account" |

Implementation note: treat as `entityCopy['distribution']` etc. in the component tree, not hardcoded strings. Makes J-6 entity change trivial.

---

### J-9 — Audit-readiness score, entity-aware

Current wireframe shows an 82/100 audit-readiness but doesn't explain what the score measures. Per Part E, this needs a drill-down. The drill-down itself must be entity-specific — a universal rubric reads as generic.

**Per-entity score components (each entity totals 100):**

**Sole Prop / Single-member LLC:**
- Categorization accuracy — 40
- Receipt backup (expenses >$75) — 20
- Mileage log consistency — 15
- SE tax accuracy vs. quarterly estimates — 15
- Personal/business separation — 10

**S-Corp LLC:**
- Categorization accuracy — 30
- Receipt backup — 15
- Mileage via accountable-plan — 10
- **Reasonable-compensation compliance — 20**
- **Distribution recording (distinct from expense) — 10**
- **1099-NEC issuance tracking — 10**
- Personal/business separation — 5

**Partnership:**
- Categorization accuracy — 25
- Receipt backup — 15
- **Capital-account accuracy — 20**
- **Guaranteed-payment classification — 15**
- **K-1 allocation math vs. agreement — 10**
- **1099-NEC issuance — 10**
- Personal/business separation — 5

Score rendered identically (out of 100), but the drill-down modal shows entity-specific line items. Tapping any line shows *"What this means"* in plain English.

---

### J-10 — Three conversion moments per entity (the "yes" triggers)

For each entity, there are three specific moments that make the prospect say "Penny understands my situation." If these land in the demo, the demo converts. Claude Design should make these feel deliberate, not incidental.

**Sole Prop / Single-member LLC:**
1. Penny narrates a deposit and immediately projects SE-tax impact: *"That $5k client payment adds $765 to your self-employment tax estimate for Q2."*
2. Transfer-to-personal doesn't trigger a "categorize this" nag — Penny recognizes it and narrates calmly.
3. Quarterly 1040-ES reminder fires with a specific amount + due date based on YTD, not a generic "don't forget taxes."

**S-Corp LLC:**
1. Reasonable-comp advisor fires unprompted within 60 seconds of onboarding complete.
2. Batched-distributions narrative fires on the 3rd draw of the month.
3. Payroll connection (Gusto) completes in 2 taps.

**Partnership:**
1. First deposit auto-splits by partnership agreement with both partners named.
2. Capital-account table in My Books shows per-partner status after one approval.
3. Guaranteed-payment card fires distinct from distribution card, with plain-English explanation of the tax difference.

These are the conversion events. Each should be one clear moment in the demo thread — not buried in a list.

---

### J-11 — Priority additions + spec updates

**Before demo tomorrow (adds to 1-hour list):**
- J-2: Fix A2 to 5 options, no pre-selection (~15 min)
- J-3: Extend diagnostic to 4 questions (~30 min)
- J-4.a / J-4.b core suppression + copy swap (~45 min) — sole-prop and single-member-LLC paths must reflow correctly

**Before demo if 2–3 hours available:**
- J-4.c: fill S-Corp gaps (reasonable-comp advisor, batched distributions, mileage capture) — ~60 min
- J-4.d: partnership realistic mock — 2-partner hardcoded scenario, 60/40 split narration, C.10 + C.11 cards, capital-account table in My Books — ~90 min
- J-6: entity change in Connect → Business Profile — ~30 min

**Post-demo (beta-1 hi-fi):**
- J-5: polished C.10 and C.11 approval card components.
- J-7: Tax Hub variants (when Tax Hub ships).
- J-8: copy-layer map for entity-aware strings.
- J-9: entity-aware audit-readiness scoring with drill-down.

**Spec updates required (flag for CLAUDE.md log + spec-brainstorm-decisions + implementation-strategy):**
- **Partnership = demo-only at launch.** MVP launch scope stays solo (Sole Prop / Single-member LLC / S-Corp LLC). Update CLAUDE.md framing, spec-brainstorm-decisions to add Partnership as post-launch scope, implementation-strategy to confirm engineering doesn't plan for 1065 / capital-account tracking / multi-partner primitives at v1.
- **D83 amendment → D83.1.** Diagnostic goes from 3 questions to 4; partnership detection becomes Q1. A2 becomes 5-option (add Partnership / Multi-member LLC) from 4-option.
- **New card types C.10 and C.11** to add to app-spec and approval-card catalog.
- **Audit-readiness rubric (solopreneur spec §8)** becomes entity-aware — update that section.
- **Tax Hub section** becomes entity-aware — update that section.

---

## 4. Demo script suggestion (optional, for tomorrow)

*Not feedback — a 90-second script Nik can run during the demo, using the wireframe as-is plus the fixes above.*

1. **Hand Lindsay the phone at A1.** "This is Penny. Tap through it the way you would if I weren't here."
2. Let her do A1 → A2 (select S-Corp) → A3 (pick Stripe, Venmo, ACH) → A4 (Plaid connect).
3. At A6, she sees her own vendors named as Penny loads. First "oh wow" moment.
4. A7: confirm HubSpot. Toast shows running total.
5. B1 thread opens: offer "30-second tour" chip. Show her status strip, let her tap Audit-readiness to see the 82. Let her come back.
6. Type "send an invoice to TripAdvisor for $6,500 for April retainer." **Watch Claude parse it.** Second "oh wow."
7. Tap Add → Voice. Say out loud: "I paid $35 cash for parking at the client site in Needham." **Watch it parse.** Third "oh wow."
8. Tap My Books → Cash cushion. Scrub the slider. Shows she's in control.
9. Tap Connect → Data & privacy. Read Penny's rules back to her ("Your data is yours. I never sell or share. That's rule #5.").
10. Close the demo with: "What's the one thing that would make you want to try this with your real books?"

The three oh-wow moments (named-vendors load, live invoice parse, live voice parse) are what converts.

---

## 5. Priority queue — what to ship first

**Before demo if only 1 hour available (five surgical fixes + three entity-parity minimums):**
A-3 (remove "I'll do this later"), A-5/D-6 (HubSpot copy consistency), A-6 (thread opener), A-8 (tax date consistency), C-1 (color coding), **J-2 (A2 5-option, no pre-selection)**, **J-3 (4-question diagnostic)**, **J-4.a/b core copy swap for sole-prop path**. Biggest trust impact, minimum viable entity parity.

**Before demo if 2–3 hours available:**
Everything in the 1-hour list, plus:
- A-1 through A-10 (remaining critical fixes)
- D-5 ("forever" → "from now on")
- **J-4.c (S-Corp gaps: reasonable-comp advisor, batched distributions, mileage capture)**
- **J-4.d (partnership realistic mock — 2-partner scenario, 60/40 split, C.10 + C.11 cards)**
- **J-6 (entity change in Connect)**

That's ~18 items and lifts the demo from ~70% to ~90% signup-ready across any entity Lindsay picks.

**Next 5 days (post-demo, for beta-1 hi-fi):**
Everything in Parts A–E, plus Parts F, G, and **J-5 / J-9 (C.10+C.11 as polished components, entity-aware audit-readiness)**. Aim for hi-fi completion by end of week.

**Next 2–4 weeks (beta hardening):**
Part H's new screens. Full tone sweep. CPA review of audit-readiness and reasonable-comp copy. **J-7 (Tax Hub variants) and J-8 (copy-layer map)** wired into the codebase. Spec updates per J-11 cascaded into CLAUDE.md, spec-brainstorm-decisions, implementation-strategy.

---

*End of stress test. Hand to Claude Design. Update BUILD-TRACKER.md to reflect the hi-fi pass + entity-parity work as new milestones.*
