# Penny — Design System
*The canonical visual reference for Penny (mobile + web). This is the **app-level extension of the FounderFirst.one website design tokens** — one brand, one visual system. If something contradicts this document, this document wins.*

*Last updated: 23 April 2026 (v2.2 — color system pass: semantic accent colors added, icon system documented, color zone rules locked).*

---

## Relationship to FounderFirst.one

FounderFirst.one is the marketing site. Penny is the product. They share one visual system so that a user landing on FounderFirst.one, signing up, and opening the app never feels like they changed companies.

**Source of truth for tokens:** `../../index.html` (the FounderFirst.one landing). The demo implementation lives in `BookKeeping/demo/styles/tokens.css` and `BookKeeping/demo/styles/components.css` — those files are the reference implementation of this document.

**This document:**
- Adopts FF.one tokens verbatim (colors, typography scale, core components).
- Adds app-only primitives (phone shell, tab bar, approval card, bottom sheets, capture flows) that don't exist on the marketing site.
- Never overrides a FF.one token silently — if an app component needs something not in the website, it's documented here as an extension.

---

## Core Principles

1. **Conversation is the product.** Every screen is either a thread, a moment inside one, or a way to get back to one.
2. **AI does the work. Owner confirms.** Penny categorizes, flags, and narrates. The user approves or corrects — one tap at a time.
3. **No accounting language.** No jargon on screen, ever. The language is plain, direct, and human.
4. **Mobile is the primary surface.** Every layout is designed for 375px first. Nothing exists that doesn't work on a phone.
5. **Ink on paper with purposeful accents.** The foundation is monochrome. Three accent colors exist for semantic meaning only — sage (active nav), income green (money in), amber (attention needed). Color never decorates; it only signals.

---

## Color Tokens

### Foundation (from FounderFirst.one — unchanged)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0a0a0a` | Primary text, primary buttons, filled marks, dark-section background |
| `--ink-2` | `#2a2a2a` | Secondary text, body copy on light backgrounds |
| `--ink-3` | `#5a5a5a` | Supporting text, captions, secondary labels |
| `--ink-4` | `#8a8a8a` | De-emphasized text, placeholders, metadata |
| `--line` | `#e8e8e5` | Card borders, dividers, rule lines |
| `--line-2` | `#f0f0ed` | Subtle inline dividers, row separators |
| `--paper` | `#f6f6f4` | Warm off-white section backgrounds, card-alt surfaces |
| `--white` | `#ffffff` | Default page background, card-primary surfaces |
| `--dark` | `#0a0a0a` | Dark section background (same hex as `--ink`, semantic alias) |
| `--error` | `#b2291e` | Inline error text only — never as a background block |

### Semantic Accent Colors (app extension — v2.2)

| Token | Hex | Permitted zones only |
|---|---|---|
| `--sage` | `#2B7A78` | Active tab icon + label. Nowhere else in the app. |
| `--income` | `#1A9E6A` | Income amount text on approval cards + income figures in My Books |
| `--income-bg` | `#f0faf5` | Income category icon tint background only |
| `--amber` | `#C97D1A` | My Books "Needs a look" badge count + stat subcopy ("needs your eye") |

### Category Icon Tint Colors (icon backgrounds + strokes only — never card fills)

| Token | Hex | Category |
|---|---|---|
| `--cat-tech` | `#4A6FA5` | Software / SaaS / subscriptions |
| `--cat-food` | `#C4702A` | Food / meals / coffee |
| `--cat-travel` | `#C4702A` | Travel / transport (shares orange family with food) |
| `--cat-personal` | `#9C4A6B` | Personal / other |
| `--cat-health` | `#4A8C5C` | Health / wellness |
| `--cat-office` | `#2B7A78` | Office / supplies (shares sage) |

