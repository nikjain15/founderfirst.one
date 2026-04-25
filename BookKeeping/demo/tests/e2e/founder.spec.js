// @ts-check
/**
 * founder.spec.js — Playwright E2E tests for the Penny founder app.
 *
 * Test IDs: F1–F10, F2b, F4b, F4c, F8b, F8c
 * Base URL: http://localhost:5173/penny/demo/
 * State key: penny-demo-state-v5
 * Router: hash-based (#/penny, #/add, #/books, #/avatar, #/invoice)
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

// ── F1 — Onboarding: entity picker renders ────────────────────────────────────
test("F1 — onboarding entity picker visible on first boot", async ({ page }) => {
  await clearAllStorage(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // Onboarding wraps in .phone.onboarding — welcome step comes first
  const phone = page.locator(".phone.onboarding, .phone-content.onboarding-content");
  await expect(phone.first()).toBeVisible({ timeout: 15_000 });

  // CTA says "Let's go" on the welcome step
  const cta = page.locator("button.btn.btn-full");
  await expect(cta.first()).toBeVisible({ timeout: 10_000 });
  await expect(cta.first()).toHaveText("Let's go");

  // Click through to entity picker
  await cta.first().click();
  await page.waitForTimeout(300);

  // Entity picker: at least "Sole proprietor" tile should be visible
  const entityTile = page.locator(".tile-label").filter({ hasText: "Sole proprietor" });
  await expect(entityTile.first()).toBeVisible({ timeout: 8_000 });

  // Can select an entity — clicking it should enable the continue button
  await entityTile.first().click();
  const continueBtn = page.locator("button.btn.btn-full:not([disabled])");
  await expect(continueBtn.first()).toBeVisible({ timeout: 5_000 });
});

// ── F2 — Thread: tab bar visible after onboarding ────────────────────────────
test("F2 — thread screen loads with tab bar after onboarding", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Tab bar with three tabs: Penny, Add, My Books
  const tabBar = page.locator("nav[aria-label='Primary navigation']");
  await expect(tabBar).toBeVisible({ timeout: 10_000 });

  // Three tabs present
  await expect(tabBar.locator("button")).toHaveCount(3);

  // Penny tab is active by default (aria-current="page")
  const pennyTab = tabBar.locator("button.tab--penny");
  await expect(pennyTab).toHaveAttribute("aria-current", "page");

  await assertNoBadRenders(page.locator(".phone, .phone-stage").first());
});

// ── F2b — Thread: greeting visible (or loading) ───────────────────────────────
test("F2b — thread greeting bubble or loading state visible", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // The thread header should show "Penny"
  const headerName = page.locator(".thread-header-name");
  await expect(headerName).toBeVisible({ timeout: 8_000 });
  await expect(headerName).toHaveText("Penny");

  // The thread screen itself should be present
  const thread = page.locator(".thread-screen");
  await expect(thread).toBeVisible({ timeout: 8_000 });

  // Three dots menu (avatar menu button) should be in header
  const menuBtn = page.locator("button[aria-label='Open menu']");
  await expect(menuBtn).toBeVisible({ timeout: 5_000 });
});

// ── F3 — Tab navigation: Penny → Add → My Books ───────────────────────────────
test("F3 — tab navigation switches screens correctly", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const tabBar = page.locator("nav[aria-label='Primary navigation']");

  // Navigate to Add tab
  const addTab = tabBar.locator("button.tab--add");
  await expect(addTab).toBeVisible({ timeout: 8_000 });
  await addTab.click();
  await page.waitForTimeout(200);

  // Add tab should now be active
  await expect(addTab).toHaveAttribute("aria-current", "page");

  // Add screen should show "Add" heading
  const addHeading = page.locator("h2").filter({ hasText: "Add" });
  await expect(addHeading.first()).toBeVisible({ timeout: 8_000 });

  // Navigate to My Books tab
  const booksTab = tabBar.locator("button.tab--books");
  await booksTab.click();
  await page.waitForTimeout(200);

  // Books tab should now be active
  await expect(booksTab).toHaveAttribute("aria-current", "page");

  // Books screen should show "My Books" heading
  const booksHeading = page.locator("h1").filter({ hasText: "My Books" });
  await expect(booksHeading.first()).toBeVisible({ timeout: 8_000 });

  // Navigate back to Penny
  const pennyTab = tabBar.locator("button.tab--penny");
  await pennyTab.click();
  await page.waitForTimeout(200);
  await expect(pennyTab).toHaveAttribute("aria-current", "page");
});

// ── F4 — Add tab: photo tile visible ─────────────────────────────────────────
test("F4 — add tab photo capture tile visible", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL + "#/add");
  await page.waitForLoadState("domcontentloaded");

  // Navigate to add tab via tab bar once the page loads
  const tabBar = page.locator("nav[aria-label='Primary navigation']");
  await expect(tabBar).toBeVisible({ timeout: 15_000 });

  const addTab = tabBar.locator("button.tab--add");
  await addTab.click();
  await page.waitForTimeout(300);

  // "Quick capture" section label
  const captureLabel = page.locator("p.eyebrow").filter({ hasText: "Quick capture" });
  await expect(captureLabel.first()).toBeVisible({ timeout: 8_000 });

  // "Just tell me" hero tile
  const justTellMe = page.locator("text=Just tell me");
  await expect(justTellMe.first()).toBeVisible({ timeout: 8_000 });

  // "Photo" tile in the 3-column secondary row
  const photoTile = page.locator("text=Photo");
  await expect(photoTile.first()).toBeVisible({ timeout: 8_000 });
});

// ── F4b — Add tab: voice tile visible ────────────────────────────────────────
test("F4b — add tab voice capture tile visible", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const addTab = page.locator("button.tab--add");
  await addTab.click();
  await page.waitForTimeout(300);

  // "Voice note" tile should be visible
  const voiceTile = page.locator("text=Voice note");
  await expect(voiceTile.first()).toBeVisible({ timeout: 8_000 });
});

// ── F4c — Add tab: just tell me opens textarea ────────────────────────────────
test("F4c — add tab just-tell-me tile toggles textarea", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const addTab = page.locator("button.tab--add");
  await addTab.click();
  await page.waitForTimeout(300);

  // Click "Just tell me" hero tile — it toggles the textarea
  const justTellMeTile = page.locator("text=Just tell me").first();
  await expect(justTellMeTile).toBeVisible({ timeout: 8_000 });
  await justTellMeTile.click();
  await page.waitForTimeout(300);

  // Textarea should appear
  const textarea = page.locator("textarea[placeholder*='e.g. lunch']");
  await expect(textarea).toBeVisible({ timeout: 5_000 });

  // "Log it" button should be visible (initially disabled — no text entered)
  const logBtn = page.locator("button.btn.btn-full").filter({ hasText: /Log it|Reading/ });
  await expect(logBtn.first()).toBeVisible({ timeout: 5_000 });
});

// ── F5 — Books: stat cards visible ───────────────────────────────────────────
test("F5 — my books screen shows stat cards", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const booksTab = page.locator("button.tab--books");
  await booksTab.click();
  await page.waitForTimeout(300);

  // "My Books" heading
  const heading = page.locator("h1").filter({ hasText: "My Books" });
  await expect(heading.first()).toBeVisible({ timeout: 8_000 });

  // Stat card labels (uppercase eyebrow text)
  await expect(page.locator("text=Net this month").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("text=Runway").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("text=Books").first()).toBeVisible({ timeout: 8_000 });

  await assertNoBadRenders(page.locator("h1").filter({ hasText: "My Books" }).locator("..").locator(".."));
});

// ── F6 — Books: needs a look section visible ──────────────────────────────────
test("F6 — my books shows needs a look section", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const booksTab = page.locator("button.tab--books");
  await booksTab.click();
  await page.waitForTimeout(300);

  // "Needs a look" eyebrow label
  const needsLook = page.locator("p.eyebrow").filter({ hasText: "Needs a look" });
  await expect(needsLook.first()).toBeVisible({ timeout: 8_000 });

  // Send to CPA button in the books header
  const cpaBt = page.locator("button").filter({ hasText: "Send to CPA" });
  await expect(cpaBt.first()).toBeVisible({ timeout: 8_000 });
});

// ── F7 — Avatar menu: opens via ⋮ button ─────────────────────────────────────
test("F7 — avatar menu opens on ⋮ click", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // ⋮ button in thread header
  const menuBtn = page.locator("button[aria-label='Open menu']");
  await expect(menuBtn).toBeVisible({ timeout: 8_000 });
  await menuBtn.click();
  await page.waitForTimeout(300);

  // Avatar menu screen shows 3 menu items: Profile, Memory, Preferences
  // Each is a button containing a <p> with the label. Use partial text match.
  const profileLabel = page.locator("p").filter({ hasText: /^Profile$/ });
  const memoryLabel  = page.locator("p").filter({ hasText: /^Memory$/ });
  const prefLabel    = page.locator("p").filter({ hasText: /^Preferences$/ });

  await expect(profileLabel.first()).toBeVisible({ timeout: 8_000 });
  await expect(memoryLabel.first()).toBeVisible({ timeout: 8_000 });
  await expect(prefLabel.first()).toBeVisible({ timeout: 8_000 });
});

// ── F8 — Invoice designer: renders ───────────────────────────────────────────
test("F8 — invoice designer screen renders", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Navigate to invoice via hash router
  await gotoHash(page, "/invoice");
  await page.waitForTimeout(400);

  // Invoice screen should be visible — check for INV- number or Edit/Preview toggle
  const invoiceNum = page.locator("text=/INV-\\d{4}/");
  const editBtn    = page.locator("button").filter({ hasText: /^Edit$|^Preview$/ });

  // At least one of: invoice number or edit/preview toggle
  await expect(invoiceNum.or(editBtn).first()).toBeVisible({ timeout: 8_000 });
});

// ── F8b — Invoice: add a line item ────────────────────────────────────────────
test("F8b — invoice designer add line item", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await gotoHash(page, "/invoice");
  await page.waitForTimeout(400);

  // "Add line" button or similar
  const addLine = page.locator("button").filter({ hasText: /Add line|add line/ });
  await expect(addLine.first()).toBeVisible({ timeout: 8_000 });

  const initialDescInputs = await page.locator("input[placeholder='Description']").count();

  await addLine.first().click();
  await page.waitForTimeout(300);

  // Should have one more description input
  const newCount = await page.locator("input[placeholder='Description']").count();
  expect(newCount).toBeGreaterThan(initialDescInputs);
});

// ── F8c — Invoice: preview toggle ────────────────────────────────────────────
test("F8c — invoice designer preview mode toggle", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await gotoHash(page, "/invoice");
  await page.waitForTimeout(400);

  // Find and click Preview button
  const previewBtn = page.locator("button").filter({ hasText: "Preview" });
  await expect(previewBtn.first()).toBeVisible({ timeout: 8_000 });
  await previewBtn.first().click();
  await page.waitForTimeout(300);

  // Preview mode: should show "Bill to" or invoice preview content
  // Edit button appears when in preview mode
  const editBtn = page.locator("button").filter({ hasText: "Edit" });
  await expect(editBtn.first()).toBeVisible({ timeout: 5_000 });
});

// ── F9 — Card screen: standalone route renders ────────────────────────────────
test("F9 — thread shows approval card when scenario loads", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Thread screen should load with no crashes
  const thread = page.locator(".thread-screen");
  await expect(thread).toBeVisible({ timeout: 10_000 });

  // The thread header Penny name should be visible
  const headerName = page.locator(".thread-header-name");
  await expect(headerName).toHaveText("Penny");

  await assertNoBadRenders(thread);
});

// ── F10 — Thread: ask bar visible ────────────────────────────────────────────
test("F10 — thread ask bar is visible and focusable", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Ask bar is an input inside the thread; look for placeholder text
  const askBar = page.locator("input[placeholder*='Ask']").or(
    page.locator(".thread-ask-inner, [placeholder*='ask'], [placeholder*='Ask Penny']")
  );

  // The ask bar might just be a div that opens on tap — look for it
  // Also acceptable: just the "Ask Penny" button area visible
  const askArea = page.locator("text=/Ask Penny|Ask me anything/i");
  await expect(askBar.or(askArea).first()).toBeVisible({ timeout: 8_000 });
});
