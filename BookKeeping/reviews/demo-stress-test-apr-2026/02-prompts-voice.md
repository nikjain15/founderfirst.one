# 02 — Prompts + Voice System: Forensic Audit

**Audited:** 25 April 2026 (post-SCAF, post-audit-1)
**Surface:** `BookKeeping/demo/public/prompts/*.md` (8 files), `BookKeeping/demo/worker-client.js`, `BookKeeping/demo/guardrails/{voice-validator,banned-phrases,retry-on-fail}.js`, `BookKeeping/demo/tests/validator.test.js`. Cross-referenced with `screens/{thread,card,books,add}.jsx` fallback paths and `constants/copy.js` (ERROR_COPY, *_FALLBACK_COPY).
**Ground truth:** `BookKeeping/demo/CLAUDE.md`, `BookKeeping/demo/DESIGN.md`.
**Scope:** stays inside `BookKeeping/demo/` per audit rules.

---

## How to read this file

Same convention as `01-founder-code.md`. Every finding is tagged:

- **[CURRENT]** — broken or risky in the demo as it ships today
- **[FUTURE]** — will corrupt or mislead a future AI session adding new intents
- **[BOTH]** — both

Severity: Critical / High / Medium / Low. Each finding states the AI-scalability impact.

---

## Counts

| Severity | [CURRENT] | [FUTURE] | [BOTH] | Total |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | **0** |
| High     | 1 | 3 | 2 | **6** |
| Medium   | 2 | 4 | 1 | **7** |
| Low      | 2 | 2 | 0 | **4** |
| **Total** | **5** | **9** | **3** | **17** |

Plus a "Positive observations" section to preserve patterns worth keeping.

---

## High

### H.1 — Entity-type voice coverage is incomplete: LLC dual-path, partnership, and S-Corp mid-year election are unhandled [BOTH]

**Severity:** High · **Files:** `public/prompts/penny-system.md`, `public/prompts/card-approval.md`, `public/prompts/onboarding.md`, `public/prompts/books-qa.md`, `public/prompts/thread-qa.md`.
**What is wrong:** None of the prompts give the model branching guidance for the four entity paths the product has settled on:
- `card-approval.md` enumerates an `owners-draw` variant gated to "S-Corp / LLC-taxed-as-S-Corp only" but provides no example or guidance for **single-member LLC** (Sch C path) vs **multi-member LLC** (Form 1065 path). The CLAUDE.md "LLC dual-path rule" requires Penny to ask at onboarding whether the LLC is single- or multi-member; no prompt encodes this.
- No prompt addresses **partnership** (`ENTITY_TYPES.PARTNERSHIP`) framing despite it being a real enum member resolvable from the onboarding diagnostic.
- No prompt addresses **S-Corp mid-year election** narration, which CLAUDE.md / spec D72 requires.
- `penny-system.md` opens with "US sole proprietors and small business owners" — generic enough that the model defaults to sole-prop framing on every non-S-Corp entity unless the overlay forces otherwise.

The validator does not check entity-appropriate language; the prompt does not constrain it; the personas/scenarios JSON does not exercise these paths (cross-ref audit-1 v2 finding M5). Net effect: today, an LLC user gets sole-prop voice silently, and there is no prompt-side gate that catches it.
**Why it matters:** Penny is a tax-trust product. Wrong entity framing on an income or owner's-draw card directly contradicts the trust thesis. A user whose business is a partnership cannot be told "your Schedule C…" — that is a hallucination of the worst kind.
**Proposed fix:** Add an "Entity routing" section to `penny-system.md` mapping `context.entity` → permitted form labels and language. Add an LLC-multi example to `card-approval.md` showing partnership framing. Add a single line to `card-approval.md`'s `owners-draw` row clarifying it covers S-Corp **and** LLC-taxed-as-S-Corp **and** partnership-distributed-as-draw. Backfill validator: when `context.entity === "partnership"`, reject responses containing "Schedule C".
**AI-scalability impact:** **High.** Every future feature touching tax framing (CPA suggestions, P&L narration, 1099 explanation, election copy) inherits this gap. An agent extending owner's-draw to partnership distributions has no example to copy and will silently default to S-Corp phrasing.
**Tag:** [BOTH] — present demos can mis-frame LLC users; future builds compound the drift.

