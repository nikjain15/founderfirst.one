# 01 — Founder Demo Code: Forensic Audit

**Audited:** 24 April 2026
**Surface:** `BookKeeping/demo/screens/*.jsx` (onboarding, thread, card, add, books, avatar-menu, invoice), `App.jsx`, `main.jsx`, `index.html`, `components/TabBar.jsx`, `styles/tokens.css`, `styles/components.css`, `worker-client.js`, `util/*.js`, `guardrails/*.js`, `tests/validator.test.js`, `vite.config.js`, `package.json`.
**Ground truth:** `BookKeeping/demo/CLAUDE.md`, `BookKeeping/demo/DESIGN.md`. Scope is the demo folder only — nothing outside `BookKeeping/demo/` is in play for this audit or any remediation that follows.
**Lens:** bug-finding **plus** AI-scalability — each finding is annotated by its category so the remediation plan (`scaffolding-proposal.md`) can target the ones that corrupt future AI-built code.

---

## How to read this file

Findings are grouped into four categories **reframed from the raw severity buckets**, because your stated goal is "make this codebase AI-buildable at scale." Under that lens, a duplicate CSS rule can matter more than a visual bug, because the duplicate teaches an AI the wrong pattern forever.

| Category | Definition | What happens if we don't fix |
|---|---|---|
| **A. Ambiguity risks** | Rule violations and inconsistent patterns that exist inside shipped code. | A future AI session reads the repo, finds two patterns for the same thing, picks one at random, and drift widens with every new feature. |
| **B. Runtime bugs** | Things that will misbehave visibly for a user. | Demo breaks or looks unprofessional. Doesn't directly corrupt future AI work. |
| **C. Voice / tone gaps** | Copy that drifts from the documented voice rules or is scattered outside the copy-registry pattern. | Penny gains a bimodal voice; next AI session can't tell which "Penny" to copy. |
| **D. Positive observations** | What's actually right. | Preserve these patterns — they are the training set we want agents to extend. |

Each finding has: **File · What is wrong · Why it matters · Proposed fix · AI-scalability impact.**

Severity is still provided (`Critical / High / Medium / Low`) so the existing triage convention still holds.

---

## Counts

| Category | Findings |
|---|---|
| A. Ambiguity risks | 9 |
| B. Runtime bugs | 8 |
| C. Voice / tone gaps | 3 |
| D. Positive observations | 6 |
| **Total** | **26 primary findings** (rolls up to ~60 sub-issues when token-discipline sweeps are fully expanded in §E) |

---

## A. Ambiguity risks — fix these before anything else

These are the items that the `scaffolding-proposal.md` targets. Every item here either (a) violates a documented rule in a shipped screen, or (b) establishes a second valid-looking pattern for something that should have exactly one.

### A.1 — Two sheet/overlay patterns coexist
**Severity:** High · **Files:** `screens/card.jsx` (canonical), `screens/add.jsx` (canonical — but inline modals bypass the portal), `screens/books.jsx` (canonical), `screens/avatar-menu.jsx:354-371` (sibling pattern, non-canonical), `screens/invoice.jsx:209-210, 280-281` (sibling pattern, non-canonical).
**What is wrong:** The canonical overlay pattern in `demo/CLAUDE.md` is (i) `createPortal` to `#sheet-root`, (ii) the sheet nested inside the `.sheet-backdrop` as a flex child, (iii) `position: absolute`. `avatar-menu.jsx`'s entity-change confirm and two sheets in `invoice.jsx` use sibling backdrop+sheet and skip the portal. `add.jsx`'s `VoiceModal` and `PhotoOverlay` are rendered inline in the tree (anchored by the wrapping `.phone-content`) rather than via portal.
**Why it matters:** Three live patterns for one concept. The rule says one pattern.
**Proposed fix:** Extract a shared `<Sheet>` component and a shared `<FullScreenOverlay>` component. Every screen imports them. Update `CLAUDE.md` to name these as the only legal overlay primitives.
**AI-scalability impact:** This is the single biggest one. When an agent is asked to "add a sheet," it greps the repo for sheet patterns — right now it finds three. Next feature inherits a random one. Within three features the codebase has four patterns, then five.

---

### A.2 — Color-zone rules violated in shipped production code
**Severity:** Critical · **Files:** `screens/books.jsx:814-833` (Q2 estimated tax banner with `background: var(--amber)`), `screens/books.jsx:1240-1251` ("Books" stat pill with `background: var(--amber), color: var(--white)`).
**What is wrong:** `demo/CLAUDE.md` color-zone table is explicit: `--amber` is permitted on "Needs a look" badge and the "needs your eye" stat subcopy. **Never as background fill.** Both instances above use amber as a solid background fill.
**Why it matters:** The settled rule is violated in live code. Visually it also pushes the My Books screen into a register we said we'd never use.
**Proposed fix:** Tax banner: `background: var(--paper)` with amber text + optional 2px amber left border; pill: ink dot + ink text. Add an automated color-zone lint rule.
**AI-scalability impact:** If the rule exists in CLAUDE.md **and** the violation exists in shipped code, an AI agent has two data points and will pattern-match whichever it reads last. This is precisely the "crystal clear implementation" problem. Fix code to match rule, or fix rule to match code — but one has to yield.

