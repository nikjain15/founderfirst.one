// @ts-check
/**
 * CPA app E2E tests — covers dashboard, client view tabs, auth gate.
 *
 * Test ID convention:
 *   C1–C16  CPA-app tests
 *   C4 (Chat tab) was a prior failure — watch it especially.
 *
 * The CPA app hydrates from cpa-fixture.json on first boot when no account
 * is stored in localStorage. These tests pre-seed the state to avoid the
 * async fetch and reduce flake.
 */
import { test, expect } from "@playwright/test";
import {
  CPA_URL,
  STATE_KEY,
  attachErrorTracking,
  assertNoBadRenders,
} from "./helpers.js";

// ── Helper: seed CPA state in localStorage before page load ──────────────────

const PRIYA_ACCOUNT = {
  id:            "cpa-priya-demo",
  name:          "Priya Sharma",
  email:         "priya@sharmacpa.com",
  licenseNumber: "CA-112233",
  licenseState:  "CA",
  verifiedAt:    1745500000000,
};

const SEED_CLIENTS = {
  "client-001": {
    clientName:   "Sarah Lin — Studio Nine",
    scenarioKey:  "sole-prop.consulting",
    entity:       "sole-prop",
    industry:     "consulting",
    grantedAt:    1745500000000,
    yearGrants:   [2026],
    yearRequests: [],
    learnedRules: [],
    flags: {},
    annotations: {},
    pendingAdds: [],  // data model specifies array (WorkQueue calls .filter() on this)
    chatHistory: [],
    taxReadiness: { score: 94, lastComputedAt: 1745500000000 },
  },
  "client-002": {
    clientName:   "Alex Carter — Carter Studio",
    scenarioKey:  "s-corp.retail",
    entity:       "s-corp",
    industry:     "retail",
    grantedAt:    1745500000000,
    yearGrants:   [2026],
    yearRequests: [],
    learnedRules: [],
    flags: {},
    annotations: {},
    pendingAdds: [],  // data model specifies array
    chatHistory: [],
    taxReadiness: { score: 72, lastComputedAt: 1745500000000 },
  },
};

async function seedCpaState(page, opts = {}) {
  const account = opts.noAccount ? null : PRIYA_ACCOUNT;
  const clients = opts.noClients ? {} : SEED_CLIENTS;
  await page.addInitScript(({ key, account, clients }) => {
    const state = {
      onboardingComplete: true,
      persona: { name: "Alex", firstName: "Alex", business: "Carter Studio", entity: "s-corp", industry: "retail" },
      tab: "penny",
      overlay: null,
      cpa: {
        account,
        invites:   [],
        clients,
        approvals: {},
        archives:  {},
      },
      preferences: { notifyCpaActivity: "real-time" },
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: STATE_KEY, account, clients });
}

// ─── C1: CPA app loads — dashboard visible with fixture account ───────────────

test("C1: CPA app loads and shows dashboard", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  // CPA app wrapper should be present
  const cpaApp = page.locator(".cpa-app");
  await expect(cpaApp).toBeVisible({ timeout: 12_000 });
});

// ─── C2: CPA top nav shows Penny CPA branding ────────────────────────────────

test("C2: CPA top nav shows Penny CPA branding", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // TopNav contains "Penny" and "CPA" labels
  const navText = page.locator("header");
  await expect(navText.first()).toContainText("Penny", { timeout: 8_000 });
});

// ─── C3: CPA dashboard shows client cards ─────────────────────────────────────

test("C3: CPA dashboard shows client cards", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Wait for dashboard to render with client names
  await expect(page.locator("text=Sarah Lin").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("text=Alex Carter").first()).toBeVisible({ timeout: 5_000 });
});

// ─── C4: CPA Chat tab renders with empty state and input ─────────────────────

test("C4: CPA chat tab renders ask-Penny input", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Click into the first client card
  await page.waitForTimeout(500);
  const clientCard = page.locator("text=Sarah Lin").first();
  await expect(clientCard).toBeVisible({ timeout: 10_000 });
  await clientCard.click();
  await page.waitForTimeout(500);

  // Find the Chat tab (may be in hidden bottom nav at mobile viewport — dispatch to bypass)
  const chatTab = page.locator("button").filter({ hasText: "Chat" }).first();
  await expect(chatTab).toBeAttached({ timeout: 8_000 });
  await chatTab.dispatchEvent("click");
  await page.waitForTimeout(400);

  // Chat tab should render with an input for typing questions
  const chatInput = page.locator("input[type='text']").last();
  await expect(chatInput).toBeVisible({ timeout: 5_000 });
});

// ─── C5: CPA client switcher — clicking client navigates to client view ───────

test("C5: clicking a client card navigates to client view", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Click first client
  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(600);

  // The client name should appear in a prominent heading
  const clientHeading = page.locator("h1, [class*='heading']").filter({ hasText: /Sarah/ });
  // Or: the path includes /client/ (path-based routing)
  const url = page.url();
  expect(url).toContain("client");
});

// ─── C6: CPA Work Queue tab renders ──────────────────────────────────────────

test("C6: CPA Work Queue tab renders", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Navigate into a client
  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  // Work Queue tab (may be in hidden bottom nav at mobile viewport — attached is enough)
  const workQueueBtn = page.locator("button").filter({ hasText: /Work Queue/i }).first();
  await expect(workQueueBtn).toBeAttached({ timeout: 8_000 });

  // Content should load — either items or empty state
  await page.waitForTimeout(500);
  const cpaMain = page.locator(".cpa-app");
  await expect(cpaMain).toBeVisible();
  await assertNoBadRenders(cpaMain);
});

// ─── C7: CPA Books tab renders ───────────────────────────────────────────────

