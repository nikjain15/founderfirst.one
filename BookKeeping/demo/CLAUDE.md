# CLAUDE.md — Penny Demo Builder's Map

*Read this first. It tells you what to build, what to read, and what not to touch.*

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

---

## How you build each screen

**One Claude Code session = one screen.** Do not try to build everything at once.

For each screen, read exactly these four files, no more:

1. `CLAUDE.md` (this file)
2. `styles/tokens.css` — the design tokens
3. `public/prompts/penny-system.md` — the voice core
4. `screen-briefs/0X-{screen}.md` — the scoped spec for the screen you are building

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
| `public/prompts/books-qa.md` | `screens/books.jsx` | `books.qa` |
| `public/prompts/capture-parse.md` | `screens/add.jsx` | `capture.parse` |

**Rule:** edit `penny-system.md` only for voice, brand, or output-format changes that must apply everywhere. Prefer overlay prompts for screen-specific behaviour.

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

**Bottom sheet animation — canonical implementation**
- Only one `.sheet-backdrop` and `.sheet` definition exists in `components.css` (the one under `/* --- Bottom sheet ---*/`). The earlier duplicate block was removed April 2026 because it caused a CSS cascade conflict where `position: absolute` + `transform: translateX(-50%)` from the first block fought with the `slide-up` keyframe from the second, causing the sheet to snap on animation end.
- `.sheet-backdrop`: `position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; animation: fade-in`. The backdrop is the flex container — the sheet is its child.
- `.sheet`: no `position: absolute`. It sits at the bottom naturally as a flex child. Uses `animation: sheet-slide-up 0.3s var(--ease-out) both`.
- `@keyframes sheet-slide-up`: `from { transform: translateY(100%); opacity: 0; }`. Never use `translateX` in sheet keyframes.
- Do not re-add a `position: absolute` or `transform: translateX(-50%)` to `.sheet` — this breaks the animation.

**Voice recording modal (`VoiceModal` in `screens/add.jsx`)**
- Shows a 28-bar animated waveform during recording. Bars are defined by the `BARS` array (seeded heights for organic, stable look). Each bar uses `animation: voiceBar` with staggered delays and varying durations.
- `@keyframes voiceBar`: `from { transform: scaleY(0.15) } to { transform: scaleY(1) }`. Applied on each bar independently.
- Dark overlay: `rgba(10,10,10,0.92)`. Mic circle: 72×72px white circle. Pulse rings: 2 rings with `pulseRing` keyframe.
- Auto-stops at 4 seconds and transitions to "Got it — reading now…" state while the AI parse runs.
- Do not revert to a plain pulsing-ring-only modal — the waveform is required for realism.

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
| Amber | `--amber` | My Books "Needs a look" badge count · "needs your eye" stat subcopy | Thread, cards, buttons |
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

## What to ask me (the CEO) before proceeding

Before starting any screen, confirm:
- The brief is unambiguous to you
- No other file needs to change
- You understand the AI voice integration for that screen

If any of the above is unclear, stop and ask.

---

## References (read-only, do not modify)

- `../product/02-principles-and-voice.md` — canonical voice rules
- `../product/19-demo-flow-brief.md` — full demo flow brief (source of all screen-briefs)
- `../product/17-mobile-screens-and-flows.md` — mobile screens spec
- `../design/design-system.md` v2.1 — design system (tokens already in `styles/tokens.css`)
- `../penny-system-prompt.md` — production Penny system prompt (base for `prompts/penny-system.md`)

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

*23 April 2026 — UX & tone pass (v2.4):*
- *Settled decision #2 updated: onboarding Penny copy is now static (`FALLBACK_COPY` in `screens/onboarding.jsx`), not AI-generated. Rationale: AI responses were inconsistent across loads and broke tone. `ai.renderPenny` calls removed from all onboarding steps.*
- *Approved onboarding copy table added to CLAUDE.md (locked — do not change without sign-off).*
- *Screen transition standard added: `screen-enter` animation on all `.phone-content` mounts.*
- *Bottom sheet canonical implementation documented: duplicate CSS block removed, flex-child positioning, `sheet-slide-up` keyframe.*
- *Thread intro → main transition: `.thread-main-enter` wrapper with fade-in documented.*
- *Voice recording modal standard documented: 28-bar waveform, `voiceBar` keyframe, `BARS` seeded array.*
- *Penny bubble copy tone guide expanded with good/bad examples and banned phrases.*
