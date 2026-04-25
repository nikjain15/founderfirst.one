# 04 — CPA Spec Buildability: Forensic Audit

**Audited:** 25 April 2026
**Surface:** `BookKeeping/demo/implementation/cpa-view-spec.md` v1.1, `implementation/cpa-data-model.md`, `screen-briefs/09-cpa-view.md` v1.1, `public/prompts/cpa-chat.md`. Cross-referenced against `BookKeeping/demo/CLAUDE.md`, `DESIGN.md`, and the post-SCAF founder code surface (`screens/`, `components/`, `constants/variants.js`, `util/irsLookup.js`, `util/cpaState.js`, `worker-client.js`).
**Ground truth:** the four CPA-spec files above are claimed (in `screen-briefs/09-cpa-view.md` line 5–14) to be sufficient — together with the demo-local CLAUDE.md and DESIGN.md — for a fresh Claude Code session to build any phase end-to-end without CEO input.
**Primary question:** can a fresh session build Phases 1–8 from these files alone, without asking Nik anything?

---

## How to read this file

Findings are grouped by **CPA build phase** (1–8), then by severity inside each phase. Cross-cutting findings appear in §X. Each finding carries:

- A **tag** — `[CURRENT]` (issue with the v1 demo build), `[FUTURE]` (will only matter when a fresh session builds it), or `[BOTH]`.
- An **AI-scalability impact** line describing what an agent gets wrong if the gap stays.

Severity buckets follow the convention from `01-founder-code.md`: Critical / High / Medium / Low.

---

## Counts

| Severity | [CURRENT] | [FUTURE] | [BOTH] | Total |
|---|---|---|---|---|
| Critical | 0 | 3 | 1 | **4** |
| High     | 1 | 9 | 4 | **14** |
| Medium   | 2 | 9 | 3 | **14** |
| Low      | 1 | 5 | 0 | **6** |
| **Total** | **4** | **26** | **8** | **38** |

**Buildability verdict:** **No** — a fresh session cannot build Phases 1–8 from the four CPA-spec files alone. Phase 1 is buildable with caveats (already partially built — `util/cpaState.js` exists). Phases 2–8 each carry at least one Critical or High ambiguity that forces an "ask Nik" decision. The single biggest blocker is the entity-type schema mismatch (§X.1) plus the unresolved hash-route vs path-route conflict (Phase 3, C2).

---

## Phase 1 — State scaffolding + approval card variant

### Critical

#### 1.C.1 — Fixture seed semantics undefined [BOTH]

**Severity:** Critical · **Files:** `cpa-data-model.md` "Seed file" section, `screen-briefs/09-cpa-view.md:402` (`public/config/cpa-fixture.json`).
**What is wrong:** The fixture sample shape declares `"seeded": { "learnedRules": 2, "flags": 3, "pendingAdds": 1, "approvalsPending": 2 }` — counts only. The text below says "On boot the CPA app reads this fixture, hydrates `state.cpa.clients`, and synthesizes realistic `flags`, `pendingAdds`, and `approvals` from the referenced scenario's ledger." But:
1. No selection rule for *which* ledger entries get flagged / become pending-adds / become approvals. (Random? First N? Last N? By category?)
2. No content rule for synthesized records — what reasons go on the flags? what notes? what `fromCategory`/`toCategory` for the synthesized reclassification approvals?
3. No mapping between fixture `clientId` and ledger ownership — scenarios are keyed by `{entity}.{industry}`, so two clients with the same scenarioKey would share the same ledger.
**Why it matters:** Phase 1 ships seed data. Two different agents will produce two completely different demo experiences from the same fixture. Worse, any synthesized `cpa-suggestion` approval needs a real `transactionId` that points into the founder's books — without a seed contract, the link is fictional.
**Fix:** Add a "Synthesis rules" subsection to `cpa-data-model.md` defining: (a) txn selection (e.g. "first N uncategorized in the scenario's `drilldown.ledger` for flags"), (b) per-record content templates, (c) per-clientId ledger isolation strategy. Pin a single canonical fixture in PR.
**AI-scalability impact:** Critical. Every new persona / scenario added later inherits the unspecified synthesis rule and the demo drifts.

### High

#### 1.H.1 — `ApprovalCard` `cpa-suggestion` prop contract undefined [FUTURE]

