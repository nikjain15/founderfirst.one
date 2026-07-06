# Penny as an operating agent — from answering to doing

> Status: **Draft for review** · 6 Jul 2026 · Owner: Nik
> Scope: evolve "Ask Penny" from a question-answering chat into a **self-improving operating agent**
> that does real bookkeeping work on the owner's books from natural-language instruction — safely,
> transparently, reversibly. This is a design/spec doc for alignment **before** building. Nothing
> here ships until Nik signs off.

## The shift
Today Penny **answers** ("what did I spend?") grounded in the real ledger. Next she **acts**:
"categorize all Amazon as supplies", "reconcile March", "chase the unpaid invoices", "close the
month", "find duplicate charges." Same grounding discipline (numbers from the real books, never
invented), now applied to *writes* — always previewed, always logged, always undoable.

We are not starting from zero. The substrate exists:
- **Write-paths**: every mutation already funnels through edge fns (`categorize`, `invoicing`,
  `reconcile`, period-close, etc.) → RLS-gated RPCs. Penny calls the *same* paths a human does.
- **Trust-tiered autonomy** (W3): high-confidence auto, low-confidence asks within a ≤5/week budget.
- **Learning**: `categorization_rules` (LearnedRules) already promote confirmed decisions into rules.
- **Visibility**: the "Penny did this" feed + 1-tap undo already exist on Home.
- **Memory**: server-side per-(org,user) thread history just shipped (`penny_thread_messages`).
- **Audit**: `ledger_audit` / `admin_audit` record every write.

The work is to add an **instruction → plan → preview → execute → learn** loop on top of these.

## Nik's four axes

### 1. What work Penny can do (the capability catalog)
Each capability = a typed tool with preconditions, a dry-run that returns a preview, an executor that
calls the existing edge fn, and an undo. Phased by risk:

| Tier | Capability | Underlying path | Autonomy default |
|---|---|---|---|
| Read/advise | Explain a number, list uncategorized, find duplicates/anomalies, "what needs me" | existing reads | auto |
| Low-risk write | Categorize / recategorize a txn, apply a learned rule, match a receipt | `categorize` fn | preview → 1-tap confirm (auto if high-confidence) |
| Medium write | Bulk categorize ("all Uber → travel"), create a rule, draft an invoice, send a reminder | `categorize` / `invoicing` fns | **always preview a summary, confirm before apply** |
| High/irreversible | Send an invoice, record a payment, reconcile, close/lock a period, void | respective fns | **explicit confirm every time; never auto** |

New capabilities are added to this table, never as ad-hoc code paths.

### 2. How she does it (the execution loop)
1. **Understand** — route the instruction to a capability + parameters (LLM plan, validated against a
   schema; ambiguous → ask one clarifying question, not a guess).
2. **Plan & preview** — run the capability's dry-run: "I'll recategorize 42 transactions (£3,120)
   from Uncategorized to Travel. Here's the list." Show the exact rows/amounts, computed from the
   real books.
3. **Confirm** — auto only for the auto-tier above; otherwise one tap. Irreversible = always confirm.
4. **Execute** — call the existing edge fn (never a shadow write-path). Reuse every gate:
   `can_write_org_as`, period locks, `approval_status`, org MFA, engagement access.
5. **Report** — write to the "Penny did this" feed + audit; offer undo.

**Non-negotiables:** grounding (figures from real entries), no parallel write-path, destructive =
confirm, one action = one audited transaction.

### 3. How she improves
- **Learn from corrections** — a user edit after Penny acts updates/creates a `categorization_rule`
  (the LearnedRules loop, generalized to more capabilities).
- **Promote repetition** — repeated identical confirmations ("yes, always X → Y") become an auto-rule
  (with the owner's OK), shrinking future asks.
- **Track accuracy per capability** — log proposed-vs-accepted; feed the weekly `/audit` loop; a
  capability that dips below a bar drops back to preview-always.
- **Self-eval** — a held-out set of past decisions Penny re-runs to catch regressions.

### 4. How the user sees it (visibility & trust)
Trust is earned by transparency, not silence:
- **Preview before every write** (the confirm card shows exactly what will change).
- **"Penny did this" feed** — the running log of autonomous actions, each with undo.
- **Activity / audit trail** — every action, who/what/when, traceable to the entries.
- **"What Penny is doing now"** — a live status when a multi-step task runs.
- **Autonomy dial** — the owner sets how much Penny may do without asking (already partly modeled by
  the interruption budget); surface it plainly.

## Build phases (each gated, each shippable)
- **P0 — Tool framework**: capability registry (dry-run + execute + undo interface); the plan→preview→
  confirm→execute→report loop in the thread; audit + feed wiring. Ship with **one** low-risk
  capability (bulk categorize) end-to-end.
- **P1 — Breadth**: add capabilities tier by tier (receipts match, rules, AR reminders, anomaly/dupe
  finder), each with preview + undo.
- **P2 — Learning**: correction→rule generalization, repetition→auto-rule, per-capability accuracy in
  the audit dashboard.
- **P3 — Autonomy & visibility polish**: autonomy dial, "doing now" surface, scheduled/standing
  instructions ("every month-end, draft the close").

## Guardrails (carry from LEARNINGS + ARCHITECTURE)
Grounding airtight · writes only through existing RLS/permission RPCs · destructive/irreversible =
explicit confirm · every action audited + undoable · voice per VOICE.md (Penny = teammate, no
jargon, no exclamation marks) · no hardcoded thresholds (config-driven) · new capability = new audit
ledger row + a stress pass (docs/AUDIT.md).

## Open questions for Nik
1. **Autonomy default** — should medium-risk writes ever auto-run for a trusted owner, or always
   preview? (I lean always-preview until per-capability accuracy earns auto.)
2. **Scheduled/standing instructions** in scope for v1, or after the interactive loop is solid?
3. **First capability to ship** in P0 — bulk categorize is my pick (highest daily value, low risk,
   fully reversible). Agree?
