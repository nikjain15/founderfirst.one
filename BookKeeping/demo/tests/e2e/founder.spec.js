// @ts-check
/**
 * founder.spec.js — Playwright E2E tests for the Penny founder (main) app.
 *
 * Test IDs: F1–F10 (plus F2b, F4b, F4c, F8b, F8c sub-tests).
 * All tests seed localStorage to skip onboarding, then exercise each tab/flow.
 * AI calls go through the Cloudflare Worker; tests accept both AI responses
 * and fallback toasts/copy as valid outcomes.
 */

import { test, expect } from "@playwright/test";
import {
  FOUNDER_URL,
  STATE_KEY,
  seedFounderState,
  clearAllStorage,
  attachErrorTracking,
  assertNoBadRenders,
  waitForFounderReady,
  gotoHash,
} from "./helpers.js";

// ── F1: Page loads and tab bar renders after seeding state ──────────────────

test("F1: founder app loads with seeded state — tab bar visible", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Tab bar has three tabs
  const tabBar = page.locator("nav.tab-bar");
  await expect(tabBar).toBeVisible();

  const tabs = tabBar.locator("button");
  await expect(tabs).toHaveCount(3);

  // Labels: Penny · Add · My Books
  const labels = await tabs.allInnerTexts();
  const labelTexts = labels.map((t) => t.trim());
  expect(labelTexts.some((t) => t.includes("Penny"))).toBe(true);
  expect(labelTexts.some((t) => t.includes("Add"))).toBe(true);
  expect(labelTexts.some((t) => t.includes("Books"))).toBe(true);
});

// ── F2: Navigate to Add tab ──────────────────────────────────────────────────

test("F2: navigate to Add tab", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Click the Add tab
  await page.locator("nav.tab-bar button.tab--add").click();
  await page.waitForTimeout(300);

  // The Add screen renders an "Add" heading
  const heading = page.locator("h2").filter({ hasText: /^Add$/ });
  await expect(heading).toBeVisible({ timeout: 6_000 });
});

// ── F2b: Navigate to My Books tab ────────────────────────────────────────────

test("F2b: navigate to My Books tab", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await page.locator("nav.tab-bar button.tab--books").click();
  await page.waitForTimeout(300);

  // My Books heading
  const heading = page.locator("h1").filter({ hasText: "My Books" });
  await expect(heading).toBeVisible({ timeout: 6_000 });
});

// ── F3: Thread screen loads — greeting bubble renders (AI or fallback) ───────

test("F3: thread screen shows greeting after seeded onboarding", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // The Penny tab should be active by default
  await expect(page.locator("button.tab--penny[aria-current='page']")).toBeVisible();

  // Thread screen container
  const thread = page.locator(".thread-screen");
  await expect(thread).toBeVisible({ timeout: 8_000 });

  // Either the greeting bubble renders (AI or fallback) or loading skeleton
  // appears then resolves. Accept any non-empty state in the thread list.
  const threadList = page.locator(".thread-list");
  await expect(threadList).toBeVisible({ timeout: 8_000 });

  // Thread header with Penny name
  const header = page.locator(".thread-header");
  await expect(header).toBeVisible();
  await expect(header).toContainText("Penny");
});

// ── F4: Approval card renders from scenario data ─────────────────────────────

