# Penny Demo v5 — Pre-Handoff Stress Test

**Target:** `BookKeeping/demo/` — the Claude Code rebuild of the Penny demo.
**Cross-referenced against:** `BookKeeping/CLAUDE.md` (root), `product/19-demo-flow-brief.md`, `product/spec-brainstorm-decisions.md` v2.2, `design/design-system.md` v2.0, `product/17-mobile-screens-and-flows.md`, `product/02-principles-and-voice.md`, `reviews/penny-demo-v3-stress-test-apr-2026.md`.
**Reviewed:** 23 April 2026
**Reviewer lenses:** UX · UI / design system · Product · Technology · Architecture · Public-repo readiness

> **Purpose.** The demo folder is about to be handed to Claude Code to build one screen per session. This review walks the scaffolding with the eyes Claude Code will walk it with — does every brief resolve, does every call actually land, is every file self-consistent with its siblings — and flags anything that will cost a build session when Claude Code hits it cold. This is a pre-handoff sweep, not a post-build review. The folder is also about to be pushed public on GitHub; the second half covers what a stranger reading the repo will see.
>
> **How to read.** Findings grouped by severity. Each has **What's wrong · Why it matters · Proposed fix.** Recommended actions at the end, ordered for minimum-disruption resolution.
>
> **Counts.** 3 Critical · 8 High · 13 Medium · 8 Low. Nothing fatal; all fixable in a focused half-day pass.
> **Headline:** The scaffolding is unusually clean for a pre-handoff state. The three Critical findings will each cost a full build session to discover in-place; each takes 10–30 minutes to fix upfront. Strong recommendation to fix Critical and High before sending any screen to Claude Code.

---

## Executive summary

Three systemic observations surface when the demo folder is read end-to-end.

