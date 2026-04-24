# Open Questions — CEO Approval Required Before SCAF-1

*This is the first task in the workstream. Answer all 5, recommend a direction
for each, then wait for Nik's approval before touching any code.*

Source: `BookKeeping/reviews/demo-stress-test-apr-2026/scaffolding-proposal.md`
(bottom section — 5 open questions)

---

## How to run this task

1. Read `workstream/00-master-prompt.md` (master context).
2. Read `BookKeeping/reviews/demo-stress-test-apr-2026/scaffolding-proposal.md`
   in full.
3. For each question below, state your recommended answer and the trade-off.
   For each recommendation, tag it [CURRENT] / [FUTURE] / [BOTH] — this
   clarifies which impact is driving your recommendation.
4. Present all 5 recommendations together in one response.
5. Do NOT start SCAF-1 until Nik approves all 5.

---

## The 5 questions

### Q1 — Lint enforcement strategy (SCAF-4)

How should token-discipline violations be caught automatically going forward?

Options to consider (add others if you see a better path):
- ESLint custom rule with a banned-values regex
- Pre-commit grep hook (fast, no config)
- Both: grep for the commit gate, ESLint for the editor

Tag your recommendation with its issue class and explain the trade-off.

---

### Q2 — Copy registry format (SCAF-3)

Where should all static Penny copy live?

Options to consider:
- `constants/copy.js` — a frozen JS object, imported directly by components
- `public/copy/*.json` — JSON files fetched at runtime, like prompts

Tag your recommendation with its issue class and explain the trade-off.
Note: the answer must be consistent with the existing pattern in
`worker-client.js` and how `FALLBACK_COPY` is currently handled in
`screens/onboarding.jsx`.

---

### Q3 — TypeScript migration

Should the demo codebase migrate to TypeScript now (as part of the SCAF pass)
or defer it?

Consider:
- The SCAF pass is already touching every file — the migration cost is lower now
  than it will ever be again
- TypeScript would make SCAF-2 (constants/variants.js) significantly more
  enforceable (enum types vs string literals)
- Migration adds scope and risk to a pass that already has acceptance criteria
  to meet

Tag your recommendation [CURRENT] / [FUTURE] / [BOTH] and explain the
decision criteria you're applying.

---

### Q4 — `<Sheet>` API surface (SCAF-1)

What props should the canonical `<Sheet>` component expose?

Minimum viable surface to consider:
```
<Sheet
  open={bool}
  onClose={fn}
  title={string}
  maxHeight="82%"     // or override
>
  {children}
</Sheet>
```

Full surface additions to consider:
- `footerActions` prop (CTA buttons pinned to bottom)
- `draggable` prop (drag-to-dismiss handle)
- `portalTarget` prop (for CPA view's `#sheet-root-cpa`)
- `initialSnap` / `snapPoints` (multi-height sheets)

State your recommended API surface. Every prop you include now is a contract
future agents will rely on; every prop you omit now is a future breaking change.

---

### Q5 — CLAUDE.md amendment timing

When should `demo/CLAUDE.md` be updated to reflect the new patterns introduced
by the SCAF pass?

Options:
- **Per-SCAF:** each SCAF ships its own CLAUDE.md amendment in the same commit
  (specified for SCAF-1, SCAF-3, SCAF-4, SCAF-6 in the proposal)
- **End of Phase 1:** one consolidated CLAUDE.md rewrite after SCAF-7 lands

Tag your recommendation [CURRENT] / [FUTURE] / [BOTH] and note the risk of
the approach you're not recommending.

---

## Acceptance criteria for this task

- [ ] All 5 questions answered with a clear recommendation and trade-off
- [ ] Every recommendation tagged [CURRENT] / [FUTURE] / [BOTH]
- [ ] No code written or files edited
- [ ] Nik has approved all 5 answers in writing before this task is marked done