**Severity:** High · **Files:** `cpa-view-spec.md:62–65` (variant declared), `screen-briefs/09-cpa-view.md:48–50, 279–281, 414–415`.
**What is wrong:** Spec says the variant carries `currentCategory`, `suggestedCategory`, `cpaName`, `cpaNote`. But the existing `ApprovalCard` accepts a single `card` object (per `screens/card.jsx`) with a documented shape — there is no spec for how those four CPA-specific fields slot into that object. Are they top-level on `card`? On `card.cpaSuggestion`? Where does the `approvalId` (needed to wire `approveApproval(id)`) live? `cpa-chat.md:71–88` defines copy rules but not the data contract.
**Why it matters:** A fresh agent will guess. Different guesses lead to different mutations and different worker-client context shapes, and the founder-side `approveApproval` plumbing breaks silently because there is no `approvalId` to dispatch.
**Fix:** In `cpa-data-model.md`, add a "Card variants" subsection with the exact shape passed to `ApprovalCard` for each of the four approval types (reclassification, year-access-request, cpa-added-txn, penny-question). Include `approvalId` as a required field on each.
**AI-scalability impact:** High — every new approval type added in the future will copy the variant pattern without an anchor.

#### 1.H.2 — How `cpa-suggestion` cards merge into Needs a look is undefined [BOTH]

**Severity:** High · **Files:** `cpa-view-spec.md:240–246`, `screen-briefs/09-cpa-view.md:434–435`.
**What is wrong:** "Wire `cpa-suggestion` cards into founder's Needs a look in `books.jsx`" — but `books.jsx` Needs a look currently surfaces flagged transactions (from `state.flagged`), not approvals. The spec does not say:
1. Whether approvals render *alongside* flagged txns or in a separate sub-list.
2. Sort order between the two lists.
3. Whether tapping a `cpa-suggestion` card opens the existing `FlaggedSheet` or a new sheet.
4. Whether the empty-state copy ("All caught up ✓") covers both lists.
**Why it matters:** Two agents will pick different placements, and the resulting demo experience for the founder is inconsistent.
**Fix:** Add a "Founder Needs-a-look composition" section listing the four sources (existing flagged, `cpa-suggestion`, `year-access-request`, `cpa-added-txn`, `penny-question`), sort key, and tap-target sheet for each.
**AI-scalability impact:** High — the founder's primary surface becomes ambiguous; future "add a new approval source" tasks will fork.

#### 1.H.3 — `approveApproval(id)` side-effects under-specified for `cpa-suggestion` [FUTURE]

**Severity:** High · **File:** `cpa-data-model.md:224`.
**What is wrong:** "If reclassification: applies the category change AND writes a new `learnedRules[]` entry." The mutation does not specify: (a) the `pattern` derivation (vendor exact? vendor prefix? `*` wildcard?), (b) whether to update existing matching txns or only future ones (the spec says "future" in §"The Learning Loop" but the contract is silent), (c) whether re-approval of a duplicate produces a new rule or upserts.
**Why it matters:** The learning loop is the moat. Two implementations will produce different rule databases.
**Fix:** Pin the pattern derivation rule and the future-vs-historical scope in the mutation contract.
**AI-scalability impact:** High — Penny's auto-suggest for future txns depends on this and will silently diverge.

### Medium

#### 1.M.1 — Tax readiness compute has no host function [FUTURE]

**Severity:** Medium · **File:** `cpa-data-model.md:274–295`.
**What is wrong:** Formula is given but no named function. Mutations say "Bumps `taxReadiness` recompute" — fresh agent has no entry-point name to call.
**Fix:** Add `recomputeTaxReadiness(clientId)` to the mutation contracts table and reference it from each mutation that triggers a recompute.
**AI-scalability impact:** Medium.

#### 1.M.2 — `state.cpa` shape not added to `DEFAULT_STATE` documentation [CURRENT]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:422–424` says "extend `DEFAULT_STATE` to include `state.cpa = { account: null, invites: [], clients: {}, approvals: {}, archives: {} }`."
**What is wrong:** `App.jsx`'s shallow-merge bug (`01-founder-code.md` B.4) means a returning user with stale localStorage will not pick up the new `state.cpa` keys. Phase 1 will silently fail for any tester who used the demo before. The spec does not flag this dependency.
**Fix:** Phase 1 checklist must include either (a) a localStorage migration on boot, or (b) deep-merging `DEFAULT_STATE.cpa` into `readState()`.
**AI-scalability impact:** Medium — every future state addition inherits the same shallow-merge trap.

### Low

#### 1.L.1 — Unit test in checklist is undefined [FUTURE]

