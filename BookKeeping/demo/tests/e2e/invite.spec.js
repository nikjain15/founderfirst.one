// @ts-check
/**
 * invite.spec.js — Playwright E2E tests for the CPA invite flow.
 *
 * Test IDs: E1
 * Tests the founder-side invite sheet in My Books and the CPA-side accept link.
 */
import { test, expect } from "@playwright/test";
import {
  FOUNDER_URL,
  CPA_URL,
  STATE_KEY,
  seedFounderState,
  attachErrorTracking,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// E1 — Founder can open the "Send to CPA" sheet and generate an invite link
// ---------------------------------------------------------------------------
test("E1: Send to CPA sheet opens and Invite tab shows the invite form", async ({ page }) => {
  await seedFounderState(page, { entity: "sole-prop", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // Wait for tab bar
  await expect(page.locator("nav.tab-bar")).toBeVisible({ timeout: 15_000 });

  // Navigate to My Books
  await page.locator("nav.tab-bar button.tab--books").click();
  await page.waitForTimeout(300);

  // "My Books" heading is visible
  await expect(page.locator("h1").filter({ hasText: "My Books" })).toBeVisible({ timeout: 8_000 });

  // Click "Send to CPA" button in the header
  const sendCpaBtn = page.locator("button").filter({ hasText: "Send to CPA" });
  await expect(sendCpaBtn).toBeVisible({ timeout: 5_000 });
  await sendCpaBtn.click();

  // Sheet opens with "Send to CPA" title
  const sheet = page.locator(".sheet-backdrop");
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("p").filter({ hasText: "Send to CPA" })).toBeVisible({ timeout: 3_000 });

  // Click the "Invite to live books" tab
  const inviteTab = page.locator("button").filter({ hasText: "Invite to live books" });
  await expect(inviteTab).toBeVisible({ timeout: 3_000 });
  await inviteTab.click();

  // Invite form shows the email input
  const emailInput = page.locator("input[placeholder='CPA email address']");
  await expect(emailInput).toBeVisible({ timeout: 3_000 });

  // Type a CPA email
  await emailInput.fill("cpa@example.com");

  // "Generate invite link" button becomes enabled
  const generateBtn = page.locator("button").filter({ hasText: "Generate invite link" });
  await expect(generateBtn).toBeEnabled({ timeout: 3_000 });

  // Click generate
  await generateBtn.click();

  // Toast or invite link appears
  // Either a toast "Invite link created." or the invite link UI
  const inviteCreated = page.locator("[role='status']");
  await expect(inviteCreated).toBeVisible({ timeout: 5_000 });
});
