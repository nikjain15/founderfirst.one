# FounderFirst — engineering learnings (read before non-trivial work)

Hard-won rules from real incidents in this repo. Each one cost us time or a
near-miss. Follow them; don't relearn them.

---

## 1. One session per working tree. Commit small, commit often.

**What happened:** Many Claude/dev sessions ran against the same working folder
at once. Staged-but-uncommitted changes got swept into unrelated commits,
regenerated, or clobbered. A deletion "came back". 60+ stale worktrees piled up.

**Rules:**
- This folder is for committing to `main`. Everything experimental runs in its
  **own git worktree** (the harness `isolation: worktree` option), merged back
  via a reviewed diff. Don't run two sessions editing the same files.
- **Commit atomically and immediately.** A staged change you leave sitting is
  the #1 thing that gets lost. `git commit` includes *everything* staged — stage
  only the files for that commit.
- Prune dead worktrees (`git worktree prune` + `remove`). Removing a worktree
  folder does NOT delete its branch — unmerged work stays reachable by branch.

## 2. Migrations are the only source of truth for the database schema.

**What happened:** Core schema lived only in an untracked 60KB `remote_commit`
squash and in duplicate `support-management/SCHEMA-*.sql` files. The canonical
schema was briefly *not in git at all*.

**Rules:**
- `supabase/migrations/` is authoritative. No parallel `SCHEMA-*.sql` copies.
- **Commit the source of truth BEFORE deleting any duplicate of it.** Verify the
  thing you're keeping is actually tracked (`git ls-files`) first.
- Never hand-write a squashed dump. New change = `supabase migration new`.

## 3. `supabase db push` deploys ALL pending migrations, not just yours.

**What happened:** Other sessions left untracked/pending migrations in the
folder. A naive `db push` would have deployed their unfinished work to prod.

**Rules:**
- Before `db push`, run `supabase migration list` and check what's pending.
- If a pending migration isn't yours, set it aside (move out of the folder),
  push, then restore — or coordinate. Never blind-push.

## 4. Production + destructive work: back up, show, verify, then act.

**What happened:** A test-data wipe on the live DB. A cleanup SQL script appeared
that *another session* had written.

**Rules:**
- **Back up first** (`supabase db dump --data-only`) — a deletion with a backup
  is reversible; without one it's not.
- **Show before you delete.** Print exact row counts / the exact rows.
- **Verify a script's claims against real data** — especially one you didn't
  write. Don't trust "deletes only the 9 bot rows" until you've counted them.
- Prefer **soft-delete (archive)** over hard-delete for anything that's a record;
  keep a separate true-erasure path for genuine deletion requests.

## 5. Verify every deploy. Keep rollback one step away.

**Rules:**
- After deploying, **confirm from the system itself**: Worker → `wrangler tail`;
  Fly → `flyctl logs` for the "logged in as…" line; DB → re-query.
- Live services (the Discord bot) cut over with a fast swap + a documented
  rollback (repoint `Dockerfile`, redeploy). Worker/DB are untouched by a bridge
  deploy, so bridge rollback is clean.
- Typecheck/build **after any fan-out edit** — parallel agents editing different
  files introduced a stale-variable bug that `tsc` caught before commit.

## 6. One concept, one source of truth (in code and data).

**What happened:** Two admin tables (`admins` vs `admin_users`) represented the
same allow-list. `is_admin()` checked one; the UI wrote the other. A new admin
could sign in but every RPC rejected them. They only worked because the seed rows
happened to match.

**Rule:** when two tables/paths/flags mean the same thing, they *will* drift.
Consolidate to one, and route every reader/writer through it.

## 7. When you change what a system does, update what it says about itself.

**What happened:** Penny gained persistent memory but still told users "I won't
remember after this chat" — because her prompt never told her otherwise. Later,
admin analytics still described measuring deflection "once Dify logs every
conversation" long after Dify was dropped.

**Rule:** a capability change isn't done until the system's self-description
(prompts, docs, UI copy) matches the new behavior. Stale tool names in copy
(e.g. "Dify") are a tell that a surface drifted from reality.

## 8. Retention has a privacy cost — disclose it, and offer erasure.

**Rule:** retaining personal data (e.g. Discord chats after `/disconnect`) is a
product decision with legal weight. Keep records via archive, but (a) keep a real
erasure path, and (b) disclose retention in the privacy policy. Don't assert
GDPR/CCPA compliance in code comments — flag for legal review.

## 9. On UI feedback, verify what's actually live before re-tweaking.

**What happened:** A user repeatedly said "still same" after Templates-editor
restyles. Several of those were *already deployed* — the change was live but too
subtle to read, or the browser/CDN was serving a stale bundle. Time was burned
re-editing things that were already shipped.