---

### H.2 — Validator + prompt rules drift: penny-system.md publishes a contract the validator does not enforce [BOTH]

**Severity:** High · **Files:** `public/prompts/penny-system.md`, `guardrails/voice-validator.js`, `guardrails/banned-phrases.js`.
**What is wrong:** The "Output format" table in `penny-system.md` declares per-field rules the validator partially or fully ignores:
- `ctaPrimary` / `ctaSecondary` are spec'd as "max 20 chars" — validator does not enforce a CTA max length.
- `tone` enum is `fyi | action | celebration | flag` — validator does not validate `tone` at all (a hallucinated `tone: "warning"` rides through).
- `greeting` is spec'd as "max 60 chars, one short sentence" — validator enforces 60-char max but not single-sentence.
- `headline` "max 2 sentences" — validator enforces this.
- "Never include `null` values" — validator does not check for `null` field values.
- The `cpa-chat.md` overlay tightens `headline` to ≤ 80 chars (≤ 40 for numeric answers) — validator uses the global 120 cap regardless of `viewer_role`.

Banned-phrases drift: `banned-phrases.js` deny-list duplicates the allow-list in `voice-validator.js` for emoji (already flagged in audit-1 §C.3) and the deny-list misses `🙏 💯 👌` and several flag/warning glyphs that the allow-list approach would catch by exclusion.
**Why it matters:** The prompt is a contract Penny "signs" with the model. The validator is the gate the contract is enforced through. When they disagree, the model can ship output that the prompt forbade — and the demo will display it. CLAUDE.md / `banned-phrases.js` itself flags this risk: *"If a rule exists only in one place, it's a bug."*
**Proposed fix:**
1. Add validator branches: `tone` enum check, CTA `max 20 char` check, optional `null`-value rejection.
2. Make `headline` cap context-sensitive: 80 when `meta.context?.viewer_role === "cpa"`, 120 otherwise.
3. Retire emoji deny-list in `banned-phrases.js`; let `APPROVED_EMOJI` be the single gate.
4. Add a doc-comment line in each prompt file pointing at the validator function that enforces it.
**AI-scalability impact:** **Critical for AI-built features.** Future agents reading `penny-system.md` will trust the contract. They will write screen code assuming `tone` is one of four values, that CTAs are short, that `null` is impossible. When the validator silently allows drift, those assumptions corrupt downstream UI logic.
**Tag:** [BOTH].

---

### H.3 — `capture.parse` validator skips the natural-uncertainty case the prompt explicitly allows [CURRENT]

**Severity:** High · **Files:** `guardrails/voice-validator.js:88-103`, `public/prompts/capture-parse.md:42-46, 90-105`.
**What is wrong:** `capture-parse.md` says: *"If no amount is given, `amount` is `null` and `headline` asks for it"* and provides a fully-worked example where `parsed.amount = null`, `parsed.category_guess = null`. But `validateCaptureParse()` in the validator hard-rejects: `amount must be a number`, `vendor must be a non-empty string`. So the very output the prompt prescribes for "coffee" → fails validation, retries 2× with the same instruction, then crashes the screen.
**Why it matters:** [CURRENT] — anyone testing the Add tab "Just tell me" with an under-specified entry will hit a 3-attempt retry loop ending in error. The catch in `add.jsx:748` swallows it and shows `parseFailed` toast — masking a real prompt/validator contract bug.
**Proposed fix:** Allow `parsed.amount === null` when the headline explicitly asks for it (regex check on headline OR a `parsed.needsAmount: true` flag the prompt writes). Same for `category_guess`. Update tests.
**AI-scalability impact:** **Medium-high.** An agent extending `capture.parse` (e.g. adding a "needs date" branch) will read the prompt, write the matching null-tolerant response, and find it crashes. They'll either narrow the prompt (losing the graceful-uncertainty pattern) or weaken the validator (losing the gate). Both are wrong; the right fix is structured optionality.
**Tag:** [CURRENT].

---

### H.4 — `cpa-chat.md` activation rule lives in code, not in the prompt — agents cannot derive it from the prompt alone [FUTURE]

