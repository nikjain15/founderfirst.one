# 05 — Categorisation and the Approval Card
*The core interaction surface of the product.*

Decisions covered: D19–D34, D76.

---

## Minimum bookable fields (D19)

A transaction is **minimum bookable** with:

1. Amount
2. Direction (income / expense)
3. Category
4. Date

All four must be present before Penny confirms.

**IRS compliance fields** (business purpose, attendees, etc.) are tracked separately as the **Audit-Readiness Score** (D68) — see [07-notifications-and-backlog.md](07-notifications-and-backlog.md).

When Penny genuinely has no signal for Category, she asks rather than guesses (D25).

---

## Category taxonomy (D20)

**Two-layer taxonomy:**

- **Alex sees** plain English — "Meals — Business", "Software & Tools", "Travel"
- **Penny knows** the full IRS Schedule C / 1120-S line mapping, deductibility percentage, and supporting-info requirements

Alex never sees "Schedule C Line 24b." She sees "Business Meal." The IRS taxonomy lives inside Penny and maps automatically at export.

**Full taxonomy is blocked on IRS research:** `../../research/solo-freelancer/irs-tax-research.md` (Q-C1). Engineering artefact: `categories.v1.json`, CPA-reviewed.

---

## Communicating uncertainty (D21)

Penny communicates confidence through **three simultaneous layers**:

1. **Visual:**
   - ✓ indicator — high
   - Softer styling — medium
   - Empty field — low / no signal

2. **Language:**
   - "Categorized as:" — high
   - "Looks like:" — medium
   - "I don't recognize this — can you help?" — low / no signal

3. **Reasoning:** one plain-English line explaining *why* Penny thinks what she thinks

The **raw confidence score is never shown to Alex.** Uncertainty is expressed through design and language, not math. Specific confidence thresholds (what triggers each tier) tuned in AI eval 01.

---

## Personal vs. business — learning the line (D22)

Penny learns the personal/business line from Alex's behaviour over time.

- She shows her suggestion and reasoning
- Gets Alex's confirmation
- Improves

**No hard account separation required at onboarding.** The model builds from interaction.

---

## Personal transactions in the feed (D23)

All transactions are visible.

- Penny shows personal-looking transactions as quiet activity lines marked "Personal — not in books" with a brief reason
- Alex can tap and correct
- If corrected, Penny learns
- **Nothing is ever hidden or silently dropped**

---

## Inconsistency — same vendor, different categories (D24)

Penny doesn't pick a side when signals conflict.

> *"Last time you marked this as a Business Meal, this time it's looking more like Personal — what should I use?"*

She asks Alex gently, shows the conflict, lets Alex decide. The decision is logged, and Penny watches the pattern over the next few transactions before locking in a new rule.

---

## New vendor with no context (D25) — REVERSED in v2.1

**Hallucination-zero is a hard rule.**

- Penny makes a best-effort suggestion when she has **at least one signal** (amount pattern, time-of-day, similar vendors, keyword match)
- When she has **genuinely no signal**, she does not guess. She says:

> *"I don't recognize this vendor — can you help me categorize it?"*

A blank card with an honest question is better than a confident wrong answer. Applies to vendor identification and category inference alike.

---

## The Amazon problem — mixed vendor (D26)

Penny flags Amazon and other known mixed vendors proactively.

- She asks Alex one question about the purchase
- Suggests what she thinks it is based on patterns
- Over time, if Alex consistently buys the same thing on Amazon, Penny builds that pattern

Acts like a human bookkeeper who knows her client's habits.

---

## Split transactions — personal + business in one charge (D27)

**UX:** Alex taps "split" on the approval card, adds 2–N splits with amount + category each.

**Format learning:** Penny learns the split format Alex prefers (% or dollar amount).

- First time: Penny asks which format feels more natural
- After that: presents splits in Alex's preferred format automatically

UX adapts to Alex, not the other way.

---

## Edit flow — Alex changes a category (D29)

When Alex changes a category, Penny:

- Gives a recommendation relevant to the new category (e.g., *"Travel usually needs a business purpose note — want to add one?"*)
- Explains why it matters
- Asks for Alex's input
- Learns from whether Alex engages or skips

Over time Penny learns which follow-ups Alex responds to and adjusts — subject to the adaptation floor in Principle 5.

---

## The "Add a note" prompt (D30)

Penny prompts for a note **only when it adds material value**:

- IRS compliance for that category requires it
- She has low confidence and needs context

She learns from Alex's response rate and adjusts timing. Always collaborative, never a form field demand.

---

## The "ignore this vendor" option (D31)

**Soft ignore first** — vendor transactions collapse to quiet lines, no longer surfacing as full cards.

If Alex explicitly says "don't show me this," Penny saves that instruction with a tag (`user_suppressed = true`). The transactions are **never deleted**. If Alex later changes her mind, the full history is there.

---

## Auto-confirm threshold — the asymmetry (D32)

This is a brand-signature decision, not a risk-management one.

**Expenses:** Penny auto-confirms known expense vendors after 1 confirmation, with quiet activity-line visibility. Alex can tap to see, edit, or un-learn.

**Income:** Income is **never auto-confirmed** regardless of how predictable it becomes. Every income event gets a one-tap confirmation, framed as a moment (D13, Principle 8).

**Penny can state the asymmetry when asked:**

> *"I quietly categorize your regular expenses once I've learned them. Income — I always surface, because getting paid is the most important moment in your business."*

---

## Variable recurring expenses (D76)

For vendors with a **stable category but variable amount** (utility bills, usage-based SaaS, rideshare):

- Penny learns vendor + category after 1 confirmation per D32
- Subsequent charges book silently at whatever amount settles

### Transparency guardrail — visible activity line

Penny's silent booking is **always visible on screen** as an activity line with vendor, amount, category, and source. Alex can tap at any time to see, edit the category, change the amount, or un-learn the pattern. **Silent never means hidden.**

### Anomaly guardrail

When an amount exceeds **2× the vendor's rolling median**, Penny resurfaces it with reasoning:

> *"This Con Ed bill is $820 — noticeably higher than your usual $180–$240. Still Utilities, or something different this month?"*

The 2× threshold is a starting heuristic; tuning lives in AI eval 05 (Anomaly Detection).

---

## Rule proposal UX

When Alex confirms a new vendor-category mapping, Penny asks once:

> *"Want me to always categorize Uber as Travel from now on?"*

- If Alex says yes → future Ubers book automatically
- If no → Penny continues to ask

This is the "learn once, stop asking" principle applied to categorisation.

---

## Retroactive corrections (D33)

When Alex changes a vendor's category, Penny surfaces the retroactive correction option transparently:

- Shows what past transactions would be affected
- Explains the compliance impact
- Gives her recommendation
- Alex decides: update all / future only / leave it

Whatever Alex decides, the **audit trail records the change**.

---

## OCR and voice errors — wrong amount booked (D34)

**Defence in depth:**

### Prevention

When Penny has both a receipt and a bank transaction, she compares amounts before booking. Mismatch > $0.50 triggers a flag before confirmation.

### Correction

Any confirmed transaction can be edited at any time. The correction creates an audit log entry. The original record is never deleted.

---

*Next: [06-learning-and-memory.md](06-learning-and-memory.md)*
