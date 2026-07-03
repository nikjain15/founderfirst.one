# What & why

<!-- 1–3 sentences. Link the plan / backlog item if one exists. -->

**workflow:** <!-- user-facing PRs only: which persona + which EXISTING job this nests under (no new nav/onboarding questions/owner jargon without Nik). Delete this line if not user-facing. -->

## Audit gate — [docs/AUDIT.md](../docs/AUDIT.md) § The loop

- [ ] Read the ledger rows + LEARNINGS entries nearest this surface; applied their constraints
- [ ] Read-then-write RPCs take a row lock (`FOR UPDATE` / `FOR SHARE`) — LEARNINGS #15
- [ ] Every query feeding a report / export / list paginates — LEARNINGS #18
- [ ] Schema changes are migrations only, timestamps unique; no prod-only edits — LEARNINGS #2 / #17
- [ ] New/changed RPCs and RLS policies have pgTAP tests; UI paths covered by e2e where suites exist
- [ ] Org-scoped reads & writes carry the tenant predicate (`check:tenant` clean)
- [ ] No hardcoded colors / px / URLs / emails (tokens.css · `SITE`)

## Coverage delta — keeps the audit loop honest

- [ ] AUDIT.md ledger row added or updated for this surface (new functionality starts ⬜ untested)
- [ ] Closes a finding → status flipped in the ledger + STRESS_TEST_TRACKER.md
- [ ] Opens a standing gap → added to the "NOT covered" table

## Law change — [decision-needed] (regulatory-watcher / any law-derived seed edit)

<!-- Delete this whole section unless this PR changes law-derived kernel data
     (filing_obligations / tax tables: thresholds, %, deadlines, form lines).
     Auto-drafted by the LOOP-2 regulatory watcher; a human MUST review + merge. -->

- [ ] **Citation** (IRS rev-proc / bill / instruction URL; trade-press must be corroborated by a primary source):
- [ ] **Effective dates** — old→new `effective_from`; old-law rows left intact so old periods keep old law (Roadmap 3c):
- [ ] **Affected consumers** — surfaces that recompute on merge (cards / nudges / checklist / 1099 report / estimator):
- [ ] `pnpm seed:kernel` regenerated `_generated.sql`; `pnpm check:reg-watcher` + `pnpm check:kernel-seed` green
- [ ] Change is a NEW superseding row, never an overwrite; the watcher did NOT self-merge

## Deploy notes

<!-- Migrations to push (list timestamps), edge functions to deploy, secrets to set. Write "None — repo-only" if nothing. -->
