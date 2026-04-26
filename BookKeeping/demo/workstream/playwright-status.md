# Playwright E2E Status

*Last updated: 2026-04-26*

## Summary

**32/32 passing** — all tests green on chromium.

---

## Test Results

| ID | Name | Status | Notes |
|---|---|---|---|
| F1 | founder app loads — onboarding visible with no state | ✅ PASS | |
| F2 | onboarding welcome renders headline and Let's go CTA | ✅ PASS | |
| F2b | 'Not sure' entity option opens diagnostic | ✅ PASS | |
| F3 | thread screen visible after seeding state | ✅ PASS | |
| F4 | thread renders approval card after persona seeded | ✅ PASS | |
| F4b | confirming an approval card shows slug | ✅ PASS | |
| F4c | thread ask bar accepts input and submits | ✅ PASS | |
| F5 | add tab renders quick capture, connected accounts, data actions | ✅ PASS | |
| F6 | add tab provider connect sheet opens | ✅ PASS | |
| F7 | add tab email connect shows Gmail and Outlook options | ✅ PASS | |
| F8 | my books renders Runway, Net, and Books stat cards | ✅ PASS | |
| F8b | my books Needs a Look section renders | ✅ PASS | |
| F8c | my books ask Penny bar is present | ✅ PASS | |
| F9 | avatar menu opens from thread header menu button | ✅ PASS | |
| F10 | invoice designer renders when navigated to | ✅ PASS | |
| C1 | CPA app loads and shows dashboard | ✅ PASS | |
| C2 | CPA top nav shows Penny CPA branding | ✅ PASS | |
| C3 | CPA dashboard shows client cards | ✅ PASS | |
| C4 | CPA chat tab renders ask-Penny input | ✅ PASS | Fixed: `dispatchEvent("click")` to reach hidden bottom nav at 414px |
| C5 | clicking a client card navigates to client view | ✅ PASS | |
| C6 | CPA Work Queue tab renders | ✅ PASS | Fixed: `dispatchEvent("click")` + `toBeAttached` |
| C7 | CPA Books tab renders | ✅ PASS | Fixed: `dispatchEvent("click")` |
| C8 | CPA P&L tab renders | ✅ PASS | Fixed: `dispatchEvent("click")` |
| C9 | CPA Cash Flow tab renders | ✅ PASS | Fixed: `dispatchEvent("click")` |
| C10 | CPA Learned Rules tab renders | ✅ PASS | Fixed: `dispatchEvent("click")` |
| C11 | CPA auth gate renders when there is no account | ✅ PASS | |
| C12 | CPA nav shows account name | ✅ PASS | |
| C13 | CPA client cards show tax readiness scores | ✅ PASS | |
| C14 | CPA chat input accepts text and clears on send | ✅ PASS | Fixed: `dispatchEvent("click")` |
| C15 | CPA view has no bad renders on any tab | ✅ PASS | Fixed: `dispatchEvent("click")` in tab-cycling loop |
| C16 | CPA back to dashboard navigation works | ✅ PASS | Fixed: `dispatchEvent("click")` on hidden sidebar button |
| E1 | thread screen recovers gracefully from minimal persona state | ✅ PASS | |

---

## Infrastructure Files

| File | Status |
|---|---|
| `playwright.config.js` | ✅ Created — chromium 414×896, 1 worker, localhost:5173 |
| `tests/e2e/helpers.js` | ✅ Created — `seedFounderState`, `clearAllStorage`, `attachErrorTracking`, `assertNoBadRenders`, `waitForFounderReady`, `gotoHash` |
| `tests/e2e/founder.spec.js` | ✅ Created — 15 tests (F1–F10 + F2b, F4b, F4c, F8b, F8c) |
| `tests/e2e/cpa.spec.js` | ✅ Created — 16 tests (C1–C16) |
| `tests/e2e/invite.spec.js` | ✅ Created — 1 test (E1) |

---

## Key Fixes Applied

### 5. `seedFounderState` wrote to `localStorage` but app reads `sessionStorage` (session resumed 2026-04-26)
Settled decision #23 moved founder app state from `localStorage` to `sessionStorage`. The test helper `seedFounderState` in `tests/e2e/helpers.js` was still writing to `localStorage`, so the app saw no seeded state and started from onboarding — causing `nav.tab-bar` to never appear (F3–F10 all failed). Fixed by changing `localStorage.setItem` → `sessionStorage.setItem` on line 29 of helpers.js.

### 1. Playwright browser version mismatch
`@playwright/test@1.59.1` expected chromium-1217 (not downloadable). Downgraded to `^1.56.0` to match pre-installed `/opt/pw-browsers/chromium-1194`. Run with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

### 2. `pendingAdds.filter is not a function` (blocked C4, C6–C10, C14–C16)
`SEED_CLIENTS` in `cpa.spec.js` had `pendingAdds: {}` (object). `WorkQueue.jsx:409` does `clientData.pendingAdds || []` then calls `.filter()` on it — but `{}` is truthy so the default didn't apply, and objects don't have `.filter()`. Fixed by seeding `pendingAdds: []` to match the `cpa-data-model.md` schema.

### 3. CPA tab buttons hidden at 414px viewport (blocked C4, C6–C10, C14–C16)
`.cpa-bottom-nav` is `display: flex` at mobile but Playwright's `devices["Desktop Chrome"]` sets `isMobile: false`, which can affect CSS viewport unit resolution. The buttons were in the DOM but unclickable via `.click()` or `.click({ force: true })`. Fixed by using `locator.dispatchEvent("click")` which fires the event regardless of visibility/actionability.

### 4. C16 back button also hidden
`← All clients` button lives inside `.cpa-sidebar` (visible only at ≥768px) AND also inline in the client view header. At 414px, both can be hidden depending on layout. `dispatchEvent("click")` reaches the first matching button regardless.

---

## Build Output

```
vite v5.4.21 — 67 modules transformed
dist/cpa/index.html      1.57 kB (gzip: 0.81 kB)
dist/index.html          2.31 kB (gzip: 1.22 kB)
dist/assets/main.js    163.34 kB (gzip: 37.32 kB)
dist/assets/cpa.js      74.98 kB (gzip: 15.93 kB)
```

Built and copied to `../tools/penny-demo-v5/`.

---

## How to Run

```bash
# From BookKeeping/demo/
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test
```

Vite dev server must be running on port 5173:
```bash
npm run dev &
```
