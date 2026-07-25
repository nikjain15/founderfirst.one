# FounderFirst / Penny - Forward-Deployed Engineering Journey

> How Penny deploys into a real business's live financial environment: integration,
> security, rollout and cutover, observability, and de-risking. Grounded in the
> repo's actual capabilities; anything not yet built is labeled **Roadmap**.

Deploying an autonomous bookkeeper is a forward-deployed problem: the customer's
money is already moving, their books already exist somewhere, and there is no
acceptable window of "the books are wrong for a while." The architecture is built for
that reality - a canonical append-only ledger, provenance on every entry, reversible
imports, and an accuracy-over-autonomy ramp.

## 1. Integration points

A new business is rarely greenfield. Penny meets the customer's money where it
already lives, through connectors behind one provider interface
(`supabase/seeds/kernel/connectors.json`):

- **Bank & cards** via Plaid (`plaid-link-token`, `plaid-exchange`, `plaid-sync`,
  `plaid-webhook`). Ingest is idempotent, deduped on `ext:plaid:<transaction_id>`.
- **Existing accounting** via QuickBooks Online and Xero (`qbo-connect/callback/import`,
  `xero-connect/callback/import`, `commerce-sync`): pull the chart of accounts and
  historical transactions.
- **Revenue / payouts** via Stripe, Shopify, PayPal, Square - payout splitting and
  report import, deduped exactly-once on a shared `ext:<provider>:payout:<id>` key.
- **Receipts** by photo or text (`receipts`), landing in a private RLS-scoped bucket.

Three import paths all land in the same canonical ledger with provenance:
**API pull** (QBO/Xero), **manual upload** (CSV / bank statement / trial balance via a
guided importer), and **opening balances** (a dated trial-balance entry per account at
a chosen cutover date). Imports run as a **previewable, reversible batch**
(`import_batches`) - nothing is committed until the operator confirms.

## 2. Security & secrets

- **Row-level security is the boundary, not a feature.** Every financial table
  carries `org_id` and is gated by `can_access_org` / `can_write_org_as`
  security-definer helpers; the database itself refuses unauthorized reads. A CI
  guard (`scripts/check-tenant-predicate.ts`) fails the build on any tenant-table
  query missing a tenant predicate.
- **The write path is RPC-only.** Financial tables deny direct client writes;
  mutations go through `SECURITY DEFINER`, `service_role`-EXECUTE-only RPCs, with the
  actor taken from the verified JWT (a caller cannot forge it) and each RPC
  audit-logging. Read-only CPA access is enforced in the RPC, not just the UI.
- **Penny is not a privilege-escalation path.** It reads only RLS-permitted data and
  writes only proposals a human approves; it never silently mutates the ledger.
  Sensitive operations sit behind an MFA gate (`_shared/mfaGate.ts`).
- **Secrets** live in Edge Function config / Supabase Vault, never client-side.
  Connector token encryption is graduating from pilot-plaintext to Vault (`sec`
  migrations) - a known item to close before broad rollout.
- **Data governance is designed in.** `ai_decisions` has a 90-day `retain_until`,
  PII-minimization (`storeInput = false`, mandatory for financial), and first-class
  right-to-erasure columns. The retention/erasure **jobs** are Roadmap (Phase 5-6);
  the policy explicitly does not assert GDPR/CCPA compliance in code and flags legal
  sign-off before real bookkeeping data flows at volume.

## 3. Rollout & cutover

The ledger design directly supports a low-risk cutover that will feel familiar to
anyone who has migrated a money system:

- **Parallel-run friendly.** Because the own ledger is canonical and adapters are
  behind an interface, the new books can run alongside the existing system while
  figures are compared, before anyone relies on Penny.
- **Cutover date + opening balances.** For businesses without exportable history, a
  dated trial-balance per account makes the balance sheet correct from go-live.
- **Reversible before commit.** Import batches are previewable and reversible; once
  committed, entries are immutable and corrected only by reversing entries - so the
  audit trail is never rewritten.
- **Accuracy-over-autonomy ramp.** Penny starts at **100% human review**. It advances
  to sampling only after a tenant cohort clears thresholds (a minimum zero-edit
  approval rate, zero safety/privacy failures over a window), and every reduction is
  proposed by the system and **approved by a human**, audit-logged. Financial use
  cases cannot ramp until the source-correct reconciliation gate is wired as code.
  This is the de-risking contract: autonomy is earned per customer, never assumed.

## 4. Observability

- **Every AI decision is a row.** `ai_decisions` records provider, model, use case,
  tenant, token usage, `cost_usd`, `latency_ms`, `gate_status`, and per-eval results
  - the audit and debugging substrate for the review queue and the (Roadmap) cost
  dashboard. Logging is async and crash-safe: a failed write never blocks or breaks
  an answer.
- **The books observe themselves.** Append-only entries with `source`/`source_ref`
  provenance, balanced-entry enforcement, and first-class bank reconciliation mean
  drift is detectable, not silent. `LEARNINGS.md` rule 16 is explicit: "the trial
  balance still ties" does not mean the data is correct - reconciliation against real
  records is the check.
- **The activity feed** ("Penny did this") gives the owner a running, reviewable log
  of what was auto-posted at high confidence.
- **Product analytics + a regulatory watcher** keep the operator ahead of change: a
  tax-law or deadline change surfaces as one reviewed, effective-dated, cited
  seed-diff PR (`scripts/regulatory-watcher`), never a silent code sweep.

## 5. De-risking checklist (what a customer deployment leans on)

| Risk | Mitigation in the code |
|---|---|
| Wrong number reaches the owner | Deterministic grounding (ledger-computed facts), fail-closed judge, floor gates on every answer |
| Books corrupted during migration | Reversible import batches; append-only ledger; corrections via reversal only |
| One tenant sees another's data | RLS boundary + `resolve()` tenant invariant + CI predicate guard |
| Autonomy outruns accuracy | 100%-review start; per-cohort, human-approved ramp; correction-rate rollback |
| Model or vendor change regresses quality | Config-driven routing + "test on recent answers" + request-parity harness |
| Cost runs away | Per-token metering, per-use-case spend caps with cheaper-model fallback, sampled judge evals |
| Law changes silently | Regulatory watcher -> reviewed seed-diff PR; `check-law-literals` blocks hardcoded law |
| A concurrent write corrupts state | Row-locked read-then-write RPCs (`LEARNINGS.md` rule 15); idempotency keys |

## 6. Roadmap for a repeatable FDE motion

- Wire the source-correct SQL reconciliation gate into every financial call site so
  autonomy can ramp on financial use cases.
- Ship the review queue and admin model/cost controls (inference Phases 3-4) so an
  operator can run a deployment without touching code.
- Land retention/erasure jobs and finish connector-token Vault migration before
  onboarding customers at volume.
- Per-customer cohort dashboards over `ai_decisions` for the accuracy thresholds the
  ramp already references.

---

*Related: [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [EVALS.md](EVALS.md) ·
[TECHNICAL_NOTES.md](TECHNICAL_NOTES.md)*
