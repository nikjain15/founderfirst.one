# [stress:chart-of-accounts] COATEST — findings + fixes

Black-box adversarial stress test of the **Chart of Accounts** write-path on **live
prod** (ref `ejqsfzggyfsjzrcevlnq`), per `docs/STRESS_TEST_TRACKER.md` COMMON RULES.
TAG `COATEST`. All test data namespaced `[COATEST]` / `@coatest.founderfirst.test`;
this session **deleted nothing** (see `cleanup.sql`, un-run).

Surface: `apps/app/src/ledger/Ledger.tsx` (Accounts) · `supabase/functions/ledger-accounts`
· `upsert_ledger_account` (phase2 writepath) · `apps/app/src/ledger/reports.ts` · `money.ts`.

## What we crashed

**A single chart-of-accounts row can take the whole books offline, and one tenant
could wire its accounts into another tenant's.**

1. **Bad currency crashes the Accounts tab and every report (P1, F4).** The write-path
   never validated `currency`. `char(3)` happily stores `US$`, `$$$`, or `1` (padded
   `1  `) — none of which are ISO-4217-shaped. The UI renders every account and report
   row through `Intl.NumberFormat({currency})`, which **throws `RangeError` on a
   malformed code**. One such account → the Accounts tab and any report touching it
   throw → the React error boundary swallows the books. **Reproduced live:** created
   `[COATEST] crashccy` with `currency:"US$"` → HTTP 201; `Intl.NumberFormat` confirmed
   to throw on `US$`/`$$$`/`12 ` (node repro in the transcript).

