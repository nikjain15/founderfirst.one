---
version: alpha
name: Penny
description: >
  Penny is an AI-first, mobile-first bookkeeper for US sole proprietors and small
  business owners. The design language is ink on paper — monochrome, clean, and
  trustworthy. Accent colors are strictly zoned. No third-party brand colors. No
  decorative emoji. Production-grade iOS quality at 375px minimum width.
colors:
  ink: "#0a0a0a"
  ink-2: "#2a2a2a"
  ink-3: "#5a5a5a"
  ink-4: "#8a8a8a"
  line: "#e8e8e5"
  line-2: "#f0f0ed"
  paper: "#f6f6f4"
  white: "#ffffff"
  error: "#b2291e"
  sage: "#2B7A78"
  income: "#1A9E6A"
  income-bg: "#f0faf5"
  amber: "#C97D1A"
  expense-bg: "#fdf8f0"
  cat-tech: "#4A6FA5"
  cat-food: "#C4702A"
  cat-travel: "#C4702A"
  cat-personal: "#5a5a5a"
  cat-health: "#5a5a5a"
  cat-office: "#5a5a5a"
  cat-tech-bg: "#eef2fa"
  cat-food-bg: "#fdf3ea"
  cat-travel-bg: "#fdf3ea"
  cat-personal-bg: "#f6f6f4"
  cat-health-bg: "#f6f6f4"
  cat-office-bg: "#f6f6f4"
typography:
  h1:
    fontFamily: Inter
    fontSize: clamp(36px, 5.5vw, 64px)
    fontWeight: 700
    letterSpacing: -0.028em
  h2:
    fontFamily: Inter
    fontSize: clamp(26px, 3.8vw, 44px)
    fontWeight: 700
    letterSpacing: -0.028em
  h3:
    fontFamily: Inter
    fontSize: clamp(17px, 2vw, 21px)
    fontWeight: 600
    letterSpacing: -0.022em
  body:
    fontFamily: Inter
    fontSize: clamp(15px, 1.6vw, 17px)
    fontWeight: 400
    letterSpacing: 0
  screen-title:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 600
    letterSpacing: -0.028em
  card-value:
    fontFamily: Inter
    fontSize: clamp(30px, 8vw, 46px)
    fontWeight: 700
    letterSpacing: -0.028em
  eyebrow:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.12em
  tiny:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: 600
    letterSpacing: 0.06em
rounded:
  card: 12px
  card-emph: 16px
  sheet: 20px
  pill: 999px
spacing:
  screen: 20px
  card: 16px
  gap-thread: 12px
  gap-card: 12px
  gap-section: 24px
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  card-hero:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.card}"
  approval-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card-emph}"
  approval-card-income:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.card-emph}"
  category-pill:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  tab-active:
    textColor: "{colors.sage}"
  tab-inactive:
    textColor: "{colors.ink-3}"
  penny-bubble:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  user-bubble:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  badge-needs-look:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
  income-amount:
    textColor: "{colors.income}"
  provider-badge:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: 10px
---

## Overview

Penny's design language is **ink on paper** — a monochrome foundation with strictly zoned semantic accents. The goal is to feel like a calm, knowledgeable friend: not a bank, not a dashboard, not an app with aggressive branding. Every color decision earns its place by communicating something specific.

The primary design constraint is **375px minimum width** — every component must work on the smallest common iPhone screen. No horizontal overflow. No truncation. Production-grade iOS quality throughout.

Shared tokens with FounderFirst.one: `--ink`, `--paper`, Inter, p-mark avatar, pill buttons. The product and the brand look like the same company.

---

## Colors

The color system has three layers:

