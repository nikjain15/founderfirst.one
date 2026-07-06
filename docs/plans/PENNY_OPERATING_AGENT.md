# Penny as an operating agent — from answering to doing

> Status: **Draft for review** · 6 Jul 2026 · Owner: Nik
> Scope: evolve "Ask Penny" from a question-answering chat into a **self-improving operating agent**
> that does real bookkeeping work on the owner's books from natural-language instruction — safely,
> transparently, reversibly. This is a design/spec doc for alignment **before** building. Nothing
> here ships until Nik signs off.

## Decisions locked (Nik, 6 Jul)
1. **Always ask first.** Every action that changes the books shows a preview and waits for one tap —
   no exceptions at launch. Irreversible actions always ask. Specific actions may **graduate** to
   automatic later, per-capability, once they've proven accurate (earn trust, then loosen).
2. **Continuous narration.** Penny always says, in plain user language, what she's doing and what
   she's thinking, so the user can follow and track her at every step (not just a final result).
3. **Unified memory.** Penny remembers across *everywhere the user has interacted* — every tab, all
   past conversations, actions/clicks, and support issues — and also carries the **CPA's perspective**
   for that specific business. One shared context, not a per-screen silo.

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
- **Preview before every write** (the confirm card shows exactly what will change) — always ask (D1).
- **Continuous narration (D2)** — Penny thinks out loud in plain language as she works: "Looking at
  your March transactions… I found 42 from Amazon… here's what I'd do." A visible thinking/step
  stream, not just a final answer, so the user can follow (and interrupt) at every step.
- **"Penny did this" feed** — the running log of actions, each with undo.
- **Activity / audit trail** — every action, who/what/when, traceable to the entries.
- **"What Penny is doing now"** — live status while a multi-step task runs.
- **Autonomy dial** — which capabilities have graduated to automatic vs. always-ask; surfaced plainly
  and owner-controlled.

## Unified memory / context (D3)
Penny works from **one shared context per business**, not a per-screen chat. It draws on everywhere
the user has interacted, and includes how the CPA sees the same books.

**Sources to fold in (all already in the DB — this is retrieval + assembly, not new capture):**
- Conversations — `penny_thread_messages` (server-side, shipped) across every tab/device.
- What Penny has done — the "Penny did this" activity feed + `ledger_audit`.
- Support history — the user's `support_tickets` / replies (what they've raised and how it resolved).
- CPA perspective — engagement notes, flags, suggestions, and reclassifications the CPA made on this
  business (W1.5 collaboration) so Penny knows what the accountant has said/done.
- The books themselves — accounts, entries, categorization rules (LearnedRules), periods.
- Navigation/actions — meaningful clicks/steps (what the user was doing when they asked).

**Design:**
- A **context service** assembles a per-(business) working memory on demand: recent conversation +
  relevant activity + open support threads + CPA notes + the ledger facts a question needs. The LLM
  is grounded on this; figures still come from the real ledger, never invented.
- **Scope & privacy:** context is per-business and role-aware — an owner sees owner+shared context;
  a CPA sees their engagement's context. RLS on every source table is the boundary (Penny never
  reads across tenants). The CPA "perspective" surfaced to the owner is the CPA's *on-the-books*
  actions/notes for that business, not the CPA's private data.
- **Substrate shipped:** `penny_thread_messages` (cross-tab/device thread memory) is step one. The
  unified context service (folding in activity, support, CPA notes) is a P0/P1 build item below.

## Build phases (each gated, each shippable)
- **P0 — Tool framework**: capability registry (dry-run + execute + undo interface); the plan→preview→
  confirm→execute→report loop in the thread with **always-ask** (D1) + **live narration** (D2); audit
  + feed wiring; the **unified context service v1** (conversation + activity + ledger). Ship with
  **one** low-risk capability (bulk categorize) end-to-end.
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
1. ~~Autonomy default~~ — **DECIDED (D1): always ask first; graduate per-capability later.**
2. **Scheduled/standing instructions** ("every month-end, draft the close") in scope for v1, or after
   the interactive loop is solid?
3. **First capability to ship** in P0 — bulk categorize is my pick (highest daily value, low risk,
   fully reversible). Agree, or start elsewhere?
4. **Unified context depth for v1** — is folding in support history + CPA notes wanted in P0, or start
   with conversation + activity + ledger and add those next? (I lean start-narrow, expand fast.)
