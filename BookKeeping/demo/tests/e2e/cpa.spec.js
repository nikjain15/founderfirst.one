// @ts-check
/**
 * cpa.spec.js — Playwright E2E tests for the Penny CPA view.
 *
 * Test IDs: C1–C16
 * CPA app hydrates from cpa-fixture.json on first load (no account in localStorage).
 * This provides Priya Sharma as CPA with 4 clients.
 */
import { test, expect } from "@playwright/test";
import {
  CPA_URL,
  STATE_KEY,
  clearAllStorage,
  attachErrorTracking,
  assertNoBadRenders,
} from "./helpers.js";

// Seed a fresh CPA state from fixture by clearing localStorage (CPA app will
// fetch cpa-fixture.json and hydrate automatically).
async function seedCpaState(page) {
  await page.addInitScript(({ key }) => {
    try {
      // Remove only the CPA account so hydration from fixture runs
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        delete parsed.cpa;
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {
      // ignore
    }
  }, { key: STATE_KEY });
}

// Seed a pre-loaded CPA state (skips fixture fetch) for faster tests
async function seedCpaStateDirect(page) {
  await page.addInitScript(({ key }) => {
    const cpa = {
      account: {
        id:            "cpa-priya-demo",
        name:          "Priya Sharma",
        email:         "priya@sharmacpa.com",
        licenseNumber: "CA-112233",
        licenseState:  "CA",
        verifiedAt:    1745500000000,
      },
      invites:   [],
      clients: {
        "client-001": {
          clientName:   "Sarah Lin — Studio Nine",
          scenarioKey:  "sole-prop.consulting",
          entity:       "sole-prop",
          industry:     "consulting",
          grantedAt:    1745500000000,
          yearGrants:   [2026],
          yearRequests: [],
          learnedRules: [],
          flags:        {},
          annotations:  {},
          pendingAdds:  [],
          taxReadiness: { score: 94, lastComputedAt: 1745500000000 },
        },
        "client-002": {
          clientName:   "Alex Carter — Carter Consulting",
          scenarioKey:  "s-corp.consulting",
          entity:       "s-corp",
          industry:     "consulting",
          grantedAt:    1745400000000,
          yearGrants:   [2026],
          yearRequests: [],
          learnedRules: [],
          flags:        {},
          annotations:  {},
          pendingAdds:  [],
          taxReadiness: { score: 72, lastComputedAt: 1745400000000 },
        },
      },
      approvals: {},
      archives:  {},
    };
    try {
      const raw = localStorage.getItem(key);
      const base = raw ? JSON.parse(raw) : {};
      localStorage.setItem(key, JSON.stringify({ ...base, cpa }));
    } catch {
      localStorage.setItem(key, JSON.stringify({ cpa }));
    }
  }, { key: STATE_KEY });
}

// ---------------------------------------------------------------------------
// C1 — CPA app loads and shows the dashboard
// ---------------------------------------------------------------------------
test("C1: CPA app loads and shows the dashboard", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  // CPA app wrapper
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// C2 — Dashboard shows client cards
// ---------------------------------------------------------------------------
test("C2: CPA dashboard shows client cards", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });

  // "Good morning" greeting (dashboard)
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  // Clients eyebrow label
  await expect(page.locator(".eyebrow").filter({ hasText: "Clients" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// C3 — Clicking a client card navigates to client view
// ---------------------------------------------------------------------------
test("C3: clicking a client card opens the client view", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  // Click the first client card
  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();

  // Should navigate to client view
  await page.waitForTimeout(500);
  // Bottom nav shows the Work Queue tab
  await expect(page.locator(".cpa-bottom-nav button").filter({ hasText: "Work Queue" })).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// C4 — Work Queue tab renders items or empty state
// ---------------------------------------------------------------------------
test("C4: Work Queue tab renders without crashing", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  // Navigate to first client
  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  // Work Queue tab is active by default
  const workQueueBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Work Queue" });
  await expect(workQueueBtn).toBeVisible({ timeout: 5_000 });

  // Content renders (either items or empty state)
  // The work queue section has a flex column layout
  await expect(page.locator(".cpa-app main")).toBeVisible({ timeout: 5_000 });
  await assertNoBadRenders(page.locator(".cpa-app main"));
});

// ---------------------------------------------------------------------------
// C5 — Books tab renders the ledger table
// ---------------------------------------------------------------------------
test("C5: Books tab renders the ledger table with filter bar", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  // Navigate to first client
  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  // Click Books tab
  const booksBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Books" });
  await expect(booksBtn).toBeVisible({ timeout: 5_000 });
  await booksBtn.click();
  await page.waitForTimeout(300);

  // Filter bar with "Filter by category" input
  await expect(page.locator("input[placeholder='Filter by category…']")).toBeVisible({ timeout: 5_000 });

  // Export buttons
  await expect(page.locator(".btn-ghost").filter({ hasText: "Export CSV" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// C6 — P&L tab renders Revenue and Expenses sections
// ---------------------------------------------------------------------------
test("C6: P&L tab renders Revenue and Expenses sections", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const plBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "P&L" });
  await expect(plBtn).toBeVisible({ timeout: 5_000 });
  await plBtn.click();
  await page.waitForTimeout(300);

  // Revenue section
  await expect(page.locator(".eyebrow--col").filter({ hasText: "Revenue" })).toBeVisible({ timeout: 5_000 });

  // Expenses section
  await expect(page.locator(".eyebrow--col").filter({ hasText: "Expenses" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// C7 — Cash Flow tab renders
// ---------------------------------------------------------------------------
test("C7: Cash Flow tab renders without crashing", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const cashFlowBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Cash Flow" });
  await expect(cashFlowBtn).toBeVisible({ timeout: 5_000 });
  await cashFlowBtn.click();
  await page.waitForTimeout(300);

  // Cash Flow content renders
  await expect(page.locator(".cpa-app main")).toBeVisible({ timeout: 5_000 });
  await assertNoBadRenders(page.locator(".cpa-app main"));
});

// ---------------------------------------------------------------------------
// C8 — Chat tab renders the ask bar
// ---------------------------------------------------------------------------
test("C8: Chat tab renders with ask bar", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const chatBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Chat" });
  await expect(chatBtn).toBeVisible({ timeout: 5_000 });
  await chatBtn.click();
  await page.waitForTimeout(300);

  // Chat ask bar input
  await expect(page.locator("input[placeholder='Ask Penny anything about these books…']")).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// C9 — Learned Rules tab renders
// ---------------------------------------------------------------------------
test("C9: Learned Rules tab renders without crashing", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const rulesBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Rules" });
  await expect(rulesBtn).toBeVisible({ timeout: 5_000 });
  await rulesBtn.click();
  await page.waitForTimeout(300);

  await expect(page.locator(".cpa-app main")).toBeVisible({ timeout: 5_000 });
  await assertNoBadRenders(page.locator(".cpa-app main"));
});

// ---------------------------------------------------------------------------
// C10 — CPA top nav shows Penny CPA wordmark
// ---------------------------------------------------------------------------
test("C10: CPA top nav shows Penny wordmark and CPA label", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });

  // "Penny" wordmark in header
  await expect(page.locator("span").filter({ hasText: "Penny" }).first()).toBeVisible({ timeout: 8_000 });

  // "CPA" sub-label
  await expect(page.locator("span").filter({ hasText: "CPA" }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// C11 — CPA avatar dropdown opens with sign out option
// ---------------------------------------------------------------------------
test("C11: CPA avatar dropdown opens and shows sign out", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  // Click the CPA avatar button (shows CPA name or initials)
  const avatarBtn = page.locator("header button").filter({ hasText: "Priya" }).first();
  await expect(avatarBtn).toBeVisible({ timeout: 5_000 });
  await avatarBtn.click();

  // Sign out button appears
  await expect(page.locator("button").filter({ hasText: "Sign out" })).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// C12 — Books tab: adding a transaction opens the Add Transaction sheet
// ---------------------------------------------------------------------------
test("C12: Books tab Add Transaction button opens the add sheet", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const booksBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Books" });
  await expect(booksBtn).toBeVisible({ timeout: 5_000 });
  await booksBtn.click();
  await page.waitForTimeout(300);

  // Click "+ Add transaction" button
  const addTxnBtn = page.locator("button").filter({ hasText: "+ Add transaction" });
  await expect(addTxnBtn).toBeVisible({ timeout: 5_000 });
  await addTxnBtn.click();

  // Sheet opens with "Add transaction" title
  await expect(page.locator(".sheet-backdrop")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("span").filter({ hasText: "Add transaction" })).toBeVisible({ timeout: 3_000 });
});

// ---------------------------------------------------------------------------
// C13 — Books table row opens action menu (⋯)
// ---------------------------------------------------------------------------
test("C13: clicking the row action button opens the row menu sheet", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const booksBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "Books" });
  await expect(booksBtn).toBeVisible({ timeout: 5_000 });
  await booksBtn.click();
  await page.waitForTimeout(500);

  // Find a row action button (⋯) — only visible in tablet/desktop table, not mobile card layout
  const actionBtns = page.locator("button[title='More actions']");
  const actionCount = await actionBtns.count();
  const firstIsVisible = actionCount > 0 && await actionBtns.first().isVisible();
  if (firstIsVisible) {
    await actionBtns.first().click();
    // Sheet with Flag / Annotate / Suggest options
    await expect(page.locator(".sheet-backdrop")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("button").filter({ hasText: "Flag" })).toBeVisible({ timeout: 3_000 });
  } else {
    // At mobile viewport (414px) the table is hidden — mobile card layout has no inline actions
    test.skip(true, "Row action buttons not visible at this viewport — mobile card layout");
  }
});

// ---------------------------------------------------------------------------
// C14 — P&L Export CSV button triggers toast
// ---------------------------------------------------------------------------
test("C14: P&L Export CSV triggers a toast", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  const clientCard = page.locator(".cpa-app").locator("div[style*='cursor: pointer']").first();
  await expect(clientCard).toBeVisible({ timeout: 5_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  const plBtn = page.locator(".cpa-bottom-nav button").filter({ hasText: "P&L" });
  await expect(plBtn).toBeVisible({ timeout: 5_000 });
  await plBtn.click();
  await page.waitForTimeout(300);

  // Click Export CSV
  const exportCsvBtn = page.locator(".btn-ghost").filter({ hasText: "Export CSV" }).first();
  await expect(exportCsvBtn).toBeVisible({ timeout: 5_000 });
  await exportCsvBtn.click();

  // Toast appears
  await expect(page.locator("[role='status']")).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// C15 — Multiple clients are shown on dashboard
// ---------------------------------------------------------------------------
test("C15: CPA dashboard shows multiple client cards", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  // Should see "2 clients connected" in the subtitle
  await expect(page.locator("p").filter({ hasText: /clients connected/ })).toBeVisible({ timeout: 8_000 });

  // At least 2 client cards visible
  const clientCards = page.locator(".cpa-app").locator("div[style*='cursor: pointer']");
  const count = await clientCards.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// C16 — CPA app: no undefined/NaN/[object Object] renders on dashboard
// ---------------------------------------------------------------------------
test("C16: CPA dashboard has no bad renders", async ({ page }) => {
  await seedCpaStateDirect(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("h1").filter({ hasText: /Good morning/ })).toBeVisible({ timeout: 8_000 });

  await assertNoBadRenders(page.locator(".cpa-app"));
});
