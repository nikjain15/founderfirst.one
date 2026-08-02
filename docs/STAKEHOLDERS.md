# Stakeholder reviews, FounderFirst / Penny

## Read this first: these reviews are simulated

**No accountant, lawyer, data protection advisor, security engineer, auditor, or any
other outside party has reviewed this product, this repository, or this document.
Nobody has signed anything off.**

FounderFirst is built by one person. Nik Jain wrote the code, and Nik Jain then sat
down and role-played three senior reviewers against that same code: a security and
privacy reviewer, a financial controls reviewer in the character of an experienced
accountant, and a data and research lead reviewing the evals. One person, three
hats, one afternoon. That is what produced everything below.

This matters more here than in most projects. Penny is a bookkeeping product. It
touches bank connections, Plaid and QuickBooks tokens, and the books a small
business may eventually file taxes from. A document that implied a real CPA had
blessed the chart of accounts, or that a real lawyer had cleared the retention
policy, would be a false claim about a financial product. So, plainly: that has not
happened, and this file is not evidence that it has.

What a structured self-critique is genuinely good for: it forces the questions an
outside reviewer would ask to be written down and answered against real files and
real line numbers before anyone has to ask them out loud. Several findings below are
things that were not visible until somebody deliberately looked for them with an
adversarial brief. That is real value. It is not sign-off.

Every finding cites a file and a line. Nothing was fixed to make a finding go away.
Open findings are recorded as open.

Reviews run: 2 Aug 2026, against commit `af7686c`.

---

## 1. Who would actually need to be involved

Each row is a role that a real version of this product would need. None of these
roles is filled today.

| Role | What they need from us | The decision they own | What they block on |
|---|---|---|---|
| **Licensed accountant / CPA** | The seeded chart of accounts, the close mechanics (`accounting_periods`, `close_accounting_period`), a sample of Penny's actual categorisation output on real transactions, and the reversal-not-edit correction model | Whether the books Penny produces are books a professional would sign a return from | A CPA cannot review output that does not exist yet. Blocks on a design partner with real transaction volume. Also blocks on F-P0-1 and F-P0-2 below: a period lock that a service-role insert can walk past is not a close they can rely on |
| **Lawyer / data protection advisor** | The privacy policy draft, the retention table in `GUARDRAILS.md` §"Data rules", the actual erasure path, and the list of what data leaves our infrastructure (Anthropic, Cloudflare AI Gateway, Plaid, Intuit) | Whether we may hold this data at all, for how long, and what an erasure request legally has to reach | Blocks on S-P0-3 and S-P1-5: the written 90-day retention window has no job behind it and the erasure path covers database rows but not logs, traces, or gateway request bodies. There is nothing coherent to review yet. `GUARDRAILS.md:221` already flags this as open, "before bookkeeping data flows" |
| **Security engineer / pentester** | The RLS model, the RPC write path, token storage, and a dependency posture | Whether this is safe to point at a production Plaid connection | Blocks on S-P0-1 (a live `pnpm audit` today reports 1 critical and 10 high, against a rubric in our own `docs/AUDIT.md:38` that demands none) and S-P0-2 (Plaid tokens are stored in plaintext while QuickBooks tokens are encrypted). Plaid's own production access review is a separate, real gate we have not approached |
| **Design partner (a real small business, ideally with its own bookkeeper)** | Early access, and an explicit agreement that their books are checked by a human every month while they help us | Whether the product is worth the switching cost, and whether the one-tap approval flow is a review or a rubber stamp | Blocks on nothing technical. This is the missing input that unblocks almost everything else: no production accuracy number, no zero-edit approval rate, and no autonomy threshold can exist without one |
| **Support / operations** | A runbook for "Penny booked it wrong and the period is closed", and the ability to answer "who made this entry" | Whether an incident is recoverable without a database console | Blocks on F-P1-4: the ledger records the signed-in human as `posted_by` even when Penny made the decision, so the first question support would ask cannot be answered from the audit trail |

---

## 2. The single biggest misalignment risk

**The marketing surface and the engineering posture describe two different
products, and one person holds both pens.**

`README.md:44` calls Penny "Your autonomous 24/7 bookkeeper" and `README.md:48`
says "Penny categorizes every transaction. You confirm with one tap."

