# Penny — Data Input & Categorization: Product Decisions
**v2.2 · 21 April 2026**
*Amended from v2.1 after CEO walk-through of remaining non-IRS open questions.*
*Source of truth for the spec rewrite.*

---

## Status of this document

This is a hypothesis document codifying product decisions. Decisions fall into two categories:

- **Settled** — evidence-based or brand-defining positions that will not be re-opened.
- **Hypothesis** (🧪) — behavioural claims about Alex that are our current working direction but should be validated through research before locking.

Hypothesis decisions are marked 🧪 throughout. They are the product's current stance, not observed facts.

### What changed in v2.2

- Added **D74 — Email receipt ingestion** via connected inbox (OAuth), forwarding as fallback
- Added **D75 — Unreadable receipts** never create a passive graveyard; active follow-up loop
- Added **D76 — Variable recurring expenses** — learn once, anomaly-flag, always visible on screen
- Added **D77 — Peer-payment integration strategy** (integration-first, supplements D69)
- Added **D78 — Recurring invoices** — capability-level decision, model-flexible
- Added **D79 — Payment plans on invoices** — proactive at invoice creation, industry-standard
- Added **D80 — Invoice customization** — full brand control, Stripe-Invoicing-quality
- Added **D81 — Offline capture** for receipts, voice, manual
- Added **D82 — Device security** — enterprise-grade from day one
- Added **D83 — Entity-type onboarding framing** — upfront, with diagnostic for "not sure"
- Added **D84 — Historical data import** — integration-first, CSV schema-inference fallback; supersedes D70
- Extended **D72** with mid-year S-Corp election narration (D85 folded into D72)
- Added **D86 — Adaptation-floor personalization** — Alex configures delivery, not existence
- Closed 13 open questions (Q-I1, Q-I2, Q-I3, Q-V4, Q-V1, Q-V2, Q-V3, Q-P1, Q-P2, Q-E1, Q-I4, Q-S1, Q-S2)
- Moved **Q-R1** (shame-layer language bank) and **Q-N1** (landing-surface diary study) to new **Deliverables & Commissioned Research** section
- **Q-A1** remains open — list may grow; D86 locks the personalization stance

### What changed in v2.1