**Severity:** High · **Files:** `public/prompts/cpa-chat.md:160-181`, `worker-client.js:105-107`.
**What is wrong:** The overlay activates via `needsCpaOverlay()` in `worker-client.js`:
```js
return context.viewer_role === "cpa" || context.card?.variant === "cpa-suggestion";
```
The prompt itself only documents the first half: *"If `viewer_role` is `cpa`, this overlay is active. If it is `founder` or missing, fall back to the default founder voice."* The prompt does not say it also activates on `card.variant === "cpa-suggestion"` even though `card.variant === "cpa-suggestion"` calls happen with `viewer_role: "founder"` (Penny is speaking to the founder about the CPA's suggestion). The whole `cpa-suggestion variant` section in `cpa-chat.md` (lines 71-89) only makes sense if the activation is correctly understood.

A fresh agent reading just the prompts (not `worker-client.js`) cannot derive the dual activation. They will look for a `viewer_role: "cpa"` flag that isn't there and conclude the overlay isn't active — leading them to either (a) duplicate the cpa-suggestion variant copy into `card-approval.md`, or (b) wire `viewer_role: "cpa"` into a card.approval call where it shouldn't be.
**Why it matters:** This is the canonical example of "rule lives in two systems and the prompt is the authoritative reading surface." CLAUDE.md `Prompt files — what each one controls` table actually documents the dual activation, but the prompt itself doesn't.
**Proposed fix:** Add a 4-line "Activation" section at the top of `cpa-chat.md`:
```markdown
## Activation
This overlay is appended whenever EITHER condition is true:
1. `context.viewer_role === "cpa"` — Penny is speaking to a CPA (Books/P&L/Cash Flow/Chat tabs).
2. `context.card?.variant === "cpa-suggestion"` — Penny is speaking to the FOUNDER about a CPA's suggestion (cpa-suggestion approval card on the founder app).
```
**AI-scalability impact:** **High.** Every CPA-side feature touches this overlay. The CPA spec calls for 6 tabs and 4 approval types — many will involve new contexts. Without an in-prompt activation rule, every new context is a coin flip.
**Tag:** [FUTURE].

---

### H.5 — Test coverage gaps: 5 of 7 live intents have zero tests [BOTH]

**Severity:** High · **File:** `tests/validator.test.js`.
**What is wrong:** The validator gate covers all 7 intents. Tests cover only `card.approval`. Specifically untested:
- `thread.greeting` / `thread.idle` — `greeting` field 60-char rule, single-sentence rule.
- `thread.qa` — no shape test, no fallback test.
- `books.qa` — no shape test (and CPA-overlay tightening of headline to 80/40 chars is also untested).
- `capture.parse` — no test for `parsed` shape, no test for `parsed.amount === null` (see H.3), no test for ISO-date format.
- `card.approval` `owners-draw` / `cpa-suggestion` / `low-confidence` / `income-celebration` / `rule-proposal` / `variable-recurring` variants — only the generic happy path tested.
- `tone` enum membership — untested.
- Headline `maxChars: 120` — untested.
- Why `maxChars: 160` — untested.
- Sentence-count rule (`maxSentencesPerField: 2`) — untested.
- Approved emoji round-trip for `👋` and `💪` — untested (only `🎉` covered).
- Multi-emoji rejection — untested.
- Banned-phrase coverage — only 2 of 11 patterns tested ("you have N items to review", British "organised"/"colour"). Untested: streak language, "you're behind on", "as an AI", "I'm unable to", "transaction logged successfully", "please be advised", "I apologize for any confusion", "I may have been slightly off", "roughly $X", "I estimate".
- INTENT_MAP unknown-intent throw behavior — untested.
- `extractJSON` — untested (parses fenced/unfenced/escaped strings; brittle in production).
- `retryWithFeedback` — untested.

Two existing tests fail by design (already documented in 01-founder-code v2 L4): empty-string headline + empty-string why both pass validation today.
**Why it matters:** The validator is the single voice gate. Thin coverage means regressions ride through. A future agent rewriting the validator (e.g. to add `tone` enum) cannot lean on the test suite to catch a behavior change.
**Proposed fix:** Test bodies grouped by intent, one fixture file per intent under `tests/fixtures/<intent>.{good,bad}.json`. Drive test cases from the fixtures so adding a new variant is "drop a fixture, list it in the loop." Target ≥ 80% branch coverage in `voice-validator.js` and 100% in `banned-phrases.js`.
**AI-scalability impact:** **High.** Tests are the contract that protects future AI work. Coverage this thin means every new intent ships with no regression net.
**Tag:** [BOTH].

---

### H.6 — `thread-qa.md` whitelists emoji `💪` and `✓` in a way that drifts from the system prompt [FUTURE]

**Severity:** High · **File:** `public/prompts/thread-qa.md:37`.
**What is wrong:** thread-qa.md says: *"No emoji except ✓ or 💪 where genuinely appropriate."* But `penny-system.md` allows four marks: `🎉 👋 💪 ✓`. So `thread-qa` silently disallows `🎉` (payment celebrations) and `👋` (hellos) for thread-qa intent — yet the validator (which is intent-agnostic) accepts them. A model following the overlay strictly will be more conservative than the validator gate, but a model that pattern-matches the system prompt will emit `🎉` and pass validation, contradicting the overlay.
**Why it matters:** Three sources of truth (system prompt, overlay prompt, validator) disagree. Result is non-deterministic emoji policy by intent.
**Proposed fix:** Either (a) drop the emoji line from thread-qa (it inherits from the system prompt), or (b) make it explicit: *"Inherits the four-emoji set. In Q&A context, prefer `✓` and `💪` over `🎉` / `👋` — but they are not banned."*
**AI-scalability impact:** **High.** Per-intent overlay drift is exactly the failure mode CLAUDE.md `banned-phrases.js` warns against. Six other overlays exist; each can drift the same way.
**Tag:** [FUTURE].

---

## Medium

### M.1 — `card-approval.md` table lists 7 variants; `CARD_VARIANTS` enum has 9 — `cpa-suggestion` and `income-celebration` are under-specified [BOTH]

**Severity:** Medium · **Files:** `public/prompts/card-approval.md:30-43`, `constants/variants.js`, `public/prompts/cpa-chat.md:71-89`.
**What is wrong:** The variant table in `card-approval.md` covers `base-expense`, `low-confidence`, `income`, `income-celebration`, `variable-recurring`, `rule-proposal`, `owners-draw`. It does NOT include `cpa-suggestion` (handled in the cpa-chat overlay, but only when that overlay activates — see H.4) and `expense` (the legacy alias). `CARD_VARIANTS` (constants/variants.js) lists all 9. Result: model sees 7 variants in the prompt, screens reference 9. If a `card.approval` call arrives with `card.variant: "expense"`, the prompt has no row to drive it.
**Why it matters:** Either the enum is wrong or the prompt is wrong. Today screens default to "Confirm/Change" CTAs via the `defaultPrimaryCta` defense (audit-1 v2), so the user-visible behavior is OK — but the prompt-side mapping is incomplete.
**Proposed fix:** Either fold `expense` → `base-expense` in the enum (deprecate the alias), or add an explicit row in `card-approval.md`. Add `cpa-suggestion` to the table with a one-line "see cpa-chat.md overlay" note so the variant set is visible in one place.
**AI-scalability impact:** **Medium.** Adds friction for any agent enumerating variants from the prompt.
**Tag:** [BOTH].

---

### M.2 — `worker-client.js` extractJSON tolerates malformed model output silently — no regression test [FUTURE]

**Severity:** Medium · **File:** `worker-client.js:194-215`.
**What is wrong:** `extractJSON` walks character-by-character to find a balanced top-level JSON object. It handles fenced ```json blocks, unfenced JSON, and escape characters inside strings. It silently strips anything before the first `{` or after the matching `}` (commentary, code fences, model preamble). This is good defensive parsing — but no test exercises it. Edge cases that will break:
- Multiple JSON objects in the response (model returns an example then the answer): returns the first, which is the wrong one.
- Brace inside a string before the outer `{`: not handled.
- Single-quoted JSON-like blocks: not parsed.

The retry loop instructs the model "Return ONLY a single valid JSON object — no commentary, no code fences, no // or /* */ comments, no example labels, no duplicate objects" — explicitly defending against the multi-object case. But that's a prompt-side defense; the parser still grabs the first.
**Why it matters:** When the model double-emits (an example + a real response), the screen renders the example. Penny says the example sentence to the user.
**Proposed fix:** Prefer the LAST balanced top-level object, not the first. Add `tests/extract-json.test.js` with: fenced/unfenced/multi-object/escape/no-JSON cases.
**AI-scalability impact:** **Medium.** Future agents tuning prompts will be unaware that example duplication leaks through.
**Tag:** [FUTURE].

---

### M.3 — Cache key includes `intent` but not `model`; `books.qa` switches model based on intent and cache could collide [CURRENT]

**Severity:** Medium · **File:** `worker-client.js:138-149`.
**What is wrong:** `hashKey({ intent, context })` excludes `model` from the cache key. A hypothetical agent overriding `model` (the public API exposes `model` as a parameter on `renderPenny`) would get a stale cached response from a different model. Today the only differential is `booksModel` for `intent: "books.qa"` (handled inside callClaude after cache lookup), so cache+model is consistent — but the API surface invites the bug.
**Why it matters:** The defect is latent today but trips the moment anyone passes `model: "haiku"` for an A/B test.
**Proposed fix:** Include `model || resolveDefaultModel(intent)` in the hash inputs.
**AI-scalability impact:** **Low-medium.** Affects experimentation infrastructure, not user-visible flow today.
**Tag:** [CURRENT] — present API surface trips on first override.

---

### M.4 — Retry-on-fail counts non-validation errors against the same retry budget [CURRENT]

**Severity:** Medium · **File:** `guardrails/retry-on-fail.js:19-31`.
**What is wrong:** A non-`ValidationError` (network blip, JSON parse failure, worker 500) increments the same `attempt` counter. Today: parse error on attempt 0 → loops once → throws on attempt 1 (the `if (attempt >= 1) throw err` branch). But validation+parse errors interleave incorrectly: a validation fail on attempt 0, parse fail on attempt 1, would throw despite the model deserving a third chance.
**Why it matters:** Mostly fine in practice — the worker is reliable in the demo. But the comment claims *"deliberately does NOT bypass validation on the last attempt"* and the implementation conflates two failure modes that have different retry semantics.
**Proposed fix:** Track validation and non-validation attempts separately, with stricter limits on parse/network (1 retry) and validation (2 retries with feedback).
**AI-scalability impact:** **Low.** One file, isolated.
**Tag:** [CURRENT].

---

### M.5 — `onboarding.md` is deprecated in CLAUDE.md but still referenced in INTENT_MAP for 7 intents [BOTH]

**Severity:** Medium · **Files:** `public/prompts/onboarding.md`, `worker-client.js:43-49`, `screens/onboarding.jsx`.
**What is wrong:** Settled decision #2 made onboarding fully static. `screens/onboarding.jsx` calls no `ai.renderPenny` for any onboarding step. Yet `INTENT_MAP` lists 7 onboarding intents (`onboarding.entity`, `…industry`, `…payments`, `…expenses`, `…checkin`, `…bank`, `…ready`) and `onboarding.md` still ships. If a future agent sees the INTENT_MAP entries and re-wires AI onboarding, it will work — but reverses a settled decision silently. Audit-1 v2 M4 documented the related dead `STEP_INTENT` map.
**Why it matters:** The contract surface contradicts the settled product decision. Dead lever invites re-wiring.
**Proposed fix:** Remove the 7 onboarding entries from INTENT_MAP; rename `onboarding.md` → `_archive_onboarding.md` (or delete) and document in CLAUDE.md why. If kept for "reference tone," move it out of `public/prompts/`.
**AI-scalability impact:** **High.** This is the canonical "settled decision lives in prose, lever still wired" trap.
**Tag:** [BOTH].

---

### M.6 — `penny-system.md` "Tax rules" sentence under-specifies the caveat shape that the CPA overlay relies on [FUTURE]

**Severity:** Medium · **Files:** `public/prompts/penny-system.md:136`, `public/prompts/cpa-chat.md:54-57`.
**What is wrong:** Base prompt says: *"Tax rules: always frame as current IRS guidance, always caveat with 'your CPA will confirm.'"* The CPA overlay overrides with: *"close with `confirm with your filing position` or similar"*. The substitution is fine, but neither the prompt nor the validator enforces the closing phrase. `books-qa.md` few-shot example uses *"Your CPA will confirm…"*; `thread-qa.md` says *"end with 'your CPA will confirm.'"* No regex check exists for the caveat.
**Why it matters:** Tax-trust hangs on this caveat. A model that omits it ships a "Penny said you can deduct X" claim with no professional disclaimer. A validator regex would be cheap.
**Proposed fix:** Add an optional intent-specific rule: when `meta.intent` is `books.qa` or `thread.qa` AND the response touches a tax claim (regex on tax keywords), require one of the approved caveats. Soft-warn in dev; hard-block in prod.
**AI-scalability impact:** **Medium-high.** Without an enforced caveat, every tax-touching feature is a liability.
**Tag:** [FUTURE].

---

### M.7 — `books-qa.md` is also used by CPA Chat — but no per-intent CPA examples exist [FUTURE]

**Severity:** Medium · **Files:** `public/prompts/books-qa.md`, `public/prompts/cpa-chat.md`, INTENT_MAP `worker-client.js:56`.
**What is wrong:** CPA Chat uses `intent: "books.qa"` with `viewer_role: "cpa"`, which appends `cpa-chat.md`. So at inference time the model sees: penny-system + books-qa + cpa-chat + context. The few-shot examples in `books-qa.md` are all founder-voice (Sarah, "You brought in $8,200…"). The few-shot examples in `cpa-chat.md` are short numeric. The model is left to interpolate. CLAUDE.md says CPA chat should be terse and lead with the number — `books-qa.md` examples teach the opposite.
**Why it matters:** Conflicting few-shots + intent reuse = unstable voice in CPA chat. Already a known risk; today the demo masks it because CPA chat uses a stub greeting until Phase 7.
**Proposed fix:** Either add a `cpa-books-qa.md` overlay so CPA chat has its own few-shots, or add a "When `viewer_role: cpa`, prefer the cpa-chat.md examples; ignore the founder-voice examples below" line at the top of `books-qa.md`.
**AI-scalability impact:** **High once CPA Chat ships** (Phase 7 in the CPA build order). Fix before the screen lands.
**Tag:** [FUTURE].

---

## Low

### L.1 — INTENT_MAP shares one prompt across `thread.greeting` + `thread.idle` but they have different output shapes [FUTURE]

**Severity:** Low · **Files:** `worker-client.js:36-38`, `public/prompts/thread.md`.
**What is wrong:** `thread.md` says greeting needs `headline + why + tone`, queue-empty needs `headline + tone` (no why). Validator accepts either. But future agents adding a new mode (`returning-welcome` partial gate?) cannot tell from the prompt which fields are mandatory per mode.
**Proposed fix:** Document required fields per mode in the Modes table.
**Tag:** [FUTURE].

---

### L.2 — No `extractJSON` test, no INTENT_MAP test, no `needsCpaOverlay` test [FUTURE]

**Severity:** Low · **File:** `tests/`.
**What is wrong:** Three pure functions with branchy logic, zero unit tests. Already part of H.5 but called out separately because these are easy wins.
**Proposed fix:** One file each; ~10 lines per test.
**Tag:** [FUTURE].

---

### L.3 — `cpa-chat.md` says "✓ (text character) is fine" but the validator allow-list comment says the same — duplicated invariant [CURRENT]

**Severity:** Low · **Files:** `public/prompts/cpa-chat.md:46`, `guardrails/voice-validator.js:21-24`.
**What is wrong:** Two places assert the same fact. The invariant is true, but duplication invites drift.
**Proposed fix:** Centralize: prompt cites the validator file.
**Tag:** [CURRENT].

---

### L.4 — `capture-parse.md` few-shot uses `"Client meals"` as a category guess but `screens/card.jsx` DEFAULT_CATEGORIES uses `"Business meals (50%)"` post-IRS-taxonomy v1.2 [CURRENT]

**Severity:** Low · **Files:** `public/prompts/capture-parse.md:65`, `screens/card.jsx` DEFAULT_CATEGORIES, root CLAUDE.md "IRS taxonomy v1.2".
**What is wrong:** The 24 Apr taxonomy sync renamed every meal label to include `(50%)`. The capture-parse few-shot was missed: `"category_guess": "Client meals"` should be `"Client meals (50%)"`. The model will generate the older label, the screen will fail to color-match the category pill against the canonical taxonomy.
**Proposed fix:** Update the few-shot to canonical label.
**Tag:** [CURRENT].

---

## Positive observations (preserve)

1. **INTENT_MAP discipline.** Explicit, exhaustive, throws loudly on unknown intent. Cited in audit-1 v1 #1 and still clean.
2. **CPA overlay is a layered append, not a fork.** Same JSON contract, same validator. Settled decision #13 holds. The `needsCpaOverlay()` helper is two lines and easy to reason about.
3. **Retry-with-feedback** correctly never bypasses validation on the last attempt; the feedback string is embedded in the user message so the model knows what to fix.
4. **Fallback completeness across screens is solid.** Every AI call site has a `.catch()` branch routed through `constants/copy.js`: `THREAD_INTRO_COPY.greetingFallback`, `THREAD_INTRO_COPY.idleFallback`, `ERROR_COPY.threadQaError`, `ERROR_COPY.booksQaError`, `CARD_FALLBACK_COPY.*`, capture's `buildCardFromParsed(null, …)`. Every screen degrades gracefully when the worker is unavailable.
5. **Banned-phrase deny-list is well-commented** with a SOURCE-OF-TRUTH note that names the drift risk explicitly. The author already knew the trap; the fix is small.
6. **`X-Demo-Token` documented as safe-to-commit.** No secret leakage in the prompt assembly path.
7. **Anti-hallucination rules in `penny-system.md`** are concrete and enforceable: "every dollar from the context, never invent vendors, never invent client context." Easy to validate when context shape stabilizes.
8. **Prompt files carry a "SCREENS USING THIS FILE" header.** Trivially answers "what breaks if I edit this?" Future agents should preserve this banner on every new overlay.

---

## Buildability check (Q5 — fresh-agent walkthrough)

Could a fresh agent add a new intent + prompt file correctly using only the existing files as a guide? Walk-through verdict:

| Step | Discoverability | Risk |
|---|---|---|
| 1. Add to INTENT_MAP | Clear from `worker-client.js` JSDoc. | Low — enum lives in one place. |
| 2. Choose overlay file name | Inconsistent: `thread.greeting → thread`, `thread.qa → thread-qa`. No documented rule. | **Medium** — agent will guess. |
| 3. Write prompt header | Banner format documented by example only; no template file. | Low. |
| 4. Document JSON shape | `penny-system.md` Output format table is the contract. | Low. |
| 5. Add validator branch (if shape-specific) | No checklist; only `card.approval` and `capture.parse` have branches. Agent must read `voice-validator.js` and infer. | **Medium** — easily missed. |
| 6. Register fallback in `constants/copy.js` | No central index of which intents have fallbacks. Agent must grep. | **Medium**. |
| 7. Write tests | One existing fixture pattern (`validApprovalCard`); no per-intent template. | **High** — most agents will skip. |
| 8. Document in CLAUDE.md "Prompt files — what each one controls" | Only discoverable by reading the table. | Low. |

**Bottom-line:** ~60% of the path is guided; 40% is guess. The two highest-friction steps (validator branch + fallback registration) are also the two with the highest cost when skipped. A 30-line `docs/adding-an-intent.md` checklist would close the gap.

---

## Recommendations — priority order for the remediation pass

1. **H.1** — Entity routing in `penny-system.md` + LLC/partnership examples in `card-approval.md`. Unblocks every entity-aware feature.
2. **H.2** — Validator/prompt contract reconciliation. One commit, high leverage.
3. **H.4** — `cpa-chat.md` Activation section. 4 lines, eliminates the most likely future regression.
4. **H.5** — Test coverage push. Drive from per-intent fixture files.
5. **H.3** — `capture.parse` null-tolerance (validator + test).
6. **M.5** — Remove deprecated `onboarding.*` intents from INTENT_MAP.
7. **M.7** — CPA Chat few-shots before Phase 7 ships.
8. **M.6** — Tax-caveat regex.
9. **L.4** — Update capture-parse meals label.
10. The rest — opportunistic.

---

*End of report.*
