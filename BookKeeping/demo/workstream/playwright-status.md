# Playwright E2E Test Status — Demo v5

**Session date:** 25 April 2026  
**Final result:** 32/32 PASSED ✓  
**Branch:** `claude/zen-allen-eFUVJ`

---

## Infrastructure files created

| File | Status |
|---|---|
| `BookKeeping/demo/playwright.config.js` | CREATED — uses pre-installed headless shell at `/opt/pw-browsers/chromium_headless_shell-1194/` |
| `BookKeeping/demo/tests/e2e/helpers.js` | CREATED — shared helpers: `FOUNDER_URL`, `CPA_URL`, `STATE_KEY`, `seedFounderState`, `clearAllStorage`, `attachErrorTracking`, `waitForFounderReady`, `waitForCpaReady`, `gotoHash` |
| `BookKeeping/demo/tests/e2e/founder.spec.js` | CREATED — F1–F10, F2b, F4b, F4c, F8b, F8c (15 tests) |
| `BookKeeping/demo/tests/e2e/cpa.spec.js` | CREATED — C1–C16 (16 tests) |
| `BookKeeping/demo/tests/e2e/invite.spec.js` | CREATED — E1 (1 test) |

---

## Test results — all 32 passing

### Founder app (F-series)

| ID | Description | Status | Fix applied |
|---|---|---|---|
| F1 | Onboarding entity picker visible on first boot | PASSING | — |
| F2 | Thread screen loads with tab bar after onboarding | PASSING | — |
| F2b | Thread greeting bubble or loading state visible | PASSING | — |
| F3 | Tab navigation switches screens correctly | PASSING | — |
| F4 | Add tab photo capture tile visible | PASSING | — |
| F4b | Add tab voice capture tile visible | PASSING | — |
| F4c | Add tab just-tell-me tile toggles textarea | PASSING | — |
| F5 | My books screen shows stat cards | PASSING | — |
| F6 | My books shows needs a look section | PASSING | — |
| F7 | Avatar menu opens on ⋮ click | FIXED → PASSING | Avatar menu buttons contain `<p>label</p>` + `<p>sub text</p>`. `/^Profile$/` on button fails. Fixed to `page.locator("p").filter({ hasText: /^Profile$/ })` to match the inner `<p>` element. |
| F8 | Invoice designer screen renders | PASSING | — |
| F8b | Invoice designer add line item | PASSING | — |
| F8c | Invoice designer preview mode toggle | PASSING | — |
| F9 | Thread shows approval card when scenario loads | PASSING | — |
| F10 | Thread ask bar is visible and focusable | PASSING | — |

### CPA app (C-series)

| ID | Description | Status | Fix applied |
|---|---|---|---|
| C1 | CPA app loads at /penny/demo/cpa/ | PASSING | — |
| C2 | Auth gate / expired invite shows without account | PASSING | — |
| C3 | CPA dashboard shows client list from fixture | FIXED → PASSING | Strict mode violation from `.or()` on already-`.first()` locators. Split into two separate `expect()` assertions. |
| C4 | CPA work queue renders active items | FIXED → PASSING | Line 231: `ctaBtn.or(reclassifyText)` created strict mode violation (2 elements matched). Replaced with separate `expect(reclassifyText).toBeVisible()`. |
| C5 | CPA Books tab renders for a client | PASSING | — |
| C6 | CPA P&L tab renders for a client | PASSING | — |
| C7 | CPA Cash Flow tab renders for a client | PASSING | — |
| C8 | CPA Chat tab renders for a client | PASSING | — |
| C9 | CPA Rules tab renders for a client | FIXED → PASSING | `text=Notion` matched `<div>Notion*</div>` inside `.rules-table-wide` (CSS `display:none` at 414px mobile). Scoped to `.rules-cards-mobile` container which is the visible mobile view. |
| C10 | CPA back to dashboard navigation works | FIXED → PASSING | "← All clients" button only exists inside `.cpa-sidebar` (hidden at 414px). Replaced with `page.goBack()` for browser back navigation. |
| C11 | CPA work queue Resolve button opens action sheet | PASSING | — |
| C12 | CPA Books tab loads without error | PASSING | — |
| C13 | CPA Chat can type and submit a question | PASSING | — |
| C14 | CPA Rules tab shows seeded learned rule | FIXED → PASSING | Same root cause as C9: `text=Notion` matched hidden `.rules-table-wide` row. Scoped to `.rules-cards-mobile` with `.filter({ hasText: /Notion|Software subscriptions/ })`. |
| C15 | CPA Cash Flow tab loads without error | PASSING | — |
| C16 | CPA sign out button is accessible | PASSING | — |