**Color zone rules — strictly enforced:**
- The chat thread is **monochrome ink on paper** except the income amount (`--income` on `+$X` text only).
- Expense cards: white background, ink border, ink amount. No color anywhere on an expense card.
- Income cards: white background, ink border. **Only the amount text** uses `--income`. Category pill, confidence bar, and Confirm button all stay ink.
- `--sage` appears in exactly one place: the active tab icon + label.
- `--amber` appears in exactly one place: the My Books "Needs a look" badge.
- Category tint colors appear only on icon backgrounds (not card backgrounds, not text, not borders).
- Never use accent colors as card backgrounds. Never use them on buttons.

---

## Typography

**Primary font family:** Inter (400, 500, 600, 700, 800 weights).
- Web: `'Inter', Helvetica, 'Helvetica Neue', Arial, sans-serif`
- Native iOS: `-apple-system, 'SF Pro Text', 'Segoe UI', sans-serif` (SF Pro has the right feel; Inter if we want literal parity — product decision later).

**Fluid type scale (use `clamp()` on web):**

| Role | Size | Weight | Letter-spacing | Color |
|---|---|---|---|---|
| H1 — hero | `clamp(36px, 5.5vw, 64px)` | 700 | -0.028em | `--ink` |
| H2 — section | `clamp(26px, 3.8vw, 44px)` | 700 | -0.022em | `--ink` |
| H3 — card / subsection | `clamp(17px, 2vw, 21px)` | 600 | -0.01em | `--ink` |
| Body | `clamp(15px, 1.6vw, 17px)` | 400 | 0 | `--ink-2` |
| Card value (amount, metric) | `clamp(30px, 4vw, 46px)` | 700 | -0.03em | `--ink` |
| Screen title (mobile nav) | 17px | 600 | -0.01em | `--ink` |
| Eyebrow / micro label | 11px | 600 | 0.12em uppercase | `--ink-3` |
| Tiny label (source, timestamp) | 10px | 600 | 0.1em uppercase | `--ink-4` |

---

## Components

### FF wordmark and logo mark

From FF.one (`.ff-mark`): dark square (`--ink` background, `--white` letters "FF") — used only in nav/footer to tie app back to FounderFirst brand.

- `ff-mark-sm`: 22×22px, 10px letter
- `ff-mark-md`: 28×28px, 13px letter

### Penny avatar (P-mark) — replaces the dashed lo-fi avatar

From FF.one (`.p-mark`): solid circle, `--ink` background, `--white` italic serif "P" (Georgia font). This is the **only** Penny avatar used in product and marketing. The old dashed lo-fi avatar is retired.

**Font:** Georgia, serif, italic, bold. 1px optical bottom padding to compensate for serif descender weight.

| Size | Dimensions | Font size |
|---|---|---|
| `p-mark-sm` | 30×30px | 13px |
| `p-mark-md` | 40×40px | 17px |
| `p-mark-lg` | 56×56px | 24px |
| `p-mark-xl` | 96×96px | 40px |

**`p-mark--online` modifier** — used on the thread header mark only. Adds an 8×8px pulsing dot (bottom-right) using `::after`: white fill, `--ink` border, `pulse-dot` animation (2.4s, scale 1→0.8, opacity 1→0.5). Signals Penny is actively watching accounts.

Inverted variant `p-mark-inv` on dark backgrounds: `--white` background, `--ink` letter.

### Chat bubble — Penny (from FF.one `.penny-bubble`)

```css
.penny-bubble {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: 18px 18px 18px 4px;   /* asymmetric — bottom-left tucked */
  padding: 16px 20px;
}
.penny-bubble .bubble-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-4);
  margin-bottom: 6px;
}
.penny-bubble .bubble-msg {
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink);
}
```

Rules:
- First bubble in a group: P-mark `p-mark-sm` to the left + `PENNY` label (eyebrow style).
- Subsequent bubbles in same group: avatar hidden, label hidden. Bubble sits flush to prior.
- One idea per bubble. Never two unrelated thoughts.