---

### A.3 — Card variants scattered as magic strings
**Severity:** High · **Files:** `screens/card.jsx`, `screens/thread.jsx`, `screens/add.jsx`, CPA spec docs.
**What is wrong:** Variant keys — `"income"`, `"income-celebration"`, `"owners-draw"`, `"rule-proposal"`, `"cpa-suggestion"`, `"variable-recurring"`, etc. — appear as raw string literals across at least three JSX files plus the CPA spec. No central enum. No TypeScript (the codebase is pure `.jsx`). No runtime validation that a variant is a known member.
**Why it matters:** Adding a new variant requires grepping. Typos are silent. Agents extending a screen won't know the full set.
**Proposed fix:** `demo/constants/variants.js` exports `VARIANTS` (frozen object) and `isKnownVariant(v)` helper. Every screen imports from this file. Add a unit test that enumerates every variant referenced in the codebase and verifies it's in the enum.
**AI-scalability impact:** An AI asked to "add a new card type" today has no way to discover the existing set. An AI asked to "add CPA approval flow" touches variant strings blindly. This blocks every non-trivial extension.

---

### A.4 — Penny copy scattered outside the documented registry
**Severity:** High · **Files:** `screens/thread.jsx:43-50` (hard-coded "What's your name?" / "Nice to meet you, {name}!"), `screens/onboarding.jsx` `FALLBACK_COPY` (central, good), `screens/card.jsx:490-505` (inline fallback headlines per variant), various toast strings.
**What is wrong:** `CLAUDE.md` says onboarding copy lives in `FALLBACK_COPY`. But `thread.jsx` hard-codes the intro strings inline, `card.jsx` has a per-variant `fallbackMsg()` function, and several toasts carry user-facing copy inline in screens. There is no single source of truth for any given Penny utterance.
**Why it matters:** "Change Penny's tone on intro" is a multi-file task. "Audit all Penny copy" is a grep. "Localize" is impossible without first consolidating.
**Proposed fix:** `demo/constants/copy.js` (or `public/copy/*.json` for i18n readiness). Every hard-coded Penny string moves there. `CLAUDE.md` "Penny speaks" section names this as the only legal home for static copy.
**AI-scalability impact:** An agent asked to "polish Penny's tone" has no single place to edit. It will touch three files, miss a fourth, and ship a bimodal voice. This is the #2 scalability risk after A.1.

---

### A.5 — Token-discipline violations inside shipped screens
**Severity:** High · **Files:** `screens/invoice.jsx:412-465` (PDF template — raw `#0a0a0a`, `#666`, `#888`, `#e0e0dc`, `#f0f0ec`; raw `fontWeight: 600, 700`), `screens/books.jsx:1211` (`rgba(26,158,106,0.9)` hand-coded from `--income`), `screens/books.jsx:1199` (`borderRadius: 16`), `screens/avatar-menu.jsx:116` (`rgba(0,0,0,...)` instead of `rgba(10,10,10,...)`), `screens/add.jsx:131, 149, 648` (`borderRadius: 999` / `99`), multiple screens (uncommented `borderRadius: 8` / `12`).
**What is wrong:** `demo/CLAUDE.md` "Design token discipline" section is explicit — no raw hex, no raw font-weight numbers, no raw radii without a documented exception. Live code violates all three rules in multiple files.
**Why it matters:** DESIGN.md is supposed to be the single source of truth for AI agents. When agents read screen code for examples, they find violations. They learn the violations.
**Proposed fix:** (i) One-time sweep. (ii) Add a lint rule or a pre-commit guard that regex-rejects raw hex in JSX inline styles. (iii) For the PDF template, extract a CSS-var inlining helper so tokens round-trip into the print HTML.
**AI-scalability impact:** DESIGN.md becomes meaningless if the codebase diverges from it. Fix now or DESIGN.md becomes theater.

---

### A.6 — Two near-identical voice-waveform components
**Severity:** Medium · **Files:** `screens/books.jsx:366-447` (`VoiceAskModal`, bars use `%` heights), `screens/add.jsx:611-684` (`VoiceModal`, bars use `px` heights).
**What is wrong:** Same visual intent (pulsing voice waveform, 28 bars, seeded animation delays, auto-stop). Two implementations. Units drift (`%` vs `px`). Future voice surfaces (onboarding voice-in, CPA voice search) will fork again.
**Why it matters:** "Penny listens" is one behavior that should have one component.
**Proposed fix:** `components/VoiceWaveform.jsx` with props `{ isRecording, maxSeconds, onStop, label }`. Both screens import it.
**AI-scalability impact:** When a future agent is asked to "add voice input to onboarding," it will look at the two existing voice components and pick one (or, worse, write a third). Consolidate now.