1. **The intent-name → prompt-file contract is broken in two places.** `worker-client.js` derives the overlay-prompt filename by replacing `.` with `-` in the intent string (so `card.approval` → `card-approval.md`). Three intents comply: `card.approval`, `books.qa`, `capture.parse`. Two do not: `thread.greeting` and `thread.idle` would fetch `thread-greeting.md` / `thread-idle.md` — the actual file is `thread-ambient.md`. And `onboarding.<step>` (per the prompt's own self-description) would fetch `onboarding-welcome.md` etc. — the actual file is `onboarding.md`. Claude Code will hit a 404 the first time it builds thread or onboarding. C1.

2. **The stack is undecided: React or vanilla DOM?** `index.html` loads React + ReactDOM + Babel-standalone from CDNs. `screens/*.js` stubs use `root.innerHTML = \`…\`` (vanilla strings). `screens/card.js` uses `document.createElement`. There is no `type="text/babel"` script, no JSX transform on ES-module imports, no bundler. A Claude Code session told to "build a React screen" will either write JSX that never executes, or write vanilla DOM and wonder why React is loaded. Decision needed before screen 1. C2.

3. **The root `BookKeeping/CLAUDE.md` is unaware of the demo folder.** Its file map (§3) doesn't list `demo/`, `19-demo-flow-brief.md`, or any of the demo's screen briefs. Its "what to build next" (§9) doesn't mention the demo as active work. Its session history (§11) stops on 22 April. A Claude Code session that reads root CLAUDE.md first — which is the designed entry point — will not see the demo exists. This is a low-effort update but blocks the handoff. C3.

Beyond those three, the scaffolding is strong. The validator + retry loop is a genuinely good pattern and the prompt-overlay split is the right level of abstraction. The screen briefs are scoped well and independent — the "one session per screen" discipline will hold. Voice rules are enforced in code, not just prose. The design tokens are clean and match `design-system.md` v2.0.

The remainder of this review details the three Criticals plus 8 High, 13 Medium, and 8 Low findings grouped by lens.

---

## CRITICAL — Fix before handing any screen to Claude Code

### C1. Intent-name → prompt-filename mapping is broken for `thread.*` and `onboarding.<step>`

**What's wrong.** `worker-client.js` line 37 derives the overlay prompt file name this way:

```js
const overlay = await loadPrompt(intent.replace(".", "-"));
// where loadPrompt fetches `./prompts/${name}.md`
```

Three intents resolve correctly:

| Intent | Derived filename | File present? |
|---|---|---|
| `card.approval` | `card-approval.md` | ✅ |
| `books.qa` | `books-qa.md` | ✅ |
| `capture.parse` | `capture-parse.md` | ✅ |

Two intents fail:

| Intent | Derived filename | File present? |
|---|---|---|
| `thread.greeting` | `thread-greeting.md` | ❌ — file is `thread-ambient.md` |
| `thread.idle` | `thread-idle.md` | ❌ — file is `thread-ambient.md` |
| `onboarding.welcome`, `onboarding.entity`, … | `onboarding-welcome.md` etc. | ❌ — file is `onboarding.md` |

The prompt files themselves disagree on the scheme:

- `prompts/thread-ambient.md` line 3: *"Loaded when `intent === 'thread.greeting'` or `intent === 'thread.idle'`."*
- `prompts/onboarding.md` line 3: *"Loaded when `intent === 'onboarding.<step>'`."*
- Screen brief `01-onboarding.md` line 42: `intent: "onboarding"` (no dot), step in context — this is the pattern that would work.
- Screen brief `02-thread.md` line 45: `thread.greeting` / `thread.idle` — breaks.

**Why it matters.** The first time Claude Code builds the thread screen per brief 02, `renderPenny({intent: "thread.greeting"})` will throw `Prompt not found: thread-greeting`. Same for onboarding if the prompt file's self-description is trusted. Claude Code will either abandon the brief (bad) or patch the client to fit the files (worse — rewrites shared infrastructure from a single-screen session). This is the single most time-expensive bug in the scaffolding.

**Proposed fix.** Pick one scheme and propagate everywhere. Two options:

- **A. Single-file-per-screen, mode in context (recommended).** Rename `thread-ambient.md` → `thread.md`. Change briefs to use `intent: "thread"` with `mode: "first-time-greeting" | "returning-welcome" | "queue-empty" | "idle-check-in"` in context. Update `prompts/thread.md` header and `prompts/onboarding.md` header to say `intent === "thread"` / `intent === "onboarding"`. The current prompt content already switches on `context.mode` / `context.step` — minimal content change, just fix the headers and filename.
- **B. Explicit intent → prompt map in `worker-client.js`.** Replace the `replace(".", "-")` with a table:

  ```js
  const INTENT_TO_PROMPT = {
    "card.approval": "card-approval",
    "books.qa": "books-qa",
    "capture.parse": "capture-parse",
    "thread.greeting": "thread-ambient",
    "thread.idle": "thread-ambient",
    "onboarding": "onboarding"
  };
  ```

Option A is the cleaner pattern and halves the number of prompt-loading round trips on thread mount.

---

### C2. React-or-vanilla ambiguity — stack not committed

**What's wrong.** `index.html` loads three scripts from CDN:

```html
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
```

but no `<script type="text/babel">` tag ever runs Babel, and `app.js` / `worker-client.js` / `screens/*.js` are plain ES modules (no JSX). The stubs use `root.innerHTML = \`…\``; `screens/card.js` uses `document.createElement`. `screen-briefs/01-onboarding.md` line 34 says *"UI (tiles, buttons, progress) is static React"* and talks about React layout ("render `headline` as a `<h2>`"). The README describes "React components" in `screens/`. The CLAUDE.md doesn't mention React at all.

**Why it matters.** Claude Code following the onboarding brief will write JSX. JSX in `screens/onboarding.js` will never compile — Babel-standalone only transforms scripts tagged `type="text/babel"`, not ES-module imports. The screen silently won't render, and the build session will burn tokens debugging a setup issue.

**Proposed fix.** Pick one and make it the first sentence of the demo CLAUDE.md "Settled decisions" block:

- **Vanilla DOM with template literals (recommended for this scale).** Remove the React/ReactDOM/Babel script tags. Update all briefs to reference `innerHTML` / `createElement` patterns. Keeps the dependency surface tiny (just a static site + a Worker).
- **React, with a build step.** Add a Vite config, run `npm run dev`, emit pre-built JSX. Bigger setup, gives you real component composition.
- **React via Babel in-browser.** Keep the CDN scripts, rename all screen files to `.jsx`, include them as `<script type="text/babel" data-type="module">`. Works but loses ES module `import` — you'd lose the current `worker-client.js` + `screens/` separation. Not recommended.

If the answer is (A), the briefs need a small edit to replace any JSX phrasing with DOM phrasing. If (B), a `package.json`, a `vite.config.js`, and a new line in the run-locally instructions are needed.

---

### C3. Root `BookKeeping/CLAUDE.md` doesn't know the demo exists

**What's wrong.** The root CLAUDE.md is the designed first-read for any Claude session on this repo. Check against its current content:

- §3 File Map has no `demo/` row.
- §3 Product table doesn't list `19-demo-flow-brief.md` (which is ~45KB and referenced from every screen brief).
- §9 "What to Build Next" has no demo item; last entry is about AI evals.
- §11 Session history stops at 22 Apr ("Full folder restructure + clean").

**Why it matters.** Claude Code is meant to follow the instruction in the skills block: *read root CLAUDE.md before any substantive work.* If root CLAUDE.md doesn't mention the demo, one of two things happens:

1. Claude Code reads root, thinks demo is out of scope, and stops.
2. Claude Code ignores root for demo work and uses only `demo/CLAUDE.md` — which works, but defeats the root's purpose as a single source of truth.

**Proposed fix.** Three small edits to root `BookKeeping/CLAUDE.md`:

1. In §3 Product table, add a row for `19-demo-flow-brief.md` (status ✅ Complete — "Canonical demo flow brief. Source of all demo screen-briefs.").
2. Add a new §3 subsection "Demo (Claude Code rebuild)" listing `demo/CLAUDE.md`, `demo/README.md`, and the seven screen-briefs.
3. Add a §11 session-history entry for the v5 demo scaffolding work (prompts + guardrails + screen-briefs created 23 Apr).

Also add one line to §9 "What to Build Next": "Hand v5 demo scaffolding to Claude Code, one screen at a time, starting with onboarding."

---

## HIGH

### H1. `thread.greeting` missing from the API surface in `worker-client.js` (cache-busting consequence of C1)

**What's wrong.** Even after C1 is fixed via option A (one intent per screen, mode in context), the cache-key hash includes `intent` and `context`. Two callers of the same underlying prompt (mode-a vs mode-b) will correctly produce distinct cache entries. That's fine. But if the fix is option B (explicit map), the key collapses across modes because both map to the same overlay — yet the generated text differs per mode. The hash function needs to include the **mode** (or the whole context), which it already does. No code change beyond C1. Called out because the interaction matters.

**Proposed fix.** Confirm after applying the C1 fix: render thread.greeting twice with different modes, confirm two distinct cache entries exist. Document this invariant in a comment in `worker-client.js`.

---

### H2. Demo's "3 tabs" vs. product spec's "4 tabs" is an intentional divergence that isn't flagged anywhere

**What's wrong.** Root `CLAUDE.md` §4 locks: *"Four persistent bottom tabs: Penny · Add · My Books · Connect."* Demo `CLAUDE.md` settled decision #1: *"Three tabs only. Penny · Add · My Books. Connect functionality is merged into Add."* Neither file mentions the other's position.

**Why it matters.** The demo is a user-facing artifact that will shape expectations. If user feedback on the 3-tab demo drives MVP planning, the product spec's 4-tab lock silently becomes wrong. Conversely, if MVP ships with 4 tabs, testers who used the demo will be confused. This is a real product decision that should either be promoted from the demo into the product spec, or rolled back in the demo.

**Proposed fix.** Decide deliberately. If 3 tabs is the new product direction, add a decision D87 to `spec-brainstorm-decisions.md` (e.g., *"Connect is not a tab. Integration management merges into Add"*), and update `17-mobile-screens-and-flows.md` to match. If 4 tabs is still correct for MVP, amend the demo CLAUDE.md decision #1 to say "Connect is collapsed into Add **for the demo only**, to compress the walkthrough to 3 tabs."

---

### H3. Entity diagnostic decision tree in brief 01 is incomplete

**What's wrong.** `screen-briefs/01-onboarding.md` lines 86–92 defines the "Not sure" resolution table:

| Q1 (Schedule C?) | Q2 (Payroll?) | Q3 (Owners) | Result |
|---|---|---|---|
| Schedule C | No | Just me | sole-prop |
| Schedule C | No | Partner/multiple | llc (default tax) |
| Separate return | Yes | Any | s-corp |
| Separate return | No | Just me | llc (default tax) |
| Separate return | No | Multiple | c-corp |
| I don't know | any | any | default sole-prop, flag |

Missing rows:

- `Schedule C + Yes (payroll) + Just me` — a sole-prop who has one W-2 employee exists and files Schedule C. Table has no row.
- `Schedule C + Yes + Multiple` — same.
- A sole-prop cannot, by IRS rules, pay themselves through payroll (W-2 salary). The Q2 framing should be "Do you pay employees through payroll?" not "Is there payroll?" — otherwise the user who pays themselves (as an S-Corp owner would) answers "yes" incorrectly as a sole-prop.
- An LLC taxed as S-Corp vs. LLC taxed as partnership vs. single-member LLC all behave differently for accounting. The table collapses three states to one.

**Why it matters.** This is legal-ish logic. Getting it wrong in a demo is low-stakes; getting it wrong in MVP is much higher-stakes. The demo is where the pattern gets cemented. Fixing it now is cheap.

**Proposed fix.** Have the General Counsel role (per FounderFirst OS) do a 20-minute pass on this table. Or replace the Q1/Q2/Q3 diagnostic with a two-question version that's harder to get wrong: (a) "Do you file a separate tax return for the business, or include it on your personal return?" (b) "How many people own this business?" — drops the payroll question entirely. The S-Corp inference can come from a later, context-specific prompt.

---

### H4. `capture.parse` response shape is not validated

**What's wrong.** `prompts/capture-parse.md` defines a `parsed` object with `amount`, `vendor`, `category_guess`, `date`, `confidence`. `guardrails/voice-validator.js` only validates `headline`, `why`, `greeting`, and (for `card.approval`) `ctaPrimary` + `ctaSecondary`. There is no shape or type check for `parsed`.

**Why it matters.** The prompt explicitly tells the model *"Never invent an amount not in the user's text."* If the model hallucinates `parsed.amount = 80` when the user said "lunch", the validator won't catch it and the screen will render a wrong draft transaction. The rule is stated but not enforced.

**Proposed fix.** Add an intent-specific shape check to `validate()`:

```js
if (meta?.intent === "capture.parse") {
  if (!response.parsed || typeof response.parsed !== "object") {
    return { ok: false, reason: "capture.parse requires a parsed object." };
  }
  const p = response.parsed;
  if (p.amount !== null && typeof p.amount !== "number") {
    return { ok: false, reason: "parsed.amount must be number or null." };
  }
  // Optionally: if user text has no number, assert p.amount === null.
}
```

That last line is the hallucination guard. It needs the user text in `meta.context.text`, which it already has.

---

### H5. Meta viewport disables user zoom (WCAG fail)

**What's wrong.** `index.html` line 5:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
```

`maximum-scale=1` and `user-scalable=no` prevent the user from pinch-zooming the page. This is a well-known WCAG 2.1 violation (SC 1.4.4 Resize Text, Level AA).

**Why it matters.** A public product demo that ships with zoom-disabled is both an accessibility issue and a bad signal — some testers with low vision can't use it. Also, iOS 13+ silently ignores `user-scalable=no`, but `maximum-scale=1` still blocks double-tap zoom. No benefit to keeping it.

**Proposed fix.** Replace line 5 with:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

`viewport-fit=cover` handles iPhone notches; drop the zoom locks.

---

### H6. `app.js` clears the entire localStorage on boot, including the AI response cache

**What's wrong.** `app.js` line 22:

```js
try { localStorage.clear(); } catch (_) {}
```

But `worker-client.js` writes AI responses to localStorage under `penny.cache.v1.<hash>`. The boot clear wipes those too, so README's claim *"Same scenario → instant on re-render"* is only true within a single page-visit, not across refreshes.

**Why it matters.** The cache is the reason the demo is meant to feel fast the second time you run the same scenario. Wiping it every reload means every demo is slow on first run, and Nik re-demoing the same persona to a new tester also goes slow. Probably not what's intended.

**Proposed fix.** Scope the clear:

```js
try {
  Object.keys(localStorage).forEach(k => {
    if (!k.startsWith("penny.cache.v1.")) localStorage.removeItem(k);
  });
} catch (_) {}
```

Or make the intent clear in CLAUDE.md / README: "Cache is session-scoped, not persistent."

---

### H7. `screens/card.js` is both a screen and a component with no clear split

**What's wrong.** `screens/card.js` exports both `mount()` (for a standalone `#/card` route, which isn't wired in `app.js`) and `renderCard()` (for the thread to consume inline). The file is imported only by `thread.js` per brief 02. The `mount` export is dead.

**Why it matters.** Either the `#/card` route is needed for isolated testing (in which case add it to `app.js`) or it isn't (in which case delete `mount`). As written, both a screen-level "mount the card standalone" and a component-level "render inline" exist, and Claude Code will reasonably ask which one to implement. The CLAUDE.md build order calls it "Screen 3 — Approval card" which implies a standalone screen.

**Proposed fix.** Move the component to `components/card.js`, keep `screens/card.js` as a tiny test harness that mounts one variant at a time for visual regression. Add `#/card` to `app.js` routes. Update brief 03 to reflect the split. This also clarifies that the avatar menu (06) and the thread (02) both need the card component as a shared piece.

---

### H8. No error / empty / loading / offline states specified anywhere

**What's wrong.** None of the briefs describe what renders when:

- The Worker call fails with 429, 5xx, or network error.
- Claude returns unparseable text after 2 retries.
- The persona + scenario JSON fails to load (fetch error).
- The device is offline.
- The card queue is mid-load (no loading skeleton specified; the stagger timing in brief 02 is for successful render only).
- localStorage is full (quota exceeded — possible after many cached responses).

Root CLAUDE.md §3 flags `error-empty-states.md` as an ❌ Missing product doc. The demo inherits that gap.

**Why it matters.** Demo failure modes are where trust actually gets tested. If the Penny thread shows a blank screen when the Worker is slow, a reviewer's takeaway is "the product doesn't work" — even though that reaction is about the demo rig, not the product idea. At minimum, the demo needs:

- A loading state for Penny bubbles (three-dots "Penny is looking…" per design-system.md).
- A terminal error state with a retry button ("Something caught — want to try again?").
- A fallback when offline: render cached cards if present, show a dismissible banner otherwise.

**Proposed fix.** Add a new screen brief `screen-briefs/08-states.md` (or a §Error/Empty/Loading block in CLAUDE.md) defining the four error classes and the Penny-voice copy for each. This unblocks screen-level work without waiting for the full product `error-empty-states.md` doc. 30 min of work.

---

## MEDIUM

### M1. No LICENSE file; public-repo visitors default to "all rights reserved"

**What's wrong.** README line 119–121 says *"Source available for reference. Not intended for production use."* There's no `LICENSE` file. GitHub's default for repos without a license is fully reserved — which contradicts the README's "source available" framing.

**Proposed fix.** Add one of:

- A `LICENSE.md` stating explicitly *"Source-viewable for reference only. No rights granted for reuse, redistribution, or derivative works without written permission from FounderFirst."*
- Or pick an OSI license (e.g., PolyForm Noncommercial or Sustainable Use License) that matches the intent.

---

### M2. No Cloudflare Worker source in the repo

**What's wrong.** README line 115 references `https://penny-api.nikjain1588.workers.dev` but the Worker source isn't in this repo. A forker cannot run the demo against their own Worker.

**Why it matters.** For a public repo, that's a gap. Worse — the demo token and Worker URL are committed. Anyone can hit the Worker and drain the rate limit if they want to. The token is "safe to commit" only if the Worker enforces: (a) tight per-IP rate limits, (b) a strict model allowlist (so `gemini-1.5-opus-tyranosaurus-flash-preview` with 10k output tokens can't be coerced), (c) a max_tokens ceiling. None of that is documented.

