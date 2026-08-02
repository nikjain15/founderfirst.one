# Decision log

Assumptions, decisions, and scope cuts, with the reasoning that produced them and
what would change them. Newest section first within each entry group.

**Honesty note.** Where an entry says a decision was "changed by review" or
"defended", the review in question was a **simulated** one: Nik Jain role-playing a
senior reviewer against his own code. No accountant, lawyer, security engineer, or
auditor has reviewed anything here. See [STAKEHOLDERS.md](STAKEHOLDERS.md) for the
full statement.

---

## 1. Assumptions currently load-bearing

These are beliefs the product is built on that have not been tested against a real
customer. Each is written here so it can be falsified rather than quietly assumed.

| # | Assumption | Why we believe it | What would falsify it |
|---|---|---|---|
| A1 | A founder will approve categorisations one at a time and that approval is a real review | The deterministic-first design means most rows are easy, so the tap is cheap | A design partner approving in bulk without reading, then finding errors at close. Nothing currently measures whether approval is attentive |
| A2 | The deterministic lexical matcher carries the bulk of real transaction volume | It carries 82.5% of a 40-row synthetic fixture (`docs/EVALS.md` §9a) | Real bank descriptions being messier than the fixture. This is likely. The fixture's vendor names are invented and clean; real feeds carry store numbers, city codes, and truncation |
| A3 | An unvalidated LLM judge panel is safer than no judge because it only escalates and blocks, never approves | `packages/inference/src/judge.ts:619` makes the worst status win, so a bad judge costs false escalations rather than bad entries | A false-negative rate high enough that the panel provides no signal, which is measurable and has not been measured (finding E-1) |
| A4 | Small businesses will accept that a human must check the books during early access | Untested. There is no design partner | A prospective customer walking away when told the autonomy is off |
| A5 | Reversal-only correction is acceptable to non-accountant users | It is correct accounting and the database enforces it (`20260628160000_phase2_ledger_core.sql:133-141`) | Owners finding a ledger they cannot edit confusing enough to abandon. The mitigation would be presentation, not schema |

---

## 2. Decisions these reviews defended

Places where a simulated reviewer pushed and the design held. Recording these
matters as much as recording the changes, because a review that only produces work
items is a review that was not honest about what was already right.

**D-A. Money as integer minor units, sign carried by a side column.**
Challenged as awkward for reporting. Defended. `journal_lines.amount_minor bigint`
with `side` constrained to `D` or `C` (`20260628160000_phase2_ledger_core.sql:92-94`)
is the reason there is no float anywhere in the money path, which is the single most
common failure mode in small accounting systems. Reporting awkwardness is a query
concern and query concerns lose to correctness concerns here.

**D-B. Double entry enforced by a deferred constraint trigger rather than in
application code.** Challenged as harder to debug and as an odd place for business
logic. Defended. `journal_lines_balanced` is `deferrable initially deferred`
(`:105-129`), so it fires at COMMIT and cannot be evaded by insert ordering, and it
holds against a direct `service_role` write that bypasses every RPC. An application
check would not. The RPC-level check at `20260629125000:243-245` stays as the
friendly error message, not as the guarantee.

**D-C. Append-only journals with reversal as the only correction.**
Challenged from a user-experience angle. Defended without reservation. This is what
makes the ledger auditable at all, and the error message already teaches the right
model to whoever hits it.

**D-D. The autonomy ramp documents a method and publishes no threshold number.**
Challenged as evasive. Defended, and this is the entry I would defend hardest.
`GUARDRAILS.md:90-98` gives the reasoning: that document declares its own rules
non-negotiable, so any number inside it reads as measured and validated. None have
been. Fixing the method first also removes the ability to choose a threshold after
the fact to fit whatever the data shows. Publishing a plausible-looking 90% today
would be worse than publishing nothing.

**D-E. Autonomy granted per learned vendor rule rather than by a global switch.**
Challenged as operationally heavy. Defended. `GUARDRAILS.md:126-132` has the
argument right: a rule with many clean matches has earned evidence about itself that
the system has not earned, and a rule with three matches has earned nothing
regardless of its neighbours. A global switch would let good rules vouch for bad
ones.

