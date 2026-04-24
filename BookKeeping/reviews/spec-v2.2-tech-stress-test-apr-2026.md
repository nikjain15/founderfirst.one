# Penny — v2.2 Spec Tech Stress Test
**Target document:** `product/spec-brainstorm-decisions.md` v2.2 (86 decisions · 21 April 2026)
**Cross-referenced against:** `architecture/system-architecture.md` v4, `engineering/engineering-decisions.md` (placeholder), `ai-evals/00–05`, `research/solo-freelancer/irs-tax-research.md`, `product/app-spec.md` v1.2, `product/tone-guide.md`, `design/design-system.md`.
**Reviewed:** 21 April 2026
**Lens:** technology / build feasibility. Logic, contradictions, and under-specification only. **No timeline or cost commentary per Nik's instruction.**

> **Purpose.** Find every place the v2.2 decisions either contradict each other, contradict the architecture, or are under-specified such that a builder cannot implement them without guessing. The product direction is strong and the decision-lock is clean. The gaps below are pre-build gaps — they show where a builder (solo-Nik + Claude) would stop and ask, or worse, would not stop and would build the wrong thing.
>
> **Scope note.** All 86 decisions are treated as frozen per CEO instruction. Nothing below proposes re-opening a settled decision. Where a product statement is in structural tension with a technical reality, the proposed fix is a *clarification of language or mechanism* — not a reversal.
>
> **How to read.** Findings grouped by severity. Each has **What is wrong · Why it matters · Proposed fix.** Findings tagged `[NEEDS CEO]` require a small clarification call from Nik before the implementation strategy can treat the decision as buildable.
>
> **Counts.** 4 Critical, 6 High, 10 Medium, 5 Low, 4 Decisions Needed. None are fatal. All are fixable in a focused spec pass.

---

## Executive summary

The v2.2 spec is the cleanest-locked product-decision document in the project. Three systemic problems emerge when it is read against what has to be built:

1. **Two hard rules are in tension with implementation reality.** D58 says *never move money*; launch scope now includes Stripe Connect Pay Now (an infrastructure Penny provides for clients to pay Alex). D74 says *Penny never reads personal email*; Gmail's OAuth scopes do not expose a "receipts only" scope — the system must fetch all mail matching a sender/subject heuristic and filter post-fetch. Both promises can be kept — but only after the *language and mechanism* are reconciled. Left as-is, either promise will be silently broken in implementation or will block a feature that CEO has already approved.

2. **Several decisions stand on a research doc that has not been completed yet.** D20 (category taxonomy), D42/D67 (quarterly tax deadline cadence), D54/D55/D72 (year-end and Schedule C / 1120-S mapping), D79 (payment plans) all reference `irs-tax-research.md` which is marked "research pending." A full launch scope — especially full S-Corp at MVP — cannot be built without that research being done first. This is not a v2.2 flaw; it is a dependency the strategy doc must name as a hard prerequisite.

3. **The architecture was written before several v2.2 decisions existed.** Pending/settled transaction lifecycle (D5–D7), rolling-median vendor anomalies (D76), CPA multi-user access (D56), payroll ingestion and the S-Corp ledger primitive (D72), offline capture queue semantics (D81), and email-receipt ingestion pipeline (D74) are either absent from architecture v4 or sketched at a level that will not survive first contact with a builder. Architecture v4 needs a v4.1 companion pass before code starts — or the implementation strategy has to extend it.

Everything else below is secondary and fixable inside each decision's own language.

---

## CRITICAL — Must reconcile before build starts

### C1. D74 *"Penny never reads personal email"* — Gmail's OAuth model does not support this as a structural guarantee

**What is wrong.** D74 commits: *"Penny's inbox scanner reads **only** messages matching receipt signals — known vendor domains, receipt-like subject lines, structured HTML receipt markup."* The guardrail is stated as a hard promise: *"Penny never reads personal email."*

