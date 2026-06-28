# @ff/design-system

Single source of truth for FounderFirst's **brand + design tokens + reusable CSS
components**. Edit the look once here → every surface (marketing, blog, admin,
Penny bubble) updates. `tokens.css` is canonical; never hardcode colour, px, or
font-size anywhere else.

Consumed by: `apps/web` (Astro marketing + blog), `apps/admin`,
`site-bubble` (Penny).

---

## Brand

FounderFirst feels **calm, trustworthy, and founder-first** — warm and editorial,
not corporate-SaaS. The system pairs a serif display face with a soft cream field
and a single confident green.

### Palette (tokens in `tokens.css`)

| Role | Token | Value | Use |
|------|-------|-------|-----|
| Ink | `--ink` | `#28323f` navy-slate | Primary text; dark/inverse section backgrounds (`--dark`) |
| Paper | `--paper` | `#f4f1e9` warm cream | The primary page field (body background) |
| White | `--white` | `#ffffff` | Cards sitting on the cream |
| **Brand** | `--brand` | `#32854c` emerald green | Primary CTAs, accents, the Penny mark, active nav. Hover `--brand-hover`, fills `--brand-soft` / `--brand-tint`. Admin inherits this via `--sage` (no admin edits needed) |
| Line | `--line` | `#e6e0d3` warm | Hairline borders |
| Semantic | `--income` / `--amber` / `--error` | — | **Meaning only** (success / warning / error), never decoration |

Ink steps `--ink-2/3/4` derive muted navy greys. Inverse (dark) sections use
`--dark` (navy, **not** black).

### Type

| Role | Token | Face |
|------|-------|------|
| Display | `--font-display` | **Fraunces** (serif) — headings `h1`–`h3` |
| Body / UI | `--font-sans` | **Inter** |
| Mono | `--font-mono` | code, ids, payloads |

Three type scales, single-sourced — **never inline a font-size:**
- **Marketing display** `--fs-display-1/2/3` (`40 / 34 / 24px` fluid) — public pages
  (marketing, blog, compare, confirmed). Staging-aligned; this is the standard for
  any new public page heading.
- **Billboard** `--fs-h1/2/3` — oversized hero type; shared with some admin headers.
- **App/UI** `--fs-ui` / `--fs-label` / `--fs-kpi` — dense admin surfaces.

---

## Section & layout patterns (the standard for any new page)

Replicate these so every surface feels like one system:

- **Background rhythm** — alternate cream (`--paper`) and dark (`--dark`) bands;
  never two dark bands touching. White cards (`--white`) sit on cream.
- **Alignment** — hero + dark "statement" bands are **centred**; content sections
  (features, showcase, trust, FAQ, compare) are **left-aligned**.
- **Buttons** — pills (`--r-pill`), brand-green primary (`button.css`), `≥44px` tall.
- **Cards** — `--white` bg, `--bw-hair` `--line` border, `--r-card-emph` radius,
  `--shadow-float`; brand-tinted variant uses `--brand-tint` + `--brand-soft` border.
- **Eyebrows** — `--fs-eyebrow`, uppercase, `--ls-eyebrow`; brand-coloured when it
  labels a feature.
- **Section padding** — `--section-y` block, `--page-pad-x` inline, content capped
  at `--page-max` (1080px).

---

## What we keep vs what's new (brand refresh, Jun 2026)

**New** — defines the current brand:
- Fraunces serif **display headings** (previously Inter-only; serif was avatar-only).
- **Cream / emerald-green / navy-slate** palette (previously near-black / white / grey).
- **Green** (`#32854c`, staging-aligned) primary CTAs and Penny mark (previously ink/black).
- **Marketing display type scale** `--fs-display-1/2/3` + standardized section/card
  patterns (above) — applied across marketing, blog, and compare.

**Kept** — carried forward unchanged, still on-brand:
- Penny **`p-mark`** + **`penny-bubble`** identity.
- The interactive **Try Penny** demo (business-owner / CPA toggle + phone frame).
- The **"scattered → one view"** comparison device.
- **Pill** buttons, the spacing/density scale, radii, and soft float shadows (`--shadow-float`).
- The **responsive standard** — the 320→1920 width ladder in `apps/admin/RESPONSIVE.md`.

---

## Components

`tokens.css` · `components/reset.css` (native-control + box-sizing reset — import
first) · `typography.css` · `ff-mark.css` · `p-mark.css` · `penny-bubble.css` ·
`button.css` (pill, brand-green primary) · `waitlist-form.css`.

```ts
import "@ff/design-system/tokens.css";
import "@ff/design-system/components/reset.css";
import "@ff/design-system/components/typography.css";
```

## Rules

- **Never redeclare tokens** (`--ink`, `--brand`, `--paper`, `--r-pill`…) in app
  stylesheets — edit them here.
- **Never inline a hex, a magic px, or a one-off font-size.** Reach for a token.
- **Never copy a component** out of this package — add a modifier class here instead.
- **Semantic colours encode meaning only** (success/warning/error), never decoration.
- App-specific layout/section spacing lives in the app; brand primitives live here.
