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
| Retention and erasure jobs (`ai_decisions.retain_until` is a column with no reader) | Schema first, jobs later, because the schema shape is the expensive thing to get wrong | Finding S-3. The documented 90-day window does not run, so prompts containing transaction PII accumulate without limit | Before any real bookkeeping data flows. `GUARDRAILS.md:221` already gates on this |
| Source-correct SQL reconciliation gate is built and tested but not wired to call sites | The gate is only meaningful once financial answers have a stable shape to reconcile against | `EVALS.md:194` names this the top eval-roadmap item, and `GUARDRAILS.md:161-163` correctly makes it a hard precondition for any financial autonomy | Before a financial use case advances past 100% review |
| Security tooling in CI: dependency audit, secret scanning, SAST, lint, repo-wide typecheck | Eighteen bespoke guard scripts were written instead, each targeting a failure mode that had actually occurred. That was the right instinct and it produced better guards than a generic linter would have | Findings S-1 and S-4. The bespoke guards catch known failure modes; nothing catches unknown ones, and a live audit fails the repo's own rubric | Now. This is the cheapest open item on the list |
| Plaid token encryption, while QuickBooks and Xero tokens are encrypted | Sequencing. The encryption work landed for the QuickBooks path and was not carried across | Finding S-2. The highest-value secret in the system is the one left in plaintext | Before production Plaid access, which is a hard external gate anyway |
| An eval for the agent path (`investigator.ts`, difficulty routing, BM25 retrieval) | The deterministic path was measurable offline with no key, no database, and no network, so it got measured first | Finding E-3. The components with real failure modes are unscored | Alongside E-1, since both need the same replay harness over `ai_decisions` |
| Wiring `eval:gates`, `test:chat-latency`, and `check:inference` into a pull-request workflow | Each was built as a harness first, with wiring deferred until its golden set was trusted | Finding E-4. Two of the three are called release preconditions in the docs and are enforced by human memory | Now. Roughly ten lines of YAML |
| Any real external review | Cost and stage. There is no revenue and no customer | The whole of [STAKEHOLDERS.md](STAKEHOLDERS.md) §3 | Legal review before data flows; the rest after a design partner exists |

---

*Related: [STAKEHOLDERS.md](STAKEHOLDERS.md) · [AUDIT.md](AUDIT.md) ·
[EVALS.md](EVALS.md) · [../LEARNINGS.md](../LEARNINGS.md)*
