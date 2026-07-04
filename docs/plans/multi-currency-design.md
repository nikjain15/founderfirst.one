> Status: DRAFT — awaiting Nik sign-off · 2026-07-03 · Owner: Nik

# Multi-currency — design plan (W5.4)

Plan only. No code, no migration. This doc surfaces the model and the decisions
Nik must make before any multi-currency build begins.

The pilot is deliberately **single-currency** today, gated by an explicit trigger
(cited below). This plan describes what it takes to lift that gate safely, keeping
the ledger's core promise intact: **books balance, closed periods stay locked,
corrections are reversing entries, money is integer minor units — never float**
(ARCHITECTURE.md §6.1, LEARNINGS #16/#18).

---

## 1. Goal & non-goals

**Goal.** Let an org keep books in a **base (home) currency** while recording
transactions denominated in **other currencies** (a USD-books business that
invoices a UK customer in GBP, holds a EUR bank account, or pays a foreign
vendor). Every foreign-currency amount is carried at its **transaction amount**
*and* its **base-currency equivalent**, so all reports (P&L, balance sheet, trial
balance, AR aging, exports) present in one base currency and tie to the cent —
while FX-only movements post to dedicated **realized / unrealized FX gain-loss**
accounts.

**Non-goals (explicitly out of scope for the first build):**

- **Multi-base / reporting-currency translation** (a group consolidating
  subsidiaries with different functional currencies into a presentation
  currency). One org = one base currency, fixed at setup.
- **Changing an org's base currency after it has posted entries.** Base currency
  is immutable once books exist (a later, separate migration job if ever needed).
- **Crypto / >2-minor-digit currencies** beyond ISO-4217's own `minor_unit`
  (JPY = 0 dp, USD = 2 dp, BHD = 3 dp) — see Decision D2 on minor-unit precision.
- **Real-time / intraday rate feeds.** Daily granularity is the target (Decision D3).
- **Automatic hedging, forward contracts, or derivative accounting.**
- **Retroactive multi-currency for existing single-currency orgs' history** — the
  gate lift is additive; historical entries stay as posted.

---

## 2. Where single-currency is baked in today (cited)

The schema was built *currency-aware from day one* (ARCHITECTURE.md §12.4:
"store `currency` from day one; assume one currency per org for the pilot"), then
a hard gate was added on top. The pieces:

**a) The gate — one trigger blocks every non-home line.**
`supabase/migrations/20260630070000_single_currency_guard.sql` adds
`assert_line_home_currency()` (lines 13–27) and the `journal_lines_home_currency`
trigger (lines 29–32): any `journal_lines` row whose `currency` differs from the
org's `home_currency` raises `currency_unsupported`. Its own follow-up note
(lines 34–36) already sketches the lift: *"when real multi-currency support is
built, drop this trigger and make reports.ts partition every total by currency…
mirroring the per-currency DB balance trigger."* **This is the single load-bearing
gate; lifting it is the crux of the build.**

**b) Schema is already currency-tagged, but has no base-equivalent column.**
`supabase/migrations/20260628160000_phase2_ledger_core.sql`:
- `org_accounting_settings.home_currency char(3) not null default 'USD'` (line 29)
- `ledger_accounts.currency char(3) not null default 'USD'` (line 43)
- `journal_lines.amount_minor bigint` (line 92) + `currency char(3)` (line 93)

There is **no `base_amount_minor` and no `fx_rate` column** on `journal_lines` —
today `amount_minor` *is* the base amount because line currency == home currency.
That identity is exactly what multi-currency breaks.

**c) The balance trigger is already per-currency — a strength.**
Same file, `assert_entry_balanced()` (lines 105–124): it groups lines by
`currency` and requires Σdebits = Σcredits **within each currency**. This is
correct for multi-currency *transaction* balance, **but** an entry with lines in
two currencies that each balance in their own currency will **not** balance in the
base currency after conversion — that residual is precisely the FX line (see §5).
So the per-currency trigger stays; a **new base-currency balance check** is added
alongside it.

**d) The write-path defaults line currency to home and doesn't carry a rate.**
`supabase/migrations/20260629125000_phase2_ledger_writepath.sql`: `post_journal_entry`
reads `home_currency` (line 214), defaults each line's currency to home
(`coalesce(l->>'currency', v_home_ccy)`, line 267), inserts `journal_lines` with
`amount_minor, currency` only (line 265) — **no rate, no base amount**. The
"balanced (belt)" early check (lines 241–242) explicitly notes it's the
single-currency common case. The reconcile/reversal copy in
`20260702000000_reconcile_period_journal_locks.sql` (lines 132–133) copies
`currency` verbatim — fine, but also carries no base amount.

