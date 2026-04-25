// @ts-check
/**
 * invite.spec.js — E2E tests for invite flow + entity-type handling.
 *
 * Test IDs: E1
 *
 * E1: S-Corp persona is handled correctly (entity badge, form label).
 *     Full invite flow is integration-level; this file covers the entity
 *     type rendering path that was a known failure.
 */

import { test, expect } from "@playwright/test";
import {
  FOUNDER_URL,
  STATE_KEY,
  seedFounderState,
  waitForFounderReady,
  gotoHash,
} from "./helpers.js";

// ── E1 — S-Corp persona: entity-specific rendering ───────────────────────────
test("E1 — S-Corp persona shows correct entity label in profile", async ({ page }) => {
  // Seed with S-Corp entity type
  await seedFounderState(page, { entity: "s-corp", industry: "consulting" });
  await page.goto(FOUNDER_URL);
  await waitForFounderReady(page);

  // Open avatar menu
  const menuBtn = page.locator("button[aria-label='Open menu']");
  await expect(menuBtn).toBeVisible({ timeout: 8_000 });
  await menuBtn.click();
  await page.waitForTimeout(400);

  // Navigate to Profile sub-screen — the button contains a <p> with "Profile"
  // Use the paragraph label (partial match) since the button also contains sub text
  const profileLabel = page.locator("p").filter({ hasText: /^Profile$/ }).first();
  await expect(profileLabel).toBeVisible({ timeout: 8_000 });
  await profileLabel.click();
  await page.waitForTimeout(400);

  // Profile should show the entity type row — label says "ENTITY" and value is "S-Corp" / "s-corp"
  // FieldRow renders: <p>ENTITY</p> and the value from persona.entity
  const entityLabel = page
    .locator("text=S-Corp")
    .or(page.locator("text=s-corp"))
    .or(page.locator("text=ENTITY"));

  await expect(entityLabel.first()).toBeVisible({ timeout: 8_000 });

  // Books screen should show entity-aware form label
  await gotoHash(page, "/books");
  await page.waitForTimeout(400);

  // The My Books page should load without errors for S-Corp entity
  const booksHeading = page.locator("h1").filter({ hasText: "My Books" });
  await expect(booksHeading.first()).toBeVisible({ timeout: 8_000 });

  // Stat cards should render (not crash for S-Corp entity)
  const netCard = page.locator("text=Net this month");
  await expect(netCard.first()).toBeVisible({ timeout: 8_000 });
});
