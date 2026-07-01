# FounderFirst — feature stress-test program (tracker + operating model)

The durable audit **ledger** (findings, per-feature, coverage gaps) lives in
[AUDIT.md](../AUDIT.md) → "Audit ledger". This file is the **operating model + working
board**: how we run an audit and where each run currently stands.

**Track status two ways:** (1) this board (Tracker table below) · (2) GitHub → PRs
filtered `[stress:` / `[reconcile]`. Status is owned here, not reconstructed from chats.

---

## Operating model — how we run audits going forward (READ THIS FIRST)

**v1 (what we ran 30 Jun): 15 parallel sessions, one per feature.** It found real P0s,
but coordination fell on the human — 15 PRs to track, two sessions fixed the same P0
twice (#132/#139), prod↔main drift went unreconciled, status scattered until it felt
lost. See LEARNINGS #19.

**v2 (what we run now): ONE orchestrator that fans out subagents/worktrees.** The human
approves at three points only; everything else is the loop's job.

```
        ┌──────────────────────────────────────────────┐
        │  INTEGRATOR  (one session — this session)     │
        │  owns BACKLOG/board, dedupes claims,          │
        │  sequences merges, deploys, verifies, reports │
        └───────────────┬──────────────────────────────┘
          fan out (Workflow / Agent, ≤ N concurrent, worktree-isolated)
        ┌───────┴───────┬───────────────┬───────────────┐
     Finder×k        Verifier×k       Fixer            (read-only unless Fixer)
   probe feature   adversarially   fix in worktree,
   (neg/edge/       refute each     tsc+build+tests,
    concurrency/    finding         write-don't-deploy
    security)       (majority       migrations, PR
                    kills it)
```

**The loop, one feature at a time or fanned across many:**
1. **Finder** (read-only subagent) probes the feature per the COMMON RULES below →
   ranked findings with `file:line` + repro. Never mutates prod schema/fns.
2. **Verifier** (independent subagent, prompted to *refute*) adversarially checks each
   finding; majority-refute kills it. This is what stops plausible-but-wrong findings.
3. **Fixer** (worktree-isolated) fixes confirmed breaks, adds tests, `tsc`+build green,
   writes migrations **but does not deploy**, opens a PR.
4. **Integrator** (this session, human-checkpointed) reviews, sequences merges across
   shared files, deploys migrations-then-functions in one wave, **verifies from the
   system** (re-query / logs), updates AUDIT.md + this board, files follow-ups.

**Why this beats v1:** one artifact owns status; claims are deduped before work starts;
the verify step is built-in, not hoped-for; the integrator is the single deploy choke
point so prod↔main can't drift; the human sees one queue, not 15 chats.

### The three (and only three) human checkpoints
1. **Merge/deploy wave** — approve or run the integrator's batched merge+deploy. Can
   graduate to standing authorization once the loop earns trust (rollback always one
   step away). This is the irreducible prod gate (LEARNINGS #4, #5, #17).
2. **`decision-needed` items** — genuine product calls (e.g. CSV re-import dedup policy),
   surfaced by the integrator, never guessed by a builder.
3. **OAuth / consents / spend** — Plaid signup, Xero re-consent, paid keys (LEARNINGS #10).

Everything else — probing, verifying, fixing, testing, re-querying — runs without
approval. That is the point.

### How to physically launch it
- **Interactive / on-demand (this is the default):** the integrator session uses the
  **Workflow** tool to fan out finder→verifier→fixer stages (pipeline by default), or
  spawns **Agent** subagents with `isolation: "worktree"` for parallel fixes. One session,
  many agents — not many sessions.
- **Scheduled / overnight:** one `/schedule` routine per role (builder 22:00, red-team
  02:00, integrator 08:30, retro Sun) — full prompt packs and cadence in
  [FULL_BOOKKEEPING_ROADMAP.md](plans/FULL_BOOKKEEPING_ROADMAP.md) §4. Each routine has a
  **hard timeout, a single task, and exits by opening a PR or a blocked-report** — never
  commits to `main`, never runs open-ended (the 9×/night cron that leaked sessions →
  SIGBUS is why; LEARNINGS #19).
- **Fuel:** every feature/audit target is a spec card in
  [FULL_BOOKKEEPING_ROADMAP.md](plans/FULL_BOOKKEEPING_ROADMAP.md) §4.3 (or a row in the
  Tracker below for bug-hunt audits). A card with `decision-needed` is skipped by builders
  and surfaced to the human.

---

## COMMON RULES — every stress session follows these

- **Goal:** break the feature (negative inputs · edge cases · concurrency · failure
  injection · security), then fix confirmed breaks. Assume broken until proven.
- **Read first:** `docs/plans/ARCHITECTURE.md`, `CLAUDE.md`, `LEARNINGS.md`, the feature's
  files (below), and the relevant `supabase/{migrations,functions}`. Baseline shipped at
  `main` (pre-onboarding #1–#15 + design/a11y polish) — verify, don't re-flag.
- **Env:** prod ref `ejqsfzggyfsjzrcevlnq`; creds `~/.config/founderfirst/secrets.env`.
  Mint sessions via Auth admin API (magiclink → email_otp → /auth/v1/verify → JWT); create
  orgs via the `orgs` edge fn; mutate via the edge-fn write-path; inspect via PostgREST +
  Management API (UA header; large bodies `--data @file`).
- **🔒 ISOLATION (parallel sessions run — do not disturb them):** namespace ALL test data
  `[<TAG>]` with emails `…@<tag>.founderfirst.test`; operate ONLY on your own fixtures;
  every other org/user/row is **read-only / off-limits**; **no schema, migration, edge-fn
  deploy, grant, or config change during testing** (pure black-box); **DELETE NOTHING** —
  end with a fixture manifest + an un-run `cleanup.sql` + a before/after prod row-count diff.
- **OAuth/SSO:** the **human** does it — generate the URL, STOP, ask, resume.
- **Verify after every mutation:** per-entry Σdebit==Σcredit · org trial balance still ties
  to the cent · entry-count delta (no double-post) · `ledger_audit` row written · idempotent
  replays. **Any cross-tenant leak, ledger imbalance, double-post, orphaned reversal,
  secrets exposure, or silent failure = P0.**
- **Fix + PR:** fix confirmed breaks in YOUR worktree only; `tsc` + `vite build`. Migrations
  or edge-fn changes: write them but **do NOT deploy** — flag for the integrator. Extend
  pgTAP where relevant. Open a PR titled `[stress:<feature>] findings + fixes` with: a
  ranked findings report (PASS/FAIL · severity · repro · `file:line` · fix), the fixes, and
  the manifest + un-run `cleanup.sql`. **Do NOT merge.** If you touch a shared file
  (`Ledger.tsx`, `styles.css`, `tokens.css`, an edge fn, a migration) say so prominently.
- When done, update your **Status** + **PR** cell below.

---

## Tracker

| # | Feature | TAG | Key files | Wave | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Tenant isolation / RLS / IDOR | `ISOTEST` | org/ActiveOrgProvider, all supabase/functions, phase0 backbone | 1 | 🟢 deployed + captured on main (`20260701000000`) via #151 | [#138](../../pull/138) |
| 2 | Journal entries & reversals | `JETEST` | ledger/{Ledger,api,money}, ledger-entries, ledger-reverse, phase2 writepath | 1 | 🔵 **P0 fix live on prod** (combined w/ #131 wave) but NOT captured on main — merge to close drift; unique index blocked on `[JETEST]/[CATTEST]` dup purge | [#139](../../pull/139) |
| 3 | Financial reports tie-out | `RPTTEST` | ledger/reports.ts, ledger/Ledger.tsx | 1 | 🟢 merged (1000-row truncation fix, `.range()` paging) | [#129](../../pull/129) |
| 4 | Accounting periods | `PERIODTEST` | ledger/Ledger.tsx, ledger-periods, writepath (close/reopen) | 1 | 🔵 **F1–F3 deployed + verified on prod** but NOT captured on main (no `FOR SHARE` migration in repo) — merge to close drift; F4 resolved by #122 merge | [#131](../../pull/131) |
| 5 | Categorization + CPA feedback | `CATTEST` | ledger/Categorize, categorize fn, phase4 categorization+uncategorized | 1 | 🟢 merged; prod state captured via #148 reconcile | [#132](../../pull/132) |
| 6 | CSV / bank-statement import | `CSVTEST` | import/{ImportFlow,csv}, imports fn, phase3 import_batches | 2 | 🔵 F1 (calendar dates) + F2 (orphan batch) landed via #144; **left:** F3 delimiter auto-detect, `safe_to_date` migration, F4 re-import dedup (product decision) | [#143](../../pull/143) |
| 7 | Opening balances import | `OBTEST` | import/ImportFlow (OpeningBalances), commit_import_batch | 2 | 🟢 deployed via #149 fold + #153 client | [#135](../../pull/135) |
| 8 | Chart of accounts | `COATEST` | ledger/Ledger (Accounts), ledger-accounts, upsert_ledger_account | 2 | 🟢 deployed + captured (`20260701220000_coatest_coa_integrity`) via #153 | [#137](../../pull/137) |
| 9 | Auth, session & routing | `AUTHTEST` | App.tsx, auth/AuthProvider, routes/Login, lib/supabase | 2 | 🟢 merged | [#133](../../pull/133) |
| 10 | Invites & engagements | `INVTEST` | org/InviteCpa, routes/Accept, invites + invites-accept (accept_invite RPC) | 3 | 🟢 merged (+ `20260630160000` re-engage/no-demote) | [#134](../../pull/134) |
| 11 | CPA lens / access scope | `CPATEST` | lenses/CpaLens, role/engagement helpers | 3 | 🟢 deployed (org-settings RPC/fn live; UI via #153) | [#141](../../pull/141) |
| 12 | QBO / Xero connect & sync (human OAuth) | `SYNCTEST` | import/ImportFlow (Connect), qbo-*/xero-* fns, _shared/{qbo,xero}, external_connections | 3 | 🟢 deployed (connector fns live; routing folded via #149) | [#142](../../pull/142) |
| 13 | Onboarding & org creation | `ORGTEST` | org/CreateOrg, ActiveOrgProvider, routes/Home, orgs fn | 3 | 🟢 deployed (`20260701140000_org_create_atomic`; UI via #153) | [#136](../../pull/136) |
| 14 | Data export & erasure (GDPR) | `GDPRTEST` | org-data fn, ledger_audit | 3 | 🟢 deployed (paginated export live, captured via #151) | [#130](../../pull/130) |
| 15 | Platform-staff / break-glass / admin tiers | `STAFFTEST` | staff/StaffHome, staff/api, phase5 staff, admin_roles_tiers, rpc_editor_gate | 3 | 🟢 deployed (`20260701130000_break_glass_editor_gate`) via #151 | [#140](../../pull/140) |

**Status legend:** ⬜ not started · 🟡 testing · 🔵 PR open (awaiting integrator) · 🟢 merged + deployed.

---

## Where we stand — snapshot 1 Jul 2026

**All 15 features tested. 12 of 15 fully closed (fixes live on prod AND captured on `main`).**
Reconcile wave #148/#149/#151/#153 captured prod drift into repo migrations
(`20260701200000`–`20260701230000`) and deployed the remaining client fixes.

### Open work (3 PRs + hygiene)

1. **[#131 periods](../../pull/131) — merge to `main`.** The period-lock fixes (close-vs-post
   TOCTOU `FOR SHARE`, approve-into-closed, reverse-after-close) are **live on prod** but the
   migration was never merged — a fresh `db push` from `main` would **regress a P0**.
   ⚠️ Timestamp collision: its `20260630100000` is now taken by `org_settings_seed` — renumber
   on rebase.
2. **[#139 journal](../../pull/139) — merge to `main`.** Same story: the `reverse_journal_entry`
   `FOR UPDATE` lock is live on prod (deployed combined with the #131 wave) but not in the repo.
   Its `20260630130000` collides with `account_parent_cycle_guard` — renumber. The
   defense-in-depth **unique index is NOT deployed** — purge `[JETEST]`/`[CATTEST]` duplicate
   reversals first (dup scan query in the PR body).
3. **[#143 csv](../../pull/143) — partial.** F1 (impossible-date) + F2 (orphan draft batch)
   already landed on `main` via #144. Still open: **F3** delimiter auto-detect (`;`/tab EU
   exports import nothing), the `safe_to_date` defense-in-depth migration (write-don't-deploy),
   and **F4** re-import double-post dedup — a **product decision** for Nik.
4. **Test-data cleanup.** Every session left an **un-run** `cleanup.sql` + manifest under
   `docs/stress/<feature>/` — stress fixtures are still in prod. Run them (scoped to exact
   namespaced ids) once #131/#139 land.

### Known gaps / not covered

- **Multi-currency** — blocked by design (single-currency guard); untested beyond the guard.
- **Periods UI click-through** — API-level round-2 passed (15/17 edge + 7/7 negative); browser
  walk not done.
- **Isolation F3** — `can_access_org` SECURITY DEFINER per-row seqscan on `journal_lines`
  (anon GET times out ≈3s) = DoS surface; flagged, not fixed.
- **#146** (categorize multi-model validation, Phase A) is follow-on feature work, not a
  stress finding.

**Integrator (main session):** reviews each `[stress:*]` PR, sequences merges (shared-file
conflicts), verifies + deploys, updates Status → 🟢. Deep per-feature scenario lists live in
the prompt pack handed to each session.