**Severity:** Low · **File:** `screen-briefs/09-cpa-view.md:436` ("Unit test: approving a `cpa-suggestion` card writes a learnedRules entry").
**What is wrong:** No test framework convention pinned (the demo uses node test runner per `tests/validator.test.js` style); no fixture inputs given.
**Fix:** Reference the existing test pattern and provide minimal input.

---

## Phase 2 — Invite flow

### Critical

#### 2.C.1 — Existing `SendToCPASheet` structure not specified for refactor [FUTURE]

**Severity:** Critical · **Files:** `screen-briefs/09-cpa-view.md:438–445`, `cpa-view-spec.md:166–168`.
**What is wrong:** "Refactor `SendToCPASheet` in `books.jsx` into tabbed sheet (Send snapshot / Invite to live books)." The spec does not describe what's currently in `SendToCPASheet` — agent must read the founder code and decide what becomes "Send snapshot" tab. The existing sheet's buttons (per `screens/books.jsx`) include export modalities; whether they all collapse into "Send snapshot" or split is undefined. The decision is non-trivial because it affects the founder's only export path.
**Fix:** Snapshot the existing sheet's contents in the brief and prescribe the tab split.
**AI-scalability impact:** Critical — agent will likely move buttons in a way the CEO didn't intend.

### High

#### 2.H.1 — Day-7 / day-30 staleness scheduling mechanism undefined [FUTURE]

**Severity:** High · **Files:** `cpa-view-spec.md:270–275`, `screen-briefs/09-cpa-view.md:444–445`.
**What is wrong:** "Day 7: Penny surfaces a gentle re-surface card." There is no:
1. Scheduler (cron? on-mount check?) — the demo has no time service.
2. Time-acceleration affordance for demo (real-time waits or simulated time?).
3. Card variant — is it a new `staleness-reminder` variant or reuses `cpa-suggestion`?
4. Storage — does the day-30 opt-in live in `preferences` or a new field?
**Fix:** Decide demo strategy (suggest: dev-only "advance time" debug toggle; persist a `staleness.lastSurfacedAt` per `pendingAdds` entry).
**AI-scalability impact:** High — "scheduled prompts" is a recurring pattern; first implementation sets the template.

#### 2.H.2 — Invite link URL/token format undefined [FUTURE]

**Severity:** High · **Files:** `cpa-data-model.md:46–58`, `screen-briefs/09-cpa-view.md:65`.
**What is wrong:** Schema says `token: string, // single-use, 32-char random` but no:
1. URL template (`/cpa/accept/:token`? base host?).
2. Generation function (Web Crypto? `Math.random`?).
3. How "copy to clipboard" produces a URL the CPA can actually open in this demo.
**Fix:** Add a `inviteUrl(token)` helper in `util/cpaState.js`, prescribe Web Crypto for token gen.
**AI-scalability impact:** High — every share-link feature inherits this.

#### 2.H.3 — `notifyCpaActivity` toggle UI affordance undefined [BOTH]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:443`.
**What is wrong:** "Add `notifyCpaActivity` toggle to `avatar-menu.jsx` Preferences." Existing notification preference uses two-option pill ("Real-time" / "Daily digest"). New pref is three-option (`real-time` / `daily-digest` / `off`). Whether to extend the existing pill, add a new section, or use a different control is unspecified.
**Fix:** Pin the control type and section.
**AI-scalability impact:** Medium — preferences sprawl.

### Medium

#### 2.M.1 — "Your CPA" row content states undefined [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:442`.
**What is wrong:** Three states the row must render — (a) no CPA invited, (b) invite pending, (c) CPA active — are never enumerated, nor is the row's tap target for each.
**Fix:** Three-state table with copy + tap target.

#### 2.M.2 — Founder silent notification surface undefined [FUTURE]

**Severity:** Medium · **File:** `cpa-view-spec.md:170–174`.
**What is wrong:** "Founder is notified silently per `notifyCpaActivity`" — but there is no in-app notification surface. Where does this notification land? A toast? A new card in Needs a look? Nothing visible at all if `off`?
**Fix:** Define the channel for each preference value.

### Low

(none new)

---

## Phase 3 — CPA auth

### Critical

#### 3.C.1 — Path-route vs hash-route conflict unresolved [FUTURE]

