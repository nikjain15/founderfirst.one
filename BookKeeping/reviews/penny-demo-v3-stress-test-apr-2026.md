# Penny Demo v3 — Stress Test & Rebuild Brief

**Date:** 21 April 2026 (late evening)
**Author:** Claude (advisor role, per FounderFirst OS)
**Intended recipient:** Claude Design (to rebuild v4)
**Target demo date:** Wednesday 22 April 2026
**Target demo user:** Lindsay Morin — Sails Up Marketing & Consulting — S-Corp LLC (elected 1 July 2025), Milford NH
**File under review:** `uploads/Penny Demo v3 Standalone.html` (React 18 + Babel standalone, 36 screens in TOUR array)

---

## 0. TL;DR — Verdict

v3 is **close**, but not yet **demo-quality for a real solopreneur**. It demonstrates the *surface* of Penny well (4-tab shell, approval card, S-Corp narrative, CPA export wizard, backlog). It breaks down at the *moments that build trust*:

1. Receipts have no actual receipt image — just `[ receipt photo ]` placeholder text in a gray box.
2. Parsed voice notes and parsed receipts are **read-only** — Lindsay cannot correct a field.
3. My Books "drill-downs" all route to the same generic transaction list — there's no vendor-specific detail.
4. CPA Export sends a hypothetical CSV to the hypothetical CPA with **no preview** — Lindsay never sees what her CPA will see.
5. Onboarding and Connect tab copy is **form-like and direct**, not a "friendly bookkeeper." Tone-guide violations across roughly 40% of screens.
6. The Connect tab is **missing** critical connections — most notably payroll (Gusto/OnPay/QBO Payroll — Lindsay runs W-2 payroll via Gusto), peer-payment (Venmo/Zelle/CashApp), email ingestion (Gmail/Outlook), and the 1099 service (Track1099).
7. The Connect tab is **simultaneously overloaded** with Preferences rows (App lock, Accounting method, Data & privacy, Account, Support, Close account) that belong in a Penny-logo popover, not a tab.