---

### A.7 — Duplicate and dead CSS
**Severity:** Medium · **Files:** `styles/components.css:404-411` AND `:755-761` (both define `.sheet-handle`), `styles/components.css:518-520` (`.thread-bubble {}` empty rule), `screens/books.jsx:443` (redundant local `@keyframes spin` when one exists globally at `components.css:865`).
**What is wrong:** CSS rules duplicated or empty. Animations duplicated inline where a global exists.
**Why it matters:** Second `.sheet-handle` silently wins; first is dead. Empty rule misleads. Local keyframe can collide with global.
**Proposed fix:** Delete first `.sheet-handle` block. Delete empty `.thread-bubble`. Remove local `@keyframes spin` in `books.jsx`.
**AI-scalability impact:** An AI reading `components.css` top-down sees `.sheet-handle` defined, then overridden 350 lines later. Wastes context, invites "why is this here twice?" debates.

---

### A.8 — Dead code paths in onboarding
**Severity:** Low · **Files:** `screens/onboarding.jsx:19-39` (`STEP_INTENT` and `STEP_CONTEXT_KEY` constants).
**What is wrong:** These constants were used by the earlier AI-driven onboarding copy flow. Settled decision #2 replaced that with `FALLBACK_COPY`. The constants are now unreferenced.
**Why it matters:** An agent reading onboarding.jsx sees two complete-looking systems (static `FALLBACK_COPY` and intent-driven `STEP_INTENT`) and may try to wire one to the other.
**Proposed fix:** Delete both constants.
**AI-scalability impact:** Vestigial scaffolding. Low risk but high confusion-per-line.

---

### A.9 — Tab bar ARIA mis-use
**Severity:** Low · **Files:** `components/TabBar.jsx:44-62`.
**What is wrong:** Buttons have `role="tab"`, parent has `role="tablist"`, but no corresponding `role="tabpanel"` exists anywhere. ARIA tab pattern is incomplete.
**Why it matters:** Accessibility. Screen-reader users will hear "tab, 1 of 3" but have no associated panel.
**Proposed fix:** Drop `role="tab"` / `role="tablist"` — use plain `<nav>` semantics. Or complete the pattern by adding `role="tabpanel"` + `aria-labelledby` on each screen wrapper.
**AI-scalability impact:** An agent copying TabBar for a new tabbed view (e.g. the CPA six-tab shell) will inherit the broken pattern. Fix once, here.

---

## B. Runtime bugs

These will misbehave for real users. Lower AI-scalability impact because they are bugs in one place — an AI agent wouldn't necessarily copy them. But demo risk is real.

### B.1 — `netSubcopy` always shows ▲ (upward arrow) regardless of direction
**Severity:** High · **File:** `screens/books.jsx:1157`.
**What is wrong:** `netSubcopy` hard-codes `▲` prefix. If `netVsLast` goes negative, UI still shows up-arrow.
**Proposed fix:** `const arrow = netVsLast >= 0 ? "▲" : "▼";`.
**AI-scalability impact:** Low — one-line bug.

### B.2 — `MicIcon` drops its `style` prop
**Severity:** Medium · **File:** `screens/books.jsx:341, 416`.
**What is wrong:** `MicIcon` is a stroke-SVG component that doesn't accept or forward `style`. Consumer at line 416 passes `style={{ color: ..., width: 28, ...}}` and it's silently dropped. Works by accident because the parent containers size correctly.
**Proposed fix:** Accept `size` + `color` props or `...rest` spread onto `<svg>`.
**AI-scalability impact:** Low as a bug but medium as a pattern — agents extending icons may copy the signature and repeat the drop.

### B.3 — "Download PDF" is actually print
**Severity:** Medium · **File:** `screens/invoice.jsx:399-477`.
**What is wrong:** `handleDownloadPDF` builds HTML, injects into iframe, calls `contentWindow.print()`. Button label says "Download PDF" but behavior is a print dialog.
**Proposed fix:** Rename button "Print PDF" (honest), or integrate a PDF library for a true download.
**AI-scalability impact:** Low — but when an agent implements "Export to CSV" or "Email invoice" next, it may copy this pattern expecting real file download.

### B.4 — Shallow state merge in `readState`
**Severity:** High · **File:** `App.jsx:73-80`.
**What is wrong:** `return { ...DEFAULT_STATE, ...parsed }` — top-level spread only. Nested objects like `preferences`, `cpa` are replaced wholesale. Adding a new default preference won't reach returning users.
**Proposed fix:** Deep-merge helper with explicit per-key fallback.
**AI-scalability impact:** Medium — every new nested preference added by future agents will silently fail for returning users. Fix the merge pattern now.

### B.5 — Invoice number regenerates on every mount
**Severity:** Medium · **File:** `screens/invoice.jsx:29`.
**What is wrong:** `INV-XXXX` is randomized in a module-level or mount-level initializer without checking if `state.invoiceDraft` holds an existing number.
**Proposed fix:** `const invoiceNumber = state.invoiceDraft?.number ?? generateInvoiceNumber();`.