### Chat bubble — User

```css
.user-bubble {
  background: var(--ink);
  color: var(--white);
  border-radius: 14px 14px 4px 14px;   /* mirrored — bottom-right tucked */
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.45;
  align-self: flex-end;
  max-width: 78%;
}
```

Voice entries prefix with `🎙️`. Manual notes prefix with `✏️`. No avatar for user bubbles.

### Check-list inside a Penny bubble (from FF.one)

```css
.check-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);   /* dashed separator — the only place dashes appear */
}
.check-icon {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--white);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700;
}
```

### Buttons — pill shape (from FF.one `.btn`)

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px;
  padding: 12px 22px;
  border-radius: 999px;           /* pill */
  background: var(--ink);
  color: var(--white);
  font-weight: 500; font-size: 14px;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.btn:hover { opacity: 0.82; }
.btn-ghost       { background: transparent; color: var(--ink); border: 1.5px solid var(--ink); }
.btn-white       { background: var(--white); color: var(--ink); }
.btn-ghost-white { background: transparent; color: var(--white); border: 1.5px solid rgba(255,255,255,0.55); }
.btn-sm          { padding: 8px 14px; font-size: 12px; }
```

**Mobile full-width CTA (app extension):**
- `padding: 16px 22px; font-weight: 600; font-size: 15px; letter-spacing: -0.01em; width: 100%`.
- Height ~50pt. Semibold weight (600) — not medium — for CTA presence.
- Destructive actions do **not** use a different color — they use `.btn-ghost` with copy like "Delete my account" plus a confirm step.

### Cards — general

```css
.card {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px 20px;
}
.card-emphasis {
  border: 1.5px solid var(--ink);   /* used for diagram cards, lead stats */
  border-radius: 16px;
}
.card-paper {
  background: var(--paper);         /* used inside dark-section inverts and for sub-cards */
}
```

### Approval card — hero treatment (app extension)

The approval card is the **most important element in the app**. It must feel heavier than surrounding chat bubbles.

```css
.approval-card {
  background: var(--white);
  border: 1.5px solid var(--ink);      /* full ink border — not --line */
  border-radius: 16px;                 /* --r-card-emph */
  padding: 24px;
  gap: 16px;
  box-shadow: var(--shadow-card-hero); /* 0 4px 16px rgba(10,10,10,0.09) + 0 1px 3px */
}
```

**Income variant (`.approval-card--income`):** full `--ink` background. Text adapts to white. Vendor icon uses `rgba(255,255,255,0.12)` background. Amount uses `var(--white)`. Category pill uses `rgba(255,255,255,0.15)` background. Confirm button inverts to white-on-dark (`.btn` becomes `background: white; color: ink`). Change button uses ghost-white treatment.

**Category pill:** 12px, semibold, uppercase, 0.01em tracking — not just a label, it reads as a tag.

**Confidence bar fill:** `--ink` (not `--ink-3`). Conviction, not uncertainty.

**Confidence label:** 11px, semibold, uppercase, 0.04em tracking. Same eyebrow pattern.

**Thread zone separator:** In the thread list, `.approval-card-wrap::before` renders "NOW" (9px, semibold, 0.14em tracking, `--ink-4`) above the card to create a visual break between the chat context zone and the action zone.

**Confirmed slug:** When a card is approved, it collapses to a pill row (`background: var(--paper)`, `border-radius: 10px`, `padding: 11px 14px`). Vendor is `--ink-3` medium, amount is `--ink-3` semibold, checkmark is `--ink-3` bold. Not faded text — clearly "done", not "forgotten".

### Stat card hierarchy — My Books

**Cash Runway is always the lead stat.** It occupies a full-width dark hero card (ink background, white text, 38px bold number). Net and Books are secondary in a 2-column row below it. This hierarchy is locked — never return to 3-equal columns.

```
┌─────────────────────────────┐
│  CASH RUNWAY         94 days│  ← full width, --ink background
└─────────────────────────────┘
┌────────────┐ ┌─────────────┐
│  NET       │ │  BOOKS      │  ← 2-column, standard .card
│  $5,860    │ │  3          │
└────────────┘ └─────────────┘
```

### Capture tile — hero pattern (Add tab)

"Just tell me" (free-text AI capture) is always the **primary capture action** — rendered as a full-width hero tile with ink border, label + subtitle. Photo, Voice, Upload are secondary in a 3-column row below it. Never use an equal 4-column grid for capture tiles.

```
┌───────────────────────────────────────┐
│  [icon]  Just tell me                 │  ← full width, ink border
│          Describe a transaction…      │
└───────────────────────────────────────┘
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Photo   │  │  Voice   │  │  Upload  │  ← 3-col secondary
└──────────┘  └──────────┘  └──────────┘
```

### Welcome screen brand moment

The welcome screen must preview the product before the user starts onboarding. After the headline and subcopy, render 2–3 `.ob-preview-item` transaction pills (staggered slide-up, 150ms intervals). The first item is the income dark variant. This communicates: "Penny watches and logs — here's what that looks like."

Caption below the preview: "Penny watches these automatically."

Never use this preview as interactive — it is static, decorative, and communicates value. No tap handlers.

### Shadow tokens

```css
--shadow-card:       0 1px 2px rgba(10,10,10,0.04);       /* default card */
--shadow-card-hero:  0 4px 16px rgba(10,10,10,0.09),
                     0 1px 3px rgba(10,10,10,0.05);        /* approval card */