2. **Cross-tenant parenting (P1, F5).** `parent_id` was never scoped to the actor's org.
   Org A set its account's `parent_id` to **org B's** account → **HTTP 200**. That is a
   cross-tenant dangling reference: (a) a latent read-leak the moment any rollup report
   joins `parent_id` un-scoped, (b) a cross-tenant **delete-DoS** (B can't delete its own
   account while A's FK points at it), and (c) it defeats the cycle guard, whose chase is
   org-scoped (`... and org_id = new.org_id`) and so goes blind across tenants. Borderline
   P0 by the rules' "any cross-tenant = P0" language; rated P1 as there is no *current*
   read path that surfaces B's row to A.

3. **Source ↔ prod drift on the cycle guard (P1, F7).** Prod enforces a cycle trigger
   (`ledger_accounts_no_cycle` → `assert_account_no_cycle()`) that exists in **no repo
   migration** (`grep` across `supabase/` is empty). A rebuild-from-source silently loses
   cycle protection. Folded into the repo here so source == prod and the guard is versioned.

The core ledger held: **books tied to the cent through every mutation** (Σdebit = Σcredit
= 100000, net = 0, no unbalanced entry, no double-post), cross-tenant *writes* (create /
edit) were blocked 403, and 8 concurrent same-code creates produced **exactly one row**.

## Ranked findings

| ID | Sev | Title | Repro (live) | Verdict |
|----|-----|-------|--------------|---------|
| F4 | **P1** | `currency` unvalidated → malformed code (`US$`,`$$$`,`1 `) stored, `Intl.NumberFormat` throws → Accounts tab + reports crash | create acct `currency:"US$"` → 201; `formatMoney(…, "US$")` → RangeError | **FAIL→fixed** |
| F5 | **P1** | `parent_id` not org-scoped → org A parents under org B (cross-tenant ref / DoS / latent leak / cycle-guard bypass) | edit A's child `parent_id`=B's acct → 200 | **FAIL→fixed** |
| F7 | **P1** | Cycle trigger exists on prod but in no repo migration (drift) | prod rejects cycle (23514); repo grep empty | **FAIL→folded in** |
| F6 | P2 | Cross-type re-parent allowed (asset under income) → wrong rollups | edit child `parent_id`=income acct → 200 | **FAIL→fixed** |
| F8 | P2 | Archive an account with non-zero balance allowed → vanishes from COA but balance stays in reports → COA ≠ statements | archive Cash (bal 100000) → 200 | **FAIL→fixed** |
| F9 | P2 | Change `type` of an account with posted entries → retroactively reclassifies historical P&L/BS; tie-out can't catch | income→expense on posted acct → 200 | **FAIL→fixed** |
| F12 | P2 | COA mutations (rename/recode/re-parent/re-type/archive) write **no** `ledger_audit` row | 0 `account.*` actions in audit | **FAIL→fixed** |
| F3 | P3 | `code` length/format unvalidated (5,000-char code accepted) | create acct `code:"9"*5000` → 201 | **FAIL→fixed** |
| F1 | P3 | Raw Postgres errors leaked to client (constraint/column names, `character(3)`) | dup code → `…unique constraint "ledger_accounts_org_id_code_key"` | **FAIL→fixed** |
| F2 | P3 | Account `name` stored unescaped (`<script>…`) | create acct name `<script>alert(1)</script>` → 201 | **Doc-only** (React escapes; see below) |

### Verified PASS (working as designed — not re-flagged)

- Bad `type` enum rejected (`bad_type`, 400) · oversized name >120 rejected (`bad_name`).
- **Post to an archived account rejected** (`post_journal_entry` step 4, `is_archived=false`).
- Cross-tenant **create** (403) and **edit** (403 / `not_found`) both blocked.
- Self-parent + ancestor-under-descendant **cycles** rejected (prod trigger, 23514).
- Nonexistent `parent_id` rejected (FK 23503); duplicate `code` rejected (unique 23505).
- **8× concurrent** same-`code` creates → exactly **1** row (no double-insert).
- Rename after posting → identity stays the `id`; reports show the current name — correct.
- Books tie-out preserved across archive/retype/reparent (tie-out is type-agnostic).
- Note: `20260630070000_single_currency_guard.sql` guards **journal-line** currency only;
  `ledger_accounts.currency` (the field that crashes the UI) was still free — F4 is distinct.

### F2 rationale (doc-only)
React escapes interpolated text, so `<script>` in a name is inert in the app. Capping/
stripping it risks rejecting legitimate names (`AT&T`, `R&D <2024>`). The real exposure
is **non-React export surfaces** (email digests, CSV/PDF reports) — those must HTML/CSV-
escape account names at render. Flagged for the export feature owners, not fixed here.

## Fixes (this PR)

> ⚠️ **Shared files touched** — integrator please sequence/merge carefully:
> `money.ts`, the `ledger-accounts` edge function, and a **new migration**.
> Migration + edge-fn are **WRITE-BUT-DON'T-DEPLOY** per program rules — flagged below.

1. **`supabase/migrations/20260630130000_coatest_coa_integrity.sql`** *(NEW — do NOT deploy; integrator applies)*
   - Hardens `upsert_ledger_account`: parent must be **same org + same type** (F5/F6);
     **type locked** once the account has posted lines (F9); **archive blocked** unless the
     account nets to zero (F8); currency **normalized + shape-validated** (F4); writes a
     `ledger_audit` row `account.create|update|archive` (F12).
   - Folds in `assert_account_no_cycle()` + `ledger_accounts_no_cycle` trigger (F7 drift).
   - Adds table CHECK `ledger_accounts_currency_iso` (`^[A-Z]{3}$`, `NOT VALID` so it
     applies cleanly on existing rows). After cleanup the integrator may `VALIDATE` it.
   - **Safe for importers:** QBO/Xero/categorize call `upsert_ledger_account` create-only
     (no `p_id`/`p_parent_id`/`p_currency`), so no new path is restricted.
2. **`supabase/functions/ledger-accounts/index.ts`** *(edge fn — do NOT deploy; integrator deploys)*
   - Validate `currency` shape (`^[A-Z]{3}$`, upper-cased) → `bad_currency` (F4); bound
     `code` to 32 chars → `bad_code` (F3); **map raw PG errors** to friendly, leak-free
     codes (`code_in_use`/`bad_parent`/`value_too_long`; unknown → `request_failed`) (F1).
3. **`apps/app/src/ledger/money.ts`** *(client — defense in depth)*
   - `formatMoney`/`formatMoneyShort` never throw: on a bad currency they fall back to
     `"<CODE> 12.34"` so a single legacy bad row can't crash the books (F4).
4. **`supabase/tests/coatest_coa_integrity_test.sql`** *(NEW pgTAP, 12 assertions)* — covers
   F4/F5/F6/F7/F8/F9/F12 + valid-parent + zero-balance-archive + rename-after-post.

**Build:** `apps/app` → `tsc --noEmit && vite build` ✓ (exit 0). Edge fn → `deno check` ✓.
pgTAP authored to the phase-2 fixture style (local `supabase test db` not wired in this
worktree; integrator runs it in CI alongside the migration).

## Fixtures & cleanup
See `MANIFEST.md` (exact rows) and `cleanup.sql` (un-run). Global prod row-counts moved
a lot between the before/after snapshots (entries +39.7k, orgs +65) — that is the **other
parallel stress sessions**, not COATEST. COATEST's own footprint: **2 orgs, 2 users, 17
accounts, 1 entry, 2 lines, 1 audit row.**
