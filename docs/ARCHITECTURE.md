# FounderFirst / Penny, Architecture

> System overview grounded in the actual code paths in this repository. For the
> internal design record with decision history see
> [`docs/plans/ARCHITECTURE.md`](plans/ARCHITECTURE.md); this document is the
> external-facing map.

## 1. One platform, three lenses, one ledger

FounderFirst is a pnpm monorepo. The backend is **Supabase** (Postgres with
row-level security, Deno Edge Functions, Storage, Vault); the apps are thin
projections over it. The owner app, the CPA view, and the internal admin are all
role-scoped projections of **one platform and one set of books:** the lens is
selected server-side from the verified JWT, never from the browser.

| Layer | What it is | Stack (verified) |
|---|---|---|
| `apps/web` | Marketing site (the live founderfirst.one) | Astro 4 + React islands, GitHub Pages |
| `apps/app` | Authed product SPA, owner, CPA, and admin lenses | Vite 5 + React 18 + react-router + TanStack Query |
| `apps/admin` | Internal console (content, voice, signals, email) | Vite + React 18 SPA |
| `apps/demo` | Interactive Penny demo (`/penny/demo/`) | Vite + React 18, standalone |
| `site-bubble/worker` | Public marketing chat bubble | Cloudflare Worker + Workers AI |
| `supabase/functions` | ~74 Deno Edge Functions, the write path and Penny's brains | Deno + `@supabase/supabase-js` |
| `packages/inference` | The AI quality & cost layer (`resolve()` + judge) | Runtime-agnostic TypeScript |
| `packages/design-system` | Design tokens + components | CSS custom properties |
| `scripts/` | Seed loaders, CI guards, the regulatory watcher | tsx |

Design invariants that shape everything below:

- **Money is integer minor units** (`bigint` cents + currency), never floating point.
- **The ledger is append-only.** A correction is a new reversing entry that
  references the original; posted entries are never mutated.
- **Every financial table carries `org_id` and is RLS-protected.** The database
  itself refuses unauthorized reads; `resolve()` throws on an empty tenant; a CI
  guard (`scripts/check-tenant-predicate.ts`) fails the build on any query that
  touches a tenant table without a tenant predicate.
- **Business/law knowledge is data, not code.** Tax rules, deadlines, entity
  types, and connectors are seed data; apps look them up and never hardcode them
  (`scripts/check-law-literals.ts` enforces this in CI).

## 2. Component view

```mermaid
flowchart TB
  subgraph Sources["Money sources"]
    Stripe["Stripe / Shopify / PayPal / Square<br/>(payouts)"]
    Bank["Bank &amp; cards<br/>(Plaid feed)"]
    Acct["QuickBooks / Xero<br/>(sync)"]
    Cap["Receipt capture<br/>(photo / text)"]
  end

  subgraph Edge["Supabase Edge Functions (Deno) - the write path"]
    Ingest["plaid-sync / plaid-webhook<br/>qbo-import / xero-import<br/>commerce-sync / imports"]
    Cat["categorize<br/>(propose / approve / learn)"]
    Recon["reconcile / ledger-* / invoicing<br/>bill-pay / receipts"]
    Thread["penny-thread<br/>(grounded Q&amp;A)"]
    Insights["synthesize-insights"]
  end

  subgraph Inf["packages/inference - AI quality &amp; cost layer"]
    Resolve["resolve(task, ctx)<br/>route - call - price - record"]
    Judge["judge(input, ctx)<br/>tiered eval panel"]
  end

  subgraph Providers["Model providers"]
    Anthropic["Anthropic<br/>Haiku / Sonnet"]
    WorkersAI["Workers AI<br/>Llama / Mistral"]
    OpenRouter["OpenRouter"]
  end

  subgraph DB["Postgres (RLS, append-only)"]
    Ledger["ledger_accounts / journal_entries<br/>journal_lines / accounting_periods"]
    Rules["categorization_rules<br/>vendor_priors"]
    Raw["bank_transactions / import_batches<br/>receipts / invoices / bills"]
    Kernel["entity_types / industries<br/>filing_obligations / tax_forms<br/>asset_classes / macrs_percentages"]
    AISink["ai_decisions / ai_evals<br/>ai_model_config"]
  end

  Stripe --> Ingest
  Bank --> Ingest
  Acct --> Ingest
  Cap --> Recon
  Ingest --> Raw
  Raw --> Cat
  Cat --> Resolve
  Thread --> Resolve
  Insights --> Resolve
  Resolve --> Providers
  Resolve --> Judge
  Judge --> Providers
  Resolve --> AISink
  Cat --> Ledger
  Cat --> Rules
  Recon --> Ledger
  Thread --> Ledger
  Kernel --> Cat
```