### B.6 — `cpaSheeet` typo
**Severity:** Low · **File:** `screens/books.jsx:1099, 1606, 1613`.
**What is wrong:** Triple-`e` in a state variable name. Works, confuses reviewers.
**Proposed fix:** Rename `cpaSheeet` → `cpaSheet` in all three places.

### B.7 — Card income-variant fallback missing CTAs
**Severity:** Medium · **File:** `screens/card.jsx:497`.
**What is wrong:** `fallbackMsg()` for `card.variant === "income"` returns headline + why but omits `ctaPrimary`/`ctaSecondary`. Validator for `card.approval` requires both.
**Proposed fix:** Include `ctaPrimary: "Confirm"`, `ctaSecondary: "Change"` in every fallback.
**AI-scalability impact:** Medium — contract drift. Any future agent extending fallbacks for new variants will look here and miss the CTAs.

### B.8 — Stale-CPA-add card has chevron but no destination
**Severity:** Low · **File:** `screens/books.jsx:1323-1326`.
**What is wrong:** Row renders `<ChevronRight />` (visual promise: "opens detail") but `onClick` just toasts "Tap 'Invite to live books' to manage…".
**Proposed fix:** Either route to the CPA sheet or remove the chevron.

---

## C. Voice / tone gaps

### C.1 — Thread intro strings ("What's your name?", "Nice to meet you, {name}!") are hard-coded in JSX
Same as **A.4**, listed again here because it is also a voice-registry problem.

### C.2 — No tests cover the Penny-voice contract for every intent
**Severity:** Medium · **File:** `tests/validator.test.js`.
**What is wrong:** Only 9 test cases. Missing: `capture.parse` output shape, `headlineMaxChars` enforcement, multi-emoji rejection, approved-emoji round-trip (`💪`, `👋`).
**Proposed fix:** Add a test per intent with representative good/bad fixtures.
**AI-scalability impact:** High — the validator is the voice gate. Thin coverage means the gate passes regressions.

### C.3 — Banned-phrase regex is narrow; allow-list approach lives in a different file
**Severity:** Low · **Files:** `guardrails/banned-phrases.js:85`, `guardrails/voice-validator.js:24` (`APPROVED_EMOJI`).
**What is wrong:** `banned-phrases.js` uses deny-list regex that misses several emoji (OK hand, praying, 100-score). `voice-validator.js` uses allow-list `APPROVED_EMOJI`. Two gates, inconsistent strategies.
**Proposed fix:** Retire the deny-list regex on emoji; let the allow-list in the validator be the single gate.

---

## D. Positive observations (preserve these)

1. **Intent map discipline.** `INTENT_MAP` in `worker-client.js` is explicit, exhaustive, throws loudly on unknowns. Exactly the pattern `CLAUDE.md` demanded after the v4 bug.
2. **Retry-with-feedback loop** (`guardrails/retry-on-fail.js`) correctly never bypasses validation on the last attempt.
3. **`window.PENNY_CONFIG` discipline** fully honored — zero `import.meta.env.BASE_URL` leaks in screens.
4. **No banned British spellings** anywhere (full regex sweep clean).
5. **No banned emoji** (`😊 👍 ✅ ⚠️`) in any runtime screen code. Guardrail chain works.
6. **Currency formatting is consistent** — every screen uses `Intl.NumberFormat("en-US", { style: "currency" })`. No bare template strings.

---

## E. Raw findings archive (preserved for traceability)

The below is the unedited output from the first forensic pass. It contains items that have been rolled up into the A/B/C categorization above, plus low-severity polish items that didn't warrant a top-level entry. Preserved so any future audit has the full evidence trail.

<details>
<summary>Click to expand — ~60 raw items, severity-bucketed</summary>

### Critical (ship-blocking)
- `worker-client.js:75-82` + `screens/onboarding.jsx:19-39` — `STEP_INTENT` is dead; references `onboarding.ready` which has no `INTENT_MAP` entry. If AI call is re-enabled, it throws.
- `screens/invoice.jsx:412-465` — PDF template uses raw hex + raw font-weights. Drifts silently from design tokens.
- `screens/books.jsx:1211` — `rgba(26,158,106,0.9)` hand-coded from `--income`.
- `screens/books.jsx:814-833` + `:1240-1251` — amber used as background fill (zone violation).