--shadow-phone:      0 8px 32px rgba(10,10,10,0.12);       /* phone mockup */
```

### Eyebrow label (from FF.one)

```css
.eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}
```

### Input — waitlist pill (from FF.one, app extension for "Ask Penny" bar)

Web and mobile input bars follow the same pill shape:

```css
.input-pill {
  display: flex; align-items: center;
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  overflow: hidden;
  background: var(--white);
}
.input-pill input {
  flex: 1; border: 0; outline: 0;
  padding: 13px 18px;
  font-size: 16px;       /* 16px prevents iOS zoom-on-focus */
  background: transparent;
  color: var(--ink);
}
.input-pill button[type="submit"] {
  margin: 4px;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--white);
  font-size: 13px; font-weight: 500;
}
```

App-only variant — "Ask Penny" bar on the thread (smaller inset):

```css
.ask-bar {
  border: 1.5px solid var(--ink);
  border-radius: 999px;
  padding: 6px 11px;
  background: var(--paper);    /* warm off-white so the bar reads as always-available */
  display: flex; align-items: center; gap: 7px;
}
.ask-bar-text { flex: 1; font-size: 14px; color: var(--ink-3); }
.ask-bar-btn  {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--ink); color: var(--white);
  display: flex; align-items: center; justify-content: center;
}
```

### Toast — undo / confirm (from FF.one `.toast`)

```css
.toast {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: var(--white);
  padding: 12px 20px; border-radius: 999px;
  font-size: 13px; font-weight: 500;
}
```

5-second visible duration. Non-modal. Used for every approval confirm, category change, and destructive action (with undo link inside).

### Bottom sheets (app extension)

```css
.sheet {
  background: var(--white);
  border-radius: 20px 20px 0 0;
}
.sheet-handle {
  width: 36px; height: 4px;
  background: var(--line);
  border-radius: 2px;
  margin: 10px auto 16px;
}
.sheet-cancel {
  margin: 12px 16px 0;
  height: 46px;
  background: var(--paper);
  border-radius: 999px;       /* pill, matching FF.one */
  color: var(--ink-3);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px;
}
```

Rules:
- Every sheet has a drag handle at top.
- Every sheet has an explicit Cancel button at bottom.
- Scrim: `rgba(10,10,10,0.18)` (was `rgba(0,0,0,0.18)` — adjusted to match ink).
- Tapping the scrim dismisses.

### Step dot (from FF.one snapshots rail)

Numeric step indicators use FF.one's style:

```css
.step-dot {
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 16px;
}
.step-dot.filled { background: var(--ink); color: var(--white); }
.step-dot.hollow { background: var(--paper); color: var(--ink); }
```

---

## Phone shell (app extension — not on FF.one)

```css
.phone {
  width: 375px;
  min-height: 720px;
  background: var(--white);
  border-radius: 44px;
  border: 2.5px solid var(--ink);   /* was #BDBDBD — now ink for brand alignment */
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 32px rgba(10,10,10,0.12);
}
```

### Structure (top to bottom, every app screen)

```
Status bar
Nav header (or onboarding header)
─── content area (flex: 1) ───
Ask Penny bar   (main app only)
Tab bar         (main app only)
Home indicator
```

---

## Tab bar (app extension)

**Three tabs only.** Always visible, always in order. Connect functionality merged into Add. Profile / Memory / Preferences live behind the avatar menu (⋮ in the thread header), not a tab.

| # | Label | Trigger |
|---|---|---|
| 1 | Penny | Conversation thread (home) |
| 2 | Add | Capture + integrations + data actions |
| 3 | My Books | Financial summary |

Add is a **native tab with a label** — not a floating action button.

```css
/* Active tab */
.tab-icon.active  { background: var(--ink); }
.tab-label.active { color: var(--ink); font-weight: 600; }

