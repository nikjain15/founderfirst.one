# FounderFirst — feature stress-test program (tracker + operating rules)

One **session per feature**, each in its own git worktree, that adversarially stress-tests
the feature on live prod, then **fixes the breaks and opens a PR** (does NOT merge). The
**integrator** (main session) reviews each PR, sequences merges so shared files don't
collide, verifies, and deploys in waves.

**Track status three ways:** (1) GitHub → Pull Requests filtered `[stress:` · (2) this
table · (3) the per-feature chats/sessions.

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
| 1 | Tenant isolation / RLS / IDOR | `ISOTEST` | org/ActiveOrgProvider, all supabase/functions, phase0 backbone | 1 | ⬜ not started | |
| 2 | Journal entries & reversals | `JETEST` | ledger/{Ledger,api,money}, ledger-entries, ledger-reverse, phase2 writepath | 1 | ⬜ | |
| 3 | Financial reports tie-out | `RPTTEST` | ledger/reports.ts, ledger/Ledger.tsx | 1 | ⬜ | |
| 4 | Accounting periods | `PERIODTEST` | ledger/Ledger.tsx, ledger-periods, writepath (close/reopen) | 1 | ⬜ | |
| 5 | Categorization + CPA feedback | `CATTEST` | ledger/Categorize, categorize fn, phase4 categorization+uncategorized | 1 | ⬜ | |
| 6 | CSV / bank-statement import | `CSVTEST` | import/{ImportFlow,csv}, imports fn, phase3 import_batches | 2 | ⬜ | |
| 7 | Opening balances import | `OBTEST` | import/ImportFlow (OpeningBalances), commit_import_batch | 2 | ⬜ | |
| 8 | Chart of accounts | `COATEST` | ledger/Ledger (Accounts), ledger-accounts, upsert_ledger_account | 2 | ⬜ | |
| 9 | Auth, session & routing | `AUTHTEST` | App.tsx, auth/AuthProvider, routes/Login, lib/supabase | 2 | ⬜ | |
| 10 | Invites & engagements | `INVTEST` | org/InviteCpa, routes/Accept, invites + invites-accept (accept_invite RPC) | 3 | ⬜ | |
| 11 | CPA lens / access scope | `CPATEST` | lenses/CpaLens, role/engagement helpers | 3 | ⬜ | |
| 12 | QBO / Xero connect & sync (human OAuth) | `SYNCTEST` | import/ImportFlow (Connect), qbo-*/xero-* fns, _shared/{qbo,xero}, external_connections | 3 | ⬜ | |
| 13 | Onboarding & org creation | `ORGTEST` | org/CreateOrg, ActiveOrgProvider, routes/Home, orgs fn | 3 | ⬜ | |
| 14 | Data export & erasure (GDPR) | `GDPRTEST` | org-data fn, ledger_audit | 3 | ⬜ | |
| 15 | Platform-staff / break-glass / admin tiers | `STAFFTEST` | staff/StaffHome, staff/api, phase5 staff, admin_roles_tiers, rpc_editor_gate | 3 | 🔵 PR open | _see PR `[stress:staff] findings + fixes`_ |

**Status legend:** ⬜ not started · 🟡 testing · 🔵 PR open (awaiting integrator) · 🟢 merged + deployed.

**Integrator (main session):** reviews each `[stress:*]` PR, sequences merges (shared-file
conflicts), verifies + deploys, updates Status → 🟢. Deep per-feature scenario lists live in
the prompt pack handed to each session.