**Proposed fix.** Either:

- Add a `demo-worker/` folder with the Worker source, its wrangler config, and a README for how to deploy your own.
- Or add a `demo-worker/README.md` stub that says *"The Worker source lives in a separate repo. Summary of what it enforces: [rate limit], [model allowlist], [max_tokens cap]. If you want to run your own, contact Nik."*

Either option covers the gap; the first is friendlier.

---

### M3. `personas.json` has 6 of 40 seed personas; `scenarios.json` has 2 of 40

**What's wrong.** Both files note *"Claude Code should expand to the full 40 during build."* No brief owns that expansion work. Every build session is scoped to one screen.

**Why it matters.** Some entity × industry combinations are implausible at the solo level (e.g. c-corp.beauty-wellness; a solo makeup artist as C-Corp is rare). Blindly filling the 40 produces noise. Also: scenario authoring is content work, not screen work — it shouldn't be bundled into screen sessions.

**Proposed fix.** Decide the real set deliberately:

- Trim to ~12–15 plausible personas (all sole-prop × 10 + selective s-corp + 2 LLCs).
- Create a separate one-off brief `screen-briefs/00-seed-data.md` that scopes persona + scenario expansion as its own session, with explicit rules for what the scenarios should demonstrate (every variant must appear in at least one scenario, etc.).
- Update `personas.json._meta` to reference that brief instead of "Claude Code should expand."