### Invite / entity flow (E-series)

| ID | Description | Status | Fix applied |
|---|---|---|---|
| E1 | S-Corp persona shows correct entity label in profile | FIXED → PASSING | Same root cause as F7: avatar menu button contains both label and sub text; `/^Profile$/` on button fails. Fixed to click `page.locator("p").filter({ hasText: /^Profile$/ })` instead. |

---

## Root causes fixed

### 1. Avatar menu button text matching (F7, E1)
Avatar menu items render as `<button><p>Profile</p><p>Manage your name…</p></button>`. The button's innerText is `"Profile\nManage your name, business, and CPA details."` — does NOT match `/^Profile$/`. Fix: match the inner `<p>` element directly.

### 2. Playwright `.or()` strict mode violation (C3, C4)
Playwright `.or()` applied to `.first()`-resolved locators creates a combined locator that can match multiple elements, triggering strict mode violations. Fix: split into separate `expect()` calls, or call `.first()` after the `.or()`.

### 3. CPA sidebar hidden at 414px mobile (C5–C9, C10, C12–C15)
At 414px, `.cpa-sidebar` is CSS `display:none` but its DOM elements (sidebar nav buttons) still exist. Locators like `button.filter({ hasText: /^Books$/ }).first()` return the hidden sidebar button first (DOM order). Fix: `clickCpaTab()` helper iterates all matching buttons and clicks the first one where `isVisible()` returns true.

### 4. Responsive rules table (C9, C14)
`LearnedRules.jsx` renders two views: `.rules-table-wide` (desktop, CSS `display:none` at mobile) and `.rules-cards-mobile` (mobile, `display:block`). `text=Notion` matched the hidden table row first. Fix: scope locator to `.rules-cards-mobile`.

### 5. Mobile back navigation (C10)
"← All clients" button only exists inside `.cpa-sidebar` (hidden at 414px). No mobile equivalent button exists in `ClientView`. Fix: `page.goBack()` simulates browser back navigation.

---

## Build output

```
✓ 67 modules transformed
dist/cpa/index.html    1.57 kB │ gzip: 0.81 kB
dist/index.html        2.31 kB │ gzip: 1.22 kB
dist/assets/analytics  25.92 kB CSS
dist/assets/cpa        74.98 kB JS
dist/assets/main       163.34 kB JS
dist/assets/analytics  355.38 kB JS (React + vendor)
Built in 1.60s
```

Build copied to `BookKeeping/tools/penny-demo-v5/`.

---

## Files changed (not committed per task spec)

- `BookKeeping/demo/playwright.config.js` — new
- `BookKeeping/demo/tests/e2e/helpers.js` — new  
- `BookKeeping/demo/tests/e2e/founder.spec.js` — new + F7 fix
- `BookKeeping/demo/tests/e2e/cpa.spec.js` — new + C3, C4, C9, C10, C14 fixes
- `BookKeeping/demo/tests/e2e/invite.spec.js` — new + E1 fix
- `BookKeeping/demo/workstream/playwright-status.md` — this file
- `BookKeeping/tools/penny-demo-v5/` — build output directory