**D-F. Judges drawn from a different model family than the generator.**
Challenged as over-engineering for a solo product. Defended on cost grounds as much
as correctness grounds: `resolvePanel` (`packages/inference/src/judge.ts:201-218`)
routes the common case to cheap Workers-AI models and reserves Claude Sonnet for
financial floor gates, so family separation and spend discipline are the same
mechanism. The separate criticism, that the panel is unvalidated, is finding E-1 and
stands; it is a criticism of the evidence, not of the design.

**D-G. Fail closed on judge error or timeout.** Challenged as producing user-visible
failures on transient provider trouble. Defended. `judge.ts:619` computes
`failed_closed > blocked > escalated > passed`, and for a bookkeeping product a
question is always cheaper than a confident wrong number.

**D-H. The deterministic categoriser lives in one file imported by both the edge
function and the offline eval.** Defended. `deterministic.ts` is the same predicate
in production and in the eval, so the eval scores the shipped code rather than a
re-implementation. The criticism in E-3 is that this path is too simple to be worth
measuring, not that the sharing is wrong.

---

## 3. Decisions these reviews changed

**Nothing in the codebase was changed in this pass.** That was deliberate. The
deliverable was the review and the artifacts, and fixing a finding in the same
commit that reports it destroys the record of what the state actually was. Every
finding in [STAKEHOLDERS.md](STAKEHOLDERS.md) §4 is marked Open, with the file that
would fix it named.

What changed is what is written down, and three of those are substantive reversals
of a previously held position:

**C-1. "The docs are honest, therefore the product's claims are honest" is now
recorded as false.** The engineering documents are genuinely candid, and that had
been carrying an unearned sense that the overall claim set was fine. It is not.
`README.md:44` says "autonomous" and `GUARDRAILS.md:70` says autonomy is off. A
customer reads the first and never the second. This is now written as the single
biggest misalignment risk in [STAKEHOLDERS.md](STAKEHOLDERS.md) §2 rather than being
implicitly resolved in the docs' favour.

**C-2. "No accountant has reviewed this" is now a stated blocker rather than a
background fact.** It had been treated as something that happens later. It is now
listed first in the required-approvals section, and the ordering in the plan is
built around unblocking it, because four of the six required approvals depend on
having a design partner and real output first.

**C-3. `docs/AUDIT.md:38` is now known to be an unenforced assertion.** It requires
"`pnpm audit` shows no high/critical", scored as always P0 or P1. Running it in this
session returned 1 critical and 10 high across all dependencies, and 10 high with
`--prod`; GitHub's Dependabot alerts on the default branch report 107 advisories
including 5 critical. That line had been read as a description of the repository's
state. It is a description of an intention. The rubric line stays; what changed is
that the gap is recorded (finding S-1) instead of assumed closed.

---

## 4. Kill criteria

**There are no kill criteria today. None have been written, and none exist anywhere
in this repository.** This section does not invent one, because a number chosen now
would be exactly the false precision that `GUARDRAILS.md:90-98` correctly refuses
elsewhere.

What a real kill criterion would have to be, so that one can be written when there
is data to write it from:

- **A measured accuracy floor on real transactions, not on a fixture.** Below some
  rate of materially wrong entries per hundred, on live data from at least one
  business, across at least one month-end close, the product should not be sold to
  small businesses at all. The number cannot be chosen before the measurement exists,
  and it has to be a rate of *material* error, since a misfiled ten-dollar
  subscription and a misfiled payroll run are not the same event.
- **A correction-burden ceiling.** If the owner spends more time correcting Penny
  than they would have spent doing the books, the product is negative value even at
  a respectable accuracy rate. This is measurable from `categorization_outcomes`
  once real approvals exist, and it is arguably the more honest criterion of the two,
  because it is the thing the customer actually experiences.
- **A trust event that is not a rate.** One wrong number that a customer files a
  return from, or one cross-tenant data exposure, is a stop, not a metric. This one
  can be written today because it does not need data, and it should be.
- **A distinct criterion for the autonomy ramp versus for the product.**
  `GUARDRAILS.md:135-143` already has a rollback trigger for a single learned rule
  and for a cohort. There is no equivalent at the product level, and the ramp
  triggers should not be mistaken for one.

**Next action:** write the trust-event stop rule now, since it needs no data, and
leave the two rate-based criteria explicitly blank with their derivation method
recorded, exactly as the autonomy thresholds are handled today.

---

## 5. Scope cuts

Things deliberately not built, with the reasoning, so that "not built" is
distinguishable from "forgotten".