/* Inactive tab */
.tab-icon  { background: var(--line); }
.tab-label { color: var(--ink-4); font-weight: 400; }
```

Tab icon: 22–24pt. Label: 10pt. Gap icon-to-label: 3pt. Add is a **native tab with a label**, not a floating action button.

---

## Copy & Language

### American English throughout

`categorized` · `recognized` · `canceled` · `color` · `customized` · `organized` · `behavioral` · `analyze` — no British spellings anywhere. This applies to every doc in the product folder, including wireframing specs, tone guide, and app spec.

### Penny's voice rules (summary — full reference in `../product/tone-guide.md`)

- Short sentences. One idea per bubble.
- Lead with the answer, not the context.
- Name the number — "That puts you at $8,200 for April," not "you have received some income."
- Close every loop. After every action, Penny confirms and gives one useful next piece of information.
- No jargon. Schedule C exists; Alex never sees those words.

### Emoji guide

| Moment | Mark |
|---|---|
| Payment received / income | 🎉 |
| Positive trend / growth | 💪 |
| Greeting / first hello | 👋 |
| Confirmed / done | `✓` (text character, not emoji) |
| Something flagged | No emoji — plain language only |

**Never use:** 😊 👍 ✅ ⚠️

---

## Spacing & sizing

| Element | Value |
|---|---|
| Phone width | 375px min |
| Page max (web) | 1080px (FF.one) / 1200px (app dense pages) |
| Horizontal page padding (web) | `clamp(24px, 6vw, 80px)` |
| Section vertical padding (web) | 72px |
| Screen horizontal padding (mobile) | 20–24px |
| Card radius — standard | 12px |
| Card radius — emphasis | 16–20px |
| Button radius | 999px (pill) everywhere |
| Bubble radius | `18px 18px 18px 4px` (Penny) / `14px 14px 4px 14px` (User) |
| Penny avatar (thread) | 28px (`p-mark-sm`) |
| Tab icon | 22–24px |
| Home indicator | 120px × 4px, `--ink` at 18% opacity, 14px bottom margin |
| Gap between items in thread | 10–12px |
| Card internal gap | 10–12px |
| Section gap (stacked) | 24px |

---

## Accessibility

- Tap targets ≥ 44×44pt
- Dynamic type supported (min 14pt, max 21pt body)
- Focus ring: 2px solid `--ink`, 3px offset, pill-corner matched
- VoiceOver labels on every interactive element
- Colour never the sole signal — always paired with icon or text

---

## Responsive breakpoints (web)

| Breakpoint | Rule |
|---|---|
| `sm` ≥ 640px | Single column collapse for multi-col blocks (`.meet-penny-inner`, `.promise-grid`, `.snap-rail`, `.steps-grid` all collapse at `≤860px` per FF.one) |
| `md` ≥ 768px | Mobile-web essentially mirrors native mobile layout |
| `lg` ≥ 1024px | Right Penny rail collapsed; two-pane P&L available |
| `xl` ≥ 1280px | Full three-pane (left nav, main, right Penny rail) |

---

## Icon System (app extension — v2.2)

**Standard:** All icons use inline SVG with these properties locked:
- `stroke-width: 1.5`
- `stroke-linecap: round`
- `stroke-linejoin: round`
- `fill: none`
- `viewBox: "0 0 24 24"`
- Size: 22×22px in tab bar, 20×20px in cards/pills, 16×16px inline

**Never** mix stroke weights (no 1.8, no 2px). **Never** use emoji as icons anywhere in the UI.

**Color rules for icons:**

| Context | Icon color |
|---|---|
| Active tab (Penny tab only) | `--sage` (`#2B7A78`) |
| Inactive tab | `--ink-4` (`#8a8a8a`) |
| Category icon — software | `--cat-tech` on `#eef2f8` tint background |
| Category icon — food/travel | `--cat-food` on `#f5eee8` tint background |
| Category icon — income | `--income` on `--income-bg` tint background |
| Category icon — personal | `--cat-personal` on `#f7eef3` tint background |
| All other icons | `--ink` or `--ink-3` |

