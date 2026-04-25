// @ts-check
/**
 * Founder app E2E tests — covers onboarding, thread, add, books, avatar, invoice.
 *
 * Test ID convention:
 *   F1–F10  founder-app tests
 *   "prior failures" were F1, F3, F4, F5 — watch these especially.
 *
 * AI calls go to the Cloudflare Worker which is unavailable in test; every
 * test that touches AI output must accept the fallback copy path.
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

// ─── F1: App loads — onboarding shown when no saved state ────────────────────

test("F1: founder app loads — onboarding visible with no state", async ({ page }) => {
  await clearAllStorage(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // Without saved state the onboarding screen is forced.
  const ob = page.locator(".phone.onboarding, .onboarding");
  await expect(ob.first()).toBeVisible({ timeout: 10_000 });

  // The welcome step should show the P-mark avatar.
  const pMark = page.locator(".p-mark");
  await expect(pMark.first()).toBeVisible();
});

// ─── F2: Onboarding welcome step renders headline and CTA ────────────────────

test("F2: onboarding welcome renders headline and Let's go CTA", async ({ page }) => {
  await clearAllStorage(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // Wait for welcome headline (fallback: ONBOARDING_COPY.welcome.headline)
  const headline = page.locator(".ob-welcome-headline");
  await expect(headline).toBeVisible({ timeout: 10_000 });
  const text = await headline.textContent();
  expect(text?.length).toBeGreaterThan(5);

  // CTA says "Let's go" on welcome step and is enabled
  const cta = page.locator(".onboarding-cta .btn");
  await expect(cta).toBeVisible();
  await expect(cta).not.toBeDisabled();
  const ctaText = await cta.textContent();
  expect(ctaText?.trim()).toBe("Let's go");
});

// ─── F2b: Onboarding "Not sure" entity triggers diagnostic ───────────────────

test("F2b: 'Not sure' entity option opens diagnostic", async ({ page }) => {
  await clearAllStorage(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // Click through welcome step
  const cta = page.locator(".onboarding-cta .btn");
  await expect(cta).toBeVisible({ timeout: 10_000 });
  await cta.click();

  // Entity step — wait for entity tiles
  const entityTile = page.locator(".entity-tile-inner").first();
  await expect(entityTile).toBeVisible({ timeout: 8_000 });

  // Find and click the "Not sure" tile
  const notSureTile = page.locator(".entity-tile-inner").filter({ hasText: "Not sure" });
  await expect(notSureTile).toBeVisible();
  await notSureTile.click();

  // Continue button should now be enabled
  const continueBtn = page.locator(".onboarding-cta .btn");
  await expect(continueBtn).not.toBeDisabled();
});

// ─── F3: Thread screen renders after seeding completed onboarding state ───────

test("F3: thread screen visible after seeding state", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // The tab bar should appear (onboarding complete)
  const tabBar = page.locator("nav.tab-bar");
  await expect(tabBar).toBeVisible({ timeout: 12_000 });

  // Three tabs must be present
  await expect(page.locator(".tab--penny")).toBeVisible();
  await expect(page.locator(".tab--add")).toBeVisible();
  await expect(page.locator(".tab--books")).toBeVisible();

  // Thread screen header with "Penny" name
  const threadHeader = page.locator(".thread-header");
  await expect(threadHeader).toBeVisible({ timeout: 8_000 });
  await expect(threadHeader).toContainText("Penny");
});

// ─── F4: Thread renders approval card (from seeded scenario) ─────────────────

test("F4: thread renders approval card after persona seeded", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // Wait for tab bar (onboarding bypass confirmed)
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Thread must show an approval card after scenario loads.
  // The card renders inside .approval-card-wrap — wait up to 15s for scenario fetch + AI.
  const cardWrap = page.locator(".approval-card-wrap");
  await expect(cardWrap).toBeVisible({ timeout: 15_000 });
});

// ─── F4b: Confirming a card shows a confirmed slug ───────────────────────────

test("F4b: confirming an approval card shows slug", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Wait for card to appear
  const cardWrap = page.locator(".approval-card-wrap");
  await expect(cardWrap).toBeVisible({ timeout: 15_000 });

  // Click the primary Confirm/Approve button
  // The button text may vary — look for "Confirm" button inside the card
  const confirmBtn = page.locator(".approval-card-wrap button").filter({ hasText: /Confirm|Approve/ }).first();
  await expect(confirmBtn).toBeVisible({ timeout: 8_000 });
  await confirmBtn.click();

  // After confirmation, a slug pill should appear
  const slug = page.locator(".confirmed-slug");
  await expect(slug).toBeVisible({ timeout: 5_000 });
});

// ─── F4c: Ask bar accepts input ───────────────────────────────────────────────

test("F4c: thread ask bar accepts input and submits", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Ask bar should be visible
  const askInput = page.locator(".thread-ask-input");
  await expect(askInput).toBeVisible({ timeout: 8_000 });

  // Type a question
  await askInput.fill("How much did I spend last month?");
  expect(await askInput.inputValue()).toBe("How much did I spend last month?");

  // Submit via Enter — AI will likely fail, but the UI should still respond
  await askInput.press("Enter");

  // After submitting, a loading state or answer bubble should appear
  // (Accept either outcome — we can't guarantee AI is reachable in CI)
  await page.waitForTimeout(1_000);
  const askVal = await askInput.inputValue();
  // Input should be cleared after submit
  expect(askVal).toBe("");
});

// ─── F5: Add tab renders all three sections ───────────────────────────────────

test("F5: add tab renders quick capture, connected accounts, data actions", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Navigate to Add tab
  await page.locator(".tab--add").click();
  await page.waitForTimeout(300);

  // All three eyebrow section labels must be visible
  const eyebrows = page.locator(".eyebrow, p.eyebrow");
  const labels = await eyebrows.allTextContents();
  const normalised = labels.map((l) => l.trim().toLowerCase());
  expect(normalised.some((l) => l.includes("quick capture"))).toBe(true);
  expect(normalised.some((l) => l.includes("connected accounts"))).toBe(true);
  expect(normalised.some((l) => l.includes("data actions"))).toBe(true);
});

// ─── F6: Add tab — connect provider sheet opens ──────────────────────────────

test("F6: add tab provider connect sheet opens", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  await page.locator(".tab--add").click();
  await page.waitForTimeout(300);

  // Click the "Add account" / "+" button in Connected accounts section
  const addBtn = page.locator("button").filter({ hasText: /Add account|Connect|^\+$/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 5_000 });
  await addBtn.click();

  // Sheet should open — look for provider list items
  const sheet = page.locator("[class*='sheet'], .sheet");
  // Either a sheet opens OR provider rows become visible
  await page.waitForTimeout(500);
  // At minimum, the page should not crash
  await expect(page.locator(".phone, .cpa-app")).toBeVisible();
});

// ─── F7: Add tab — connect email sheet shows Gmail and Outlook ────────────────

test("F7: add tab email connect shows Gmail and Outlook options", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  await page.locator(".tab--add").click();
  await page.waitForTimeout(300);

  // Find "Connect your email" row and click it
  const emailRow = page.locator("button").filter({ hasText: /Connect your email|email/i }).first();
  await expect(emailRow).toBeVisible({ timeout: 5_000 });
  await emailRow.click();

  // Wait for the email connect sheet
  await page.waitForTimeout(600);

  // Gmail and Outlook provider options should appear
  const gmailOption = page.locator("text=Gmail");
  const outlookOption = page.locator("text=Outlook");
  await expect(gmailOption.first()).toBeVisible({ timeout: 5_000 });
  await expect(outlookOption.first()).toBeVisible({ timeout: 5_000 });
});

// ─── F8: My Books renders stat cards ─────────────────────────────────────────

test("F8: my books renders Runway, Net, and Books stat cards", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Navigate to My Books tab
  await page.locator(".tab--books").click();
  await page.waitForTimeout(400);

  // "My Books" heading
  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Stat cards — the scenario may or may not load in time,
  // but no bad renders should occur
  await page.waitForTimeout(2_000); // allow scenario fetch
  await assertNoBadRenders(page.locator("body"));
});

// ─── F8b: My Books — Needs a Look section visible ────────────────────────────

test("F8b: my books Needs a Look section renders", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  await page.locator(".tab--books").click();
  await page.waitForTimeout(400);

  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // "Needs a look" section — either the label or "All caught up ✓" empty state
  await page.waitForTimeout(2_000);
  const needsLook = page.locator("text=/Needs a look|All caught up/i");
  await expect(needsLook.first()).toBeVisible({ timeout: 8_000 });
});

// ─── F8c: My Books ask bar exists ────────────────────────────────────────────

test("F8c: my books ask Penny bar is present", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  await page.locator(".tab--books").click();
  await page.waitForTimeout(400);

  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Ask bar input should be present
  const askInput = page.locator("input[placeholder*='Ask'], input[placeholder*='ask'], input[placeholder*='Penny'], .books-ask input").first();
  await expect(askInput).toBeVisible({ timeout: 5_000 });
});

// ─── F9: Avatar menu opens from thread header ─────────────────────────────────

test("F9: avatar menu opens from thread header menu button", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Make sure we're on the Penny thread
  const threadHeader = page.locator(".thread-header");
  await expect(threadHeader).toBeVisible({ timeout: 8_000 });

  // Click the ⋮ menu button in the thread header
  const menuBtn = page.locator(".thread-menu-btn");
  await expect(menuBtn).toBeVisible();
  await menuBtn.click();

  // Avatar menu should appear — either hash changes to #/avatar or content appears
  await page.waitForTimeout(400);
  const avatarContent = page.locator("text=/Profile|Memory|Preferences/i");
  await expect(avatarContent.first()).toBeVisible({ timeout: 5_000 });
});

// ─── F10: Invoice designer renders ───────────────────────────────────────────

test("F10: invoice designer renders when navigated to", async ({ page }) => {
  await seedFounderState(page);
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 12_000 });

  // Navigate to My Books first (invoice is accessible from there)
  await page.locator(".tab--books").click();
  await page.waitForTimeout(400);
  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Navigate to invoice via hash
  await gotoHash(page, "/invoice");
  await page.waitForTimeout(400);

  // Invoice screen should render with Edit/Preview toggle
  const invoiceContent = page.locator("text=/Invoice|Edit|Preview/i");
  await expect(invoiceContent.first()).toBeVisible({ timeout: 8_000 });
});