**Foundation (use freely):**
- `ink` (#0a0a0a) — primary text, primary buttons, filled marks. Near-black, not pure black.
- `ink-2` (#2a2a2a) — secondary text, body copy.
- `ink-3` (#5a5a5a) — supporting text, captions.
- `ink-4` (#8a8a8a) — de-emphasized text, placeholders.
- `line` (#e8e8e5) — card borders, dividers.
- `line-2` (#f0f0ed) — subtle dividers, dashed borders.
- `paper` (#f6f6f4) — warm off-white. Section backgrounds, Penny's chat bubble, secondary surfaces. Softer than pure white — intentional.
- `white` (#ffffff) — default page background. Card surfaces.
- `error` (#b2291e) — inline error text only. Never used as a background.

**Semantic accents (strictly zoned — do not use outside the listed zones):**
- `sage` (#2B7A78) — active tab icon + label ONLY. Nowhere else in the UI.
- `income` (#1A9E6A) — income card amount text and My Books income figures ONLY.
- `income-bg` (#f0faf5) — category icon tint background on income cards ONLY.
- `amber` (#C97D1A) — My Books "Needs a look" badge count and "needs your eye" stat subcopy ONLY.
- `expense-bg` (#fdf8f0) — warm cream tint on expense cards ONLY.

**Category icon tints (icon stroke + icon background ONLY — never fills, never text):**
- `cat-tech` / `cat-tech-bg` — software, SaaS, subscriptions (blue family).
- `cat-food` / `cat-food-bg` — food, meals, coffee (orange family).
- `cat-travel` / `cat-travel-bg` — travel, transport (shares orange family with food).
- `cat-personal`, `cat-health`, `cat-office` / matching `-bg` — neutral ink tones.

**Never:**
- Third-party brand colors (no Google red, no Stripe purple, no Microsoft blue — ever).
- Emoji as UI color signals.
- Raw hex literals in JSX inline styles — always use `var(--token-name)`.

---

## Typography

Single typeface: **Inter**. Fallback stack: `-apple-system, SF Pro Text, Segoe UI, Helvetica, Arial, sans-serif`.

The type scale is fluid using `clamp()` — mobile sizes are the floor. On screens below 375px (none in the target user base) it defaults to the floor values.

Font weight tokens (never use raw numbers):
- `--fw-regular: 400` — body copy, data rows.
- `--fw-medium: 500` — secondary labels.
- `--fw-semibold: 600` — screen titles, section headers, card labels.
- `--fw-bold: 700` — primary numbers, card values, headlines.
- `--fw-extra: 800` — reserved for hero moments only.

Letter-spacing rules:
- Headlines and screen titles: `--ls-tight` (-0.028em).
- Secondary headings: `--ls-tighter` (-0.022em).
- Body: 0 (no modification).
- Eyebrow labels: `--ls-eyebrow` (0.12em) — all-caps, widely tracked.
- IRS line chips (monospace): 0.06em, always uppercase.

The `.eyebrow` CSS class encapsulates: 11px, semibold, 0.12em tracking, uppercase, `ink-4` color. Always use the class — never recreate it with inline styles.

---

## Layout

Mobile-first. Minimum viewport: **375px**. Every component renders correctly at this width.

Spacing tokens:
- `--pad-screen: 20px` — horizontal screen margin. Applied consistently.
- `--pad-card: 16px 20px` — internal card padding.
- `--gap-thread: 12px` — vertical gap between thread items.
- `--gap-section: 24px` — vertical gap between page sections.
- `--tap-min: 44px` — minimum tap target. Applied to all buttons, links, and `[role="button"]` elements.

Grid rules:
- Capture tiles: hero tile (full width) + 3-column secondary row. Never 4 equal columns at 375px.
- Custom day/time pickers: `grid-template-columns: repeat(4, 1fr)`. Never 7 equal flex buttons in a row.
- Stat cards in My Books: full-width Runway hero + 1fr 1fr two-column secondary. Never 3 equal columns.

The phone frame (`--phone-width: 375px`, `--phone-min-height: 720px`) uses `position: relative` — all overlays (sheets, toasts) use `position: absolute`, never `position: fixed`.

---

## Elevation & Depth

Three shadow levels only:
- `--shadow-phone` — the outer phone frame container.
- `--shadow-card` — subtle card lift (0 1px 2px at 4% opacity).
- `--shadow-card-hero` — hero card / active approval card (two-layer, 9% + 5% opacity).

Sheet backdrops: `rgba(10,10,10,0.18)` — not 0.4, not 0.35. This value is canonical.

---

## Shapes

Border radius tokens (never use raw numbers in JSX inline styles):
- `--r-card: 12px` — standard card corners.
- `--r-card-emph: 16px` — approval card, emphasis surfaces.
- `--r-sheet: 20px` — bottom sheet top corners (`20px 20px 0 0`).
- `--r-pill: 999px` — buttons, tags, badges, input fields.
- `--r-bubble-penny: 18px 18px 18px 4px` — Penny's chat bubble (flat bottom-left corner).
- `--r-bubble-user: 14px 14px 4px 14px` — user reply bubble (flat bottom-right corner).

Exceptions (no named token, document in comments):
- `8px` — icon container corners.
- `10px` — confirmed slug pill.

---

## Components

### Buttons
- **Primary:** `ink` fill, `white` text, pill radius (`--r-pill`), full width in mobile context.
- **Ghost:** transparent fill, `ink` border (1.5px), `ink` text, pill radius. Used for secondary actions.
- Never use colored fills on secondary buttons. The only fill color for a button is `ink` (primary) or transparent (ghost).

### Approval Cards
- **Expense card:** `white` background, `ink` border (1.5px), `ink` amount. Zero accent color.
- **Income card:** `ink` background, `white` text throughout. `income` color is NOT used on the income card — all elements invert to white. Income green applies only to amount text in the thread summary and My Books, not on the card itself.
- Penny's copy bubble sits above and is visually connected to the card.
- Active card shows a "NOW" label above it (9px, semibold, `ink-4`).
- Confirmed cards collapse to a paper pill slug — not a border-bottom row.

### Category Pills
- `white` background, `ink` border (1.5px), `ink` text.
- Icon inside: 11×11px with category tint stroke + tint background container.
- Size: 12px semibold uppercase, 5px 12px padding.

### Chat Bubbles
- Penny: `paper` background, asymmetric radius (`--r-bubble-penny`). Never a hard border box on the welcome screen.
- User: `ink` background, `white` text, asymmetric radius (`--r-bubble-user`).

### Provider Badges
- Always: `paper` background, `line` border, `ink-2` text/monogram, bold weight, 10px border-radius.
- Never: third-party brand colors. No Google red, no Microsoft blue.

### Sheets
- Top corners `20px 20px 0 0`, max-height 70–82% (% not vh), `rgba(10,10,10,0.18)` backdrop.
- Always rendered via `createPortal` targeting `#sheet-root`.
- Click inside sheet does not close it (`stopPropagation`). Click on backdrop closes it.

### Icons
- Inline SVG only. Stroke-based, `currentColor`, `strokeWidth: 1.5`, `strokeLinecap: round`, `strokeLinejoin: round`, `fill: none`.
- ViewBox: 22×22px standard. Icon containers: 32×32px, 8px corner radius, `paper` background.
- Active tab uses `sage`. All other icons use `ink` (inactive nav) or `ink-3` (de-emphasized).
- Never emoji as UI icons.

### Tab Bar
- Three tabs: Penny (chat bubble SVG) · Add (plus-circle SVG) · My Books (open book SVG).
- Active state: `sage` color. Inactive: `ink-3`.
- Hidden on: onboarding, pulling, avatar-menu, invoice, card standalone.

---

## Do's and Don'ts

**Do:**
- Use `var(--token-name)` for every color, font-weight, and border-radius in JSX inline styles.
- Use the `.eyebrow` CSS class for section headers — never inline recreation.
- Keep `position: relative` on `.phone` and `position: absolute` on all overlays.
- Use American English everywhere — `categorized`, `organized`, `recognized`, `canceled`, `color`.
- Confirm, explain, categorize — in that order — for every approval card.

**Don't:**
- Use `position: fixed` anywhere in the demo (it escapes the phone frame).
- Use raw hex literals, raw font-weight numbers, or raw border-radius numbers in JSX.
- Use third-party brand colors for provider badges or integrations.
- Use `vh` for sheet max-height (use `%` — `vh` overflows the phone frame on desktop).
- Use `😊 👍 ✅ ⚠️` anywhere. Approved emoji: `🎉 👋 ✓ 💪` only.
- Use "You have N items to review" — shame-free re-entry is a hard rule.
- Add `maximum-scale=1` to the viewport meta tag (accessibility violation).
- Use `import.meta.env.BASE_URL` in fetch calls — use `window.PENNY_CONFIG?.baseUrl || "/"`.