**Category pills** include an icon + label. The icon sits left of the text at 11×11px. The pill itself stays monochrome (`--line` border, `--ink-3` text) — the icon is the only colored element inside it.

## What's retired / removed

These tokens and components are **no longer in use**. References in docs or code should be swept.

| Retired | Replaced by |
|---|---|
| Deep Ocean `#0066CC` primary | `--ink` `#0a0a0a` |
| `#FAFAFA` card/sheet background | `--paper` `#f6f6f4` |
| Dashed lo-fi Penny avatar (`#BDBDBD` dashed border + `#E0E0E0` fill) | Solid `.p-mark` (ink circle, white "P") |
| `#111` as primary ink | `--ink` `#0a0a0a` (subtle deepening) |
| `#222` as primary button fill | `--ink` `#0a0a0a` |
| `#F4F4F4` input background | `--paper` `#f6f6f4` (or `--white` with ink border) |
| `#E0E0E0` default border | `--line` `#e8e8e5` |
| System font stack as primary on web | Inter as primary; system stack fallback |
| Flat rectangular buttons | Pill buttons (`border-radius: 999px`) |
| Squared chat bubbles | Asymmetric rounded (`18 18 18 4` / `14 14 4 14`) |

---

## References

- `../../index.html` — FounderFirst.one source of truth for tokens
- `../product/tone-guide.md` — Voice, copy rules, conversation patterns
- `../product/solopreneurs/17-mobile-screens-and-flows.md` — Mobile screens, using these tokens
- `../product/solopreneurs/18-web-screens-and-flows.md` — Web screens, using these tokens
- `../product/solopreneurs/02-principles-and-voice.md` — Governing philosophy

---

*v2.1 · 23 April 2026. Brand design pass: approval card hero treatment (dark income variant, hero shadow, ink confidence bar, semibold buttons), thread hierarchy (NOW zone separator, confirmed slug pill, ask bar pill wrapper), P-mark refinement (new sizes + online pulse indicator), Add tab hero tile pattern ("Just tell me" as primary capture), My Books stat hierarchy (Runway as full-width dark leader), welcome screen brand moment (animated transaction preview). Previous v2.0 retired Deep Ocean palette and lo-fi avatar.*