Gmail's OAuth scopes do not offer a "receipts only" scope. The available scopes are: `gmail.metadata` (headers only — no body), `gmail.readonly` (full read), `gmail.modify`, `gmail.labels`. A server that wants to see the body of a receipt email to parse vendor/amount/date needs `gmail.readonly` — and that scope *gives access to every message in the mailbox*. Outlook/Microsoft Graph has the same limitation (`Mail.Read` is mailbox-wide).

To honour D74 structurally, the system must either (a) fetch all mail headers via the metadata scope, apply a sender/subject heuristic at the server, then fetch only matching messages' bodies via `gmail.readonly`, or (b) ask the user to apply a specific Gmail label to receipts (unacceptable UX burden) and use `gmail.labels`-scoped access, or (c) accept `gmail.readonly` and make the "never reads personal email" guarantee a *data-handling* promise enforced by code, not an OAuth-scope-level guarantee.

**Why it matters.** This is not a technical inconvenience — it is the difference between a provable privacy guarantee and a trust-us one. Solo freelancers and their CPAs will ask "so Penny reads everything in my inbox?" If the answer is "technically yes, but we filter server-side," that is fine *if stated clearly*. If D74 reads as an absolute and the implementation is a filter pipeline, the product ships a broken promise — exactly the class of trust failure Penny is built to avoid. General Counsel review (noted in D74) will catch this, but it is faster to fix now.

**Proposed fix.** Amend D74 to state the *mechanism* explicitly:
- OAuth scope: `gmail.metadata` by default. Body-fetch only occurs for messages that pass a server-side sender/subject/domain allowlist.
- Full content fetch is audit-logged per message.
- The promise is restated: *"Penny fetches only the content of messages that match a published receipt allowlist (vendor domains + subject patterns). Alex can view the allowlist and the full audit log of fetched messages in Connect → Preferences."*
- Forwarding-address fallback (already in D74) is the zero-trust option for Alex who does not want OAuth at all.

### C2. D58 *"Never move money"* vs. Stripe Connect Pay Now (launch scope per CEO decision today)

**What is wrong.** D58 Hard Rule #1: *"Never move money. Penny tracks and categorizes. She never initiates a payment, transfer, or transaction on Alex's behalf."* Launch scope (CEO decision 21 Apr 2026) includes Penny providing a built-in Pay Now button on every invoice, powered by Stripe Connect. When Alex's client clicks Pay Now, money moves from client → Stripe → Alex's linked bank. Penny orchestrates the Stripe Connect account, the invoice, the payment link, and the payout config.

**Why it matters.** Technically HR1's *initiates on Alex's behalf* language may survive this — the client (not Penny, not Alex) initiates the transfer by clicking Pay Now. But the spirit of HR1 ("tracks and categorizes") is clearly broader than the current launch reality. A builder reading D58 literally would not build Stripe Connect. A builder reading the CEO decision would. The two must agree.

Also: D79 payment plans ("Penny generates scheduled sub-invoices, sends each on schedule") increase the tension. A scheduled installment email with a payment link pre-embedded is arguably Penny initiating a request for payment on a pre-defined schedule — closer to moving money than a one-off invoice is.

**Proposed fix.** Amend D58 HR1 to distinguish *initiation* from *infrastructure provision*:

> **Never initiate a payment on Alex's behalf.** Penny provides the rails (invoicing, payment links, payout configuration) at Alex's explicit direction. Penny never debits an account, transfers funds between accounts, or authorises a payment without Alex's direct per-event action. Stripe Connect Pay Now lives at the intersection: *Alex authorises the invoice and its payment terms; the client initiates the transfer by paying; Stripe executes*. Penny never moves money by itself.

Also amend D79 to clarify: scheduled installment sends are authorised at plan creation (one-time consent), not per-installment. If a plan is paused or the next installment is late, Penny surfaces it rather than silently proceeding. `[NEEDS CEO]` confirmation of the language.

### C3. D20 category taxonomy blocks MVP until `irs-tax-research.md` is completed