`docs/ai-quality-cost-layer/GUARDRAILS.md:70` says "Current state: full autonomy is
OFF", and `:72-74` says every categorization is at 100% human review.

Both statements are in this repository and both are true of their own context. The
engineering docs are unusually honest. The problem is that a small business owner
evaluating this product reads the landing page and the README, never
`GUARDRAILS.md`, and forms a belief about how much attention their books need. If
that belief is "none", and the actual control against a wrong entry reaching the
books is that same owner tapping approve, then the only control in the system has
been marketed away.

In a company, a founder writing that headline would meet friction from an engineer
who knows the ramp is off, and from a compliance function that knows what
"autonomous" implies for a financial product. Solo, there is no friction. The
mitigation is not a better process; it is writing the constraint down where it can
be checked, which is what this document and `DECISION_LOG.md` are for.

Second-order version of the same risk: the reviewer and the author share every
blind spot. Three of the findings below were found by tooling (a dependency audit,
a grep for a scheduled job) rather than by judgement. That ratio is the honest
measure of how much a self-review catches.

---

## 3. Sign-offs

### Approvals that would genuinely be required before a real small business relies
on this for their books

1. **A licensed accountant reviews live output.** Not the schema, the output. A
   month of a real business's categorised transactions, reviewed line by line
   against what that accountant would have booked, with the disagreements counted.
2. **A lawyer or data protection advisor clears the privacy policy, the retention
   disclosure, and the erasure path** before real bookkeeping data flows. This is
   already written down as an open item in `GUARDRAILS.md:221` and in §11 of the
   quality-layer plan.
3. **A security review of the token and tenant boundary**, at minimum covering
   Plaid token storage at rest, RLS behaviour against a live database rather than
   against migration source, and the dependency posture.
4. **Plaid production access approval.** This is a real external gate with a real
   reviewer on the other side, and it is not optional.
5. **A design partner's informed consent** that they are using pre-autonomy
   software and that a human checks their books monthly.
6. **An engagement-letter-shaped statement of who is accountable when Penny is
   wrong.** Today the answer is "the owner who tapped approve", and that has never
   been said out loud to a user.

### Which of these have been obtained

**None. Zero. Not one of the six.**

No accountant has looked at Penny's output. No lawyer has read the privacy policy.
No security engineer has looked at the token handling. There is no design partner.
Plaid production access has not been applied for. The accountability statement has
not been written.

### The plan to get them

The order matters, because four of the six depend on the fifth.

1. **First, fix what would fail the review anyway.** S-P0-1 (dependency audit in
   CI), S-P0-2 (encrypt Plaid tokens), S-P0-3 (retention job plus PII minimisation
   on financial call sites), F-P0-1 and F-P0-2 (period lock as a data-layer
   invariant). None of these needs an outside party, and taking a reviewer's time
   on a finding you already know about is a waste of the one scarce resource here.
2. **Then get one design partner**, ideally a business with a bookkeeper who is
   willing to be the human check for a quarter. This unblocks the accountant review
   (there is finally output to review), the accuracy numbers `GUARDRAILS.md` leaves
   deliberately blank, and the accountability statement (it becomes a real
   conversation with a real person rather than a hypothetical).
3. **In parallel, the legal review**, because it gates data flow rather than
   depending on it. Cheapest concrete step: a fixed-scope engagement covering the
   privacy policy and retention disclosure only.
4. **Plaid production access and a security review together**, since Plaid's
   process asks most of the same questions.
5. **The CPA review last**, on real output, after at least one month-end close has
   happened, because `GUARDRAILS.md:117-123` is right that bookkeeping error
   clusters at period boundaries and a review that never crosses a close has not
   seen the hard cases.

Nothing in this plan has a date, because a date would be as invented as the
thresholds `GUARDRAILS.md` correctly refuses to publish.

---

## 4. Pushback

Findings from the three simulated reviews. P0 blocks a real customer's books. P1
blocks broad rollout. P2 is a correctness or clarity debt.

Nothing in this section was fixed in the same pass that found it. Where a finding
is open, the file that would fix it is named. "Changed" means changed; everything
else says open.

### 4a. Security and privacy review

Scope: dependency and supply chain posture, CI security tooling, secret and token
handling, what personal data reaches storage and logs, retention, and deletion.

