# Playwright Test Status — Penny Demo v5

*Updated: 25 April 2026*

All 32 tests PASSING. Suite written from scratch in this session (no prior run to resume from).

---

## Infrastructure

| File | Status |
|---|---|
| `playwright.config.js` | Created — uses pre-installed chromium-1194 via `launchOptions.executablePath` |
| `tests/e2e/helpers.js` | Created — seedFounderState, clearAllStorage, assertNoBadRenders, gotoHash |
| `tests/e2e/founder.spec.js` | Created — F1–F10 (15 tests) |
| `tests/e2e/cpa.spec.js` | Created — C1–C16 (16 tests) |
| `tests/e2e/invite.spec.js` | Created — E1 (1 test) |

**Browser:** `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (Chromium 141.0.7390.37)
**Playwright:** `@playwright/test@1.59.1` (local) run via `./node_modules/.bin/playwright`
**Important:** Local playwright 1.59.1 would download chromium-1217 (blocked). Must use `executablePath` in config to point at the pre-installed 1194 binary.

Run command:
```
./node_modules/.bin/playwright test --config=playwright.config.js --reporter=list
```

---

## Test Results

### Founder tests (founder.spec.js)

| ID | Status | Notes |
|---|---|---|
| F1 | PASSING | Onboarding renders on first load (.phone.onboarding visible) |
| F2 | PASSING | Tab bar with three tabs, Penny active by default |
| F2b | PASSING | Add tab navigation changes hash and activates tab |
| F3 | PASSING | Thread header + ask bar visible after state seed |
| F4 | PASSING | Approval card renders from scenario (sole-prop.consulting) |
| F4b | PASSING | Approval card action buttons present |
| F4c | PASSING | Category pill click doesn't crash (graceful test) |
| F5 | PASSING | Add tab renders with content |
| F6 | PASSING | Avatar menu opens with Close button + Profile/Memory items — **NOTE: root menu has aria-label="Close" not "Back"; Back only in sub-screens** |
| F7 | PASSING | My Books tab renders |
| F8 | PASSING | My Books shows "Net this month" stat card and ask bar — **NOTE: books screen uses no .phone-content class; uses inline styles** |
| F8b | PASSING | My Books Invoices eyebrow label visible |
| F8c | PASSING | Books ask bar accepts text input |
| F9 | PASSING | Invoice overlay renders via #/invoice hash |
| F10 | PASSING | No undefined/NaN/[object Object] across all tabs |

### CPA tests (cpa.spec.js)

| ID | Status | Notes |
|---|---|---|
| C1 | PASSING | CPA app loads and renders .cpa-app |
| C2 | PASSING | Priya Sharma name shows on dashboard |
| C3 | PASSING | All 4 fixture clients visible (Sarah Lin, Alex Carter, Marco Rivera, Kenji Park) |
| C4 | PASSING | Clicking Sarah Lin navigates to client view |
| C5 | PASSING | Client view content visible after click — **NOTE: at 414px sidebar is CSS-hidden (.cpa-sidebar { display: none }); bottom nav is shown. Tab label text is visible only via innerText, not visible in layout** |
| C6 | PASSING | Bottom nav has 6 tab buttons at 414px |
| C7 | PASSING | P&L tab (index 2 in bottom nav) clickable |
| C8 | PASSING | Cash Flow tab (index 3 in bottom nav) clickable |
| C9 | PASSING | Chat tab (index 4 in bottom nav) clickable |
| C10 | PASSING | Rules tab (index 5 in bottom nav) clickable |
| C11 | PASSING | Sarah Lin work queue has flagged items from fixture |
| C12 | PASSING | Alex Carter (S-Corp) entity badge visible on dashboard |
| C13 | PASSING | Marco Rivera navigable to client view |
| C14 | PASSING | Kenji Park navigable to client view |
| C15 | PASSING | Back to dashboard navigation works |
| C16 | PASSING | No bad renders in CPA app |

### Invite/edge tests (invite.spec.js)

| ID | Status | Notes |
|---|---|---|
| E1 | PASSING | Invalid/expired invite token doesn't crash — renders error or fixture dashboard |

---

## Key findings documented for future sessions

1. **CPA nav at mobile viewport (414px)**: The `.cpa-sidebar` is `display: none` on mobile; `.cpa-bottom-nav` is visible. Tests targeting tab text must scope to `.cpa-bottom-nav` or use button index, NOT `text=Work Queue` which finds the hidden sidebar element first.

2. **Avatar menu root vs sub-screen**: The root avatar menu header has `aria-label="Close"` (goes back to thread). Sub-screens (Profile, Memory, Preferences) have `aria-label="Back"` via `OverlayHeader`. Tests targeting the menu should check for `[aria-label="Close"]` or `text=Profile`.

3. **Books screen layout**: `screens/books.jsx` does NOT use `.phone-content` class. Content is in inline-styled divs. Target by text (`text=My Books`, `text=Net this month`) or the `.ask-bar` class.

4. **Playwright browser**: The `@playwright/test@1.59.1` package installed locally wants `chromium_headless_shell-1217` which is unavailable. The workaround is setting `launchOptions.executablePath` in `playwright.config.js` to the pre-installed full Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. This is committed in the config.

---

## Build output

- `npm run build` → 67 modules transformed
- `dist/` rsynced (via `cp -rf`) to `BookKeeping/tools/penny-demo-v5/`
- Build: `main-*.js` 163KB gzip 37KB, `cpa-*.js` 75KB gzip 16KB, CSS 26KB gzip 5KB

---

## Files changed this session (NOT committed — leave dirty for human review)

| File | Action |
|---|---|
| `BookKeeping/demo/playwright.config.js` | Created |
| `BookKeeping/demo/tests/e2e/helpers.js` | Created |
| `BookKeeping/demo/tests/e2e/founder.spec.js` | Created |
| `BookKeeping/demo/tests/e2e/cpa.spec.js` | Created |
| `BookKeeping/demo/tests/e2e/invite.spec.js` | Created |
| `BookKeeping/tools/penny-demo-v5/` | Populated from dist/ |
| `BookKeeping/demo/workstream/playwright-status.md` | Created (this file) |
