# Screen Brief 01 — Onboarding

*Scope for a single Claude Code build session. Read `../CLAUDE.md`, `../styles/tokens.css`, and `../prompts/penny-system.md` alongside this file. Do not read the full flow brief.*

---

## What you're building

A 7-step onboarding flow that runs at `#/` and `#/onboarding`. Completes in under 90 seconds when the user follows the happy path. Drops them into `#/thread` when done.

Target file: `screens/onboarding.js`.

---

## The 7 steps

| Step | Route hash | What the user sees | What it sets in state |
|---|---|---|---|
| 1. Welcome | `#/onboarding/welcome` | Penny intro, single "Let's go" button | — |
| 2. Entity | `#/onboarding/entity` | 5 large-tap rows: Sole Prop / LLC / S-Corp / C-Corp / Not sure | `state.entity` |
| 2a. Diagnostic | `#/onboarding/entity-diag` | Only when user picked "Not sure". **2 sequential questions** (revised Apr 23). | `state.entity` (inferred) |
| 3. Industry | `#/onboarding/industry` | 10 tiles in 2×5 grid. From `industries.json`. | `state.industry` |
| 4. Payment methods | `#/onboarding/payment` | 4–6 industry-tailored tiles + "search more". Multi-select. | `state.paymentMethods` |
| 5. Expenses | `#/onboarding/expenses` | Expense categories only (multi-select, industry presets). **Capture preferences removed from onboarding** — earn trust first. | `state.expenseCategories` |
| 6. Check-in | `#/onboarding/checkin` | 4 options: Monday 9am / Friday 4pm / Daily 6pm / Custom. | `state.checkIn` |
| 7. Bank | `#/onboarding/bank` | 4–5 industry-tailored banks + "search 10,000+ banks" + "Skip for now". | `state.bankConnected` |

After step 7: 3-second "Pulling 30 days…" progress → navigate to `#/thread`.

---

## Penny copy — STATIC, not AI (updated 23 Apr 2026)

**Do not call `ai.renderPenny` for any onboarding step.** All Penny copy uses the `FALLBACK_COPY` object defined at the top of `screens/onboarding.jsx`. This is a locked decision — see CLAUDE.md settled decision #2.

Rationale: AI-generated onboarding copy changed on every load, produced inconsistent tone, and made demos unreliable. The static copy has been tone-reviewed and approved.

The `FALLBACK_COPY` object is the single source of truth for all onboarding Penny lines:

```js
const FALLBACK_COPY = {
  welcome:       { greeting: "👋 Hi, I'm Penny.", headline: "Nice to meet you. The books are on me from here.", why: "One quick setup and I take it from here — for good." },
  entity:        { headline: "Let me make sure I understand your setup first.",  why: "Get this right once and I'll handle everything the right way — every time."  },
  "entity-diag": { headline: "No worries at all — let's work it out together.", why: "Two questions and I'll know exactly what to do."                              },
  industry:      { headline: "What kind of work do you do?",                    why: "I want to know your business the way you know it."                            },
  payments:      { headline: "How do your clients pay you?",                    why: "Every payment you earn — I'll be watching for it."                            },
  expenses:      { headline: "What do you usually spend on?",                   why: "Tell me once. I'll recognize it every time after that."                       },
  checkin:       { headline: "When's a good time for me to check in?",          why: "I'll have everything ready — you just show up."                               },
  bank:          { headline: "Which account should I start watching?",          why: "I read every transaction as it comes in. Your money never moves."             },
};
```

The step `useEffect` sets `pennyMsg` directly from `FALLBACK_COPY[step]` — no async call, no loading state, no skeleton.

---

## Layout rules

- **Phone shell.** Wrap everything in `.phone` → `.phone-content`. Target 375px.
- **Header.** Back button only (except welcome + pulling). **No progress dots** — they make the flow feel like a long form. Back button is a 36×36px circle.
- **Welcome screen.** Clean hero — no `.penny-bubble` border. P-mark avatar → greeting text (plain, no box) → bold headline → supporting line → CTA. See `.ob-welcome-wrap` in `components.css`.
- **Penny speech area (all other steps).** P-mark + `.penny-bubble` with PENNY label + headline + why. Show fallback copy **instantly** — do not show a skeleton loader. AI response silently upgrades the copy when it arrives.
- **Bubble stability.** The `useEffect` that calls `renderPenny` must only depend on `[step, diagQ]` — never on selection state. Selecting a tile must never cause the bubble to re-render or shift.
- **Tiles.** Big tap targets (min 72px tall). Border `var(--line)`. Active border `var(--ink)`.
- **Entity tiles.** Inline SVG icon (32×32 rounded square container) + label + plain-English subtitle. No emoji.
- **Industry tiles.** SVG icon above label. Two-column grid. "Other" reveals a text input inline below the grid on selection.
- **Custom check-in picker.** Days: 4-column grid (Mon–Thu / Fri–Sat–Sun). Times: 4-column grid. Set `min-width: unset; min-height: unset` on picker buttons to override the global 44px tap-target rule.
- **Continue CTA.** Full-width pill `.btn.btn-full` at the bottom of the viewport. Disabled until minimum selection met.

