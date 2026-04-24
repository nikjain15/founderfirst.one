# Penny Demo v5 — Forensic Stress Test (April 2026)

**Target:** `BookKeeping/demo/` — all built code, prompts, configs, screen briefs, implementation specs, CPA view materials.
**Reviewed:** 24 April 2026.
**Lens:** end-user flow · spec/doc consistency · design system + brand guide · integration gaps · **AI-scalability** (can a future Claude Code session build new skills/agents against this codebase without ambiguity).
**Commissioned by:** Nik (CEO).

---

## Scope lock

**In scope:** everything under `BookKeeping/demo/` — `screens/`, `components/`, `styles/`, `public/`, `util/`, `guardrails/`, `tests/`, `implementation/`, `screen-briefs/`, `demo-worker/`, and the demo-local `CLAUDE.md` + `DESIGN.md`.

**Out of scope (hard):** every other folder in the workspace. That includes `BookKeeping/product/`, `BookKeeping/architecture/`, `BookKeeping/engineering/`, `BookKeeping/ai-evals/`, `BookKeeping/research/`, `BookKeeping/design/`, `BookKeeping/tools/`, `FounderFirst OS/`, and the root `CLAUDE.md`. None of those are read, referenced, edited, or considered during any work in this review.

The demo-local `CLAUDE.md` + `DESIGN.md` are the only sources of truth for product rules during this review. If a rule is missing from those two files, the rule does not apply to this work. If a rule is needed and missing, the remediation is to add it to the demo-local file — never to pull it from outside `BookKeeping/demo/`.

---

## Why this review exists

The previous stress tests (`demo-v5-pre-handoff-stress-test-apr-2026.md`, `spec-v2.2-tech-stress-test-apr-2026.md`, etc.) were written pre-build or mid-build and focused on whether the spec was buildable. This one is different: **all 7 founder screens are built, the CPA spec is locked, and we now want the codebase to be AI-buildable at scale.**

That is, every future session in which Claude (or any agent) is asked to "add a new screen," "extend the CPA view," "build a new skill," or "wire a new integration" should produce code that is consistent with what exists, without the CEO having to re-explain decisions. This is only possible if:

1. Every rule in `CLAUDE.md` + `DESIGN.md` is honored in the existing code (violations corrupt the training set).
2. Every repeating concept (variants, intents, sheet patterns, Penny copy, state shape) has exactly one source of truth.
3. Every spec and doc agrees with every other spec and doc.
4. Every config is machine-readable without reverse-engineering.

Any gap between those four conditions is a finding in this review.

---

## How to read this folder

Each file answers one question, so you can load only what you need.

| File | What it covers | For who / when |
|---|---|---|
| `00-README.md` | This file — index + counts + reading order. | Always start here. |
| `01-founder-code.md` | Forensic audit of `screens/*.jsx`, `App.jsx`, `components/`, `styles/`, `util/`, `guardrails/`, `tests/`, `worker-client.js`. | Before touching any built screen. |
| `02-prompts-voice.md` | Audit of `public/prompts/*.md`, Penny voice rules, validator, intent map, JSON contracts. | Before editing any Penny copy or adding a new intent. |
| `03-config-data-irs.md` | Audit of `public/config/*.json`, `util/irsLookup.js`, `implementation/irs-routing.md`, `engineering/categories.v1.json`. | Before adding a persona, industry, or category. |
| `04-cpa-spec-buildability.md` | Is `implementation/cpa-view-spec.md` v1.1 + `cpa-data-model.md` + `screen-briefs/09-cpa-view.md` enough for a fresh Claude Code session to build Phases 1–8 without CEO input? | Before starting CPA view implementation. |
| `05-end-user-walkthrough.md` | First-time user flow from Alex's point of view — what feels off, what breaks trust, what a prospect would notice. | Sales/demo readiness call. |
| `06-doc-consistency.md` | Cross-reference between demo `CLAUDE.md`, `DESIGN.md`, all `screen-briefs/*.md`, `implementation/*.md`, built code — within `BookKeeping/demo/` only. | When two docs seem to disagree. |
| `flow-onboarding.md` through `flow-cpa.md` | Per-flow consolidated view — everything relevant to that one flow pulled from the files above. | When the work at hand is scoped to a single flow. |
| `scaffolding-proposal.md` | Remediation plan: what to add / refactor / delete so the codebase becomes AI-buildable at scale. | When deciding what to fix and in what order. |

---

## Severity key (used in every findings file)

| Tag | Meaning |
|---|---|
| **Critical** | Ship-blocker. Demo would be visibly wrong, or an AI agent would propagate a severe brand/logic violation if it copies the existing code. |
| **High** | Visible bug, brand violation, or undocumented drift that an AI would likely copy. Fix before scaling. |
| **Medium** | Token discipline, dead code, or minor inconsistency. AI agent probably copies the violation but user-facing impact is small. |
| **Low** | Nit, polish, cosmetic. Safe to batch. |
| **Scalability** | Not a bug today — but the pattern will cause drift when an AI agent builds the next feature. These are the ones that matter most for your new goal. |

Every finding carries an explicit **AI-scalability impact** line describing what a future Claude session would get wrong if this issue stays in the codebase.

---

## Counts (updated as audits complete)

| File | Critical | High | Medium | Low | Scalability | Total |
|---|---|---|---|---|---|---|
| 01-founder-code | 5 | 21 | 28 | 18 | 9 | 81 |
| 02-prompts-voice | _pending_ | | | | | |
| 03-config-data-irs | _pending_ | | | | | |
| 04-cpa-spec-buildability | _pending_ | | | | | |
| 05-end-user-walkthrough | _pending_ | | | | | |
| 06-doc-consistency | _pending_ | | | | | |

---

## Finding ID convention

Each finding has an ID: `<file-number>.<severity-tag>.<sequence>`. Example: `01.C.1` is the first Critical finding in `01-founder-code.md`. IDs are stable — they can be referenced from the per-flow consolidations and from the scaffolding proposal without renumbering.

---

## Reading order for a fresh Claude session

If you are an AI agent loading this folder for the first time:

1. Read this README.
2. Read `scaffolding-proposal.md` (what we decided to do about the findings).
3. Read the per-flow file for the flow you are working on (e.g. `flow-onboarding.md`).
4. Only then open the underlying per-file findings (`01`–`06`) if you need evidence for a specific rule.

Files `01`–`06` are the evidence. Files `flow-*.md` are the working view. `scaffolding-proposal.md` is the contract.