Two properties are worth calling out. First, **every AI request in the system funnels
through one `resolve()`** (`packages/inference/src/core.ts`), there is a single
place where routing, cost, and logging happen, and a single provider HTTP path that
the judge reuses. Second, **the knowledge kernel feeds categorization and tax as
data**, so a new sector, deadline, or connector is a seed-file edit with a CI drift
guard, not a code change.

## 3. The grounded categorization sequence

This is the core money-critical loop. It shows why "answers retrieved, not guessed"
is a structural property, not a prompt hope.

```mermaid
sequenceDiagram
  autonumber
  participant Bank as Plaid / connector
  participant Ingest as Edge: plaid-sync
  participant DB as Postgres (RLS)
  participant Cat as Edge: categorize
  participant Inf as resolve() + judge
  participant Owner as Owner (app)

  Bank->>Ingest: transaction (webhook / sync)
  Ingest->>DB: upsert bank_transaction (idempotent on ext:plaid:<id>)
  Cat->>DB: match_categorization_rule(org, txn)
  alt deterministic rule / vendor prior hits
    DB-->>Cat: account_id (HIGH confidence)
  else no rule
    Cat->>DB: load org's OWN ledger_accounts
    Cat->>Inf: resolve(propose, accounts as the ONLY allowed set)
    Inf-->>Cat: proposed account_id (must be one we sent)
  end
  alt confidence >= high tier
    Cat->>DB: autopost + write penny_activity ("Penny did this")
    Note over Owner: no interruption
  else low confidence
    Cat->>Owner: one-tap approval card (counts against <=5 asks/week)
    Owner->>Cat: approve / correct
    Cat->>DB: recategorize_entry (reverse + repost) + learn_categorization_rule
  end
```

Key code facts (`supabase/functions/categorize/index.ts`,
`supabase/migrations/*phase4_categorization.sql`, `*w3_2_trust_tiered_autonomy.sql`):

- **Deterministic first, model second.** The rule matcher (`match_categorization_rule`)
  runs before any model call; the model is only a fallback.
- **The model cannot invent an account.** The inference call is constrained to the
  org's own `ledger_accounts`; a proposed `account_id` that was not in the set is
  rejected.
- **Trust-tiered autonomy.** High-confidence items auto-post and appear in a
  "Penny did this" activity feed; only low-confidence items become approval cards,
  and the owner is interrupted at most ~5 times a week (config is data in
  `platform_config`, read via `get_effective_behavior_config`).
- **Learning is a ledger event.** Approve runs `recategorize_entry` (reverse +
  repost) and `learn_categorization_rule` (upsert), so the books stay append-only
  and the correction is remembered. Corrections can auto-demote a rule.

## 4. The grounded Q&A path (Penny thread)

`supabase/functions/penny-thread/index.ts` is the clearest expression of the
grounding discipline. The client computes a fast optimistic answer, but the server
is authoritative on every request:

1. **Re-route** the question with shared routing logic, if the server deems it out
   of scope, it declines regardless of what the client sent.
2. **Re-compute the fact** from the org's own ledger via a paginated service-role
   SELECT running the exact report math. The server figure wins over any client
   figure; a forged client amount is discarded.
3. **Post-check the model.** The model only phrases the server fact; if it emits any
   figure other than the server fact, that output is discarded for deterministic
   phrasing.

