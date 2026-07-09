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
 *   4. run an axe-core accessibility scan on every screen and FAIL on any
 *      serious/critical violation (WCAG 2.0/2.1 A + AA). This closes the standing
 *      gap flagged in every wave audit (docs/AUDIT.md): the app is auth-walled, so
 *      its a11y was only ever static-checked — never a live axe walk of the real
 *      authed DOM. Now it is, on the same authed session as the render/responsive
 *      checks, so "accessible across every owner surface" is an enforced gate.
 *   5. screenshot every screen at desktop AND mobile for the CI artifact.
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
import { mintE2ESession, injectSession } from "../e2e-lib/mintSession.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = resolve(ROOT, "apps/app/dist");      // vite build output (base=/, prod parity — see app-e2e.yml)
// axe-core is a small, standard a11y engine (pinned devDep). We read its bundled
// source once and inject it into the page per screen, then run it against the real
// authed DOM. Resolved from the installed package so the version tracks package.json.
const AXE_SRC = await readFile(resolve(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
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

// ── Captcha-exempt auth (SEC-2) ────────────────────────────────────────────
// Turnstile now guards signInWithPassword, so the devAuth shim can no longer log
// in from CI. Instead mint a session for the E2E account via the service-role
// admin API (bypasses captcha) and inject it into the page BEFORE navigation, so
// the app boots already authed. Node-only: E2E_SERVICE_ROLE_KEY never touches the
// client bundle (it's not a VITE_ var). Falls back to the in-app devAuth path when
// the key is absent (harmless when captcha is off — e.g. a local project).
if (process.env.E2E_SERVICE_ROLE_KEY) {
  try {
    const minted = await mintE2ESession({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      anonKey: process.env.VITE_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.E2E_SERVICE_ROLE_KEY,
      email: process.env.E2E_APP_EMAIL || process.env.VITE_DEV_APP_EMAIL,
    });
    await injectSession(page, minted);
    ok(`minted a captcha-exempt session for ${process.env.E2E_APP_EMAIL || process.env.VITE_DEV_APP_EMAIL} (service-role; no password sign-in)`);
  } catch (e) {
    fail("session mint failed: " + (e?.message || e));
  }
} else {
  console.log("  ℹ️ E2E_SERVICE_ROLE_KEY unset — relying on the in-app devAuth password sign-in (only works with captcha OFF)");
}

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") { consoleErrors.push(m.text()); console.log("  [browser error]", m.text()); } });
page.on("pageerror", (e) => { consoleErrors.push(String(e)); console.log("  [page error]", String(e)); });
// Capture the Supabase anon key from the app's own requests (it's baked into the
// bundle, not on window) — ensureBooks() needs it as the `apikey` for REST + fn calls.
let capturedAnonKey = null;
page.on("request", (req) => {
  if (capturedAnonKey) return;
  const k = req.headers()["apikey"];
  if (k && k.includes(".")) capturedAnonKey = k;   // JWT-shaped anon key
});

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

/** The a11y invariant: axe-core finds NO serious/critical WCAG 2.0/2.1 A+AA
 *  violation on the current authed screen. Injects the bundled axe engine, runs it
 *  against the live DOM, and fails the gate on any serious/critical impact (moderate/
 *  minor are logged as advisories, not gating — same severity line as CI a11y gates
 *  elsewhere). Names each violating rule + node count so the fix is actionable. */
async function a11yScan(label) {
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(150);
  // Inject axe fresh each call (a client-side route swap can drop injected globals).
  await page.evaluate((src) => {
    if (!window.axe) { const s = document.createElement("script"); s.textContent = src; document.head.appendChild(s); }
  }, AXE_SRC).catch(() => {});
  const res = await page.evaluate(async () => {
    if (!window.axe) return { error: "axe failed to load" };
    const r = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return {
      violations: r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
        sample: v.nodes.slice(0, 2).map((n) => (n.target || []).join(" ")),
      })),
    };
  }).catch((e) => ({ error: String(e?.message || e) }));
  if (res.error) { fail(`${label} a11y: ${res.error}`); return; }
  const gating = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const advisory = res.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
  if (advisory.length) {
    console.log(`  ℹ️ ${label} a11y advisories (not gating): ` +
      advisory.map((v) => `${v.id}[${v.impact},×${v.nodes}]`).join(", "));
  }
  if (gating.length) {
    for (const v of gating) {
      console.log(`  ✗ ${v.id} (${v.impact}) — ${v.help} · ${v.nodes} node(s) · e.g. ${v.sample.join(" | ")}`);
    }
    fail(`${label} a11y: ${gating.length} serious/critical violation(s) — ${gating.map((v) => v.id).join(", ")}`);
  } else {
    ok(`${label}: axe clean (no serious/critical WCAG A/AA violations)`);
  }
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

// ── PENNY-UX-5 — BEGIN (append-only block; do not fold into the code above) ──
/** PENNY-UX-5 — walk ALL report sub-views with axe, not just the tab default.
 *  The audit's F5 (serious `scrollable-region-focusable` on the GL `.table-wrap`)
 *  slipped because the a11y gate only ever scanned the Reports tab's default view
 *  (P&L) — the six other views behind the `.report-seg` switcher were never
 *  visited. This walk clicks every report view (P&L · Trial balance · Balance
 *  sheet · Cash flow · General ledger · 1099-NEC · Lender package), runs the same
 *  serious/critical-gating axe scan on each, and additionally asserts the GL
 *  and 1099-NEC scroll regions are keyboard-focusable (tabindex) — the exact F5
 *  regression, which recurred on the NEC table (weekly audit, 5 Jul — the graduated
 *  fix wasn't applied there) and is now netted the same way as GL.
 *  Labels mirror apps/app/src/copy/strings.ts COPY.reports.* (the copy catalog). */
