# CLAUDE.md — Penny Demo Builder's Map

*Read this first. It tells you what to build, what to read, and what not to touch.*

---

## Changelog

### 25 April 2026 — rate limit resilience + session-fresh reset

**Problem:** Demo was returning "I couldn't get that right now." when multiple AI calls fired on load, because Anthropic's Tier 1 limit (30K input TPM for Sonnet) was exhausted within seconds of page load.

**Three fixes shipped:**

1. **Ambient calls → Haiku.** `thread.greeting`, `thread.idle`, and `card.approval` now route to `claude-haiku-4-5-20251001` (50K input TPM, ~20× cheaper). User-initiated calls (`thread.qa`, `books.qa`, `capture.parse`) stay on Sonnet. Routing lives in `AMBIENT_INTENTS` set in `worker-client.js`. Config token `ambientModel` added to `index.html` `PENNY_CONFIG`.

2. **429 backoff.** `guardrails/retry-on-fail.js` now has a `RateLimitError` class and `MAX_RATE_RETRIES = 2` budget with exponential backoff (8s → 16s). Previously a 429 was treated like a transient error and retried immediately (always failing). `worker-client.js` throws `RateLimitError` on 429 before passing to the retry wrapper. `ERROR_COPY.threadQaRateLimit` added to `constants/copy.js` with friendlier copy ("Give me just a moment — I'm catching up."); `thread.jsx` distinguishes `RateLimitError` from generic errors.

3. **Mount-time stagger.** Greeting call is deferred 800ms after mount; idle call is deferred 1.5s after queue exhaustion. Prevents all ambient calls from hitting the API simultaneously.

4. **Session-fresh reset.** App state (`penny-demo-state-v5`) moved from `localStorage` to `sessionStorage`. New tab or new browser session = fresh first-time onboarding. Refresh mid-walkthrough still works. AI response cache (`penny.cache.v1.*`) stays in `localStorage` — no reason to re-fetch.

**Settled decision 22:** ambient AI intents (`thread.greeting`, `thread.idle`, `card.approval`) always use `ambientModel` (Haiku). User-initiated accuracy-critical intents (`thread.qa`, `books.qa`, `capture.parse`) use `defaultModel` (Sonnet). Never collapse these tiers — the split is load management, not just cost.

**Settled decision 23:** demo app state is `sessionStorage`-scoped. Every new browser tab or session sees fresh onboarding. Never move back to `localStorage` — demo visitors must always experience the first-time flow.

---

### 25 April 2026 — phase-2-audit-3: config, data, and IRS taxonomy fixes (21 findings)

Full audit of `public/config/`, `util/irsLookup.js`, and IRS routing documentation. 4 Critical · 7 High · 6 Medium · 4 Low findings. All 21 fixed. Deployed to main as commit `bbe5ce0`.

**Critical fixes (C):**
- **C.1 — Persona key format mismatch:** personas.json keys changed from `__` to `.` separator to match scenarios.json convention (`sole-prop.consulting`, etc.). All 20 personas re-keyed.
- **C.2 — LLC dual-path split:** 4 generic LLC personas split into `llc-single.*` (SMLLC → Schedule C) and `llc-multi.*` (MMLLC → Form 1065). `variants.js` gained `ENTITY_TYPES.LLC_SINGLE` and `LLC_MULTI`. `scenarioKeyFor()` normalizes both to `llc` for scenarios.json lookup. `App.jsx`, `onboarding.jsx`, `Books.jsx`, `CashFlow.jsx` all updated.
- **C.3 — Hardcoded scenario fallback:** `"sole-prop.consulting"` string removed from `App.jsx`, `onboarding.jsx`, `cpa/Books.jsx`, `cpa/CashFlow.jsx`. Replaced with `DEFAULT_SCENARIO_KEY` from `constants/variants.js`.
- **C.4 — IRS label normalization gap:** `normalizeLabel()` added to `util/irsLookup.js` — lowercase + trim + collapse spaces + normalize apostrophes. Applied to all `IRS_LINE_MAP` lookups so labels with spacing/case/apostrophe variants match correctly.

**High fixes (H):**
- **H.1–H.5 — Missing IRS_LINE_MAP entries:** map expanded from ~55 to ~120 entries. New entries: COGS (Part III), vehicle fuel/depreciation variants, contractor variants, insurance generic, materials, permits, education, software variants, SEP-IRA, shareholder payroll, medical supplies, venue fees, event supplies, and more.
- **H.6 — COGS chip display:** "Part III" handled as special case — chip shows `"Sch C · Part III"` not `"Sch C · Line Part III"`.
- **H.7 — groupByIrsLine sort:** Part III appears first, then numeric lines, then suffixed (20a < 20b), then unmapped (null) last.

**Medium + Low fixes:**
- cpa-fixture.json client names aligned with personas.json (`Sarah Chen`, `Marcus Webb`, `Jake Torres`, `Mei Chen`).
- client-004 entity corrected: `"llc"` → `"llc-single"`.
- industries.json: `_meta.source` path fixed, `"QuickBooks"` → `"QuickBooks Invoices"`, `"Generic Vendor"/"Business expense"` → `"Notion"/"Software"`, `"SVB (First Citizens)"` → `"SVB (First Citizens Bank)"`.
- cpa-data-model.md: entity union updated to include `"llc-single" | "llc-multi"`. Seed file section corrected (array → object map).
- irs-routing.md: CHANGELOG reorganized; v1.3 entry added.

**Files changed (11):** `util/irsLookup.js` · `constants/variants.js` · `App.jsx` · `screens/onboarding.jsx` · `screens/cpa/Books.jsx` · `screens/cpa/CashFlow.jsx` · `public/config/personas.json` · `public/config/cpa-fixture.json` · `public/config/industries.json` · `implementation/cpa-data-model.md` · `implementation/irs-routing.md`

**Audit report:** `BookKeeping/reviews/demo-stress-test-apr-2026/03-config-data-irs.md`

---

### 25 April 2026 — SCAF-6: shared micro-components extracted

Four inline component patterns that were duplicated across 8 screen files are now canonical shared components in `components/`. Settled decision #21 added — never re-implement these inline.

**New files:**
- `components/Spinner.jsx` — rotating arc; `size` + `color` props. `@keyframes spin` lives in `styles/components.css`.
- `components/Toast.jsx` — auto-dismissing pill; `{ message, onDone, duration=2400, bottom=80 }`. Parent calls `setToast(msg)`; component owns the `setTimeout`. Always `position: absolute`.
- `components/VoiceWaveform.jsx` — animated bar array; `{ bars, isRecording }`. Renders `null` when `isRecording` is false. `@keyframes voiceBar` lives in `styles/components.css`.
- `components/EyebrowLabel.jsx` — `<p className="eyebrow">` wrapper for cases where a plain `<p>` would be structurally misleading.

**`styles/components.css` additions:** `@keyframes voiceBar` and `@keyframes pulseRing` moved from inline `<style>` tags to the shared stylesheet.

**Screens migrated (8 files):**
- `screens/books.jsx` — removed local Spinner, local Toast (pattern B → canonical pattern A), inline waveform bars, inline `<style>` block with all three keyframes.
- `screens/add.jsx` — removed local Spinner, local Toast, inline waveform bars, inline `<style>` block.
- `screens/invoice.jsx` — removed local Toast (pattern B → canonical).
- `screens/avatar-menu.jsx` — removed local Toast (pattern B → canonical, 4 render sites updated).
- `screens/cpa/Books.jsx` — removed local Toast (already pattern A; import replaces definition). Two inline eyebrow style blocks converted to `className="eyebrow"`.
- `screens/cpa/Chat.jsx` — removed local Toast.
- `screens/cpa/CashFlow.jsx` — removed local Toast.
- `screens/cpa/ProfitLoss.jsx` — removed local Toast.

**Toast API unification:** two patterns existed — (A) `{ message, onDone }` with useEffect auto-dismiss inside the component, (B) `{ msg }` CSS-class wrapper with `setTimeout` in the parent. Canonical is pattern A. All pattern B screens (books, invoice, avatar-menu) updated: `showToast` simplified (no setTimeout), Toast calls updated to `message` + `onDone`.

**`bottom` prop values:** `bottom={80}` (founder app, above tab bar, the default) vs `bottom={24}` (CPA view, no tab bar). All CPA screen Toast renders pass `bottom={24}` explicitly.

**Settled decision 21:** never re-implement Spinner, Toast, VoiceWaveform, or EyebrowLabel inline in a screen file. Import from `components/`.

---

### 25 April 2026 — SCAF-5: color-zone rule alignment

All accent-color violations are closed. Three background-fill violations were found and fixed; all other accent uses confirmed in-zone.

**Violations fixed:**
- `screens/books.jsx` — tax banner: `background: "var(--amber)"` (amber fill) → `background: "var(--paper)"` + `border: "1px solid var(--line)"`. SVG icon stroke and text colors updated from white to `var(--amber)` / `var(--ink)` / `var(--ink-3)`.
- `screens/books.jsx` — Books stat pill: amber-filled `<span>` wrapper removed → `<span style={{ color: "var(--amber)" }}>` text-only treatment (conditional on `totalFlagged > 0`).
- `screens/cpa/WorkQueue.jsx` — "Flag" button: `background: "var(--error)"` (error fill) → `background: "none"` + `color: "var(--error)"` + `border: "1.5px solid var(--line)"`. Error is text-only outside the documented 3px-left-border row exception.

**Audit scope:** all `--amber`, `--income`, `--income-bg`, `--sage`, `--error`, `--cat-*` token usages across every screen and component file. Zero additional violations found beyond the three above.

**Color zone rules unchanged** — SCAF-5 enforces the existing rules from the table in this file; no new zones were added.

---

### 25 April 2026 — SCAF-4: token-discipline sweep + pre-commit enforcement

Raw design-token values are now blocked at commit time. The four violation classes documented in DESIGN.md and the existing "Design token discipline" section of this file (raw hex strings, raw `fontWeight` numbers, raw `borderRadius` numbers, `position: fixed`) are caught by `scripts/check-tokens.sh` before every commit and again inside `npm run build`.

Per Q1 (CEO answer 25 Apr 2026): pre-commit grep hook, no new dependencies. ESLint deferred — revisit only if Phase 2 audits surface a violation that editor-time feedback would have caught.

**New:**
- `scripts/check-tokens.sh` — bash; greps staged `.jsx` files (or `--all` for the full tree) across the four classes; exits 1 on violation with file:line + a hint pointing at the right token. Permitted exemptions tagged `// token-exempt: <reason>` or `// radius-literal: <reason>`. Comment-only mentions of the rule (JSDoc bodies, `{/* ... */}` JSX comments) are filtered out via the `:\s*\*` and `\{\s*/\*` patterns.
- `.githooks/pre-commit` — one-liner that calls `scripts/check-tokens.sh`. Activated by `npm run prepare` setting `core.hooksPath` to `.githooks` — zero new deps, version-controlled hook.
- `package.json` — three script edits: `prepare` (auto-installs the hook on `npm install`), `build` (now runs `check-tokens.sh --all` before `vite build`), and a new `check:tokens` for on-demand runs.

**Sweep — Phase A fixes (4 token replacements + ~19 documented exemptions):**

Real token replacements (the rule was being violated, no exemption applied):
- `screens/invoice.jsx:106` — invoice preview card outer: `borderRadius: 12` → `var(--r-card)`.
- `screens/add.jsx:135` — Toast pill: `borderRadius: 999` → `var(--r-pill)`.
- `screens/add.jsx:476` — account-info monogram avatar (44×44): `borderRadius: 12` → `var(--r-card)`.
- `screens/add.jsx:644` — voice-waveform bar: `borderRadius: 99` → `var(--r-pill)`.
- `screens/books.jsx:1188` — Net hero card: `borderRadius: 16` → `var(--r-card-emph)`.

Documented exemptions (no named token exists; lines now carry `// radius-literal:` or `// token-exempt:`):
- All five provider-badge `borderRadius: 10` instances (`screens/add.jsx` Gmail / Outlook / provider-sheet / connections list / data-action row).
- All three icon-container `borderRadius: 8` instances in `screens/books.jsx` (28×28, 32×32, 36×36 paper-tinted icon tiles).
- Icon-container `borderRadius: 8` in `screens/cpa/App.jsx:292` — comment format upgraded from `/* icon container — no named token */` to `// radius-literal: icon container — DESIGN.md spec`.
- Three text-input / button `borderRadius: 8` instances in `screens/invoice.jsx` (input style helper, dashed add-line button, payment-method pill).
- Two textarea `borderRadius: 10` instances in `screens/add.jsx` (just-tell-me input).
- Toggle pill `borderRadius: 13` in `screens/avatar-menu.jsx:113` (half-of-26-height for the on/off switch).
- Inline category icon `borderRadius: 4` in `screens/card.jsx:91` (16×16 tinted square).
- Three progress-bar `borderRadius: 2` instances in `screens/books.jsx` (voice waveform bar + progress-bar track + fill — pure geometry).
- Two clipboard-textarea `position: fixed` instances in `screens/avatar-menu.jsx:313` and `screens/books.jsx:71` — off-screen DOM utilities for `document.execCommand("copy")`, never rendered. Tagged `// token-exempt: clipboard textarea utility — never rendered`.

**Already clean (zero hits — the SCAF-2/3 sweep work paid off):**
- Raw hex strings in JSX inline styles.
- Raw `fontWeight` numbers.