**What is wrong.** D20: *"Alex sees plain English. Penny knows the full IRS Schedule C / 1120-S line mapping, deductibility percentage, and supporting-info requirements."* The doc points to `research/solo-freelancer/irs-tax-research.md` (Q-C1) for the full taxonomy. That file is in the tree but its content is "research pending" per `CLAUDE.md`.

Launch scope is **full S-Corp** (D72). 1120-S line mapping does not exist in the spec or the research yet. Schedule C mapping partially exists in `research/bookkeeper-role-reference.md` but has not been codified as a machine-readable taxonomy.

**Why it matters.** No categorization AI can be trained, no eval suite can be scored, no export adapter can be built, and no auto-approval rule can apply until there is a finite, typed taxonomy with (a) plain-English label, (b) Schedule C line reference, (c) 1120-S line reference, (d) deductibility default (0%–100%), (e) supporting-info requirement (receipt/note/mileage/etc.), (f) which business types and entity types the category applies to. This is a build-blocker upstream of everything else in the Intelligence Service and the Export Service.

**Proposed fix.** The implementation strategy treats `irs-tax-research.md` completion as a hard prerequisite — not a parallel workstream. The taxonomy file is the *first* engineering artefact produced: a versioned JSON/YAML schema (`categories.v1.json`) reviewed by a US-licensed CPA before code ships. Until that file exists, the Intelligence Service and Export Service cannot be built.

### C4. D55 / D72 export-file compatibility claims may not match reality for TurboTax and H&R Block

**What is wrong.** D55: *"Direct export files compatible with QuickBooks, Xero, **TurboTax Self-Employed, and H&R Block Self-Employed**."* D72: *"1120-S export mapping alongside Schedule C, **TurboTax Business / H&R Block Business compatibility**."*

QuickBooks (IIF, QBO, CSV) and Xero (CSV, XML) have public, documented import formats. TurboTax Self-Employed and TurboTax Business do not have a third-party import format that a non-Intuit tool can reliably target. TurboTax Self-Employed imports from QuickBooks Self-Employed (Intuit-to-Intuit) and from limited banking/brokerage partners. H&R Block Self-Employed imports primarily from W-2 / 1099 PDFs and prior-year H&R Block returns. Neither exposes a general "import my freelancer P&L" file format.

The realistic export paths for DIY filers are: (a) a clean CSV that the filer pastes into the tax tool manually, category-by-category; (b) a PDF summary the filer reads and types from; (c) QuickBooks-compatible export that is imported into QBSE, which TurboTax then reads. Not "direct export file compatible with TurboTax."

**Why it matters.** D55 reads as a launch-blocking feature promise. A solo freelancer picking Penny because "I can export straight into TurboTax" will feel misled when she has to paste numbers by hand. This is exactly the class of claim that destroys word-of-mouth — the only growth engine the company has.

**Proposed fix.** Reframe D55's DIY export promise to match reality:

> **Direct file export:** QuickBooks-compatible (QBO, IIF) and Xero-compatible (CSV). These import cleanly into QBSE, Wave, and any tool that reads QBO/Xero files — including TurboTax (via QBSE).
> **DIY-filer-ready CSV and PDF:** A human-readable summary aligned to Schedule C line numbers (and 1120-S for S-Corp) that Alex or her tax software can use directly. TurboTax Self-Employed and H&R Block Self-Employed users paste category totals into the matching field; Penny's PDF shows Schedule C line-by-line so the paste is mechanical.

`[NEEDS CEO]` on whether to keep TurboTax/H&R Block in the marketing claim. Same fix pattern for D72's TurboTax Business / H&R Block Business claim on 1120-S.

---

## HIGH — Resolve before the affected service is built

### H1. D56 CPA access implies a multi-user / multi-tenant model that architecture v4 does not yet describe

**What is wrong.** D56 commits: *"Alex generates a secure, read-only share link in one tap — the CPA opens it in a browser, sees the full books."* and *"CPAs get their own Penny view — read-only with the ability to leave notes and make corrections that feed back into Penny's model as ground truth (D40)."*