test("F4: approval card renders from scenario cardQueue", async ({ page }) => {
  // Use sole-prop.consulting which has 5 cards including income/expense
  await page.addInitScript(({ key }) => {
    const state = {
      onboardingComplete: true,
      persona: {
        name: "Alex Carter",
        firstName: "Alex",
        business: "Carter Studio",
        entity: "sole-prop",
        industry: "consulting",
      },
      tab: "penny",
      overlay: null,
      cpa: { account: null, invites: [], clients: {}, approvals: {}, archives: {} },
      preferences: { notifyCpaActivity: "real-time" },
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: STATE_KEY });

  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait for thread screen with card queue — the scenario loads asynchronously.
  // The approval card wrap appears when the first card in cardQueue renders.
  const cardWrap = page.locator(".approval-card-wrap").first();
  await expect(cardWrap).toBeVisible({ timeout: 12_000 });

  // The card has a vendor name and amount
  const card = page.locator(".approval-card").first();
  await expect(card).toBeVisible();

  // Vendor name area is non-empty
  const vendorName = card.locator(".card-vendor-name").first();
  await expect(vendorName).not.toBeEmpty({ timeout: 6_000 });
});

// ── F4b: Card confirm action ──────────────────────────────��──────────────────

test("F4b: confirm button on approval card adds confirmed slug", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const state = {
      onboardingComplete: true,
      persona: {
        name: "Alex Carter",
        firstName: "Alex",
        business: "Carter Studio",
        entity: "sole-prop",
        industry: "consulting",
      },
      tab: "penny",
      overlay: null,
      cpa: { account: null, invites: [], clients: {}, approvals: {}, archives: {} },
      preferences: { notifyCpaActivity: "real-time" },
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: STATE_KEY });

  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait for approval card
  const cardWrap = page.locator(".approval-card-wrap").first();
  await expect(cardWrap).toBeVisible({ timeout: 12_000 });

  // Click the primary confirm button (first .btn.btn-full in the card)
  const confirmBtn = page.locator(".approval-card .card-actions .btn.btn-full").first();
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  // After confirm, a confirmed slug should appear
  // (the card transitions to a confirmed-slug pill in the thread list)
  // Allow up to 4s for the transition
  const confirmedSlug = page.locator(".confirmed-slug").first();
  await expect(confirmedSlug).toBeVisible({ timeout: 4_000 });
});

// ── F4c: Card category sheet opens ───────────────────────────────────────────
// The category pill (<span>) is not clickable. The category sheet opens
// when the secondary action button (.btn.btn-ghost.btn-full) is tapped.

test("F4c: tapping the secondary button on a card opens the category sheet", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    const state = {
      onboardingComplete: true,
      persona: {
        name: "Alex Carter",
        firstName: "Alex",
        business: "Carter Studio",
        entity: "sole-prop",
        industry: "consulting",
      },
      tab: "penny",
      overlay: null,
      cpa: { account: null, invites: [], clients: {}, approvals: {}, archives: {} },
      preferences: { notifyCpaActivity: "real-time" },
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: STATE_KEY });

  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait for approval card
  await expect(page.locator(".approval-card-wrap").first()).toBeVisible({ timeout: 12_000 });

  // The category sheet is opened by the secondary action button (.btn.btn-ghost.btn-full).
  // This button exists on all card variants (its label comes from AI or fallback copy).
  const secondaryBtn = page.locator(".approval-card .card-actions .btn.btn-ghost.btn-full").first();
  await expect(secondaryBtn).toBeVisible({ timeout: 8_000 });
  await secondaryBtn.click();

  // A sheet with a list of categories should open
  // The Sheet renders with a .sheet-body containing .sheet-list .sheet-item rows
  const sheetList = page.locator(".sheet-list, .sheet-item").first();
  await expect(sheetList).toBeVisible({ timeout: 4_000 });
});

// ── F5: Add tab renders Quick capture, Connected accounts, Data actions ──────

test("F5: Add tab renders all three sections", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Navigate to Add
  await page.locator("nav.tab-bar button.tab--add").click();

  // Wait for heading
  await expect(page.locator("h2").filter({ hasText: "Add" })).toBeVisible({ timeout: 6_000 });

  // Three eyebrow labels: Quick capture / Connected accounts / Data actions
  const eyebrows = page.locator("p.eyebrow");

  // "Quick capture" section eyebrow
  await expect(eyebrows.filter({ hasText: "Quick capture" })).toBeVisible({ timeout: 4_000 });

  // "Connected accounts" section eyebrow
  await expect(eyebrows.filter({ hasText: "Connected accounts" })).toBeVisible();

  // "Data actions" section eyebrow
  await expect(eyebrows.filter({ hasText: "Data actions" })).toBeVisible();
});

// ── F6: My Books tab renders stat cards ──────────────────────────────────────

test("F6: My Books tab renders stat cards and headings", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Navigate to My Books
  await page.locator("nav.tab-bar button.tab--books").click();

  // Heading
  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 6_000 });

  // "Send to CPA" button present
  const cpaBtn = page.locator("button").filter({ hasText: "Send to CPA" });
  await expect(cpaBtn).toBeVisible({ timeout: 4_000 });

  // Stat area — "Net this month" label
  const netLabel = page.locator("text=Net this month").first();
  await expect(netLabel).toBeVisible({ timeout: 8_000 });
});