| # | Rank | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| S-1 | **P0** | No dependency audit runs anywhere in CI, and running one today fails the repo's own rubric | `docs/AUDIT.md:38` requires "`pnpm audit` shows no high/critical" and scores security findings as always P0 or P1 (`docs/AUDIT.md:15`). No step in any of the 16 workflows under `.github/workflows/` runs `pnpm audit` or `npm audit`, and there is no `.github/dependabot.yml`. Run in this session: **1 critical and 10 high** across all dependencies; **10 high** with `--prod`. The critical is a `vitest` UI server arbitrary-file-read-and-execute; the prod highs include `astro` reflected XSS and host-header SSRF, `ws` memory-exhaustion DoS, `sharp` inherited libvips CVEs, and a `vite` `server.fs.deny` bypass. GitHub's own Dependabot **alerts** do fire on the default branch and report a worse picture still (107 advisories: 5 critical, 21 high, 52 moderate, 29 low, surfaced on the push that added this file), but an alert nobody has to clear is not a gate, and there is no `dependabot.yml` raising update pull requests | New `.github/workflows/security.yml` running `pnpm audit --prod --audit-level=high` on pull requests, plus `.github/dependabot.yml`. Then remediate or explicitly waive each advisory in `docs/AUDIT.md` | **Open.** The rubric line is an assertion, not a gate |
| S-2 | **P0** | Plaid access tokens are stored in plaintext while QuickBooks tokens are encrypted | `supabase/functions/plaid-exchange/index.ts:67` and `:73` write `access_token: accessToken` straight into `external_connections`, and `:82` reads it back. The encryption machinery already exists and is used for QuickBooks and Xero: `supabase/migrations/20260707130000_iq1_qbo_token_encryption.sql:111-122` (`set_qbo_tokens()`, pgcrypto, key in Vault) and `:94-102` (`ext_connection_secrets()`). A Plaid access token is read access to a business's entire bank transaction history, which is the highest-value secret in the system | Route `plaid-exchange` and `plaid-sync` through the same `set_qbo_tokens()` / `ext_connection_secrets()` pair, then clear the plaintext backfill the way `20260708010000_iq1_cleanup_qbo_plaintext.sql:34-40` did for QuickBooks | **Open.** The fix is mostly a call-site change; the crypto is already built and tested |
| S-3 | **P0** | Every AI prompt is stored verbatim with transaction PII, and the written 90-day retention window has no job behind it | `supabase/functions/_shared/inference/core.ts:737` reads `const storeInput = task.record?.storeInput !== false;`, so storage defaults to on, and no edge function sets it to false. `ai_decisions.input` therefore holds merchant names, transaction descriptions, and amounts per tenant. `ai_decisions.retain_until` exists (`20260628120000_ai_decisions.sql:94`) with an index at `:104`, and **no code anywhere reads it**. `GUARDRAILS.md:194` states "Raw retention: 90 days" and `:196` states PII minimisation "**must**" be on for financial use cases. Both are currently untrue. Separately, `penny_site_chats_purge()` (`20260620153619_remote_commit.sql:1025-1039`) is a correct 90-day purge that is never scheduled | Set `record.storeInput = false` at the financial call sites, and add a `pg_cron` retention job reading `retain_until`. Schedule `penny_site_chats_purge()`. Six other `cron.schedule` calls already exist in migrations, so the pattern is established | **Open.** The docs describe a control that does not run |
| S-4 | **P1** | No secret scanning, no SAST, no lint, and no repo-wide typecheck across 16 workflows | Confirmed absent repo-wide: gitleaks, trufflehog, CodeQL, semgrep, eslint, and `tsc --noEmit` outside `packages/soak-harness`. There are 12 orphaned `// eslint-disable-next-line` comments suppressing a linter that is never run, for example `packages/inference/src/core.ts:440` and `:564`. `deno-tests.yml` runs `deno check` but never `deno lint` | Fold gitleaks and CodeQL into the same `security.yml` as S-1; both are free for this repository. Add a repo-wide `tsc --noEmit` job | **Open** |
| S-5 | **P1** | Deletion reaches database rows only. Logs, traces, and gateway request bodies are outside every deletion path | The only implemented hard-delete is `discord_dm_erase` / `admin_discord_erase` (`20260624100000_discord_erase_complete.sql:23`, `:50`), scoped to Discord. There is no erasure RPC for an org's AI data, thread messages, or raw bank transaction payloads; `GUARDRAILS.md:219` marks it "Phase 5". Prompts also traverse Cloudflare AI Gateway (`supabase/functions/_shared/inference/core.ts:407` and `:538`), which logs request and response bodies by default; only `cf-aig-skip-cache` is set (`:419`, `:548`), and no `cf-aig-collect-log: false` header appears anywhere in the repository, despite `GUARDRAILS.md:210` asserting gateway body-logging is "minimized" for financial use cases | Set the collect-log header at both gateway call sites, then build the erasure RPC with an explicit written list of every store it must reach, including gateway logs and the de-identified archive | **Open** |
| S-6 | P2 | The workflow index readers are pointed at is stale by half | `.github/workflows/README.md:3` is stamped "Last verified: 1-Jul-2026 · 8 workflows". There are 16. Eight are undocumented, and its `pages.yml` row says 6 pre-build checks where the file runs 7. `README.md:20` sends readers there as the authoritative list | Regenerate `.github/workflows/README.md` | **Open** |

