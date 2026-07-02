# Docs — the map and the rules

Every document in this repo has exactly **one home**, listed here. Read this before
writing or moving any doc. If a doc doesn't fit a row below, this file gets updated
in the same PR that adds the doc — the map is only useful while it's complete.

---

## 1. The map

| Kind of doc | Home | Examples |
|---|---|---|
| **Repo canon** (cross-cutting, always true) | repo root — **frozen at three files** | [README.md](../README.md) · [LEARNINGS.md](../LEARNINGS.md) · [VOICE.md](../VOICE.md) |
| **Spec of a shipped surface** | next to the code it governs | [apps/web/BLOG_PRINCIPLES.md](../apps/web/BLOG_PRINCIPLES.md) · [apps/admin/ADMIN_PRINCIPLES.md](../apps/admin/ADMIN_PRINCIPLES.md) · [packages/design-system/README.md](../packages/design-system/README.md) · [tools/signals-worker/SOLUTION.md](../tools/signals-worker/SOLUTION.md) |
| **Plan / roadmap / research** (forward-looking) | [docs/plans/](plans/) | [ARCHITECTURE.md](plans/ARCHITECTURE.md) · [FULL_BOOKKEEPING_ROADMAP.md](plans/FULL_BOOKKEEPING_ROADMAP.md) · [learning-loop-act-spec.md](plans/learning-loop-act-spec.md) |
| **Stress-test campaign artifacts** | [docs/stress/](stress/)`<campaign>/` + a row in [STRESS_TEST_TRACKER.md](STRESS_TEST_TRACKER.md) | [stress/auth/FINDINGS.md](stress/auth/FINDINGS.md) |
| **Operational rubric / tracker** | [docs/](.) top level | [AUDIT.md](AUDIT.md) (rubric for `/audit`) · [STRESS_TEST_TRACKER.md](STRESS_TEST_TRACKER.md) |
| **Superseded or finished** | [docs/archive/](archive/) with a `YYYY-MM-` prefix | [archive/2026-06-admin-hardening-SUMMARY.md](archive/2026-06-admin-hardening-SUMMARY.md) |
| **Incident lesson** | a numbered rule in [LEARNINGS.md](../LEARNINGS.md) — **never a new file** | — |
| **Session scratch / run progress** | the session scratchpad — **never committed** | — |

> `CLAUDE.md` at the root is **gitignored** (local per-machine). It's the fast index
> for Claude sessions; everything committed lives in the docs above.

### Per-surface specs (the co-located canon)

- **Marketing + blog + podcast** — [apps/web/BLOG_PRINCIPLES.md](../apps/web/BLOG_PRINCIPLES.md) · [apps/web/PODCAST_PRINCIPLES.md](../apps/web/PODCAST_PRINCIPLES.md)
- **Admin** — [apps/admin/ADMIN_PRINCIPLES.md](../apps/admin/ADMIN_PRINCIPLES.md) · [apps/admin/RESPONSIVE.md](../apps/admin/RESPONSIVE.md) (the responsive standard, applies repo-wide) · [apps/admin/support-management/](../apps/admin/support-management/) (support KB + specs)
- **Penny app** — [apps/app/APP_PRINCIPLES.md](../apps/app/APP_PRINCIPLES.md) (nav/IA per lens)
- **Design system** — [packages/design-system/README.md](../packages/design-system/README.md) + [tokens.css](../packages/design-system/tokens.css)
- **Signals** — [tools/signals-worker/SOLUTION.md](../tools/signals-worker/SOLUTION.md) (design) · [STRATEGY.md](../tools/signals-worker/STRATEGY.md) (what/why) · [README.md](../tools/signals-worker/README.md) (ops)
- **Email** — [supabase/functions/_shared/EMAIL.md](../supabase/functions/_shared/EMAIL.md) · [EMAIL_REGISTRY.md](../supabase/functions/_shared/EMAIL_REGISTRY.md)
- **Edge functions** — [supabase/functions/README.md](../supabase/functions/README.md) (catalog: all functions, purpose + who calls them)
- **CI/CD** — [.github/workflows/README.md](../.github/workflows/README.md) (every workflow: trigger, what it does, where it deploys)
- **AI quality & cost layer** — [docs/ai-quality-cost-layer/GUARDRAILS.md](ai-quality-cost-layer/GUARDRAILS.md) (living) + [docs/plans/ai-quality-cost-layer-plan.html](plans/ai-quality-cost-layer-plan.html) (plan)
- Every `tools/*` and `packages/*` directory carries its own `README.md` for ops/setup.

---

## 2. The rules

1. **The root is frozen.** Only `README.md`, `LEARNINGS.md`, `VOICE.md` (plus the
   gitignored local `CLAUDE.md`) live at the repo root. A PR adding any other root
   file is wrong by default — find its home in the map.
2. **Specs live next to the code they govern.** When you ship a capability, add or
   extend the co-located spec in the same PR (LEARNINGS rule 7: change a behavior →
   update what the system says about itself). Don't create a parallel doc elsewhere.
3. **Plans carry a status header.** First lines of every `docs/plans/` doc:
   `> Status: draft | active | parked | shipped | superseded · <date> · Owner: <name>`.
   A plan without a status is unreviewable six weeks later.
4. **Graduate, then archive.** When a plan ships, move its load-bearing content into
   the co-located spec, flip the status to `shipped`, and `git mv` it to
   `docs/archive/YYYY-MM-<name>.md`. Never delete history; never leave shipped plans
   posing as current ones.
5. **One concept, one doc.** No `.html` renders of `.md` sources, no per-session
   copies, no "v2" files next to "v1" (LEARNINGS rule 6). Update the original.
6. **Moving a doc means updating its references in the same commit.** Grep for the
   filename first; prose mentions in code comments and READMEs count.
7. **Session scratch never gets committed.** Run progress, TODO dumps, and
   intermediate results belong in the session scratchpad. If a run produces durable
   findings, they go in the tracker/spec/LEARNINGS entry they belong to.
8. **Naming:** canon specs are `SCREAMING_SNAKE.md`; plans are `kebab-case.md`
   (or `SCREAMING_SNAKE` for the few program-level ones); archives are prefixed
   `YYYY-MM-`; stress campaigns are `docs/stress/<feature>[-<yyyymmmdd>]/`.
9. **Deploying a change flips the doc, in the same PR.** When something ships,
   moves host, or changes model/engine/route, update the affected doc's Status /
   "Last verified" line and its claims right then — a doc that still says
   "pending deploy" or names the old model is how drift starts (LEARNINGS rule 7).
   If a doc has drifted so far it describes a system that no longer exists,
   **archive it and write the current truth fresh** — don't patch around a fossil.

## 3. PR checklist (docs)

Before opening any PR that adds, moves, or meaningfully changes a doc:

- [ ] The doc is in its map home (§1) — not the root, not a new ad-hoc folder.
- [ ] New capability → its co-located spec was added/updated in this PR.
- [ ] Plan docs have the status header; statuses of affected plans were flipped.
- [ ] Moved/renamed docs: all references updated (`grep -rn "<old name>"` is clean).
- [ ] Nothing session-scratch is in the diff.
- [ ] If this PR invents a new *kind* of doc, this file's map gained a row for it.