---

### M4. Import map in `index.html` is all identity mappings (noise)

**What's wrong.** Lines 37–47:

```html
<script type="importmap">
{ "imports": { "./app.js": "./app.js", "./worker-client.js": "./worker-client.js", ... } }
</script>
```

Every entry maps to itself. The browser's default module resolution already handles relative paths.

**Proposed fix.** Delete the importmap block. Or keep it only for future CDN mappings (e.g., if `react` becomes `"react": "https://esm.sh/react@18"`).

---

### M5. `defaultModel` / `booksModel` choice isn't explained

**What's wrong.** `index.html` config sets `defaultModel: "claude-haiku-4-5-20251001"` and `booksModel: "claude-sonnet-4-6"`. Both README and CLAUDE.md are silent on why two models.

**Why it matters.** Anyone reading the code asks "why?" — and the answer (Haiku is fast enough for voice, Sonnet is more accurate on arithmetic and therefore safer for books Q&A where wrong numbers destroy trust) is a genuinely useful design note.

**Proposed fix.** Add one line to README (under "How it works"): *"Voice utterances use Haiku for latency. Books Q&A uses Sonnet because numeric accuracy matters more than speed there."*

---

### M6. Banned-phrase list in prose (`penny-system.md`) and regex (`banned-phrases.js`) can drift

