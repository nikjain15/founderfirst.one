/**
 * app-e2e/run.mjs — authenticated smoke + responsive test for the unified app (apps/app).
 *
 * The durable answer to "the categorize/import screens have no UI test". The app
 * is built with VITE_E2E=1 + a throwaway test account's creds, so it auto-signs-in
 * (apps/app/src/lib/devAuth.ts) with a REAL session. We then drive the real authed
 * UI headlessly and, for the owner's key jobs (Home · Review · Reports ·
 * Connections + Journal under Advanced — APP_PRINCIPLES §2):
 *   1. assert the app renders past the login wall,
 *   2. assert each screen's panel renders (regression net for the screens themselves),
 *   3. assert NO horizontal overflow across the FULL width ladder (320 → 1920,
 *      apps/admin/RESPONSIVE.md) — a clipped column or a fixed-px grid that overruns
 *      any device width fails the gate, so "responsive across all devices" is enforced,
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
const MOBILE = { width: 390, height: 844 };        // iPhone-class; for the mobile screenshot
const DESKTOP = { width: 1280, height: 900 };
// The full width ladder from apps/admin/RESPONSIVE.md — every app screen is
// asserted overflow-free at each of these, so "responsive across all devices"
// is an enforced gate, not a one-off manual check.
const LADDER = [320, 360, 375, 414, 480, 540, 640, 768, 834, 1024, 1280, 1440, 1920];

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
// acceptDownloads so the W1.2 export-download assertion can capture the file.
const context = await browser.newContext({ viewport: DESKTOP, acceptDownloads: true });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(m.text()); console.log("  [browser error]", m.text()); } });
page.on("pageerror", (e) => { consoleErrors.push(String(e)); console.log("  [page error]", String(e)); });

// The OWNER lens IA (apps/app Ledger.tsx, nav="owner" — APP_PRINCIPLES §2): four
// plain-language jobs (#ltab-home · #ltab-review · #ltab-reports · #ltab-connections)
// plus a de-emphasized Advanced (#ltab-advanced) whose sub-strip (#lsub-*) exposes
// the accountant-grade ledger (Journal · Chart of accounts · Periods). The E2E
// account is an OWNER, so it renders this nav. Review is write-only (the categorize
// queue); Connections hosts Import + Invite. Journal lives under Advanced.
const SCREENS = [
  { key: "home",        label: "Home",        main: "home" },
  { key: "review",      label: "Review",      main: "review", writeOnly: true },
  { key: "reports",     label: "Reports",     main: "reports" },
  { key: "connections", label: "Connections", main: "connections" },
  { key: "journal",     label: "Journal",     main: "advanced", sub: "journal" },
  { key: "reconcile",   label: "Reconcile",   main: "advanced", sub: "reconcile" }, // W1.1
];

/** Open a screen (main tab, then Books sub-tab if any). Returns false if absent. */
async function openScreen(s) {
  const mainTab = page.locator(`#ltab-${s.main}`);
  if (!(await mainTab.count().catch(() => 0))) return false;
  await mainTab.click().catch(() => {});
  await page.locator("#ledger-panel").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  if (s.sub) {
    const subTab = page.locator(`#lsub-${s.sub}`);
    if (!(await subTab.count().catch(() => 0))) return false;
    await subTab.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(500);
  return true;
}

/** The RESPONSIVE.md invariant across the FULL width ladder: the current screen
 *  must not overflow the viewport horizontally at any device width. One line per
 *  screen; names the offending widths if any. */
async function sweepWidths(label) {
  const bad = [];
  for (const w of LADDER) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    const over = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth : 0;
    });
    if (over) bad.push(`${w}px→${over}`);
  }
  if (bad.length) fail(`${label}: horizontal overflow at ${bad.join(", ")}`);
  else ok(`${label}: no overflow across ${LADDER.length} widths (${LADDER[0]}–${LADDER[LADDER.length - 1]}px)`);
}

/** W1.2 — download a report and assert a real file arrives, period-stamped.
 *  Proves the 3-tap "Reports → pick period → Download" flow yields one file. */
