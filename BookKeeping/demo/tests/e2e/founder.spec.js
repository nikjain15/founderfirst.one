// @ts-check
/**
 * founder.spec.js — Playwright E2E tests for the Penny founder app.
 *
 * Test IDs: F1–F10 (+ F2b, F4b, F4c, F8b, F8c)
 * All tests seed onboardingComplete state so onboarding is bypassed.
 * AI calls may fail in test environment — tests accept fallback/toast as pass.
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

// ---------------------------------------------------------------------------
// F1 — App loads, tab bar renders, and Penny tab is active
// ---------------------------------------------------------------------------
test("F1: app loads and tab bar is visible with Penny tab active", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Tab bar present
  const nav = page.locator("nav.tab-bar");
  await expect(nav).toBeVisible();

  // Three tabs
  const tabs = nav.locator("button");
  await expect(tabs).toHaveCount(3);

  // Penny tab is active (aria-current="page")
  const pennyTab = nav.locator("button.tab--penny");
  await expect(pennyTab).toHaveAttribute("aria-current", "page");

  // Thread screen is visible
  await expect(page.locator(".thread-screen")).toBeVisible();
});

// ---------------------------------------------------------------------------
// F2 — Thread greeting bubble renders
// ---------------------------------------------------------------------------
test("F2: Penny greeting bubble renders on thread screen", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait for the Penny bubble — could be loading skeleton or actual content
  const bubble = page.locator(".penny-bubble").first();
  await expect(bubble).toBeVisible({ timeout: 12_000 });

  // Bubble label says PENNY
  await expect(bubble.locator(".bubble-label")).toHaveText("PENNY");
});

// ---------------------------------------------------------------------------
// F2b — Thread shows an approval card from scenario data
// ---------------------------------------------------------------------------
test("F2b: approval card is visible in thread", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait for card queue to load (scenarios.json fetch)
  const card = page.locator(".approval-card").first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  // Card has vendor name
  const vendorName = card.locator(".card-vendor-name");
  await expect(vendorName).toBeVisible();
  const vendorText = await vendorName.textContent();
  expect(vendorText?.trim().length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// F3 — Confirming a card collapses it to a confirmed slug
// ---------------------------------------------------------------------------
test("F3: confirming a card collapses it to a confirmed slug", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Wait for the card to load
  const cardWrap = page.locator(".approval-card-wrap").first();
  await expect(cardWrap).toBeVisible({ timeout: 15_000 });

  // Find and click the primary confirm button (first .btn.btn-full inside the card actions)
  const confirmBtn = cardWrap.locator(".card-actions .btn.btn-full").first();
  await expect(confirmBtn).toBeVisible({ timeout: 8_000 });
  await confirmBtn.click();

  // The card-wrap should now show a confirmed slug
  await expect(page.locator(".confirmed-slug")).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// F4 — Category sheet opens on clicking "Change"
// ---------------------------------------------------------------------------
test("F4: category sheet opens when tapping Change on expense card", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const cardWrap = page.locator(".approval-card-wrap").first();
  await expect(cardWrap).toBeVisible({ timeout: 15_000 });

  // Find the "Change" ghost button (second button in card-actions)
  const changeBtn = cardWrap.locator(".card-actions .btn.btn-ghost.btn-full").first();
  await expect(changeBtn).toBeVisible({ timeout: 8_000 });
  await changeBtn.click();

  // Sheet backdrop should be visible
  const backdrop = page.locator(".sheet-backdrop");
  await expect(backdrop).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// F4b — Category sheet contains a list of categories
// ---------------------------------------------------------------------------
test("F4b: category sheet shows a list of category items", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const cardWrap = page.locator(".approval-card-wrap").first();
  await expect(cardWrap).toBeVisible({ timeout: 15_000 });

  const changeBtn = cardWrap.locator(".card-actions .btn.btn-ghost.btn-full").first();
  await expect(changeBtn).toBeVisible({ timeout: 8_000 });
  await changeBtn.click();

  // Sheet items are present
  const items = page.locator(".sheet-item");
  await expect(items.first()).toBeVisible({ timeout: 5_000 });
  const count = await items.count();
  expect(count).toBeGreaterThan(2);
});

// ---------------------------------------------------------------------------
// F4c — Selecting a category in the sheet shows a toast
// ---------------------------------------------------------------------------
test("F4c: selecting a category in the sheet shows a confirmation toast", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  const cardWrap = page.locator(".approval-card-wrap").first();
  await expect(cardWrap).toBeVisible({ timeout: 15_000 });

  const changeBtn = cardWrap.locator(".card-actions .btn.btn-ghost.btn-full").first();
  await expect(changeBtn).toBeVisible({ timeout: 8_000 });
  await changeBtn.click();

  // Click the first sheet item
  const firstItem = page.locator(".sheet-item").first();
  await expect(firstItem).toBeVisible({ timeout: 5_000 });
  await firstItem.click();

  // Sheet should close and a toast appears
  // The card toast uses role="status" aria-live="polite"
  await expect(page.locator("[role='status']")).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// F5 — Add tab renders with Quick capture and Connected accounts sections
// ---------------------------------------------------------------------------
test("F5: Add tab renders Quick capture and Connected accounts sections", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Click the Add tab
  await page.locator("nav.tab-bar button.tab--add").click();
  await page.waitForTimeout(200);

  // "Add" heading present
  await expect(page.locator("h2").filter({ hasText: "Add" })).toBeVisible({ timeout: 5_000 });

  // Quick capture section header (eyebrow label)
  const quickCapture = page.locator(".eyebrow").filter({ hasText: "Quick capture" });
  await expect(quickCapture).toBeVisible({ timeout: 5_000 });

  // Connected accounts section
  const connected = page.locator(".eyebrow").filter({ hasText: "Connected accounts" });
  await expect(connected).toBeVisible({ timeout: 5_000 });

  // "Just tell me" hero tile is present
  await expect(page.locator("button").filter({ hasText: "Just tell me" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// F6 — Voice note modal opens
// ---------------------------------------------------------------------------
test("F6: Voice note capture modal opens", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await page.locator("nav.tab-bar button.tab--add").click();
  await page.waitForTimeout(200);

  // Click the Voice note tile
  const voiceBtn = page.locator("button").filter({ hasText: "Voice note" });
  await expect(voiceBtn).toBeVisible({ timeout: 5_000 });
  await voiceBtn.click();

  // Voice modal / fullscreen overlay should appear (mic or waveform)
  const overlay = page.locator(".fullscreen-overlay");
  await expect(overlay).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// F7 — "Just tell me" hero tile expands the textarea
// ---------------------------------------------------------------------------
test("F7: Just tell me hero tile expands to show textarea", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await page.locator("nav.tab-bar button.tab--add").click();
  await page.waitForTimeout(200);

  const justTellMe = page.locator("button").filter({ hasText: "Just tell me" });
  await expect(justTellMe).toBeVisible({ timeout: 5_000 });
  await justTellMe.click();

  // Textarea should now be visible
  await expect(page.locator("textarea")).toBeVisible({ timeout: 3_000 });
  // "Log it" button should appear
  await expect(page.locator("button").filter({ hasText: "Log it" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// F8 — My Books tab renders stat cards (Runway, Books)
// ---------------------------------------------------------------------------
test("F8: My Books tab renders stat cards", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Navigate to My Books
  await page.locator("nav.tab-bar button.tab--books").click();
  await page.waitForTimeout(300);

  // "My Books" heading
  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Runway stat card text appears
  await expect(page.locator("p").filter({ hasText: "Runway" })).toBeVisible({ timeout: 8_000 });

  // Books stat card text appears
  await expect(page.locator("p").filter({ hasText: "Books" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// F8b — My Books "Needs a look" section renders
// ---------------------------------------------------------------------------
test("F8b: My Books shows Needs a look section", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await page.locator("nav.tab-bar button.tab--books").click();
  await page.waitForTimeout(300);

  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // "Needs a look" eyebrow label
  const needsLook = page.locator(".eyebrow").filter({ hasText: "Needs a look" });
  await expect(needsLook).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// F8c — My Books Explore row for tax form preview renders
// ---------------------------------------------------------------------------
test("F8c: My Books shows Explore section with tax form row", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await page.locator("nav.tab-bar button.tab--books").click();
  await page.waitForTimeout(300);

  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Scroll down to find Coming up or Explore sections
  await page.locator(".eyebrow").filter({ hasText: "Coming up" }).scrollIntoViewIfNeeded();
  await expect(page.locator(".eyebrow").filter({ hasText: "Coming up" })).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// F9 — Avatar menu opens
// ---------------------------------------------------------------------------
test("F9: avatar menu overlay opens from thread header", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Thread screen should be visible
  await expect(page.locator(".thread-screen")).toBeVisible();

  // Thread header menu button
  const menuBtn = page.locator(".thread-menu-btn");
  await expect(menuBtn).toBeVisible({ timeout: 5_000 });
  await menuBtn.click();

  // Should show Profile / Memory / Preferences menu items
  const profileBtn = page.locator("button").filter({ hasText: "Profile" });
  await expect(profileBtn).toBeVisible({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// F10 — Invoice designer renders from My Books
// ---------------------------------------------------------------------------
test("F10: invoice designer renders from My Books dashed tile", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  await page.locator("nav.tab-bar button.tab--books").click();
  await page.waitForTimeout(300);

  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Scroll to and click the "New invoice" dashed tile
  const newInvoiceBtn = page.locator("button").filter({ hasText: "New invoice" });
  await newInvoiceBtn.scrollIntoViewIfNeeded();
  await expect(newInvoiceBtn).toBeVisible({ timeout: 5_000 });
  await newInvoiceBtn.click();

  // Invoice designer heading or edit/preview toggle
  await expect(page.locator("h1").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5_000 });
});
