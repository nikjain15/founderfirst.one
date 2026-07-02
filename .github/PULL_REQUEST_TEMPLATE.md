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

## Deploy notes

<!-- Migrations to push (list timestamps), edge functions to deploy, secrets to set. Write "None — repo-only" if nothing. -->
