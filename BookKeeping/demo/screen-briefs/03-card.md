# Screen Brief 03 — Approval Card

*Scoped build spec for `screens/card.jsx`. Read `../CLAUDE.md`, `../styles/tokens.css`, `../public/prompts/penny-system.md` alongside this.*

---

## Two exports, one file — read this before you start

`screens/card.jsx` exposes **two** things and they are not the same:

1. `export default function CardScreen(...)` — the standalone route at `#/card/:id`. Used for isolated testing of a single variant. Claude Code should keep this minimal: wraps `<ApprovalCard />` in a `.phone-content` with a header and nothing else.
2. `export function ApprovalCard({ card, onConfirm, onChange })` — the component consumed inline by `screens/thread.jsx` and the My Books drill-down. This is where all the layout, variant logic, and AI call live.

Build `ApprovalCard` first. `CardScreen` is ~10 lines after that. Do not duplicate layout between the two.

---

## What you're building

The universal approval card — the single most important component in the demo. One layout, 9 variants driven by data.

---

## Variants

Rendered identically; copy differs (generated live by AI).

| Variant | Shown when | Entity gating |
|---|---|---|
| `base-expense` | Most expenses (confidence ≥ 0.80) | All |
| `low-confidence` | Expense confidence < 0.80 | All |
| `income` | Any income event | All |
| `income-celebration` | First income of month or > 3× average | All |
| `split` | User taps "Split" on any card | All |
| `variable-recurring` | Recurring vendor, amount > 2× median | All |
| `rule-proposal` | After 3 confirmations of same vendor | All |
| `owners-draw` | Transfer business → owner personal | **S-Corp, LLC-taxed-as-S-Corp only** |
| `transfer` | Internal account transfer | All |

Sole Prop and C-Corp never see `owners-draw`.

---

## Card anatomy

```
  NOW                                ← ::before pseudo-label (9px semibold, --ink-4)
┌──────────────────────────────┐
│  [Vendor icon 40×40px]       │   border: 1.5px solid var(--ink)
│                              │   border-radius: 16px (--r-card-emph)
│  Vendor name                 │   padding: 24px
│  $amount · date/time         │   box-shadow: var(--shadow-card-hero)
│                              │
│  Penny thinks: Category      │   category pill: 12px semibold uppercase
│  "one-line reasoning"        │   border: 1.5px solid var(--line)
│                              │
│  ●●●●●○○ Confidence 82%      │   fill: var(--ink); label 11px semibold uppercase
│                              │
│  [ Confirm ]  [ Change ]     │   full-width primary, secondary side by side
│  [Split] [Rule] [Skip]       │
└──────────────────────────────┘
```

**Income variant (`.approval-card--income`):** full `background: var(--ink)` dark card.
- Vendor icon: `rgba(255,255,255,0.12)` background
- Vendor name, amount, date: white text
- Category pill: `rgba(255,255,255,0.15)` bg, `rgba(255,255,255,0.3)` border, white text
- Confirm button: white background, ink text
- Change button: `rgba(255,255,255,0.12)` background, white text
- Confidence fill: `rgba(255,255,255,0.6)`

**Confirmed slug:** collapses to a paper pill — `background: var(--paper)`, `border-radius: 10px`, `padding: 11px 14px`. Not a border-bottom row.

Fields from the data: vendor, amount, date, category guess, confidence.
Fields from AI: the "Looks like X" reasoning line (`why` in the response), the button labels (`ctaPrimary`, `ctaSecondary`).

---

## AI call

```js
const msg = await ai.renderPenny({
  intent: "card.approval",
  context: {
    entity: state.entity,
    industry: state.industry,
    persona: state.persona,
    card: { variant, vendor, amount, date, confidence, category_guess, ...variantSpecific }
  }
});
```

Prompt file `card-approval.md` has few-shot examples for every variant.

---

## Interactions

- **Confirm** — card collapses to paper pill slug (`background: var(--paper)`, `border-radius: 10px`). Toast: "Got it. One more below." Advance queue.
- **Change** — opens `CategorySheet` via `createPortal` into `#sheet-root`. Industry-specific categories from `industries.json.expenseCategories` merged with `DEFAULT_CATEGORIES`. Sheet is a child of backdrop (not sibling) — see CLAUDE.md portal pattern.
- **Split** — opens split sheet — stretch goal, stub for pass 1.
- **Rule** — only visible on `rule-proposal` variant. Tap → show "Auto-categorizing [vendor] as [category] going forward ✓" toast.
- **Skip** — moves card to backlog. Toast: "Saved for later. I'll bring it back."

---

## Done when

- All 9 variants render with appropriate AI copy.
- S-Corp personas see `owners-draw` cards; Sole Prop personas never do.
- Confirm → collapse → next card animates smoothly.
- Toast shows on every action.

---

## Not in scope

- Full split editor — stub.
- Category picker as a sheet — stub with a dropdown for now.

---

## References

- `../prompts/card-approval.md`
- `../../product/19-demo-flow-brief.md §7`