| Cut | Reasoning | Cost of the cut | Revisit when |
|---|---|---|---|
| ~~Retention and erasure jobs (`ai_decisions.retain_until` is a column with no reader)~~ **Uncut 2 Aug 2026** | Schema first, jobs later, because the schema shape is the expensive thing to get wrong | Finding S-3. The documented 90-day window did not run, so prompts containing transaction PII accumulated without limit | **Done.** `20260802140000_sh9_retention_and_erasure.sql` schedules `ai-decisions-retention-daily` (de-identify, not delete, per D24) and `penny-site-chats-purge-daily`, and adds `ai_erase_tenant` / `admin_erase_org_ai_data`. See D-N1 below for why the doc is now generated |
| Source-correct SQL reconciliation gate is built and tested but not wired to call sites | The gate is only meaningful once financial answers have a stable shape to reconcile against | `EVALS.md:194` names this the top eval-roadmap item, and `GUARDRAILS.md:161-163` correctly makes it a hard precondition for any financial autonomy | Before a financial use case advances past 100% review |
| Security tooling in CI: dependency audit, secret scanning, SAST, lint, repo-wide typecheck | Eighteen bespoke guard scripts were written instead, each targeting a failure mode that had actually occurred. That was the right instinct and it produced better guards than a generic linter would have | Findings S-1 and S-4. The bespoke guards catch known failure modes; nothing catches unknown ones, and a live audit failed the repo's own rubric | **Mostly done 2 Aug 2026.** `.github/workflows/security.yml` adds the audit gate, gitleaks, and CodeQL. **Still cut:** eslint and a repo-wide `tsc --noEmit`, and the 12 orphaned `eslint-disable` comments that suppress a linter nobody runs |
| ~~Plaid token encryption~~ and ~~Xero token encryption~~ **both uncut** | Sequencing. The encryption work landed for the QuickBooks path and was not carried across. The 2 Aug entry also corrected the claim that Xero was already encrypted; it was not | Findings S-2 and S-7. The highest-value secret in the system was the one left in plaintext, and the second-highest stayed that way for another commit | **Done.** IQ-2 (`20260802120000`) for Plaid, IQ-3 (`20260802130000`) for Xero. No provider writes a plaintext connection token now. `external_connections.access_token` / `.refresh_token` are legacy-read-only, kept only for the `ext_connection_secrets()` fallback; dropping them is a later change |
| An eval for the agent path (`investigator.ts`, difficulty routing, BM25 retrieval) | The deterministic path was measurable offline with no key, no database, and no network, so it got measured first | Finding E-3. The components with real failure modes are unscored | Alongside E-1, since both need the same replay harness over `ai_decisions` |
| Wiring `eval:gates`, `test:chat-latency`, and `check:inference` into a pull-request workflow | Each was built as a harness first, with wiring deferred until its golden set was trusted | Finding E-4. Two of the three are called release preconditions in the docs and are enforced by human memory | Now. Roughly ten lines of YAML |
| Any real external review | Cost and stage. There is no revenue and no customer | The whole of [STAKEHOLDERS.md](STAKEHOLDERS.md) §3 | Legal review before data flows; the rest after a design partner exists |

---

*Related: [STAKEHOLDERS.md](STAKEHOLDERS.md) · [AUDIT.md](AUDIT.md) ·
[EVALS.md](EVALS.md) · [../LEARNINGS.md](../LEARNINGS.md)*

---

## 6. Decisions made in the 2 Aug 2026 security pass

New decisions, recorded here rather than only in commit messages, because each one
constrains future work.