### High
- `screens/onboarding.jsx:305, 321` — `useEffect` deps include selection state; fragile per CLAUDE.md stability rule.
- `screens/card.jsx:497` — income fallback missing CTAs (contract drift).
- `screens/books.jsx:416` — `MicIcon` drops `style` prop.
- `screens/books.jsx:443` — redundant local `@keyframes spin`.
- `screens/books.jsx:1099` — `cpaSheeet` typo.
- `screens/books.jsx:1157` — `netSubcopy` always `▲`.
- `screens/books.jsx:1326` — stale-add row has chevron but no destination.
- `screens/invoice.jsx:84, 104, 572, 620` — raw `borderRadius` literals without tokens/comments.
- `screens/invoice.jsx:11-12, 404` — `fmt()` duplicated as `fmtD()`.
- `screens/avatar-menu.jsx:116` — `rgba(0,0,0,...)` instead of `rgba(10,10,10,...)`.
- `screens/avatar-menu.jsx:354-371` — sibling backdrop+sheet pattern (non-canonical).
- `screens/invoice.jsx:209-210, 280-281` — sibling backdrop+sheet pattern (non-canonical).
- `screens/add.jsx:611-684, 713-720` — inline `VoiceModal` + `PhotoOverlay` (non-portal).
- `screens/books.jsx:1199` — `borderRadius: 16` should be `var(--r-card-emph)`.
- `screens/books.jsx:642, 644` — `borderRadius: 2` literal.
- `screens/books.jsx:1370, 1398, 1479` — `borderRadius: 8` without comment.
- `screens/thread.jsx:109` — `useEffect` dep includes boolean expression (React anti-pattern).
- `screens/card.jsx:265` — effect deps exclude variant/amount/confidence.
- `App.jsx:73-80` — shallow state merge wipes nested preferences.
- `App.jsx:83-89` — `writeState` has no shape validation.

### Medium
- `App.jsx:28` — redundant parens in BASE_URL template.
- `App.jsx:198` — unknown-route fallback visibility logic.
- `components/TabBar.jsx:44-62` — ARIA tab pattern incomplete.
- `worker-client.js:122-125` — shared demo token (documented).
- `worker-client.js:105-107` — CPA overlay activation coupling (noted).
- `screens/onboarding.jsx:195-197` — shared ref attached to welcome + bubble.
- `screens/thread.jsx:368-378` — variant strings spread across files.
- `screens/card.jsx:24-29, 89-98, 345-358, 376-398, 443-452` — multiple inline-style blocks duplicating `.eyebrow` class.
- `screens/add.jsx:131, 149, 648` — `borderRadius: 999` / `99` should be `var(--r-pill)`.
- `screens/add.jsx:439` — mixed-type fake data (`count` is number, siblings are strings).
- `screens/books.jsx:386, 428` vs `add.jsx:609` — `VoiceWaveform` units drift `%` vs `px`.
- `screens/books.jsx:1204-1238` — eyebrow styled inline instead of via `.eyebrow` class.
- `screens/books.jsx:1503` — mixed horizontal padding strategy on ask-bar.
- `screens/avatar-menu.jsx:590-591` — toast repeated across three sub-screens.
- `screens/avatar-menu.jsx:646-649` — "Export my data" routes generically to `#/add` not the export sheet.
- `screens/invoice.jsx:29` — invoice number regenerates every mount.
- `screens/invoice.jsx:467-476` — "Download PDF" is print.
- `util/analytics.js:11` — unguarded `posthog.init` with potentially undefined key.
- `util/cpaState.js:44-45` — uncategorized + missingReceipts double-count in readiness score.
- `util/irsLookup.js` — no trim on lookup key.
- `tests/validator.test.js` — thin coverage (9 cases).
- `guardrails/banned-phrases.js:85` — narrow emoji deny-list duplicates allow-list in voice-validator.

### Low
- `index.html:12` — `theme-color` raw hex (acceptable but drift-risk).
- `index.html:17-19` — Google fonts preconnect (prod CSP risk).
- `worker-client.js:118, 128` — two access patterns for PENNY_CONFIG; hard-coded `max_tokens: 400`.
- `App.jsx:35-49, 107` — `usePhoneScale` undebounced; `ai` memoized.
- `screens/onboarding.jsx:180-181` — ellipsis character used correctly.
- `screens/thread.jsx:43` — hard-coded Penny intro copy (also A.4).
- `screens/card.jsx:514` — standalone `CardScreen` hard-codes Notion $19.
- `screens/add.jsx:386` — `const count = 42` magic number.
- `screens/books.jsx:36` — `daysLeft` rounding quirk.
- `screens/books.jsx:1054` — constants declared inside component body.
- `styles/components.css:404-411` — duplicate `.sheet-handle`.
- `styles/components.css:518-520` — empty `.thread-bubble` rule.
- `styles/components.css:728-736` — fade-in animation OK, hoisted.
- `styles/tokens.css:135, 138-141` — 44px tap-target default noisy but correct.
- `tests/validator.test.js:59` — correct use of `✅` as negative test.

### Positive
- Intent map exhaustive.
- Retry loop correct.
- Zero `BASE_URL` regressions.
- Zero banned British spellings.
- Zero banned emoji in runtime code.
- Currency formatting consistent.

</details>

---

---

# v2 Re-audit — Post-SCAF Pass (25 April 2026)

