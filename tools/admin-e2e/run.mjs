/**
 * admin-e2e/run.mjs — authenticated smoke test for the admin SPA.
 *
 * This is the durable answer to "we keep getting stuck behind auth": the admin
 * build is produced with VITE_E2E=1 + a throwaway test-admin's creds, so it
 * auto-signs-in (lib/devAuth.ts) with a REAL session. We then drive the real,
 * authenticated UI headlessly and assert the new surfaces render.
 *
 * Flow:
 *   1. serve the assembled <repo>/dist/ (run `pnpm build` first),
 *   2. load /admin/ — devAuth auto-signs-in,
 *   3. wait for the authed nav, route to Analytics → Product (client-side),
 *   4. assert the Insights generator renders (config panel, sources, goals),
 *   5. screenshot to tools/admin-e2e/artifacts/ for the CI artifact.
 *
 * It deliberately does NOT click Generate — that spends Workers-AI tokens and
 * depends on live data, which would make the gate flaky. This proves auth +
 * render (the regression net); the live Generate is verified manually via the
 * same dev shim. Exits non-zero on any failed assertion.
 *
 * Usage: node tools/admin-e2e/run.mjs
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = resolve(ROOT, "dist");
const ARTIFACTS = resolve(fileURLToPath(new URL("./artifacts/", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

/** Resolve to a file; SPA-fallback /admin/* deep links to dist/admin/index.html. */
async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [join(DIST, clean)];
  if (!extname(clean)) candidates.push(join(DIST, clean, "index.html"));
  if (clean.startsWith("/admin")) candidates.push(join(DIST, "admin", "index.html"));
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
  if (!existsSync(join(DIST, "admin", "index.html"))) {
    console.error(`✗ ${join(DIST, "admin", "index.html")} not found. Run \`pnpm build\` (with VITE_E2E=1 + test creds) first.`);
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
    await page.goto(`${base}/admin/`, { waitUntil: "networkidle" });

    // 1. Auto-login lands us on the authed nav (not the login screen).
    const navAnalytics = page.getByRole("link", { name: "Analytics", exact: true });
    await navAnalytics.waitFor({ state: "visible", timeout: 20_000 });
    check("authed nav renders (auto-login worked)", true);

    // 2. Route to Analytics → Product (Insights lives in the Product tab).
    await navAnalytics.click();
    await page.getByRole("heading", { name: /numbers that matter/i }).waitFor({ timeout: 10_000 });
    check("Analytics page loads", true);

    await page.getByRole("tab", { name: "Product", exact: true }).click();

    // 3. The Insights generator renders with its config panel + sources + goals.
    await page.locator(".ins-config").waitFor({ state: "visible", timeout: 15_000 });
    check("Insights config panel renders", true);

    const ga4 = await page.getByRole("button", { name: /Marketing · GA4/ }).count();
    check("GA4 source chip present", ga4 > 0, `${ga4} found`);

    const contentGoal = await page.getByText("Content engine", { exact: false }).count();
    check("Content-engine outcome area present", contentGoal > 0);

    const genBtn = page.getByRole("button", { name: /Generate insights/ });
    check("Generate button present", (await genBtn.count()) > 0);

    await page.screenshot({ path: join(ARTIFACTS, "insights.png"), fullPage: true });
    console.log(`\nScreenshot → ${join(ARTIFACTS, "insights.png")}`);
  } catch (e) {
    check("smoke run completed", false, (e instanceof Error ? e.message : String(e)).slice(0, 200));
    await page.screenshot({ path: join(ARTIFACTS, "failure.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    server.close();
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`\n✗ admin E2E smoke failed (${failed.length}/${checks.length}).`);
    process.exit(1);
  }
  console.log(`\n✓ admin E2E smoke passed (${checks.length} checks).`);
}

main().catch((e) => { console.error(e); process.exit(2); });
