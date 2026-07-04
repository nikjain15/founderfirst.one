# Roadmap v2 — the next big bets (post Waves 1–4)

> Status: DRAFT — awaiting Nik direction · 2026-07-03 · Owner: Nik

*Companion to [FULL_BOOKKEEPING_ROADMAP.md](FULL_BOOKKEEPING_ROADMAP.md) (the original mission,
Signals demand, and Wave 1–4 plan). This doc does NOT commit scope — it lays out **candidate
directions** for Nik to pick from. Nothing here is designed in depth; each candidate is sized
just enough to compare. When Nik picks, the winners become spec cards in
[BACKLOG.md](BACKLOG.md) per §4.3 of the roadmap, and the losers stay parked here.*

---

## Where we are

Waves 1–4 have shipped and been wave-gate-audited to `main` (== prod):

- **Wave 1** (PR #185) — the CPA tax-filing chain: bank reconciliation UI, TB/P&L/BS/GL
  exports (CSV + PDF), the data-driven **tax mapping engine** (jurisdictions → forms → lines →
  account-mapping rules as seed data) + year-end tax package, CPA Practice-home workqueue,
  CPA collaboration primitives, and learned-rules management.
- **Wave 2** (PRs #186–#188, #201–#202) — the demand wedges: catch-up mode, one-click QBO
  migration with history, Plaid bank feeds (sandbox live; production app-review is a Nik step),
  quarterly estimated-tax assistant, and 1099 contractor tracking.
- **Wave 3** (PRs #193–#197, #203–#204) — the human Penny layer for the owner: trust-tiered
  autonomy (≤5 asks/week), in-app Penny thread grounded on real books, 3-step onboarding,
  owner-Home "am-I-okay" pulse, and receipt capture — each wave-gate-audited (Wave-3 gate CLEAR).
- **Wave 4** (PRs #205–#210) — vertical + expansion: e-commerce payout splitting (Stripe/Shopify),
  GAAP cash-flow statement, opt-in invoicing + AR nudges, lender/due-diligence package, and the
  `/rescue` migration landing page. Wave-4 wave-gate audit closed clean (0 P0/P1, 3 P2, #210).

Supporting rails also landed: the knowledge kernel schema + seeds (CENTRAL-2), copy/Penny-language/
threshold centralization (CENTRAL-1), the regulatory-watcher routine (LOOP-2), the Build dashboard,
and the regression scenario pack.

**Wave 5 (in flight): hardening.** The current cycle is not new capability — it's paying down
the audit ledger's P2s, ratcheting regression coverage over everything Waves 1–4 added, and
proving the platform holds under the full-surface + adversarial treatment before we scale up
again. Roadmap v2 is about **what comes after hardening finishes.**

### What the mission still doesn't do

The north star is *"a CPA can open a client in Penny and file their taxes directly from it —
no re-keying."* Waves 1–4 got the books all the way to a **tax package export**. But the last
link — the CPA still exports and re-keys into tax software or e-files elsewhere — is unbuilt.
The tax package is a hand-off artifact, not a filed return. That gap, plus the deferred internal
admin console (IA-3) and the still-manual payroll/AP corners, is what the candidates below address.

---

## Candidate directions

Five candidates, each grounded in the mission, the Signals demand themes, or a known open gap.
Effort is T-shirt (S/M/L/XL); risk flags the thing most likely to sink it.

### A. Close the mission — assisted filing / e-file bridge

- **User problem / evidence.** The north star says *file taxes directly from Penny*. Today the
  CPA still exports a package and re-keys it into Drake/Lacerte/ProConnect or e-files elsewhere —
  exactly the "no re-keying" the mission promises to kill. Signals theme #4 (tax filing /
  quarterly / 1099 confusion, missed-deadline penalty anxiety) and #5 (trust — "no
  hallucination near my taxes"; verification is the moat) both point here. This is the single
  thing that turns Penny from "great books" into "files the return."
- **Rough scope.** A **filing bridge**, phased: (1) generate the return *worksheet* per form
  (Sch C / 1120-S / 1065 lines already exist as tax-mapped data) as a review-ready artifact with
  every line traced back to ledger entries (the "show your work" trust surface); (2) structured
  export in the format tax software imports (e.g. tax-prep import files / K-1 packages) so the
  CPA re-keys *nothing*; (3) longer-horizon — direct e-file via an IRS MeF provider/partner for
  the simplest returns. Sits on the existing tax mapping engine; adds a filing/worksheet layer.
- **Impact.** Highest — it's the only candidate that *completes the stated mission* and is the
  strongest trust + pricing moment (a filed return is worth far more than a package).
- **Risk / effort.** **XL, high risk.** Real e-file means IRS MeF authorization, a filing
  partner, per-form correctness liability, and a CPA-of-record review gate — regulatory and
  correctness stakes are the highest in the whole product. Recommend starting at **worksheet +
  structured-export** (M–L, much lower risk) and treating true e-file as a separate, gated bet.
- **Dependencies.** Tax mapping engine (shipped) · regulatory-watcher/kernel for law currency
  (shipped) · a Nik/CPA review gate · likely an external filing partner (decision-needed).

### B. Internal admin console (IA-3) — finish the platform's operations layer

- **User problem / evidence.** IA-3 was explicitly **deferred until Wave 1 shipped** (BACKLOG,
  Nik 3 Jul). Wave 1 is done, so the deferral condition is met. As the loop scales and real
  orgs onboard, staff operations (support, break-glass, quality, the Build dashboard, Signals,
  emails) are split between `founderfirst.one/admin` and the `/staff` lens; APP_PRINCIPLES §4
  calls for a single internal console at `penny.../admin` that mirrors and eventually absorbs
  `founderfirst.one/admin` — parallel-run, additive, never breaking `/admin`.
- **Rough scope.** Plan-then-build the migration: stand up `penny.../admin` mirroring the four
  admin tabs + ⚙️ Settings, parallel-run 1–2 months, cut over per APP_PRINCIPLES. Internal-facing,
  so lower design/trust bar than customer surfaces, but real IA work.
- **Impact.** Medium — operational leverage and one-source-of-truth for staff, not new customer
  value. Grows in importance as customer count and the loop's throughput grow.
- **Risk / effort.** **L, medium risk.** Main risk is a big-bang cutover breaking `/admin`
  (explicitly forbidden — must be additive parallel-run). Needs Nik sign-off on the migration
  plan first (that's the standing gate).
- **Dependencies.** Wave 1 done (met) · Nik approves the migration plan · no customer-facing
  blockers.

### C. Deeper CPA workflow — from "workqueue" to "practice operating system"

- **User problem / evidence.** Wave 1 gave CPAs a Practice home + collaboration primitives.
  Signals themes #2 (QuickBooks rage, switching intent), #3 ("need a bookkeeper", $200–350/mo,
  reconcile + categorize + monthly P&L/cash-flow + *responsive*), and #5 (provider-collapse
  rescues) describe CPAs and firms who'd move *books of many clients* if the multi-client
  workflow were genuinely faster than QBO. The gap between "we have a workqueue" and "a firm runs
  its month-end close across 40 clients here" is where retention and expansion live.
- **Rough scope.** Firm-level batch operations (approve/close across clients), a month-end close
  checklist per client with roll-forward, client-communication rail (request docs, chase
  missing statements), workpaper/adjusting-entry review flow, and per-firm SLA/response tracking
  (the "responsive" Signal). Extends existing CPA lens; no new schema spine.
- **Impact.** Medium–High — this is the wedge that converts *firms* (many seats) vs. single
  owners, and directly answers the loudest Signal (QBO switching).
- **Risk / effort.** **L, medium risk.** Risk is scope sprawl / re-creating QBO's complexity and
  violating the simplicity budget (standing principle #1). Must be designed workflow-inward, not
  feature-list-outward.
- **Dependencies.** Wave 1 CPA lens (shipped) · IA-2 Practice home (shipped) · exports (shipped).

### D. AP / bill-pay + vendor management

- **User problem / evidence.** Owners live in two halves: money in (invoicing, shipped W4.3) and
  money out. Money-out — bills, vendor payments, AP aging — is unbuilt. It ties into 1099
  tracking (shipped W2.5, vendors already modeled) and the "are my numbers real?" cash-flow
  clarity Signal (#8), since AP is half the cash picture. Note: the roadmap explicitly says
  **don't build payroll** (integrate Gusto instead) — this candidate is AP/bill-pay, *not* payroll.
- **Rough scope.** Bill capture (extends receipt capture), AP aging, scheduled/one-off vendor
  payments (likely via a payments partner rather than moving money ourselves initially), vendor
  records reused from 1099. Modular + opt-in, mirroring how invoicing shipped.
- **Impact.** Medium — completes the cash picture and is sticky, but it's expansion, not
  mission-completion, and moving money adds regulatory weight (money transmission).
- **Risk / effort.** **L–XL, medium–high risk.** If it actually *moves money* it's high risk
  (money-transmission licensing, fraud, payments partner). If it stops at bill-tracking + aging
  (no fund movement), it's L and low-risk. The scope decision is the crux.
- **Dependencies.** Vendors (W2.5, shipped) · receipt capture (W3.5, shipped) · a payments
  partner *only if* moving money (decision-needed).

### E. Production-readiness & scale — earn the right to onboard real customers

- **User problem / evidence.** The loop has run against prod with namespaced fixtures and a
  clean fixture purge, but the platform has not carried a real paying customer load. LEARNINGS
  is full of incidents (session leaks, migration drift, prod-ahead-of-main). Before we push
  growth (rescue landing pages, catch-up wedge marketing), we need onboarding at volume to be
  boringly reliable: billing/subscriptions live, observability + alerting, backup/restore
  drills, rate limits, SLOs, and a real support-at-scale path. Signal #5 (trust is the moat)
  says the *first bad number near someone's taxes* costs more than any feature.
- **Rough scope.** Billing/entitlements go live (plans already modeled in the kernel), an
  observability/alerting layer over the edge fns + workers, backup/restore + disaster-recovery
  runbook, load/soak testing of the ledger and Plaid sync paths, and a support-escalation SLA.
  Cross-cutting hardening, not a feature.
- **Impact.** High as an *enabler* — it doesn't add capability but it's the gate between "demo
  that works" and "business we can grow without an incident." Low visible value, high real value.
- **Risk / effort.** **M–L, low risk to build, high risk to skip.** The risk is *not* doing it
  and scaling into an incident that burns the trust moat.
- **Dependencies.** Wave-5 hardening finishing (in flight) is the natural on-ramp · billing
  partner already implied by the plans/entitlements kernel.

---

## Recommendation + open questions for Nik

**These are options, not commitments.** My read of the mission + Signals:

- **Sequence the mission-completing bet first, in its low-risk form.** Candidate **A**, scoped to
  **filing worksheet + structured export** (not true e-file yet), is the one direction that
  finishes the stated north star and is the strongest trust/pricing moment. It reuses the shipped
  tax engine and stays inside the current stack. True e-file becomes a separate, later, gated bet.
- **Run Candidate E (production-readiness) in parallel as the enabler** — it's the gate to
  actually onboarding the customers the wedges (catch-up, rescue) are already marketing to, and
  it's the natural continuation of Wave-5 hardening.
- **Then pick between C (deeper CPA workflow) and B (admin console IA-3)** for the following
  wave — C if the near-term goal is converting *firms* (many seats, loudest Signal); B if
  internal operational load from scaling is the bottleneck.
- **Hold D (AP/bill-pay)** until the money-movement scope is decided — it can be high-value at
  low risk (tracking only) or a licensing project (moving money); don't start it ambiguous.

**Open questions for Nik:**

1. **Is mission-completion (A) the next priority, or growth/scale (E) first?** They can run in
   parallel, but which leads?
2. **For filing (A): worksheet + structured-export only, or commit to true IRS e-file** (with a
   filing partner + CPA-of-record gate)? This is a big regulatory/liability call.
3. **Is now the time to un-defer IA-3 (B)?** Wave 1 shipped, so the deferral condition is met —
   do you want the migration plan carded for your sign-off?
4. **CPA depth (C): are we optimizing to convert firms (many seats) or single owners?** That
   changes whether C or the wedges come next.
5. **AP/bill-pay (D): tracking-only, or do we ever move money?** (Payroll stays out — Gusto
   integration, per the roadmap.)
6. **Which one thing, if it went wrong, would hurt most right now?** If it's "a wrong number
   near a filing," A's trust surface + E lead. If it's "we can't onboard fast enough," E + C lead.

Once you point, I'll turn the chosen direction(s) into BACKLOG spec cards (with the required
`workflow:` line, usability gate, and centralization gate) and park the rest here.