**CLAUDE.md amendment:** Settled decision #20 added — the new enforcement contract.

**Verification:** `bash scripts/check-tokens.sh --all` exits 0 against the cleaned tree. A deliberately-violating dummy file gets blocked by the pre-commit hook (smoke test).

**Out of scope for this commit (deferred):**
- Color-zone rule alignment — that's SCAF-5.
- `import.meta.env.BASE_URL` violations of settled decision #12 — could ride the same hook, but the proposal scopes them out; defer to SCAF-7.
- Dead code / duplicate CSS — SCAF-7.

**Settled decision 20:** raw design-token values are blocked at commit time and at build time by `scripts/check-tokens.sh`. Exemptions require an inline `// token-exempt:` or `// radius-literal:` tag.

---

### 25 April 2026 — SCAF-3 follow-up: Penny-voice form validation

The five CPA AuthGate form-validation strings in `ERROR_COPY`
(`fieldRequiredName`, `fieldInvalidEmail`, `fieldPasswordMin`,
`fieldLicenseFormat`, `fieldStateCode`) were rewritten in Penny's voice
per the CEO direction noted in the SCAF-3 changelog. No screen-file edits
— `cpa/AuthGate.jsx` already routes through the registry. Single-file
change in `constants/copy.js` plus this changelog note.

---

### 25 April 2026 — SCAF-3: constants/copy.js registry

Every static Penny utterance, fallback message, empty-state line, toast, and user-visible error now lives in one frozen module: `constants/copy.js`. Screens import from it; no screen hand-writes these strings. AI-generated copy still flows through `worker-client.js → renderPenny()` — the registry only owns STATIC fallbacks and acknowledgments.

**New:**
- `constants/copy.js` — six frozen top-level groups: `ONBOARDING_COPY` (the 8 locked headline/why pairs + welcome + pulling fallbacks), `THREAD_INTRO_COPY` (name/business intro + greeting/idle fallbacks + placeholders + header status), `CARD_FALLBACK_COPY` (every branch of `fallbackMsg()` + default CTAs + confidence-bar labels + CPA-suggestion variant labels), `EMPTY_STATE_COPY` (Needs-a-look empty, drill-down empties, memory empty, archived-work empty, CPA-side empties), `TOAST_COPY` (every toast across founder + CPA screens, grouped by source), and `ERROR_COPY` (Penny-voice qa errors + the five CPA AuthGate form-validation strings, extracted as-is — Penny-voice rewrite ships in a small follow-up commit).
- `tests/copy.test.js` — freeze checks for every group + nested onboarding row, byte-identical assertions for all 8 locked onboarding strings against the "Approved onboarding copy" table in this file, and shape tests for every interpolation function (`businessQuestion`, `greetingFallback`, `income`, `ownersDraw`, `lowConfidence`, `expenseDefault`, `changedTo`, `ruleCreated`, `booksSentToCpa`, `staleAddRedirect`, `alreadyConnected`, `providerConnected`, `emailConnectedWatching`, `importComplete`, `invoiceSent`, `recurringScheduled`).

**Refactored — screens import from the registry (13 files):**
- `screens/onboarding.jsx` — `FALLBACK_COPY` is now a thin alias over `ONBOARDING_COPY`. Pulling-step copy + WelcomeSpeech defensive defaults route through the registry.
- `screens/thread.jsx` — intro questions, placeholders, greeting/idle fallbacks, qa-error fallback, header status, confirmed-slug vendor fallback.
- `screens/card.jsx` — `fallbackMsg()` switches on `CARD_FALLBACK_COPY` per variant; CTAs, vendor fallbacks, sheet title, confidence labels, CPA-suggestion eyebrow/buttons, and every toast (`Got it ✓`, `Changed to ${cat}`, `Saved for later. I'll bring it back.`, `Auto-categorizing ${vendor} as ${category} going forward ✓`, `Category updated ✓`, `Kept as is.`).
- `screens/books.jsx` — `All caught up ✓`, all four `No data available.` / `No transactions found.` / `No expense data available.` empty states, the books.qa fallback, six toasts (`Detail data still loading.`, `Invite link created.`, `Invite revoked.`, `Books sent to ${cpaName} ✓`, the stale-add redirect, `Category updated ✓` + `Kept as is.` on cpa-suggestion approve/reject).
- `screens/add.jsx` — `No providers matched.` empty state and seven toasts (`Logged. I'll add it to your books.`, `Saved for later. I'll bring it back.`, `${name} is already connected.`, `${name} connected.`, `Account disconnected.`, `${name} connected — watching for receipts.`, `${count} transactions imported. Check your Penny thread.`, `Couldn't parse that. Try again in a moment.`).
- `screens/avatar-menu.jsx` — `Nothing here yet.` + `No archived work to show.` empty states, six toasts (`Invite link created.`, `Invite revoked.`, `CPA access removed.`, `Forgotten.`, `Entity type updated.`).
- `screens/invoice.jsx` — three toasts (`Invoice sent to ${email}.`, `Recurring ${freq} invoice scheduled ✓`, `Draft saved.`).
- `screens/cpa/Books.jsx` — seven toasts (`Transaction added — pending founder acknowledgment.`, `Transaction flagged.`, `Note saved.`, `Suggestion sent to founder for approval.`, `PDF export coming soon.`, `CSV downloaded.`, `Coming in Step 8.`).
- `screens/cpa/Chat.jsx` — `Ask about specific transactions, IRS lines, totals, or anything in these books.` empty hint, the `Thinking…` loading label, the `I don't have enough data to answer that right now.` no-data fallback, and the `Penny is unavailable right now.` toast.
- `screens/cpa/CashFlow.jsx` — `Export ready — demo only.` toast (× 2).
- `screens/cpa/ProfitLoss.jsx` — `Export ready — demo only.` toast (× 3).
- `screens/cpa/LearnedRules.jsx` — `No rules yet. Corrections you approve will appear here.` empty state.
- `screens/cpa/AuthGate.jsx` — five form-validation strings extracted to `ERROR_COPY` (extract-as-is in this commit; Penny-voice rewrite ships in a follow-up).

**Grep checks (all passing):**
- `grep -rE '"(Hi|Hello|Nice to meet|Let me|I.ll watch|Tap .Invite|All caught up)"' demo/screens` → 0 hits.
- `grep -rn 'Saved for later' demo/constants demo/screens` → only the registry definition + two import-call sites (`card.jsx`, `add.jsx`).
- `grep -rn 'All caught up' demo/constants demo/screens` → only the registry definition.