**Verdict:** v3 is a wireframe. v4 needs to become a **demo-able prototype** — no dead-end taps, no placeholder images, no read-only "trust me" moments. Every on-screen surface should withstand a solopreneur touching it, and every question she asks should return a grounded, data-backed answer (Decision #3).

A rebuild (not a patch) is recommended. The 3-tab + P-mark popover architecture alone forces significant component restructuring. Merging that with the receipt SVG, per-field edit flow, CPA preview, vendor drill-downs, mileage flow, and tone pass is cleaner as one v4 build than as 40 small patches on v3.

**Deliverables — two files, public URLs (see §21, §22):**
1. `Penny Demo v4 Standalone.html` — Lindsay's phone. Mobile-first, 375px min.
2. `Penny CPA View v4.html` — Sarah's desktop. Opens in new tab from end of Lindsay's flow.

**All 13 open questions have been decided by Nik (§19).** Build starts immediately from this doc.

---

## 1. Methodology — Four Hats

Per FounderFirst OS role system, v3 was reviewed through four independent lenses:

**Hat 1 — UX/UI Researcher (Head of Research / Head of Design).** Walked every screen from A1 to I2 as if Lindsay is seeing Penny for the first time. Checked cognitive load, tap-target clarity, information architecture, visual hierarchy, consistency with design-system v2.0 (solid p-mark avatar, Inter, `--ink` palette, pill buttons), 375px behavior, and friction per task.

**Hat 2 — Content Writer (brand voice owner).** Every string on every screen checked against `product/tone-guide.md`. Rules applied: max 2 sentences per bubble, one idea per message, lead with the human moment then the number, always explain why briefly, no accounting jargon without plain-English gloss, no forbidden emojis (only 🎉 👋 ✓ 💪), American English only, calm tone, never match frustration, name Lindsay where it's natural.

**Hat 3 — Product Manager (CPO).** Is the product one-job-focused for a solopreneur? Are we hiding complexity that should be hidden and exposing what must be exposed? Does the demo map to the 86 locked product decisions in `spec-brainstorm-decisions.md` v2.2 and to the solopreneur spec v1.1 folder? Is the S-Corp narrative coherent for Lindsay? Is the trust-building sequence intact? Are we missing any capabilities that a solopreneur would look for on day one?

**Hat 4 — Bookkeeper Expert (synthesized from `research/bookkeeper-role-reference.md` and `research/solo-freelancer/`).** Would a real bookkeeper — or a CPA reviewing this for Lindsay — trust what they see? Are the numbers coherent? Are S-Corp mechanics handled correctly (W-2 salary vs distributions, owner's-draw distinctions, quarterly estimated tax logic, 1099 candidates, audit-readiness signals)? Is the CPA export CPA-ready or CPA-rejectable?

---

## 2. Severity Legend

Following the convention established in `reviews/spec-v2.2-tech-stress-test-apr-2026.md`:

- **Critical** — blocks demo or destroys trust on first touch. Must fix before 22 April.
- **High** — damages product perception or creates a dead-end path within the happy path. Should fix before demo.
- **Medium** — quality / polish / completeness issue. Fix before demo if time allows; otherwise note for v4 follow-up.
- **Low** — nice-to-have polish, not demo-critical.
- **Decisions Needed** — Nik must decide before Claude Design can proceed.

---

## 3. Findings — Summary Table

| ID | Severity | Finding | Hat |
|---|---|---|---|
| C1 | Critical | Receipt screen has placeholder `[ receipt photo ]`, no actual receipt image | UX · PM |
| C2 | Critical | Voice-note parsed state has no per-field edit | UX · Content |
| C3 | Critical | CPA Export has no preview — Lindsay never sees the export | Bookkeeper · PM |
| C4 | Critical | Payroll (Gusto) missing from Connect despite being core to S-Corp narrative | Bookkeeper · PM |
| C5 | Critical | My Books rows all route to same generic list — no vendor-specific drill | UX · PM |
| C6 | Critical | Onboarding tone is form-like, not friendly-bookkeeper; heavy tone-guide violation | Content |
| H1 | High | Preferences living in Connect tab instead of P-mark popover | UX · PM |
| H2 | High | Connect + Add should merge into one tab (per Nik directive) | PM · UX |
| H3 | High | Peer-payment (Venmo/Zelle/CashApp), email ingestion (Gmail/Outlook), Track1099 all missing from Connect | PM · Bookkeeper |
| H4 | High | TurboTax import claim in E7Export contradicts C4 unvalidated-marketing-claim flag in CLAUDE.md | PM · Legal |
| H5 | High | Receipt photo parsed state (D2Photo) has same read-only problem as voice | UX · Content |
| H6 | High | Thread cards use inconsistent information architecture across C1–C8 | UX |
| H7 | High | Audit-readiness score (82/100) has no depth on tap | UX · PM |
| H8 | High | Category picker uses accounting jargon without plain-English gloss | Content · Bookkeeper |
| H9 | High | Loading/parsing timing in D3Voice is instant — not believable, undermines "AI is working" moment | UX |
| H10 | High | Invoice client field is locked/pre-filled — can't demo adding a new client | PM |
| H11 | High | Payroll/W-2 S-Corp flow dead-ends — no way to show Lindsay her $5,500/mo W-2 in Penny's narrative | Bookkeeper · PM |
| H12 | High | Backlog (I1/I2) navigation is unclear — can't tell if an item is resolved | UX |
| H13 | High | Explainer screens (e.g., A4.5) use emoji icons that violate tone guide | Content |
| H14 | High | Transaction-list (E6) items are dead-end (no detail on tap) | UX |
| H15 | High | Demo-mode navigation (keyboard shortcuts left/right) not visible to real user holding a phone | UX |
| H16 | High | 1099 candidate flow assumes Lindsay knows what "1099" means | Content · Bookkeeper |
| M1 | Medium | Entity-type "not sure" diagnostic path (D83) not demonstrated | PM |
| M2 | Medium | Emoji icons on Add tab (📷 🎙 ✍️ 🚗) violate tone-guide 4-emoji allowlist | Content |
| M3 | Medium | Status-bar battery/carrier hardcoded to iPhone chrome — looks like a screenshot, not an app | UX |
| M4 | Medium | Notification picker placement inside Connect is buried | UX |
| M5 | Medium | First approval card (C1) skips the warm human moment before the number | Content |
| M6 | Medium | Thread chip (date header) treatment inconsistent with design-system v2.0 | UX |
| M7 | Medium | Income auto-approve FYI is not clearly labeled as FYI vs action (tone-guide Rule 3) | Content |
| M8 | Medium | "1099-NEC" jargon appears in H1/H3 with no plain-English gloss | Content |
| M9 | Medium | Manual entry UX (D5Manual) has no smart defaults (vendor list, recent categories) | UX |
| M10 | Medium | Mileage coverage missing — Lindsay drives client → client in NH/MA | PM · Bookkeeper |
| M11 | Medium | Bank logos are generic text — Chase / Mercury should look recognisable for trust | UX |
| M12 | Medium | Invoice urgency language ("Overdue 14 days") lacks a gentle-escalation path | Content |
| M13 | Medium | "Weekly batch" / "Daily digest" copy not aligned with locked labels ("Real-time" / "Daily digest" per CLAUDE.md §2) | Content |
| M14 | Medium | Celebration amount check — a $6,500 TripAdvisor deposit triggers 🎉, but so does $350; needs a threshold rule | Content · PM |
| M15 | Medium | British spellings to sweep: categoris → categoriz, behaviour → behavior, centred → centered | Content |
| L1 | Low | Lindsay-specific personalization (greeting by name, home town) only appears in a few places | Content |
| L2 | Low | Typing state ("Penny is thinking…") not shown before the first card | UX |
| L3 | Low | Empty states (no transactions yet) not demonstrated | UX |
| L4 | Low | Error states (bank disconnect, receipt unreadable) not demonstrated | UX |
| L5 | Low | Mistake-recovery (5-sec undo toast per CLAUDE.md §2) not demonstrated | UX |
| L6 | Low | Some tap targets below 44×44 iOS guideline (action chips on C1) | UX |
| L7 | Low | Back-buttons inconsistent between thread drill-downs and settings | UX |
| L8 | Low | No dark-mode preview — not required for demo but worth a note | UX |
| DN1 | Decisions Needed | Should the demo use Lindsay's real client names (TripAdvisor, BAE, Stonyfield, Segue) or anonymize? | PM · Legal |
| DN2 | Decisions Needed | Should the CPA share-link view be a separate screen in-demo or only in a companion HTML file? | PM |
| DN3 | Decisions Needed | Does the demo include memory demonstration (Penny remembering last month's decision)? | PM |
| DN4 | Decisions Needed | Does the demo include Discord / in-app chat support surface (E41) or defer? | PM |
| DN5 | Decisions Needed | Mileage capture shown in v4 or deferred? (Adds ~2 screens) | PM |

---

## 4. Critical Findings — Detail

### C1 — Receipt has no actual receipt image

**Location:** `D2Photo` component, ~line 1145
```
<Box label="[ receipt photo ]" h={180} ...>
```

**Problem:** Lindsay will tap the photo capture path expecting to see a receipt. She will see a gray box with the text `[ receipt photo ]`. This is the single worst trust moment in v3 — a bookkeeping product that cannot render a receipt is not credible.

**Fix:** Hand-craft an SVG / CSS-drawn receipt asset in v4. Lindsay's recommended receipt: **Regus Nashua, NH — coworking day pass — $350.00 — 20 April 2026**. Include header logo area, line items, tax line, tip line (blank), total, payment-card last-4, timestamp, barcode footer. Render it inside the phone frame at realistic scale (~280×420 px within the 375px viewport), with subtle shadow and paper-texture background so it reads as a photographed receipt.

**Why Regus Nashua:** realistic for Lindsay (she meets clients in Nashua; BAE Systems and Segue are both Nashua), mid-size amount that triggers a confident auto-categorization (Meals/Travel/Office), supports an S-Corp deductibility narrative.

---

### C2 — Voice-note parsed state is read-only

**Location:** `D3Voice` component, ~line 1181 (parsed state)

**Problem:** After Lindsay records "Paid Mike thirty-five bucks for lunch at Buckley's," Penny shows parsed fields — vendor, amount, category — but the only CTAs are "Looks right ✓" and "Try again." If Penny parses Mike's name as "Nike" or the amount as $3.50, Lindsay's only option is to re-record the whole voice note. This is a dead-end path.

**Fix:** Every parsed field must be **tappable**. On tap, show an inline edit control:
- Vendor: text input with autocomplete (last 30 vendors, fuzzy match)
- Amount: numeric keypad with $ prefix
- Category: the same category picker used elsewhere (with plain-English glosses)
- Date: date picker defaulting to today
- Notes: optional text input

After any edit, the "Looks right ✓" CTA updates to "Save ✓" and a small diff indicator ("edited") appears next to changed fields — this shows Penny is paying attention without being judgmental.

**Tone note:** If Penny mis-parsed, the tone should absorb the mistake: "Got it — updating to Buckley's, $35." Never blame Lindsay, never make her feel the tech failed.

---

### C3 — CPA Export has no preview

**Location:** `E7Export` component, ~line 1556 (Step 3 → Send)

**Problem:** Lindsay taps through period → format → delivery. The final screen says "Send to Sarah" with a Send button. Lindsay never sees **what Sarah will receive**. This is the single most important trust moment for a solopreneur — she is about to send her books to her CPA and wants to feel confident it looks good.

**Fix:** Insert a **Preview** step between format selection and Send. Two recommended surfaces:

**(a) In-app interactive preview (Lindsay's side):**
- Scrollable preview inside the phone frame showing the first page of the CSV/PDF
- Header: "Sails Up Marketing & Consulting · Q1 2026 · Jan–Mar"
- Summary block: Revenue, Expenses, Net, Distributions, W-2 salary
- Category breakdown table (top 10 categories)
- Transaction table preview (first 15 rows with vendor, date, amount, category)
- "View full preview" link that opens a full-screen scroll
- "Send to Sarah" CTA at the bottom with a confirming microcopy: "Sarah will get this as a link she can review and export. She'll see every transaction you've approved this quarter."

**(b) CPA share-link side-view (Sarah's side) — separate HTML file or in-demo screen:**
- Desktop-width view (per solopreneur spec 18-web-screens-and-flows.md §B.2)
- Header: Sails Up Marketing & Consulting · Q1 2026
- Summary tiles: Revenue, Expenses, Net Income, Distributions, W-2 Payroll, Estimated Tax Liability
- Transaction table with filter + sort + search
- "Ask a question" button → posts a comment back to Lindsay's Penny thread
- Download CSV · Download PDF · Export QBO buttons
- Small "Audit-readiness score: 82/100" badge with tooltip explanation

**Why both:** the demo moment Nik wants is "confidence that Lindsay's CPA will like what she sends." Showing only Lindsay's side is half the story — showing Sarah's side closes the loop.

---

### C4 — Payroll (Gusto) missing from Connect despite being core to S-Corp narrative

**Location:** `F1Connect` component, ~line 1673

**Problem:** Lindsay runs W-2 payroll of $5,500/mo through Gusto. Her S-Corp story — salary + distributions — is one of the three biggest demo narratives. But nowhere in v3's Connect tab is there a Gusto (or OnPay, or QBO Payroll) connection row. A solopreneur on an S-Corp expects to see payroll as a first-class connection.

**Fix:** Add a "Payroll" section to Connect (or in the merged Add tab per H2) with three rows (Gusto, OnPay, QBO Payroll — per D72), matching the priority of the Bank section. For the demo, **Gusto is connected** with the following state:
- Gusto · Connected · Last synced 2 hours ago
- On tap: "You run W-2 payroll of $5,500/month. I pull your run history and your W-2 — no manual entry, no duplicate expenses." + a small monthly table (last 3 months).

This ties directly to H3 in the thread (the S-Corp salary card — see file H1/H3 in v3) and to E7Export (CPA sees clean W-2 payroll).

---

### C5 — My Books rows all route to same generic list

**Location:** `E1–E6` components. Bug at `~line 1358`:
```
<ListRow ... onClick={()=>navigate('transaction-list')}/>
```

**Problem:** In My Books, Lindsay taps "TripAdvisor · $6,500 · 15 Apr" expecting to see the specific TripAdvisor deposit with its rule, its category history, its notes. Instead she lands on a generic transaction list. Every row does this. The product feels one-layer-deep.

**Fix:** Implement vendor-specific and transaction-specific drill-downs. Three levels:

**Level 1 — Vendor detail** (tap a vendor name): 12-month history, category, total, rule ("Always Consulting revenue"), client record if it's a client, link to recent invoices.

**Level 2 — Transaction detail** (tap a specific line): Date, vendor, amount, category, source (Chase vs Mercury), matched rule, associated receipt (if any), edit history, "Ask Penny about this" button.

**Level 3 — Category detail** (tap a category): 12-month trend, all transactions in category, top vendors, deductibility note, IRS schedule-C line mapping (plain English: "This appears on Schedule C line 24a — Travel").

For the demo, build Level 2 at minimum (the most common tap path), Level 1 for at least TripAdvisor and Regus (Lindsay's biggest recurring income + one expense), Level 3 for Meals and Consulting Revenue.

---

### C6 — Onboarding tone is form-like, not friendly-bookkeeper

**Location:** `A1–A7` components

**Problem:** Current onboarding reads like a SaaS signup form. Sample current copy:
- A2: "First — how's your business set up?"
- A3: "How do people usually pay you?"
- A4: "Let's connect your business bank."
- A5: "How should I reach out?"

These are **questions on a form**. A friendly bookkeeper introduces themselves, asks Lindsay about her business, listens, and weaves the setup into a conversation. See §10 for the full screen-by-screen rewrite.

**Direction:** Warm, personal, curious, unhurried. Penny uses Lindsay's name. Penny explains why she's asking before she asks. Penny never uses a phrase that would feel out-of-place coming from a human bookkeeper sitting across a table.

---

## 5. High Findings — Detail

### H1 — Preferences belong in a P-mark popover, not a tab

**Problem:** Connect tab currently stuffs App lock, Accounting method, Data & privacy, Account, Support, Close account into the bottom of the list. This buries preferences and bloats Connect.

**Fix:** Tap the **Penny p-mark (avatar) in the top-left of every screen** → opens a popover (Gmail / iOS-style) with:
- Account (Lindsay Morin · riddhijain@… · Sails Up Marketing & Consulting)
- Notifications (Real-time / Daily digest toggle)
- App lock (Face ID · timeout)
- Accounting method (Cash · toggle Accrual — per E26)
- Data & privacy (AI training opt-in · Data export · Data deletion)
- Support (Discord channel · in-app chat · email)
- Sign out · Close account (under a "Danger" collapsed section)

The popover should appear as a 90%-width sheet on mobile, anchored to the p-mark, with a dim overlay and the same solid-ink p-mark + white "P" branding at the top.

---

### H2 — Merge Connect + Add into one tab

**Problem:** Current 4 tabs (Penny · Add · My Books · Connect) have overlapping semantics. Add is for "capture one transaction" and Connect is for "capture many transactions via integration." For a solopreneur, both are the same mental model: get data into Penny.

**Fix:** 3-tab architecture:

| # | Label | Contains |
|---|---|---|
| 1 | **Penny** | Conversation thread + approval cards (home / default landing) |
| 2 | **Add** | All data-in surfaces: connect accounts, receipt photo, voice, text, manual, mileage |
| 3 | **My Books** | P&L, categories, transactions, invoices, tax, CPA export |

The Preferences block lives behind the p-mark popover (H1).

The merged Add tab is organized into two sections:
- **Quick capture** (single-transaction): Photo · Voice · Text · Manual · Mileage
- **Connected sources** (recurring): Bank · Payroll · Cards · Peer-payment · Email receipts · Invoicing · 1099 service · Accounting software

See §12 for the full inventory.

---

### H3 — Missing critical connections

**Current Connect tab has:** Chase · Mercury · Email receipts (email-only) · Notifications · App lock · Accounting method · Data & privacy · Account · Support · Close account.

**Missing:**
- **Payroll** — Gusto, OnPay, QBO Payroll (D72, critical for S-Corp narrative)
- **Peer-payment** — Venmo, Zelle, CashApp (D77, first-class input)
- **Credit cards** — Chase Ink (Lindsay likely has one) — should be separate row from checking
- **Email ingestion** — Gmail + Outlook OAuth (D74, not just "forward to penny@")
- **Invoicing platform** — Penny native invoicing (capability, not connection)
- **Payment processor** — Stripe, PayPal Business, Square (income source)
- **1099 service** — Track1099 (E27)
- **Accounting software** — QuickBooks, Xero, Wave (export targets only per CLAUDE.md §2)
- **Historical import** — CSV/OFX upload with schema inference (D84)

**For Lindsay's demo specifically, connect state should show:**
- Chase Business Complete Checking · Connected · Last synced 2h ago
- Mercury · Connected · Last synced 2h ago
- Chase Ink Business · Connected · Last synced 2h ago
- Gusto · Connected · Last run synced 16 Apr
- Stripe · Connected (for invoice payments from clients)
- Gmail (riddhijain@…) · Connected · Receipts inbox monitored
- Track1099 · Ready · 4 contractors pending year-end
- Available to connect: OnPay, QBO Payroll, Venmo, Zelle, CashApp, PayPal, Outlook, QuickBooks, Xero, Historical import

---

### H4 — TurboTax claim in E7Export contradicts CLAUDE.md C4

**Location:** `E7Export` line ~1561: "QuickBooks-compatible (QBO) — imports into TurboTax"

**Problem:** CLAUDE.md §11 Phase 0 flags C4 — "TurboTax marketing claim validation" — as an **unvalidated claim**. Putting it in the demo before legal/partner validation risks overselling.

**Fix:** Soften to an observation-grade statement, e.g., "QuickBooks-compatible (QBO) — the format most CPAs and tax software accept." Let the strength come from the CPA share-link, not from a specific-tool claim we haven't validated.

---

### H5 — Photo parsed state has same read-only problem as voice

**Location:** `D2Photo` component, ~line 1112

**Problem:** Same as C2 but for photo. After the receipt is parsed (see C1 fix for the image), the parsed fields (vendor, date, amount, category, tax) must be per-field editable. Apply the same inline-edit pattern as C2.

---

### H6 — Thread cards use inconsistent IA across C1–C8

**Problem:** C1 (large payment), C2 (overdue), C3 (recurring FYI), C4 (unusual), etc. each use slightly different layouts — some have the number first, some have the narrative first, some have 2 action chips, some have 3, some have an "explain" link, some don't.

**Fix:** Normalize to a **card grammar** (one pattern, variants only where necessary):

```
┌──────────────────────────────────────┐
│ [avatar] Penny · 2m ago              │
│                                      │
│ [emoji if approved — only 4 allowed] │
│ {Human moment — 1 sentence}          │
│ {Number/detail — 1 sentence}         │
│ {Why it matters — ≤1 sentence}       │
│                                      │
│ [Primary CTA] [Secondary CTA]        │
│ [Tertiary link — e.g., Explain]      │
└──────────────────────────────────────┘
```

All 8 card variants must follow this grammar. Variants only differ in the CTAs (see solopreneur spec file 17 §C for the full 10-variant catalog).

---

### H7 — Audit-readiness (82/100) has no depth on tap

**Problem:** The score is prominent but inert. Tapping it should reveal *why* 82 and *what would move it*.

**Fix:** Audit-readiness detail view:
- Score: 82/100
- What's good: 4 items (bank connected, receipts attached to 94% of expenses, quarterly tax on time, payroll clean)
- What would help: 2 items (3 uncategorized transactions → Review; 1 contractor over $600 without W-9 → Request W-9)
- How I calculate this: plain-English explainer with "This is my estimate based on what a CPA typically checks."

---

### H8 — Category picker uses jargon without gloss

**Problem:** Category rows say "Meals & Entertainment," "Travel," "Professional Services" — fine on their own — but when a sub-category like "Contract Labor" appears, a solopreneur may not know the Schedule-C line it maps to.

**Fix:** Every category row has a one-line plain-English gloss beneath its name:
- Meals & Entertainment · "Client meals and business coffees — 50% deductible"
- Travel · "Out-of-town work travel — hotels, flights, rental cars"
- Contract Labor · "Contractors and freelancers you pay for specific work"
- Professional Services · "Accountants, lawyers, consultants"
- Office Expense · "Software, subscriptions, small office supplies"

Every category detail view (see C5 Level 3) shows the Schedule-C line with IRS wording.

---

### H9 — Voice loading timing is instant

**Problem:** D3Voice transitions from recording to parsed state with no "Penny is listening…" or "Parsing…" moment. For the demo, a believable ~1.2-second processing moment makes the AI moment feel real.

**Fix:** 600ms "Recording…" with waveform → 500ms transcript appears (fade-in) → 800ms "Parsing…" with Penny thinking indicator → parsed fields fade in one at a time (200ms stagger per field). Total ~1.8s. Do not rush — this is a **trust-earning beat**.

---

### H10 — Invoice client locked, can't demo adding a new client

**Problem:** In G1Invoice the client field is pre-filled and un-editable. Lindsay will want to see "add new client" behavior.

**Fix:** Client field is a dropdown with her 4 existing clients (TripAdvisor, BAE Systems, Stonyfield Organic, Segue Technologies) + "Add new client" at the bottom. Tapping add-new opens an inline form (Name, Email, Default rate, Net-30/Net-15/Due-on-receipt).

---

### H11 — W-2 salary dead-ends

**Problem:** H1/H3 S-Corp screens talk about salary + distributions but there's no path from the thread → My Books → Payroll detail.

**Fix:** My Books → Payroll section with three rows: W-2 Salary ($5,500/mo), Distributions ($14,500/mo across 3 payments), Contractor payments (4 · $2,400 YTD). Tap any row → detail view.

---

### H12 — Backlog I1/I2 navigation unclear

**Problem:** The shame-free backlog is a differentiator, but in v3 it's hard to see what "done" looks like. Items disappear silently.

**Fix:** When Lindsay resolves a backlog item, show a brief ✓ check animation on the item and it slides to a "Resolved today" section that collapses after the thread is left. This demonstrates the shame-free design without leaving Lindsay wondering where things went.

---

### H13 — Explainer screens use emoji icons

**Problem:** A4.5 uses 👀 🏷️ ✓ as section icons. Per tone guide, only 🎉 👋 ✓ 💪 are allowed, and even ✓ is a text glyph not an emoji icon.

**Fix:** Replace emoji icons with clean SVG line icons in `--ink` 1.5px stroke weight. Keep ✓ as a text character for confirmations, never as a decorative icon.

---

### H14 — Transaction list items dead-end

**Problem:** E6 transaction list rows are tappable but have no detail view. Same root cause as C5.

**Fix:** Every row opens Level-2 transaction detail. See C5 Level 2 spec.

---

### H15 — Demo-mode keyboard shortcuts invisible

**Problem:** The TOUR uses keyboard left/right arrow navigation. Lindsay will be holding a phone. The real demo-running pattern for Nik is a physical touch demo, not keyboard-driven.

**Fix:** For demo mode (`?demo=real`), add subtle on-screen swipe-forward and swipe-back chevrons at the screen edges (40px from edge, semi-transparent) that advance/retreat the tour — so whoever is *holding* the phone (Lindsay) can advance naturally without Nik having to reach over. Alternately: add a small bottom-right "Next" button in demo mode, same opacity.

---

### H16 — 1099 flow assumes Lindsay knows "1099"

**Problem:** "4 contractors need 1099-NEC" shows up with no explanation.

**Fix:** First occurrence of 1099 terminology includes a plain-English gloss: "You paid 4 contractors more than $600 each this year. The IRS asks that you file a 1099-NEC for each one by 31 January. I'll do this through Track1099."

---

## 6. Medium Findings — Detail

### M1 — Entity-type "not sure" path (D83) not demonstrated

**Fix:** In onboarding A2, include a "Not sure" option that runs a 3-question diagnostic (Do you file taxes separately from your personal return? Do you pay yourself a salary? Did you file IRS Form 2553?). Penny infers LLC / S-Corp / sole-prop. For Lindsay's demo, skip this since she's set up — but a companion screen showing the path is valuable for secondary demos.

### M2 — Add-tab emoji icons

**Fix:** Replace 📷 🎙 ✍️ 🚗 with clean SVG icons. Same rule as H13.

### M3 — Status bar is hardcoded iPhone chrome

**Fix:** Keep an iPhone-style status bar but make it time-live (JS `new Date()` for the clock) and battery dynamic or hidden. Static hardcoded 9:41 battery-full makes the demo feel like a screenshot, not a running app.

### M4 — Notification picker buried

**Fix:** Surface notification toggle as the **first item** in the P-mark popover after Account, since it's the most-touched preference.

### M5 — First approval card skips warm moment

**Problem:** C1 currently opens with "$6,500 from TripAdvisor · Consulting revenue · Looks right?"

**Fix:** Per tone guide, lead with the human moment: "TripAdvisor sent your April retainer — $6,500 just hit Chase. I've categorized it as Consulting revenue. Looks right?" The emoji 🎉 is *optional* here (payment is expected, not a surprise); reserve 🎉 for first-of-month or new-client moments per M14.

### M6 — Thread chip treatment

**Fix:** Date chips (e.g., "Today") should use the p-mark-muted tint per design-system v2.0 pill-button spec.

### M7 — FYI vs Action not clear

**Fix:** FYI cards get a small "FYI" eyebrow label in `--ink-3` 11px/600/uppercase. Action cards get no eyebrow (the presence of a primary CTA implies action).

### M8 — "1099-NEC" plain-English gloss

**Fix:** See H16. Same pattern across all first-occurrences of accounting jargon.

### M9 — Manual entry needs smart defaults

**Fix:** D5Manual pre-fills: Date = today, Vendor = most recent, Category = most-used, Amount = empty, Source = primary account. Lindsay taps only what she needs to change.

### M10 — Mileage missing

**Fix:** Add mileage capture to Add tab: "Log miles" → form with From, To, Purpose (pre-filled from client list), Distance (auto-calculate if addresses entered, manual otherwise). Lindsay drives Milford NH → Needham MA (TripAdvisor) regularly — this is a real tax deduction she'd expect.

### M11 — Bank logos generic

**Fix:** Use recognisable Chase and Mercury brand logos (or a clean 1-color vector facsimile to avoid trademark issues in a demo) so the Connect tab reads as real.

### M12 — Invoice urgency language

**Fix:** Overdue language ladder: Day 1-5 "gentle nudge," Day 6-14 "friendly reminder," Day 15-30 "clear ask," Day 30+ "escalation option." Never match anger — per tone guide §Handling frustration.

### M13 — Notification labels alignment

**Fix:** Use exactly "Real-time" and "Daily digest" per CLAUDE.md §2 settled decisions. No other variants.

### M14 — Celebration threshold

**Fix:** 🎉 appears for: first-of-month income, first deposit from a new client, milestone crossings ($10k MTD, $100k YTD), cash-cushion crossing. Does **not** appear for routine recurring income. Defensive rule: if Penny has seen this vendor pay this amount more than 3 times, no 🎉.

### M15 — British spellings sweep

**Fix:** Find-replace across all v4 strings: categoris→categoriz, organis→organiz, recognis→recogniz, behaviour→behavior, colour→color, centred→centered, labelled→labeled, customis→customiz.

---

## 7. Low Findings — Detail

### L1 — Lindsay-specific personalization

**Fix:** Greet by first name at least 3 times in the demo: A1 first hello ("Hi Lindsay — I'm Penny 👋"), B1 first thread landing ("Welcome back, Lindsay"), morning nudge ("Morning Lindsay — your Q2 estimate is coming up.").

### L2 — Typing state

**Fix:** Show "Penny is thinking…" (three animated dots in a bubble with the p-mark) before the first card renders. Total ~1.5s from app open. Grounds the "she's working for me" feeling.

### L3 — Empty state

**Fix:** Include one empty-state demo (e.g., a newly-connected bank with 0 transactions) showing "Nothing yet — I'll let you know when your first transaction lands."

### L4 — Error state

**Fix:** Include one error-state demo (e.g., Chase disconnected) showing "Chase asked me to re-authenticate — 30 seconds. Tap to reconnect."

### L5 — Undo toast

**Fix:** When Lindsay approves a card, show a 5-second toast "Approved · Undo" at the bottom. If she's fast, tap Undo reverses the approval. This demonstrates the trust-and-recover pattern from CLAUDE.md §2.

### L6 — Tap targets

**Fix:** Minimum 44×44 per iOS HIG. Several C1 chips currently ~36×32 — pad to 44×44.

### L7 — Back-buttons

**Fix:** Standardize on top-left `< Back` in `--ink` for all drill-downs. No close/X mixing.

### L8 — Dark mode

Not demo-critical. Note for v5.

---

## 8. Decisions Needed — For Nik

### DN1 — Anonymize client names?

Lindsay's actual clients are TripAdvisor, BAE Systems, Stonyfield Organic, Segue Technologies. For a live demo **with Lindsay**, using real names is fine — she'll see her own reality. For any **screenshot, recording, or shared asset** that leaves her hands, consider anonymizing (e.g., "TA · Needham MA" or "Client A"). Nik to decide demo recording policy.

### DN2 — CPA share-link view: in-demo screen or companion HTML?

Option A — In-demo screen (swipe to a desktop-sized view inside the demo): tighter integration, adds 1 screen to the tour.
Option B — Separate HTML file opened in a new tab: cleaner CPA desktop experience, loses narrative continuity.
Recommended: **A for the story, with a "View in Sarah's browser →" link that opens B for polish.**

### DN3 — Memory demonstration

Does the demo include a moment where Penny says "Last month you decided Regus Nashua was Office, not Meals — I've kept that going." This is the single most powerful "Penny remembers" moment. Adds ~1 card. **Recommended: include as C4-alt variant.**

### DN4 — Discord / in-app support surface

The solopreneur spec calls for Discord per-user channel + in-app chat (E41). Including it shows depth but adds complexity. **Recommended: include a single Support row in the P-mark popover that opens a minimal in-app chat; defer the Discord channel detail.**

### DN5 — Mileage in v4?

See M10. Adds 2 screens (log mileage + mileage history in My Books). **Recommended: yes — it's a real deduction Lindsay cares about and demonstrates Penny's tax breadth.**

---

## 9. Screen-by-Screen Tone Rewrite

The table below covers every screen in the TOUR array. Current copy left column, recommended copy middle, tone-guide rule cited right.

| Screen | Current copy | Recommended copy | Rule |
|---|---|---|---|
| A1 Welcome | "Hi, I'm Penny." | "Hi Lindsay — I'm Penny 👋 I'm your bookkeeper. Let's set things up together — I'll keep it short." | Name, warmth, expectation |
| A2 Entity | "First — how's your business set up?" | "Tell me about Sails Up — how's your business set up? I ask because it changes how I handle your taxes." | Why + context (Rule 3) |
| A2 options | "Sole proprietor / LLC / S-Corp / Partnership / Not sure" | "Just me (sole proprietor) / LLC / S-Corp / Partnership / Not sure — help me figure it out" | Plain English |
| A3 Income | "How do people usually pay you?" | "How do your clients usually pay you? I'll connect the right places so nothing slips through." | Why |
| A4 Bank | "Let's connect your business bank." | "Let's start with your business bank — that's where most of the activity lives. Chase and Mercury, right?" | Anticipate next Q (Rule 2) |
| A4.5 Explain | "Here's what I'll do:" with 👀 🏷️ ✓ icons | "Here's how this works: I watch your accounts, I categorize every transaction, and I show you each one so you can approve or correct it. I don't move money." | Trust, jargon-free |
| A5 Notifications | "How should I reach out?" | "How should I check in? I can message the moment something happens, or round things up once a day — whichever helps you stay in flow." | Why + choice |
| A5 options | "Real-time / Weekly batch" | "Real-time / Daily digest" | Locked labels (CLAUDE.md §2) |
| A6 Payroll | (not present) | "You mentioned S-Corp, which means payroll. Who do you use? Gusto, OnPay, QuickBooks Payroll, or I can help you pick one." | D72 · New screen |
| A7 Ready | "All set — let's go." | "All set, Lindsay. I'll start watching your accounts now and bring you the first few decisions as they come in. Most days this takes about 3 minutes." | Expectation |
| B1 Thread intro | "Welcome back." | "Welcome back, Lindsay. Three new things today — two just need a look." | Name + summary |
| B3 Thread scrolled | (silent) | (silent — no change) | Less is more |
| C1 Large income | "$6,500 from TripAdvisor · Consulting revenue · Looks right?" | "TripAdvisor sent your April retainer — $6,500 hit Chase. I've categorized it as Consulting revenue. Looks right?" | Human moment first |
| C2 Overdue | "Stonyfield invoice is 14 days overdue." | "Your Stonyfield invoice ($4,200) is 14 days past due. Want me to send a gentle nudge?" | Number + gentle option |
| C3 Recurring FYI | "Regus · $350 · Office" | "Regus Nashua charged $350 — same as last month. I've marked it as Office. No action needed — just keeping you in the loop." | Rule 3 FYI label |
| C4 Unusual | "Unusual charge: $89 Ace Hardware" | "New one — Ace Hardware $89 on your Chase Ink. Doesn't look like your usual spend. Business expense, or personal?" | Honest uncertainty |
| C4-alt Memory | (new card) | "Regus Nashua again — $350. Last month you told me this is Office, not Meals. I've kept that going." | Rule 4 remembers |
| C5 W-9 request | "Contractor needs W-9" | "You've paid Mike Reed $2,400 this year — past the $600 line where the IRS wants a W-9 on file. Want me to send him a request?" | Why + plain English |
| C6 Tax deadline | "Q2 estimated tax due June 15" | "Your Q2 estimated tax is due June 15 — about $4,800 based on how the year's going. I'll remind you again in late May." | Number + reassurance |
| C7 Variable recurring | "Amazon charge higher than usual" | "Amazon charged $214 this month — your usual runs around $60. Business, or did a personal order slip in?" | Anomaly + gentle |
| C8 Rule proposal | "Set rule?" | "I've seen Regus Nashua charge $350 three months running. Want me to auto-categorize these as Office going forward? You can always change it." | Control + reversibility |
| D1 Add menu | 📷 🎙 ✍️ 🚗 | SVG icons · "Photo of a receipt / Voice note / Type a note / Log miles / Manual entry" | No decorative emojis |
| D2 Photo — capture | "Tap to take photo" | "Snap the receipt — I'll read it from here." | Warmth |
| D2 Photo — parsed | (read-only rows) | Every field tappable; header: "I think this is what's on there. Tap anything to fix it." | Per-field edit |
| D3 Voice — recording | (silent) | "Go ahead — I'm listening." | Presence |
| D3 Voice — parsed | (read-only rows) | Every field tappable; header: "Here's what I caught. Tap anything to fix." | Per-field edit |
| D4 Text | "Type what happened" | "Tell me what happened — a sentence is plenty." | Warmth |
| D5 Manual | "Add transaction" | "New transaction — fill in what you know, skip what you don't." | Permission |
| D6 Mileage (new) | — | "Log miles — where from and where to? I'll do the math." | Clarity |
| E1 My Books home | "P&L / Invoices / Expenses / Tax / Export" | "Your books · April so far · +$52,400 take-home" (header) then sections | Number first |
| E2 P&L | (table) | Header: "Where the money went this month." | Warmth |
| E3 Invoices | (list) | Header: "Invoices — 2 open, 1 past due." | Summary |
| E4 Expenses | (list) | Header: "What you spent — by category." | Clarity |
| E5 Tax | (list) | Header: "Tax — Q2 is your next deadline." | Urgency |
| E6 Transaction list | (list) | (list with filters) | No change — add detail on tap (C5) |
| EContractors | (list) | Header: "Contractors you've paid this year." | Warmth |
| E7 Export — Step 1 | "Select period" | "What period? I can send Sarah the quarter, the month, or a custom range." | Name + choice |
| E7 Export — Step 2 | "Select format" | "Which format? QBO imports into most tax tools, CSV works anywhere, PDF is good for review." | Plain English |
| E7 Export — Step 2.5 (new) | — | "Here's what Sarah will see — scroll through and let me know if anything's off." | Preview |
| E7 Export — Step 3 | "Send to Sarah" | "Ready? I'll send Sarah the link. She can ask questions right here, and I'll pass them to you." | Loop close |
| F1 Connect (→ merge to Add) | — | See §12 | Structural |
| F3 Preferences (→ to popover) | — | See H1 | Structural |
| G1 Invoice — new | "New invoice" | "New invoice — who's it for, and what's the work?" | Warmth |
| G2 Invoice — customize | (form) | "Make it look like you — logo, colors, terms. Save it as default for next time." | Continuity |
| G3 Invoice — send | "Send" | "Ready to send — I'll follow up if it goes past due." | Proactive |
| H1 S-Corp payroll | "Payroll · $5,500 · Gusto" | "Gusto ran your April payroll — $5,500 to you as W-2. Clean and on file for Sarah." | Human + reassurance |
| H3 S-Corp distribution | "Distribution · $4,800" | "Distribution — $4,800 from Chase to your personal. That makes $14,500 in distributions this month on top of your W-2." | Context |
| I1 Backlog | "Things to review" | "A few things I flagged — no rush." | Shame-free (D61) |
| I2 Backlog — item | (link) | "Ace Hardware $89 · Business or personal?" | Direct question |

**American English sweep** (per §M15): any "categoris", "behaviour", "colour", "centred", "labelled", "customis" remaining — find-replace all.

---

## 10. Structural Recommendation #1 — 3-Tab Architecture

```
┌──────────────────────────────────────┐
│ [P-mark popover]       Penny         │
│                                      │
│ ← Thread content →                   │
│                                      │
│ ────────────────────────────────────  │
│ [1 Penny] [2 Add] [3 My Books]       │
└──────────────────────────────────────┘
```

- Tab 1 **Penny** — Home. Default landing. Active conversation thread.
- Tab 2 **Add** — Every way data enters Penny. Quick capture + Connected sources.
- Tab 3 **My Books** — Review, report, export.

The P-mark (top-left) opens the Preferences popover (see §11).

---

## 11. Structural Recommendation #2 — P-Mark Popover

Tapping the p-mark (top-left, every screen) opens a sheet from the top covering 85% of the screen:

```
┌──────────────────────────────────────┐
│ [P] Lindsay Morin                    │
│     Sails Up Marketing & Consulting  │
│     riddhijain@…                     │
│ ────────────────────────────────────  │
│ 🔔 Notifications      Real-time >    │
│ 🔒 App lock           Face ID · 5m > │
│ 📊 Accounting method  Cash >         │
│ 🔏 Data & privacy     >              │
│ 💬 Support            >              │
│ ────────────────────────────────────  │
│    Sign out                          │
│    Danger ▾                          │
│      Close account                   │
└──────────────────────────────────────┘
```

Note: the emoji icons shown above are placeholders for the popover only — **replace with SVG line icons in v4** per H13. Showing them here purely for layout intent.

---

## 12. Structural Recommendation #3 — Merged Add Tab Inventory

```
Add
├── Quick capture
│   ├── Photo of receipt (D2)
│   ├── Voice note (D3)
│   ├── Text note (D4)
│   ├── Manual entry (D5)
│   └── Log miles (D6 — new)
│
└── Connected sources
    ├── Banks
    │   ├── Chase Business Complete Checking · Connected
    │   ├── Mercury · Connected
    │   └── + Add bank
    ├── Credit cards
    │   ├── Chase Ink Business · Connected
    │   └── + Add card
    ├── Payroll
    │   ├── Gusto · Connected
    │   ├── OnPay · Available
    │   └── QuickBooks Payroll · Available
    ├── Peer-payment
    │   ├── Venmo · Available
    │   ├── Zelle · Available
    │   └── CashApp · Available
    ├── Payment processors
    │   ├── Stripe · Connected (invoice payments)
    │   ├── PayPal Business · Available
    │   └── Square · Available
    ├── Email receipts
    │   ├── Gmail (riddhijain@…) · Connected
    │   └── Outlook · Available
    ├── 1099 service
    │   └── Track1099 · Ready
    ├── Accounting software (export targets)
    │   ├── QuickBooks · Available
    │   ├── Xero · Available
    │   └── Wave · Available
    └── Historical import
        └── Upload CSV / OFX
```

---

## 13. Structural Recommendation #4 — CPA Preview + Share-Link View

Already detailed in §C3. Summary:

**Phone side (Lindsay):** After Step 3 in E7Export, a scrollable preview showing header, summary tiles, category breakdown, first 15 transactions. "Send to Sarah" at bottom.

**Desktop side (Sarah):** Separate HTML file or demo screen showing what Sarah sees after opening the share link. Filterable transaction table, download/export buttons, question-back channel.

---

## 14. Structural Recommendation #5 — Per-Field Edit on Parsed States

Applies to D2 Photo parsed state, D3 Voice parsed state, and (future) D7 Email-receipt parsed state.

```
┌──────────────────────────────────────┐
│ Here's what I caught.                │
│ Tap anything to fix.                 │
│                                      │
│ Vendor   [ Regus Nashua  ✎ ]         │
│ Date     [ 20 Apr 2026   ✎ ]         │
│ Amount   [ $350.00       ✎ ]         │
│ Category [ Office        ✎ ]         │
│ Tax      [ $0.00         ✎ ]         │
│ Account  [ Chase Ink     ✎ ]         │
│                                      │
│   [ Save ✓ ]  [ Cancel ]             │
└──────────────────────────────────────┘
```

Tap any field → inline keyboard/picker opens. On edit, field shows "edited" micro-label. Save confirms with ✓ toast.

---

## 15. Structural Recommendation #6 — Hand-Crafted Receipt SVG

One hero receipt asset for the demo:

**Receipt: Regus Nashua, NH**
- Brand: Regus logo at top (text-based to avoid trademark; styled lettermark)
- Address: "20 Trafalgar Sq, Nashua, NH 03063"
- Date / time: "20 Apr 2026 · 2:14 PM"
- Receipt #: "RG-20426-8841"
- Line items:
  - Day Pass · 1 · $325.00
  - Coffee service · 1 · $8.00
  - Tax (NH 0%) · $0.00
- Subtotal: $333.00
- Tip: $17.00
- Total: **$350.00**
- Payment: Visa …4821 · Approved
- Footer: "Thank you — regus.com"

Render as crisp vector inside an off-white paper background with a subtle shadow. Dimensions ~280×420px. Placed inside the phone-frame viewport at the receipt-parsed screen.

---

## 16. Structural Recommendation #7 — Vendor Drill-Down

Three levels of detail from My Books. See §C5 for the full spec.

**Minimum for demo:**
- Level 2 (transaction detail) — for every transaction (C5).
- Level 1 (vendor detail) — for TripAdvisor and Regus at minimum.
- Level 3 (category detail) — for Consulting Revenue and Meals.

---

## 17. Asset Inventory Needed for v4

| Asset | Format | Notes |
|---|---|---|
| Regus Nashua receipt | SVG/inline | See §15 |
| Phone-frame chrome | CSS | Status-bar live time |
| P-mark popover | React component | §11 |
| CPA share-link view | Separate HTML page or desktop-sized in-demo screen | §13 |
| Bank logos | Vector (Chase, Mercury, Chase Ink, Gusto, Stripe, Gmail, Track1099) | 1-color, `--ink` |
| Line icons (replace emojis) | SVG | Camera, Mic, Pencil, Car, Plus, Bank, Card, Payroll, Peer-payment, Email, Export — 1.5px stroke |
| Success toast | React component | 5s auto-dismiss, Undo CTA |
| Typing indicator | Animated dots | 1.5s loop |
| Waveform | Animated SVG | For D3 recording state |

---

## 18. Demo Flow Verification Checklist

The happy path that **must not break** when Lindsay touches the phone. Lindsay is driving — she has the link, she holds the phone. Nik is narrating over her shoulder.

1. **Open app** → typing indicator (1.5s) → Penny thread loads with a warm "Welcome back, Lindsay" and 3 things to look at today.
2. **Card 1 — C1 TripAdvisor income** ($6,500 retainer hit Chase). Lindsay taps "Looks right ✓" → 5s undo toast → card fades. Penny's copy uses **Memory Moment 1 — TripAdvisor rule**: "TripAdvisor sent your April retainer — $6,500 hit Chase. Marked as Consulting Revenue, the way you set it up in February."
3. **Card 2 — Regus recurring memory** (Memory Moment 2): "Regus Nashua charged $350 — same as last month. I've marked it as Office. Last month you told me this is Office, not Meals, so I've kept that going. No action needed."
4. **Card 3 — C7 variable recurring with $500 threshold memory** (Memory Moment 3): "Amazon charged $214 this month — your usual runs around $60. You asked me to flag anything over $500, so this isn't a blocker, but worth a look. Business, or did a personal order slip in?"
5. **Card 4 — C2 Stonyfield overdue** ($4,200, 14 days past due). Lindsay taps "Send gentle nudge" → confirmation.
6. **Open Add tab** → tap **Voice** → Penny says "Go ahead — I'm listening." Lindsay holds and records "Paid Mike thirty-five for lunch at Buckley's" → transcript fades in (500ms) → parsing beat (800ms) → parsed fields stagger in.
7. Lindsay taps the **amount field** → numeric keypad → confirms $35. Taps **vendor** → confirms "Buckley's Great Steaks". Taps **Save ✓** → approval toast.
8. **Open Add tab again** → tap **Photo** → camera shutter animation → **Regus Nashua $350 receipt SVG** renders in the parsed-state viewport → fields parse → Lindsay taps **category**, confirms Office → Save.
9. **Open Add tab again** → tap **Log miles** → form: From "Milford NH" → To "Needham MA" (TripAdvisor pre-fill) → distance 62mi × 2 → purpose "Client meeting, TripAdvisor" → save. Mileage deduction $83.08 at 2026 IRS rate.
10. **Back to Penny tab** → C5 W-9 request card for Mike Reed ("past the $600 line — want me to send him a W-9 request?") → Lindsay approves.
11. **Open My Books** → header shows "Your books · April so far · $52,400 take-home ↑$4,100". Tap **Consulting Revenue** category → Level 3 detail → tap **TripAdvisor** → Level 1 vendor detail (12-mo history) → tap 15 Apr deposit → Level 2 transaction detail with source, rule, history.
12. **Back to My Books** → tap **Payroll** section → W-2 salary $5,500/mo · 3 distributions totalling $14,500/mo · Mike Reed and 3 other contractors with 1099 candidates.
13. **Back to My Books** → tap **Audit-readiness 82/100** → detail view shows the +/− breakdown per §20.11. Lindsay sees what's good, what would help (Mike W-9, 3 uncategorized, Stonyfield overdue).
14. **Back to My Books** → tap **Export to CPA** → period = Q1 2026 → format = QBO → **Preview** step → scrollable preview (summary tiles + first 15 transactions) → tap **Send to Sarah** → success confirmation → tap **"View in Sarah's browser →"** → **opens CPA companion HTML in new tab**.
15. **[Companion HTML — Sarah's side]** Sarah sees her desktop dashboard. Top banner disclaimer visible. Category breakdown + transaction table + audit-readiness badge. Lindsay (or Nik) clicks a transaction → detail with receipt. Clicks "Ask Lindsay a question" → confirmation modal → closes.
16. **Back on phone** → tap **P-mark top-left** → popover slides in → Notifications = Real-time · App lock = Face ID 5m · Accounting method = Cash · Data & privacy · **Support** (tap → in-app chat preview showing the seeded Maya thread per §20.13 + Discord channel reference) → close popover.
17. **Open Add tab** → scroll to **Connected sources** → show every connection visible (Chase · Mercury · Chase Ink · Gusto · Stripe · Gmail · Track1099) + available connections.
18. **Back to Penny tab** → end on a positive card (e.g., "Q2 estimate is on track — $4,800 due June 15, you've got it covered").
19. **Lindsay asks a question** (demo Q&A per §20.14) → Penny responds with grounded data-backed answer.

**Every tap must land.** No placeholder. No generic routing. No dead-end.

**Safeguards:**
- Test on real iPhone Safari + real Android Chrome before the demo, not just desktop.
- Test with Lindsay's phone orientation locked to portrait.
- Test offline behavior — if her 4G drops mid-demo, the app should degrade gracefully ("I'll sync when you're back").

---

## 19. Decisions Locked by Nik (21 Apr 2026, late evening)

All 13 open questions answered. These are now requirements for Claude Design, not options.

| # | Question | Nik's decision | Implication for v4 |
|---|---|---|---|
| 1 | Demo device | Lindsay holds the phone; Nik shares link | Must have on-screen swipe chevrons + Next button in demo mode (H15). No keyboard-only navigation. Must behave on real iOS Safari + real Android Chrome (not just Desktop Chrome). |
| 2 | Demo length | Full flow — she should be **wowed** | Include every meaningful surface. No shortcuts. Every Critical + High + most Medium findings must ship. |
| 3 | Real beta context with grounded Q&A | Real, comprehensive data. If she asks a question it should answer like the real product — grounded in the data loaded. | Load a full, coherent dataset (see §21). Every number, vendor, date, client, category must be real and internally consistent. Penny thread should have enough pre-loaded history that she can scroll back and feel weight. Prepare a `memory.json` / seed data block with 6 months of transactions, 4 clients, 4 contractors, real invoices, real payroll runs. |
| 4 | Turnaround | **Today (21 April)** for demo on 22 April | Claude Design gets this file tonight and builds v4 by end of 21 April. Non-negotiable: Critical + High findings. Aim for Medium. Low findings cut if time pressure. |
| 5 | Memory moment | **Yes** — include 3 memory moments | (a) Regus recurring: "Last month you told me Office, not Meals — kept it going." (b) TripAdvisor rule: "You told me TripAdvisor deposits are always Consulting Revenue — applied automatically since then." (c) $500 threshold: "You asked me to flag anything over $500 — heads up, Amazon came in at $214 this month (usually $60), so not flagged but worth a look." |
| 6 | Client names | **Real names** — TripAdvisor · BAE Systems · Stonyfield Organic · Segue Technologies | No anonymization. Use full brand names. Given #11 (not recorded) and #10 (public URL), keep this private but not hidden. |
| 7 | CPA view | **Companion HTML** — Sarah opens on her own browser | Build two files: `Penny Demo v4 Standalone.html` (Lindsay's phone) and `Penny CPA View v4.html` (Sarah's desktop). Lindsay's send-to-CPA flow ends on a "View what Sarah sees →" link that opens the CPA HTML in a new tab. |
| 8 | Support surface | **Yes** — include | P-mark popover Support row opens a minimal in-app chat bubble preview. Include a Discord reference in the chat ("I can also loop you into your Discord support channel if you prefer — that's where our team hangs out"). |
| 9 | Mileage | **Yes** — with full edit flow | Add D6 Log Miles to Add tab. Capture flow: From (autocomplete client addresses) → To → Purpose (pick client) → Date → auto-calculated distance (or manual). Parsed state is per-field editable like voice/receipt. Mileage shows up in My Books → Expenses → Mileage section with IRS rate applied ($0.67/mile 2026). |
| 10 | Public shareable URL | **Yes** | Host v4 at a stable URL Lindsay can bookmark. Recommended: deploy to the FounderFirst GitHub Pages under `/penny-demo/` or a Netlify/Vercel static host. Both Lindsay's standalone HTML and Sarah's CPA view need public URLs. |
| 11 | Recording | **No — not recorded** | Client names (TripAdvisor, BAE, Stonyfield, Segue) are safe to use. Still add a light footer disclaimer (see #12). |
| 12 | Disclaimer | **Yes** — "For demo purpose only" | Small, non-intrusive footer on every screen: `"Demo preview — for illustration only"`. On the CPA view: add a banner at the top: `"Demo preview — data shown is for illustration only and does not represent actual financial records."` |
| 13 | Partner logos | **Yes — real logos cleared for demo** | Use official Chase, Mercury, Gusto, Stripe, Gmail, PayPal, Venmo, QuickBooks, Track1099, Discord marks. Keep to brand guidelines (single-color variants where possible). If a mark isn't available, use their public wordmark. |

---

## 20. Seed Data — Lindsay's Real Book (per Decision #3)

The demo must feel like Penny has been watching Lindsay's books for 6 months. Every number below is internally consistent (revenue − expenses − salary − distributions ≈ retained earnings; cash on hand matches bank sum; audit-readiness score maps to what's good / what's missing).

### 20.1 Business identity
- **Legal name:** Sails Up Marketing & Consulting, LLC
- **Tax classification:** S-Corp (IRS Form 2553 filed 1 July 2025, election retro-active to 1 Jan 2025)
- **Owner:** Lindsay Morin (100%)
- **State:** New Hampshire (no state income tax, no sales tax on services)
- **City:** Milford, NH
- **Business address:** 142 Elm Street, Milford, NH 03055
- **EIN:** 88-3194027 (fictional for demo)
- **Business start date:** 14 March 2023 (originally sole prop, S-Corp elected 2025)

### 20.2 Clients (4 active)

| Client | Location | Monthly retainer | Net terms | Started | Notes |
|---|---|---|---|---|---|
| TripAdvisor | Needham, MA | $6,500 | Net 15 | Jun 2024 | Always pays on time via ACH |
| BAE Systems | Nashua, NH | $5,500 | Net 30 | Sep 2024 | Monthly check, never late |
| Stonyfield Organic | Londonderry, NH | $4,200 (current invoice open) | Net 30 | Feb 2025 | Currently 14 days past due — see C2 |
| Segue Technologies | Bedford, NH | $3,800 | Net 15 | Nov 2024 | Paid most recent invoice 3 days late |

**Monthly recurring revenue ≈ $20,000**; 2026 YTD (Jan–Apr) ≈ $79,500.

### 20.3 Banks & cards

| Account | Type | Balance (as of 20 Apr 2026) | Connected |
|---|---|---|---|
| Chase Business Complete Checking | Operating | $42,680 | Yes — 2h ago |
| Mercury | Reserve / tax savings | $28,400 | Yes — 2h ago |
| Chase Ink Business (…4821) | Credit card | $1,847 spent this cycle | Yes — 2h ago |

**Cash on hand (operating + reserve):** $71,080. **Cash cushion at current burn:** 7.2 months.

### 20.4 Payroll (via Gusto)

- **W-2 salary to Lindsay:** $5,500/month (gross) — paid on the 15th
- **YTD W-2 wages (Jan–Apr):** $22,000
- **Employer-side payroll taxes YTD:** ~$1,683
- **Reasonable-compensation analysis:** flagged green (above IRS "reasonable" threshold for marketing consulting)

### 20.5 Distributions (owner draws)

| Date | Amount | From | To |
|---|---|---|---|
| 8 Apr 2026 | $4,800 | Chase | Lindsay personal |
| 15 Apr 2026 | $4,800 | Chase | Lindsay personal |
| 22 Apr 2026 | $4,900 (planned) | Chase | Lindsay personal |

**Monthly distribution average:** $14,500 · **2026 YTD:** $58,000.

### 20.6 Contractors (4 · for 1099 narrative)

| Contractor | Role | YTD paid | W-9 on file | 1099 required |
|---|---|---|---|---|
| Mike Reed | Freelance designer | $2,400 | ❌ Missing | Yes (over $600) |
| Priya Venkat | Copywriter | $1,800 | ✓ | Yes |
| Jordan Kim | Video editor | $950 | ✓ | Yes |
| Alex Fong | Web dev | $720 | ✓ | Yes |

The Mike Reed missing W-9 is the **H16 1099 narrative hook** — Penny asks Lindsay to request it.

### 20.7 Recurring expenses (monthly, auto-categorized)

| Vendor | Amount | Category | Rule learned | Notes |
|---|---|---|---|---|
| Regus Nashua | $350 | Office | After month 2 (Oct 2025) | **C3 + memory moment** — Lindsay corrected once from Meals → Office |
| Adobe Creative Cloud | $79.99 | Software | Auto from month 1 | |
| Google Workspace | $30 | Software | Auto from month 1 | |
| Zoom Pro | $16 | Software | Auto from month 1 | |
| Slack | $8.75 | Software | Auto from month 1 | |
| AT&T (phone) | $85 | Utilities | Auto from month 1 | |
| Hubspot | $50 | Software | Auto from month 1 | |
| Canva Pro | $12.99 | Software | Auto from month 1 | |
| Gusto (payroll platform fee) | $40 + $6/person | Payroll fees | Auto from month 1 | |
| CPA retainer (Sarah Miller) | $250 | Professional Services | Auto from month 2 | |

### 20.8 One-off transactions (last 30 days) to seed the thread

| Date | Vendor | Amount | Category | Type | Narrative |
|---|---|---|---|---|---|
| 20 Apr | Regus Nashua | $350 | Office | Expense | **Receipt SVG demo** |
| 19 Apr | Buckley's Great Steaks | $35 | Meals (50% ded) | Expense | **Voice note demo** ("Paid Mike thirty-five for lunch") |
| 18 Apr | Ace Hardware | $89 | Unclear | Expense | **C4 unusual charge demo** |
| 17 Apr | Amazon | $214 | Office/Unclear | Expense | **C7 variable recurring demo** (usually $60) |
| 15 Apr | TripAdvisor | $6,500 | Consulting Revenue | Income | **C1 large income demo** |
| 15 Apr | Gusto payroll | $5,500 | Payroll | Expense | **H1 W-2 demo** |
| 15 Apr | Distribution | $4,800 | Owner draw | Transfer | **H3 S-Corp demo** |
| 14 Apr | Segue Technologies | $3,800 | Consulting Revenue | Income | Auto-approved (recurring) |
| 12 Apr | Stonyfield Organic invoice sent | $4,200 | Invoice sent | — | **C2 overdue context** |
| 10 Apr | BAE Systems | $5,500 | Consulting Revenue | Income | Auto-approved |
| 8 Apr | Distribution | $4,800 | Owner draw | Transfer | |
| 5 Apr | Milford → Needham drive | 62 mi × 2 | Mileage | Expense | **D6 mileage demo** ($0.67 × 124 = $83.08) |
| 2 Apr | Milford → Nashua drive (Regus) | 12 mi | Mileage | Expense | |

### 20.9 Books snapshot (April MTD through 20 Apr 2026)

- **Revenue:** $15,800 (TripAdvisor + Segue + BAE ran; Stonyfield invoice open)
- **Expenses:** $2,287 (Regus, payroll fees, software stack, Amazon, Ace Hardware, meals, mileage-imputed)
- **W-2 payroll:** $5,500
- **Distributions:** $9,600 so far; $4,900 planned
- **Net retained for month:** ~$8,013
- **Take-home (W-2 + distributions) last 3 months:** $52,400 (↑$4,100 vs prior 3 months)

### 20.10 Tax

- **Q1 2026 estimated tax** — paid $3,800 (15 April deadline hit on time)
- **Q2 2026 estimated tax** — due 15 June — Penny estimate: **$4,800**
- **Q3 2026 estimated tax** — due 15 September — not yet estimated
- **Q4 2026 estimated tax** — due 15 January 2027 — not yet estimated
- **2025 Form 1120-S** — filed 14 March 2026 by Sarah Miller CPA
- **Sales tax:** Not applicable (NH no state sales tax on services)

### 20.11 Audit-readiness breakdown (82/100)

- **+20** Bank & card feeds all connected, < 24h fresh
- **+18** Payroll clean + reasonable comp flagged green
- **+15** 94% of expenses have receipts attached
- **+12** Quarterly estimate Q1 paid on time
- **+10** S-Corp formalities (1120-S filed, distributions matched to K-1)
- **+7** Contractor payments logged
- **−8** 3 transactions uncategorized (Ace Hardware $89, Amazon $214 variance, 1 meal unclear)
- **−6** Mike Reed W-9 missing — over $600 threshold
- **−4** Stonyfield invoice past due (affects cash-flow audit signal)

Tap on 82/100 → shows all of the above in plain English.

### 20.12 CPA identity
- **Name:** Sarah Miller, CPA
- **Firm:** Miller & Associates CPAs
- **Location:** Manchester, NH
- **Relationship:** Lindsay's CPA since Mar 2025
- **Retainer:** $250/month + quarterly/annual work billed separately
- **Communication:** Lindsay sends quarterly books via Penny share link

### 20.13 Support chat — seeded resolved prior question (per Decision #3 answer)

The P-mark popover → Support opens an in-app chat surface. **Seed it with one realistic, already-resolved workflow question** so Lindsay sees the support relationship is real and specific to how she actually uses Penny.

Recommended seeded thread (timestamps relative to demo day — 22 April 2026):

```
┌────────────────────────────────────────────────────┐
│  Support · Sails Up Marketing & Consulting         │
│  ─────────────────────────────────────────────      │
│                                                    │
│  Thu 17 Apr · 9:42 AM                              │
│  ───────────                                       │
│                                                    │
│  Lindsay:                                          │
│  "Hey — Sarah (my CPA) asked why the Regus         │
│  charge last month was showing as Meals and not    │
│  Office. Can you help me fix it?"                  │
│                                                    │
│  Maya (Penny Support) · 11m later                  │
│  "Hi Lindsay — no problem. I checked Penny's       │
│  history: the March 20 Regus charge was correctly  │
│  categorized as Office in your ledger. Penny       │
│  learned that rule back in October when you        │
│  corrected it. Sarah may have been looking at an   │
│  older CSV. Want me to resend the Q1 export so     │
│  she has the latest?"                              │
│                                                    │
│  Lindsay · 3m later                                │
│  "Yes please — thank you Maya"                     │
│                                                    │
│  Maya · 1m later                                   │
│  "Done — sent Sarah a fresh link. ✓ Let me know    │
│  if anything else."                                │
│                                                    │
│  ─────────── Resolved ───────────                  │
│                                                    │
│  [ Start a new question ]                          │
│  Or join your Discord channel: #sails-up-penny     │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Why this thread:** it ties together 3 things already in the demo (Regus recurring memory, Sarah as Lindsay's CPA, Q1 export flow). It shows Penny support is product-fluent — they know the vendor, the rule history, the CPA name, and the export mechanic. It resolves cleanly. And it demonstrates that Lindsay can escalate to a human without leaving the app. The Discord reference is a small secondary surface.

**Copy rules for the support thread:**
- Penny Support agent name: **Maya** (short, warm, human — clearly a person, not the AI)
- Response time < 15 minutes feels attainable but not instant (realistic for a quality support team)
- "Maya" never uses AI-system language; she speaks like a peer bookkeeper who works at Penny
- ✓ is the text glyph; no other emojis in the support thread
- Never blame Lindsay, never imply Sarah was wrong — frame as information gap

### 20.14 Grounded Q&A — likely questions Lindsay may ask

Claude Design should make sure Penny's responses to each of these are seeded into the thread OR answerable inline (Ask Penny pattern):

| Lindsay asks | Penny's grounded answer (data-backed) |
|---|---|
| "How much did I make this month?" | "$15,800 in revenue so far this April — Stonyfield's $4,200 invoice is still open." |
| "Can I afford to hire a part-timer?" | "Your cash cushion is 7.2 months and monthly net-retained is around $8k. A part-timer at $2k/mo would bring cushion to ~6 months. Want me to model it?" |
| "What's my biggest expense this year?" | "Payroll — $22,000 YTD in W-2 salary. Next is Regus at $1,400 YTD, then Adobe stack at $320 YTD." |
| "Am I paying enough in taxes?" | "You paid $3,800 for Q1 on time. Q2 looks like $4,800 — due June 15. I'll remind you." |
| "How am I doing vs last year?" | "April 2025 through April 2026 retained net is $98k. Same window prior year was $76k. You're up about 29%." |
| "Is my payroll high enough for S-Corp?" | "The IRS wants 'reasonable compensation' for your role. Marketing consultants in NH median around $62k — you're running $66k annualized. Sarah flagged this green on your 1120-S." |
| "What happens if Stonyfield doesn't pay?" | "You'd drop to $15,800 this month. Cushion falls to 6.8 months. Want me to send another nudge?" |

---

## 21. Hosting & Public URL (per Decision #10)

Recommended deploy plan:

**Lindsay's phone demo** → `https://founderfirst.one/penny-demo/` (or `https://penny-demo.founderfirst.one/`)

**Sarah's CPA view** → `https://founderfirst.one/penny-demo/cpa/` (linked from Lindsay's end of flow via "View in Sarah's browser →")

Both are static HTML. Deploy options:
- **GitHub Pages** (aligns with existing `index.html`/`_config.yml` at repo root) — simplest, free.
- **Netlify or Vercel** — better redirect control, but adds a tool.

Lindsay should be able to bookmark the URL on her iPhone and return to the demo anytime. The URL must be stable (not a preview URL that rotates).

---

## 22. CPA Companion HTML Spec (per Decision #7)

**File:** `Penny CPA View v4.html` (separate HTML, opens in new tab)

**Viewport:** Desktop-first (1440px reference), responsive down to 1024px.

**URL sharing:** When Lindsay taps "Send to Sarah" in E7Export, she sees a confirmation screen with a button "View in Sarah's browser →" that opens the CPA HTML.

**Sarah's view contents:**

```
┌────────────────────────────────────────────────────────────────┐
│  [P] Penny              Demo preview — illustration only       │
│                                                                │
│  Sails Up Marketing & Consulting                               │
│  Quarterly books — Q1 2026 (Jan 1 – Mar 31, 2026)              │
│  Shared by Lindsay Morin · 20 April 2026                       │
│                                                                │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Revenue  │ Expenses │ Net      │ W-2 pay  │ Distrib  │      │
│  │ $63,700  │ $6,861   │ $56,839  │ $16,500  │ $43,500  │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                                                                │
│  [ Download CSV ] [ Download PDF ] [ Export QBO ]              │
│                                                                │
│  Category breakdown                    Audit-readiness 82/100  │
│  ┌──────────────────────────────┐    ┌────────────────────┐    │
│  │ Consulting revenue   $63,700 │    │ What's good: 5     │    │
│  │ Payroll              $16,500 │    │ What would help: 2 │    │
│  │ Professional svcs    $750    │    │ View details →     │    │
│  │ Software             $1,200  │    └────────────────────┘    │
│  │ Office (Regus)       $1,050  │                              │
│  │ Meals (50% ded)      $340    │                              │
│  │ Mileage              $512    │                              │
│  │ Contractor payments  $4,150  │                              │
│  │ Payroll fees         $120    │                              │
│  └──────────────────────────────┘                              │
│                                                                │
│  Transactions [search] [filter: all | Jan | Feb | Mar]         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Date      Vendor              Amount   Category  Rcpt  │    │
│  │ 15 Mar    TripAdvisor         $6,500   Cons Rev  —     │    │
│  │ 10 Mar    BAE Systems         $5,500   Cons Rev  —     │    │
│  │ 20 Mar    Regus Nashua        ($350)   Office    ✓     │    │
│  │ 15 Mar    Gusto payroll       ($5,500) Payroll   ✓     │    │
│  │ ...                                                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  [ Ask Lindsay a question ]                                    │
│                                                                │
│  Demo preview — for illustration only                          │
└────────────────────────────────────────────────────────────────┘
```

Key behaviors for Sarah's view:
- Every category row drills into its transactions
- Every transaction row drills into detail + receipt (the Regus SVG should render on Sarah's side too)
- "Ask Lindsay a question" opens a comment form → in real product posts back to Lindsay's Penny thread (demo: confirmation modal)
- Download buttons simulate a file download (demo can return a small placeholder CSV)
- 82/100 audit-readiness is tappable → opens same breakdown as §20.11
- Top banner: "Demo preview — data shown is for illustration only and does not represent actual financial records."

---

## 23. Disclaimer Placement (per Decision #12)

**On Lindsay's phone (v4 standalone):**
- Small footer text below the tab bar on every screen: `Demo preview — for illustration only`
- 10px · `--ink-3` color · centered
- Never on top of a card or interactive element
- Removed on P-mark popover (no room)

**On Sarah's CPA view:**
- Top banner (full width) below the Penny header: `Demo preview — data shown is for illustration only and does not represent actual financial records.`
- `--ink-3` text · `--paper` background · 11px · left-aligned · 16px padding
- Sticky on scroll or not, Claude Design's call

**On the landing / bookmark-able page if any:**
- If there's an intro or cover page, include the disclaimer there prominently (14px · `--ink-3`)

---

## 24. Recommendation to Claude Design

Rebuild v3 → v4 as **two new files**, not a patch on v3:

1. **`Penny Demo v4 Standalone.html`** — Lindsay's phone. React 18 + Babel standalone. Mobile-first, 375px minimum, iOS-style chrome. Deploys to public URL (§21).
2. **`Penny CPA View v4.html`** — Sarah's desktop. Separate React standalone file or plain HTML. Desktop-first, 1440px reference, opens in new tab from Lindsay's "Send to Sarah" flow. Deploys to public URL (§21, `/cpa/` sub-path).

The architectural changes (3-tab shell, P-mark popover, receipt SVG, per-field edits, vendor drill-downs, CPA preview, mileage, grounded Q&A dataset) touch the component tree too deeply for a patch.

### Build priority — tonight (21 April) → demo (22 April)

Given today-night turnaround and "full flow · wow" expectation, ship in this order. If any phase slips, the earlier phases have already produced a demo-able build:

**Phase 1 — Architecture (2h)**
1. 3-tab shell (Penny · Add · My Books).
2. P-mark popover skeleton.
3. Demo-mode swipe chevrons + Next button on-screen (Lindsay holds phone — H15).
4. Seed data module loaded per §20 (all 200+ transactions, clients, contractors, audit breakdown).

**Phase 2 — Trust surfaces (3h)**
5. Regus Nashua receipt SVG (§15) rendered inside Photo parsed-state.
6. Per-field edit on D2 Photo + D3 Voice + D6 Mileage — inline taps open keypads/pickers (§14).
7. Vendor drill-down Level 2 minimum for every tappable row; Level 1 for TripAdvisor and Regus; Level 3 for Consulting Revenue and Meals (C5).

**Phase 3 — CPA flow (2h)**
8. CPA Preview inserted between Step 3 and Send in E7Export (§13 phone side).
9. Companion HTML file `Penny CPA View v4.html` built to §22 spec with real data.
10. Cross-linked from Lindsay's "View in Sarah's browser →".

**Phase 4 — Voice, content, tone (3h)**
11. Full tone pass per §9 — every screen, every string. Lindsay's name used ≥3 times.
12. Memory moments (§Decision #5) — 2 cards seeded in thread.
13. Grounded Q&A — seed thread with enough history that §20.13 questions work naturally.
14. American English sweep per §M15.

**Phase 5 — Connect inventory (1.5h)**
15. All connections wired per §12 — banks, cards, payroll (Gusto connected), peer-payment, email, 1099, accounting software, historical import.
16. Tap each for detail view.

**Phase 6 — Mileage + support (1h)**
17. D6 Log Miles flow with full edit (§Decision #9).
18. P-mark popover → Support → in-app chat preview with Discord reference (§Decision #8).

**Phase 7 — Polish (1h)**
19. Loading states, undo toast (5s per CLAUDE.md §2), empty/error state examples.
20. Live status-bar clock. Live date on thread.
21. Tap-target audit (44×44 minimum, L6).
22. Footer disclaimer per §23.

**Phase 8 — Deploy (30m)**
23. Push to public URL (§21).
24. QA on real iPhone Safari + real Android Chrome.
25. End-to-end demo-flow run (§18 checklist).

**Total estimated build:** ~14 hours. If parallelized or phased, likely 10–12h for one builder working focused.

### Success criterion

Lindsay picks up the phone at the start of the demo tomorrow and — within 10 seconds — feels like Penny already knows her business. Every surface she touches responds with real data. Every card speaks like a bookkeeper, not a form. She sees her CPA's view and thinks "yes, I'd send that." She finishes the demo **wowed**, not cautious.

If any surface in the §18 flow fails that bar, it's not shippable.

---

## 25. Follow-Up Decisions Locked by Nik (21 Apr 2026)

All 3 follow-up questions are now answered. Summary:

| # | Question | Nik's answer | Where it lives in this doc |
|---|---|---|---|
| 1 | Memory moments | **Both (a) and (b)** → 3 total: Regus Office rule, TripAdvisor Consulting Revenue rule, $500 threshold | §19 Decision #5 updated; §18 demo flow steps 2, 3, 4 |
| 2 | CPA name | **Generic popular name** → Sarah Miller, CPA · Miller & Associates CPAs · Manchester NH | §20.12 updated; all references swept |
| 3 | Support chat | **Seeded resolved prior question, in-flow with Lindsay's workflow** | §20.13 — Maya (Penny Support) thread about the Regus categorization / Q1 export resend |

Nothing else is open. This doc is the complete hand-off to Claude Design.

---

## 26. Final Build Package for Claude Design

**Two deliverables, two URLs, today:**

| File | Audience | Surface | Public URL |
|---|---|---|---|
| `Penny Demo v4 Standalone.html` | Lindsay | Phone, 375px min | `founderfirst.one/penny-demo/` (or equivalent) |
| `Penny CPA View v4.html` | Sarah | Desktop, 1440px ref | `founderfirst.one/penny-demo/cpa/` |

**Scope lock:**
- All 6 Criticals — must ship
- All 16 Highs — must ship
- All 15 Mediums — ship if time; M1/M10 (mileage) and M2 (emoji sweep) are non-negotiable
- Lows — polish if time remains

**Seed data lock:** §20 is the authoritative dataset. Every number, vendor, date, and client must match §20 exactly.

**Tone lock:** §9 table is authoritative per-screen copy. No substitutions without Nik sign-off.

**Success bar:** §24 success criterion — Lindsay holds the phone, feels the product already knows her business, touches every surface, and finishes the demo **wowed**. Sarah opens the companion tab and thinks "yes, I'd review this."

---

*This document is the hand-off. Changes after this point should be filed as v4.1 addenda, not back-edits to v4 scope.*