| # | Decision | Alternative rejected | Why | What would change it |
|---|---|---|---|---|
| D-N1 | **A retention window may be documented only when a job runs it.** `docs/DATA_RETENTION.md` is generated by `scripts/check-retention-doc.ts` from the `RETENTION` constant in `packages/inference/src/core.ts`, and the script fails when a rule declares a window whose named pg_cron job does not appear in `supabase/migrations/` | Writing the table by hand and being careful | Being careful is exactly what failed. `GUARDRAILS.md` stated a 90-day window, the column and its index existed, and no job was ever written. Nine documents described behaviour that zero lines of code performed. The link between prose and enforcement has to be mechanical | Nothing foreseeable. If the constant moves out of `core.ts`, the script's import moves with it |
| D-N2 | **The stored-prompt default is "redacted", not verbatim, and `financial` forces "none".** `resolveInputPolicy()` refuses to let a caller widen a financial use case | Keeping `storeInput` as a boolean and setting it to `false` at the financial call sites | The finding was not that the wrong flag was set; it was that the DEFAULT was wrong, so every future call site would inherit the unsafe answer by saying nothing. Fixing two call sites would have fixed two call sites | If a genuinely non-personal high-volume use case needs verbatim prompts for debugging, it opts in with `inputPolicy: "raw"`, which is visible in review |
| D-N3 | **Redaction is not claimed to be anonymisation.** `redactPii()` masks patterned identifiers and the docs say in three places that it cannot mask a merchant name | Claiming the redacted store is safe and allowing financial use cases to rely on it | A merchant name plus an amount plus a date identifies a transaction. Pattern matching cannot see that. Overstating what redaction achieves is how a real disclosure happens | A tokenising or entity-aware redactor, which would be a real project, not a regex |
| D-N4 | **An expired audit-allowlist entry fails the build.** `scripts/audit-gate.mjs` R2, with an R3 cap of 92 days so R2 cannot be dodged by an expiry in 2099 | Warning on expiry, which is the more common design and the one the prior art used | The prior art's entries expired silently and the allowlist became permanent. A warning is read for about a week. Renewal has to cost a reviewable commit that restates the reachability argument | Nothing. This is the mechanism, not a preference |
| D-N5 | **Reachability decides real severity, and the argument is stored next to the waiver.** Every entry in `.github/audit-allowlist.json` carries a specific, falsifiable sentence about why the vulnerable path is unreachable | Waiving by severity, or by "dev dependency" | "Dev dependency" is not an argument; `scripts/discord-bridge`'s `undici` was scoped runtime and was the only genuinely reachable high in the set, while five criticals were a test runner's UI server that is never started. The label was misleading in both directions | Nothing. If the argument cannot be written, the honest move is the upgrade |
| D-N6 | **Do not take the Astro 4 to 6 upgrade inside a security batch.** Five highs are waived until 2026-10-31 instead | Upgrading Astro to clear the last five highs | Astro 4 to 6 forces vite 5 to 6 and touches every page, layout and island on the live marketing site. Bundling that into a change whose purpose is "the security posture is now verifiable" would make the change unreviewable and put the site at risk for advisories that are all build-time or SSR-only, and the site is static | The expiry, which is the point of the expiry |
| D-N7 | **Gateway body logging is tied to the input policy, not configured separately.** `cf-aig-collect-log: false` is sent whenever the prompt is not stored verbatim | A separate per-use-case toggle for gateway logging | Two switches for one question drift apart, and the drift is invisible. If a prompt is not safe to keep verbatim in our own database, it is not safe to keep verbatim in Cloudflare's. Making it literally the same decision means it cannot be half-configured | A provider whose logging is genuinely needed for support, which would be an argued exception |
| D-N8 | **The incident runbook states what it cannot do.** RUNBOOK.md §6 lists the alerting gap, the learned-rule kill-switch gap, and the absence of bulk undo | Writing the procedure and leaving the gaps implicit | A runbook that reads as complete is worse than no runbook, because it stops the reader looking for the hole at the moment they most need to find it. The largest weakness in the AI incident path is that nothing pages anyone, and that belongs in the runbook, not only in a backlog | Building the alerting, at which point §6 shrinks |

## DL: apps/demo copy contracts and the suite nobody ran (2026-08-02)

**Decision.** `ERROR_COPY.founderInviteExpiredNotice` was a function in a bucket
whose every consumer renders the value directly. Moved to `TOAST_COPY` rather
than widening the test.

The test was right and the copy entry was wrong. `AuthGate.jsx` assigns
`ERROR_COPY.*` into a validation error object, `Chat.jsx` renders it into JSX,
and `my-books.jsx` puts it into state. None of them calls it. A function in that
bucket does not throw, it renders as nothing, so the narrow contract is doing
real work and widening it to accept functions would have removed the only thing
standing between that entry and a blank error message. `TOAST_COPY` is where
argument-taking copy already lives, ten entries of it, invoked at the call site.

**Also fixed: three buckets had no shape test at all.** `ONBOARDING_COPY`,
`THREAD_INTRO_COPY` and `CARD_FALLBACK_COPY` were unchecked, which is why a
stray shape could sit in a bucket indefinitely. They now assert the union they
legitimately use: strings, argument-taking templates, or frozen message objects.
Both new assertions were mutation checked by smuggling a function into
`ERROR_COPY` and an unfrozen object into `ONBOARDING_COPY`, and both turned the
suite red.