---

## Entity diagnostic (the "Not sure" branch)

**Two sequential questions** (revised 23 Apr 2026). The earlier three-question version mixed a payroll question that confused sole props who pay themselves (they don't, legally — but many assume they do) and collapsed three distinct LLC tax treatments into one row. The two-question version below is harder to get wrong and defers the S-Corp inference to a later, context-specific prompt (which is correct behavior anyway — S-Corp election often happens mid-year and is better narrated than inferred).

After Q2, show a resolution screen:

```
Penny proposes: "Sounds like you're probably a [entity]. Here's why:
· [reason from Q1]
· [reason from Q2]
Want to go with that?"

[ Yes, that's me ] [ Actually, it's different ]
```

If "Actually, it's different" → return to step 2 entity picker.

**Q1 — Tax filing.** "Do you file a separate tax return for the business, or include it on your personal return?"

- `personal-return` — included on personal (Schedule C / Schedule E).
- `separate-return` — files its own return (1120 / 1120-S / 1065).
- `not-sure` — defer, flag for CPA confirmation.

**Q2 — Owners.** "How many people own this business?"

- `just-me` — single owner.
- `me-and-others` — multiple owners.

Resolution logic (deterministic, no AI):

| Q1 | Q2 | Inferred entity | Notes |
|---|---|---|---|
| personal-return | just-me | `sole-prop` | MVP supports fully on day 1. |
| personal-return | me-and-others | `partnership` (LLC default) | Deferred — flag "Partnerships aren't in the MVP yet." |
| separate-return | just-me | `s-corp` | MVP supports fully on day 1. Detect later whether LLC-taxed-as-S-Corp vs. true corporation. |
| separate-return | me-and-others | `s-corp` (assume) | Same MVP handling. Nuance deferred to Memory. |
| not-sure | any | `sole-prop` (default) | Flag "Let's confirm with your CPA on the next sync." |

The reasoning lines ("You file a separate return", "Just you") are generated by AI using `step: "entity-not-sure"` with the answers in context.

---

## Industry and payment-method data

Pull from `config/industries.json`. The 10 industries are fixed — don't expose "add your own." For each industry, `paymentMethods` and `expenseCategories` arrays are the tailored defaults for steps 4 and 5.

The "search more providers" panel (step 4) is a stretch — OK to stub as "coming soon" for the first build pass, or render a static list of 20 providers if cheap.

---

## Bank step

Three paths — all lead to the same outcome in the demo:

1. Tap an industry-tailored bank tile.
2. Tap "Search 10,000+ banks" → opens a search input. Stub with a small static result list.
3. Tap "Skip for now — Penny will use demo transactions."

All three → show a 3-second "Pulling 30 days…" progress screen → navigate to `#/thread`. No real Plaid integration.

---

## Persistence

At the end of onboarding, call `set({ ... })` with the final state. Persist to `localStorage` under key `penny.onboarding.v1` so a refresh mid-demo doesn't lose progress. The app-level `localStorage.clear()` on session start wipes this for each new visitor.

---

## Accessibility

- Every tile must be a `<button>` with `aria-pressed` when selected.
- Step progress must announce "Step 3 of 7" via `aria-live`.
- Focus moves to the top of each new step on transition.

---

## Done when

- All 7 steps render at 375px without horizontal scroll.
- "Not sure" diagnostic branches correctly per the table above.
- Every Penny line is generated live (not hard-coded).
- Validator passes on every generated line (visible in console if `__penny.ai.debug = true`).
- Completing step 7 navigates to `#/thread` with full state populated.

---

## Not in scope

- Real OAuth to Plaid. Stub only.
- Real payroll provider selection (that lives in the Add tab, not onboarding).
- Home office deduction prompt (deferred to My Books).
- Any login / account creation. Demo is anonymous.

---

## References

- `../prompts/onboarding.md` — exact prompt + few-shot examples per step
- `../config/industries.json` — industry matrix
- `../../product/19-demo-flow-brief.md §5` — full onboarding flow (read only if you need clarification beyond this brief)