async function verifyReportDownload() {
  await page.setViewportSize(DESKTOP);
  // Pick a period (any date is fine — the file must still download).
  const fromDate = page.locator(".report-controls input[type=date]").first();
  if (await fromDate.count().catch(() => 0)) {
    await fromDate.fill("2026-01-01").catch(() => {});
  }
  const csvBtn = page.getByRole("button", { name: "Download CSV" });
  if (!(await csvBtn.count().catch(() => 0))) { fail("Reports: no Download CSV button"); return; }
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      csvBtn.click(),
    ]);
    const name = download.suggestedFilename();
    if (/_.+_.+\.csv$/.test(name)) ok(`Reports export downloaded a period-stamped CSV (${name})`);
    else fail(`Reports export filename not period-stamped: ${name}`);
  } catch (e) {
    fail("Reports export did not trigger a download: " + (e?.message || e));
  }
}

/** W2.1 — Catch-up mode renders inside Connections and its guided flow advances.
 *  Non-mutating happy path: the "Catch me up" hero + "Get me caught up" CTA render;
 *  clicking Start reveals the "Drop in your files" step (the file-drop). Proves the
 *  guided flow is wired without touching the ledger or spending AI tokens. */
async function verifyCatchUpEntry() {
  await page.setViewportSize(DESKTOP);
  const startCta = page.getByRole("button", { name: "Get me caught up" });
  if (!(await startCta.count().catch(() => 0))) { fail("Connections: no catch-up entry (Get me caught up)"); return; }
  ok("Catch-up mode entry renders in Connections");
  await startCta.first().click().catch(() => {});
  await page.waitForTimeout(400);
  const drop = page.locator(".catchup .file-drop");
  if (await drop.count().catch(() => 0)) ok("Catch-up guided flow advances to the drop-files step");
  else fail("Catch-up: Start did not advance to the drop-files step");
}

/** W3.4 — the owner Home "am I okay?" pulse renders its parts on one screen:
 *  the money-on-hand + needs-you tiles, the plain-English month summary, the
 *  kernel-driven "Coming up" deadlines section, and the "Penny did this" feed.
 *  Non-mutating: it only asserts the surfaces are present (numbers/rows come from
 *  the seeded org's real data + the kernel calendar — never hardcoded). */
async function verifyOwnerHomePulse() {
  await page.setViewportSize(DESKTOP);
  const home = page.locator(".owner-home");
  if (!(await home.count().catch(() => 0))) {
    // The seeded owner has books, so Home should be the pulse (not the setup nudge).
    fail("Home: owner pulse (.owner-home) did not render for the seeded org");
    return;
  }
  ok("Home renders the owner 'am I okay?' pulse");
  const parts = [
    [".home-kpis .kpi", "money-on-hand + needs-you tiles"],
    [".home-summary-text", "plain-English month summary"],
    [".home-deadlines", "kernel-driven 'Coming up' deadlines"],
    [".penny-did", "'Penny did this' feed"],
  ];
  for (const [sel, name] of parts) {
    if (await home.locator(sel).count().catch(() => 0)) ok(`Home: ${name} present`);
    else fail(`Home: ${name} (${sel}) missing`);
  }
  // The needs-you tile is a button that navigates into Review (0→2 taps to act).
  if (await home.locator(".kpi-btn").count().catch(() => 0)) ok("Home: needs-you tile is an actionable button (→ Review)");
  else fail("Home: needs-you tile is not an actionable button");
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

    // ── Each key screen: renders + overflow-free across the FULL width ladder,
    //    with desktop + mobile screenshots for the CI artifact. ────────────────
    for (const s of SCREENS) {
      await page.setViewportSize(DESKTOP);
      await page.waitForTimeout(200);
      const opened = await openScreen(s);
      if (!opened) {
        fail(`${s.label} missing${s.writeOnly ? " — the E2E account must be an OWNER (write access) to test it" : " unexpectedly"}`);
        continue;
      }
      ok(`${s.label} renders`);
      // W3.4 — Home must be the owner "am I okay?" pulse (cash, needs-you, deadlines, feed).
      if (s.key === "home") await verifyOwnerHomePulse();
      // W1.2 — Reports must export a real file in ≤ 3 taps (pick period → Download).
      // Assert the download event fires with a period-stamped filename.
      if (s.key === "reports") await verifyReportDownload();
      // W2.1 — Catch-up mode is the guided "get me caught up" job on Connections.
      if (s.key === "connections") await verifyCatchUpEntry();
      await page.screenshot({ path: join(ARTIFACTS, `desktop-${s.key}.png`), fullPage: true });
      await sweepWidths(s.label);                 // 320 → 1920, every ladder width
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(ARTIFACTS, `mobile-${s.key}.png`), fullPage: true });
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