const REPORT_VIEWS_UX5 = [
  "P&L", "Trial balance", "Balance sheet", "Cash flow",
  "General ledger", "1099-NEC", "Lender package",
];
async function walkReportViewsA11y() {
  await page.setViewportSize(DESKTOP);
  const seg = page.locator(".report-seg");
  if (!(await seg.count().catch(() => 0))) { fail("Reports: no report view switcher (.report-seg)"); return; }
  for (const name of REPORT_VIEWS_UX5) {
    const btn = seg.getByRole("button", { name, exact: true });
    if (!(await btn.count().catch(() => 0))) { fail(`Reports: view switcher missing "${name}"`); continue; }
    await btn.first().click().catch(() => {});
    await page.waitForTimeout(400);
    if (name === "General ledger" || name === "1099-NEC") {
      // F5 regression net: the GL/NEC scroll region must be reachable by keyboard.
      const focusable = await page.locator(".reports .table-wrap[tabindex='0']").count().catch(() => 0);
      const hasWrap = await page.locator(".reports .table-wrap").count().catch(() => 0);
      if (hasWrap && !focusable) fail(`Reports · ${name}: .table-wrap is not keyboard-focusable (no tabindex) — F5 regressed`);
      else ok(`Reports · ${name}: scroll region is keyboard-focusable` + (hasWrap ? "" : " (empty state — no table)"));
    }
    await a11yScan(`Reports · ${name}`);           // same serious/critical gate as every screen
  }
  // Leave the switcher back on the default view so later assertions see P&L.
  await seg.getByRole("button", { name: REPORT_VIEWS_UX5[0], exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(200);
}
// ── PENNY-UX-5 — END ──────────────────────────────────────────────────────────

// ── F-WG1 — BEGIN (append-only block) ─────────────────────────────────────────
/** F-WG1 (wave-gate) — the internal admin console (/admin, apps/app/src/admin/
 *  AdminConsole.tsx) was the ONE `.table-wrap` in the app missing keyboard
 *  focusability → serious axe `scrollable-region-focusable`. It slipped every gate
 *  because the a11y walk never visited /admin (a separate top-level route, not a
 *  tab click in the owner nav). This walk navigates to /admin and runs the same
 *  serious/critical-gating axe scan there, closing the class of miss.
 *
 *  Auth note: /admin is gated by is_platform_staff() (the admins allow-list). If the
 *  E2E account IS staff, the Overview `.table-wrap` renders and we additionally
 *  assert it is keyboard-focusable (the exact F-WG1 regression net, mirroring the
 *  GL check in walkReportViewsA11y). If the account is NOT staff, /admin renders the
 *  "Staff only" wall — still a real authed screen we axe-scan — and we say so rather
 *  than silently passing. Either way the route is now under the a11y gate. */
async function walkAdminConsoleA11y() {
  await page.setViewportSize(DESKTOP);
  await page.goto(`http://127.0.0.1:${port}/admin`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const isStaff = await page.locator(".console-table").count().catch(() => 0);
  if (isStaff) {
    ok("/admin: Overview console renders (E2E account is platform staff)");
    // F-WG1 regression net: the Overview scroll region must be keyboard-reachable.
    const focusable = await page.locator(".table-wrap[tabindex='0']").count().catch(() => 0);
    if (!focusable) fail("/admin · Overview: .table-wrap is not keyboard-focusable (no tabindex) — F-WG1 regressed");
    else ok("/admin · Overview: scroll region is keyboard-focusable (F-WG1 net)");
  } else {
    ok("/admin: renders the Staff-only wall (E2E account is not platform staff) — route now under the a11y gate, but the Overview table (the F-WG1 surface) is only asserted when the account is staff");
  }
  await page.screenshot({ path: join(ARTIFACTS, "desktop-admin.png"), fullPage: true });
  await a11yScan("/admin console");                 // same serious/critical gate as every screen
  await sweepWidths("/admin console");             // 320 → 1920, every ladder width
  // Return to the app base so any later assertions start from a clean owner shell.
  await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(600);
}
// ── F-WG1 — END ───────────────────────────────────────────────────────────────

// ── PENNY-UX-3 — BEGIN (append-only block; do not fold into the code above) ──
/** PENNY-UX-3 — mobile tab-strip discoverability (docs/AUDIT.md PENNY-UX findings).
 *  `.ledger-tabs` already scrolls horizontally at narrow widths, but nothing
 *  signaled there was more to scroll to — the de-emphasized Advanced tab
 *  (pushed to the far right, styles.css `#ltab-advanced`) could sit off-screen
 *  with zero visual cue. Fix is a CSS edge-fade (styles.css, ≤640px, same
 *  technique as apps/admin's `.table-wrap`). Proves the strip genuinely
 *  overflows at a phone width, the fade is actually rendered (not just present
 *  in the stylesheet), and the de-emphasized tab stays reachable in the DOM. */
async function verifyTabStripDiscoverability() {
  await page.setViewportSize({ width: 375, height: 844 }); // narrowest phone ≤640px in the ladder
  await page.waitForTimeout(150);
  const strip = page.locator(".ledger-tabs").first();
  if (!(await strip.count().catch(() => 0))) { fail("PENNY-UX-3: .ledger-tabs not found at mobile width"); return; }
  const metrics = await strip.evaluate((el) => ({
    overflows: el.scrollWidth > el.clientWidth + 1,
    bgImage: getComputedStyle(el).backgroundImage,
  }));
  if (!metrics.overflows) {
    ok("PENNY-UX-3: tab strip fits at 375px — no scroll affordance needed");
  } else if (metrics.bgImage === "none") {
    fail("PENNY-UX-3: tab strip overflows at 375px with no edge-fade affordance (background-image: none)");
  } else {
    ok("PENNY-UX-3: tab strip overflows at 375px and renders the edge-fade affordance");
  }
  if (await page.locator("#ltab-advanced").count().catch(() => 0)) {
    ok("PENNY-UX-3: the de-emphasized Advanced tab is still present/reachable in the DOM at mobile width");
  } else {
    fail("PENNY-UX-3: #ltab-advanced missing at mobile width");
  }
  await page.screenshot({ path: join(ARTIFACTS, "pennyux3-tabstrip-mobile.png") }).catch(() => {});
  // Restore DESKTOP — this check runs inside the per-screen loop, before that
  // screen's own desktop screenshot/a11y scan, which expect DESKTOP sizing.
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(150);
}
// ── PENNY-UX-3 — END ──────────────────────────────────────────────────────────

// ── PENNY-UX-10 — BEGIN (append-only block) ────────────────────────────────────
/** PENNY-UX-10 — the Connections mega-scroll is regrouped into four scannable
 *  clusters (get-data-in · sell-channels · money-in/out · sharing). This asserts the
 *  clustered layout actually renders (4 `.connections-cluster` sections, each with an
 *  `.eyebrow` label) AND every handler-bearing surface survived the restructure — the
 *  card's "MUST NOT break functionality" gate, proven against the live authed DOM
 *  (the deterministic wiring contract is regression.connections-wiring.test.ts). */
async function verifyConnectionsClusters() {
  await page.setViewportSize(DESKTOP);
  // Owner-calm redesign — Connections defaults to a CHOOSER: the four clusters are
  // still the section groups, but each hosts a menu of one-line jobs; the wizard is
  // revealed only when its job is picked (one thing at a time, like the demo).
  // Make sure we're at the menu (an earlier check may have left a flow open).
  const backBtn = page.locator(".conn-back");
  if (await backBtn.count().catch(() => 0)) { await backBtn.first().click().catch(() => {}); await page.waitForTimeout(200); }
  // Capture the decluttered menu itself (desktop + mobile) as the review artifact.
  await page.screenshot({ path: join(ARTIFACTS, "connections-chooser-desktop.png"), fullPage: true }).catch(() => {});
  await page.setViewportSize(MOBILE);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(ARTIFACTS, "connections-chooser-mobile.png"), fullPage: true }).catch(() => {});
  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(150);
  const clusters = await page.locator(".conn-chooser .connections-cluster").count().catch(() => 0);
  if (clusters === 4) ok("owner-calm: Connections chooser renders 4 grouped clusters");
  else fail(`owner-calm: expected 4 Connections clusters, found ${clusters}`);
  const labels = await page.locator(".conn-chooser .conn-cluster-h").count().catch(() => 0);
  if (labels >= 4) ok("owner-calm: each cluster carries an eyebrow label");
  else fail(`owner-calm: expected ≥4 cluster labels, found ${labels}`);
  // The default view must NOT expand any wizard — that's the whole point.
  const eager = await page.locator(".conn-chooser .import-flow, .conn-chooser .catchup").count().catch(() => 0);
  if (eager === 0) ok("owner-calm: no wizard is expanded until its job is chosen");
  else fail(`owner-calm: ${eager} wizard(s) rendered eagerly — chooser should reveal on demand`);
  // Pick each job → its surface opens in the flow → back returns to the menu. Proves
  // every connect/upload/toggle surface survived the restructure and stays reachable
  // (the deterministic wiring contract is regression.connections-wiring.test.ts).
  // Invoicing was promoted to its own top-level tab (verified separately), so it's
  // no longer a Connections job.
  const jobs = [
    ["catchup",   ".catchup",       "catch-up import"],
    ["import",    ".import-flow",   "CSV import + connect"],
    ["payout",    ".payout-upload", "payout split"],
    ["bills",     ".bills",         "bill tracking"],
  ];
  for (const [job, sel, name] of jobs) {
    const item = page.locator(`.conn-menu-item[data-job="${job}"]`);
    if (!(await item.count().catch(() => 0))) { fail(`owner-calm: ${name} job (${job}) missing from the chooser menu`); continue; }
    await item.first().click().catch(() => {});
    await page.waitForTimeout(250);
    if (await page.locator(`.conn-flow ${sel}`).count().catch(() => 0)) ok(`owner-calm: ${name} opens from the chooser`);
    else fail(`owner-calm: ${name} surface (${sel}) did not open from its chooser job`);
    await page.locator(".conn-back").first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
  // Invoicing is its own top-level tab now — it opens the invoicing surface.
  const invTab = page.getByRole("tab", { name: "Invoicing" });
  if (await invTab.count().catch(() => 0)) {
    await invTab.first().click().catch(() => {});
    await page.waitForTimeout(300);
    if (await page.locator(".invoicing").count().catch(() => 0)) ok("Invoicing opens from its own top-level tab");
    else fail("Invoicing tab did not open the invoicing surface");
    // Restore Connections for the checks that follow (they assume the chooser).
    const connTab = page.getByRole("tab", { name: "Connections" });
    if (await connTab.count().catch(() => 0)) {
      await connTab.first().click().catch(() => {});
      await page.waitForTimeout(250);
    }
  } else fail("Invoicing top-level tab missing");
}
// ── PENNY-UX-10 — END ──────────────────────────────────────────────────────────

/** W2.1 — Catch-up mode renders inside Connections and its guided flow advances.
 *  Non-mutating happy path: the "Catch me up" hero + "Get me caught up" CTA render;
 *  clicking Start reveals the "Drop in your files" step (the file-drop). Proves the
 *  guided flow is wired without touching the ledger or spending AI tokens. */
async function verifyCatchUpEntry() {
  await page.setViewportSize(DESKTOP);
  // Owner-calm — catch-up now lives behind its chooser job; open it first.
  const catchUpJob = page.locator('.conn-menu-item[data-job="catchup"]');
  if (await catchUpJob.count().catch(() => 0)) {
    await catchUpJob.first().click().catch(() => {});
    await page.waitForTimeout(250);
  }
  const startCta = page.getByRole("button", { name: "Get me caught up" });
  if (!(await startCta.count().catch(() => 0))) { fail("Connections: no catch-up entry (Get me caught up)"); return; }
  ok("Catch-up mode entry renders in Connections");
  await startCta.first().click().catch(() => {});
  await page.waitForTimeout(400);
  const drop = page.locator(".catchup .file-drop");
  if (await drop.count().catch(() => 0)) ok("Catch-up guided flow advances to the drop-files step");
  else fail("Catch-up: Start did not advance to the drop-files step");
}

/** W3.5 — Receipt capture + match renders inside Review (no new top-level tab).
 *  Non-mutating happy path: the "Add a receipt" surface + its photo/paste capture
 *  controls + the unmatched-receipts queue render. Clicking "Paste receipt text"
 *  reveals the paste box. Proves the capture surface is wired without uploading a
 *  receipt (which would spend AI tokens + mutate the ledger — kept out of the gate,
 *  same discipline as catch-up). The auto-attach + low-confidence-card paths are
 *  covered deterministically by the Vitest flow test + the pgTAP RPC test. */
async function verifyReceiptCapture() {
  await page.setViewportSize(DESKTOP);
  const capture = page.locator(".receipts .receipt-capture");
  if (!(await capture.count().catch(() => 0))) { fail("Review: no receipt-capture surface (W3.5)"); return; }
  ok("Receipt capture surface renders in Review (no new top-level tab)");
  const photoBtn = page.getByRole("button", { name: "Take a photo" });
  const pasteBtn = page.getByRole("button", { name: "Paste receipt text" });
  if ((await photoBtn.count().catch(() => 0)) && (await pasteBtn.count().catch(() => 0))) {
    ok("Receipt capture offers both photo and paste entry (≤2 taps)");
  } else {
    fail("Review: receipt capture missing a photo/paste entry");
  }
  await pasteBtn.first().click().catch(() => {});
  await page.waitForTimeout(300);
  if (await page.locator(".receipt-paste-input").count().catch(() => 0)) {
    ok("Receipt paste flow reveals the paste box");
  } else {
    fail("Review: paste did not reveal the receipt text box");
  }
  // The short unmatched queue (resolvable in-flow) is present on the surface.
  if (await page.locator(".receipts-queue").count().catch(() => 0)) {
    ok("Unmatched-receipts queue renders in-flow");
  } else {
    fail("Review: no unmatched-receipts queue");
  }
}

/** W3.1 / owner-calm — Penny is now a GLOBAL DOCK, not a slab on Home: a launcher on
 *  every owner tab opens a slide-over hosting the same grounded conversation. We assert
 *  the launcher is present, open it, then ask a grounded question via a suggested prompt
 *  and confirm Penny replies with a turn. The authoritative tie-out + "no invented
 *  number" checks are the Vitest suite (thread.test.ts); here we prove the wiring. */
async function verifyPennyThread() {
  await page.setViewportSize(DESKTOP);
  const launcher = page.locator(".penny-launcher");
  if (!(await launcher.count().catch(() => 0))) { fail("Penny launcher not present on the owner workspace"); return; }
  ok("Penny launcher present (global dock, reachable from every owner tab)");
  await launcher.first().click().catch(() => {});
  await page.waitForTimeout(250);
  const thread = page.locator(".penny-dock .penny-thread");
  if (!(await thread.count().catch(() => 0))) { fail("Penny dock did not open its thread"); return; }
  ok("Penny dock opens the standing conversation");
  await page.screenshot({ path: join(ARTIFACTS, "penny-dock-desktop.png"), fullPage: true }).catch(() => {});
  // Ask via the input box (starter chips only show on a fresh thread; server-side
  // memory may have restored prior turns, so don't depend on a chip being present).
  const input = page.locator(".penny-dock .thread-input input").first();
  if (!(await input.count().catch(() => 0))) { fail("Home: Penny dock has no question input"); return; }
  await input.fill("What did I spend this month?").catch(() => {});
  await page.locator(".penny-dock .thread-input button[type=submit]").first().click().catch(() => {});
  // A "you" turn appears immediately; Penny's answer follows (local or via the fn).
  try {
    await page.waitForFunction(
      () => document.querySelectorAll(".penny-thread .thread-turn.t-penny").length >= 2,
      undefined, { timeout: 15_000 },
    );
    ok("Penny answered a grounded question in the thread");
  } catch {
    fail("Penny thread: no answer turn within timeout");
  }
  // Close the dock so it doesn't overlay later checks / screenshots.
  await page.locator(".penny-dock-close").first().click().catch(() => {});
  await page.waitForTimeout(150);
}

/** Idempotently ensure the E2E org has BOOKS (≥1 account + ≥1 posted entry).
 *
 *  The E2E org lives on real (prod) Supabase and is seeded out-of-band, so its
 *  books can be wiped by a fixture purge (as happened 2 Jul) — leaving the org
 *  present but account-less. When that happens Home is *correctly* the "set up
 *  your books" nudge, so the W3.4 pulse can never render and every books-facing
 *  assertion (owner Home, non-empty Reports) is a false red. Rather than depend
 *  on manual re-seeding, make the test hermetic: create-if-absent a minimal chart
 *  of accounts (Cash asset + Sales income) and one balanced entry, via the SAME
 *  Edge-Function write-path the app uses (never a direct table write). All calls
 *  are idempotent — a re-run with books already present is a no-op (duplicate
 *  account code → code_in_use ignored; the entry carries a fixed idempotency_key).
 *  Runs under the page's own authed session, so RLS/can_write_org still gate it. */
async function ensureBooks() {
  // Pull the live session out of the running app (its own supabase client stores
  // the session under the default storageKey: sb-<ref>-auth-token in localStorage).
  const ctx = await page.evaluate(() => {
    let token = null, ref = null;
    for (const k of Object.keys(localStorage)) {
      const m = k.match(/^sb-(.+)-auth-token$/);
      if (!m) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        if (v?.access_token) { token = v.access_token; ref = m[1]; }
      } catch { /* skip */ }
    }
    return { token, ref };
  });
  if (!ctx?.token || !ctx?.ref) { fail("ensureBooks: could not read the authed session"); return; }
  const sbUrl = `https://${ctx.ref}.supabase.co`;
  const anon = capturedAnonKey;
  if (!anon) { fail("ensureBooks: could not capture the Supabase anon key from app traffic"); return; }

  // Resolve the org the app is showing. PENNY-UX-4: the account now ALSO owns a
  // firm fixture (created below, named to sort last), so order by name to match
  // ActiveOrgProvider's default (orgs[0] of `.order("name")`) — not table order.
  const membRes = await page.evaluate(async ([sbUrl, token, anon]) => {
    const r = await fetch(`${sbUrl}/rest/v1/organizations?select=id&type=eq.business&order=name.asc&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [sbUrl, ctx.token, anon]);
  const orgId = Array.isArray(membRes.body) && membRes.body[0]?.id;
  if (!orgId) { fail(`ensureBooks: no org via REST (status ${membRes.status})`); return; }

  // Already has books? Then nothing to do (fast, common path once seeded).
  const acctRes = await page.evaluate(async ([sbUrl, token, anon, orgId]) => {
    const r = await fetch(
      `${sbUrl}/rest/v1/ledger_accounts?select=id&org_id=eq.${orgId}&limit=1`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
    );
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [sbUrl, ctx.token, anon, orgId]);
  if (Array.isArray(acctRes.body) && acctRes.body.length > 0) {
    ok("E2E org already has books (no seed needed)");
    return;
  }

  // Create-if-absent: Cash (asset) + Sales (income), then one balanced entry.
  const fn = (name, payload) => page.evaluate(async ([sbUrl, token, anon, name, payload]) => {
    const r = await fetch(`${sbUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [sbUrl, ctx.token, anon, name, payload]);

  const mkAcct = async (code, accName, type) => {
    const res = await fn("ledger-accounts", { org_id: orgId, name: accName, type, code });
    // code_in_use (409/duplicate) is fine — the account already exists.
    const id = res.body?.account?.id ?? res.body?.id;
    if (id) return id;
    if (String(res.body?.error) === "code_in_use") {
      const look = await page.evaluate(async ([sbUrl, token, anon, orgId, code]) => {
        const r = await fetch(
          `${sbUrl}/rest/v1/ledger_accounts?select=id&org_id=eq.${orgId}&code=eq.${code}&limit=1`,
          { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
        );
        return r.json().catch(() => null);
      }, [sbUrl, ctx.token, anon, orgId, code]);
      return Array.isArray(look) && look[0]?.id;
    }
    fail(`ensureBooks: create ${accName} failed (status ${res.status}: ${JSON.stringify(res.body)})`);
    return null;
  };

  const cashId = await mkAcct("1000", "Cash", "asset");
  const salesId = await mkAcct("4000", "Sales", "income");
  if (!cashId || !salesId) return;

  // One balanced entry: debit Cash / credit Sales $100.00 (10000 minor).
  const entry = await fn("ledger-entries", {
    op: "post",
    org_id: orgId,
    entry_date: "2026-01-15",
    idempotency_key: "e2e-smoke-seed-v1",
    source: "manual",
    lines: [
      { account_id: cashId, side: "D", amount_minor: "10000", currency: "USD" },
      { account_id: salesId, side: "C", amount_minor: "10000", currency: "USD" },
    ],
  });
  if (entry.status >= 200 && entry.status < 300) ok("E2E org seeded with a minimal chart + entry");
  else fail(`ensureBooks: post entry failed (status ${entry.status}: ${JSON.stringify(entry.body)})`);

  // Reload so the app's React Query cache picks up the freshly-seeded books.
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
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

    // Make the run hermetic: ensure the org has books (idempotent create-if-absent
    // via the write-path) so the owner Home pulse + non-empty Reports can render
    // even after a fixture purge wiped the seeded books. No-op once seeded.
    await ensureBooks();

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
      // W3.1 — the Penny thread lives on Home (nested, no new top-level tab).
      if (s.key === "home") await verifyPennyThread();
      // PENNY-UX-3 — mobile tab-strip discoverability (once; the strip is shared nav).
      if (s.key === "home") await verifyTabStripDiscoverability();
      // W1.2 — Reports must export a real file in ≤ 3 taps (pick period → Download).
      // Assert the download event fires with a period-stamped filename.
      if (s.key === "reports") await verifyReportDownload();
      // PENNY-UX-5 — axe walk across ALL 7 report sub-views (not just the default).
      if (s.key === "reports") await walkReportViewsA11y();
      // PENNY-UX-10 — Connections is regrouped into 4 clusters; every surface stays wired.
      if (s.key === "connections") await verifyConnectionsClusters();
      // W2.1 — Catch-up mode is the guided "get me caught up" job on Connections.
      if (s.key === "connections") await verifyCatchUpEntry();
      // W3.5 — Receipt capture + match is nested in Review (no new top-level tab).
      if (s.key === "review") await verifyReceiptCapture();
      await page.screenshot({ path: join(ARTIFACTS, `desktop-${s.key}.png`), fullPage: true });
      await a11yScan(s.label);                     // axe-core WCAG A/AA, fail on serious/critical
      await sweepWidths(s.label);                 // 320 → 1920, every ladder width
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(ARTIFACTS, `mobile-${s.key}.png`), fullPage: true });
    }

    // F-WG1 — the internal admin console is a separate top-level route (/admin),
    // not an owner-nav tab, so the SCREENS loop never reaches it. Walk it explicitly
    // so its `.table-wrap` (and the rest of the console) is under the a11y gate.
    await walkAdminConsoleA11y();
  }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PENNY-UX-1 (P0) — the invite accept link resolves (docs/AUDIT.md Program 6 F1).
  // The owner's "Share with your accountant" link is window.location.origin +
  // accept_path (apps/app/src/org/InviteCpa.tsx), where accept_path comes from the
  // `invites` edge fn. The live break: the fn emitted the app's RETIRED base
  // ("/app/accept?token=…") while the app serves from "/" with Accept at "/accept",
  // so the copied link fell into the router catch-all → silent redirect to
  // onboarding, token never consumed. This block pins BOTH halves of the contract,
  // independent of what's deployed (the prod fn lags until the integration gate):
  //   (a) producer — the fn source in THIS tree generates "/accept?token=…";
  //   (b) resolver — navigating the built app to exactly that generated path lands
  //       ON the Accept route (pathname stays /accept, the accept screen renders
  //       its live engagement status) and the route CONSUMES the token: the page
  //       calls the invites-accept fn with the same token — precisely what the
  //       catch-all redirect used to drop. A namespaced fake token keeps this
  //       non-mutating (prod answers invalid_token / 404; no row is touched).
  // Append-only block — self-contained, shares no state with the loop above.
  if (authed) {
    const fnSrc = await readFile(resolve(ROOT, "supabase/functions/invites/index.ts"), "utf8");
    const m = fnSrc.match(/accept_path:\s*`([^`$]*)\$\{token\}`/);
    const genPrefix = m ? m[1] : null;
    if (genPrefix === "/accept?token=") {
      ok("PENNY-UX-1: invites fn generates accept_path \"/accept?token=…\" (matches the app's Accept route at base /)");
    } else {
      fail(`PENNY-UX-1: invites fn generates accept_path "${genPrefix ?? "<not found>"}…" — must be "/accept?token=" (the app serves from "/"; anything else dies in the router catch-all)`);
    }
    // Guard: this check only means something against the prod-shaped base=/ build
    // (what deploy-penny ships). A legacy /app/ build routes /app/accept and would
    // mask the live behavior — exactly how F1 slipped past the old gate.
    const indexHtml = await readFile(join(DIST, "index.html"), "utf8");
    if (/(src|href)="\/app\//.test(indexHtml)) {
      fail("PENNY-UX-1: apps/app/dist is a legacy base=/app/ build — build with `vite build --base=/` (prod parity, see app-e2e.yml) so the accept-link check exercises prod routing");
    } else if (genPrefix) {
      const fakeToken = "pennyux1-e2e-not-a-real-invite"; // unknown token → invites-accept 404s, nothing mutated
      const acceptCall = page
        .waitForRequest((r) => r.url().includes("/functions/v1/invites-accept"), { timeout: 20_000 })
        .catch(() => null);
      await page.setViewportSize(DESKTOP);
      await page.goto(`http://127.0.0.1:${port}${genPrefix}${fakeToken}`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(500);
      const landed = new URL(page.url()).pathname;
      if (landed === "/accept") ok("PENNY-UX-1: the generated link lands on the Accept route (no catch-all redirect)");
      else fail(`PENNY-UX-1: the generated link landed on "${landed}" — the router catch-all swallowed it (onboarding instead of Accept, the F1 dead-link behavior)`);
      if (await page.locator(".auth-card [role=status]").count().catch(() => 0)) {
        ok("PENNY-UX-1: the Accept screen renders its live engagement status");
      } else {
        fail("PENNY-UX-1: the Accept screen did not render (.auth-card [role=status] missing)");
      }
      const req = await acceptCall;
      let sentToken = null;
      try { sentToken = JSON.parse(req?.postData() ?? "{}")?.token ?? null; } catch { /* not JSON */ }
      if (sentToken === fakeToken) ok("PENNY-UX-1: the Accept route consumed the token (invites-accept called with it — nothing lost in routing)");
      else fail("PENNY-UX-1: the token from the generated link was never consumed (no invites-accept call carried it)");
      await page.screenshot({ path: join(ARTIFACTS, "pennyux1-invite-accept.png"), fullPage: true });
      // Leave the app back on its entry screen for any block appended after this one.
      await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  // ── end PENNY-UX-1 ─────────────────────────────────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // PENNY-UX-4 (P1) — CPA "+ Add client" in the org switcher (docs/AUDIT.md
  // Program 6 F4). There is NO server path that lets a firm create a client org
  // or engagement — engagements exist only via owner-invite → CPA-accept. So the
  // firm-side "+ Add client" produces a REQUEST artifact: a link to the owner's
  // own /settings invite form, pre-filled with the CPA's email (`invite_cpa`
  // param). This block proves BOTH halves live:
  //   (a) producer — a firm context (namespaced fixture, create-if-absent) shows
  //       "+ Add client" in the switcher; the guided panel renders the request
  //       link with the right shape; the Practice-home empty copy names the SAME
  //       affordance (F4's dead-end instruction is gone);
  //   (b) resolver — an owner opening a request link gets the invite form
  //       pre-filled + the review notice, and submitting reaches the machinery's
  //       FIRST SERVER RESPONSE: the `invites` fn answers 201 with an accept
  //       link. ⚠️ Mutation footprint (namespaced): one `invites` row per run
  //       (email pennyux4-e2e-cpa@example.com, expires in 7 days, never accepted
  //       — the fn sends no email) + a ONE-TIME firm org "zzz-pennyux4-practice"
  //       (create_org_atomic is capped + deduped; the name sorts after
  //       "[E2E] …" so the app's orgs[0]-by-name default stays the business).
  // Append-only block — self-contained; shares only the ok/fail/a11yScan/
  // sweepWidths helpers and leaves the app back on the business org at base.
  if (authed) {
    const FIRM_NAME_UX4 = "zzz-pennyux4-practice";
    const PREFILL_EMAIL_UX4 = "pennyux4-e2e-cpa@example.com";

    // Session + anon key, read the same way ensureBooks does (self-contained).
    const ctx4 = await page.evaluate(() => {
      let token = null, ref = null;
      for (const k of Object.keys(localStorage)) {
        const m = k.match(/^sb-(.+)-auth-token$/);
        if (!m) continue;
        try {
          const v = JSON.parse(localStorage.getItem(k) || "null");
          if (v?.access_token) { token = v.access_token; ref = m[1]; }
        } catch { /* skip */ }
      }
      return { token, ref };
    });
    if (!ctx4?.token || !ctx4?.ref || !capturedAnonKey) {
      fail("PENNY-UX-4: could not read the authed session / anon key");
    } else {
      const sbUrl4 = `https://${ctx4.ref}.supabase.co`;

      // Fixture: create-if-absent the namespaced firm via the SAME write path the
      // app uses (`orgs` fn → create_org_atomic; idempotent by lookup-first).
      const firmLookup = await page.evaluate(async ([sbUrl, token, anon, name]) => {
        const r = await fetch(
          `${sbUrl}/rest/v1/organizations?select=id&type=eq.firm&name=eq.${encodeURIComponent(name)}&limit=1`,
          { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
        );
        return { status: r.status, body: await r.json().catch(() => null) };
      }, [sbUrl4, ctx4.token, capturedAnonKey, FIRM_NAME_UX4]);
      let firmId = Array.isArray(firmLookup.body) && firmLookup.body[0]?.id;
      if (!firmId) {
        const created = await page.evaluate(async ([sbUrl, token, anon, name]) => {
          const r = await fetch(`${sbUrl}/functions/v1/orgs`, {
            method: "POST",
            headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ type: "firm", name }),
          });
          return { status: r.status, body: await r.json().catch(() => null) };
        }, [sbUrl4, ctx4.token, capturedAnonKey, FIRM_NAME_UX4]);
        firmId = created.body?.org?.id;
        if (created.status === 201 && firmId) ok("PENNY-UX-4: firm fixture created (one-time, namespaced)");
        else fail(`PENNY-UX-4: firm fixture create failed (status ${created.status}: ${JSON.stringify(created.body)})`);
      } else {
        ok("PENNY-UX-4: firm fixture already present (no create needed)");
      }

      if (firmId) {
        // Fresh load so the switcher's org query includes the firm.
        await page.setViewportSize(DESKTOP);
        await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 });
        await page.locator(".orgsw-trigger").waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

        // (a0) Business (owner) context must NOT offer "+ Add client".
        await page.locator(".orgsw-trigger").click().catch(() => {});
        await page.waitForTimeout(300);
        const addInOwnerCtx = await page.getByRole("button", { name: "+ Add client" }).count().catch(() => 0);
        if (addInOwnerCtx) fail("PENNY-UX-4: '+ Add client' leaked into a business/owner context (firm-only affordance)");
        else ok("PENNY-UX-4: owner context does not show '+ Add client' (firm-only)");

        // (a1) Switch to the firm from the open switcher.
        const firmOption = page.locator(".orgsw-menu .orgsw-item", { hasText: FIRM_NAME_UX4 }).first();
        if (!(await firmOption.count().catch(() => 0))) {
          fail("PENNY-UX-4: firm fixture missing from the switcher list");
        } else {
          await firmOption.click().catch(() => {});
          await page.waitForTimeout(800);

          // (a2) Practice home renders; its empty copy names the affordance that
          // now exists (the exact F4 dead-end this card closes). The firm has no
          // clients, so the "No clients yet" state must show and say "+ Add client".
          const practice = page.locator(".practice");
          if (!(await practice.count().catch(() => 0))) {
            fail("PENNY-UX-4: Practice home did not render for the firm context");
          } else {
            // The firm has no clients — wait out the queue/counts loading state.
            await page.locator(".practice .ledger-empty").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
            const emptyText = await page.locator(".practice .ledger-empty").innerText().catch(() => "");
            if (emptyText.includes("+ Add client") && emptyText.toLowerCase().includes("switcher")) {
              ok("PENNY-UX-4: Practice-home empty copy points at the real switcher affordance (F4 honest)");
            } else {
              fail(`PENNY-UX-4: Practice-home empty copy doesn't match the affordance — got: "${emptyText.slice(0, 160)}"`);
            }
          }

          // (a3) Firm context shows "+ Add client"; the guided panel renders the
          // request link with the resolver's exact shape.
          await page.locator(".orgsw-trigger").click().catch(() => {});
          await page.waitForTimeout(300);
          const addBtn = page.getByRole("button", { name: "+ Add client" });
          if (!(await addBtn.count().catch(() => 0))) {
            fail("PENNY-UX-4: firm context has no '+ Add client' in the switcher");
          } else {
            ok("PENNY-UX-4: firm context shows '+ Add client' in the switcher");
            await addBtn.first().click().catch(() => {});
            await page.waitForTimeout(400);
            const panel = page.locator(".topbar-create .add-client");
            if (!(await panel.count().catch(() => 0))) {
              fail("PENNY-UX-4: '+ Add client' did not open the guided panel");
            } else {
              const linkText = await panel.locator(".invite-link code").innerText().catch(() => "");
              if (linkText.includes("/settings?invite_cpa=")) {
                ok("PENNY-UX-4: the panel renders the request link (/settings?invite_cpa=…)");
              } else {
                fail(`PENNY-UX-4: request link malformed — got "${linkText.slice(0, 120)}"`);
              }
              await page.screenshot({ path: join(ARTIFACTS, "pennyux4-add-client-panel.png"), fullPage: true });
              await a11yScan("PENNY-UX-4: firm + Add client panel");
              await sweepWidths("PENNY-UX-4: firm + Add client panel");
            }
          }

          // (a4) Back to the business org (leave state tidy for later blocks).
          await page.setViewportSize(DESKTOP);
          await page.locator(".orgsw-trigger").click().catch(() => {});
          await page.waitForTimeout(300);
          // First option that ISN'T the firm = the business (options render in the
          // app's name order; don't assume the seeded org's exact name).
          const bizOption = page.locator(".orgsw-menu .orgsw-item")
            .filter({ hasNotText: FIRM_NAME_UX4 }).first();
          if (await bizOption.count().catch(() => 0)) await bizOption.click().catch(() => {});
          else await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(500);
        }

        // (b) Resolver: an owner opening a request link lands on the pre-filled
        // invite form; submitting reaches the machinery's FIRST SERVER RESPONSE.
        await page.goto(
          `http://127.0.0.1:${port}/settings?invite_cpa=${encodeURIComponent(PREFILL_EMAIL_UX4)}`,
          { waitUntil: "networkidle", timeout: 60_000 },
        );
        await page.locator(".invite-cpa").waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
        const prefilled = await page.locator(".invite-cpa input[type=email]").inputValue().catch(() => "");
        if (prefilled === PREFILL_EMAIL_UX4) ok("PENNY-UX-4: request link pre-fills the owner's invite form");
        else fail(`PENNY-UX-4: invite form not pre-filled (got "${prefilled}")`);
        if (await page.locator(".invite-prefill").count().catch(() => 0)) {
          ok("PENNY-UX-4: the review-the-address notice renders on prefill");
        } else {
          fail("PENNY-UX-4: no review notice on the pre-filled form");
        }
        const invResp = page.waitForResponse(
          (r) => new URL(r.url()).pathname.endsWith("/functions/v1/invites") && r.request().method() === "POST",
          { timeout: 20_000 },
        ).catch(() => null);
        await page.locator(".invite-cpa button[type=submit]").click().catch(() => {});
        const resp = await invResp;
        if (resp && resp.status() === 201) {
          const body = await resp.json().catch(() => null);
          if (body?.accept_path) ok("PENNY-UX-4: flow reached its first server response — invites fn 201 with an accept link (owner-initiated, unchanged authz)");
          else fail("PENNY-UX-4: invites fn 201 but no accept_path in the body");
        } else {
          fail(`PENNY-UX-4: invite submit did not reach a 201 from the invites fn (status ${resp ? resp.status() : "none"})`);
        }
        await page.screenshot({ path: join(ARTIFACTS, "pennyux4-owner-prefilled-invite.png"), fullPage: true });

        // Leave the app on its entry screen for any block appended after this one.
        await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(800);
      }
    }
  }
  // ── end PENNY-UX-4 ─────────────────────────────────────────────────────────

  if (consoleErrors.length) console.log(`\nℹ️ ${consoleErrors.length} browser console error(s) logged above (not gating).`);
} catch (e) {
  fail("e2e run threw: " + (e?.message || e));
  await page.screenshot({ path: join(ARTIFACTS, "99-error.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? "\nFAILED" : "\nPASSED — screenshots in tools/app-e2e/artifacts/");