Architecture v4 defines row-level security at `business_id = current_business_id`. There is no `user_id` concept beyond Alex herself. There is no CPA role, no scoped read-only access model, no note-making surface, no audit trail of CPA actions separate from Alex's. A share link with CPA-leaves-corrections semantics requires:
- A `User ↔ Business` many-to-many relation with a role (`owner`, `accountant`, `viewer`).
- Share-link tokens (time-limited, scope-limited, revocable).
- CPA-authored events in the event log, attributed to the CPA's user ID, separate from Alex's.
- A permission surface Alex sees in Connect.

**Why it matters.** D40 relies on CPA corrections as ground-truth training signal. Without the multi-user model, D40 reduces to "Alex's own corrections" which collapses its value for the freelancers who do have CPAs (a research-pending segment, see D56's hypothesis marker). The implementation strategy has to specify the multi-user model from day one because retrofitting auth models in a financial product is the same class of expensive retrofit as entity type (D72's language: "5–10×").

**Proposed fix.** Architecture v4.1 companion section: *User, Role, and Share Link* — defines `User` as distinct from `Business`, a membership table, the three roles above, the share-link token structure, and the per-role RLS extension. Implementation strategy builds this before CPA features, not after.

### H2. D86 adaptation-floor signal list has Q-A1 open — settings UX can't ship without a final list

**What is wrong.** D86 locks the *stance* (delivery configurable, signal itself not mutable) and provides a *starting list* of six floor signals. Q-A1 explicitly says the list may grow, and the settings UX must be built to accommodate growth without redesign.

**Why it matters.** A builder cannot ship Connect → Notifications without a final list of floor signals. "Accommodate growth without redesign" is good architectural intent, but the initial set of rows, the copy for each row, the delivery controls exposed per row (timing, cadence, quiet hours), and the default values for each are all launch-scope. Shipping with "list may grow" is fine; shipping without the MVP list is not.

**Proposed fix.** Treat the six signals in D86 as the frozen MVP list. Before launch, the settings UX ships the six rows with their defaults defined. Additional signals land via a lightweight config (new row → new JSON entry → new copy → ship). `[NEEDS CEO]` to either confirm the six are final-for-MVP or add/subtract explicitly.

### H3. D82 *"Face ID required on every app open — not optional, not a setting"* — will need operational definition

**What is wrong.** D82 states Face ID is required on every app open. Literally interpreted: every time Alex taps the icon, she re-authenticates. Apple's Human Interface Guidelines and standard banking-app behaviour (Chase, Wise, Revolut, Stripe Dashboard) authenticate on cold launch and after a configurable background period (typically 1–15 minutes), not on every foreground. A literal "every open" implementation is friction that drives abandonment and contradicts the "calm friend" tone.

**Why it matters.** A solo freelancer checks her money app 10–30× per week (D73 validation premise). Face ID on every single tap is a UX failure mode that will be cited in App Store reviews within the first week. The spec as written will be implemented literally unless clarified.