- Revised **North Star (D60)** with 4 behavioural signals including "returns after a gap without shame"
- **Reversed D25**: Penny never guesses when she has no signal ("I don't know — can you help?" is acceptable)
- Added **shame-layer principles (D61–D63)**: no guilt math, no streaks, Penny owns the backlog
- Added **income volatility handling (D64–D65)**: trailing averages default, cash runway, lumpy-is-normal framing
- Added **audit-readiness indicator (D66)**
- Replaced per-transaction compliance nag with **batched weekly review + visible audit-readiness score (D67–D68)**
- Added **Venmo/Zelle/CashApp as first-class input (D69)**
- Added **historical data import (D70)** *(now superseded by D84)*
- Added **data portability & cancellation (D71)** as a new hard rule
- Added **full S-Corp support at MVP (D72)** — entity type as architectural primitive plus first-class payroll, owner's-draw, 1120-S export
- Added **mobile landing surface hypothesis (D73)** — status view primary, conversation thread peer
- Clarified **income/expense asymmetry** as brand signature (updated D13, D32; added Principle 8)
- Removed 80% compliance completeness KPI from D59 (moved to Alex's audit-readiness score)
- Marked behavioural hypothesis decisions with 🧪
- Added **Research Pre-Commits** — research required before locking hypothesis decisions

---

## The Governing Philosophy

> **Penny and Alex work together, continuously.**
> Penny suggests and explains. Alex inputs and corrects. Penny learns and improves.
> Not a rule engine. Not an autonomous agent. A calm, knowledgeable friend who happens to be a brilliant bookkeeper.

Every decision below flows from this principle.

---

## The 12 Core Principles

1. **Penny and Alex work together.** Penny suggests. Alex decides. Always.
2. **Never delete anything.** Corrections are additions. The system of record is immutable.
3. **Show the thinking.** Penny always explains why, not just what — visual + language + reasoning.
4. **Earn trust before asking for more.** Book with 4 fields first. Ask for IRS compliance detail over time.
5. **Personalize to Alex's pattern — with a floor.** Every interaction teaches Penny. Penny adapts. But adaptation has a floor: Penny can dial down but never goes silent on critical signals (unusual income, overdue invoices, tax deadlines). Alex can configure *delivery* of floor signals, but cannot disable the signal itself (see D86).
6. **Act like a calm, knowledgeable friend.** Never panic. Never nag. Never withhold. Never confuse.
7. **Learn once, stop asking.** Repetition is the enemy of the calm friend. Once Penny has learned a pattern, she stops asking. Alex can always see and edit.
8. **Getting paid is a celebration.** Income always gets a one-tap confirmation — not because it's risky, because it's the most important moment in Alex's business.
9. **CPA and DIY are equal.** Penny's export is first-class for CPAs, TurboTax, and H&R Block. Alex picks her filing path.
10. **Never guess with no signal.** Penny never hallucinates to fill a blank. "I don't know — can you help?" is an acceptable state. A blank card with an honest question is better than a confident wrong answer.
11. **Shame is the enemy.** Penny is built so Alex returns after a gap without guilt. Penny owns the backlog, not Alex.
12. **Alex owns her ledger.** On cancel, Alex takes her full ledger with her. Penny never holds data hostage.

**Ethical-learning reference set:** Apple (opt-in, on-device where possible), Monzo (plain-English data-use audit), Notion AI (show the user what's being used). Not Meta, not Google ads.

---

## Section 1 — Onboarding & Cold Start

### D1: First message to Alex
After onboarding and bank connection, Penny's first interaction is: a warm, brief introduction → a quick summary of what she found ("I've pulled in your last 30 days — here's what I'm seeing") → then the first approval card. Sets the tone for the relationship before asking Alex to do anything.

### D2: Onboarding questions 🧪
Penny asks a focused set of essential questions at setup — not a form, a conversation. Covers: business type, primary income sources, which connected accounts are business vs. personal vs. mixed, whether Alex works from home (home office deduction signal), and **entity type** (sole prop / single-member LLC / multi-member LLC / S-Corp / C-Corp — see D72, D83). Enough to dramatically improve cold-start accuracy without overwhelming Alex.

### D3: Cold start behavior (first 30 days) 🧪
Penny has zero history and zero patterns. She leads with her best guess on every transaction where she has at least one signal (see D25) — but is transparent about learning: "I'm still getting to know your business — here's what I think, tell me if I'm off." Every correction in the first 30 days is a high-value learning signal. Trust is built through transparency and visible improvement, not perfection from day one.

### D4: Account designation 🧪
Each connected account can be designated (business / personal / mixed) at onboarding, but designation is one signal among many — not a rule. Many solo freelancers do not mentally segment accounts this way; for them, the designation step is skippable and Penny learns the boundary from behaviour over time (see D22). Penny's learned model always takes precedence over a static designation.

### D83: Entity-type onboarding framing *(new in v2.2)*
Entity type is asked at first onboarding, before bank connection, because it is an architectural primitive (D72), not a settings field. Framing:

> "Quick one — how's your business set up for taxes? I'll ask so I get things right from day one."
> *[Sole proprietor / LLC / S-Corp / C-Corp / Not sure — help me figure it out]*

**"Not sure" diagnostic** — a 3-question conversational branch:
1. Do you file a Schedule C, or a separate business return?
2. Do you pay yourself a salary through payroll?
3. Are you the only owner?

Penny arrives at the likely entity type, shows her reasoning, asks Alex to confirm. Alex can change entity type anytime from Connect → Business Profile; mid-year changes follow D72's election-transition flow.

### D84: Historical data import — integration-first *(new in v2.2, supersedes D70)*
Alex can bring her old books into Penny on day one. Two paths, **integration preferred**:

1. **Direct API connection** to her prior tool where available — QuickBooks Online, Wave, FreshBooks, Xero, QuickBooks Self-Employed (read-only historical pull). Penny authenticates, pulls history, normalises to Penny's ledger model, presents bulk review. Minimises CSV upload friction.
2. **CSV import with schema inference.** Alex uploads any CSV from any source. Penny's import engine inspects columns and infers the schema automatically — "column A is a date, column B is a vendor, column C is an amount." No guided column-mapping UI required. When Penny is uncertain about a column's meaning, she asks — never silently guesses (D25). Common shapes (QBSE, Wave, FreshBooks, generic) are recognised and handled without interruption.

**Conflict resolution with the learned model:** when imported historical data contradicts Penny's live-learned model (e.g. 2024 books show Starbucks as "Personal"; current model learned "Business Meal"), the conflict is flagged to Alex with both views. Silent overwriting in either direction is not allowed.

**Bulk-confirm mode** on import day respects Alex's time — review in batches, not per-card. Historical transactions become system-of-record only on Alex's explicit confirmation.

*Supersedes D70. Partnership scope for additional API integrations is a BD / engineering sequencing question — not a product scope limit.*

---

## Section 2 — Data Input

### D5: When Penny first shows a transaction
Penny shows a transaction as soon as it appears, even as pending. When it settles, she silently updates the record if the settled amount matches the pending amount within threshold (see D6). If the amount changed materially on settlement, she resurfaces it. Never hide information from Alex — transparency always.

### D6: Bank feed — pending amount changes on settlement
Material change threshold: $1 or 5% of the transaction amount, whichever is greater. Below threshold, silent update. Above threshold, Penny re-surfaces, explains what changed, and asks Alex to confirm the final amount. The settled amount is what gets confirmed and booked.

### D7: Pre-authorizations
Penny waits for settlement (no pending-hold noise). When the settled charge arrives, she surfaces the full context: "Your hotel charge came in at $178 — the original hold was $200. I've categorized this as Travel." Alex sees the full picture without having to track it herself.

### D8: Minimum input — voice, manual, and chat bar
When Alex enters incomplete information ("spent $40 today" — no vendor, no category), Penny never stops and demands missing fields. She takes what she has, adds a best-effort guess if she has signal ("I'll book this as a Business Meal — does that sound right?"), and asks one follow-up question at most. If she has no signal, she asks directly rather than guessing (see D25). Incomplete entries are flagged for follow-up. Applies across all input types.

### D9: Cash and informal payments
Penny prompts cash capture proactively — learns when Alex tends to have cash expenses (e.g. after client meetings) and may prompt at those times. "Any cash expenses today?" Alex can capture in seconds. Cash entries are manual and get `SOURCE = MANUAL`.

### D10: Receipt + bank feed overlap
Penny flags the potential match ("I have a $45 Starbucks from Tuesday on your bank feed — did you also upload a receipt for this?") and waits for Alex's confirmation. Until confirmed, both entries exist separately in the system of record. On confirmation, Penny links them into a single entry with both sources attached. Nothing is ever silently merged or deleted.

### D11: Stripe + bank feed overlap 🧪
Penny treats payment-processor income (Stripe / Square / PayPal) and bank deposits as two events that need reconciliation. When a bank deposit matches a recent processor payout, Penny proposes the link: "Is this Chase deposit the Studio Nine Stripe payout?" Alex confirms once. Penny learns the settlement timing for each processor and handles future reconciliation automatically, always notifying Alex when a payment has hit both systems.
*Architectural requirement: direct Stripe / Square / PayPal API integration beyond Plaid.*

### D12: Duplicates
Penny flags potential duplicates immediately but never auto-rejects. She surfaces the second entry with context ("This looks like the same Studio Nine payment I already recorded — is this a new payment or a duplicate?") and waits for Alex's decision. The original is never deleted; the duplicate is either confirmed or voided by Alex.

### D13: Invoice payment matching — income is a celebration
Income is never silently auto-confirmed — this is a deliberate brand signature, not a risk-management stance. Penny surfaces income with warmth ("🎉 A $3,500 transfer just landed — is this Studio Nine paying Invoice #1042?") and Alex confirms with one tap. The tap is the celebration, not the friction. Over time Penny learns which clients pay predictably, but the one-tap confirmation on income remains — always.

### D14: Partial invoice payments
Penny proposes the partial payment match, Alex confirms, Penny books the received amount as income, marks the invoice as partially paid, and sets a reminder for the outstanding balance based on original payment terms. Penny proactively follows up if the second payment is late. *For explicitly scheduled payment plans, see D79.*

### D15: Recurring income
Recurring income (e.g. a monthly retainer) always gets Alex's one-tap confirmation — see Principle 8 and D13. Penny's real value here: if the expected payment doesn't arrive by its usual date, Penny proactively alerts Alex. Missing income is flagged as urgently as unusual expenses.

### D16: Refunds and reversals
Penny explains the refund event in plain English ("Adobe refunded $54.99 — the expense you booked in March is now reversed"), explains the tax treatment, presents Alex's options, and follows Alex's decision. The original booking is never deleted — the refund is an addition to the ledger.

### D17: Foreign currency
Penny always shows the USD amount prominently (IRS reporting currency) and includes the original currency and conversion rate as supporting context. Format: `+$3,680 USD · 5,000 CAD @ 0.736`. The original contract currency is preserved in the record.

### D18: Bank disconnection
Penny notifies Alex immediately on bank disconnection — proactively, not just on next app open. No data is estimated during the gap. When Alex reconnects, Penny backfills the missing period and flags it for review. Penny learns how often Alex's token tends to expire and may prompt a refresh proactively before it lapses.

### D69: Venmo, Zelle, CashApp, and peer payments *(new in v2.1)*
Peer-payment deposits are a first-class input class, distinct from cash. They appear in bank feeds as transfers with weak vendor strings ("ZELLE PAYMENT FROM J SMITH"). Penny:

- Flags peer-payment inbounds for Alex to identify: "Is this client income, a refund, or a personal transfer?"
- Learns per-sender over time — after 2 confirmations, "J Smith" = Studio Nine client, auto-learned.
- For outbound peer-payments to contractors or services, the same flow applies — vendor identification first, then category.

Income from peer-payments always follows D13 (one-tap celebration).

### D77: Peer-payment integration strategy *(new in v2.2, supplements D69)*
Direct API integration is pursued wherever the platform supports it:

- **CashApp** — direct API integration via Square Business.
- **Venmo** — partner-gated API via PayPal; partnership application required.
- **Zelle** — no public API exists; data flows through the bank feed only. Penny treats Zelle as structured bank-feed input and relies on D69's per-sender learning.

Integration sequencing and partnership timelines are engineering / BD decisions, not product scope. The product stance: wherever a direct API exists or can be established, Penny pursues it. Bank-feed parsing is the fallback, not the default. Accuracy gap between "direct API" and "bank-feed parsed" on peer payments is reported in AI eval 01 (Transaction Intelligence).

### D74: Email receipt ingestion via connected inbox *(new in v2.2)*
Alex connects Gmail or Outlook at onboarding via OAuth with read-only scope limited to receipt-signal messages. Penny's inbox scanner reads **only** messages matching receipt signals — known vendor domains, receipt-like subject lines, structured HTML receipt markup. Extracted receipts surface as approval cards identical to photographed receipts (D8, D10, D25 apply).

**Privacy and scope guardrails:**
- Penny never reads personal email.
- Alex sees the exact scope she granted in Connect → Preferences, and can revoke anytime.
- OAuth token lifecycle matches D18 (proactive refresh prompts).
- Scope is audited in General Counsel review before ship.

**Forwarding-address fallback** (`<alex-id>@receipts.penny.app`) exists for Alex who prefers not to connect her inbox. Connected inbox is the default, wow path.

### D75: Unreadable receipts — active follow-up, never a passive graveyard *(new in v2.2)*
When Penny cannot fully parse a captured receipt (OCR failed on a blurry photo; parser missed a field on an HTML email receipt), the partial entry enters an **active follow-up loop**, not a silent "needs review" bucket:

1. Penny shows what she got and what she's missing: "I caught the $45 amount and the date, but I can't read the vendor name."
2. One-tap options: retake photo, type the missing field, or skip for now.
3. If Alex skips, the item goes to the next session with Alex — Penny asks about it, one at a time, until resolved.
4. The weekly batch (D67) surfaces stragglers explicitly.
5. If Alex repeatedly skips, Penny names it conversationally: "I've got 3 receipts I still can't read — want to walk through them together?"

**Principle:** Penny owns the backlog (D61). Penny never hides the backlog. Penny never lets it silently rot. Solving the backlog through active conversation is Penny's job.

---

## Section 3 — Categorization & The Approval Card

### D19: Minimum fields to confirm a transaction
A transaction is **minimum bookable** with: Amount + Direction + Category + Date. All four must be present before Penny confirms. IRS compliance fields (business purpose, attendees, etc.) are tracked separately as a compliance completeness score (see D68). When Penny genuinely has no signal for Category, she asks rather than guesses (see D25).

### D20: Category taxonomy
Two-layer taxonomy. Alex sees plain English ("Meals — Business", "Software & Tools", "Travel"). Penny knows the full IRS Schedule C / 1120-S line mapping, deductibility percentage, and supporting-info requirements. Alex never sees "Schedule C Line 24b" — she sees "Business Meal." The IRS taxonomy lives inside Penny and maps automatically at export. *Full taxonomy research: see `../research/solo-freelancer/irs-tax-research.md` (Q-C1).*

### D21: Communicating uncertainty
Penny communicates confidence through three simultaneous layers:
1. **Visual:** ✓ indicator (high), softer styling (medium), empty field (low / no signal)
2. **Language:** "Categorized as:" (high), "Looks like:" (medium), "I don't recognize this — can you help?" (low / no signal)
3. **Reasoning:** One plain-English line explaining *why* Penny thinks what she thinks

The raw confidence score is never shown to Alex. Uncertainty is expressed through design and language, not math. Specific confidence thresholds (what triggers each tier) to be defined in engineering.

### D22: Personal vs. business — learning the line
Penny learns the personal/business line from Alex's behavior over time. She shows her suggestion and reasoning, gets Alex's confirmation, and improves. No hard account separation required at onboarding — the model builds from interaction.

### D23: Personal transactions in the feed
All transactions are visible. Penny shows personal-looking transactions as quiet activity lines marked "Personal — not in books" with a brief reason. Alex can tap and correct. If corrected, Penny learns. Nothing is ever hidden or silently dropped.

### D24: Inconsistency — same vendor, different categories
Penny doesn't pick a side when signals conflict. She asks Alex gently, shows the conflict ("Last time you marked this as a Business Meal, this time it's looking more like Personal — what should I use?"), and lets Alex decide. The decision is logged, and Penny watches the pattern over the next few transactions before locking in a new rule.

### D25: New vendor with no context *(REVERSED in v2.1)*
**Settled:** Penny makes a best-effort suggestion when she has at least one signal (amount pattern, time-of-day, similar vendors, keyword match). When she has *genuinely no signal*, she does not guess. She says: "I don't recognize this vendor — can you help me categorize it?" Hallucination-zero is a hard rule. A blank card with an honest question is better than a confident wrong answer. Applies to vendor identification and category inference alike.

### D26: The Amazon problem — mixed vendor
Penny flags Amazon and other known mixed vendors proactively. She asks Alex one question about the purchase and suggests what she thinks it is based on patterns. Over time, if Alex consistently buys the same thing on Amazon, Penny builds that pattern. Acts like a human bookkeeper who knows her client's habits.

### D27: Split transactions — personal + business in one charge
Penny learns the split format Alex prefers (% or dollar amount). First time: Penny asks which format feels more natural. After that: presents splits in Alex's preferred format automatically. UX adapts to Alex, not the other way.

### D28: IRS compliance follow-up *(superseded by D67 in v2.1)*
*See D67 — per-transaction compliance asks replaced with batched weekly review.*

### D29: The edit flow — Alex changes a category
When Alex changes a category, Penny gives a recommendation relevant to the new category (e.g. "Travel usually needs a business purpose note — want to add one?"), explains why it matters, asks for Alex's input, and learns from whether Alex engages or skips. Over time Penny learns which follow-ups Alex responds to and adjusts — subject to the adaptation floor in Principle 5.

### D30: The "Add a note" prompt
Penny prompts for a note only when it adds material value: IRS compliance for that category requires it, or she has low confidence and needs context. She learns from Alex's response rate and adjusts timing. Always collaborative, never a form field demand.

### D31: The "ignore this vendor" option
Soft ignore first — vendor transactions collapse to quiet lines, no longer surfacing as full cards. If Alex explicitly says "don't show me this," Penny saves that instruction with a tag (`user_suppressed = true`). The transactions are never deleted. If Alex later changes her mind, the full history is there.

### D32: Auto-confirm threshold — the asymmetry *(clarified in v2.1)*
**Expenses:** Penny auto-confirms known expense vendors after 1 confirmation, with quiet activity-line visibility. Alex can tap to see, edit, or un-learn.
**Income:** Income is never auto-confirmed regardless of how predictable it becomes. Every income event gets a one-tap confirmation, framed as a moment (see D13, Principle 8).

The asymmetry is deliberate and Penny states it to Alex when asked: "I quietly categorize your regular expenses once I've learned them. Income — I always surface, because getting paid is the most important moment in your business."

### D76: Variable recurring expenses *(new in v2.2)*
For vendors with a stable category but variable amount (utility bills, usage-based SaaS, rideshare), Penny learns vendor + category after 1 confirmation per D32. Subsequent charges book silently at whatever amount settles.

**Transparency guardrail — visible activity line:** Penny's silent booking is **always visible on screen** as an activity line with vendor, amount, category, and source. Alex can tap at any time to see, edit the category, change the amount, or un-learn the pattern. Silent never means hidden.

**Anomaly guardrail:** when an amount exceeds 2× the vendor's rolling median, Penny resurfaces it with reasoning:
> "This Con Ed bill is $820 — noticeably higher than your usual $180–$240. Still Utilities, or something different this month?"

The 2× threshold is a starting heuristic; tuning lives in AI eval 05 (Anomaly Detection).

### D33: Retroactive corrections
When Alex changes a vendor's category, Penny surfaces the retroactive correction option transparently: shows what past transactions would be affected, explains the compliance impact, gives her recommendation, and Alex decides (update all / future only / leave it). Whatever Alex decides, the audit trail records the change.

### D34: OCR and voice errors — wrong amount booked
Defense in depth:
1. **Prevention:** When Penny has both a receipt and a bank transaction, she compares amounts before booking. Mismatch > $0.50 triggers a flag before confirmation.
2. **Correction:** Any confirmed transaction can be edited at any time. The correction creates an audit log entry. The original record is never deleted.

---

## Section 4 — Learning & Memory

### D35: How Penny learns
Every user action on an approval card — confirm, edit, undo, ignore — is stored and used to improve Penny's model. The model is per-user, private, and continuously improving. Penny's intelligence, not Alex's configuration file.

### D36: Penny's memory — visible to Alex?
Penny's learning model is internal and not surfaced in the UI by default. Alex does not see a "rules list." If Alex asks why Penny categorized something a certain way, Penny explains her reasoning (Principle 3). If Alex wants to see or edit her learned rules, there is a clear path under Connect settings. The model stays private by default and improves without Alex's direct management — but transparency is one tap away.

### D37: Personalization — communication style 🧪
Penny learns how Alex prefers to communicate: split format (% vs. dollar), note-adding habits, how quickly she processes her backlog, what notifications she responds to. Every preference is learned from behavior, not set upfront. Adaptation subject to the floor in Principle 5.

### D38: Shared intelligence — private vs. global model
By default, all learning is private to Alex. A future opt-in layer allows Alex to contribute anonymized patterns to a shared model that helps all users. Explicit opt-in, default off, never assumed. The product earns data sharing through trust.

### D39: Business evolution over time
Penny handles business changes through three layers: (1) the model naturally weights recent behavior more heavily — old patterns fade as new ones emerge, (2) when Penny detects a significant shift, she proactively checks in ("Your business looks quite different from a year ago — has something changed?"), and (3) Alex can manually trigger a profile refresh from Connect settings. Entity-type changes (e.g. sole prop → S-Corp election) are a special case — see D72.

### D40: CPA corrections as ground truth
When a CPA (or any tax-prep expert Alex designates) corrects a transaction category, that correction is fed back into Penny's model as a high-confidence learning signal. For DIY-filing users who don't have a CPA, Alex's own tax-time corrections serve the same role.

### D41: Unresolvable transactions
For genuinely unknown transactions that even Alex can't explain: flagged as "Review later" and booked as "Uncategorized — flagged for review" (or "CPA review needed" if Alex has a CPA). Never ignored, never dropped.

---

## Section 5 — Notifications, Backlog & Proactive Behavior

### D42: Proactive outreach 🧪
Penny's proactive triggers:
1. Large or unusual transaction (above Alex's normal range)
2. Quarterly estimated tax deadline approaching (30-day, 7-day, 1-day)
3. Invoice overdue past payment terms
4. Uncategorized transaction backlog building up
5. Missing compliance fields for time-sensitive categories (via D67 weekly batch)

All triggers are configurable per D86. Penny learns which notifications Alex responds to and adjusts frequency — subject to the adaptation floor: Penny never goes silent on tax deadlines, unusual income events, or overdue invoices no matter how Alex has historically responded.

### D43: Notification override
Penny respects Alex's notification preference as the baseline but has a configurable anomaly threshold that can override. After an override, Penny asks: "I sent an extra notification — was that helpful?" Alex's answer trains the threshold. Adaptation floor still applies.

### D44: Backlog priority (after silent period) *(shame-layer updated — see D61)*
Penny leads with a summary first, framed for re-entry (see D61). Priority order: unusual/large > unknown vendors > time-sensitive > income events > known recurring. Penny never dumps the full backlog on Alex at once. Critically, Penny never leads with an item count.

### D45: Compliance follow-up frequency *(superseded by D67 in v2.1)*
*See D67 — batched weekly compliance review replaces per-transaction nag.*

### D46: Penny's tone under stress
Under stress conditions (overdue invoice + quarterly deadline + unknown charges all at once), Penny gives a calm summary first, prioritizes by impact, and works through items one at a time with Alex. The tone stays warm and steady — the same Penny regardless of what's happening.

### D61: Shame-free re-entry *(new in v2.1)*
After a gap (Alex has not opened the app for 5+ days), Penny's first message never leads with item counts or backlog size.

- **Language:** "Welcome back. I've kept things tidy while you were away. Want to start with the important ones?"
- **Stance:** Penny owns the backlog. Alex does not.
- **Banned language:** "You have 34 items to review" — regardless of tone or framing.

### D62: No streak mechanics *(new in v2.1)*
Penny does not display streaks, daily-usage targets, or loss-aversion gamification. Streaks work for language learning — the downside is "my Spanish didn't improve." In money, loaded with anxiety, streaks accelerate avoidance. **Hard rule: never ship them.**

### D63: Language of re-engagement *(new in v2.1)*
Penny's first response to a returning user after a gap receives explicit warmth — never an item count. This is a writing-craft requirement across all re-entry states: first tap of the day, first tap of the week, first tap after a long absence. Tone-guide entries for 5-day, 14-day, and 30-day gaps to be written (Deliverable Q-R1).

### D67: Compliance asks — batched weekly, not per-transaction *(replaces D28, D45 in v2.1)*
Instead of surfacing IRS compliance fields on every approval card, Penny batches them into a single weekly review:

> "Here are 8 meals from last week without a business purpose — want to add them in one go?"

One pass per week, not per transaction. Penny never blocks a booking. Penny never blocks an export. If Alex skips the weekly review, the gaps remain visible in the Audit-Readiness Score (D68) — never as a nag.

### D68: Audit-Readiness Score — compliance as Alex's metric, not Penny's target *(new in v2.1)*
My Books displays Alex's audit-readiness as a percentage: "You're 73% audit-ready this quarter." Penny does not target any internal compliance-completeness KPI. Alex targets what she chooses. Penny surfaces gaps honestly, offers the weekly batch (D67), but never nags. The score is visible, honest, and non-blocking. It is the primary mechanism for managing latent audit anxiety (see D66).

---

## Section 6 — Review & Reporting

### D47: My Books — what Alex sees first *(updated in v2.1)*
My Books leads with financial health at a glance. **Lead number: 90-day trailing net income** (not this-month alone, which is volatile for freelancers). Below: this month vs. 90-day trend (up / flat / down). Below that: anything that needs her attention (pending approvals, compliance gaps, overdue invoices). Month-over-month is a secondary view, not the default.

### D48: P&L time periods *(updated in v2.1)*
**Default view:** 90-day trailing and 6-month trailing side by side. This-month and last-month are available as secondary tabs. Alex can pick any custom date range. The trailing default de-catastrophises lumpy freelancer income; the custom range gives her control.

### D49: Conversation thread management
Default: 30 days visible in the conversation thread. Older confirmed transactions move automatically to My Books. Alex can adjust the window from Connect settings. Full history is always preserved and searchable in My Books.

### D50: Search
In My Books: a dedicated search bar — keyword, vendor, amount, or date range. In the Penny thread: natural language ("find that Austin trip from February") — Penny surfaces the result in conversation. Both paths lead to the same data.

### D51: Financial Q&A
Penny answers financial questions anywhere Alex asks them. In the conversation thread, Alex asks naturally ("am I spending more on software this year?") and Penny responds with a direct, plain-English answer with numbers. The same answer is available as a view in My Books for deeper exploration.

### D64: Lumpy is normal *(new in v2.1)*
When income drops sharply month-over-month, Penny's default language normalises it:

> "Income dipped vs. last month — that's normal for freelancers. Your 90-day trend is healthy."

Penny never panics over a slow month. Tone under income volatility matches her tone under any other stress: calm, contextual, honest.

### D65: Cash runway as a first-class number *(new in v2.1)*
My Books displays Alex's runway prominently, in plain English:

> "You have 4.2 months of runway at your average expense rate."

Calculated as current cash balance ÷ trailing 90-day average expenses. Appears on the main My Books view. For a solo business owner this number is more emotionally relevant than the P&L — it answers "am I okay?" in a single glance.

### D66: Audit-readiness indicator *(new in v2.1)*
Alex can see at any time: "If the IRS wrote you a letter tomorrow, how prepared would you be?" One-tap view of compliance completeness by quarter, receipts attached, categorization confidence, and outstanding gaps. Proactively reduces latent audit anxiety — the real reason most solo freelancers do bookkeeping at all. Feeds directly from the Audit-Readiness Score (D68).

---

## Section 7 — Invoicing

### D52: Invoice reminders — overdue invoices
When an invoice goes past due, Penny notifies Alex and drafts a polite, professional reminder email to the client — ready to send in one tap. If Alex approves, Penny sends it. Over time Penny learns Alex's follow-up style, timing, and preferred tone. The goal: Alex eventually just taps send without reading the draft because Penny has learned exactly how she communicates.

### D78: Recurring invoices *(new in v2.2)*
Alex can designate any invoice as recurring on a cadence (monthly, quarterly, custom). Penny drafts the next invoice on the due date and surfaces it for Alex's one-tap send. Penny **never auto-sends** without Alex's explicit confirmation — retainer relationships are too sensitive for silent sending.

Decision is defined at the capability level (not specific UI), so the underlying model can evolve — auto-send-with-preview, per-client auto-send rules, pause-this-month — without re-spec.

### D79: Payment plans on invoices *(new in v2.2)*
**Proactive payment plans at invoice creation.** Alex can structure an invoice as installments at the time of creation: "This $3,000 invoice, payable in 3 monthly installments of $1,000 starting Nov 1." Penny generates scheduled sub-invoices, sends each on schedule (per Alex's preferences — see D78), reminds on late installments, and tracks overall invoice completion against the full total.

**Industry-standard validation (April 2026):**
- FreshBooks — Payment Schedules + Affirm BNPL partnership
- QuickBooks — Progress Invoicing
- Stripe — Afterpay / Klarna / Affirm integrations

Reactive partial-payment matching from D14 continues to handle ad-hoc partial payments on non-plan invoices.

### D80: Invoice customization — pixel-perfect *(new in v2.2)*
Full brand control at launch, designed to Stripe-Invoicing quality. No shortcuts during the product-building phase.

- Custom logo upload (PNG / SVG)
- Custom accent color — full picker, not presets
- Font selection from a curated web-font library
- Per-client default settings — terms, currency, reminder cadence
- PDF layout templates — 3–5 professional options
- Custom terms, footer, payment instructions
- Custom invoice numbering schemes

Rationale: invoicing is Alex's public face to her clients. The product either looks professional or it doesn't — there is no middle ground that earns trust from the client side. Matches the "never compromise on product building phase" stance.

---

## Section 8 — Tax & CPA

### D53: Tax guidance — CPA and DIY equally supported *(updated framing in v2.1)*
Penny answers tax *rule* questions directly and helpfully ("Yes — software used for your work is deductible"). She always notes she is not a CPA and that Alex's specific situation should be confirmed by a CPA *or* handled through her DIY filing tool (TurboTax, H&R Block Self-Employed). She never answers questions requiring judgment about Alex's specific situation without that caveat. Clear line: Penny explains rules, she doesn't give personalized tax advice. Works equally for CPA-users and DIY-filers.

### D54: Year-end behavior
Penny's year-end proactive behavior is learnable and personalized. Default actions: surface a year-end compliance summary, flag largest deduction categories for review, offer to generate an export, ask whether Alex wants a Q4 estimated tax calculation, remind Alex of any recurring vendors that changed category during the year.

### D55: Export package *(updated in v2.1)*
Penny produces a complete export package:

- Human-readable summary PDF (income, expenses by category, net profit, Schedule C mapping for sole prop / LLC, 1120-S mapping for S-Corp per D72)
- Full transaction CSV (every transaction, categorized, dated, with source and compliance notes)
- Direct export files compatible with **QuickBooks, Xero, TurboTax Self-Employed, and H&R Block Self-Employed**

The CPA or filing tool receives clean, complete data with zero cleanup required.

### D56: CPA relationship 🧪
Penny supports direct CPA access at two levels:
1. Alex generates a secure, read-only share link in one tap — the CPA opens it in a browser, sees the full books, no file download required.
2. CPAs get their own Penny view — read-only with the ability to leave notes and make corrections that feed back into Penny's model as ground truth (D40). Alex controls what the CPA can see and when.

*Hypothesis: many Alex-personas do not have an active CPA. Feature exists for those who do; DIY export paths (D55) serve those who don't.*

---

## Section 9 — Platform

### D57: Web vs. mobile
**Mobile:** daily capture, approvals, and conversation with Penny. **Web:** sitting-down review — trends across multiple periods, bulk editing, detailed reports, exports, advanced filters. Mobile handles the moment-to-moment. Web handles the deep dive. See also D73 on mobile landing surface.

### D81: Offline capture *(new in v2.2)*
Receipt photos, voice notes, and manual entries capture offline and queue locally, syncing on reconnect. Penny's UI shows a quiet "offline — will sync" banner, not an alarm. Offline categorisation and offline P&L are **not** supported — those require server-side data — but the capture moment is never blocked by connectivity.

Conflict resolution on reconnect follows D10 and D12: flag potential duplicates / matches, never silently merge. Offline-queued entries flow through the same approval-card surface as live entries on sync.

### D82: Device security — enterprise-grade from day one *(new in v2.2)*
Security model designed for future enterprise review, not retrofitted. Rework on security is expensive and trust-damaging; Penny builds for the highest bar from the start.

- **Face ID / passcode required** on every app open — not optional, not a setting
- **Session token expiry** with silent refresh
- **"Sign out all devices"** control in Connect → Preferences
- **Remote wipe** via Connect → Preferences
- **Device trust:** a new device requires email confirmation + Face ID before first use
- **Full audit log** of sensitive actions (export, cancel, share link, CPA access) — visible to Alex, exportable
- **Field-level encryption** on sensitive fields (bank account numbers, SSN if collected)
- **MDM-compatible deployment path** (even if not marketed to enterprise at launch)

Architectural principle: security retrofit costs 5–10× what building it right costs now. Build for the highest bar Alex might one day need.

### D72: Entity type — full S-Corp support at MVP *(new in v2.1, CEO decision 20 Apr 2026; mid-year flow extended 21 Apr 2026)*
Every ledger, export, category, and tax calculation in Penny knows Alex's entity type: **sole prop / single-member LLC / multi-member LLC / S-Corp / C-Corp.**

**Launch scope — FULL S-Corp included at launch (no half-baked phase):**

- **Sole prop and single-member LLC flows** (≈95% overlap with each other).
- **Full S-Corp support**, including:
  - **Payroll ingestion** via Gusto, OnPay, **and** QBO Payroll APIs — all three at launch, not sequenced. Alex connects her payroll provider in Connect; Penny pulls salary, employee tax withholding, employer-side taxes, pay dates.
  - **Owner's draw as a first-class balance-sheet category** — distinct from income and from expenses. Penny reports distributions separately.
  - **Owner's-draw one-tap confirmation flow** — never silently auto-booked, even after pattern is learned. S-Corp categorisation errors (salary vs. draw vs. self-reimbursement) have IRS consequences that expense mis-categorisation does not. Parallel to income confirmation in D13.
  - **W-2 self-payment handling** — Alex pays herself a "reasonable salary"; Penny books salary correctly, treats remaining distributions as owner's draw.
  - **Separate onboarding branch** for S-Corp-elected Alexes, with entity-type-specific questions (framing in D83).
  - **1120-S export mapping** alongside Schedule C, TurboTax Business / H&R Block Business compatibility.
  - **AI evals extended** to S-Corp-specific signals: distinguishing salary from owner draw from expense reimbursement to self.
- **Multi-member LLC and C-Corp** remain feature-flagged for post-launch.

**CEO rationale (20 Apr 2026):** Launching a sole-prop-only MVP would fail Alex exactly at the moment she becomes most valuable (>$80–100k net income, S-Corp elected on CPA advice). A half-solution drives her to QuickBooks Online. Ship when it actually solves the problem. Better to ship slower with the right scope than ship fast and lose the highest-LTV segment.

**Accepted trade-offs:**

- Three payroll integrations, not one — each with its own auth flow, data mapping, and maintenance surface.
- Owner's draw is a ledger-level concept, not a category tweak. Testing surface area grows meaningfully.
- Categorisation mistakes for S-Corp (salary vs. owner draw vs. self-reimbursement) have bigger tax consequences than expense mis-categorisation — higher bar on correctness.
- S-Corp-specific AI evals must exist and pass before any model ships.
- Timeline impact is real but not quantified — engineering sizing needed before any ship-date conversation.

**Architectural principle:** do not retrofit entity type. Retrofitting costs 5–10× what building it right costs now. Entity type is a foundational data-model concept, not a feature flag.

**Mid-year entity-type change — conversational narration (extended 21 Apr 2026):**
When Penny detects (via new payroll connection + Form 2553 effective date) or Alex reports an S-Corp election, Penny narrates each step conversationally — no silent state changes to ledger structure:

> "Got it — starting July 1, I'll track you as an S-Corp. Before that date stays on Schedule C. When tax time comes, you'll get two exports for this year — I'll walk you through both. Sound good?"

The ledger records the effective-date of the change. Pre-change transactions book to Schedule C, post-change to 1120-S. Year-end export produces two documents for the transition year. Every step is visible, explained, and confirmed by Alex before ledger structure changes.

### D73: Mobile landing surface 🧪 *(new in v2.1, hypothesis)*
**Current hypothesis:** Penny's default mobile landing is a quiet status view — "3 things need you. 1 important: $1,800 charge I haven't seen. Everything else is fine." The conversation thread is a peer surface, accessible with one tap, not the landing. Conversational tone remains everywhere in the product.

**Rationale:** users glance at money apps 10–30× per week; they don't want to scroll a conversation to find status. AI makes chat a great *depth* surface; it doesn't make chat the right high-frequency glance surface. Letting the user pick the depth is more AI-native than forcing every interaction through a conversational bottleneck.

**Validation required:** 2-week diary study with 8–10 solo freelancers before locking (see Deliverables Q-N1).

---

## Section 10 — Product Hard Rules

### D58: Penny's hard limits *(amended in v2.1)*

1. **Never move money.** Penny tracks and categorizes. She never initiates a payment, transfer, or transaction on Alex's behalf.
2. **Never file taxes.** Penny prepares, organizes, and exports. She never submits anything to the IRS directly.
3. **Never give personalized tax advice.** She explains IRS rules. She always notes she is not a CPA.
4. **Never share Alex's financial data** without Alex's explicit, informed consent. Default is always private.
5. **Never hold Alex's data hostage** *(new)*. See D71.
6. **Never guess with no signal** *(new)*. See D25, Principle 10.
7. **Never ship streak mechanics** *(new)*. See D62.

### D71: Data portability and cancellation *(new in v2.1)*
Canceling Penny is a one-tap action from Connect settings. On cancel, Alex receives an **immediate full export**:

- CSV of every transaction, categorized, dated, sourced, with compliance notes
- QuickBooks / Xero-compatible file
- PDF summary (Schedule C or 1120-S mapped to her entity type)
- All receipt images and voice notes

Data is retained in read-only mode for 90 days to allow Alex to return. After 90 days, she can request full deletion. No dark patterns. No retention games. Her data is hers.

### D86: Adaptation-floor personalization *(new in v2.2)*
Alex can personalise the **delivery** of adaptation-floor signals in Connect → Notifications — timing, cadence, quiet hours — but **cannot disable** the signal itself. A floor that can be turned off is not a floor (Principle 5).

Concrete examples:
- Alex can move a quarterly-deadline reminder from 30/7/1 day to 7/1 day. She cannot mute quarterly deadlines.
- Alex can set quiet hours so bank-disconnection alerts batch to morning. She cannot silence bank-disconnection entirely.
- Alex can adjust the anomaly threshold on unusual income (e.g. from 2× median to 3× median). She cannot turn unusual-income detection off.

**Open question Q-A1 remains open** on the *list of signals* that constitute the adaptation floor — the starting list below is a proposal, not a final inventory:

1. Unusual income events (>2× rolling median inbound)
2. Overdue invoices past payment terms
3. Quarterly tax deadlines (30 / 7 / 1 day)
4. Bank disconnection
5. W-9 missing for a contractor about to cross the 1099-NEC $600 threshold
6. S-Corp payroll pay-date approaching with insufficient cash

The list may grow as research surfaces additional critical events. Settings UX in Connect → Notifications must be built to accommodate list growth without a redesign.

### D59: Self-evaluation metrics *(updated in v2.1)*
Penny's internal accuracy metrics:
1. **Correction rate** — % of approval cards where Alex edits vs. accepts. Target: <10% edit rate for known vendors.
2. **AI evals** — separate eval suite benchmarking categorization accuracy against a labeled test set. Must include sole prop, LLC, *and* S-Corp specific test cases (per D72).
3. **Return-after-gap rate** *(new)* — % of users who voluntarily open Penny within 7 days of a 14-day absence. Behavioural signal for "calm friend" delivery.

*(Removed: 80% compliance completeness target. Compliance is Alex's Audit-Readiness Score under D68, not Penny's KPI.)*

### D60: North Star *(REVISED in v2.1)*

> **Penny's north star: Alex is never anxious about her books.**

Measured by four behavioural signals:

1. **Time saved** — Alex's bookkeeping time is measurably less than before Penny.
2. **Financial clarity** — Alex can answer "how am I doing?" in under 60 seconds.
3. **Tax readiness** — at any moment, Alex can hand clean books to a CPA, or load them into TurboTax / H&R Block and file confidently without cleanup.
4. **Returns after a gap without shame** — the only metric that tells us we won on the emotional layer. If Alex voluntarily reopens the app after a 2-week absence, we've built the calm friend. If she doesn't, we've built another nagging fintech app.

Signal #4 is the defining one. Everything else is a feature-level metric. #4 is the only one that tells us Penny actually earned the relationship.

---

## Open Questions — What We Still Need to Decide

### All IRS / Tax questions → detailed research required

**Q-C1, Q-C2, Q-C3, Q-C4, Q-T1, Q-T2, Q-T3** — these are **not** product-opinion decisions. They are factual questions grounded in IRS rules. All seven have been moved to a dedicated research doc: [`../research/solo-freelancer/irs-tax-research.md`](../research/solo-freelancer/irs-tax-research.md).

No product decision in the tax cluster is final until the research doc is completed and reviewed. Summary of what's open there:

- **Q-C1** — Full category taxonomy (Schedule C / 1120-S line mapping, deductibility, plain-English labels)
- **Q-C2** — IRS-required supporting fields per category
- **Q-C3** — Vehicle expense method (mileage vs. actual) and Penny's default
- **Q-C4** — Home office deduction method (simplified vs. actual) and Penny's default
- **Q-T1** — Quarterly estimated tax methodology (safe-harbor, projection, S-Corp variant)
- **Q-T2** — Contractor / 1099-NEC tracking rules, thresholds, filing partners, W-9 collection
- **Q-T3** — Year boundary rules, amendment rules, record retention

### Still open (non-IRS)

**Q-A1: Adaptation-floor signal list — completeness.** The starting list in D86 (unusual income, overdue invoices, quarterly deadlines, bank disconnection, W-9 missing, S-Corp pay-date cash shortage) is a proposal, not final. Additional critical-signal candidates to be surfaced through research and added explicitly. Settings UX must accommodate list growth without a redesign.

---

## Deliverables & Commissioned Research

These items are not open product questions — they are deliverables with defined owners.

**Q-R1: Shame-layer language bank** *(writing deliverable)*
Owner: Nik + Head of Design. Add to `tone-guide.md`: re-entry openers for 5-day, 14-day, and 30-day gaps — 3–4 variants per scenario. Feeds D61, D63.

**Q-N1: Mobile landing-surface validation** *(diary study)*
Owner: Head of Research. Design and run the 2-week diary study with 8–10 solo freelancers to validate D73 (status view as primary landing vs. conversation thread). Already listed in Research Pre-Commits #2.

---

## Research Pre-Commits

Before locking any hypothesis decision (marked 🧪), one of these pieces of research should complete. Ranked by derisking value:

1. **Prevalence survey (200 solo freelancers).** CPA vs. DIY, tools tried and abandoned, entity-type distribution, S-Corp penetration by revenue band. *Derisks D53, D55, D56; confirms D72 scope sizing.*

2. **Diary study (8–10 Alexes, 14 days).** Primary landing preference, emotional patterns around bookkeeping, re-entry behaviour after gaps. *Validates or reshapes D2, D3, D4, D37, D42, D61–D63, D73.*

3. **S-Corp freelancer interviews (6–8 users).** Specific to D72: what do S-Corp-elected solo freelancers actually need? What breaks in QBO for them today? *Derisks D72 feature scope.*

4. **Concept test on approval-card fatigue (4-week prototype).** Retention curve weeks 2–4 (week 1 engagement is noise; the signal is whether retention holds at week 3–4). *Validates D7, D13, D15, D32.*

5. **Competitive churn interviews (8–10 users).** Users who left Keeper / FlyFin / QBSE / Wave. Why? *Derisks overall positioning.*

6. **CPA interviews (5 CPAs).** Do they want a Penny CPA view? *Makes D56 real or reveals it as founder fantasy.*

---

*Last updated: 24 April 2026 · v2.3 · 94 decisions · 8 open questions (Q-C3 resolved; Q-L1, Q-OBBBA, Q-QBI, Q-SE, Q-PTET, Q-RetLim added) · 2 active deliverables · 6 research pre-commits*

---

## v2.3 — CPA stress-test decisions (24 April 2026)

An adversarial CPA review (`reviews/irs-taxonomy-cpa-stress-test-apr-2026.md`) caught hard IRS errors in the v1.1 taxonomy and surfaced 15 compliance gaps. The following 8 decisions lock the resolutions.

### D87: Tax-year constants are configurable, never hard-coded *(new in v2.3)*
Every tax-year-dependent value — mileage rate, SS wage base, QBI thresholds, §179 limit, bonus depreciation %, retirement limits, de minimis safe harbor, 1099-K threshold — lives in `BookKeeping/engineering/categories.v1.json` under `taxYearConstants`. Annual update cadence: October–December each year when IRS publishes Notices/Rev. Procs. for the following tax year.

Why: CPA review caught the taxonomy using 67¢/mi (2024) while the demo is for 2025 returns (70¢ per Notice 2025-5).

### D88: De minimis safe harbor is $2,500/item for non-AFS taxpayers *(new in v2.3)*
Treas. Reg. §1.263(a)-1(f)(1)(ii). Purchases under this threshold route to Line 22 (Sch C) / Line 19 (1120-S) / Line 20 (1065) — no Section 179 or depreciation decision required. Penny attaches the annual §1.263(a)-1(f)(5) election statement to every return. The $500 number used in the CPA review prompt was not IRS-authoritative.

### D89: MMLLC dual-path + SE tax distinction *(new in v2.3)*
Penny asks at LLC onboarding: "one owner or multiple?" Single → SMLLC Path A (Schedule C, same as sole prop). Multiple → MMLLC Path B (Form 1065 + K-1).

**Critical addition:** MMLLC active members pay SE tax on K-1 Box 1 via K-1 Box 14 (*Renkemeyer*, 136 T.C. 137 (2011); *Castigliola* T.C. Memo 2017-62). This is NOT the same as S-Corp treatment. Penny must surface the difference when a user evaluates MMLLC vs. S-Corp election — without rendering tax advice.

### D90: S-Corp reasonable compensation defensibility *(new in v2.3)*
No statutory % threshold exists. Penny uses IRS Fact Sheet 2008-25 nine-factor test grounded in *Watson v. U.S.* 668 F.3d 1008 (8th Cir. 2012). For shareholder-employees below industry-comparable wages, Penny flags and recommends a compensation study (RCReports, BLS OES). The "40% minimum" heuristic is retired — it was a CPA rule-of-thumb, not IRS authority.

### D91: S-Corp accountable plan is a required onboarding step *(new in v2.3)*
For S-Corp personas, Penny prompts at onboarding: "Does your corporation have an accountable plan for reimbursing owner business expenses?" If no, Penny flags as material missed deduction — home office, phone, mileage are reimbursable tax-free under Treas. Reg. §1.62-2 and deducted by the S-Corp on Line 19. Without an accountable plan these deductions are often lost (TCJA §11045 suspended personal miscellaneous itemized deductions 2018–2025).

### D92: QBI §199A deduction surfacing per persona *(new in v2.3)*
Every pass-through persona's annual summary and quarterly-estimate compute surfaces the estimated QBI deduction. SSTB classification is a persona attribute set at onboarding (derivable from industry). Thresholds live in `categories.v1.json` taxYearConstants.

SSTB personas (P01, P02, P13, P14, P17, P18, ambiguous P15): approaching the upper phase-in threshold triggers a "your QBI deduction is about to phase out" nudge + CPA referral.

### D93: OBBBA (July 2025) tax-year constants conformance *(new in v2.3)*
The One Big Beautiful Bill Act (P.L. 119-21) changed several constants for 2025+ returns — 100% bonus depreciation permanent post-Jan 19 2025, §179 raised to $2.5M / $4M phase-out, QBI §199A permanent, §174 R&E expensing restored, 1099-K threshold restored to $20K/200, SALT cap raised to $40K through 2029. Values live in `categories.v1.json` with source citations. Verification against final bill text tracked as Q-OBBBA open research item.

### D94: Circular 230 / preparer penalty boundary *(new in v2.3)*
Penny's product surface never crosses into "filing" without explicit GC review. Current stance: Penny generates export-ready data, users or CPAs file returns. Any move toward direct filing (D66 TurboTax integration, direct-to-IRS e-file) triggers GC review on: (1) preparer status under §7701(a)(36), (2) Circular 230 compliance, (3) §6694 preparer penalty surface, (4) required user disclosures, (5) insurance/indemnity. Until GC clears these, Penny stays export-only.
