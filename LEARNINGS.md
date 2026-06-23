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

---

*Add a numbered rule above when a mistake teaches a lesson worth not repeating.*

## Audit log

Dated findings from `/audit` runs, newest first. Each entry: the commit audited,
a short summary, and one line per P0/P1 marked **fixed** or **deferred**. When an
issue here keeps recurring, graduate it into a numbered rule above — that is how
we stop repeating it. The command lives at `.claude/commands/audit.md`.

_No audits logged yet — the first `/audit` run writes here._