**What genuinely holds, and it is not nothing.** Row-level security is used as the
actual boundary rather than as a feature, with a CI guard
(`scripts/check-tenant-predicate.ts`, `pnpm check:tenant`) failing the build on any
tenant query missing a predicate. The financial write path is RPC-only, with
`SECURITY DEFINER` functions whose `EXECUTE` is granted to `service_role` alone and
revoked from `anon` and `authenticated`
(`20260701000000_isolation_revoke_rpc_execute.sql:57-58`, `:85`). QuickBooks and
Xero token encryption is properly done: pgcrypto, the key in Vault, column-level
grants excluding the ciphertext, an atomic plaintext-nulling writer, and pgTAP
coverage. And the logging discipline is better than most production systems: there
are only 15 `console.*` calls in all of `supabase/functions/`, none emits a name,
email, amount, description, or token, and `_shared/qbo.ts:49-51` carries a comment
explaining that the provider body is deliberately excluded because it can echo the
auth code. The exposure in S-3 is in a database column, not in a log line, which is
a meaningfully better place for it to be.

**What this review did not look at:** the deployed Supabase and Cloudflare
configuration, live RLS behaviour against a running database, the browser apps'
client-side attack surface (XSS, CSP, dependency exploitability in actual usage), or
whether any of the 11 high-and-above advisories is reachable in this codebase's
specific usage.

### 4b. Financial controls review, in the character of an accountant

Scope: what stops a wrong entry reaching the books, who is accountable, whether the
double-entry and period-lock invariants actually hold, what the audit trail would
look like to a reviewing accountant or an examiner, and whether the autonomy ramp
is a responsible design.