**Audited:** 25 April 2026 (after SCAF-1 through SCAF-7 all merged to origin/main)
**Surface:** same as v1 — `screens/*.jsx` (7 screens), `components/*.jsx` (7 components), `App.jsx`, `worker-client.js`, `constants/`, `util/`, `guardrails/`, `tests/`.
**Ground truth:** `BookKeeping/demo/CLAUDE.md`, `BookKeeping/demo/DESIGN.md`.
**Goal:** Verify SCAF improvements, document remaining issues, confirm success criteria.

---

## v2 Counts

| Severity | [CURRENT] | [FUTURE] | [BOTH] | Total |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | **0** |
| High | 0 | 0 | 0 | **0** |
| Medium | 3 | 2 | 0 | **5** |
| Low | 2 | 2 | 0 | **4** |

**Success criteria result:**
- Category A [CURRENT] ≤2: ✅ 0 Critical, 0 High remain.
- Zero Category A [FUTURE]: ✅ 0 Critical/High [FUTURE] items.

---

## SCAF Resolution Summary

Every original Category A item from v1 is now resolved or acceptably mitigated:

| ID | Original finding | SCAF fix | Status |
|---|---|---|---|
| A.1 | Two sheet/overlay patterns | SCAF-1: `Sheet.jsx` + `FullScreenOverlay.jsx` | ✅ Resolved |
| A.2 | Color-zone violations (amber fill) | SCAF-5: amber-fill → paper+border, error → text-only | ✅ Resolved |
| A.3 | Card variants as magic strings | SCAF-2: `constants/variants.js` + `CARD_VARIANTS` enum | ✅ Resolved |
| A.4 | Penny copy scattered across files | SCAF-3: `constants/copy.js` registry; 13 screens refactored | ✅ Resolved |
| A.5 | Token discipline violations | SCAF-4: 5 real fixes + ~19 documented exemptions + pre-commit hook | ✅ Resolved (1 rgba bypass remains — see M1) |
| A.6 | Two near-identical waveform components | SCAF-6: `components/VoiceWaveform.jsx` | ✅ Resolved |
| A.7 | Duplicate/dead CSS | SCAF-7: duplicate `.sheet-handle` removed, empty `.thread-bubble` removed, redundant `@keyframes spin` in `books.jsx` removed | ✅ Mostly resolved (1 inline keyframe in `add.jsx` — see L2) |
| A.8 | Dead constants in `onboarding.jsx` | SCAF-7: `STEP_CONTEXT_KEY` removed | ⚠️ Partial — `STEP_INTENT` values now dead documentation (see M4) |
| A.9 | TabBar ARIA misuse (`role="tab"` / `role="tablist"`) | SCAF-7: removed; `<nav>` semantics only | ✅ Resolved |

Runtime bugs fixed by SCAF:
- B.6 (`cpaSheeet` typo) ✅ Fixed
- B.7 (income fallback missing CTAs) ✅ Resolved — `card.jsx` now falls back to `CARD_FALLBACK_COPY.defaultPrimaryCta` / `defaultSecondaryCta`
- B.5 (invoice number regenerates on mount) ✅ Resolved — `state.invoiceDraft` check added
- C.1 (thread intro strings hard-coded in JSX) ✅ Resolved — `thread.jsx` now routes through `constants/copy.js`

---

## v2 Findings

### M1 — Raw `rgba()` color escaped the SCAF-4 token sweep [CURRENT]

**Severity:** Medium · `screens/books.jsx:1178`
**What is wrong:** `color: netVsLast != null ? "rgba(26,158,106,0.9)" : "rgba(255,255,255,0.45)"`. The first value is a hand-computed derivation of `--income` (`#1A9E6A` = `rgb(26,158,106)`). `scripts/check-tokens.sh` only catches raw hex strings (starting with `#`) — it does not match `rgba()` literals. This bypassed SCAF-4 undetected.
**Why it matters:** `--income` is a design-system token. If the income color is ever updated, this hardcoded value silently diverges. `rgba(255,255,255,0.45)` is acceptable as a deliberate opacity variant (no named token for partial-white-on-dark).
**Fix:** `color: netVsLast != null ? "rgba(var(--income-rgb), 0.9)" : "rgba(255,255,255,0.45)"` — requires adding `--income-rgb: 26,158,106` to `tokens.css`. Alternatively, use `var(--income)` at full opacity and set `opacity` via wrapper.
**AI-scalability impact:** An agent building a new stat card will look at books.jsx for the income color pattern and learn to hardcode `rgba(26,158,106,...)`. Correcting this in the source example eliminates the anti-pattern from future training.

---

### M2 — `netSubcopy` always shows upward arrow regardless of sign [CURRENT]

**Severity:** Medium · `screens/books.jsx:1124`
**What is wrong:** `const netSubcopy = netVsLast != null ? \`▲ ${fmt(netVsLast)} vs last month\` : ...`. The `▲` character is hardcoded. If `netVsLast` is negative (a net below last month), the stat card still shows ▲ — misleading the user about direction.
**Why it matters:** Trust-critical product. Wrong directional signal on the P&L card directly undermines the claim that Penny's numbers are reliable.
**Fix:** One line: `const arrow = netVsLast >= 0 ? "▲" : "▼"; const netSubcopy = netVsLast != null ? \`${arrow} ${fmt(Math.abs(netVsLast))} vs last month\` : ...`.
**AI-scalability impact:** Low. One-line fix. Not a pattern agents would clone.

