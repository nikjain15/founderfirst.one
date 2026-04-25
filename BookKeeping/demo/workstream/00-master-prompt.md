# Penny Demo — Stress-Test + Bedrock-Fix + Re-Audit Workstream

*Hand this file to a fresh Claude Code session at the start of any workstream task.*
*Last updated: 24 April 2026*

---

## Who you are working with

I'm Nik, CEO of Penny — an AI-first mobile bookkeeper for US sole proprietors,
S-Corps, LLCs, and small business owners across ten industries. You're picking
up a stress-test + bedrock-fix + re-audit workstream that's in progress.

---

## Scope lock — demo only

**In scope:**
- Everything under `BookKeeping/demo/`
- Everything under `BookKeeping/reviews/demo-stress-test-apr-2026/`

**Out of scope — do NOT read, reference, edit, or consider:**
`BookKeeping/product/`, `BookKeeping/architecture/`, `BookKeeping/engineering/`,
`BookKeeping/ai-evals/`, `BookKeeping/research/`, `BookKeeping/design/`,
`BookKeeping/tools/`, `FounderFirst OS/`, and the workspace root `CLAUDE.md`.

**Sources of truth:** `demo/CLAUDE.md` and `demo/DESIGN.md` only. If a rule is
missing from those two files, either it doesn't apply, or the remediation is to
add it to the demo-local file. Never pull rules from outside `BookKeeping/demo/`.

---

## Read these first (in this order, before any action)

1. `BookKeeping/demo/CLAUDE.md`
2. `BookKeeping/demo/DESIGN.md`
3. `BookKeeping/reviews/demo-stress-test-apr-2026/00-README.md`
4. `BookKeeping/reviews/demo-stress-test-apr-2026/01-founder-code.md`
5. `BookKeeping/reviews/demo-stress-test-apr-2026/scaffolding-proposal.md`

---

## Why this workstream exists

The end goal: make `BookKeeping/demo/` AI-buildable at scale. Every future Claude
session asked to add a screen, extend the CPA view, build a new skill, or wire a
new integration should produce on-brand code without me re-explaining decisions.

A forensic audit (`01-founder-code.md`) found two distinct classes of problems.
You must track and distinguish them throughout all three phases:

| Tag | Meaning |
|---|---|
| **[CURRENT]** | Issues that exist RIGHT NOW in shipped code — bugs, violations, inconsistencies a user or reviewer can observe today. Fix-first priority. |
| **[FUTURE]** | Gaps that do not visibly break the current demo but will corrupt future AI-built features — ambiguous contracts, missing constants, scattered copy, undocumented patterns. AI-scalability lens. |
| **[BOTH]** | Simultaneously a current bug and a future trap. Fix in the SCAF pass, not deferred. |

Every finding, every diff, every audit must carry one of these tags. If a finding
has no tag, it is incomplete.

Specific problems found in `01-founder-code.md`:

- Two sheet patterns coexist — **[BOTH]**
- Card variants scattered as magic strings — **[FUTURE]**
- Penny copy hard-coded in multiple files — **[BOTH]**
- Token-discipline violations in shipped screens — **[CURRENT]**
- Color-zone rules violated (amber-as-background) — **[CURRENT]**
- Duplicate CSS — **[CURRENT]**
- Dead code — **[BOTH]**

---

## Demo persona scope — all audits must cover this

The demo ships **20 personas: 2 per industry × 10 industries.** Each industry
has one sole-prop persona and one S-Corp persona.

**Industries:**
consulting · trades · retail · food & beverage · healthcare ·
beauty & wellness · professional services · creative & media ·
real estate · other

**Entity types in scope for all audits:**
- Sole-prop → Schedule C
- S-Corp → Form 1120-S
- LLC single-member → Schedule C (disregarded entity)
- LLC multi-member → Form 1065 + Schedule K-1

Every audit must verify coverage across ALL entity types and ALL industries —
not just the sole-prop consulting default. Specific checks required:

- IRS line routing is correct for each entity type
- Category labels are entity-appropriate (e.g. "Owner's draw" only on S-Corp
  and LLC cards, not sole-prop)
- LLC dual-path is documented and handled (single-member vs multi-member at
  onboarding)
- S-Corp mid-year election narration is present in the relevant scenario
- All 20 scenario keys exist in `scenarios.json` and resolve correctly in
  `App.jsx`

---

## Working mode — apply always

- **Ask first, build second.** Never assume.
- **One task at a time.** Acceptance criteria must pass before the next begins.
- Every finding, diff, and audit tagged **[CURRENT]** / **[FUTURE]** / **[BOTH]**.
- Every audit covers all entity types and all 10 industries.
- **Bug-lens and AI-scalability lens are co-equal.** Never let one crowd out the
  other.
- `CLAUDE.md` amendments ship alongside SCAF-1, SCAF-3, SCAF-4, SCAF-6 per the
  spec.
- If you find drift between the proposal and what's actually needed, stop and
  ask — don't silently adjust the contract.
- American English throughout.
- Follow every settled decision in `demo/CLAUDE.md` without re-opening.
- Scope stays inside `BookKeeping/demo/` always. If something you need is outside
  that scope, stop and tell me rather than reach for it.

---

## The three phases at a glance

```
Phase 1 — Bedrock fix pass          (sequential, CEO approves each commit)
  SCAF-1  ── blocks ──► SCAF-2  ── blocks ──► SCAF-3  ── blocks ──►
  SCAF-4  ── blocks ──► SCAF-5  ── blocks ──► SCAF-6  ── blocks ──►
  SCAF-7

Phase 2 — Forensic re-audits        (blocked by SCAF-7)
  01-founder-code v2 · 02-prompts-voice · 03-config-data-irs
  04-cpa-spec-buildability · 05-end-user-walkthrough · 06-doc-consistency

Phase 3 — Per-flow consolidation    (blocked by Phase 2 completion)
  flow-onboarding · flow-thread-and-card · flow-add · flow-books
  flow-avatar · flow-invoice · flow-cpa
```

Full task detail is in the phase files below. Load only the one you're currently
working on — do not load all phases at once.

---

## Phase files (load one at a time)

| File | Contents |
|---|---|
| `01-phase1-scaf.md` | All 7 SCAF work items — acceptance criteria, issue class, CLAUDE.md amendment rules |
| `02-phase2-audits.md` | All 6 forensic audit briefs — scope, entity-type checks, output format |
| `03-phase3-flows.md` | All 7 per-flow consolidation docs — what each must contain, current/future sections |
| `04-open-questions.md` | 5 open questions from `scaffolding-proposal.md` that need CEO approval before SCAF-1 begins |

---

## How to start a session

1. Read the 5 files listed above under "Read these first."
2. Read `workstream/00-master-prompt.md` (this file).
3. Read the phase file for the task you are currently on.
4. Confirm which task is active and what its acceptance criteria are.
5. Ask any clarifying questions before touching code.
6. Do not start work until Nik approves your plan.

---

## Current task status

| Task | Status | Blocked by |
|---|---|---|
| Answer 5 open questions (`04-open-questions.md`) | **Pending CEO approval** | — |
| SCAF-1 Sheet + FullScreenOverlay | ✅ Done (25 Apr 2026) | — |
| SCAF-2 constants/variants.js | ✅ Done (25 Apr 2026) | — |
| SCAF-3 constants/copy.js | ✅ Done (25 Apr 2026) | — |
| SCAF-4 Token-discipline sweep | ✅ Done (25 Apr 2026) | — |
| SCAF-5 Color-zone fix | ✅ Done (25 Apr 2026) | — |
| SCAF-6 Shared micro-components | ✅ Done (25 Apr 2026) | — |
| SCAF-7 Dead code + CSS sweep | ✅ Done (25 Apr 2026) | — |
| Phase 2 audits (×6) | **Ready to start** | SCAF-7 ✅ |
| Phase 3 flow docs (×7) | Not started | Phase 2 |

*Update this table at the end of every session.*