| # | Rank | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| F-1 | **P0** | The period lock is an RPC-level rule, not a data-layer invariant, so a direct insert posts into a closed period | Enforcement lives entirely in `ensure_open_period` (`20260702000000_reconcile_period_journal_locks.sql:30-63`), which `post_journal_entry` calls at `20260629125000_phase2_ledger_writepath.sql:248`. No trigger on `journal_entries` consults `accounting_periods.status`; the triggers that exist are the guard, the audit, the reconcile-reopen, and the ingest prune. Compare with the invariants that **are** enforced at the data layer: `journal_lines_balanced` (`20260628160000_phase2_ledger_core.sql:105-129`) and `journal_lines_immutable` (`:133-141`). `service_role` holds `insert` on both ledger tables (`:195-198`) and bypasses RLS, and every edge function runs as `service_role`. A closed period is the accountant's guarantee that last month cannot move. Here it is a guarantee about one code path | Add a `before insert or update` trigger on `journal_entries` that raises when the target period is closed, mirroring the balance trigger. The RPC check stays as the friendly error | **Open** |
| F-2 | **P0** | Backdating into a month that has no period row silently creates an open period and posts into it | `20260702000000:57-62`: when no `accounting_periods` row covers `p_date`, `ensure_open_period` inserts a new calendar-month period with status `'open'` and the post lands. Closing February through June therefore does not stop an entry dated January if January never had a row. `org_accounting_settings.cutover_date` exists (`20260628160000:30`) but no posting path reads it; every `cutover_date` read in the repository is against `import_batches` | Have `ensure_open_period` refuse any date before `cutover_date`, and refuse to auto-create a period earlier than the most recent closed period | **Open.** This and F-1 together mean prior periods are advisory rather than locked |
| F-3 | **P1** | Any active member can reopen a closed period | `reopen_accounting_period` gates only on `can_write_org_as` (`20260630080000_ledger_audit.sql:77`), with no role or tier check, and `supabase/functions/ledger-periods/index.ts:48-57` accepts `action:'reopen'` from any member who clears the MFA gate. It is audited (`:86-88` captures `was_closed_by` and `was_closed_at`), which is good, but audit is detection, not control. Segregation of duties is the entire point of a close | Require the owner role or an explicit close-books capability | **Open** |
| F-4 | **P1** | The ledger cannot tell you whether a human or the AI made an entry | `supabase/functions/categorize/index.ts:222` passes `p_actor: user.id` for Penny's auto-post, so `journal_entries.posted_by` and `ledger_audit.actor` both name the signed-in person for a decision they did not make. AI authorship is recoverable only by joining `journal_entries.source = 'recategorize'` to a `penny_activity` row with `source = 'penny'` (`20260705010000_w3_2_trust_tiered_autonomy.sql:42-61`), and the model's rationale is never persisted there; only the owner-facing `summary` is (`categorize/index.ts:226`). When a reviewing accountant asks "who booked this, and on what basis", the file cannot answer directly | Add `actor_kind` and a `decision_ref` pointing at the `ai_decisions` row to `journal_entries`, populated by `autopost_categorization` | **Open.** This is the finding an examiner would open with |
| F-5 | **P1** | The only control against a wrong entry is a human tapping approve, and the product markets that tap as effortless | `GUARDRAILS.md:70-76` establishes that autonomy is off and everything runs at 100% human review, which is the right posture. It also means the sole control is the owner's attention. `journal_entries.approved_by` records who approved (`20260628160000:79`) and a CPA cannot self-approve (`20260702000000:159-161`), which is a real maker-checker rule, but there is none for the owner. Meanwhile `README.md:48` says "You confirm with one tap". A one-tap confirm is not a review, and nothing in the product tells the user that their tap is the control | Say it in the product and in the onboarding: approval is the control, and the owner who approves owns the entry. This is a copy and product decision more than a code change, which is why it is P1 rather than P0 | **Open** |
| F-6 | P2 | Cross-source deduplication relies on an advisory lock rather than a unique constraint | `20260704040000_w2_crosssource_ingest_dedup.sql:183-193` documents its own gap in a comment: a read-then-write with no unique constraint on the org, bank, and content hash, serialised only by `pg_advisory_xact_lock` at `:193`. `import_rows.external_id` is a plain text column with no index (`20260701200250_reconcile_import_rows_external_id.sql:19`). The single-source paths are all correctly protected by `unique (org_id, idempotency_key)`; this is the one seam that is not | Add the unique index on the content hash and keep the advisory lock as an optimisation | **Open.** Credit for the comment: the code names its own weakness, which is how it was found |

**What genuinely holds, and it is better than a lot of production accounting
software.**

- **Money is integers all the way down.** `journal_lines.amount_minor` is a `bigint`
  with a non-negative check, and the sign is carried by a `side` column constrained
  to `D` or `C` (`20260628160000_phase2_ledger_core.sql:92-94`). A sweep of the
  repository found no `numeric`, `float`, or `double precision` money column
  anywhere. The only `numeric` values in the money path are an FX rate and a cost in
  dollars, both correct uses. This is the single most common way small accounting
  systems go wrong and it has simply been avoided.
- **Double entry is enforced by the database, not by application code.**
  `journal_lines_balanced` is a `deferrable initially deferred` constraint trigger
  per entry and currency (`:105-129`), so it fires at COMMIT and cannot be evaded by
  ordering. There is a second net-zero base-currency trigger for the multi-currency
  case (`20260707060000_w5_4_currency_catalog.sql:104-127`), and the RPC re-checks
  as belt and braces (`20260629125000:243-245`). Tests assert the constraint fires
  with the right SQLSTATE (`supabase/tests/phase2_ledger_test.sql:37-44`).