**e) Reports sum `amount_minor` across all lines with no currency partitioning.**
`apps/app/src/ledger/reports.ts` `accountBalances()` (lines ~40–48) does
`cur.debit += l.amount_minor` / `cur.credit += l.amount_minor` for every line
regardless of `l.currency`. Today that's safe (all lines are home currency); with
mixed currencies it would **add GBP cents to USD cents** — a silent
wrong-number bug of exactly the LEARNINGS #16/#18 class ("balanced but wrong").
Every report builder in this file, plus AR aging (line ~525) and cash flow, has
the same shape.

**f) Formatting is single-currency-defaulted.**
`apps/app/src/ledger/money.ts`: `formatMoney(minor, currency = "USD")` and
`formatMoneyShort` default to USD (lines 6, 19). `decimalToMinor` assumes **2
minor digits** (line 40 rejects >2 fractional digits) — correct for USD/GBP/EUR,
wrong for JPY (0) and BHD/KWD (3). See Decision D2.

**g) Invoicing carries currency but no rate.**
`supabase/migrations/20260706070000_*.sql`: `invoices.currency char(3)` (line 56),
`create_invoice`/`p_currency` defaults to home (lines 202, 228–229). It posts
Dr AR / Cr Revenue at `total_minor` in that currency (lines 322–323). Under the
gate, a non-home invoice is impossible; lifting it means AR is now a
**foreign-currency monetary balance** that must be revalued at period end (§5,
unrealized FX). `apply_invoice_payment` (line 336+) posts Dr Cash / Cr AR at the
payment `amount_minor` with **no notion of a rate difference** between invoice
date and payment date — that difference is realized FX (§5).

**h) Payouts carry currency but no rate.**
`supabase/migrations/20260706060000_*.sql`: `record_payout` derives `v_ccy` from
`home_currency` (lines 218–219) and stamps every component line with it
(lines 227–251). A foreign-currency payout would need base conversion per line.

**i) ISO shape is validated, value is not.**
`supabase/migrations/20260701220000_coatest_coa_integrity.sql` adds
`ledger_accounts_currency_iso` CHECK `currency ~ '^[A-Z]{3}$'` (line 69, NOT VALID)
and normalizes in `upsert_ledger_account` (lines 95–99). So `char(3)` is
shape-guarded but there is **no currency reference table** (no `minor_unit`, no
"is this a real ISO-4217 code"). Multi-currency wants a small seeded currency
catalog (Decision D2).

**Good precedents to reuse.** Idempotent well-known accounts already exist:
`resolve_opening_balance_equity` (`20260629160000_*.sql` line 98) and
`resolve_uncategorized_account` (`20260629200000_*.sql` line 21). The FX gain/loss
accounts should be resolved the **same way** — one function per org, idempotent,
service-role-only grants.

---

## 3. Base vs. transaction currency model

Two amounts on every line, one rate that produced them:

- **Transaction currency** = what the money actually is (GBP 100.00).
  Stored today: `journal_lines.amount_minor` (magnitude) + `currency`.
- **Base currency** = the org's `home_currency`, the single currency all reports
  present in. **New:** `base_amount_minor bigint` on each line.
- **Rate & provenance. New:** `fx_rate numeric` (base per 1 transaction unit) +
  `fx_rate_source text` + `fx_rate_date date` on each line (or a reference to a
  snapshot row — Decision D3). When line currency == base, `fx_rate = 1`,
  `base_amount_minor = amount_minor` — preserving today's identity for all
  existing rows (back-fill trivially).

**Two balance invariants (both enforced):**
1. **Per-transaction-currency balance** — the existing `assert_entry_balanced()`
   trigger, unchanged. Each currency's debits = credits.
2. **Base-currency balance — NEW.** Σ `base_amount_minor` (D) = Σ (C) across the
   *whole entry*. A two-currency entry balances per-currency but its base
   equivalents won't net to zero unless an **FX line** absorbs the residual (§5).
   This is where the FX gain/loss account enters the entry.

