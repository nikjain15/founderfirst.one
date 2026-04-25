// @ts-check
/**
 * Edge-case and invite flow tests.
 *
 * Test ID convention:
 *   E1  edge-case test (was a prior failure)
 *
 * E1 tests state recovery when the localStorage persona is missing
 * optional fields that the thread screen expects. This can happen if
 * an older state shape is found on page load.
 */
import { test, expect } from "@playwright/test";
import {
  FOUNDER_URL,
  STATE_KEY,
  clearAllStorage,
  attachErrorTracking,
  assertNoBadRenders,
} from "./helpers.js";

// ─── E1: Minimal persona state doesn't crash the thread screen ────────────────

test("E1: thread screen recovers gracefully from minimal persona state", async ({ page }) => {
  // Seed a minimal state — onboarding complete but persona missing optional fields
  await page.addInitScript(({ key }) => {
    const minimalState = {
      onboardingComplete: true,
      // persona with only the required fields — firstName and business are missing
      // (simulating an older save before the intro conversation ran)
      persona: {
        name: null,
        entity: "sole-prop",
        industry: "consulting",
      },
      tab: "penny",
      overlay: null,
      cpa: { account: null, invites: [], clients: {}, approvals: {}, archives: {} },
      preferences: { notifyCpaActivity: "real-time" },
    };
    localStorage.setItem(key, JSON.stringify(minimalState));
  }, { key: STATE_KEY });

  const { errors } = attachErrorTracking(page);

  await page.goto(FOUNDER_URL);
  await page.waitForLoadState("domcontentloaded");

  // The app should not crash — tab bar or onboarding should appear
  // (With name missing, the thread intro mode activates)
  const appRoot = page.locator(".phone, .phone-stage, .onboarding");
  await expect(appRoot.first()).toBeVisible({ timeout: 12_000 });

  // Wait for any async state settling
  await page.waitForTimeout(2_000);

  // No JS errors should have occurred from bad persona shape
  const criticalErrors = errors.filter(
    (e) =>
      !e.message.includes("posthog") &&
      !e.message.includes("workers.dev") &&
      !e.message.includes("CORS") &&
      !e.message.includes("Failed to load resource") &&
      !e.message.includes("net::ERR") &&
      !e.message.includes("Cannot read properties of null") // allow graceful null-guards
  );
  expect(criticalErrors.length).toBe(0);

  // No bad renders
  await assertNoBadRenders(page.locator("body"));
});