**Severity:** Critical · **Files:** `screen-briefs/09-cpa-view.md:32, 448`, `cpa-view-spec.md:484`.
**What is wrong:** Spec says "URL: `/cpa` (path route, not hash route). The CPA app is a separate React entry from the founder demo at `/`. The build emits two HTML files (`index.html` for founder, `cpa.html` for CPA) or uses a single bundle with path-based routing — decide in Phase 3." The founder app uses hash routing (`#/books`, `#/avatar`). Switching to path routing requires server-side rewrites that the GitHub-Pages-style deploy (per `CLAUDE.md` deploy scripts) does not support. Two HTML entries is workable; path routing under GH Pages is not without a `404.html` workaround. Spec defers the decision but the deploy reality forecloses one option.
**Fix:** Pin `cpa.html` second-entry approach; remove the "or path-based routing" alternative.
**AI-scalability impact:** Critical — the wrong choice breaks the deploy and there is no early signal.

### High

#### 3.H.1 — `INTENT_MAP` overlay layering not specified [FUTURE]

**Severity:** High · **Files:** `screen-briefs/09-cpa-view.md:346–367, 416, 450–452`, `worker-client.js` (per founder-code audit, single-prompt-per-intent).
**What is wrong:** Spec asks `INTENT_MAP` to load `cpa-chat.md` "when context has `viewer_role: 'cpa'` or `variant: 'cpa-suggestion'`." Today's `INTENT_MAP` maps intent → one prompt file. Layering two files (intent overlay + cpa overlay) is a new mechanism. The spec does not describe:
1. Order of concatenation (CLAUDE.md says "appended on top of `penny-system.md` and on top of the intent-specific overlay" — i.e. last — but the worker-client.js loader does not yet support a list).
2. Whether the prompt-cache key incorporates the overlay (per founder-code observations, cache keys today use prompt+context hash).
3. How `INTENT_MAP` syntax extends to express conditional overlay.
**Fix:** Pin the loader extension and the cache-key change.
**AI-scalability impact:** High — every future overlay (e.g. accountant-tier voice, internal-tester voice) blocks on this mechanism.

#### 3.H.2 — License validation rules under-specified [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:67–69`.
**What is wrong:** "license number format (alphanumeric, 6–12 chars), license state in the 50-state list. Demo does not validate against a real license database." But:
1. Hyphens? Spaces? (Sample fixture has `"CA-112233"` which contains a hyphen but is 9 chars — does the regex include `-`?)
2. The fixture's `licenseNumber` does not match the documented "alphanumeric, 6–12" rule (it has a hyphen).
3. State list source is unspecified.
**Fix:** Pin the regex including allowed special chars; commit the 50-state list to a const.
**AI-scalability impact:** High — every form-validation pattern inherits this.

#### 3.H.3 — CPA session/auth state location undefined [FUTURE]

**Severity:** High · **File:** `cpa-data-model.md` does not mention session.
**What is wrong:** Once the CPA logs in, where does the auth state live? `state.cpa.account` only describes profile, not "is logged in". The CPA app must gate every screen on auth — but the gate's input field is undefined.
**Fix:** Add `state.cpa.session = { active, lastActiveAt }` to the schema, OR document that `account != null` is the gate.
**AI-scalability impact:** High.

### Medium

#### 3.M.1 — Invite-expired error page copy undefined [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:74–77`.
**What is wrong:** "Invite-expired error page + silent founder notification" — no copy registry entry in `constants/copy.js` is referenced; per settled-decision #19, every static Penny utterance must live there before the screen ships.
**Fix:** Add an `INVITE_EXPIRED_COPY` group and reference it in the brief.

---

## Phase 4 — CPA app shell

### High

#### 4.H.1 — Top nav contents undefined [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:83–84, 459`.
**What is wrong:** "Top nav (Penny wordmark + CPA account avatar dropdown)." Dropdown items, alignment, mobile collapse behavior are not specified.
**Fix:** Enumerate dropdown items (Profile · Sign out · ?) and mobile behavior.
**AI-scalability impact:** Medium.

#### 4.H.2 — Client-switch affordance undefined [FUTURE]

**Severity:** High · **Files:** `screen-briefs/09-cpa-view.md:127–143, 459`.
**What is wrong:** Per-client view shows "back to all clients" link in the sidebar (line 138), but a separate "client-switch affordance" is also called out (line 459) without definition. Is it a dropdown? A breadcrumb? Both? At what breakpoint?
**Fix:** One affordance, one location, one breakpoint behavior.

### Medium

#### 4.M.1 — `.cpa-app` CSS contract incomplete [FUTURE]