---

### M3 — `avatar-menu.jsx` box shadow uses `rgba(0,0,0,...)` instead of `rgba(10,10,10,...)` [CURRENT]

**Severity:** Medium · `screens/avatar-menu.jsx:119`
**What is wrong:** `boxShadow: "0 1px 3px rgba(0,0,0,0.18)"`. The `--ink` token is `#0a0a0a` (rgb 10,10,10). All shadow constructions should derive from this base. `rgba(0,0,0,...)` is slightly purer black and creates a subtle but inconsistent shadow tone. This was called out in v1 raw findings but not caught by check-tokens.sh (rgba check not implemented).
**Fix:** `boxShadow: "0 1px 3px rgba(10,10,10,0.18)"`.
**AI-scalability impact:** Medium. Agents building new overlays will scan `avatar-menu.jsx` for shadow examples and learn the wrong base color.

---

### M4 — `STEP_INTENT` in `onboarding.jsx` is dead documentation [FUTURE]

**Severity:** Medium · `screens/onboarding.jsx:21-29`
**What is wrong:** `STEP_INTENT` maps step names to Penny intent strings (`"onboarding.ready"`, `"onboarding.entity"`, etc.). These intent strings were meaningful when onboarding made live AI calls per step. SCAF-3 replaced all onboarding copy with static `ONBOARDING_COPY` from the registry. Now only the map's *keys* matter (as a presence-check gate: `if (!STEP_INTENT[step]) return;`), not the values. The intent strings are read by no caller.
**Why it matters:** A fresh agent sees `STEP_INTENT` with intent values and concludes onboarding makes per-step AI calls matching `INTENT_MAP` in `worker-client.js`. It searches `INTENT_MAP` for `"onboarding.ready"`, doesn't find it, and either (a) adds it incorrectly or (b) breaks trying to re-wire the flow.
**Fix:** Replace `STEP_INTENT` with a simple Set: `const STEPS_WITH_PENNY = new Set(["welcome","entity","entity-diag","industry","payments","expenses","checkin","bank"]);` and update the guard: `if (!STEPS_WITH_PENNY.has(step)) return;`.
**AI-scalability impact:** High. Misleading documentation of the AI call boundary is the most common source of regressions in AI-built features.

---

### M5 — LLC dual-path entity types defined but not demonstrated in demo data [FUTURE/BOTH]

**Severity:** Medium · `constants/variants.js`, `public/config/personas.json`, `public/config/scenarios.json`
**What is wrong:** `ENTITY_TYPES` exports `LLC_SINGLE = "llc-single"` and `LLC_MULTI = "llc-multi"` as distinct members. The audit brief, `CLAUDE.md`, and `implementation/irs-routing.md` all require coverage of all 4 entity paths (sole-prop, S-Corp, llc-single, llc-multi). But:
- `personas.json` uses only `"llc"` (undifferentiated) — no `llc-single` or `llc-multi` persona exists.
- `scenarios.json` keys are `"llc.trades"`, `"llc.retail"`, `"llc.food-beverage"`, `"llc.other"` — all use the generic "llc" entity prefix.
- No scenario demonstrates Form 1065 (LLC multi-member) IRS routing in the demo thread.
- The onboarding entity diagnostic does not ask the single vs. multi-member question for LLC path.
**Why it matters:** [BOTH] For current demo: anyone selecting LLC sees "llc" entity data, which is acceptable for the demo but is factually ambiguous about which IRS form applies. For future AI builds: an agent adding LLC-multi content will use `ENTITY_TYPES.LLC_MULTI = "llc-multi"` but find no scenario key like `"llc-multi.trades"` — the fetch falls back to `"sole-prop.consulting"` silently.
**Fix (phased):**
1. Near-term: document in `screen-briefs/01-onboarding.md` and `CLAUDE.md` that "llc" in demo data represents the LLC undifferentiated path (single-member / Sch C default), and `llc-multi` is explicitly out of scope for v1 demo.
2. Before CPA view goes live: add at least two `llc-multi` personas (multi-member LLC) with 1065 routing to demonstrate the full entity matrix.
**AI-scalability impact:** High. A future agent building Form 1065 view content searches for `llc-multi` examples and finds none. Every new LLC feature built without this data will silently default to sole-prop behavior.

---

### L1 — Unused `useRef` import in `App.jsx` [CURRENT]

**Severity:** Low · `App.jsx:13`
**What is wrong:** `import React, { useEffect, useRef, useState, useCallback, useMemo } from "react"` — `useRef` is imported but not used anywhere in `App.jsx`.
**Fix:** Remove `useRef` from the import destructure.
**AI-scalability impact:** Low. Agents extending App.jsx may import `useRef` thinking it's needed, or assume there's a ref somewhere.

