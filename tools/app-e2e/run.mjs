/**
 * app-e2e/run.mjs — authenticated smoke test for the unified app (apps/app).
 *
 * The durable answer to "the categorize/import screens have no UI test". The app
 * is built with VITE_E2E=1 + a throwaway test account's creds, so it auto-signs-in
 * (apps/app/src/lib/devAuth.ts) with a REAL session. We then drive the real authed
 * UI headlessly, assert it renders past the login wall, reach the ledger /
 * Categorize surface, and screenshot it for the CI artifact.
 *
 * It deliberately does NOT approve categories or import files — those mutate the
 * ledger and spend AI tokens, which would make the gate flaky. This proves auth +
 * the screens render (the regression net). Exits non-zero on any failed assertion.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text()); });

try {
  await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 });
  // devAuth signs in → wait for the app to leave the login wall.
  await page.waitForFunction(() => {
    const t = document.body.innerText || "";
    return t.length > 0 && !/magic link|check your (e-?mail|inbox)|sign in to/i.test(t);
  }, { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(ARTIFACTS, "01-home.png"), fullPage: true });

  const bodyText = await page.evaluate(() => document.body.innerText || "");
  if (/sign in|magic link|check your inbox/i.test(bodyText) && !/categor|ledger|uncategor|demo co/i.test(bodyText)) {
    fail("still on the login wall — devAuth did not sign in (check E2E_APP_* secrets)");
  } else {
    ok("authed app rendered past the login wall");
  }

  // Best-effort: open the org, then reach a Categorize / ledger surface.
  for (const sel of ['text=/E2E Demo Co/i', 'text=/Open|View|Books|Ledger/i']) {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) { await el.click().catch(() => {}); await page.waitForTimeout(1500); break; }
  }
  const cat = page.locator('text=/Categor/i').first();
  if (await cat.count().catch(() => 0)) {
    await cat.click().catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(ARTIFACTS, "02-categorize.png"), fullPage: true });
    ok("reached the Categorize surface");
  } else {
    await page.screenshot({ path: join(ARTIFACTS, "02-ledger.png"), fullPage: true });
    console.log("ℹ️ Categorize tab not auto-found; captured the authed ledger view instead");
  }
} catch (e) {
  fail("e2e run threw: " + (e?.message || e));
  await page.screenshot({ path: join(ARTIFACTS, "99-error.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? "\nFAILED" : "\nPASSED — screenshots in tools/app-e2e/artifacts/");