**Root cause, and the part worth remembering.** `apps/demo` had 94 tests and no
workflow. One had been failing since the code was imported. A suite that runs in
no workflow reports to nobody, so the failure was invisible rather than ignored.
`.github/workflows/demo-tests.yml` now runs the tests and the build, the latter
because `apps/demo build` runs `check-tokens.sh` first and would catch an
undefined design token.

**Left open deliberately, because it is a product copy decision and not a test
fix.** The whole invite block in `ERROR_COPY` is unused: `inviteExpired`,
`inviteRevoked`, `inviteAlreadyUsed` and `inviteNotFound` have zero consumers,
while `screens/cpa/AuthGate.jsx:165` hard codes "This invite has expired or been
revoked." instead. So the constants and the screen disagree about the wording,
and the constants are the ones nobody reads. Worth reconciling, by someone who
owns the wording.

## DL: the Astro waiver was tested and did not survive contact (2026-08-02)

**Decision. D-N6 is reversed. `apps/web` now runs Astro 7.1.6 and the five-entry
Astro waiver is deleted.** D-N6 said the Astro 4 to 6 chain was too big to take
inside a security batch. That was a reasonable guess. It was never measured. It
has now been measured, and it was wrong: `pnpm -C apps/web build` succeeded on
Astro 7 on the first attempt, with no config migration, no content-collections
work, and no source changes to any of the 37 files under `apps/web/src`. The
cascade D-N6 feared did not happen because `apps/web` has none of the surface it
would have hit. There is no adapter, no middleware, no content collections, no
`server:defer`, and the vite bump rides along inside Astro's own dependency
rather than through our config.

**The waiver was also the wrong shape, and that is the more useful lesson.** All
five entries argued reachability, and all five arguments were correct: the site
is static, so server islands, slot-name reflection and the host-header fetch are
genuinely unreachable. But a correct reachability argument answers "is this
dangerous", not "is this expensive". The waiver was renewed on the strength of an
argument that was never the binding question. The binding question was cost, and
nobody had priced it. Ninety days of waiver were bought with an unpriced estimate.

**What the upgrade actually cost: one line, and it is not free.** Astro 7's HTML
compressor deletes the newline between a run of text and a following inline tag
instead of collapsing it to a space. Astro 4 collapsed it. So prose written
across two source lines rendered joined: `/extension-privacy` shipped
"post'stext, author name, and link", and `/privacy` lost the spaces inside
"cookieless mode" and "service. Conversations". That is copy corruption on a
legal page, not a formatting nit. `compressHTML: false` in
`apps/web/astro.config.mjs` restores byte-for-byte identical rendered text on all
11 pages, verified by extracting visible text from both builds under a model that
treats inline tags as zero-width, exactly as a browser does. The cost is 7.2 KB
gzipped across the whole site, 56.4 KB to 63.6 KB, about 650 bytes a page. The
config comment says why, so the next person can retest and delete it.

**D-N9. Prefer one unreachable high to three reachable moderates.**
`react-router-dom` 6.30.3 carried `GHSA-jjmj-jmhj-qwj2`, an open redirect leading
to XSS, with no fix anywhere in the 6 line, plus two more that need 7.18.0. Going
to 7.18.2 closes all four and opens exactly one: `GHSA-qwww-vcr4-c8h2`, whose own
advisory text says it only affects applications using the unstable RSC APIs.
Neither app imports an `unstable_` export or anything from `react-router/rsc`;
both use `BrowserRouter` and nothing else. The number of open advisories went up
in severity and down in real exposure, and the severity column is the one that
lies here. The fix, react-router 8, requires React 19, so it waits for a React 18
to 19 migration and is waived until 2026-10-31 with that argument on the record.

**What is now uncovered rather than unfixed.** `scripts/audit-gate.mjs` knows
about three npm trees. It does not know about Python, and
`tools/kokoro-server/requirements.txt` and `tools/tts-server/requirements.txt`
pin `torch==2.6.0` against eight open advisories, three of which have no fix at
any version. Kokoro is live on Fly and is the default content-audio engine, so
this is shipped runtime code, not a dev tool. It was left alone because a torch
bump on a deployed inference service cannot be verified from this machine, and
taking it blind would be the exact move the allowlist exists to prevent. It is
recorded as a gap in coverage, not as a passed check.