- **The journal is genuinely append-only, with reversal as the correction
  mechanism.** `journal_lines_immutable` blocks UPDATE and DELETE outright, with an
  error that tells the caller to post a reversing entry (`:133-141`), and
  `journal_entries_guard` freezes every field except `status` and `approved_by`
  (`:146-170`). That is the correct accounting model, and it is enforced rather than
  documented.
- **Exactly-once posting is real.** `unique (org_id, idempotency_key)` on
  `journal_entries` (`:81`), with external keys encoded into it
  (`ext:plaid:<transaction_id>`, `ext:<provider>:payout:<id>`, and a content hash for
  CSV), a pre-check, and a `unique_violation` handler that returns the winner's row
  rather than erroring (`20260629125000:271-276`). Replay is tested and asserted to
  post nothing new (`supabase/tests/w2_3_plaid_ingest_test.sql:60-71`).
- **58 pgTAP files** exercise all of it. The one I would point at first is
  `20260702000000`, whose header comment at line 13 records that approval had been a
  back door into closed books, as a regression that was found, fixed, and then
  tested. A repository that catches its own control failure and writes down that it
  did is a repository whose other controls I am more inclined to believe.

**On the autonomy ramp.** It is currently off, and the derivation method is
documented with no numbers filled in. Taking the design on its merits, it is
responsible, and more careful than I expected:

- Trust is granted **per learned vendor rule**, not by a global switch
  (`GUARDRAILS.md:126-132`). This is the right unit. A rule with three matches has
  earned nothing regardless of how its neighbours performed, and the document says
  exactly that.
- The threshold is a **95% confidence lower bound** on the true clean rate, not an
  observed rate (`:102-113`), with a worked illustration of why 200 decisions at 98%
  supports a stronger claim than 100 at the same 98%.
- The observation window must span **at least one month-end close**, preferably two
  (`:117-123`), with the correct reasoning that bookkeeping error clusters at period
  boundaries.
- **Rollback is automatic and asymmetric** (`:135-143`): ramping up needs human
  approval, demotion does not, and a single safety or privacy failure demotes
  immediately without waiting for a rate.

Publishing the method and refusing to publish a number that has not been measured is
the correct call, and `:90-98` argues for it explicitly. My one substantive
criticism: the ramp has a rollback trigger for a rule but no kill criterion for the
product. There is no written answer to "at what measured accuracy do we conclude
this should not be sold to small businesses at all". See `DECISION_LOG.md` §4.

**What this review did not look at:** no database was run in this session, so every
claim here is read from migration SQL and pgTAP source rather than observed against
a live schema; also not examined were tax logic correctness, GAAP or IFRS treatment
of any specific account, the depreciation and fixed-asset engine, the 1099 and
e-file path, or multi-currency revaluation beyond confirming the balance trigger
exists.

### 4c. Data and research lead, eval review

Scope: whether the numbers in the repository's documentation can support the claims
made about the product.