**What's wrong.** The MD lists ~9 banned phrases; the JS encodes ~11 patterns. The JS is stricter (adds British spellings, over-apology, emoji allowlist). No automated check keeps them in sync.

**Why it matters.** If Nik updates the MD ("add 'We apologize' to the banned list"), the model hears the updated rule but the validator won't catch violations. Or vice versa.

**Proposed fix.** One of:

- Add a comment at the top of `banned-phrases.js`: *"Source of truth for machine enforcement is this file. The MD list in penny-system.md is a human-readable summary for the model. If you change one, change both."*
- Or write a tiny test that parses `penny-system.md` and asserts every phrase it bans has a corresponding regex here.

(The first is cheaper and sufficient.)

---

### M7. `date` in `capture-parse.md` few-shot is hard-coded; scenarios use relative `daysAgo`

**What's wrong.** `capture-parse.md` examples include `"today": "2026-04-23"`. When the demo runs in May, `today` should be May's date — but nothing in the client computes and passes it. Meanwhile `scenarios.json` uses relative `daysAgo`, which does need conversion at read time.

**Why it matters.** Two date conventions, neither consistently wired. Nik shows the demo on 15 May 2026 → card dates say "April 18" (stale) and the capture parser confidently says "2026-04-23 yesterday" (wrong).

