# 06 — Learning and Memory
*How Penny learns, what she remembers, and the floor beneath her adaptation.*

Decisions covered: D35–D41, D86.

---

## How Penny learns (D35)

Every user action on an approval card — **confirm, edit, undo, ignore** — is stored and used to improve Penny's model.

- The model is **per-user**
- Private by default
- Continuously improving

**Penny's intelligence, not Alex's configuration file.**

---

## Penny's memory — visible to Alex? (D36)

Penny's learning model is internal and **not surfaced in the UI by default**. Alex does not see a "rules list."

- If Alex asks why Penny categorised something a certain way, Penny **explains her reasoning** (Principle 3)
- If Alex wants to see or edit her learned rules, there is a clear path under Connect settings
- The model stays private by default and improves without Alex's direct management
- Transparency is **one tap away**

---

## Communication-style personalisation (D37, 🧪 hypothesis)

Penny learns how Alex prefers to communicate:

- Split format (% vs. dollar)
- Note-adding habits
- How quickly she processes her backlog
- What notifications she responds to

Every preference is learned from behaviour, not set upfront.

Adaptation subject to the floor in Principle 5 (see D86 below).

---

## Shared intelligence — private vs. global model (D38)

**By default, all learning is private to Alex.**

A future opt-in layer allows Alex to contribute anonymised patterns to a shared model that helps all users.

- **Explicit opt-in**
- **Default off**
- **Never assumed**

The product earns data sharing through trust.

### Federated learning — full pipeline at launch (E10)

**Engineering decision:** the full federated-learning pipeline is built **before launch**, not added later.

- **Training-cycle gate:** 500 opted-in users minimum before any training cycle runs
- **Anonymisation + aggregation:** per General Counsel review (still open)
- **Opt-in storage** is separate from the user's core ledger
- **Data-use audit** available to Alex in plain English (Monzo reference model)

Scope impact: +8 weeks. Reason to build now: retrofit cost is 5–10× and the product's privacy posture must be credible from day one.

Engineering detail: `../../engineering/implementation-strategy.md` v2, E10.

---

## Business evolution over time (D39)

Penny handles business changes through **three layers**:

1. **Recency weighting** — the model naturally weights recent behaviour more heavily; old patterns fade as new ones emerge
2. **Proactive check-in** — when Penny detects a significant shift, she asks: *"Your business looks quite different from a year ago — has something changed?"*
3. **Manual refresh** — Alex can manually trigger a profile refresh from Connect settings

**Entity-type changes** (sole prop → S-Corp election) are a special case — see [11-entity-type-and-s-corp.md](11-entity-type-and-s-corp.md) (D72).

---

## CPA corrections as ground truth (D40)

When a CPA (or any tax-prep expert Alex designates) corrects a transaction category, that correction is fed back into Penny's model as a **high-confidence learning signal**.

For DIY-filing users who don't have a CPA, **Alex's own tax-time corrections serve the same role**.

---

## Unresolvable transactions (D41)

For genuinely unknown transactions that even Alex can't explain:

- Flagged as "Review later"
- Booked as "Uncategorized — flagged for review" (or "CPA review needed" if Alex has a CPA)
- **Never ignored, never dropped**

---

## Adaptation floor (D86, Principle 5)

Alex can personalise the **delivery** of adaptation-floor signals — timing, cadence, quiet hours — but **cannot disable** the signal itself. **A floor that can be turned off is not a floor.**

### Concrete examples

- Alex can move a quarterly-deadline reminder from 30/7/1 day to 7/1 day. She **cannot** mute quarterly deadlines.
- Alex can set quiet hours so bank-disconnection alerts batch to morning. She **cannot** silence bank-disconnection entirely.
- Alex can adjust the anomaly threshold on unusual income (from 2× median to 3× median). She **cannot** turn unusual-income detection off.

### Starting list of floor signals (Q-A1 remains open on completeness)

1. **Unusual income events** (>2× rolling median inbound)
2. **Overdue invoices** past payment terms
3. **Quarterly tax deadlines** (30 / 7 / 1 day)
4. **Bank disconnection**
5. **W-9 missing** for a contractor about to cross the 1099-NEC $600 threshold
6. **S-Corp payroll pay-date approaching** with insufficient cash

The list may grow as research surfaces additional critical events. **Settings UX in Connect → Notifications must be built to accommodate list growth without a redesign.**

---

## Open questions

- **Q-A1** — completeness of the adaptation-floor signal list (D86). Starting list above is a proposal, not final.

---

*Next: [07-notifications-and-backlog.md](07-notifications-and-backlog.md)*