| # | Rank | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| E-1 | **P0** | The LLM judge has never been validated against a human label, anywhere, and it holds escalation authority over money-critical answers | `packages/inference/src/judge.ts:449-456` lets a panel split set `escalated`, and `:619` turns that into the record's `gate_status`. Every test in `packages/inference/test/judge.ts` mocks the model with scripted verdict JSON, so it tests the plumbing and never the judgement. A repository-wide search for inter-rater agreement, kappa, or any judge-versus-human comparison returns nothing outside a design document. This is the gap that matters most, because the human labels **already exist**: `categorization_outcomes` (`20260702030000_categorization_outcomes.sql:28-47`) stores the approver, their role, and an authority weight distinguishing a CPA label from an owner label, and `docs/plans/categorization-multimodel-validation.md:19-21` correctly identifies that every approval is a labelled correct answer. The data is there and the comparison has not been run | A harness that replays judged `ai_decisions` rows against their `categorization_outcomes` label and reports agreement with a confidence interval. Until it exists, the only defensible statement is that the panel is unvalidated | **Open.** The correct claim today is "unvalidated", not "family-aware and fail-closed", which describes the architecture rather than the accuracy |
| E-2 | **P0** | The eval claims rest on 65 rows the author wrote himself, and one of the two sets scores 100% | `supabase/functions/_shared/conduit-ff/evals/categorize-labeled.json` is 40 synthetic rows across 11 accounts and 19 rules, disclosed as synthetic in its own `_about` field, which is to its credit. `evals/dataset.jsonl` is 25 invented gate cases. I ran `pnpm eval:gates` in this session: 100% precision, 100% recall, and 100% F1 on safety and privacy, 100% accuracy on the three structural gates. A hand-written set that the same author's regexes score perfectly on measures self-consistency, not capability. `judge.ts:222-226` is three regexes and `:237-238` is two; 8 safety cases and 6 privacy cases cannot distinguish "these regexes are good" from "these cases were written to match these regexes" | The gate set needs adversarial cases sourced from somewhere other than the author, and the honest headline for it is not 100% | **Open** |
| E-3 | **P1** | The 82.5% headline measures the path least in need of measurement | `docs/EVALS.md:222-224` states plainly that the eval runs the deterministic path only and that "The model / agent path is not exercised here." That path is `supabase/functions/_shared/conduit-ff/deterministic.ts:35-39`, a lowercased exact-or-substring match. Read precisely, 82.5% means "82.5% of these 40 rows contain a substring from these 19 rules", which is close to a tautology and cannot regress in an interesting way. The components with real failure modes are unscored: the bounded agent loop (`investigator.ts`, step cap 5 at `:93`), the difficulty router, and the BM25 retriever (`retrieval.ts`) | A labelled fixture of exactly the ambiguous rows the deterministic path declines, scored against the agent path with a mocked model, is the eval that would actually be informative | **Open.** The 82.5% figure is correctly caveated in `EVALS.md` and in `README.md:73`; the criticism is that it is the headline at all |
| E-4 | **P1** | The `/evals` harness is wired to nothing, and so are the two checks the docs themselves call release preconditions | `pnpm eval:gates` appears in no workflow (`docs/EVALS.md:167`, `:208-214`). `pnpm test:chat-latency` appears in no workflow, and `GUARDRAILS.md:46-48` calls it the gate that must pass before live-chat judging is enabled. `pnpm check:inference` runs only in `pages.yml`, which triggers on push to `main`, so a parity regression goes red after it lands. The release precondition for shipping LLM judging into live chat is therefore a command a human remembers to type | One `evals.yml` pull-request workflow running all three. This is roughly ten lines of YAML and it is the highest-leverage item on this entire page | **Open.** The docs already name this as the next action in three separate places, which is the right instinct; it just has not been done |
| E-5 | P2 | 82.5% on a synthetic fixture cannot support "autonomous 24/7 bookkeeper" | `README.md:44` versus `GUARDRAILS.md:70`. See §2 above | Copy change | **Open** |

**What genuinely holds.** The fixture discloses its own synthetic nature inside the
data file rather than only in prose, so the caveat travels with the data.
`docs/EVALS.md` §8a is an unusually candid table of which checks block a pull request
and which do not, including three rows that say "No". `GUARDRAILS.md:90-98` argues
explicitly for refusing to publish a threshold it has not measured, on the grounds
that a number in a document that calls its own rules non-negotiable reads as a
validated commitment. And the categorisation floor genuinely does gate a pull
request: `deno-tests.yml` runs `deno test --allow-env supabase/functions/_shared/`
recursively on any pull request touching `supabase/functions/**`, which picks up
`evals/categorize-eval.test.ts`, so a regression in the matching kernel really does
fail the build. That is a real gate. Very few repositories of this size are this
clear about which of their own checks are theatre.

**What this review did not look at:** no model was called and no API key was used,
so prompt quality and actual model output are entirely unexamined; also unexamined
were production cost and latency data (none exists), the demo Cloudflare Worker, the
479-case Vitest suite under `apps/app`, and the retrieval quality of the BM25
implementation beyond confirming it exists and has a grounding threshold.

---

*Related: [DECISION_LOG.md](DECISION_LOG.md) · [AUDIT.md](AUDIT.md) ·
[EVALS.md](EVALS.md) · [ai-quality-cost-layer/GUARDRAILS.md](ai-quality-cost-layer/GUARDRAILS.md)*