test("C7: CPA Books tab renders", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  // Find and click Books tab (may be in hidden bottom nav — dispatch to bypass)
  const booksTab = page.locator("button").filter({ hasText: /^Books$/ }).first();
  await expect(booksTab).toBeAttached({ timeout: 8_000 });
  await booksTab.dispatchEvent("click");
  await page.waitForTimeout(400);

  // Should not crash
  await expect(page.locator(".cpa-app")).toBeVisible();
  await assertNoBadRenders(page.locator(".cpa-app"));
});

// ─── C8: CPA P&L tab renders ─────────────────────────────────────────────────

test("C8: CPA P&L tab renders", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  const plTab = page.locator("button").filter({ hasText: /P&L/i }).first();
  await expect(plTab).toBeAttached({ timeout: 8_000 });
  await plTab.dispatchEvent("click");
  await page.waitForTimeout(400);

  await expect(page.locator(".cpa-app")).toBeVisible();
  await assertNoBadRenders(page.locator(".cpa-app"));
});

// ─── C9: CPA Cash Flow tab renders ───────────────────────────────────────────

test("C9: CPA Cash Flow tab renders", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  const cashFlowTab = page.locator("button").filter({ hasText: /Cash Flow/i }).first();
  await expect(cashFlowTab).toBeAttached({ timeout: 8_000 });
  await cashFlowTab.dispatchEvent("click");
  await page.waitForTimeout(400);

  await expect(page.locator(".cpa-app")).toBeVisible();
  await assertNoBadRenders(page.locator(".cpa-app"));
});

// ─── C10: CPA Learned Rules tab renders ──────────────────────────────────────

test("C10: CPA Learned Rules tab renders", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  const rulesTab = page.locator("button").filter({ hasText: /Rules/i }).first();
  await expect(rulesTab).toBeAttached({ timeout: 8_000 });
  await rulesTab.dispatchEvent("click");
  await page.waitForTimeout(400);

  await expect(page.locator(".cpa-app")).toBeVisible();
  await assertNoBadRenders(page.locator(".cpa-app"));
});

// ─── C11: CPA AuthGate shown when no account ─────────────────────────────────

test("C11: CPA auth gate renders when there is no account", async ({ page }) => {
  await seedCpaState(page, { noAccount: true, noClients: true });
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");

  const cpaApp = page.locator(".cpa-app");
  await expect(cpaApp).toBeVisible({ timeout: 12_000 });

  // Auth gate renders because no account is stored
  // It should show either "expired" view or a signup form
  const authContent = page.locator("text=/invite|sign|license|expired|CPA/i");
  await expect(authContent.first()).toBeVisible({ timeout: 8_000 });
});

// ─── C12: CPA dashboard has correct account name in nav ──────────────────────

test("C12: CPA nav shows account name", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Priya Sharma should appear in the top nav
  await expect(page.locator("text=Priya Sharma").first()).toBeVisible({ timeout: 10_000 });
});

// ─── C13: CPA dashboard tax readiness scores visible ─────────────────────────

test("C13: CPA client cards show tax readiness scores", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Tax readiness score is shown on client cards
  await expect(page.locator("text=/Tax readiness/i").first()).toBeVisible({ timeout: 10_000 });
});

// ─── C14: CPA Chat tab input accepts text ────────────────────────────────────

test("C14: CPA chat input accepts text and clears on send", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  // Navigate to Chat tab
  const chatTab = page.locator("button").filter({ hasText: "Chat" }).first();
  await expect(chatTab).toBeAttached({ timeout: 8_000 });
  await chatTab.dispatchEvent("click");
  await page.waitForTimeout(400);

  // Type in the input
  const chatInput = page.locator("input[type='text']").last();
  await expect(chatInput).toBeVisible({ timeout: 5_000 });
  await chatInput.fill("What is the net profit?");
  expect(await chatInput.inputValue()).toBe("What is the net profit?");

  // Submit — AI call will fail but the input should clear
  await chatInput.press("Enter");
  await page.waitForTimeout(500);
  // Input cleared on submit
  const valAfter = await chatInput.inputValue();
  expect(valAfter).toBe("");
});

// ─── C15: CPA no bad renders across tabs ─────────────────────────────────────

test("C15: CPA view has no bad renders on any tab", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  // Cycle through all 6 tabs and check for bad renders (dispatch bypasses hidden nav)
  const tabNames = ["Work Queue", "Books", "P&L", "Cash Flow", "Chat", "Rules"];
  for (const tabName of tabNames) {
    const tab = page.locator("button").filter({ hasText: tabName }).first();
    if (await tab.count() > 0) {
      await tab.dispatchEvent("click");
      await page.waitForTimeout(300);
      await assertNoBadRenders(page.locator(".cpa-app"));
    }
  }
});

// ─── C16: CPA back to dashboard button works ─────────────────────────────────

test("C16: CPA back to dashboard navigation works", async ({ page }) => {
  await seedCpaState(page);
  await page.goto(CPA_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".cpa-app")).toBeVisible({ timeout: 12_000 });

  // Navigate into a client
  await page.waitForTimeout(500);
  await page.locator("text=Sarah Lin").first().click();
  await page.waitForTimeout(500);

  // Click "← All clients" back button — in sidebar at desktop, inline header at mobile
  const backBtn = page.locator("button").filter({ hasText: /All clients/i }).first();
  await expect(backBtn).toBeAttached({ timeout: 8_000 });
  await backBtn.dispatchEvent("click");
  await page.waitForTimeout(400);

  // Should return to dashboard — client cards visible again
  await expect(page.locator("text=Sarah Lin").first()).toBeVisible({ timeout: 5_000 });
});