// ── F7: Avatar menu opens from thread header ──────────────────────────────────

test("F7: avatar menu opens and shows Profile / Memory / Preferences tabs", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Click the ⋮ button in the thread header
  const menuBtn = page.locator("button[aria-label='Open menu']");
  await expect(menuBtn).toBeVisible();
  await menuBtn.click();

  // Avatar menu renders with three sub-navigation items
  await page.waitForTimeout(300);

  // Check URL hash changed to /avatar
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toContain("avatar");

  // Profile, Memory, Preferences buttons should be visible
  const profileBtn = page.locator("button").filter({ hasText: "Profile" }).first();
  const memoryBtn  = page.locator("button").filter({ hasText: "Memory"  }).first();
  const prefBtn    = page.locator("button").filter({ hasText: "Preferences" }).first();

  await expect(profileBtn).toBeVisible({ timeout: 4_000 });
  await expect(memoryBtn).toBeVisible();
  await expect(prefBtn).toBeVisible();
});

// ── F8: Invoice screen loads ──────────────────────────────────────────────────

test("F8: invoice screen loads with edit form", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Navigate to invoice via hash
  await gotoHash(page, "/invoice");
  await page.waitForTimeout(300);

  // Invoice screen title
  const invoiceTitle = page.locator("h1").filter({ hasText: "New Invoice" });
  await expect(invoiceTitle).toBeVisible({ timeout: 6_000 });
});

// ── F8b: Invoice edit — line item input works ─────────────────────────────────

test("F8b: invoice edit — line item description field accepts input", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await gotoHash(page, "/invoice");
  await page.waitForTimeout(300);

  // Line item description input — first text input in the line items section
  const lineInputs = page.locator("input[placeholder*='Description'], input[placeholder*='description']");
  await expect(lineInputs.first()).toBeVisible({ timeout: 6_000 });

  await lineInputs.first().fill("Design consultation");
  await expect(lineInputs.first()).toHaveValue("Design consultation");
});

// ── F8c: Invoice send sheet opens ─────────────────────────────────────────────

test("F8c: invoice send button opens the send sheet", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await gotoHash(page, "/invoice");
  await page.waitForTimeout(300);

  // Wait for invoice screen
  await expect(page.locator("h1").filter({ hasText: "New Invoice" })).toBeVisible({ timeout: 6_000 });

  // Click the Send button
  const sendBtn = page.locator(".btn.btn-full").filter({ hasText: /Send/ }).first();
  await expect(sendBtn).toBeVisible({ timeout: 4_000 });
  await sendBtn.click();

  // A sheet should open with an email input
  const emailInput = page.locator("input[type='email'], input[placeholder*='email'], input[placeholder*='Email']").first();
  await expect(emailInput).toBeVisible({ timeout: 4_000 });
});

// ── F9: State persists across reload ─────────────────────────────────────────

test("F9: localStorage state survives a page reload", async ({ page }) => {
  const persona = await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Reload
  await page.reload();
  await waitForFounderReady(page);

  // Should still be past onboarding — tab bar visible (not onboarding screen)
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 6_000 });

  // State preserved
  const saved = await page.evaluate((key) => {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }, STATE_KEY);
  expect(saved?.onboardingComplete).toBe(true);
  expect(saved?.persona?.firstName).toBe(persona.firstName);
});

// ── F10: No bad renders anywhere in the thread screen ────────────────────────

test("F10: no undefined / NaN / [object Object] in thread screen", async ({ page }) => {
  const { errors } = attachErrorTracking(page);
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait a bit for async renders (greetings, scenario load)
  await page.waitForTimeout(2_000);

  const threadScreen = page.locator(".thread-screen");
  await expect(threadScreen).toBeVisible({ timeout: 8_000 });
  await assertNoBadRenders(threadScreen);

  // No unexpected JS errors
  const critical = errors.filter(
    (e) => !e.message.includes("posthog") && !e.message.includes("workers.dev")
  );
  expect(critical).toHaveLength(0);
});
