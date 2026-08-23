# Build-loop backlog

> Status: **[decision-needed]** — empty, awaiting Nik re-curation · 23 Aug 2026 · Owner: Nik

## Why this is empty

This file (and `docs/plans/LOOP_PROMPT.md`) was supposed to land on `main` via PR #167
(2 Jul 2026) but the squash-merge silently dropped it from the diff despite the commit
message listing it, see **[LEARNINGS.md rule 25](../../LEARNINGS.md)** for the full
root-cause. Consequence: **every 30-minute build-loop iteration from 13–23 Aug 2026 (10
days, 200+ runs) found no `docs/plans/BACKLOG.md` on a fresh `origin/main` checkout and
correctly exited as a no-op** rather than guessing at cards. The loop did not build
anything against current `main` during that window.

**This file is intentionally left as a `[decision-needed]` stub, not restored from the
2‑Jul snapshot or from any stale `loop/*` worktree branch**, on purpose:

- The original content (313 lines, last touched 2 Jul) predates ~140 PRs merged to `main`
  since. Restoring it verbatim would very likely hand a loop builder a card that's already
  shipped under a different name, one specific case is already confirmed: `SIG-DIGEST-RLS`
  (from the stale `loop/sig-digest-sends-rls` branch / closed PR #340) was independently
  re-fixed and is already live on `main` via migration
  `supabase/migrations/20260726120300_sig_digest_sends_rls.sql`.
- 45 abandoned worktrees under `worktrees/*` (see `ls worktrees/`) each hold a local,
  never-pushed `loop/<card>` branch with real, potentially still-useful work from before
  this gap opened. None are on `origin`; several PRs opened from them were closed unmerged
  (#309–#354). Each one needs a human (or a dedicated review pass) to check "is this still
  needed, or already superseded on `main`?" before it's safe to re-file as a card, that
  judgment call belongs to Nik / an explicit review session, not to a builder loop.
- Per this file's own operating contract (`docs/plans/LOOP_PROMPT.md`, hard rule 3):
  *"Cards with `decision-needed` are skipped and surfaced to Nik. Never guess a product
  decision."* A single top-level `[decision-needed]` card, below, is the correct way to
  make a build-loop iteration stop and report rather than either (a) silently no-op'ing
  again with no path forward, or (b) fabricating a plausible-looking backlog.

## Cards

### BACKLOG-RECURATE-1 — Re-curate the build-loop backlog `[decision-needed]`

**Blocked by:** Nik (or a dedicated triage session) deciding what's actually next, informed
by:
- The 45 stale branches in `worktrees/*` (list: `ls worktrees/`), each `git log -1
  --format='%H %s' loop/<name>` to see what it claims to do, then diff against current
  `main` to see if it's already done.
- `docs/plans/roadmap-v2.md` (2 Jul, DRAFT, awaiting Nik direction) for the
  post-Wave-1-4 candidate directions.
- Recent merged PRs on `main` for what's already shipped (`git log --oneline main` /
  `gh pr list --state merged`).
- `docs/plans/production-readiness-runbook.md`, `docs/plans/ia-3-admin-console-migration.md`,
  `docs/plans/multi-currency-design.md`, `docs/plans/INVOICING_REWORK.md`,
  `docs/plans/PENNY_ANALYTICS.md`, `docs/plans/PENNY_OPERATING_AGENT.md`,
  `docs/plans/categorization-multimodel-validation.md` for plans that may already carry
  their own card lists.

**A build-loop iteration should not attempt this card itself** — it requires product
judgment (what to prioritize, what's stale vs. still wanted) that belongs to Nik. Surface
it; don't guess.

---

*Card format for whoever re-curates this: `### <ID> — <title> [<status/claim marker>]`,
with a one-line acceptance list and `Blocked by:` when relevant. See the archived 2‑Jul
snapshot for the fuller format this repo used before, `git show
origin/docs/plan-docs-to-main:docs/plans/BACKLOG.md`, useful as a format reference only,
not as current content (see "Why this is empty" above).*
