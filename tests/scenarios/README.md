# Industry scenario battery

`industry_scenarios.json` is a realistic, multi-sector double-entry regression suite
used to prove the ledger ties **to the cent** across the kinds of books real small
businesses keep — the "beat QuickBooks on correctness" bar.

## What's in it

- **10 sector books** (restaurant, SaaS, e-commerce/retail, construction, professional
  services, nonprofit, real-estate rental, freelancer, agency, healthcare clinic) —
  110 journal entries total, each a complete period of activity.
- Collectively exercises: accumulated depreciation (contra-asset), deferred/unearned
  revenue recognition, sales-tax payable, AR/AP aging with partial payments, customer
  deposits, contra-revenue (refunds / contractual adjustments), owner draws
  (contra-equity), payroll with withholding liabilities, inventory + COGS, and prepaid
  expense amortization.
- **14 adversarial entries** (`adversarial`) that MUST be rejected: unbalanced, zero,
  negative, single-line, non-integer, invalid side, null/garbage amount, off-by-one cent.

## Invariants the runner asserts (per scenario, to the cent)

- Trial balance: Σ debits == Σ credits.
- `total_debits`, `total_income`, `total_expense`, `net_income`, `total_assets`,
  `total_liabilities`, `total_equity` each equal the pre-computed `expected` value.
- Balance-sheet identity: **assets == liabilities + equity + net income**.
- Every account's net (debit − credit) equals `expected.account_net_minor`.

All amounts are integer **minor units** (US cents). `expected` aggregates are derived
directly from the entries, so the file is self-consistent (re-derive to validate).

## Running it

The live runner mints sessions, creates one `[E2E]` business org per scenario via the
`orgs` edge fn, posts the book through `ledger-entries`, then recomputes TB/P&L/BS from
the ledger and asserts equality. It is namespaced `[E2E]` and never deletes data. See
the E2E harness for the driver; credentials come from
`~/.config/founderfirst/secrets.env` (prod ref `ejqsfzggyfsjzrcevlnq`).

Last run: **10/10 sectors tie to the cent; 14/14 adversarial entries rejected.**