**Rounding discipline.** `base_amount_minor` is computed with **integer math**
(`round(amount_minor * fx_rate)` at the minor-unit grain), never float on dollars
— consistent with `money.ts` `decimalToMinor` and ARCHITECTURE §6.1. The rounding
residual across a multi-line entry is folded into the FX line so base balance is
**exact to the cent** (LEARNINGS #16 — tie the specific invariant, not just "it
balances").

---

## 4. FX-rate source — options & tradeoffs

The constraint from LEARNINGS #13: **don't put a runtime dependency on a personal
Mac or a paid per-call API.** Prefer existing-stack / free-tier, and treat rates
as **data (seed/snapshot)** the way the tax kernel treats law — effective-dated,
auditable, reproducible.

| Option | How | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Manual rate per transaction** | User/Penny enters the rate when a foreign line is posted; stored on the line | Zero infra, zero cost, always available, matches how many small businesses actually book FX (bank's rate on the statement) | Burden on user; inconsistent rates; no period-end revaluation source | **Ship first.** Lowest risk, unblocks the common case |
| **B. Daily snapshot table (`fx_rates`)** | A scheduled job (existing CF Worker cron pattern, cf. `gsc-proxy`/`geo-probe`) pulls a free daily rate set once/day into an effective-dated Supabase table; write-path looks up by (currency, date) | Rates are **data-as-seed** (auditable, reproducible, effective-dated like the kernel); one fetch/day = free tier; enables automatic period-end revaluation; offline-safe (reads the table, not a live API) | Needs a free daily source (see below); a stale day falls back to last-known or manual | **Ship second.** The right long-term model |
| **C. Live rates API per transaction** | Call an FX API at post time | Freshest | Per-call cost or key; **runtime SPOF** (LEARNINGS #13); non-reproducible (rate changes between two identical posts) | **Reject** as the primary path |

**Recommended shape:** **A then B**, with B's `fx_rates` table as the source of
truth and A as the always-available override. The write-path resolves a rate in
this order: explicit rate on the call → `fx_rates` snapshot for the line's date →
error asking for a manual rate (never silently default to 1 for a foreign line).

**Free daily source options for B (Decision D3):** ECB's daily reference rates
(EUR-base, public, no key — re-base arithmetically to the org's home currency) is
the strongest free candidate; a keyed free-tier provider (e.g. a rates API's free
plan) is the fallback. **This choice is Nik's** — it has cost/ToS implications.
Whatever is chosen, the snapshot is stored so the *system* owns the rate history,
not the vendor.

---

## 5. Realized vs. unrealized FX gain/loss

Two well-known accounts, resolved idempotently per org (mirroring
`resolve_opening_balance_equity`):

- **Realized FX gain/loss** (income/expense) — recognized when a foreign monetary
  balance is **settled** and the settlement rate differs from the booking rate.
- **Unrealized FX gain/loss** (income/expense) — recognized at **period close**
  when open foreign monetary balances (foreign AR/AP, foreign cash) are
  **revalued** to the period-end rate.

**Realized — timing & posting.** When `apply_invoice_payment` settles a
foreign-currency invoice: AR was booked at the invoice-date rate; cash arrives at
the payment-date rate. The base-currency difference is the realized gain/loss.
Posting (all base amounts): Dr Cash (payment-date base) / Cr AR (invoice-date
base) / **Dr or Cr Realized FX** for the residual so the entry's base balance is
exact. The transaction-currency lines still balance in the foreign currency
(§3 invariant 1); the FX line lives **only in the base leg**.

**Unrealized — timing & posting.** At period close, a revaluation run walks every
open foreign monetary balance, computes the base value at the period-end rate vs.
its carried base value, and posts an **adjusting entry** Dr/Cr the monetary
account / Cr/Dr Unrealized FX. Common practice **reverses** the unrealized
adjustment at the start of the next period (so realized recognition isn't
double-counted) — this fits our discipline perfectly: **the reversal is a
first-class reversing entry** (LEARNINGS #15/#16), never an edit. Decision D4
covers whether we auto-reverse or carry.

**Append-only / reversal discipline (non-negotiable).** FX entries obey every
existing rule: immutable lines, corrections are reversing entries, period-close
locks respected (a revaluation posts *into* the closing period as part of close,
guarded by the close-vs-post lock, LEARNINGS #15), idempotency keys on the
revaluation run so a retry can't double-post (and note #15: distinct keys don't
protect a race — the revaluation run takes the same `FOR UPDATE` discipline).

**Which balances are monetary?** Only monetary items revalue (cash, AR, AP, loans);
non-monetary (fixed assets, prepaid, equity, most revenue/expense already
recognized) are **not** revalued. The revaluation run must classify by account
type + a monetary flag — Decision D5.

---

## 6. Presentation & ties-to-cent

- **Reports present in base currency only** (P&L, balance sheet, trial balance,
  cash flow, AR aging, exports). `reports.ts` sums switch from `amount_minor` to
  **`base_amount_minor`** — one-line-per-builder change that fixes the §2e
  add-across-currencies bug. Trial balance ties in base because every entry's base
  leg balances (§3 invariant 2).
- **Transaction detail shows both:** the foreign amount ("£100.00") and its base
  equivalent ("≈ $128.40 @ 1.284") on the ledger row, invoice, and payout views.
- **`money.ts`** formats each amount in **its own** currency (the `currency`
  param already exists; callers must stop relying on the USD default). Compact
  KPI tiles present base.
- **AR aging & foreign balances** show the foreign face value *and* the base
  carrying value; a "revalued at period end" note where applicable.
- **Ties-to-cent guard (test discipline).** New reports tests assert base-currency
  trial balance ties **and** per-currency sub-balances tie, with a mixed-currency
  fixture (LEARNINGS #16: verify the specific invariant, not just "balanced").

---

## 7. Migration shape — additive & backward-compatible

All changes are **additive**; single-currency orgs are unaffected until they opt
in. Reserved timestamp range assigned at build time (LEARNINGS #24).

1. **New columns, nullable-then-backfilled.** `journal_lines.base_amount_minor
   bigint`, `fx_rate numeric`, `fx_rate_source text`, `fx_rate_date date`.
   Back-fill existing rows: `base_amount_minor = amount_minor`, `fx_rate = 1`
   (line currency == home for all history). Then set NOT NULL / defaults.
2. **`fx_rates` snapshot table** (Option B): `(base_currency, quote_currency,
   rate numeric, as_of date, source text)`, effective-dated, unique on
   `(quote_currency, as_of, source)`. RLS/grants like other global reference data.
3. **Optional `currencies` catalog** (Decision D2): ISO-4217 code → `minor_unit`,
   name; seeded pure-SQL (no `\i`, LEARNINGS #24).
4. **`resolve_realized_fx_account` / `resolve_unrealized_fx_account`** — idempotent
   per-org, service-role-only (clone `resolve_opening_balance_equity`).
5. **New base-balance deferred trigger** alongside `assert_entry_balanced` (do
   **not** modify the existing per-currency trigger — LEARNINGS #6, one concept).
6. **Rewrite the write-path** (`post_journal_entry` and the reconcile/reversal
   copy) to accept/resolve `fx_rate`, compute `base_amount_minor` with integer
   math, and fold the rounding residual + cross-currency FX into the base leg.
   Keep the `FOR UPDATE` locks (LEARNINGS #15).
7. **Drop the gate** `journal_lines_home_currency` **last**, only when 1–6 land and
   reports partition by base (LEARNINGS #17 — the fix must be complete on `main`
   before the gate comes down, or a redeploy re-exposes wrong sums).
8. **Period-close revaluation** run (its own function + idempotency + lock).
9. **App reports/money/UI** changes ship in the same PR as the doc flip
   (LEARNINGS #7 — update what the system says about itself).

Deploy order (LEARNINGS #23): migrations via Management API → edge fns →
verify the base-balance trigger + a mixed-currency post from the response body →
**then** drop the gate. Migration ledger stays in sync (LEARNINGS #11, #17).

---

## 8. Decisions Nik must make

- **D1 — Scope of "multi".** Confirm: one immutable base currency per org, foreign
  *transactions* only (no multi-base consolidation, no base-currency change). This
  plan assumes yes.
- **D2 — Currency precision & catalog.** Do we support currencies with ≠2 minor
  digits (JPY 0, BHD/KWD 3)? If yes, we add a `currencies` catalog with
  `minor_unit` and generalize `money.ts` `decimalToMinor` (today hard-2-dp). If
  no, we restrict to 2-dp currencies and say so.
- **D3 — Rate source.** Approve the sequence **manual (A) first, daily snapshot (B)
  second**, and pick B's free source (ECB daily reference rates recommended vs. a
  keyed free-tier API). Live-per-call (C) is rejected — confirm.
- **D4 — Unrealized revaluation policy.** Auto-post at period close **and
  auto-reverse** next period (recommended, standard), or manual/opt-in? And is
  revaluation part of the close action or a separate step?
- **D5 — Monetary classification.** Approve the rule for which accounts revalue
  (cash/AR/AP/loans = monetary; fixed assets/prepaid/equity = non-monetary), via a
  `is_monetary` flag or account-type inference.
- **D6 — Invoicing/payouts in scope for v1?** Do foreign-currency **invoices** and
  **payouts** ship with the first multi-currency release (realized FX on
  settlement), or does v1 cover manual journal entries only and invoicing/payouts
  follow?
- **D7 — Rollout.** Global gate-lift for all orgs, or a per-org
  `multi_currency_enabled` flag so it's opt-in while we dogfood (recommended —
  keeps every existing org single-currency until turned on)?

---

## 9. Coverage delta (per AUDIT.md gate)

Multi-currency is a listed **standing coverage gap** in LEARNINGS ("Deferred:
multi-currency"). When built, it adds new AUDIT.md ledger rows (⬜ untested →
stress pass): mixed-currency entry balance (base + per-currency), realized FX on
settlement, unrealized revaluation + reversal, rate-source fallback, reports
tie-to-cent under mixed currencies, and the gate-lift order (no window where sums
add across currencies). No merge over red CI (LEARNINGS #22).
