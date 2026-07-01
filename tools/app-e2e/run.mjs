/**
 * app-e2e/run.mjs — authenticated screen-test for the Penny app (apps/app).
 *
 * The durable answer to "the import/categorize screens keep getting stuck behind
 * auth": the app is built with VITE_E2E=1 + a throwaway test user's creds, so it
 * auto-signs-in (src/auth/devAuth.ts) with a REAL session. We then drive the real,
 * authenticated Ledger UI headlessly and assert the Import + Categorize surfaces
 * render — catching UI breakage on every push, in a clean cloud environment.
 *
 * Flow:
 *   1. serve apps/app/dist/ (run the app build with VITE_E2E=1 first),
 *   2. load /app/ — devAuth auto-signs-in, the owner Ledger (with tabs) renders,
 *   3. open the Import tab → assert the CSV/opening-balance choices + the
 *      "Connect QuickBooks / Xero" panel render,
 *   4. open the Categorize tab → assert Penny's queue (or its empty state) renders,
 *   5. screenshot each to tools/app-e2e/artifacts/ for the CI artifact.
 *
 * It deliberately does NOT click Connect (that starts a real OAuth redirect) or
 * commit an import — this proves auth + the screens render (the regression net),
 * without flakiness or external calls. Exits non-zero on any failed assertion.
 *
 * Usage: node tools/app-e2e/run.mjs
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const ROOT = resolve(HERE, "../../");
const DIST = resolve(ROOT, "apps/app/dist");
const ARTIFACTS = resolve(HERE, "artifacts");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

/** Resolve to a file. The app is built with base "/app/", so strip a leading
 *  "/app" and SPA-fallback extensionless paths to the app's index.html. */
async function resolveFile(urlPath) {
  let clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean === "/app" || clean.startsWith("/app/")) clean = clean.slice(4) || "/";
  const candidates = [join(DIST, clean)];
  if (!extname(clean)) candidates.push(join(DIST, "index.html"));
  for (const c of candidates) {
    try { if ((await stat(c)).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(req.url || "/");
    if (!file) { res.statusCode = 404; res.end("not found"); return; }
    try {
      const data = await readFile(file);
      res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
      res.end(data);
    } catch { res.statusCode = 500; res.end("error"); }
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error(`✗ ${join(DIST, "index.html")} not found. Build apps/app with VITE_E2E=1 + test creds first.`);
    process.exit(2);
  }
  await mkdir(ARTIFACTS, { recursive: true });

  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text()); });

  try {
    await page.goto(`${base}/app/`, { waitUntil: "networkidle" });

    // 1. Auto-login lands us on the owner Ledger (tabs), not the login screen.
    const importTab = page.getByRole("tab", { name: "Import", exact: true });
    await importTab.waitFor({ state: "visible", timeout: 30_000 });
    check("authed Ledger renders (auto-login worked)", true);

    // 2. Import tab → CSV / opening-balance choices + Connect QuickBooks/Xero.
    await importTab.click();
    await page.getByText("Bank statement (CSV)", { exact: false }).waitFor({ timeout: 10_000 });
    const qbo = await page.getByRole("button", { name: /Connect QuickBooks/ }).count();
    const xero = await page.getByRole("button", { name: /Connect Xero/ }).count();
    check("Import: CSV / opening-balance choices render", true);
    check("Import: Connect QuickBooks button present", qbo > 0, `${qbo} found`);
    check("Import: Connect Xero button present", xero > 0, `${xero} found`);
    await page.screenshot({ path: join(ARTIFACTS, "import.png"), fullPage: true });

    // 3. Categorize tab → Penny's queue OR its "all caught up" empty state renders.
    const catTab = page.getByRole("tab", { name: "Categorize", exact: true });
    await catTab.click();
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return /Penny found|caught up|waiting to be categorized|categorization queue/i.test(t);
    }, { timeout: 15_000 });
    check("Categorize: Penny's queue (or empty state) renders", true);
    await page.screenshot({ path: join(ARTIFACTS, "categorize.png"), fullPage: true });
  } catch (e) {
    check("run completed without exception", false, String(e && e.message || e));
    try { await page.screenshot({ path: join(ARTIFACTS, "failure.png"), fullPage: true }); } catch { /* ignore */ }
  } finally {
    await browser.close();
    server.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length === 0 ? "✅ app-e2e passed" : "❌ app-e2e FAILED"}: ${checks.length - failed.length}/${checks.length} checks`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
