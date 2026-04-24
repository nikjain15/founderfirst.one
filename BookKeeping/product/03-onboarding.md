# 03 — Onboarding and Cold Start
*First message, entity diagnostic, and historical data import.*

Decisions covered: D1, D2, D3, D4, D83, D84.

---

## First message (D1)

After onboarding and bank connection, Penny's first interaction is:

1. A warm, brief introduction
2. A quick summary of what she found — "I've pulled in your last 30 days — here's what I'm seeing"
3. The first approval card

This sets the tone for the relationship before asking Alex to do anything.

---

## Onboarding questions (D2, 🧪 hypothesis)

Penny asks a focused set of essential questions at setup — not a form, a conversation. Coverage:

- Business type
- Primary income sources
- Which connected accounts are business vs. personal vs. mixed
- Whether Alex works from home (home office deduction signal)
- **Entity type** (see D83)

Enough to dramatically improve cold-start accuracy without overwhelming Alex.

---

## Entity-type onboarding framing (D83)

Entity type is asked at first onboarding, **before** bank connection, because it is an architectural primitive (D72), not a settings field.

**Framing:**

> *"Quick one — how's your business set up for taxes? I'll ask so I get things right from day one."*
> *[Sole proprietor / LLC / S-Corp / C-Corp / Not sure — help me figure it out]*

**"Not sure" diagnostic — a 3-question conversational branch:**

1. Do you file a Schedule C, or a separate business return?
2. Do you pay yourself a salary through payroll?
3. Are you the only owner?

Penny arrives at the likely entity type, shows her reasoning, asks Alex to confirm.

Alex can change entity type anytime from Connect → Business Profile. Mid-year changes follow D72's election-transition flow — see [11-entity-type-and-s-corp.md](11-entity-type-and-s-corp.md).

---

## Cold start — first 30 days (D3, 🧪 hypothesis)

Penny has zero history and zero patterns.

- She leads with her best guess on every transaction where she has **at least one signal** (see D25 in [05-categorization.md](05-categorization.md))
- She is transparent about learning: *"I'm still getting to know your business — here's what I think, tell me if I'm off."*
- Every correction in the first 30 days is a high-value learning signal

Trust is built through transparency and visible improvement, not perfection from day one.

---

## Account designation (D4, 🧪 hypothesis)

Each connected account can be designated business / personal / mixed at onboarding, but designation is one signal among many — not a rule.

- Many solo freelancers do not mentally segment accounts this way
- For those users, the designation step is skippable
- Penny learns the boundary from behaviour over time (see D22 in [05-categorization.md](05-categorization.md))
- Penny's learned model always takes precedence over a static designation

---

## Historical data import (D84, supersedes D70)

Alex can bring her old books into Penny on day one. Two paths, **integration preferred**:

### Path 1 — Direct API connection

For prior tools where an API exists:

- QuickBooks Online
- Wave
- FreshBooks
- Xero
- QuickBooks Self-Employed

All read-only historical pulls. Penny authenticates, pulls history, normalises to Penny's ledger model, presents bulk review. Minimises CSV upload friction.

### Path 2 — CSV import with schema inference

Alex uploads any CSV from any source. Penny's import engine:

- Inspects columns and infers the schema automatically — *"column A is a date, column B is a vendor, column C is an amount"*
- Requires no guided column-mapping UI
- Recognises common shapes (QBSE, Wave, FreshBooks, generic) and handles them without interruption
- When uncertain about a column's meaning, **asks** — never silently guesses (D25)

### Conflict resolution with the learned model

When imported historical data contradicts Penny's live-learned model (e.g., 2024 books show Starbucks as "Personal"; current model learned "Business Meal"), the conflict is flagged to Alex with both views. **Silent overwriting in either direction is not allowed.**

### Bulk-confirm mode

On import day, respects Alex's time — review in batches, not per-card. Historical transactions become system-of-record only on Alex's explicit confirmation.

---

## Engineering notes

- Partnership sequencing for additional API integrations is a BD + engineering decision, not a product-scope limit
- CSV schema-inference is the fallback, not the default
- Import flow runs through the same approval-card surface as live data (on-sync behaviour matches offline capture — see [04-data-input.md](04-data-input.md))

Deep engineering detail: `../../engineering/implementation-strategy.md` v2.

---

*Next: [04-data-input.md](04-data-input.md)*