**Severity:** Medium · **Files:** `cpa-view-spec.md:425–428`, `CLAUDE.md` line referencing `.cpa-app`.
**What is wrong:** CLAUDE.md mentions `.cpa-app` z-index 199, pointer-events rules, and `position: relative`. The brief does not duplicate or reference these. A fresh agent reading only the four CPA-spec files (per the brief's "no other files needed" line 16) misses the contract.
**Fix:** Pull the .cpa-app contract into `cpa-view-spec.md` §"Brand & Design Tokens" or into the brief's design rules.

#### 4.M.2 — Responsive strategy implementation method ambiguous [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:127–134, 313–319`.
**What is wrong:** Three breakpoints listed but no decision between media queries vs container queries vs JS. The founder app uses CSS media queries; the CPA view's responsive needs (sidebar, optional detail pane) span multiple containers.
**Fix:** Pin "CSS media queries on `.cpa-app` root" and prescribe the breakpoint variable names.

### Low

#### 4.L.1 — Smoke test missing concrete pass criteria [FUTURE]

**Severity:** Low · **File:** `screen-briefs/09-cpa-view.md:460–462`.
**What is wrong:** "Shell renders at 375px AND 1280px with tab bar + content area" — no screenshot reference or automated test.

---

## Phase 5 — Per-client view (5 of 6 tabs)

### High

#### 5.H.1 — Books tab receipt-status data source undefined [BOTH]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:175`.
**What is wrong:** "Receipt status: `✓` text mark (present) or amber 'missing' badge." But fixture txns / scenario ledger entries don't carry a `hasReceipt` field — per `scenarios.json`, ledger entries have `vendor`, `amount`, `category_guess`, etc., not receipt presence. How is "present" determined?
**Fix:** Either add `hasReceipt: boolean` to ledger entry schema (with a synthesis rule for the fixture), or rely on `flags[txnId].reason === "needs-receipt"` exclusively.
**AI-scalability impact:** High — every "receipt-aware" feature later inherits this gap.

#### 5.H.2 — `util/cashFlow.js` mapping table not pinned [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:237–242`.
**What is wrong:** "Seed mapping: income / expenses = operating; equipment purchases = investing; loan payments, owner draws, contributions = financing." The category set in the demo has 60+ labels per `irsLookup.js` / `categories.v1.json`. Three buckets, 60+ inputs, no full mapping. A fresh agent must invent it.
**Fix:** Commit a complete category → bucket table, sourced from categories.v1.json.
**AI-scalability impact:** High — Cash Flow numbers will diverge per session.

#### 5.H.3 — `TaxFormPreviewSheet` not extracted [FUTURE]

**Severity:** High · **Files:** `cpa-view-spec.md:386–388`, `screen-briefs/09-cpa-view.md:208–210`.
**What is wrong:** "Reuse `TaxFormPreviewSheet` (existing in `books.jsx`)" — but it's currently a local component in `books.jsx`. It must be extracted into `components/` to be reused. The brief does not list this extraction in Phase 5's checklist.
**Fix:** Add "Extract `TaxFormPreviewSheet` to `components/`" as a Phase 5 step; update `books.jsx` import.
**AI-scalability impact:** High — implicit pre-work that an agent can miss, then duplicate.

#### 5.H.4 — Empty states for 4 of 6 tabs missing [FUTURE]

**Severity:** High · **Files:** `screen-briefs/09-cpa-view.md` Tabs 1–4.
**What is wrong:** Only LearnedRules has an empty-state line ("No rules yet…", line 269). Work Queue, Books, P&L, Cash Flow, Chat — no empty-state copy. Per settled-decision #19, all empty-state strings must live in `constants/copy.js`. A fresh agent would invent copy.
**Fix:** Add empty-state lines to `EMPTY_STATE_COPY` for each tab; reference from the brief.

#### 5.H.5 — Year selector "no granted years" state undefined [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:140–142`.
**What is wrong:** New CPA accepting an invite gets current-year grant (`acceptInvite` mutation, line 217). What renders if `yearGrants` is empty (e.g. founder revoked current-year mid-session)? Spec is silent.
**Fix:** Define the empty-state and whether the CPA is locked out entirely.

### Medium

#### 5.M.1 — Filter bar behavior across tabs undefined [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:183`.
**What is wrong:** Books tab has filter bar; P&L and Cash Flow have only Monthly/Quarterly/Annual toggle. Whether filters persist across tab switches, whether they persist across sessions, and whether the URL reflects them is undefined.
**Fix:** Pin filter persistence (suggest: per-tab session-scoped, no URL).

#### 5.M.2 — Penny-question candidate data structure not in schema [FUTURE]

**Severity:** Medium · **File:** `cpa-data-model.md:169` (`candidates: string[] | null`).
**What is wrong:** Penny-question approvals show "Penny's candidates + free-text answer" (brief line 158). Schema has `candidates: string[]` but no field for the question text itself. `note` is generic.
**Fix:** Add `question: string` to penny-question approvals.

#### 5.M.3 — Add-transaction sheet missing fields [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:178–180`.
**What is wrong:** Lists date, vendor, amount, category, receipt — but the data model has additional persisted fields (`addedBy`, `addedAt`). Whether the form computes these or asks is unclear.
**Fix:** Mark which fields are user-input vs auto-computed.

### Low

#### 5.L.1 — Multiple Toast `bottom={24}` callsites repeat the constant [CURRENT]

**Severity:** Low · **File:** `CLAUDE.md` SCAF-6 entry.
**What is wrong:** Every CPA Toast renders with `bottom={24}` — 5+ callsites. A `<CpaToast>` thin wrapper would prevent drift if the value changes.
**Fix:** Optional — add `<CpaToast>` or document the constant.

#### 5.L.2 — IRS chip data row reuse undocumented [FUTURE]

**Severity:** Low · **File:** `cpa-view-spec.md:411`.
**What is wrong:** New token `--fs-data-row` defined but not documented in DESIGN.md companion entries.

---

## Phase 6 — CPA overlays on Books

### High

#### 6.H.1 — Suggest-reclassification category source undefined [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:474–476`.
**What is wrong:** Suggest sheet uses category picker. Founder app loads categories from `industries.json` merged with `DEFAULT_CATEGORIES` (per `card.jsx`). For the CPA suggesting on a client's txn, which industry list is loaded — the client's industry, or a CPA-superset?
**Fix:** Pin "the client's industry" and document fallback when the client's industry has no list.

#### 6.H.2 — Receipt upload demo behavior undefined [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:477`.
**What is wrong:** Add-transaction sheet supports receipt upload. Demo mode behavior (file size, formats, where the blob is stored, how `receiptUrl` is generated) is unspecified. The founder Add-tab photo flow uses an in-memory blob URL.
**Fix:** Reuse the founder app's blob-URL pattern; document.

### Medium

#### 6.M.1 — Annotate UI specifics undefined [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:474`.
**What is wrong:** Annotation: max length, multi-line, formatting allowed?
**Fix:** Pin max length (suggest 500 chars), plain text, multi-line.

#### 6.M.2 — Founder-side detection of new approvals undefined [BOTH]

**Severity:** Medium · **Files:** Phase 6 checklist + `books.jsx` integration.
**What is wrong:** When CPA writes an approval, founder's `books.jsx` must surface it in Needs a look. Across browser tabs / localStorage events / poll? Spec is silent; `localStorage` events would be the natural mechanism.
**Fix:** Document the cross-app sync mechanism (suggest `storage` event listener).

---

## Phase 7 — Chat tab

### High

#### 7.H.1 — Voice activation logic location undefined [FUTURE]

**Severity:** High · **Files:** `cpa-chat.md`, `screen-briefs/09-cpa-view.md:351–356`.
**What is wrong:** "Activated by `viewer_role: 'cpa'` in context block, OR `card.approval` called with `variant: 'cpa-suggestion'`." But which layer enforces it — the CPA chat screen, the worker-client, or the worker itself? Spec says `INTENT_MAP` does it (line 358) but the existing `INTENT_MAP` keys by intent name only.
**Fix:** Pin the enforcement point (worker-client.js loader) and provide pseudocode.

#### 7.H.2 — Loading + error states for CPA chat undefined [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md` Tab 5.
**What is wrong:** No defined loading copy ("Thinking…" lives in `ERROR_COPY` per CLAUDE.md SCAF-3, but the brief doesn't reference it) or no-data fallback.
**Fix:** Reference the existing `ERROR_COPY.cpaChatThinking` / `cpaPennyNoData` keys.

### Medium

#### 7.M.1 — `ledgerSummary` shape undefined [FUTURE]

**Severity:** Medium · **File:** `cpa-chat.md:175`.
**What is wrong:** Context contains `ledgerSummary: { ... }` — opaque. The founder-side `books.qa` may have a different summary shape. CPA-chat needs a defined shape so prompts can reason.
**Fix:** Document `ledgerSummary` shape once, share between both.

---

## Phase 8 — Multi-client dashboard

### Critical

#### 8.C.1 — Phase 8 detail far thinner than per-client tabs [FUTURE]

**Severity:** Critical · **File:** `screen-briefs/09-cpa-view.md:80–122, 487–491`.
**What is wrong:** Phase 8 checklist is **4 lines**:
> - [ ] `screens/cpa/Dashboard.jsx`
> - [ ] Global work queue across all clients
> - [ ] Client card grid with tax-readiness bands
> - [ ] Dashboard search (P1 — optional in v1 MVP)

Compare Phase 5 (~30 lines). Many concrete decisions are missing:
1. Empty state when CPA has 0 clients (new account just signed up).
2. Client card "open items count" — sum of which fields?
3. Client card "pending approvals count" — `approvals[].status === "pending"` filtered by `clientId`?
4. "Last activity timestamp" — no `lastActivityAt` field exists in the schema. Computed from what?
5. Add-new-client entry point on dashboard? Or only via founder-initiated invite?
6. Sort/filter on cards.
7. Mobile dashboard layout (375px) — the brief says "single column at 375–767px" for cards but does not address the global work queue layout below 768px.
8. Top-nav avatar dropdown (already flagged 4.H.1) is most-visible on dashboard.
9. Pagination if a CPA has 50+ clients (per persona description "10–50+ clients").
**Fix:** Expand Phase 8 to spec parity with Phase 5: enumerate every card field with its data source, define empty states, mobile layout, pagination strategy, and search behavior (even if P1).
**AI-scalability impact:** Critical — Phase 8 is the entry surface every CPA sees first; ambiguity here is most-visible.

### High

#### 8.H.1 — `lastActivityAt` field missing from schema [FUTURE]

**Severity:** High · **Files:** `cpa-data-model.md` schema, `screen-briefs/09-cpa-view.md:120`.
**What is wrong:** Client card shows "Last activity timestamp" — no field exists. Synthesizable from `MAX(annotations[].createdAt, flags[].flaggedAt, pendingAdds[].addedAt, approvals[].createdAt)` per client, but this is not documented and the cost of recomputing on every dashboard render is non-trivial.
**Fix:** Add `clients[clientId].lastActivityAt: number` to the schema; bump on every mutation that touches that client.

#### 8.H.2 — Open-items count formula undefined [FUTURE]

**Severity:** High · **File:** `screen-briefs/09-cpa-view.md:118`.
**What is wrong:** "Open items count" — uncategorized count? Unresolved flags? Both?
**Fix:** Pin the formula.

### Medium

#### 8.M.1 — New CPA empty state undefined [FUTURE]

**Severity:** Medium.
**What is wrong:** A CPA who signs up via invite has exactly one client at first (the inviter's). What if the invite mutation fails? What does the dashboard show with zero clients?
**Fix:** Define zero-client empty state copy.

#### 8.M.2 — Tax-readiness band on Open CTA conflict [FUTURE]

**Severity:** Medium · **File:** `screen-briefs/09-cpa-view.md:117–121`.
**What is wrong:** Card has `var(--error)` 3px left border for 0–69 readiness AND a `var(--error)` "pending approvals" badge. If both are present the visual treatment competes.
**Fix:** Pin priority — flag dominates, or document side-by-side behavior.

### Low

#### 8.L.1 — Dashboard route default undefined [FUTURE]

**Severity:** Low.
**What is wrong:** After login, does CPA land at `/cpa` (dashboard) or `/cpa/dashboard`? Both are referenced.
**Fix:** Pick one canonical URL.

---

## §X — Cross-cutting findings (all phases)

### X.1 — Entity-type schema mismatch — Critical [BOTH]

**Severity:** Critical · **Files:** `cpa-data-model.md:65`, `constants/variants.js` (`ENTITY_TYPES.LLC_SINGLE`, `LLC_MULTI`, `PARTNERSHIP`), `cpa-view-spec.md:117–118`.
**What is wrong:** The data model schema declares `entity: "sole-prop" | "llc" | "s-corp" | "partnership"` (4 values, generic LLC). The runtime `ENTITY_TYPES` enum (post-SCAF-2) has 6 values: `SOLE_PROP, S_CORP, LLC, LLC_SINGLE, LLC_MULTI, PARTNERSHIP`. The 01-founder-code v2 audit (M5) also flags that LLC dual-path entities are defined but not demonstrated.
**Why it matters:**
1. CPA work-queue grouping by entity uses a different value set than founder-side approval cards.
2. IRS-chip routing (`util/irsLookup.js`) handles 4 entity values; for `llc-single` it falls back; for `llc-multi` it should route to Form 1065 but the schema doesn't allow that value.
3. Tax-readiness score formula is identical across entities (per `cpa-data-model.md:285–288`); whether S-Corp owners-draw should weight differently is a real product question the spec dodges.
4. P&L grouping by IRS form: spec says "grouped by IRS form section" but does not specify the four (or six) form templates.
**Fix:** (a) Reconcile schema with `ENTITY_TYPES` enum — pick one source. (b) Add Form 1065 routing to `irsLookup.js` and at least one `llc-multi` fixture client. (c) Pin tax-readiness weights per entity (or document that they are entity-agnostic).
**AI-scalability impact:** Critical. Every entity-aware feature (P&L grouping, IRS chips, tax-readiness, learned-rules scope) inherits the mismatch.

### X.2 — Tax-readiness "tunable during build" is an open question [FUTURE]

**Severity:** High · **File:** `cpa-data-model.md:285–286`, `cpa-view-spec.md:435`.
**What is wrong:** "Weights are tunable during build; start with: uncategorizedWeight = 3..." — there is no decision in either spec. A fresh session must either ship the seed weights as final or ask Nik. Per the brief's "do not ask" mandate, defaulting silently is the only path — which means the "tunable" affordance is a no-op.
**Fix:** Lock the weights as v1 final or remove the "tunable" hedge.

### X.3 — Cross-tab/state sync mechanism undefined [BOTH]

**Severity:** High · **Files:** Founder app and CPA app share `state.cpa` but run in separate browser tabs / HTML entries.
**What is wrong:** A `localStorage` write in the CPA app does not auto-update the founder app's React state without a `storage` event listener. The founder code today does not have one. Two-tab demo flow (founder mobile + CPA desktop in adjacent windows) is implicitly required for any compelling CPA demo.
**Fix:** Add a `storage` listener to `App.jsx` that triggers a re-read of `state.cpa`; document in Phase 1.
**AI-scalability impact:** High — every shared-state feature inherits this.

### X.4 — `viewer_role` context plumbing missing in worker-client [FUTURE]

**Severity:** Medium · **Files:** `cpa-chat.md:160–177`, `worker-client.js`.
**What is wrong:** The CPA voice overlay activates on `viewer_role: "cpa"`. No code path injects this — fresh agent must add it to every CPA-side `renderPenny` call. Spec mentions it but does not pin the helper.
**Fix:** Add a `cpaContext({ client, cpa })` helper to `util/cpaState.js`; require its use.

### X.5 — Spec uses `position: fixed` exception language inconsistently [FUTURE]

**Severity:** Medium · **Files:** `cpa-view-spec.md:427`, `CLAUDE.md` settled-decision #20 exemption rules.
**What is wrong:** Spec says "Never `position: fixed`." The token-discipline hook allows `// token-exempt:` overrides. Spec's "never" is absolute; CLAUDE.md's exemption is real. New agent must reconcile.
**Fix:** Mirror the exemption language in spec.

### X.6 — Banned emoji set list inconsistent [CURRENT]

**Severity:** Low · **Files:** `cpa-chat.md:44–46` ("🎉 👋 💪 are banned in CPA context. ✓ ... is fine"), `cpa-view-spec.md:332–335` ("the four approved Penny emoji (🎉 👋 ✓ 💪) are banned in CPA context"), `screen-briefs/09-cpa-view.md:331–335`.
**What is wrong:** `cpa-chat.md` lists three banned (`🎉 👋 💪`) and one allowed (`✓`). The brief lists all four banned then re-allows `✓` parenthetically. The order of operations is the same but the phrasing differs and a fresh agent reading only one of them gets the wrong inventory.
**Fix:** Use one canonical sentence in both files.

---

## Summary — what a fresh session can and cannot do

| Phase | Buildable cold? | Single biggest blocker |
|---|---|---|
| 1 | ⚠️ Mostly (already partly built) | 1.C.1 — fixture synthesis rules undefined |
| 2 | ❌ | 2.C.1 — existing SendToCPASheet not snapshot |
| 3 | ❌ | 3.C.1 — path vs hash route undecided |
| 4 | ⚠️ | 4.H.1 — top nav contents undefined |
| 5 | ⚠️ | 5.H.1 + 5.H.2 — receipt source + cashFlow mapping |
| 6 | ⚠️ | 6.H.1 — category source for suggest sheet |
| 7 | ⚠️ | 7.H.1 — overlay activation point in worker-client |
| 8 | ❌ | 8.C.1 — Phase 8 detail thin vs Phase 5 |

Cross-cutting (entity-type schema mismatch — X.1) is the highest-leverage single fix and unblocks 8+ findings. After X.1, the next two highest-leverage fixes are 1.C.1 (fixture synthesis) and 8.C.1 (Phase 8 detail expansion).

---

*Last updated: 25 April 2026 — Phase-2 audit-4 complete. Next: 05-end-user-walkthrough.md.*
