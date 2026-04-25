// @ts-check
import { expect } from "@playwright/test";

export const FOUNDER_URL = "/penny/demo/";
export const CPA_URL = "/penny/demo/cpa/";
export const STATE_KEY = "penny-demo-state-v5";

export async function seedFounderState(page, opts = {}) {
  const persona = {
    name: "Alex Carter",
    firstName: "Alex",
    business: "Carter Studio",
    entity: opts.entity || "llc",
    industry: opts.industry || "retail",
  };
  await page.addInitScript(({ key, persona }) => {
    const state = {
      onboardingComplete: true,
      persona,
      tab: "penny",
      overlay: null,
      cpa: { account: null, invites: [], clients: {}, approvals: {}, archives: {} },
      preferences: { notifyCpaActivity: "real-time" },
      paymentMethods: ["Stripe", "Bank transfer"],
      expenseCategories: ["Software", "Office"],
      checkIn: "fri-4",
      bankConnected: "Chase Business",
    };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: STATE_KEY, persona });
  return persona;
}

export async function clearAllStorage(page) {
  await page.addInitScript(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  });
}

export function attachErrorTracking(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push({ type: "pageerror", message: err.message }));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        text.includes("workers.dev") ||
        text.includes("Failed to load resource") ||
        text.includes("posthog") ||
        text.includes("net::ERR") ||
        text.includes("ECONN")
      ) return;
      errors.push({ type: "console", message: text });
    }
  });
  return { errors };
}

export async function assertNoBadRenders(scope) {
  const text = await scope.evaluate((node) => node.innerText);
  const hits = [];
  if (/\bundefined\b/.test(text)) hits.push("undefined");
  if (/\bNaN\b/.test(text)) hits.push("NaN");
  if (/\[object Object\]/.test(text)) hits.push("[object Object]");
  expect(hits, `bad renders found in scope: ${hits.join(", ")}`).toEqual([]);
}

export async function waitForFounderReady(page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".tab-bar, nav").first()).toBeVisible({ timeout: 15_000 });
}

export async function gotoHash(page, hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(150);
}