**Rules:**
- When a visual change "doesn't show", **fetch the deployed asset and grep it**
  (`curl <site>/admin/ → find the hashed .css → curl it → grep the rule`) before
  assuming it didn't land. Confirm live ≠ confirm intended.
- The admin is auth-walled, so you can't screenshot it yourself. **Verify CSS
  against the *real* stylesheet** in a static harness served locally
  (`python -m http.server`, screenshot via preview tools) — not against an
  idealized hand-built mockup. A mockup approximates; only the real components +
  real rendered email reflect what the user sees.
- Subtle elevation (4%-opacity shadows) reads as "no change" on a near-white
  page. If the user asks for a *visible* difference, make it unmistakable
  (borderless float on a contrasting canvas) and verify the contrast.

## 10. Interactive OAuth can't be completed from the automated shell.

**What happened:** `cloudflared tunnel login` (browser cert-callback) failed
twice when launched from the detached Bash tool ("Failed to write the
certificate"), but worked instantly when the **user** ran it in their own
Terminal. Edge connectivity was fine — only the localhost callback needs a real
interactive session.

**Rule:** for any tool that needs a human browser-auth step (OAuth/SSO,
`cloudflared tunnel login`, device-code flows), hand the **single** interactive
command to the user and **script everything before and after it** (create,
route, config, launchd, verify). Don't loop retrying the login from automation.
Also: `timeout` is not installed on macOS — don't rely on it in host scripts.

## 11. Generate types from the LIVE schema — they catch drift `tsc` can't.

**What happened:** Two migrations were given the same timestamp
(`20260623150000`). Supabase tracks migrations by version, so it saw the version
as already applied and **silently skipped the second file** — `audit_runs` was
never created in prod, and the admin Quality dashboard read a table that didn't
exist. Nothing local revealed it; `tsc` was green against 47 hand-written row
interfaces. Running `supabase gen types` against the live DB and typing the
client surfaced it instantly (the table was missing from the generated schema).

**Rules:**
- **Never reuse a migration timestamp.** Duplicates collide on the version key
  and one file silently never runs. `supabase migration list` shows the
  collision as one applied + one perpetually pending.
- Keep `database.types.ts` generated from the live schema as the typed source of
  truth; hand-written row types drift without warning.
- An out-of-order pending migration (timestamp before the last applied one)
  needs `supabase db push --include-all`.

## 12. A scary-looking metric isn't a bug until you verify it against the data.

**What happened:** `support_tickets` showed ~1M sequential scans and got flagged
as a "missing index." But the table already had the right indexes — the scans
were Postgres correctly choosing a seq scan on an **empty (0-row) table**. Adding
an index would have done nothing.

**Rule:** before "fixing" a perf signal, confirm the cause against reality (row
counts, existing indexes, the query plan) — this applies to your own diagnoses,
not just scripts you didn't write (rule 4). Empty/tiny tables seq-scan by design
and switch to index scans once they grow.

## 13. A dev machine running local Ollama is production infra — a single point of failure.

**What happened:** "Draft with AI" and the signals scorer depended on Ollama on a
developer's Mac (via a Cloudflare Tunnel) — they only worked while that laptop
was awake, and the master secret vault lived only there.

**Rules:**
- Don't put a runtime the product depends on on a personal machine. Move LLM
  calls to a managed free tier — **Cloudflare Workers AI** (free daily
  allocation) replaced the Mac compose-server with no per-call cost.
- Workers AI gotchas: models get **deprecated** (pin a current one, e.g.
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`); `env.AI.run` returns a string for
  some models and an object for others; models emit **raw control chars** inside
  JSON strings — use `response_format: { type: "json_object" }` *and* a
  control-char repair pass before `JSON.parse`.
- When you can't take a local DB backup (no Docker/`pg_dump`/`psql` in the
  shell), say so — don't pretend one exists. Only proceed with a drop when the
  data is provably redundant and the live source is intact.
- **One source of truth for config, not per-file constants.** Site-wide strings
  (canonical URL, public contact email, company/product names, social links)
  live in `apps/web/src/lib/site.ts` (`SITE`); design values live in
  `packages/design-system/tokens.css`. Never hardcode them in a page/component —
  import the constant or token so a change happens once and applies everywhere.
  The public contact email is **always `founder@founderfirst.one`** (never a
  personal address). Company = **FounderFirst**, product = **Penny**; keep them
  distinct in copy.

## 14. A green build can still ship broken UI — guard the silent failure modes.

**What happened:** PR #66 accidentally truncated `apps/admin/src/styles/content.css`
and `signals.css` to **0 bytes**. `styles.css` still `@import`ed them, so the
bundler **silently skipped the empty files** — the build stayed green and
deployed, but every admin sub-tab (Analytics, Audience, Signals, Penny) rendered
as unstyled run-together text on prod. It went unnoticed until a user reported it.

**Rules:**
- **An `@import` of an empty or missing CSS partial is silently skipped, not an
  error.** Same for many bundler inputs — absence degrades quietly instead of
  failing loud. Don't assume "build passed" means "output is correct."
- **Guard the silent failure modes in CI, not just type/lint errors.** A guard
  exists: `pnpm check:css` ([scripts/check-css-imports.ts](scripts/check-css-imports.ts))
  walks every `@import` chain and fails if any relative partial is missing or 0
  bytes. It runs inside `pnpm build` and as an explicit step in
  [pages.yml](.github/workflows/pages.yml). Keep it; extend the pattern to the
  next silent failure you find.
- **Verify a deploy from the deployed artifact, not the source.** The bug was
  invisible in the repo (files looked fine in a stale checkout); it was only
  provable by fetching the live CSS bundle and grepping for the missing
  selectors. Inspect what prod actually serves (cf. rules 5 and 9).
- **Local `main` drifting behind origin masks the real state.** The broken build
  came from `origin/main` (40+ commits ahead of the local checkout); diagnosing
  against the stale local tree was misleading. `git fetch` and compare against
  `origin/main` before concluding what's deployed.

## 15. Read-then-write RPCs need a row lock, or concurrency corrupts silently.

**What happened:** The feature stress sweep found the *same* bug shape in four
SECURITY DEFINER functions — `reverse_journal_entry`, `recategorize_entry`,
`approve_journal_entry`, and the close-vs-post path. Each did a lock-free
`SELECT … INTO v_row` then mutated based on what it read. Two concurrent calls with
distinct idempotency keys (two tabs, a network retry, two CPAs) both read the stale
`posted` state and both acted: one entry got reversed 10 times from 14 API calls,
live on prod.

**Rules:**
- Any RPC that reads a row and then writes based on that read must take
  **`SELECT … FOR UPDATE`** (or `FOR SHARE` when you only need to block a specific
  conflicting writer, as `ensure_open_period` does against `close`). The check and
  the mutation must be in the same lock scope.
- Idempotency keys do **not** prevent this — distinct keys are exactly the concurrent
  case that slips through. Idempotency dedupes *retries of the same logical call*, not
  *two different calls racing the same row*.
- Add **defense-in-depth at the storage layer** where the invariant allows it (e.g.
  the partial unique index `(org_id, reverses_id)` making a second reversal of any
  original impossible regardless of the function). A lock protects the hot path; a
  constraint protects against the lock ever being wrong.
- When you fix one instance of a recurring shape, **grep for the shape** and fix all
  of them in the same wave — the reverse fix shipped while `approve` still had the bug.

## 16. "The trial balance still ties" does not mean the data is correct.

**What happened:** Every ledger P0 in the stress sweep (double-reversal,
double-categorize, close-vs-post) left `Σdebits = Σcredits` intact to the cent while
the underlying entries were wrong — an entry reversed twice nets its account to the
*negative* of the original, but each reversal is itself balanced, so the org-level
tie-out check sees nothing. The corruption was invisible to the one check we trusted.

**Rule:** a balanced trial balance is necessary but **not sufficient** evidence of
correctness. Verify the specific invariant the operation is supposed to preserve —
entry count delta (no double-post), one-reversal-per-original, category actually
changed once — not just that the books still balance. Silent-but-balanced is the most
dangerous failure mode because it passes the obvious test.

## 17. A fix deployed to prod but not merged to `main` is a loaded gun.

**What happened:** The period-lock (#131) and double-reversal (#139) fixes were
deployed straight to prod during stress testing (Nik authorized the hotfix) but their
migrations were never merged — timestamp collisions left them out of `main`. For two
days, `main` did not contain two live P0 fixes. A routine `supabase db push` from
`main` would have silently **re-deployed the vulnerable function bodies** over the
fixed ones. Worse, a later combined deploy of `approve_journal_entry` from a different
lineage **clobbered** #131's period-closed guard on prod.

**Rules:**
- **Builders never deploy; only the integrator deploys, and only from `main`.** If a
  fix must hotfix prod during testing, opening the PR that lands it on `main` is part
  of the *same* unit of work, not a follow-up.
- When you must deploy ahead of merge, **capture the exact live body back into a repo
  migration immediately** (`pg_get_functiondef`), and reconcile before the next
  `db push`. Prod and `main` drifting apart is the default outcome of overlapping
  sessions, not an exception — assume it and check (`pg_get_functiondef` vs. the repo).
- **Before deploying a function, snapshot the current prod body.** When sessions
  overlap, the body you're about to overwrite may itself contain another session's
  unmerged fix (this is exactly how the F2 guard got clobbered).

## 18. Any query that feeds a report or export must paginate.

**What happened:** `useEntries` fetched ledger rows with no pagination; prod PostgREST
caps a response at `max_rows=1000`. Orgs with >1000 entries silently lost their oldest
rows — the P&L / balance sheet still *tied* (rule 16 again) but showed the wrong
numbers. The GDPR export had the identical bug (truncated at 1000).

**Rule:** a `select` whose result is summed, reported, or exported must page through
**all** rows (`.range()` loop until exhausted), never rely on the default cap. Grep for
report/export-feeding selects when you touch that layer; the truncation is invisible
until an org crosses the limit.

## 19. Don't spawn a session per unit of work — orchestrate one run over many.

**What happened:** The stress program ran as ~15 separate long-lived sessions, one per
feature. It worked, but the *coordination* cost fell on the human: 15 PRs to track,
overlapping fixes to dedupe by hand (#132 and #139 fixed the same reverse P0 twice),
prod↔main drift to reconcile after the fact, and status scattered across chats until it
felt "lost." The failure wasn't the testing — it was that no single artifact owned the
whole run.

**Rules:**
- Prefer **one orchestrating session that fans out subagents/worktrees** over N
  independent sessions. The orchestrator holds the work-list, dedupes claims, sequences
  merges, and owns one status artifact. See the operating model in
  [docs/STRESS_TEST_TRACKER.md](docs/STRESS_TEST_TRACKER.md) → "Operating model".
- **One source of truth for run status** (a committed board + AUDIT.md ledger), updated
  as work lands — not reconstructed from memory afterward.
- **Every autonomous session has a hard timeout, a single task, and exits by opening a
  PR or a blocked-report** — never by committing to `main`, never by running open-ended
  (the 9×/night hardening cron leaked sessions → SIGBUS; see memory).

## 20. Some prod state lives outside git — when you change it, record it.

**What happened:** Every PR showed a red/neutral "Supabase Preview" check. It wasn't a
workflow in the repo — the **Supabase GitHub App** posted it because database
**Branching was enabled** on the project. On PRs touching `supabase/` it tried to spin
up an ephemeral preview branch, hit the plan's low concurrent-branch limit during the
multi-PR stress sweep, and came back `cancelled` → a red ✗. We never use preview
branches (migrations are manual — Rule 3), so it was pure noise that trained everyone to
ignore a red X. Fixed by disabling branching via the Management API
(`DELETE /v1/projects/{ref}/branches`) on **2 Jul 2026** — prod stayed `ACTIVE_HEALTHY`,
data untouched, branch list now empty.

**Rules:**
- **Config that gates or annotates PRs isn't always in `.github/`.** Dashboard
  integrations (Supabase GitHub App, Cloudflare, Vercel) post their own checks. If a
  check is failing and you can't find its workflow, inspect the check-run's `app` slug
  and `details_url` — that names the external owner.
- **A CI signal you can't act on is worse than no signal** — it normalises ignoring red.
  Remove or fix it, don't tolerate it.
- **A prod-config change made outside git leaves no diff.** Record it (here or in ops
  notes) with what changed, why, and how to reverse it — otherwise the next person can't
  tell intentional config from drift. **Current state: Supabase Branching is
  intentionally OFF** (re-enable only via Dashboard → Settings → Integrations → GitHub →
  Branching, if the manual-migration workflow ever changes).

---

*Add a numbered rule above when a mistake teaches a lesson worth not repeating.*

## Audit log

Dated findings from `/audit` runs, newest first. Each entry: the commit audited,
a short summary, and one line per P0/P1 marked **fixed** or **deferred**. When an
issue here keeps recurring, graduate it into a numbered rule above — that is how
we stop repeating it. The command lives at `.claude/commands/audit.md`.

### 30 Jun – 2 Jul 2026 · Feature stress-test sweep (baseline: `main` post-#122)
15 features adversarially stress-tested on live prod. Full ledger with per-feature
findings + coverage gaps: **[AUDIT.md](AUDIT.md) → Audit ledger**. Summary: **8 P0,
~19 P1** confirmed and fixed; 12/15 closed on `main`, #131 + #139 captured by #156,
#143 partial.

P0s (all fixed): forged-`p_actor` cross-tenant RPC writes (#138) · concurrent
double-reversal balance corruption (#139) · report truncation at 1000 rows (#129) ·
close-vs-post period-lock TOCTOU (#131) · double-reversal + double-categorize races
(#132) · QBO/Xero provider-commit dead-on-arrival (#142). Four cross-cutting themes
graduated into rules **15–18** above; the operating lesson into rule **19**.

**Deferred (standing coverage gaps, see AUDIT.md):** multi-currency, UI click-through,
isolation F3 (`can_access_org` seqscan DoS), CSV F4 re-import dedup (product decision),
load/volume testing.
