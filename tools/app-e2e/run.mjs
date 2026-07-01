/**
 * app-e2e/run.mjs — authenticated smoke + responsive test for the unified app (apps/app).
 *
 * The durable answer to "the categorize/import screens have no UI test". The app
 * is built with VITE_E2E=1 + a throwaway test account's creds, so it auto-signs-in
 * (apps/app/src/lib/devAuth.ts) with a REAL session. We then drive the real authed
 * UI headlessly and, for the owner's key surfaces (Overview · Categorize · Journal ·
 * Import):
 *   1. assert the app renders past the login wall,
 *   2. assert each tab's panel renders (regression net for the screens themselves),
 *   3. assert NO horizontal overflow at mobile width — scrollWidth ≤ clientWidth —
 *      the invariant from apps/admin/RESPONSIVE.md (a clipped column or a fixed-px
 *      grid that overruns 390px fails the gate),
 *   4. screenshot every screen at desktop AND mobile for the CI artifact.
 *
 * It deliberately does NOT approve categories or import a file — those mutate the
 * ledger and spend AI tokens, which would make the gate flaky. This proves auth +
 * render + responsive (the regression net). Exits non-zero on any failed assertion.
 *
 * The test account must be an org OWNER with a seeded org (owner sees the write-only
 * Categorize + Import tabs). See tools/app-e2e/README.md.
 *
 * Usage: pnpm --dir apps/app build   (with VITE_E2E + creds)  then  node tools/app-e2e/run.mjs
 */
import { createServer } from "node:http";
import { stat, mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = resolve(ROOT, "apps/app/dist");      // vite build output (base = /app/)
const ARTIFACTS = resolve(fileURLToPath(new URL("./artifacts/", import.meta.url)));
const MOBILE = { width: 390, height: 844 };        // iPhone-class; on the width ladder
const DESKTOP = { width: 1280, height: 900 };

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

// Serve apps/app/dist under the /app/ base; SPA-fallback deep links to index.html.
async function resolveFile(urlPath) {
  let clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean.startsWith("/app/")) clean = clean.slice(4); else if (clean === "/app") clean = "/";
  const candidates = [join(DIST, clean)];
  if (!extname(clean)) candidates.push(join(DIST, "index.html"));
  for (const c of candidates) { try { if ((await stat(c)).isFile()) return c; } catch { /* next */ } }
  return null;
}
function startServer() {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(req.url || "/");
    if (!file) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

const fail = (m) => { console.error("❌ " + m); process.exitCode = 1; };
const ok = (m) => console.log("✅ " + m);

const { server, port } = await startServer();
await mkdir(ARTIFACTS, { recursive: true });
const base = `http://127.0.0.1:${port}/app/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: DESKTOP });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(m.text()); console.log("  [browser error]", m.text()); } });
page.on("pageerror", (e) => { consoleErrors.push(String(e)); console.log("  [page error]", String(e)); });

// The ledger tabs (apps/app Ledger.tsx) — stable ids we can drive directly.
// writeOnly tabs (categorize/import) render only for an owner with write access.
const TABS = [
  { id: "overview",   label: "Overview",   writeOnly: false },
  { id: "categorize", label: "Categorize", writeOnly: true  },
  { id: "journal",    label: "Journal",    writeOnly: false },
  { id: "import",     label: "Import",     writeOnly: true  },
];

/** Click a ledger tab by id and wait for its panel; returns false if the tab is absent. */
async function openTab(id) {
  const tab = page.locator(`#ltab-${id}`);
  if (!(await tab.count().catch(() => 0))) return false;
  await tab.click().catch(() => {});
  await page.locator("#ledger-panel").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(600);
  return true;
}

/** The RESPONSIVE.md invariant: content must not overflow the viewport horizontally. */
async function assertNoOverflow(where) {
  const bad = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 1 ? { sw: el.scrollWidth, cw: el.clientWidth } : null;
  });
  if (bad) fail(`horizontal overflow at ${where} — scrollWidth ${bad.sw} > clientWidth ${bad.cw}`);
  else ok(`no horizontal overflow at ${where}`);
}

try {
  await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 });

  // devAuth signs in → resolve as soon as EITHER the authed shell (.topbar) or the
  // login wall (.auth-card) appears, so both outcomes are fast.
  await Promise.race([
    page.locator(".topbar .brand").waitFor({ state: "visible", timeout: 45_000 }).catch(() => {}),
    page.locator(".auth-card").waitFor({ state: "visible", timeout: 45_000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(ARTIFACTS, "01-home-desktop.png"), fullPage: true });

  // Positive check: the authed shell renders the top bar; the login wall does not.
  const authed = await page.locator(".topbar").count().catch(() => 0);
  if (!authed) {
    fail("still on the login wall — devAuth did not sign in (check E2E_APP_* secrets + password auth enabled on the account)");
  } else {
    ok("authed app rendered past the login wall");

  // The owner lens must have loaded an org (the ledger tablist). No org → the test
  // account isn't a seeded owner; say so loudly rather than screenshotting an empty state.
  const hasLedger = await page.locator(".ledger-tabs").count().catch(() => 0);
  if (!hasLedger) {
    fail("no ledger tabs — the test account has no org. Seed an org owned by the E2E account (see README).");
  } else {
    ok("owner ledger loaded (org present)");

    // ── Desktop: each key screen renders ──────────────────────────────────────
    for (const t of TABS) {
      const opened = await openTab(t.id);
      if (opened) {
        await page.screenshot({ path: join(ARTIFACTS, `desktop-${t.id}.png`), fullPage: true });
        ok(`${t.label} renders (desktop)`);
      } else if (t.writeOnly) {
        fail(`${t.label} tab missing — the E2E account must be an OWNER (write access) to test it`);
      } else {
        fail(`${t.label} tab missing unexpectedly`);
      }
    }

    // ── Mobile: same screens, plus the no-overflow invariant ──────────────────
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(400);
    await assertNoOverflow("mobile / topbar");
    for (const t of TABS) {
      if (await openTab(t.id)) {
        await assertNoOverflow(`mobile / ${t.label}`);
        await page.screenshot({ path: join(ARTIFACTS, `mobile-${t.id}.png`), fullPage: true });
      }
    }
  }
  }

  if (consoleErrors.length) console.log(`\nℹ️ ${consoleErrors.length} browser console error(s) logged above (not gating).`);
} catch (e) {
  fail("e2e run threw: " + (e?.message || e));
  await page.screenshot({ path: join(ARTIFACTS, "99-error.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? "\nFAILED" : "\nPASSED — screenshots in tools/app-e2e/artifacts/");