**Proposed fix.** Add to `app.js` (or a new `util/time.js`): a `now()` helper that returns `new Date().toISOString()` plus a `resolveDaysAgo(daysAgo)`. Brief 01-onboarding should say *"Convert all `daysAgo` values via `resolveDaysAgo` when seeding the ledger."* Pass `context.today` into every `renderPenny` call so the model always has current date.

---

### M8. `onboarding.md` prompt header contradicts the brief (minor cousin of C1)

**What's wrong.** Prompt file line 3 says `intent === "onboarding.<step>"`. Brief 01 line 42 passes `intent: "onboarding"` with step in context. These disagree.

**Proposed fix.** Fix as part of C1. Make the prompt header read `intent === "onboarding"` once the pattern is settled.

---

### M9. Emoji validator has dead-code branch for `✓`

**What's wrong.** `voice-validator.js` line 62: `if (!APPROVED_EMOJI.has(e) && e !== "✓") { ... }`. The `e` list comes from `\p{Extended_Pictographic}` regex, which does not match U+2713 (Check Mark). So the `e !== "✓"` branch is never triggered.

**Proposed fix.** Cosmetic. Remove the `&& e !== "✓"` (since it can't match) — or add a comment that it's belt-and-braces protection. Lower priority than most other items.

---

### M10. No test harness

**What's wrong.** No `tests/` folder. No `package.json` with a test script. The validator + retry + hash + extractJSON helpers are all small, pure functions that scream for unit tests — but there are none.

**Why it matters.** The whole product promise rests on validator correctness. If the validator lets `"You have 5 items to review"` through, the demo shows a banned phrase. Without tests it's easy for a future edit to regress.

**Proposed fix.** Add a `tests/validator.test.js` with ~10 cases covering banned phrases, sentence count, emoji count, field length, intent-specific shape. Use `node --test` so no build dep added. A separate `tests/extract-json.test.js` for the JSON extractor. Together: about 80 lines of test code, runnable as `node --test tests/`.

---

### M11. `personas.json` keys (`sole-prop.consulting`) use a period that collides with the intent-naming convention

**What's wrong.** `personas.json` uses `"key": "sole-prop.consulting"`. Any code that does `split(".")` on a persona key will break. It's a style collision with `intent.replace(".", "-")` in `worker-client.js`.

**Proposed fix.** Low priority, but prefer a different separator: `sole-prop__consulting` or `sole-prop/consulting`. Or document explicitly that the period is allowed here. Easier: switch to `_` as the separator.

---

### M12. No CONTRIBUTING / SECURITY / CODE_OF_CONDUCT files for public repo

**What's wrong.** Strangers will open issues/PRs, and there's nothing to set expectations.

**Proposed fix.** Add a one-file `CONTRIBUTING.md` (or a section in README) that says *"This is a working prototype. External PRs aren't accepted right now — please open an issue for bugs or security concerns. For anything sensitive, email nik@[domain]."*

---

### M13. Demo `CLAUDE.md` says "rebuilding this from scratch" — phrasing will confuse public readers

**What's wrong.** Line 11: *"You (Claude Code) are rebuilding this from scratch in this folder."* Public readers will wonder what "from scratch" means and why the screens are stubs.

**Proposed fix.** Reframe in a voice that's honest but not jarring. *"This folder is the scaffolding for the v5 demo. The stubs in `screens/` are placeholders; full implementations are built one screen at a time via Claude Code sessions using the briefs in `screen-briefs/`."* Keep the "Claude Code" callouts as section headers so it's clear who the internal audience is.

---

## LOW

### L1. ASCII box-drawing characters in briefs (fine on GitHub; aesthetic only)
Fine as-is. Flagging for awareness.

### L2. Only `penny-system.md` has a version header
Add `*Version 1.0 · April 2026*` to the other overlay prompts so drift is traceable.

### L3. `card-approval.md` `owners-draw` example uses `"Got it"` as `ctaPrimary`
The card brief doesn't explicitly say CTAs can override the default "Confirm". Either add a line allowing variant-specific CTAs or normalize to "Confirm"/"Change".

### L4. `books-qa.md` few-shot doesn't lead with "Under current IRS rules…"
The prompt rule says tax questions must frame as current IRS guidance. Example #2 (laptop deduction) says *"Generally yes — a laptop used for your business is deductible."* — starts with "Generally" not "Under current IRS rules". Minor few-shot inconsistency that will train the wrong behavior. Fix the example.

### L5. `.phone` shell is a phone-in-phone on mobile
On a real 375px device, the `.phone` wrap is a rounded rectangle inside a rounded rectangle. Add a media query: at viewport ≤ 420px, drop the border and rounded radius on `.phone`.

### L6. `--fs-card-value: clamp(30px, 4vw, 46px)` may clip on narrow stat cards
46px on a phone is aggressive when the card is ~160px wide. Verify "Runway" card with the 8200 value ("$8,200"). If clipping, cap at 38px for mobile.

### L7. `workerUrl` exposes a username slug
`penny-api.nikjain1588.workers.dev` embeds a CF username. Pointing a custom domain (`api.penny.founderfirst.one`) is a 10-minute DNS change and reads cleaner.

### L8. Long session-history entries in root CLAUDE.md read like internal meeting notes
Not a demo issue per se, but since the demo is public and root CLAUDE.md is public too, the 10+ line prose paragraphs in §11 will look odd to strangers. Consider moving the granular entries into a separate `DECISIONS.md` or `CHANGELOG.md`. Keep CLAUDE.md focused on "how to work on this project."

---

## Lens-by-lens summary

### UX
- Core walkthrough (onboarding → first card → thread → books) is complete and scoped.
- Missing: loading / empty / error / offline states (H8). Shame-free re-entry is enforced in the validator but the queue-empty state in brief 02 is a single line — add a "calm close" empty art treatment.
- Entity diagnostic decision tree is incomplete (H3).
- The "Ask Penny" bar appears in both the thread (brief 02) and My Books (brief 05). Specify behavior consistency: does submitting always route to `#/books`, or does it stay in-thread?

### UI / design system
- Tokens and components files align cleanly with `design-system.md` v2.0. No design-token violations in any prompt or brief.
- Viewport meta disables zoom (H5).
- Phone shell behaviour at narrow viewports needs a media query (L5).
- `.card-value` font may clip (L6).
- Emoji rules are enforced in code; one dead code branch (M9).

### Product
- Scope is clear per brief; acceptance criteria are concrete ("all 7 steps render at 375px", "validator passes on every line").
- Demo-vs-MVP divergence (3 tabs vs. 4 tabs) is intentional but unflagged (H2).
- Persona + scenario authoring is scope-ambiguous (M3).
- No instrumentation plan: how does feedback from demo walkthroughs actually flow back to the product team? README says "feedback shapes the MVP" but there's no "share your reaction" button, no PostHog, no capture hook.
- No "how to use this demo with testers" runbook: Nik's 5-minute walkthrough script isn't in the repo.

### Technology
- Validator + retry loop is a genuinely good pattern. Rare to see this much care at scaffolding stage.
- Intent → prompt filename mapping is broken in two places (C1).
- Stack is undecided — React or vanilla (C2).
- `capture.parse` shape is not validated (H4).
- `localStorage.clear()` wipes the AI cache (H6).
- No test harness (M10).
- No streaming. For a demo that values "feels fast", a Claude streaming hookup with typewriter effect would land hard. Out of scope for pass 1; worth a followup.
- No model-tier routing abstraction. One `if intent === "books.qa"` is fine for two models; formalize before adding a third.
- Cache keys don't include a prompt-content hash, so prompt edits don't invalidate old responses (A4 below).

### Architecture
- Folder structure is clean and maps well to future production shape (prompts → server-side prompt bank, guardrails → output filter middleware, config → seed-data service).
- Coupling between screens and AI layer is right-sized: screens call `ai.renderPenny({intent, context})` and know nothing about prompt files or validation.
- `screens/card.js` double-duty (screen + component) is minor sprawl (H7). Prefer `components/` for anything re-used.
- No `ai.warm()` preloader: first card render on thread will round-trip 2 prompt files + 1 Worker call. A warm step on app mount would compress latency.
- Cache-key strategy: **A4** — if prompts change, the cache doesn't invalidate. Include a short hash of the prompt content in the key, versioned by `v1` → `v2` when the schema changes.
- No streaming, no model routing abstraction (see Tech).
- Session-reset model is aggressive (H6).

### Public-repo readiness
- README is strong, honest, and scoped. Design goals #1–#5 land. "How it works" diagram is clear.
- No `LICENSE` (M1), no `CONTRIBUTING` / `SECURITY` (M12), no link to the Worker source (M2).
- Username slug exposed in Worker URL (L7). Low effort to fix.
- Demo CLAUDE.md phrasing is internal-sounding in spots (M13).
- Paths like `../product/19-demo-flow-brief.md` in briefs assume the demo folder lives inside the parent repo. If the demo is ever split into its own repo (to publish at `github.com/founderfirst/penny-demo` as a standalone showcase), every cross-reference breaks. Decide single-repo vs. multi-repo before publishing.
- Root `CLAUDE.md` is unaware of the demo (C3) — and because root CLAUDE.md is committed publicly, this is what visitors first see. Fix before push.

---

## Recommended action list (priority order)

This is ordered for minimum churn: earlier fixes unblock later ones. All items are scoped small.

**Before publishing / before first Claude Code screen session**

1. **Fix C1** — Decide on intent → prompt filename scheme. Recommend option A (rename `thread-ambient.md` → `thread.md`; use `intent: "thread"` with mode in context). Update `02-thread.md` brief, `thread.md` header, and `onboarding.md` header. 15 min.
2. **Fix C2** — Decide React or vanilla. Recommend vanilla DOM (remove React/ReactDOM/Babel from `index.html`, update briefs to use `innerHTML` / `createElement` phrasing). 30 min if vanilla; 60 min if React+Vite.
3. **Fix C3** — Update root `BookKeeping/CLAUDE.md`: add demo/ entry to §3, add "build next" item to §9, add session history entry to §11. 20 min.
4. **Fix H5** — Remove `maximum-scale=1, user-scalable=no` from viewport meta. 1 min.
5. **Fix H8** — Write `screen-briefs/08-states.md` defining loading / empty / error / offline states. 30–45 min.
6. **Fix M1** — Add `LICENSE.md`. 5 min.
7. **Fix M2** — Add `demo-worker/README.md` or the actual Worker source. 15 min (stub) or 60 min (full).

**Before the second screen session**

8. Fix H2 (3 vs. 4 tabs). Commit to a product direction or explicit demo-only divergence.
9. Fix H3 (entity diagnostic table). Likely a 30-min legal-role pass.
10. Fix H4 (validator shape check for `capture.parse`). 15 min.
11. Fix H6 (scoped localStorage clear). 5 min.
12. Fix H7 (move card to `components/`). 20 min.
13. Fix M3 (seed-data brief). 30 min.
14. Fix M4 (remove importmap). 1 min.
15. Fix M7 (date helper + pass `today`). 20 min.

**Before publishing to GitHub public**

16. Fix M12 (CONTRIBUTING).
17. Fix L7 (custom domain for Worker) if the username slug matters.
18. Fix L8 (decide how much root CLAUDE.md history to keep public).

**Medium-priority, can follow after first screen ships**

19. M5, M6, M8, M9, M10, M11, M13 — cosmetics and hygiene.
20. L1–L6 — polish.

---

## Appendix — files reviewed

- `demo/CLAUDE.md`
- `demo/README.md`
- `demo/index.html`
- `demo/app.js`
- `demo/worker-client.js`
- `demo/.gitignore`
- `demo/styles/tokens.css`
- `demo/styles/components.css`
- `demo/prompts/penny-system.md`
- `demo/prompts/card-approval.md`
- `demo/prompts/onboarding.md`
- `demo/prompts/thread-ambient.md`
- `demo/prompts/books-qa.md`
- `demo/prompts/capture-parse.md`
- `demo/guardrails/banned-phrases.js`
- `demo/guardrails/voice-validator.js`
- `demo/guardrails/retry-on-fail.js`
- `demo/config/industries.json`
- `demo/config/personas.json`
- `demo/config/scenarios.json`
- `demo/screens/*.js` (all 7 stubs)
- `demo/screen-briefs/01-onboarding.md` through `07-invoice.md`
- `BookKeeping/CLAUDE.md` (root)
- `product/19-demo-flow-brief.md` (cross-reference only)
- Prior stress tests in `reviews/` (format reference)

---

*Reviewer note.* None of the findings above suggest the direction of the demo is wrong. The product shape is clearly thought through, the voice rules are encoded rigorously, and the build-by-brief pattern will scale. The findings are the pre-build gaps — the places where a builder would stop and ask, and the places where a public reader would see a rough edge. Fix the three Criticals + the two highest-impact Highs (H5, H8) and the scaffolding is handoff-ready.