The result: a hallucinated or client-forged number is structurally impossible. Empty
books defer to "connect your books first" rather than report a hollow `$0.00`.

## 5. The AI quality & cost layer

Every AI request passes through `resolve(task, ctx)`:

- **Routing** is config-driven (`DEFAULT_ROUTING`, overridable from the DB via
  `buildInferenceConfig`): `penny_chat` -> Claude Haiku (fast), `insights` ->
  Claude Sonnet (reasoning), `email_compose` -> Llama 3.3 70B on Workers AI
  (writing/bulk). Providers: `anthropic`, `workers-ai`, `openrouter`.
- **Cost** is priced per token (`computeCostUsd`) and recorded on an `ai_decisions`
  row with latency and usage; spend caps trigger a fallback model, never a failure.
- **Portability by construction.** The core depends on no runtime globals; `fetch`,
  timers, the Workers-AI binding, and the record sink are injected via `ctx`, so the
  same logic runs in a Cloudflare Worker, a Supabase Edge (Deno) function, and Node
  (CI). The Deno copy is vendored into `supabase/functions/_shared/inference/` with a
  CI drift guard (`scripts/check-inference-vendor.ts`).
- **Grading** is a tiered eval panel (`judge()`): deterministic floor gates ->
  optional SQL reconciliation -> a generator-family-aware LLM checker panel, with a
  fail-closed default. Detail in [EVALS.md](EVALS.md).

## 6. Data architecture (canonical ledger + adapters)

```
Ingest (raw, provenance-preserving)          Canonical books (append-only)
  Plaid    -> bank_transactions               ledger_accounts   (chart of accounts)
  QBO/Xero <-> external_connections           journal_entries   (immutable header)
  Commerce -> commerce payouts (split)        journal_lines     (debit/credit rows)
  Manual   -> import_batches / receipts        documents / receipts (Storage)
                                              categorization_rules (Penny-learned)
                                              accounting_periods (open/closed, close)
                                              reconciliation_sessions / matches
```

- Own ledger is canonical; Plaid, QBO/Xero, and commerce providers are adapters
  behind one provider interface (`connectors` seed table). The ledger does not care
  where a transaction originated; every entry keeps `source` + `source_ref`
  provenance.
- Every money mutation is idempotent (client-supplied key; webhook ingest dedupes
  on the provider transaction id).
- Reports (P&L, balance sheet, cash flow) are derived from the ledger, not stored as
  truth.

## 7. Security and tenancy

- **RLS everywhere.** `can_access_org` / `can_read_org` / `can_write_org_as`
  security-definer helpers gate every financial table. Read-only CPA access
  (`access_level = read_only`) is enforced in the RPC, not just the UI.
- **The write path is RPC-only.** Financial tables deny direct client writes;
  mutations go through `SECURITY DEFINER`, `service_role`-EXECUTE-only RPCs
  (`post_journal_entry`, `reconcile`, `recategorize_entry`, ...), with the actor
  taken from the verified JWT and each RPC audit-logging.
- **Penny has no privilege escalation path and no authority.** It reads only
  RLS-permitted data and writes only proposals a human approves; it never silently
  mutates the ledger. An MFA gate (`_shared/mfaGate.ts`) guards sensitive write ops.
- **Secrets** live in Edge Function config / Supabase Vault, never client-side.

## 8. Delivery and CI

18 GitHub Actions workflows gate the repo, including `db-tests.yml` (53 pgTAP SQL
tests), `deno-tests.yml` (edge-function tests), `app-e2e.yml` / `e2e.yml`
(Playwright), `kernel-seed.yml` (seed-drift), `regulatory-watcher.yml`,
`responsive.yml` (a 320-1920px width ladder), `migrations-unique.yml`, and
`pages.yml` (deploy). The local `build` script chains the CSS guard, the tenant
guard, the inference vendor-drift guard, and the judge unit tests before building.

---

*Related: [PRD.md](PRD.md) · [EVALS.md](EVALS.md) ·
[TECHNICAL_NOTES.md](TECHNICAL_NOTES.md) · [FDE_JOURNEY.md](FDE_JOURNEY.md)*