---

### L2 — Inline `@keyframes slideUp` in `add.jsx` JSX `<style>` block [CURRENT]

**Severity:** Low · `screens/add.jsx:956-958`
**What is wrong:**
```jsx
<style>{`
  @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`}</style>
```
This inline style block was missed by SCAF-7. The animation is referenced at line 932: `animation:"slideUp 180ms var(--ease-out) both"`. SCAF-7 was supposed to remove all inline keyframe definitions and consolidate into `styles/components.css`.
**Fix:** Move `@keyframes slideUp` to `styles/components.css` alongside the other keyframes. Remove the `<style>` block from `add.jsx`.
**AI-scalability impact:** Medium. An agent adding a new animation to any screen will look for existing keyframe patterns. Finding one inline and the rest in `components.css` will produce inconsistent results: next feature may also use inline `<style>`.

---

### L3 — `ENTITY_TYPES.PARTNERSHIP` resolves but no scenario exists for it [CURRENT]

**Severity:** Low · `screens/onboarding.jsx:246`, `public/config/scenarios.json`
**What is wrong:** The entity diagnostic at `onboarding.jsx:246` can resolve to `ENTITY_TYPES.PARTNERSHIP = "partnership"` when a user answers `q1=personal-return, q2=me-and-others`. `scenarioKey({ entity: "partnership", industry: "consulting" })` → `"partnership.consulting"`. `scenarios.json` has no such key. `App.jsx` falls back silently to `"sole-prop.consulting"`. The user sees Sarah Chen's data as a diagnosed "Partnership" owner.
**Why it matters:** Silent wrong-persona fallback. The user's onboarding resolves to Partnership but all demo cards are for a sole-prop consultant. Penny's intro copy will feel disconnected.
**Fix near-term:** Display a "Partnership isn't fully supported yet — we'll use your closest match for now" message in the diagnostic resolution. Flag `is_partnership_flag: true` in persona state so downstream screens can adapt copy.
**AI-scalability impact:** Low. Agents extending partnership support would need to add scenario data anyway.

---

### L4 — Two validator tests permanently failing: empty-string handling undefined [CURRENT]

**Severity:** Low · `tests/validator.test.js:29-42`
**What is wrong:** Two tests have been failing since v1:
1. `"rejects missing headline"` — expects `ok: false` for `headline: ""`, but `validateField("", "headline", 120)` returns `ok: true` (empty string passes all current checks).
2. `"rejects missing why"` — expects `ok: false` for `why: ""`, but `if (response.why)` evaluates to `false` for empty string, skipping validation entirely.
These failures are acknowledged in CLAUDE.md: "the 2 validator failures are pre-existing and untouched by this commit."
**Why it matters:** The validator is the voice gate. A Penny response with an empty `headline` or empty `why` passes validation and reaches the user. This is a trust-critical path.
**Fix:** Add a minimum non-empty check to `validateField`: `if (!text.trim()) return { ok: false, reason: \`Field "${label}" must not be empty.\` };`. Update both tests to reflect the intended contract.
**AI-scalability impact:** Medium. An agent building a new intent and testing it will see 2 pre-existing failures in the test suite and may assume the validator intentionally allows empty strings — or may decide not to test the validator at all.

---

## v2 Positive Observations

1. **All 20 scenarios present and correct.** `scenarios.json` includes S-Corp `owners-draw` variants in every S-Corp scenario's cardQueue (7 occurrences verified). Entity-appropriate variant routing works as designed.
2. **Token enforcement is now automated.** `scripts/check-tokens.sh` runs on staged files at commit and on the full tree at build. The 4 documented violation classes are blocked before merge.
3. **`constants/copy.js` is clean and comprehensive.** All 6 frozen groups contain the correct copy. `tests/copy.test.js` covers all interpolation functions.
4. **`constants/variants.js` is exhaustive.** All enum values used in screens are imported from the registry. `tests/variants.test.js` confirms every industry key and entity prefix from config JSON is present in the enums.
5. **Sheet + FullScreenOverlay canonical pattern holds.** Zero `createPortal` calls remain in screen files; all are in the two component files. `#sheet-root` portal target defined in `App.jsx`; `#sheet-root-cpa` in `cpa/index.html`.
6. **Post-SCAF color zones are clean.** No amber-as-background, no error-as-background. `check-tokens.sh` does not catch rgba() but the fix for M1 above closes the gap.
7. **TabBar ARIA is clean.** `<nav aria-label="Primary navigation">` with `aria-current="page"` on active tab — correct pattern.
8. **`CARD_FALLBACK_COPY.defaultPrimaryCta` defense pattern.** Card.jsx correctly falls back to `defaultPrimaryCta`/`defaultSecondaryCta` when the AI response or fallback function omits CTA fields. This protects against any future fallback function that forgets to include CTAs.
