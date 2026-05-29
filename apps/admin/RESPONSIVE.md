# Responsive standard

Every page, tab, and component in the FounderFirst monorepo must render correctly at **any** viewport width from 320px to 1920px+ — not just at three preset breakpoints.

## The 6 rules

1. **Fluid first, breakpoints second.** Use `clamp()`, `min()`, `max()`, `flex-wrap`, and `grid auto-fit` so layouts re-flow naturally. Only add a `@media` query when a layout truly needs to *change shape* (e.g. nav → hamburger, two-col → one-col).
2. **No hardcoded pixel widths in horizontal layouts.** Replace `grid-template-columns: 200px 1fr 90px` with `minmax(140px, 200px) 1fr 70px` and stack on narrow viewports.
3. **Use design-system tokens.** Spacing, color, radius, font-size come from `packages/design-system/tokens.css`. Never inline hex values or magic px sizes.
4. **Touch targets ≥ 44×44 px.** Use `min-height: var(--tap-min)`.
5. **Tables get `.table-wrap`.** Horizontal scroll with edge-fade affordance. Never let a table overflow its container.
6. **Inputs ≥ 16px font-size.** Prevents iOS auto-zoom on focus.

## Breakpoints (when you need them)

- `≤ 480px` — small phones
- `≤ 640px` — phones
- `≤ 860px` — admin nav collapse point (content stops fitting)
- `≤ 1024px` — tablets

Match the existing syntax in the file you're editing (`max-width` in admin, `min-width` mobile-first in marketing).

## Before merging a new page or tab

Walk the width ladder in the preview:

  320 · 360 · 375 · 414 · 480 · 540 · 640 · 768 · 834 · 1024 · 1280 · 1440 · 1920

At every width, check:
- [ ] No horizontal scrollbar (unless inside a `.table-wrap`)
- [ ] All touch targets ≥ 44×44 px
- [ ] No text clipped or overlapping
- [ ] No fixed-position element (Penny bubble, cookie banner) covers a CTA
- [ ] Nav, tabs, and tables stay usable

Quick check in DevTools console:
```js
document.documentElement.scrollWidth > innerWidth // must be false
```

## Where the rules already live in CSS

- Admin nav collapse: `apps/admin/src/styles.css` — `@media (max-width: 860px)` near `.admin-nav`
- Funnel stacking: `@media (max-width: 640px)` near `.funnel-row`
- Ticket row stacking: `@media (max-width: 480px)` near `.ticket-row`
- Tabs scroll: base styles on `.tabs` (no media query needed — fluid)
- Table scroll fade: base styles on `.table-wrap`

Copy these patterns for new tabs/pages.