**Build verification:** `vite build` — 64 modules transformed (one more than SCAF-2's 63 due to the new copy.js). Both bundles compile cleanly. Test suite: 76/78 pass (21 variants + 48 copy + 7 of 9 validator; the 2 validator failures are pre-existing and untouched by this commit — empty diff vs. HEAD on `tests/validator.test.js` and `guardrails/`).

**Out of scope for this commit (tracked for follow-ups):**
- Sheet titles, eyebrow labels, screen titles (UI structural chrome — not Penny voice).
- Action-state button labels (`Sending…`, `Connecting…`, etc. — tightly coupled to local component state).
- Penny-tonal narrative helper text (e.g. `Things Penny has learned. Tap "Forget" to remove any rule.`, `Penny watches your inbox for receipts and invoices.`) — these are real Penny copy but were not enumerated in the SCAF-3 proposal; a separate commit may extract them.
- Penny-voice rewrite of the five CPA AuthGate form-validation strings (CEO-approved direction, 25 Apr 2026; ships as a small follow-up commit).

**Settled decision 19:** all static Penny copy lives in `constants/copy.js`. Never hard-code a static Penny utterance in a screen file. When adding a new static string (toast, empty state, fallback, error), add it to the registry first; the screen then imports.

---

### 24/25 April 2026 — SCAF-2: constants/variants.js registry

Every string literal that names a concept — card variants, entity types, industry keys, approval types, notification modes — now lives in one frozen module: `constants/variants.js`. Screens import from it; no screen hand-writes these strings. The two-helper naming collision on `formLabelForEntity` is resolved — short labels stay in `util/irsLookup.js` as `shortFormLabelForEntity`; full labels live on the new registry.

**New:**
- `constants/variants.js` — 5 frozen enums (`CARD_VARIANTS`, `ENTITY_TYPES`, `INDUSTRY_KEYS`, `APPROVAL_TYPES`, `NOTIFICATION_MODES`) plus 6 helpers (`isKnownVariant`, `isKnownEntity`, `isKnownIndustry`, `isSCorpOrLlc`, `isLlc`, `formLabelForEntity`).
- `tests/variants.test.js` — freeze checks for every enum, helper-routing suites, and coverage assertions that every industry key in `industries.json` and every entity prefix in `scenarios.json` is present in the enums.

**Renamed:**
- `util/irsLookup.js` — `formLabelForEntity` → `shortFormLabelForEntity`. Chip text ("Sch C · Line 24b", "1120-S · Line 19") unchanged. Internal callers (`irsLineChip`, `groupByIrsLine`) and external importers (`books.jsx`, `cpa/ProfitLoss.jsx`) updated.

**Refactored — screens import from the registry (9 files):**
- `screens/card.jsx` — `CARD_VARIANTS` for every `card.variant ===` comparison and the preview stub.
- `screens/books.jsx` — `CARD_VARIANTS`, `APPROVAL_TYPES`, `ENTITY_TYPES`, `INDUSTRY_KEYS`, `formLabelForEntity`. Tax-form-preview heading now drives from the helper, replacing the hand-rolled ternary.
- `screens/thread.jsx` — `CARD_VARIANTS` for the ConfirmedSlug income/owner's-draw branches.
- `screens/add.jsx` — `CARD_VARIANTS.BASE_EXPENSE` for stub cards; `ENTITY_TYPES.SOLE_PROP` for AI context defaults.
- `screens/avatar-menu.jsx` — `NOTIFICATION_MODES` for the CPA-activity picker; `ENTITY_TYPES` for the entity-change editor.
- `screens/onboarding.jsx` — `ENTITY_TYPES` for the entity picker, diagnostic resolver, and final-entity default.
- `screens/cpa/WorkQueue.jsx` — `APPROVAL_TYPES` for every priority filter and resolved-item branch.
- `screens/cpa/ProfitLoss.jsx` — uses `formLabelForEntity` (full) for the preview button label and `shortFormLabelForEntity` remains available from `util/irsLookup.js` for chip text.
- `util/cpaState.js` — `APPROVAL_TYPES` on every approval creation and dispatch branch.

**Grep checks (all passing):**
- `grep -rE '"income-celebration"|"owners-draw"|"rule-proposal"|"cpa-suggestion"|"variable-recurring"|"penny-question"|"year-access-request"' demo/screens` → 0 hits.
- `grep -rE '"base-expense"|"low-confidence"' demo/screens` → 0 runtime hits.
- `grep -rE '"reclassification"|"cpa-added-txn"' demo/screens demo/util` → 0 runtime hits.

**Settled decision 18:** every enum-typed string lives in `constants/variants.js`. Never hand-write one of these strings in a screen file. When adding a new concept-level string, add the enum member first; the screen then imports.

---

### 24 April 2026 — SCAF-1: canonical `<Sheet>` + `<FullScreenOverlay>`

Every bottom sheet and dark-scrim overlay in the demo (founder app + CPA view) now renders through two canonical components in `components/`. The two-pattern drift documented in `reviews/demo-stress-test-apr-2026/01-founder-code.md §A.1` is closed.

**New:**
- `components/Sheet.jsx` — canonical bottom sheet. Portal + backdrop + drag handle + ESC-to-dismiss + `sheet-slide-up` animation. Standard layout (title + scrollable body + optional sticky footer) plus a `layout="custom"` escape hatch for tabbed / bespoke sheets. `portalTarget` prop supports both `#sheet-root` (founder) and `#sheet-root-cpa` (CPA view).
- `components/FullScreenOverlay.jsx` — canonical dark-scrim overlay. Used by voice capture and photo-processing states.
- New CSS: `.sheet-header`, `.sheet-subtitle`, `.sheet-body`, `.sheet-footer`, `.fullscreen-overlay` in `styles/components.css`.

**Refactored (`createPortal` + raw `sheet-backdrop` removed from all screens):**
- `screens/card.jsx` — CategorySheet
- `screens/books.jsx` — SendToCPASheet · FlaggedSheet · TaxSheet · TaxFormPreviewSheet · DrilldownSheet
- `screens/add.jsx` — local `Sheet` scaffold is now a thin wrapper over canonical `<Sheet>`; all 5 sub-sheets unchanged at call sites. VoiceModal + PhotoOverlay use `<FullScreenOverlay>`.
- `screens/avatar-menu.jsx` — RevokeConfirmSheet · ArchivedWorkSheet · Entity-change confirm sheet
- `screens/invoice.jsx` — SendSheet · RecurringSheet
- `screens/cpa/Books.jsx` — AddTxnSheet · RowMenuSheet · FlagSheet · AnnotateSheet · SuggestReclassSheet
- `screens/cpa/LearnedRules.jsx` — ConfirmDeleteSheet
- `screens/cpa/WorkQueue.jsx` — ActionSheet

**Grep checks (all passing):**
- `grep -rE "className=\"sheet-backdrop\"" demo/screens` → 0 hits
- `grep -rE "createPortal" demo/screens` → 0 hits
- `grep -rE "position:\s*\"?fixed\"?" demo/screens` → only legitimate uses (clipboard textareas, doc comments)

**Build verification:** `vite build` — 62 modules transformed, both bundles compile cleanly.

**New settled decisions (16, 17):** all bottom sheets use `<Sheet>`; all dark-scrim overlays use `<FullScreenOverlay>`. See "Settled decisions — do not re-open" and "Shared components catalog" sections below.

---

### 24 April 2026 — CPA view spec locked (v1.1) — build-ready handoff

All 10 flow decisions, voice decision, responsive contract, and data model
are locked. A fresh Claude Code session can build from these files without
further input:

- `implementation/cpa-view-spec.md` v1.1 — full product spec with decisions log
- `implementation/cpa-data-model.md` — canonical `state.cpa` schema + mutation contracts
- `public/prompts/cpa-chat.md` — CPA voice overlay (new prompt file)
- `screen-briefs/09-cpa-view.md` v1.1 — tabbed build brief, 6 tabs not 7

**Locked decisions — do not re-open:**

1. **Single shared zone name:** "Needs a look". "Things to Watch" is retired
   from every doc. `books.jsx:1056` already matches.
2. **Invite entry point:** tabbed sheet on `books.jsx` Send-to-CPA button
   ("Send snapshot" + "Invite to live books") + mirrored "Your CPA" row in
   avatar menu → Profile. Two entry points, one flow.
3. **Approval card variant:** new `variant: "cpa-suggestion"` on
   `ApprovalCard` (card.jsx). Not a new component — a flag on the existing
   one. Card data carries `currentCategory`, `suggestedCategory`, `cpaName`,
   `cpaNote`. CTAs: "Approve" / "Keep as is".
4. **Penny-question trigger mechanism:** four cases only — low-confidence
   streak (3+ repeats < 70%), ambiguous IRS routing, tax-sensitive edge
   cases (entity conversion, S-Corp payroll-vs-draw, 1099 threshold),
   founder-initiated handoff via "ask my CPA" affordance on any flagged
   card. Written as `approvals[].type = "penny-question"`.
5. **Prior-year access:** CPA-initiated. Creates
   `type: "year-access-request"` approval in founder's Needs a look. On
   approve → year appended to `yearGrants[]`.
6. **Chat on revocation:** **deleted**, not archived. Notes, flags, rules,
   and pending-adds are archived. Preserves CPA privacy contract.
7. **CPA-added staleness:** soft. Day 7 → gentle re-surface card in
   founder's Needs a look. Day 30 → once-only opt-in prompt for auto-accept.
   No hard timeout.
8. **Invite-expired:** notifies founder silently (per notification
   preference) in parallel with the CPA's "ask your client to resend"
   message.
9. **CPA tabs merged:** 6 tabs — Work Queue · Books · P&L · Cash Flow ·
   Chat · Learned Rules. Books is the full ledger + CPA overlays.
10. **Rejection surface:** CPA work queue gets a collapsible "Resolved"
    section. Rejected items show founder's optional note; auto-archive
    after 7 days.
11. **Voice — different for CPA.** Overlay prompt
    `public/prompts/cpa-chat.md` activates when `viewer_role: "cpa"` is in
    the context block. Same JSON contract, same validator, different tone
    rules (terser, accounting-aware, no celebration emojis, lead with
    number/answer). Also activates for `card.approval` when
    `variant: "cpa-suggestion"` (speaks to founder about CPA's suggestion).

**New tokens added to `styles/tokens.css`:**

| Token | Value | Usage |
|---|---|---|
| `--fs-data-row` | `clamp(13px, 1.4vw, 14px)` | CPA view table/data rows |
| `--ls-chip`     | `0.06em`                   | IRS-line chip letter-spacing |

**New CSS contract:** `.cpa-app` wrapper in `components.css` mirrors
`.phone`'s positioning contract — `position: relative` root,
`#sheet-root-cpa` portal target, `z-index: 199`, `pointer-events: none` on
the portal container, `pointer-events: auto` on the backdrop. Every sheet
pattern from the founder app works inside `.cpa-app` with only the portal
target name changed.

**New preference:** `state.preferences.notifyCpaActivity` — one of
`"real-time" | "daily-digest" | "off"`. Added to Preferences sheet in
`avatar-menu.jsx`.

**Color zone expansions** (updated in the Color zone rules table below):
- `--amber` now also permitted on "Pending approval" and "Added by CPA"
  badges in CPA view.
- `--error` now also permitted as a 3px left border on flagged rows in
  the Books / Ledger tabs. Never as a fill.

**Responsive strategy:** mobile-first from 375px. Breakpoints at 768px
(tablet — sidebar appears, 2-column) and 1024px (desktop — full CPA
density, optional right-side detail pane). CPA view must render and
function at 375px even though most CPAs will open it on desktop.

---

### 24 April 2026 — DESIGN.md created (machine-readable design system)

Created `DESIGN.md` at the root of `BookKeeping/demo/`. This is a Google Labs DESIGN.md format file — YAML front matter with all design tokens + prose rationale — so AI coding sessions automatically pick up the full token system, color zones, component rules, and Do's/Don'ts without needing to be re-briefed.

**What it contains:** all 30+ color tokens, full typography scale, radii, spacing, all component definitions (buttons, cards, bubbles, pills, sheets, provider badges, tab bar), color zone rules, and the full Do's/Don'ts from this CLAUDE.md.

**What it doesn't change:** zero runtime effect. No colors, fonts, or behavior are altered. `styles/tokens.css` remains the CSS source of truth. DESIGN.md is a documentation artifact only.

**Files updated:**
- `DESIGN.md`: created.
- `CLAUDE.md` (this file): `DESIGN.md` added as step 2 in "How you build each screen" read list; added to References section.
- `../../CLAUDE.md` (root): Design table updated to reference `DESIGN.md`.

---

### 24 April 2026 — IRS taxonomy v1.2 sync — master summary (Prompt 5)

**Label changes propagated:**
- "Van lease + gas" split into "Van lease" (Line 20a/11/13) and "Vehicle fuel" (Line 9/19/20). Done in `scenarios.json` P04 (prior session).
- Generic "Insurance" made specific per persona: "Camera/equipment insurance" (P04), "Commercial insurance" (trades, beauty-wellness industries), "Malpractice insurance" (professional services, healthcare). Updated in `industries.json`, `scenarios.json`, and `card.jsx` DEFAULT_CATEGORIES.
- "Inventory / COGS" normalized to canonical "Inventory (COGS)" in `industries.json` retail.
- "Meals" (bare) replaced with "Business meals (50%)" everywhere in category pickers.
- "Other" (bare) replaced with "Miscellaneous business expenses" in DEFAULT_CATEGORIES and `industries.json` other industry.

**New source files — label source of truth for the demo:**
- `BookKeeping/engineering/categories.v1.json` — machine-readable IRS taxonomy, CPA-reviewed.
- `BookKeeping/demo/implementation/irs-routing.md` — demo-local label → IRS line mapping (v1.2, 24 Apr 2026).

**New preference:** `showIrsLines` (default `false`). Toggle in Preferences → Tax display. When on, shows IRS line chip below category pill on expense approval cards.

**New shared util:** `util/irsLookup.js` — exports `IRS_LINE_MAP`, `irsLineChip`, `groupByIrsLine`, and entity helpers. Imported by `card.jsx` and `books.jsx`.

**Banned labels — regression check (0 hits in source):**
`"Van lease + gas"`, `"Inventory / COGS"`, `"Other operating expenses"`, `"Truck payment"`, `"Meals"` (bare in category context), `"Insurance"` (bare in category context).

---

### 24 April 2026 — Schedule C / 1120-S / 1065 preview in My Books (Prompt 4)

Added a tax form preview drill-down to the Explore section in `screens/books.jsx`. Row label adapts to persona entity: "Schedule C preview" (sole-prop/LLC), "Form 1120-S preview" (S-Corp), "Form 1065 preview" (partnership). Tapping opens a bottom sheet grouping the scenario's expense categories by IRS line with a subtotal per line. Footer disclaimer: "Preview — CPA review required before filing."

**New file:** `util/irsLookup.js` — shared lookup module (`IRS_LINE_MAP`, `irsLineChip`, `lineKeyForEntity`, `formLabelForEntity`, `groupByIrsLine`). Card.jsx and books.jsx both import from this util.

**Files changed:**
- `util/irsLookup.js`: created (shared IRS line lookup).
- `screens/card.jsx`: removed inline `IRS_LINE_MAP` / `irsLineChip`; now imports from `util/irsLookup.js`.
- `screens/books.jsx`: added `TaxFormPreviewSheet` component, `formPreview` state, and Explore row.

---

### 24 April 2026 — IRS-line chip on approval cards (Prompt 3)

Added per-category IRS line chip to `ApprovalCard` in `screens/card.jsx`. Chip shows the Schedule C / 1120-S / 1065 line for the active persona's entity type. Gated on `state.preferences.showIrsLines` (default `false`). Only renders on expense cards (not income, not owner's draw). 60-entry `IRS_LINE_MAP` lookup table hard-coded from `implementation/irs-routing.md` v1.2.

**Files changed:**
- `screens/card.jsx`: `IRS_LINE_MAP` lookup, `irsLineChip()` helper, chip render in `ApprovalCard`, `showIrsLines` prop added.
- `screens/thread.jsx`: passes `showIrsLines={state.preferences?.showIrsLines ?? false}` to `ApprovalCard`.
- `screens/avatar-menu.jsx`: "Show IRS line on cards" `ToggleRow` added to Preferences under new "Tax display" section.

**Style:** monospace, `var(--ink-3)`, 10px, uppercase, letter-spacing 0.06em. Tokens only — no new colors.

---

### 24 April 2026 — IRS taxonomy v1.2 label sync (Prompt 1)

Propagated canonical category labels from `BookKeeping/engineering/categories.v1.json` and `BookKeeping/demo/implementation/irs-routing.md` into all demo surfaces. No feature or styling changes.

**Files changed:**
- `screens/card.jsx` DEFAULT_CATEGORIES: `"Meals"` → `"Business meals (50%)"`, `"Insurance"` → `"Commercial insurance"`, `"Other"` → `"Miscellaneous business expenses"`
- `screens/onboarding.jsx` fallback list: `"Meals"` → `"Business meals (50%)"`
- `public/config/industries.json`: `"Insurance"` → `"Commercial insurance"` (trades, beauty-wellness); `"Inventory"` → `"Inventory (COGS)"` (retail); `"Meals"` → `"Business meals (50%)"`, `"Other"` → `"Miscellaneous business expenses"` (other)
- `public/config/scenarios.json`: two `category_guess: "Insurance"` (Progressive Commercial vendors) → `"Commercial insurance"`

**Banned labels (0 hits in source):** `"Van lease + gas"`, `"Inventory / COGS"`, `"Other operating expenses"`, `"Truck payment"`, `"Meals"` (bare), `"Insurance"` (bare in category context)

---

## What this project is

A browser-based, realistic demo of Penny — an AI bookkeeper for US small business owners. The demo's job is to give a prospective user a five-minute walkthrough: onboarding → first approval → Penny thread → My Books. Feedback from this demo will shape the MVP.

**This folder is the scaffolding for v5 of the demo.** The stubs in `screens/` are placeholders; full implementations are built one screen at a time via Claude Code sessions using the scoped specs in `screen-briefs/`. The prior version lived at `../tools/penny-demo-v4-mobile.html` as a single-file bundled artifact; v5 splits the demo into configured components backed by a live AI voice layer so it's easier to iterate and diff.

---

## Settled decisions — do not re-open

These are locked. If your work conflicts with one, flag it and stop.

1. **Three tabs only.** Penny · Add · My Books. Connect functionality is merged into Add. Profile / Memory / Preferences live behind the avatar menu, not a tab.
2. **Live AI voice — with one exception.** Every Penny utterance comes from Claude via the Cloudflare Worker. **Exception: onboarding.** All onboarding Penny copy uses the static `FALLBACK_COPY` object in `screens/onboarding.jsx` — no AI call. Rationale: AI responses changed on every load, broke tone consistency, and made demos unreliable. The static copy has been tone-reviewed and locked. Do not re-add `ai.renderPenny` calls to onboarding.
3. **Voice rules are absolute.** `public/prompts/penny-system.md` is the source of truth. See `../product/02-principles-and-voice.md` for the canonical rules.
4. **Design tokens.** Use `styles/tokens.css` only. Do not introduce new colors, fonts, or radii. The accent tokens (`--sage`, `--income`, `--amber`, `--cat-*`) exist — use them only in the zones below.
5. **Mobile-first.** 375px minimum width. Every component must render correctly at 375px.
6. **American English everywhere.** No British spellings.
7. **Emoji:** `🎉 👋 ✓ 💪` only. Never `😊 👍 ✅ ⚠️`. This applies to ALL UI elements — icons, tiles, labels — not just Penny speech. No decorative emoji anywhere.
8. **Shame-free re-entry.** Never "You have N items to review." See banned phrases in `guardrails/banned-phrases.js`.
9. **Stack: React + Vite.** Components are `.jsx`. Static assets (prompts, config) live under `public/` and are fetched at runtime. No CDN React, no in-browser Babel.
10. **Intent → prompt mapping is explicit.** See the `INTENT_MAP` table in `worker-client.js`. Add new intents to that map; unknown intents throw loudly.
11. **Color zones — strictly enforced.** See full rules below. Short version: thread stays monochrome except income amount; sage only on active tab; amber only on My Books badge.
12. **Never use `import.meta.env.BASE_URL` to build fetch URLs.** Vite bakes this in at build time, which silently breaks when the deploy path changes. Always use `window.PENNY_CONFIG?.baseUrl || "/"` instead. `window.PENNY_CONFIG.baseUrl` is injected by `index.html` from `window.location.pathname` at runtime and is always accurate. This applies to every `fetch()` call for static assets (`config/`, `prompts/`) in every screen and in `worker-client.js`.
13. **CPA voice is an overlay, not a separate system.** Same `penny-system.md` base, same JSON output contract, same validator. The only thing that changes is the tone overlay appended to the system prompt. Do not fork `penny-system.md`.
14. **Responsive contract for CPA view.** CPA view must render at 375px (mobile) AND at 1024px+ (desktop). One codebase, one token set, responsive via media queries. Do not build a separate "mobile CPA" and "desktop CPA" surface.
15. **`.cpa-app` positioning wrapper.** The CPA view replaces `.phone` as the positioning context for all overlays. Every sheet, backdrop, and toast inside the CPA view uses `position: absolute` anchored on `.cpa-app`. The portal target is `#sheet-root-cpa` (inside `.cpa-app`), not `#sheet-root` (inside `.phone`). Never use `position: fixed` in either context.
16. **All bottom sheets use `<Sheet>`.** Every bottom sheet — founder app and CPA view — renders through `components/Sheet.jsx`. Never roll your own backdrop / portal / animation. See "Shared components catalog" below.
17. **All dark-scrim overlays use `<FullScreenOverlay>`.** Voice recording, photo capture processing, and any full-viewport modal state render through `components/FullScreenOverlay.jsx`. Never roll your own.
18. **All enum-typed strings live in `constants/variants.js`.** Card variants, entity types, industry keys, approval types, notification modes. Never hand-write one in a screen — import the enum.
19. **All static Penny copy lives in `constants/copy.js`.** Locked onboarding lines, thread-intro and card fallbacks, empty-state lines, toasts, and user-visible errors. Never hard-code a static Penny utterance in a screen — import from the registry. AI-generated copy still flows through `worker-client.js → renderPenny()`; the registry only owns STATIC fallbacks and acknowledgments. The 8 onboarding headline/why pairs are LOCKED — see "Approved onboarding copy" table below.
20. **Token discipline is enforced by pre-commit hook.** `scripts/check-tokens.sh` runs automatically before every commit (via `.githooks/pre-commit`, wired by `npm run prepare`) and inside `npm run build`. It blocks four violation classes in `screens/*.jsx` and `components/*.jsx`: raw hex strings, raw `fontWeight` numbers, raw `borderRadius` numbers, and `position: fixed`. Exemptions are allowed only when the offending line carries `// token-exempt: <reason>` (e.g. clipboard textareas that are never rendered) or `// radius-literal: <reason>` (the documented `borderRadius: 8` icon containers, `10` provider badges, and similar values that have no named token). Never bypass with `--no-verify` to ship a violation — `npm run build` will still catch it. Run on demand with `npm run check:tokens`.
21. **Never re-implement `Spinner`, `Toast`, `VoiceWaveform`, or `EyebrowLabel` inline in a screen file.** All four live in `components/` and are imported directly. If you need a loading spinner, a dismissing toast, animated voice bars, or an uppercase section label — import from the catalog. Inline copies of any of these are a bug. See "Shared components catalog" for each component's API.

---

## Shared components catalog

When building new screens or features, reach for these canonical components before writing your own. Each lives in `components/` and is imported directly. If your need doesn't match one of these, propose a new shared component rather than copy-pasting a pattern.

### `<Sheet>` — canonical bottom sheet

**File:** `components/Sheet.jsx`
**Use for:** any sheet that slides up from the bottom of the phone or CPA view — category pickers, send-invoice forms, flagged-transaction review, tax previews, CPA row actions, etc.
**Never:** roll your own backdrop + portal + animation. Never use `position: fixed`.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `open` | bool | Whether the sheet is currently shown. |
| `onClose` | fn | Called when the user dismisses (backdrop tap or ESC). |
| `title` | string | Optional header title. Standard layout renders it in a `.sheet-header`. |
| `subtitle` | string | Optional descriptor line under the title. |
| `maxHeight` | CSS value | Defaults to `"70%"`. Pass `"82%"`, `"92%"`, etc. for taller sheets. Use `%`, not `vh`. |
| `footerActions` | node | Optional sticky bottom row (standard layout only). |
| `portalTarget` | selector | Defaults to `"#sheet-root"`. CPA view sheets pass `"#sheet-root-cpa"`. |
| `ariaLabelledBy` | id string | Optional. Auto-filled when `title` is set. |
| `ariaLabel` | string | Fallback screen-reader label when no `title`. |
| `layout` | `"standard"` \| `"custom"` | Defaults to `"standard"`. See below. |
| `children` | node | Sheet body content. |

**Standard layout (`layout="standard"`, the default):** children are wrapped in a scrollable `.sheet-body`. `title`/`subtitle` render in a `.sheet-header`; `footerActions` renders in a sticky `.sheet-footer`. Use this for 80% of sheets.

**Custom layout (`layout="custom"`):** children render directly between the drag handle and the sheet's bottom edge — no header, body, or footer wrapping. `title`/`subtitle`/`footerActions` props are ignored. Use when the sheet needs bespoke structure (tab bar, custom header with close button, split scroll regions).

**Minimal example — standard layout:**
```jsx
<Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Change category">
  <div className="sheet-list">
    {cats.map((cat) => <button key={cat} className="sheet-item">{cat}</button>)}
  </div>
</Sheet>
```

**Minimal example — custom layout for a tabbed sheet:**
```jsx
<Sheet open onClose={onClose} maxHeight="92%" layout="custom" ariaLabel="Send to CPA">
  <div className="custom-header">… title + close button …</div>
  <div className="custom-tabs">… tab bar …</div>
  <div style={{ flex: 1, overflowY: "auto" }}>… tab content …</div>
  <div className="custom-footer">… sticky CTA …</div>
</Sheet>
```

### `<FullScreenOverlay>` — canonical dark-scrim overlay

**File:** `components/FullScreenOverlay.jsx`
**Use for:** full-viewport modal states where the sheet metaphor doesn't fit — voice recording, photo capture processing, pulling-data screens, confirmation fullscreens.
**Never:** roll your own with a `position: absolute; inset: 0` div. Never use `position: fixed`.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `open` | bool | Whether the overlay is currently shown. |
| `onClose` | fn | Optional. If provided, ESC dismisses. Auto-dismissing overlays omit this. |
| `scrim` | CSS color | Background. Defaults to `"rgba(10,10,10,0.92)"`. Permitted values are `rgba(10,10,10,N)` only — no raw hex. |
| `portalTarget` | selector | Defaults to `"#sheet-root"`. CPA view overlays pass `"#sheet-root-cpa"`. |
| `ariaLabel` | string | Screen-reader label for the modal. |
| `children` | node | Centered content. Caller lays out via flex inside. |

**Minimal example:**
```jsx
<FullScreenOverlay open onClose={onClose} ariaLabel="Recording voice note">
  <button className="close-x" onClick={onClose}>×</button>
  <div className="mic-circle">…</div>
  <div className="voice-waveform">…</div>
  <p>Listening… {seconds}s</p>
</FullScreenOverlay>
```

### `<Spinner>` — canonical loading indicator

**File:** `components/Spinner.jsx`
**Use for:** any inline loading state — connecting spinners, generating spinners, AI-thinking states — wherever a rotating arc is needed.
**Never:** define a local spinner SVG with `@keyframes spin` inside a screen file.

**Props:**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `size` | number | `20` | Width and height in px. |
| `color` | CSS color | `"var(--ink)"` | Stroke color. Use `rgba(255,255,255,N)` on dark backgrounds. |

The `@keyframes spin` animation is defined in `styles/components.css` — never re-declare it inline.

**Minimal example:**
```jsx
import Spinner from "../components/Spinner.jsx";
<Spinner size={22} color="rgba(255,255,255,0.7)" />
```

---

### `<Toast>` — canonical dismissing notification

**File:** `components/Toast.jsx`
**Use for:** every transient acknowledgment in the founder app and CPA view — action confirmations, export notifications, connection status, error recovery.
**Never:** define a local `Toast` function in a screen. Never call `setTimeout` in the parent to clear the toast — the component handles its own dismiss timer.

**Props:**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `message` | string | — | The toast text. If falsy, the component renders nothing. |
| `onDone` | fn | — | Called after `duration` ms. Parent sets `toast` state back to `null`. |
| `duration` | number | `2400` | Auto-dismiss delay in ms. |
| `bottom` | number | `80` | Distance from bottom of the positioning context in px. Use `80` (founder, above tab bar) or `24` (CPA view, no tab bar). |

**Parent pattern — the only correct pattern:**
```jsx
const [toast, setToast] = useState(null);
const showToast = useCallback((msg) => { setToast(msg); }, []);
// render:
{toast && <Toast message={toast} onDone={() => setToast(null)} />}
// CPA view (no tab bar):
{toast && <Toast message={toast} onDone={() => setToast(null)} bottom={24} />}
```

Toast uses `position: absolute` — it anchors inside `.phone` or `.cpa-app`. Never use `position: fixed`.

---

### `<VoiceWaveform>` — animated recording bars

**File:** `components/VoiceWaveform.jsx`
**Use for:** any voice-recording UI that needs animated vertical bars — `VoiceModal` in `add.jsx`, `VoiceAskModal` in `books.jsx`.
**Never:** define bar arrays + inline `@keyframes voiceBar` in a screen file.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `bars` | number[] | Array of pixel heights. Values in the 14–46 range look best at 52px container height. |
| `isRecording` | bool | When `false` the component renders `null`. Attach/detach from the DOM by toggling this prop. |

The `@keyframes voiceBar` animation is defined in `styles/components.css`. Bar stagger delay is computed from the array index inside the component.

**Minimal example:**
```jsx
import VoiceWaveform from "../components/VoiceWaveform.jsx";
const BARS = [14, 28, 44, 32, 20, 38, 24, 46, 18, 36, 28, 42, 16, 32, 22, 44, 26, 38, 20, 34, 28, 42, 18, 30, 24, 46, 22, 36];
<VoiceWaveform bars={BARS} isRecording={step === "recording"} />
```

---

### `<EyebrowLabel>` — uppercase section header

**File:** `components/EyebrowLabel.jsx`
**Use for:** any section label that needs the `.eyebrow` CSS treatment where the element isn't already a `<p>` (e.g. inside flex rows where a `<p>` margin would disrupt layout).
**Note:** In most cases, just using `<p className="eyebrow" style={{ margin: "0 0 10px" }}>` directly is simpler and preferred. Reserve `<EyebrowLabel>` when the wrapping paragraph semantics would be misleading.
**Never:** duplicate the eyebrow styles inline (`fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase"`) in a screen.

**Props:**

| Prop | Type | Notes |
|---|---|---|
| `children` | node | The label text. |
| `style` | object | Optional — margin/padding overrides only. Never override color, font, or letter-spacing here. |

---

## Constants catalog

Every string literal that names a concept lives in `constants/variants.js`. Every static Penny utterance, fallback, empty-state, toast, and user-visible error lives in `constants/copy.js`. Import from these two modules; do not hand-write the strings in a screen. When you need a new entry, add it to the matching registry first — the screen then imports. Coverage tests in `tests/variants.test.js` and `tests/copy.test.js` keep the registries honest.

### `constants/variants.js` — concept-level enums

| Export | Purpose |
|---|---|
| `CARD_VARIANTS` | Every `card.variant` value — `EXPENSE`, `BASE_EXPENSE`, `LOW_CONFIDENCE`, `INCOME`, `INCOME_CELEBRATION`, `OWNERS_DRAW`, `RULE_PROPOSAL`, `VARIABLE_RECURRING`, `CPA_SUGGESTION`. |
| `ENTITY_TYPES` | Founder business entity — `SOLE_PROP`, `S_CORP`, `LLC`, `LLC_SINGLE`, `LLC_MULTI`, `PARTNERSHIP`. |
| `INDUSTRY_KEYS` | The 10 industries in `industries.json`. |
| `APPROVAL_TYPES` | `state.cpa.approvals[].type` — `RECLASSIFICATION`, `CPA_ADDED_TXN`, `PENNY_QUESTION`, `YEAR_ACCESS_REQUEST`. |
| `NOTIFICATION_MODES` | `state.preferences.notifyCpaActivity` — `REAL_TIME`, `DAILY_DIGEST`, `OFF`. |
| `isKnownVariant(v)` | Membership check against `CARD_VARIANTS`. |
| `isKnownEntity(e)` | Membership check against `ENTITY_TYPES`. |
| `isKnownIndustry(k)` | Membership check against `INDUSTRY_KEYS`. |
| `isSCorpOrLlc(entity)` | True for S-Corp and every LLC flavour — the owner's-draw-eligible set. |
| `isLlc(entity)` | True for any LLC flavour (`LLC`, `LLC_SINGLE`, `LLC_MULTI`). |
| `formLabelForEntity(entity)` | Full tax-form label for page titles — `"Schedule C"` / `"Form 1120-S"` / `"Form 1065"`. For the compact chip under a category (`"Sch C · Line 24b"`), use `shortFormLabelForEntity` from `util/irsLookup.js`. |

### `constants/copy.js` — static Penny copy

| Export | Purpose |
|---|---|
| `ONBOARDING_COPY` | The 8 LOCKED headline/why pairs from the "Approved onboarding copy" table below, plus welcome screen + pulling-step fallbacks. Editing any of the 8 locked rows requires CEO sign-off — `tests/copy.test.js` enforces byte-identity. |
| `THREAD_INTRO_COPY` | First-time intro flow (`What's your name?` / `Nice to meet you, ${name}!`), ask-bar placeholders, header status (`online · watching your accounts`), and Penny-thread greeting/idle fallbacks. `businessQuestion(name)` and `greetingFallback(firstName)` are interpolation functions; everything else is plain string. |
| `CARD_FALLBACK_COPY` | Every branch of `fallbackMsg()` in `card.jsx` — `income(vendor, amountFmt)`, `ownersDraw(amountFmt)`, `lowConfidence(amountFmt)`, `expenseDefault(vendor, amountFmt, categoryGuess)`. Plus default CTAs (`Confirm`, `Change`), variant-specific buttons (`Yes, auto-categorize`, `Skip for now`, `Approve`, `Keep as is`), vendor fallbacks, the category-sheet title, and confidence-bar labels (`High confidence`, `Medium confidence`, `I'm not sure`). |
| `EMPTY_STATE_COPY` | `All caught up ✓` (Needs a look empty), drill-down empties (`No data available.`, `No expense data available.`, `No transactions found.`), `No providers matched.`, memory empty, archived-work empty, and the CPA-side learned-rules + chat empties. ✓ in "All caught up ✓" is the Unicode character U+2713, never an emoji. |
| `TOAST_COPY` | Every toast across founder + CPA screens. Plain strings for fixed copy (`Got it ✓`, `Saved for later. I'll bring it back.`, `Account disconnected.`, `Draft saved.`, `Note saved.`, etc.); functions for interpolated values (`changedTo(category)`, `ruleCreated(vendor, category)`, `booksSentToCpa(cpaName)`, `staleAddRedirect(cpaName)`, `alreadyConnected(name)`, `providerConnected(name)`, `emailConnectedWatching(name)`, `importComplete(count)`, `invoiceSent(email)`, `recurringScheduled(freqLowercase)`). Grouped by source screen in inline comments. |
| `ERROR_COPY` | Recovery-oriented Penny-voice errors (`threadQaError`, `booksQaError`, `cpaPennyNoData`, `cpaChatThinking`) plus the five CPA AuthGate form-validation strings (`fieldRequiredName`, `fieldInvalidEmail`, `fieldPasswordMin`, `fieldLicenseFormat`, `fieldStateCode`). The form strings ship as-is in SCAF-3; a small follow-up commit rewrites them in Penny voice (CEO direction, 25 Apr 2026). |

**How to add a new concept-level string (3 steps):**
1. Add the member to the matching enum in `constants/variants.js` — keep keys `SCREAMING_SNAKE_CASE` and values kebab-case.
2. If it's an `INDUSTRY_KEYS` or `ENTITY_TYPES` addition that should appear in live data, also add it to the relevant config JSON — the coverage test will fail otherwise.
3. Import and use. Never hand-write the string in a screen.

**How to add a new static Penny copy entry (3 steps):**
1. Pick the right bucket in `constants/copy.js` — toast → `TOAST_COPY`, empty state → `EMPTY_STATE_COPY`, AI-fallback → the matching `*_FALLBACK_COPY` group, error → `ERROR_COPY`.
2. Add a plain string for fixed copy. Use a function only when runtime values must be interpolated; the function returns the same string or message-object shape the call site previously inlined.
3. Import the bucket and use the new key. If the new entry is a Penny utterance fallback (not just a toast), add a tone check to `tests/copy.test.js` so future edits are caught.

---

## How you build each screen

**One Claude Code session = one screen.** Do not try to build everything at once.

For each screen, read exactly these five files, no more:

1. `CLAUDE.md` (this file)
2. `DESIGN.md` — machine-readable design system (all tokens, component rules, color zones, Do's and Don'ts)
3. `styles/tokens.css` — the CSS custom properties (runtime source of truth — must match DESIGN.md)
4. `public/prompts/penny-system.md` — the voice core
5. `screen-briefs/0X-{screen}.md` — the scoped spec for the screen you are building

Then build the corresponding component in `screens/{screen}.jsx`. Do not edit other screens. Do not edit config files unless the brief tells you to.

If a brief says "call `renderPenny()` with intent X", the implementation of `renderPenny` is in `worker-client.js` — you can read it but do not modify it unless the brief says so.

---

## Build order

Build in this order. Each step assumes the previous is working.

1. **Scaffolding** — `index.html`, `app.js`, `worker-client.js`, `styles/tokens.css`, `styles/components.css`, `guardrails/*.js`. Wire up routing, the AI client, and the validator. No screens yet. Smoke test: a blank page with a tab bar at 375px. ✅ Done.
2. **Screen 1 — Onboarding.** Follow `screen-briefs/01-onboarding.md`. ✅ Done. See onboarding standards below.
3. **Screen 2 — Penny thread.** Follow `screen-briefs/02-thread.md`. ✅ Done. See thread standards below.
4. **Screen 3 — Approval card.** `screens/card.jsx`. ✅ Done. See card standards below.
5. **Screen 4 — Add tab.** Follow `screen-briefs/04-add.md`. Capture modes + integrations + data actions. ✅ Done. See Add tab standards below.
6. **Screen 5 — My Books.** Follow `screen-briefs/05-books.md`. ✅ Done. See My Books standards below.
7. **Screen 6 — Avatar menu.** Follow `screen-briefs/06-avatar-menu.md`. ✅ Done. See Avatar menu standards below.
8. **Screen 7 — Invoice designer.** Follow `screen-briefs/07-invoice.md`. ✅ Done. See Invoice standards below.

---

## Prompt files — what each one controls

Every Penny utterance is assembled from two layers: `penny-system.md` (base) + one overlay prompt. Changing a file only affects the screens listed here.

| File | Screen(s) affected | Intents |
|---|---|---|
| `public/prompts/penny-system.md` | **ALL screens** ⚠️ | every intent |
| `public/prompts/thread.md` | `screens/thread.jsx` | `thread.greeting`, `thread.idle` |
| `public/prompts/thread-qa.md` | `screens/thread.jsx` | `thread.qa` |
| `public/prompts/onboarding.md` | ~~`screens/onboarding.jsx`~~ **DEPRECATED** — onboarding uses static `FALLBACK_COPY`, not AI | n/a |
| `public/prompts/card-approval.md` | `screens/card.jsx` | `card.approval` |
| `public/prompts/books-qa.md` | `screens/books.jsx` · CPA Chat tab | `books.qa` |
| `public/prompts/capture-parse.md` | `screens/add.jsx` | `capture.parse` |
| `public/prompts/cpa-chat.md` | CPA view (`screens/cpa/*`) + `card.jsx` with `variant: "cpa-suggestion"` | `books.qa` (when `viewer_role: "cpa"`) · `card.approval` (when `variant: "cpa-suggestion"`) |

**Rule:** edit `penny-system.md` only for voice, brand, or output-format changes that must apply everywhere. Prefer overlay prompts for screen-specific behaviour.

**CPA overlay activation:** `cpa-chat.md` is appended on top of `penny-system.md` (and on top of the intent-specific overlay, if any) whenever the context block carries `viewer_role: "cpa"`, or whenever `card.approval` is called with `variant: "cpa-suggestion"`. The overlay changes tone only — JSON output shape is identical.

The full intent → file mapping lives in `INTENT_MAP` inside `worker-client.js`. Add new intents there whenever you add a new prompt file.

---

## Deploying changes

All commands run from `BookKeeping/demo/` unless noted.

### Code or JSX changes (most common)
```bash
npm run deploy --msg="short description"
```
Builds → rsyncs to `penny/demo/` → commits → pushes. Live in ~30s.

### Prompt-only changes (fastest — skips the build)
```bash
npm run deploy:prompts --msg="tweak onboarding voice"
```
Rsyncs `public/prompts/` directly to `penny/demo/prompts/` → commits → pushes. Live in ~10s.

Both `--msg="text"` (npm env-var form) and `-- --msg="text"` (positional form, with the `--` separator) are accepted; either lands in the deploy commit message. With no flag, the message falls back to `update`.

### Recovery — if a deploy crashes mid-stash

If a deploy aborts during a stash and subsequent `git stash` fails with
"Cannot save the current status", check for a stale lock at
`.git/refs/stash.lock` and remove it: `rm .git/refs/stash.lock`. If
`git stash list` is empty but `.git/refs/stash` still exists, the ref
is orphaned — `rm .git/refs/stash .git/logs/refs/stash` clears it.

### Local dev (no deploy)
```bash
npm run dev        # HMR at localhost:5173 — use this while iterating
npm run preview    # Serves the last build at localhost:4173 — identical to production
```

Full deploy runbook and troubleshooting: see `DEPLOY.md`.

---

## How the AI layer works

You never put Penny's words in a component. You call:

```js
import { renderPenny } from "./worker-client.js";

const msg = await renderPenny({
  intent: "card.approval",                  // which prompt file to use
  context: {
    entity: "S-Corp",
    industry: "consulting",
    persona: { name: "Sarah", business: "Studio Nine" },
    card: { vendor: "Notion", amount: 19, date: "2026-04-22" }
  }
});

// msg is a JSON object matching the contract in prompts/penny-system.md:
// { headline: "...", why: "...", ctaPrimary: "Confirm", ctaSecondary: "Change" }
```

The validator runs automatically inside `renderPenny`. If it fails, it retries. You just render the result.

---

## Caching

`worker-client.js` caches AI responses in `localStorage` by prompt+context hash. Same card scenario → instant on re-render. Do not bypass the cache in components. If you need to force a fresh generation, pass `{ nocache: true }`.

---

## Repo hygiene

- **Public repo.** Assume every file is read by strangers. No API keys, no private URLs, no personal data.
- **No secrets.** The Cloudflare Worker uses a demo token (`X-Demo-Token: ff-demo-2026`) that's rate-limited and scoped. It's safe to commit.
- **Commit messages:** Use imperative present tense. `Add approval card component` not `Added approval card`.
- **No generated output committed.** No `dist/`, `build/`, or bundled files. This is source-only.

---

## UI/UX standards — learned from onboarding (apply to all screens)

These were caught and fixed during the onboarding build. Do not repeat them.

**Icons**
- Never use emoji as UI icons. Use inline SVG only — stroke-based, `currentColor`, `strokeWidth: 1.5–1.6`, 20–22px viewBox.
- Icon containers: small rounded square (`border-radius: 8px`, `background: var(--paper)`), 32×32px. Never a raw floating emoji.
- Industry/category grid tiles: icon above label, both left-aligned. Min tile height 80px.

**Welcome screen**
- Never wrap the opening Penny greeting in a bordered bubble (`.penny-bubble`). That pattern is for conversation steps only.
- Welcome = **pure hero only**: P-mark avatar → greeting text (no box) → big headline → supporting `why` line → "Let's go" CTA. No inputs. No forms. "Let's go" is always enabled.
- Name + business name are NOT collected here. They are collected on the Penny thread screen as a conversational AI interaction (see thread standards below).
- Do not add any input fields, labels, or capture logic to the welcome screen.

**Penny bubble copy (sub-headline / "why" line)**
- The only legal home for the static strings is `constants/copy.js → ONBOARDING_COPY`. The 8 entries in the locked table below are duplicated byte-identically in the registry; `tests/copy.test.js` enforces parity. Editing copy means editing the registry, not the component.
- Must pass the one-line test: *would a caring, knowledgeable human bookkeeper say this?*
- The goal: the user should feel *handled* — not informed, not processed. Someone capable has this.
- Never say "I'll tune myself" — robotic. Never "so you don't have to think about it" — dismissive. Never "from day one" — cliché. Never "I'll watch for these automatically" alone — too mechanical without warmth.
- **Good pattern:** Lead with Penny's commitment, not just a question. Use "I'll" + a human promise.
  - ✓ "The more I know now, the less you'll explain later."
  - ✓ "Every payment you earn — I'll be watching for it."
  - ✓ "I'll have everything ready — you just show up."
  - ✓ "I read every transaction as it comes in. Your money never moves."
  - ✓ "Tell me once. I'll recognize it every time after that."
- **Bad pattern:** functional, transactional, robotic.
  - ✗ "I'll tune myself to how your industry works."
  - ✗ "I'll ask so I get things right from day one."
  - ✗ "So I recognize the right things." (vague)
  - ✗ "No wrong answer — it just shapes how I handle your taxes." (software-voice)
- **Approved onboarding copy (locked — do not change without sign-off):**

| Screen | `headline` | `why` |
|---|---|---|
| Welcome | "Nice to meet you. The books are on me from here." | "One quick setup and I take it from here — for good." |
| Entity | "Let me make sure I understand your setup first." | "Get this right once and I'll handle everything the right way — every time." |
| Entity (not sure) | "No worries at all — let's work it out together." | "Two questions and I'll know exactly what to do." |
| Industry | "What kind of work do you do?" | "I want to know your business the way you know it." |
| Payments | "How do your clients pay you?" | "Every payment you earn — I'll be watching for it." |
| Expenses | "What do you usually spend on?" | "Tell me once. I'll recognize it every time after that." |
| Check-in | "When's a good time for me to check in?" | "I'll have everything ready — you just show up." |
| Bank | "Which account should I start watching?" | "I read every transaction as it comes in. Your money never moves." |

**Tile subtitles (entity, option tiles)**
- Always plain English. Never repeat the label. Explain the real-world consequence in one sentence.
- No jargon without immediate explanation in the same sub-line.

**Onboarding scope — what belongs and what doesn't**
- Capture preferences (photo/voice/email) do NOT belong in onboarding. Earn trust first.
- Welcome screen collects nothing. Steps are: entity → industry → payment methods → expense categories → check-in time → bank → pulling.
- `persona.firstName` and `persona.business` are empty strings after onboarding completes. They are populated by the Penny thread intro conversation on first visit.
- Do not add name/business fields back to onboarding. This is a settled decision.

**Custom time/day pickers — layout rule**
- Never put 7 equal-flex buttons in a single `flex` row at 375px — they overflow or truncate.
- Use `display: grid; grid-template-columns: repeat(4, 1fr)` for days (4+3 layout) and times.
- Override `min-width` and `min-height` on picker buttons — the global 44px tap-target minimum from `tokens.css` breaks grid layouts. Set `min-width: unset; min-height: unset` and compensate with a taller grid row.

**Screen transitions — all screens**
- Every `.phone-content` element gets `animation: screen-enter 0.22s var(--ease-out) both` automatically via CSS. This gives every screen a gentle fade + 6px slide-up on mount. Do not override or suppress this.
- `@keyframes screen-enter` is defined in `components.css`: `from { opacity: 0; transform: translateY(6px); }`.
- Thread intro → main transition: the normal thread content is wrapped in `.thread-main-enter` which uses the same animation at 0.28s. Do not remove this wrapper.

**Bottom sheet — use the canonical `<Sheet>` component**
- All bottom sheets render through `components/Sheet.jsx`. Do not roll your own backdrop, portal, or animation. See the "Shared components catalog" section below for the full Sheet API.
- Underlying CSS (maintained in `styles/components.css`, do not duplicate): `#sheet-root` at `position: absolute; inset: 0; z-index: 199; pointer-events: none`; `.sheet-backdrop` is the flex container holding the sheet as a child (never as a sibling); `.sheet` has `max-height: 70%` (as a percentage, not `vh`) and uses the `sheet-slide-up` keyframe; ESC and backdrop-click both dismiss when `onClose` is provided.
- Portal target defaults to `#sheet-root` (founder app). CPA view sheets pass `portalTarget="#sheet-root-cpa"`.
- Never use `position: fixed` in a sheet or overlay. Never use `vh` for sheet max-height.

**Voice modals**
- `VoiceModal` in `screens/add.jsx`: receipt capture. Shows 28-bar animated waveform, auto-stops at 4s, calls `capture.parse` AI intent. Dark overlay `rgba(10,10,10,0.92)`. Do not revert waveform — required for realism.
- `VoiceAskModal` in `screens/books.jsx`: Ask Penny voice input. Shows same waveform + pulse rings, auto-stops at 3s, then picks a random question from `VOICE_PROMPTS` and calls `submitAsk(q)` directly (passing the question as an override to avoid stale closure). The mic button in the Ask Penny bar opens this modal; do not revert to populating a random prompt without submitting it.
- `@keyframes voiceBar`: `from { transform: scaleY(0.15) } to { transform: scaleY(1) }`. Applied per bar with staggered delays.

**Penny bubble stability — no layout shift on selection**
- The `useEffect` that fetches the Penny message must only depend on `[step, diagQ]` — never on selection state (`entity`, `industry`, `paymentMethods`, etc.).
- Adding selection state to the deps causes a re-fetch + `setPennyMsg(fallback)` reset on every tap, which resizes the bubble and shifts everything below it.
- Message fetches once when the step loads. Stays locked until the step changes.

**"Other" / free-text fallback on selection grids**
- When a grid includes an "Other" option, selecting it must reveal a text input inline below the grid.
- Input appears with `animation: slide-up`, auto-focuses, and stores the value separately from the selection key.
- The typed value becomes the display label (e.g. persona.business) downstream.

**Penny bubble consistency — apply to every screen**
- Every Penny bubble must use the same structure: `.bubble-label` ("PENNY") → `.bubble-msg` → `.penny-bubble-headline` + `.penny-bubble-why`. Never skip the label or wrapper.
- While loading: render `.penny-bubble-loading` with skeleton divs inside the bubble (no label during skeleton is fine).
- This matches the `PennyRow` component in onboarding exactly. Any deviation creates visible inconsistency.

**Thread screen — Penny thread standards**
- Header: P-mark avatar (sm) with `.p-mark--online` modifier + "Penny" name + "online · watching your accounts" status + ⋮ menu button. The `--online` modifier adds an 8×8px pulse dot (ink fill, `@keyframes pulse-dot` 2.4s).
- Greeting bubble loads via `thread.greeting` intent on mount. Context includes `mode`, `persona`, `queueLength`, `lastSeenHours`.
- Card queue loads from `public/config/scenarios.json` keyed by `{entity}.{industry}` (e.g. `sole-prop.consulting`). Falls back to `sole-prop.consulting` if key not found.
- Cards render one at a time. Confirmed cards collapse to a **paper pill slug** (`background: var(--paper)`, `border-radius: 10px`, `padding: 11px 14px`) — not a border-bottom row.
- **NOW separator:** the active card zone has a `::before` pseudo-element showing "NOW" (9px, semibold, `--ink-4`) above the card. This visually anchors the approval moment in the thread.
- When queue empties, call `thread.idle` with `mode: "queue-empty"` — never hard-code the empty state copy.
- Ask bar is always visible at the bottom above the tab bar. Tapping Enter navigates to `#/books`.
- Ask bar icon is a **chat/compose speech bubble** SVG — never a search/magnifying glass. The bar is for asking Penny questions, not searching.
- Ask bar uses `.thread-ask-inner` pill wrapper: `background: var(--paper)`, `border: 1.5px solid var(--line)`, `border-radius: var(--r-pill)` — contains the icon + input together.
- **First-time intro (name + business collection):** On first visit, `persona.firstName` and `persona.business` are empty. The thread detects this and enters intro mode. Penny asks "What's your name?" as a chat bubble. The user replies via the ask bar (placeholder: "Your first name…"). On Enter, the reply appears as a right-aligned user bubble, Penny responds "Nice to meet you, [name]! What's your business called?" and the ask bar placeholder switches to "Your business name…". On the second Enter, persona is saved and the normal thread (greeting + card queue) loads. The ask bar doubles as the intro reply input — no separate input field. A small send arrow button appears in the ask bar when the intro input has content.
- Always define a `fmt` currency helper in any screen that displays amounts: `const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);` — do not inline number formatting or use bare template strings.

**Tab bar — shared component standards**
- Tab bar lives in `components/TabBar.jsx` and is rendered by `app.jsx` — never re-implement it inside a screen.
- Each tab has: an inline SVG icon (stroke-based, `currentColor`, 22×22 viewBox) + a text label below it. The active tab class is `tab--active` (not `tab.active`).
- Tab icons are defined as named function components inside `TabBar.jsx`:
  - Penny → chat bubble (speech bubble outline)
  - Add → plus inside a circle
  - My Books → open book / ledger
- Never use colored dots, emoji, or placeholder circles as tab icons. Always stroke SVG.
- The tab bar is hidden on onboarding, pulling, avatar-menu, invoice, and card standalone screens. `app.jsx` controls visibility — do not add `tab-bar` markup inside individual screens.

**Approval card — card standards**
- `ApprovalCard` is a named export from `screens/card.jsx`. Thread imports it. Do not duplicate card layout in thread.
- Layout: Penny bubble (AI copy via `card.approval`) → card body (vendor icon, amount, category pill, confidence bar) → actions.
- Penny speaks first — her bubble sits above and is visually connected to the card below.
- Card border: `1.5px solid var(--ink)`, `border-radius: 16px` (`--r-card-emph`), `padding: 24px`, `box-shadow: var(--shadow-card-hero)`.
- **Income variant (`.approval-card--income`):** full `background: var(--ink)` dark treatment. All child elements invert — vendor icon gets `rgba(255,255,255,0.12)` bg, category pill gets `rgba(255,255,255,0.15)` bg with white border, amount is white, Confirm button is white with ink text, Change button is `rgba(255,255,255,0.12)` with white text.
- **NOW separator:** `.approval-card-wrap::before` pseudo-element renders "NOW" label (9px, semibold, 0.14em tracking, `--ink-4`) above the active card zone.
- **Confirmed slug:** collapses to a paper pill (`background: var(--paper)`, `border-radius: 10px`, `padding: 11px 14px`) — not a border-bottom row.
- Vendor icon: 40×40px, `border-radius: 12px`, bold monogram weight.
- Category pill: 12px semibold uppercase, `padding: 5px 12px`, `border: 1.5px solid var(--line)`.
- Confidence fill: `background: var(--ink)` (not `--ink-3`). Label: 11px semibold uppercase 0.04em tracking.
- "Change" opens a bottom sheet (`CategorySheet`) with industry-specific categories loaded from `industries.json`, merged with `DEFAULT_CATEGORIES`.
- "Skip for now" moves the card out of the active queue. Toast: "Saved for later. I'll bring it back."
- All actions fire a brief toast (2.4s, absolute-positioned above tab bar — never `position: fixed`).
- Fallback copy is defined in `fallbackMsg()` for each variant — used when the AI worker is unavailable.
- `CardScreen` (default export) is a minimal standalone wrapper for testing at `#/card`.

**Add tab — standards (apply to all screens with capture or sheets)**

*Learned during Screen 4 build (23 Apr 2026). Do not repeat these mistakes.*

**SVG icon factory pattern**
- Define a single `Svg` wrapper component that accepts `size`, `sw` (strokeWidth), and spreads remaining props onto `<svg>`. Name specific icons as one-liners using it. This keeps icon definitions compact and consistent.
- Never use emoji as tile icons — always stroke SVG.

**Capture tile layout — hero + 3-column secondary**
- "Just tell me" is a full-width **hero tile**: horizontal layout (icon left, label + subtitle right), ink border (`1.5px solid var(--ink)`), `border-radius: var(--r-card)`, semibold label, muted subtitle. This is the primary capture entry point.
- Photo, Voice, Upload are a **3-column secondary row** below the hero tile. Equal-width, `grid-template-columns: 1fr 1fr 1fr`. Each tile: icon centered above label, no subtitle. Use `minWidth: "unset"` and `minHeight: "unset"` to override the global 44px tap-target rule.
- Never use a 4-equal-column layout for capture tiles at 375px — it overflows.

**Capture flow pattern — photo and voice**
- Photo: trigger a hidden `<input type="file" accept="image/*" capture="environment">` → on file select, show a fullscreen `PhotoOverlay` component (dark scrim + spinner + "Reading your receipt…") for ~2 seconds → dismiss overlay → show a stub `ApprovalCard` inline. No AI call needed for the demo — use `STUB_CARDS.photo`.
- Voice: show a `VoiceModal` fullscreen overlay (dark scrim, pulsing mic rings, live second counter, "Done" button). Auto-stops at 4 seconds. On stop → transitions to "Penny is reading…" state for ~1.2 seconds → dismisses modal → shows stub `ApprovalCard` inline. No AI call needed — use `STUB_CARDS.voice`.
- Both stubs feed into `ApprovalCard` which makes its own `card.approval` AI call for Penny's copy — the stub only provides the structured card data.
- Upload file tile opens the Import sheet directly (same flow as "Import your old books").

**Sheet scaffold pattern**
- All bottom sheets use a shared `Sheet` component: backdrop (rgba scrim, click-to-dismiss) → white panel with `borderRadius: "20px 20px 0 0"` → drag handle bar → header row (title + close button) → scrollable content. Max height 82%.
- Sheets with multi-step flows (import, export, provider connect) manage their own `step` state internally. Parent only receives a final callback (`onConnect`, `onImport`, `onExport`).

**Multi-step sheet flows**
- Provider connect: pick → "Connecting…" spinner (1.6s) → "Connected" checkmark (0.9s) → callback fires → sheet closes. While one provider is connecting, all others are dimmed (`opacity: 0.4`).
- Export: format pick → "Generating…" spinner (1.8s) → "Ready" state with real `Blob` download via `URL.createObjectURL`. File actually downloads in the browser.
- Import: drag-and-drop zone (also Browse files) → `handleDrop` / `onChange` triggers → "Analyzing your file…" spinner (2s) → results summary (42 found / 39 auto-categorized / 3 need review) → "Import N transactions" CTA calls parent callback.

**Connect email (replaces "Forward receipts by email")**
- The data actions row label is "Connect your email", not "Forward receipts by email". Email ingestion address is not exposed to the user.
- Opens `ConnectEmailSheet` with Gmail and Outlook options. Each has a **neutral initial badge** (36×36px, `background: var(--paper)`, `border: 1.5px solid var(--line)`, `color: var(--ink-2)`, `font-weight: var(--fw-bold)`) — never third-party brand colors (no red for Gmail, no blue for Outlook). The design system is monochrome — external brand colors break the visual language.
- Same connecting pattern as providers (1.8s spinner → connected checkmark).
- `emailConnections` stored separately from `connections` in app state (banks/payments are `state.connections`; email is `state.emailConnections`).
- Row sub-text updates to "[Provider] connected — watching for receipts" once linked. Trailing node switches from ChevronRight to CheckCircle.

**State keys added to `DEFAULT_STATE` (must propagate to App.jsx if not already present)**
- `connections: []` — bank/payment/payroll connections
- `emailConnections: []` — email provider connections
Both are initialized with `|| []` fallbacks inside `AddScreen` — no App.jsx change required for the demo to function.

**Do not nest buttons**
- `DataActionRow` is a `<button>`. Never pass a `<button>` as its `trailingNode` or `sub` prop. Pass SVG icons or plain divs only. The browser will warn on nested `<button>` elements and behavior is undefined.

---

## Color zone rules (ALL screens — enforced 23 Apr 2026)

These rules define exactly where accent colors are permitted. Any use outside these zones is a bug.

| Color | Token | Permitted in | Never in |
|---|---|---|---|
| Sage teal | `--sage` | Active tab icon + label only | Cards, bubbles, buttons, headers, anywhere else |
| Income green | `--income` | Income card amount text · My Books income figures · "▲ $X vs last" subcopy | Card backgrounds, category pills, confirm buttons, confidence bars |
| Income tint | `--income-bg` | Category icon background on income card only | Any other background |
| Amber | `--amber` | My Books "Needs a look" badge count · "needs your eye" stat subcopy · **CPA view: "Pending approval" badges · "Added by CPA" badges · 70–89 tax-readiness band on client cards** | Thread, founder expense cards, buttons |
| Error red | `--error` | Inline error text only · **CPA view: 3px left border on flagged rows in Books/Ledger · 0–69 tax-readiness band on client cards** | Any background fill |
| Category tints (`--cat-*`) | various | Icon tint background + icon stroke in category pills | Card backgrounds, pill borders, text, anything outside the icon |

**Approval card color rules:**
- **Expense card:** white background, `--ink` border, `--ink` amount, `--ink` Confirm button. Zero accent color.
- **Income card:** white background, `--ink` border, `--income` amount text only. Category pill, confidence bar, Confirm button — all `--ink`. No green backgrounds anywhere.

**Icon rules:**
- All icons: `stroke-width: 1.5`, `stroke-linecap: round`, `stroke-linejoin: round`, `fill: none`, 22×22 viewBox.
- Never mix stroke weights. Never use emoji as icons.
- Category icons in pills: 11×11px, colored stroke matching category tint, tint background container.
- Navigation icons: `--ink` (inactive) or `--sage` (active Penny tab only).

---

## Design token discipline (ALL screens — enforced 23 Apr 2026)

These rules apply to every `.jsx` file in `screens/`. Violations will be caught in review.

### Never use raw color literals in JSX inline styles

| Wrong | Correct |
|---|---|
| `"#fff"` | `"var(--white)"` |
| `"#0a0a0a"` | `"var(--ink)"` |
| `"#f6f6f4"` | `"var(--paper)"` |
| `"#e8e8e5"` | `"var(--line)"` |
| Any other hex, rgb, hsl | Not allowed — use a token or rgba() for opacity only |

The only permissible raw color values are `rgba(10,10,10,N)` and `rgba(255,255,255,N)` for layered transparency (e.g. dark card overlays, income variant alpha tints). All solid surfaces must use CSS custom properties.

### Never use raw font-weight numbers in JSX inline styles

| Wrong | Correct |
|---|---|
| `fontWeight: 400` | `fontWeight: "var(--fw-regular)"` |
| `fontWeight: 500` | `fontWeight: "var(--fw-medium)"` |
| `fontWeight: 600` | `fontWeight: "var(--fw-semibold)"` |
| `fontWeight: 700` | `fontWeight: "var(--fw-bold)"` |
| `fontWeight: 800` | `fontWeight: "var(--fw-extra)"` |

### Never use raw border-radius numbers in JSX inline styles

| Wrong | Correct |
|---|---|
| `borderRadius: 12` | `borderRadius: "var(--r-card)"` |
| `borderRadius: 16` | `borderRadius: "var(--r-card-emph)"` |
| `borderRadius: 20` | `borderRadius: "var(--r-sheet)"` |
| `borderRadius: 999` | `borderRadius: "var(--r-pill)"` |

Exception: values with no named token (e.g. `borderRadius: 8` for icon container corners, `borderRadius: 10` for confirmed slug pill) can stay as literals — document why in a comment.

### Use `.eyebrow` CSS class for section labels — not inline style blocks

Section headers (QUICK CAPTURE, CONNECTED ACCOUNTS, DATA ACTIONS, etc.) must use the `.eyebrow` class from `components.css`. Never recreate it with inline `fontSize: 11, fontWeight: ..., letterSpacing: ..., textTransform` styles.

```jsx
// Wrong
<p style={{ fontSize:11, fontWeight:"var(--fw-semibold)", letterSpacing:"0.12em",
  textTransform:"uppercase", color:"var(--ink-4)", margin:"0 0 12px" }}>
  Section title
</p>

// Correct
<p className="eyebrow" style={{ margin:"0 0 12px" }}>Section title</p>
```

### No third-party brand colors ever

Penny's design language is monochrome ink on paper. External service brand colors (Google red, Microsoft blue, Stripe purple, etc.) are never used — not even for provider badges. Every badge, initial, or icon must use `var(--paper)` / `var(--line)` / `var(--ink-2)` tokens.

```jsx
// Wrong — injects red brand color
<div style={{ background:"#fff4f4", border:"1px solid #fde0e0", color:"#d93025" }}>G</div>

// Correct — neutral, on-brand
<div style={{ width:36, height:36, borderRadius:10,
  background:"var(--paper)", border:"1.5px solid var(--line)",
  color:"var(--ink-2)", fontWeight:"var(--fw-bold)" }}>G</div>
```

### Sheet scrim opacity

Sheet backdrops always use `rgba(10,10,10,0.18)` — not 0.4, not 0.35. 0.18 is the canonical value from `components.css` and the design system.

### Screen title `<h1>` / `<h2>` typography

Every screen-level title (My Books, Add, etc.) must use the screen-title token set:
```jsx
style={{ fontSize:"var(--fs-screen-title)", fontWeight:"var(--fw-semibold)",
         letterSpacing:"var(--ls-tight)", color:"var(--ink)" }}
```
Never use `fontWeight: 700` or custom `letterSpacing` values for screen titles.

---

## CPA View — Product Spec Summary (Responsive Web App)

Full spec lives at `implementation/cpa-view-spec.md` v1.1. Data model lives at
`implementation/cpa-data-model.md`. Voice overlay lives at
`public/prompts/cpa-chat.md`. This section is the builder's digest — start
with the full spec before touching any code.

### What it is
A separate **responsive web app** for CPAs invited by their founder-clients.
The CPA view has read+write access to a client's tax-relevant data, scoped by
year and governed by founder approval. It is a distinct product surface at
`/cpa`, not a tab inside the founder's mobile demo. Mobile-first from 375px;
most CPAs use it on desktop.

### Settled decisions — do not re-open

1. **Responsive web, not mobile-only.** Renders at 375px (mobile) and expands
   via breakpoints at 768px (sidebar appears) and 1024px (full density). One
   codebase. Same Penny design tokens — no separate theme.
2. **Free for CPAs, unlimited clients.** No paywall, no tier.
3. **CPA must enter their license number + state** at signup (even with a
   valid invite link) before accessing any client data. No bypass.
4. **Invite link is founder-initiated** — tabbed sheet from `books.jsx`
   Send-to-CPA button ("Send snapshot" + "Invite to live books") + mirrored
   "Your CPA" row in avatar menu → Profile. Two entry points, one flow.
   Time-limited (7 days), single-use.
5. **Year access is founder-controlled.** CPA gets current year + any past
   years the founder explicitly grants. CPA can request prior years via the
   year selector → creates a `year-access-request` approval in founder's
   Needs a look.
6. **On CPA access revocation:** notes, flags, learned rules, and pending-adds
   are archived to the founder. **Chat history is deleted**, not archived
   (preserves CPA privacy contract). CPA loses access immediately on next
   request.
7. **CPA-added transactions** require founder acknowledgment before appearing
   in official books. Founder notified per `notifyCpaActivity` preference.
   Day 7 → gentle re-surface. Day 30 → opt-in for auto-accept. No hard
   timeout.
8. **Learning model is per-client.** Rules learned from CPA corrections never
   cross to other clients.
9. **CPA voice is a separate overlay** (`public/prompts/cpa-chat.md`) — same
   JSON contract, same validator. Activated by `viewer_role: "cpa"` in the
   context block. Terser, accounting-aware, no celebration emojis.
10. **CPA chat history is CPA-scoped** — founder cannot see it live. And it
    is not surfaced in the archive on revocation (decision #6).
11. **Shared zone name: "Needs a look".** "Things to Watch" is retired.

### Tax readiness score

Starts at 100%. Deductions (initial weights — tunable during build):
- uncategorized transactions × 3
- missing receipts × 2
- flagged items × 4

Clamp to [0, 100]. Visual bands:
- 90–100: clean (monochrome ink, no accent)
- 70–89: `var(--amber)`
- 0–69: `var(--error)` 3px left border on client card

Recompute on every write to `flags`, `pendingAdds`, or category assignments.
Full formula in `implementation/cpa-data-model.md`.

### CPA work queue — priority order (above the fold, dashboard + per-client)

1. Pending founder approvals (CPA suggested, waiting)
2. Uncategorized transactions
3. Missing receipts / flagged items
4. Penny questions needing CPA input

Priority indicators must be **stroke-SVG status dots** using `var(--error)` /
`var(--amber)` / `var(--ink-3)` / `var(--sage)` — never emoji.

A collapsible **"Resolved"** section lives below the active queue. Shows
approved + rejected items with founder's optional note. Auto-archives after
7 days.

### CPA → Founder approval flow (all four approval types)

```
CPA action (reclassify / request prior year / add txn) OR
Penny escalation (penny-question)
  → Approval record created in state.cpa.approvals[id]
  → Card renders in founder's "Needs a look"
  → Founder notified per notifyCpaActivity preference
  → Founder taps Approve / Keep as is (with optional note on reject)
  → APPROVE:
     · reclassification → apply change + save learnedRules[] entry
     · year-access-request → append year to yearGrants[]
     · cpa-added-txn → move txn into official ledger
     · penny-question → write CPA's answer as a learned rule
  → REJECT:
     · state preserved
     · CPA sees item in "Resolved" queue with founder's note
```

### Financial views (all with IRS line references via `util/irsLookup.js`)

- **Books** — full general ledger with CPA overlays (flag · annotate ·
  suggest reclassification · add transaction). Merged Ledger + Books tab.
- **P&L Statement** — income vs expenses by category, monthly/quarterly/
  annual, grouped by IRS form section with line chips.
- **Cash Flow Statement** — operating / investing / financing; net cash per
  period (GAAP indirect method).
- All views: filterable by date range, category, tax year, IRS form type.
  Exportable as PDF + CSV.

### Six CPA tabs (per-client view)

`Work Queue · Books · P&L · Cash Flow · Chat · Learned Rules`

(Was 7 — Books and Ledger were duplicates. Merged.)

### Penny-question escalations — four trigger cases only

Penny writes `approvals[].type = "penny-question"` when:

1. **Low-confidence streak** — same vendor pattern, 3+ repeats at confidence
   < 70% with competing category candidates.
2. **Ambiguous IRS routing** — transaction could map to two IRS lines (e.g.
   Section 179 vs depreciation over 5 years).
3. **Tax-sensitive edge case** — entity conversion mid-year, S-Corp owner
   payroll-vs-draw split, 1099 eligibility threshold, foreign tax credit.
4. **Founder-initiated handoff** — founder tapped "ask my CPA" on a flagged
   card, routing it to the CPA queue instead of resolving in-app.

No other trigger. Unknown triggers are a bug.

### Build order for CPA view

| Phase | What | Dependency |
|---|---|---|
| 1 | **Approval card variant** — add `variant: "cpa-suggestion"` to `ApprovalCard` (card.jsx). Wire into founder's Needs a look. No CPA-side UI yet. | None — builds on existing books.jsx and card.jsx |
| 2 | **Invite flow** — tabbed Send-to-CPA sheet in books.jsx + "Your CPA" row in avatar-menu. `state.cpa.invites[]` writes. | Needs Phase 1's state.cpa scaffolding |
| 3 | **CPA auth** — `/cpa` route + AuthGate (invite token validation, license verification, account creation). | Needs Phase 2 |
| 4 | **CPA app shell** — `.cpa-app` wrapper, `#sheet-root-cpa` portal, responsive breakpoints, top nav, client-switch affordance. | Needs Phase 3 |
| 5 | **Per-client view tabs** — Work Queue · Books · P&L · Cash Flow · Learned Rules. IRS line chips via `util/irsLookup.js`. | Needs Phase 4 |
| 6 | **CPA overlays on Books** — flag · annotate · suggest reclassification · add transaction. Writes into `state.cpa.clients[].{flags, annotations, pendingAdds}`. Suggestions create approvals. | Needs Phase 5 |
| 7 | **CPA Chat tab** — `books.qa` intent with `viewer_role: "cpa"` context. Activates `cpa-chat.md` overlay. CPA-scoped `chatHistory[]`. | Needs Phase 5 |
| 8 | **Multi-client dashboard** — landing screen at `/cpa/dashboard`. Work queue across all clients + client card grid with tax-readiness scores. | Needs Phases 5–7 stable |

### Design rules specific to CPA view

- Use `styles/tokens.css` tokens only. New tokens for this view:
  `--fs-data-row`, `--ls-chip`.
- **Data rows:** `font-size: var(--fs-data-row)`, `--fw-regular`, `--ink`.
- **Column headers:** `font-size: var(--fs-eyebrow)`, `--fw-semibold`,
  `--ink-3`, `text-transform: uppercase`, `letter-spacing: var(--ls-eyebrow)`
  — use a `.eyebrow--col` modifier class (resets mobile-section margins).
- **IRS line chips:** monospace, `var(--ink-3)`, `var(--fs-tiny)`,
  `text-transform: uppercase`, `letter-spacing: var(--ls-chip)` — same chip
  helper as `irsLineChip()` in `util/irsLookup.js`.
- **Flagged rows:** `var(--error)` 3px left border. Never a background fill.
- **CPA-added rows:** `var(--amber)` "Added by CPA" text badge.
- **Pending approval rows:** `var(--amber)` "Pending" text badge.
- **Approved/clean rows:** no accent color.
- **Priority dots in work queue:** stroke-SVG, never emoji. Colors:
  `var(--error)` (pending approval), `var(--amber)` (uncategorized),
  `var(--ink-3)` (missing receipt/flagged), `var(--sage)` (Penny question).
- **Export buttons:** add a `.btn-ghost` class to `components.css` —
  transparent background, `var(--ink)` border `1.5px`, `--fw-semibold`,
  `--r-pill`. Used for PDF / CSV export buttons and filter actions.
- **No third-party brand colors.** Same rule as founder app.
- **All sheets, toasts, portals** — same rules as founder app, rooted at
  `.cpa-app` + `#sheet-root-cpa` instead of `.phone` + `#sheet-root`. Never
  `position: fixed`.

---

## What to ask me (the CEO) before proceeding

Before starting any screen, confirm:
- The brief is unambiguous to you
- No other file needs to change
- You understand the AI voice integration for that screen

If any of the above is unclear, stop and ask.

---

## References (read-only, do not modify)

- `DESIGN.md` — machine-readable design system for this demo. YAML tokens + prose rules for all colors, typography, radii, spacing, components, and Do's/Don'ts. Read this at the start of every screen build session.
- `../product/02-principles-and-voice.md` — canonical voice rules
- `../product/19-demo-flow-brief.md` — full demo flow brief (source of all screen-briefs)
- `../product/17-mobile-screens-and-flows.md` — mobile screens spec
- `../design/design-system.md` v2.0 — design system prose (human-readable; DESIGN.md is the machine-readable companion)
- `../penny-system-prompt.md` — production Penny system prompt (base for `prompts/penny-system.md`)
- `implementation/cpa-view-spec.md` v1.1 — CPA view product spec (locked)
- `implementation/cpa-data-model.md` — `state.cpa` schema + mutation contracts
- `public/prompts/cpa-chat.md` — CPA voice overlay (appended on top of `penny-system.md` when `viewer_role: "cpa"`)

## How you build each CPA screen

CPA screens follow the same single-screen-per-session discipline as the
founder app. For each CPA screen, read exactly these seven files, no more:

1. `CLAUDE.md` (this file)
2. `DESIGN.md` — machine-readable design system
3. `styles/tokens.css` — CSS custom properties (runtime source of truth)
4. `public/prompts/penny-system.md` — base voice
5. `public/prompts/cpa-chat.md` — CPA voice overlay
6. `implementation/cpa-view-spec.md` v1.1 — the product spec
7. `implementation/cpa-data-model.md` — the state schema + mutations
8. `screen-briefs/09-cpa-view.md` — the scoped build brief for the CPA
   screen you are building

Then build the corresponding component in `screens/cpa/*.jsx`. Do not edit
founder screens. Do not edit the data-model doc. Do not add new tokens.

---

---

## My Books standards (Screen 5)

- Layout: flex column `height: 100%`. Scrollable body (`flex: 1; overflow-y: auto`) + Ask bar (`flex-shrink: 0`) above the tab bar. **Never use `position: fixed` for the ask bar** — it must be inside the flex flow.
- **Stat card hierarchy — do not use equal 3-column grid:**
  - **Runway hero card** (full width, `background: var(--ink)`, white text): 38px bold number + "days" label + right-aligned context text. This is the dominant financial signal.
  - **Net + Books row** (`grid-template-columns: 1fr 1fr`, 22px bold): secondary metrics beneath the hero. Each: eyebrow → number → subcopy.
  - Never `grid-template-columns: 1fr 1fr 1fr` — that three-equal layout was the v2.0 pattern and is retired.
- Needs a look: taps open a sheet with the `ApprovalCard` component. Empty state: "All caught up ✓".
- Coming up: static list from `scenario.upcoming` with type icons (tax / invoice / recurring).
- Drill-downs (Explore): 4 rows, all currently stub to a toast "Coming soon — full detail view."
- **Zone 5 — Invoices:** dashed "New invoice" tile below Explore. `.eyebrow` label "Invoices", document SVG icon (16×16, `stroke-width: 1.5`) in `var(--paper)` 36×36px container (`border-radius: 8`), semibold label, muted subtitle "Create, send, or schedule recurring". `border: "1.5px dashed var(--line-2)"`, `borderRadius: "var(--r-card)"`. Tapping calls `navigate("/invoice")`.
- Ask Penny bar submits `books.qa` intent and renders the response as a `BooksBubble` inline above the bar. Auto-scrolls to answer.
- Scenarios loaded from `/config/scenarios.json` keyed by `{entity}.{industry}`.

## Avatar menu standards (Screen 6)

- Full-screen overlay at `#/avatar` — NOT a tab. No AI calls.
- Three sub-screens managed by local `sub` state (null → profile / memory / preferences). Back chevron returns to the root menu.
- **Profile**: editable fields with inline edit/save-on-blur. Entity change triggers a confirm sheet with IRS disclaimer copy before committing. CPA contact section at bottom.
- **Memory**: read-only list of seeded rules. Each row has a "Forget" link that removes the item from local state.
- **Preferences**: check-in time picker (reuses `.checkin-days` / `.checkin-times` grid classes from onboarding), notification toggle ("Real-time" / "Daily digest" — never "Instant"/"Batch"), Face ID toggle, AI training toggle (default off). All persist to `state.preferences`.
- Footer: "Export my data" (ghost btn) + "Cancel my account" (text link). Both stub to a toast "Demo only — this would trigger the real flow."

## Invoice designer standards (Screen 7)

- Two modes toggled by a "Preview / Edit" button in the header: **detail form** (edit) and **live preview** (read-only invoice render).
- No AI calls. All formatting is deterministic.
- Business name pre-populated from `persona.business`. Invoice number is random `INV-XXXX` on mount.
- Line items: `display: grid; grid-template-columns: 1fr 56px 72px 28px`. Remove button uses `min-width: unset; min-height: unset` to avoid tap-target inflation.
- Tax rate input at the bottom; subtotal shown live. Tax line only shown in preview if rate > 0.
- Payment methods: multi-select grid (8 options). Toggled by tapping a pill.
- Actions: Send (sheet with email + message), Save draft, Download PDF, Set up recurring (sheet with frequency picker), all stub to toasts.
- Back chevron navigates to `#/books`.
- **Toast fix:** outer div must have `position: relative` so the absolute-positioned `.toast` anchors within the phone frame, not the viewport.

## Overlay / toast positioning rule (ALL screens)

**`.phone` has `position: relative`.** This is the positioning context for all overlays. Every sheet backdrop, sheet, and toast must use `position: absolute` — never `position: fixed`. `position: fixed` escapes the phone frame and renders against the viewport.

- `.sheet-backdrop` → `position: absolute; inset: 0`
- `.sheet` → `position: absolute; bottom: 0`
- `.toast` / `.card-toast` → `position: absolute; bottom: Npx`
- Inline Toast components in screens → `position: absolute` not fixed

This is enforced in `styles/components.css`. Do not revert it.

---

*Last updated: 23 April 2026 — Color system pass (v2.2): semantic accent tokens added, color zone rules locked, icon system documented. All 7 screens audited against `design/design-system.md` v2.1. Fixes applied to `screens/add.jsx` and `screens/books.jsx`: raw `#fff` → `var(--white)`, font-weight literals → CSS tokens, borderRadius literals → CSS tokens, third-party brand colors (Gmail red, Outlook blue) replaced with neutral ink-on-paper badges, section eyebrow labels converted to `.eyebrow` class, sheet scrim corrected to `rgba(10,10,10,0.18)`, screen title typography aligned to `--fs-screen-title`/`--fw-semibold`/`--ls-tight`. Design token discipline section added to this file. Screen brief 04-add.md updated to remove incorrect branded-badge guidance.*

*23 April 2026 — BASE_URL audit (v2.3): All `import.meta.env.BASE_URL` usages replaced with `window.PENNY_CONFIG?.baseUrl || "/"` across `screens/card.jsx` (CategorySheet), `screens/onboarding.jsx` (industries.json + scenarios.json prewarm), and `worker-client.js` (prompt loader). Settled decision #12 added. Debug variable `window.__scenarioDebug` removed from `App.jsx`.*

*23 April 2026 — IRS taxonomy pass (v2.5): scenarios.json audit complete. 53 category label fixes applied across all 20 scenarios. See full fix log in `../product/irs-persona-taxonomy.md` Part 4.*
- *`"Other operating expenses"` → `"Miscellaneous business expenses"` (Sch C Line 27a) — 30 occurrences, all drilldown.ledger entries.*
- *Meals labels → all updated with `(50%)` suffix: `"Business meals (50%)"`, `"Client meals (50%)"`, `"Travel & client meals (50%)"`, `"Meals & entertainment (50%)"`.*
- *`"Truck payment"` → `"Vehicle depreciation & loan interest"` — loan principal is not deductible.*
- *`"Inventory"` / `"Product inventory"` → `"Inventory (COGS)"` / `"Product inventory (COGS)"` — inventory is an asset until sold.*
- *`"Food & ingredients"` in food-bev scenarios → `"Food & ingredients (COGS)"` — must route to Schedule C Part III, not Line 22.*

**IRS taxonomy rules for scenarios.json — do not revert:**
1. **Meals are always 50%.** Every category label containing "meal", "dining", or "entertainment" must include `(50%)` in the label. Never show meals as 100% deductible.
2. **"Other operating expenses" is banned.** Use `"Miscellaneous business expenses"` (Schedule C Line 27a / Form 1065 Line 20). If building new scenarios, never use "Other operating expenses" — it has no IRS line.
3. **Food & ingredients in food-bev scenarios is COGS.** Always label as `"Food & ingredients (COGS)"`. Never as a Line 22 supply.
4. **Inventory is COGS, not an expense.** Always `"Inventory (COGS)"` or `"Product inventory (COGS)"`. Recognized when goods are sold, not when purchased.
5. **Truck/vehicle loan payments are not deductible.** The deductible items are depreciation (Sch C Line 13) and loan interest (Line 16b). Use `"Vehicle depreciation & loan interest"` as the combined label.

**LLC dual-path rule — both IRS paths are now documented:**
The 4 LLC personas (llc.trades, llc.retail, llc.food-beverage, llc.other) have two possible IRS forms depending on ownership:
- **Single-member LLC (SMLLC)** → disregarded entity → **Schedule C** (same lines as sole prop)
- **Multi-member LLC (MMLLC)** → partnership → **Form 1065** + Schedule K-1
The transaction data in scenarios.json is identical for both. The IRS line routing differs. Both paths are fully documented in `../product/irs-persona-taxonomy.md` — see the LLC IRS Line Crosswalk table and each LLC persona card (P06, P08, P10, P20).
Penny must ask at onboarding for LLC owners: "Is this LLC owned by just you, or do you have a co-owner?" This determines which form is used.

*23 April 2026 — Invoice entry point + toast fix (v2.6):*
- *My Books Zone 5 added: "New invoice" dashed tile navigates to `#/invoice`. Design tokens compliant — `var(--line-2)` border, `var(--r-card)` radius, `var(--paper)` icon container.*
- *Invoice screen outer div given `position: relative` so `.toast` anchors correctly within the phone frame (was escaping to viewport).*
- *`screen-briefs/05-books.md` updated with Zone 5 spec. `screen-briefs/07-invoice.md` entry point corrected.*

*23 April 2026 — UX & tone pass (v2.4):*
- *Settled decision #2 updated: onboarding Penny copy is now static (`FALLBACK_COPY` in `screens/onboarding.jsx`), not AI-generated. Rationale: AI responses were inconsistent across loads and broke tone. `ai.renderPenny` calls removed from all onboarding steps.*
- *Approved onboarding copy table added to CLAUDE.md (locked — do not change without sign-off).*
- *Screen transition standard added: `screen-enter` animation on all `.phone-content` mounts.*
- *Bottom sheet canonical implementation documented: duplicate CSS block removed, flex-child positioning, `sheet-slide-up` keyframe.*
- *Thread intro → main transition: `.thread-main-enter` wrapper with fade-in documented.*
- *Voice recording modal standard documented: 28-bar waveform, `voiceBar` keyframe, `BARS` seeded array.*
- *Penny bubble copy tone guide expanded with good/bad examples and banned phrases.*