**Proposed fix.** Amend D82: *"Face ID required on cold launch, on foreground after X minutes in background (configurable per-user between 0, 1, 5, 15), and always before sensitive actions (export, bank connect/disconnect, CPA share link, cancel account, settings change)."* Default X = 5 minutes. "Not optional, not a setting" survives at the signal level (you can't turn Face ID off), but the trigger cadence is appropriately bounded. `[NEEDS CEO]` on default X value.

### H4. D82 *"Remote wipe"* — scope undefined

**What is wrong.** D82: *"Remote wipe via Connect → Preferences."* Two distinct meanings:
- (a) Wipe Penny's local data on all of Alex's devices (clear SQLite cache, clear Keychain items, force re-auth). Fully within app control.
- (b) Wipe the device itself. Requires an MDM profile, only works if Alex is under an MDM, not consumer-standard.

**Why it matters.** A builder reading "remote wipe" without context will default to (a) because (b) is not feasible for consumer apps. That is probably what Nik meant — but the language says "device security — enterprise-grade" and lists "MDM-compatible deployment path." The two readings produce very different features.

**Proposed fix.** Amend D82: *"Remote wipe of Penny's local data (cache, offline queue, local cache of ledger, Keychain items) — triggered from Connect on another authenticated device. Device-level wipe is via Apple Find-My or the user's MDM; Penny does not implement device-level wipe itself."* `[NEEDS CEO]` confirm.

### H5. Pending / settled transaction lifecycle is in v2.2 (D5–D7) but not modelled in architecture v4

**What is wrong.** D5: Penny shows transactions as pending. D6: materiality threshold on settlement. D7: pre-auth handling. Architecture v4's Transaction entity lifecycle chart (in Core API §) shows: *Raw event received → Stored immutably → Enrichment complete → Pending review → Auto-approved | Surfaced for review → Confirmed*. The word "Pending" in v4 means "pending Alex's review after enrichment" — not "pending at the bank."

These are two different pending states. A bank-pending transaction is a different kind of provisional record than a Penny-pending-review one. The architecture does not distinguish them, and the event log schema in v4 does not have fields to carry bank settlement state.

**Why it matters.** Without distinguishing bank-pending from Penny-pending, the builder will conflate them — and an auto-approval rule that fires on a bank-pending transaction may book income or expense that later settles at a different amount and need retroactive correction. This is the exact class of "wrong number the user sees as broken trust" that architecture v4's values forbid.

**Proposed fix.** Architecture v4.1 extends the Transaction entity with a `bank_state` enum (`pending`, `posted`, `refunded`, `disputed`) orthogonal to the existing `enrichment_state` (`raw`, `enriched`, `pending_review`, `auto_approved`, `confirmed`, `corrected`). The D6 materiality threshold logic belongs to a service rule, not the Transaction entity; the rule operates on events of type `TransactionSettled` with access to the prior `TransactionPending` event.

### H6. D72 AI evals gap — S-Corp signals not yet testable, evals 03–05 are placeholders

**What is wrong.** D72 commits: *"AI evals extended to S-Corp-specific signals: distinguishing salary from owner draw from expense reimbursement to self."* D59 confirms: *"AI evals — separate eval suite... must include sole prop, LLC, and S-Corp specific test cases (per D72)."* Meanwhile `ai-evals/03-data-capture.md`, `04-financial-computation.md`, and `05-anomaly-detection.md` are all marked 🟡 placeholder in `CLAUDE.md`.

Nik noted in the product-strategy conversation today: evals need to be rewritten to be solopreneur-specific and v2.2-aligned.

**Why it matters.** "No model ships until every eval passes" is the deployment gate in architecture v4. If evals 03–05 are placeholder and S-Corp cases don't exist anywhere, then no Intelligence Service model can ship at all. This is upstream of shipping the Intelligence Service, not parallel.

**Proposed fix.** Treat eval suite rewrite (solopreneur-specific, v2.2-aligned, S-Corp-extended) as a launch prerequisite artefact alongside `categories.v1.json` (C3). Implementation strategy names evals as a named-owner deliverable with specific test-case counts per eval, including S-Corp-specific tests per eval suite. `[NEEDS CEO]` sign-off on whether evals rewrite is an engineering deliverable or a product-research deliverable (likely product-research with engineering collaboration).

---

## MEDIUM — Clarify before the decision becomes a feature spec

### M1. D76 rolling-median anomaly detection needs a storage and initialization model

**What is wrong.** D76: *"When an amount exceeds 2× the vendor's rolling median, Penny resurfaces it with reasoning."* The architecture's read-projection model supports this — a `VendorStats` projection keyed on vendor with rolling median and sample count — but v4 does not mention it. The initialization question is also unanswered: what is the rolling window (last 6 charges? last 90 days? both?), and at what sample size does the median become trustworthy (3? 5? 12?)?

**Why it matters.** Below the sample-size threshold, "2× the median" is noise. A variable-amount vendor seen twice (e.g. $120 then $240) has a 2× ratio that will always trigger. Alex will see every other charge for that vendor as an anomaly.

**Proposed fix.** Implementation strategy defines: window = last 12 charges or 180 days, whichever is shorter; minimum sample = 3; rolling median + rolling MAD (median absolute deviation); threshold = median + 2 × MAD (statistically sound) instead of "2× the median" (numerically fragile). Tune in eval 05 (D76's own pointer). Persisted in `VendorStats` projection, updated per-event.

### M2. D21 confidence thresholds are "to be defined in engineering" — but evals depend on them

**What is wrong.** D21: *"Specific confidence thresholds (what triggers each tier) to be defined in engineering."* Architecture v4 says confidence is calibrated against empirical accuracy, and thresholds are applied to the calibrated score.

Neither doc gives a threshold number. Without a number there is no test for "high confidence ✓ vs medium confidence 'Looks like'" and no eval can test whether the confidence signalling is accurate.

**Proposed fix.** Starting thresholds (to be tuned in eval 01): calibrated ≥ 0.90 → ✓ high; 0.70–0.90 → "Looks like" medium; < 0.70 → "I don't recognize this" (D25). Ship these as defaults; tune via correction data in the first 100 users. Document in implementation strategy.

### M3. D66 / D68 audit-readiness score formula undefined

**What is wrong.** D68 displays "You're 73% audit-ready this quarter." D66 names the inputs: compliance completeness by quarter, receipts attached, categorization confidence, outstanding gaps. The formula that turns inputs into a percentage is not defined.

**Why it matters.** A percentage shown to Alex must be consistent, explainable, and testable. If a builder invents a formula the number will be different across sessions and will lose credibility.

**Proposed fix.** Starter formula: weighted average of four components — (a) % of transactions with all IRS-required supporting fields present (weight 40%), (b) % of receipts attached where a receipt is expected (25%), (c) weighted mean of categorization confidence across the period (20%), (d) % of flagged/uncategorized transactions resolved (15%). Show the four component scores if Alex taps into the indicator. Tune weights post-launch based on CPA interviews (Research Pre-Commit #6).

### M4. D78 *"never auto-sends"* vs. D79 *payment plans send installments on schedule*

**What is wrong.** D78: *"Penny never auto-sends without Alex's explicit confirmation."* D79: *"Penny generates scheduled sub-invoices, sends each on schedule (per Alex's preferences — see D78)."* The reference back to D78 is circular — D78 forbids the behaviour D79 requires.

**Why it matters.** Payment plans are industry-standard (FreshBooks/QBO/Stripe). A plan that requires Alex to tap send on every installment defeats the feature's purpose — Alex could just send three one-off invoices. But a plan that sends silently violates D78.

**Proposed fix.** Amend D79 (and the D78 reference inside it): *"Payment-plan consent is granted once at plan creation. Each scheduled installment sends automatically at its due date unless Alex pauses the plan. Penny notifies Alex when each installment sends. D78's 'never auto-send' applies to recurring retainer invoices, which have no explicit plan-level consent step."* Keeps D78's intent (no silent sends without a signature act of consent) and unblocks D79 (plan creation is the consent).

### M5. D23 personal activity lines vs. D73 status-view landing — where do they live?

**What is wrong.** D23 says personal-looking transactions appear in the feed as "quiet activity lines." D73 proposes the mobile landing is a *status view*, with the conversation thread as a peer surface. If the default landing is status, there is no "feed" to hold activity lines at first open.

**Why it matters.** A builder reading D23 and D73 together cannot place activity lines. Do they live on the status screen (cluttering it)? Only inside the thread (hidden at first open)? Inside My Books?

**Proposed fix.** Implementation strategy locks: activity lines live in the **thread** (Tab 1). The status view (D73 hypothesis) surfaces *numeric summary* and *floor signals* (D86), not activity lines. Alex taps into the thread to see the feed. This matches D23's "quiet lines in the feed" literal language while preserving D73's status-first landing. `[NEEDS CEO]` confirm, pending the D73 diary study (Q-N1).

### M6. D84 historical-import conflict scenario only arises post-onboarding — the doc reads as if onboarding

**What is wrong.** D84 says: *"When imported historical data contradicts Penny's live-learned model (e.g. 2024 books show Starbucks as 'Personal'; current model learned 'Business Meal'), the conflict is flagged to Alex with both views."* On Day 1 of onboarding, Penny has no live-learned model. The conflict case applies only if Alex imports historical data *after* building the learned model (e.g. bringing in a prior year's QBSE data six months into using Penny).

**Why it matters.** A builder reading D84 during onboarding design will build a conflict UI that is never triggered on day one. During post-onboarding imports, the same UI applies. The ambiguity is: is D84 an onboarding feature, a Connect → "import historical data" feature, or both?

**Proposed fix.** Amend D84: *"Historical import is available (a) at onboarding — bulk pull from prior tool with bulk-confirm; and (b) anytime from Connect → Data → Import history. Conflict-with-learned-model only applies to (b). (a) has no pre-existing model to conflict with."*

### M7. D83 *"Not sure"* diagnostic assumes tax knowledge the user may not have

**What is wrong.** The diagnostic asks: *"Do you file a Schedule C, or a separate business return?"* A solo freelancer who doesn't know her entity type is not likely to know whether she files Schedule C. The diagnostic's first branch assumes the answer to a more advanced question.

**Why it matters.** The diagnostic exists to rescue the "not sure" user. If the first question is harder than the original question, the rescue fails.

**Proposed fix.** Reorder the diagnostic to start from what Alex actually knows:
- Q1: Are you the only owner of the business? (yes → sole prop or single-member LLC or S-Corp elected · no → multi-member LLC or C-Corp or partnership)
- Q2: When you started your business, did you file paperwork with your state? (no → sole prop; yes → LLC or corporation)
- Q3: Do you pay yourself a regular salary via payroll? (yes → S-Corp or C-Corp; no → sole prop / LLC / pass-through)

Penny's reasoning-shown step (already in D83) then infers the likely type.

### M8. D69 / D77 Zelle handling — bank-feed parsing is the only path, acknowledge the accuracy gap explicitly

**What is wrong.** D77 states Zelle has no public API and data flows through the bank feed only. D69 describes per-sender learning from weak vendor strings like "ZELLE PAYMENT FROM J SMITH." The accuracy of Zelle-inbound attribution is therefore bounded by bank-feed vendor string quality, which varies wildly by bank (Chase formats differently from Bank of America; credit unions can be unreadable).

**Why it matters.** Hypothesis decision D69 is marked 🧪, and D77 acknowledges the gap — but Alex's experience will be: "Penny knows every Stripe payment cleanly, but my Zelle payments from my biggest client keep getting tagged wrong." This is the category of inconsistency that erodes trust if not named.

**Proposed fix.** Amend D77 to commit to an explicit accuracy-gap disclosure in-product: the first time Penny flags a Zelle inbound, she says *"Zelle doesn't give me the same detail Stripe does — I'll learn faster from your first few."* This matches D25 (never fake confidence) and sets Alex's expectation.

### M9. D65 cash-runway calculation — "current cash balance" source unspecified

**What is wrong.** D65: *"Calculated as current cash balance ÷ trailing 90-day average expenses."* Plaid offers a Balance product that returns real-time account balance. The spec does not reference which balance is used (account-level sum? business-designated accounts only? exclude credit-card debt?).

**Why it matters.** A sole freelancer whose primary checking account holds $12,000 and whose personal savings holds $80,000 sees very different runway depending on which balance the number includes. If the business account only is used, runway can look alarming; if everything is summed, it is misleadingly comfortable.

**Proposed fix.** Implementation strategy specifies: runway denominator = trailing 90-day average of transactions *confirmed as business expenses* (not personal). Numerator = sum of balances on accounts designated as business per D4. Personal accounts are excluded unless Alex explicitly includes them. `[NEEDS CEO]` confirm.

### M10. D64 income volatility language — trailing 90-day default needs a floor for new users

**What is wrong.** D64: *"Income dipped vs. last month — that's normal for freelancers. Your 90-day trend is healthy."* For Alex in week 2 of using Penny, there is no 90-day trend. Calculation needs a minimum history before the "healthy" language fires.

**Why it matters.** Penny telling Alex "your 90-day trend is healthy" when Penny has seen 14 days of data is the exact class of overclaim D25 forbids.

**Proposed fix.** Language fires only when ≥ 60 days of history are available. Before that, Penny says: *"Income is lumpy — that's normal for freelancers. I'll show you trends once I've seen more of your business."* Implementation strategy flags this as a read-projection rule, not a language choice.

---

## LOW — Tidy-up findings

### L1. D80 custom fonts — licensing not addressed
"A curated web-font library" requires licensed fonts for commercial embedding in PDFs Alex sends to her clients. Google Fonts (SIL OFL) works; most commercial fonts do not without a license. Implementation strategy names: launch with Google Fonts (Inter, Lora, IBM Plex Sans, Playfair Display, Merriweather — five curated); expand later. Non-blocking.

### L2. D71 "immediate full export" on cancel — sync or async?
An export of 24 months of transactions plus receipt images could be 100+ MB. "Immediate" realistically means "starts immediately, completes async, delivered via email link within minutes." Implementation strategy clarifies. Non-blocking.

### L3. D27 split-format ask-timing is wrong
Penny asks which split format Alex prefers *before* Alex has needed a split. Should be asked at the moment of first split, not up-front. Non-blocking.

### L4. D38 federated-learning opt-in — launch scope unclear
Opt-in shared-model training is named as a "future opt-in layer." Implementation strategy should either (a) not build it at launch, just the opt-in record, or (b) build it with a placeholder stub. Non-blocking; `[NEEDS CEO]` eventually.

### L5. Spec references `irs-tax-research.md` as if it exists with content; `CLAUDE.md` shows it as pending
Minor inconsistency of framing. Not a contradiction in fact — just a drafting artefact. The doc exists as a named shell.

---

## DECISIONS NEEDED from Nik before the strategy doc can be finalised

These are small CEO-level clarifications, not re-openings of settled decisions.

**DN1. C2 Pay Now language.** Confirm the reframed D58 HR1 language distinguishing "initiate" from "infrastructure provision." This unblocks the invoicing and payments build.

**DN2. C4 TurboTax / H&R Block claim.** Confirm whether to keep direct TurboTax compatibility in the claim (in which case the strategy doc must name a workaround — e.g. Penny exports to QBSE format, QBSE exports to TurboTax) or drop the specific brand-name claim in favour of CSV/PDF-paste support.

**DN3. H3 Face ID default cadence.** Confirm default background-timeout (suggested: 5 minutes).

**DN4. M5 activity-line placement under D73 status view.** Confirm activity lines live in the thread (Tab 1) and not on the status landing. Pending the D73 diary study this is provisional, but a builder needs a default to start.

---

## What this stress test deliberately does NOT cover

- Timeline implications, headcount, or resource cost of anything. Per CEO instruction.
- Re-opening any settled decision. All 86 remain frozen.
- Tone-guide British-spelling cleanup (separate CLAUDE.md §8 tracked item).
- Data-governance file content (placeholder, separate workstream).
- Competitive positioning against Keeper / FlyFin / QBSE / Wave (Research Pre-Commit #5).

---

*Penny · v2.2 Tech Stress Test · 21 April 2026 · 4 Critical · 6 High · 10 Medium · 5 Low · 4 Decisions Needed*
*Findings feed directly into `engineering/implementation-strategy.md` v1.*
