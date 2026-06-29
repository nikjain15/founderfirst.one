/**
 * email-shots/run.mjs — capture PUBLIC product snapshots for the weekly
 * "What's new" digest email.
 *
 * The digest groups entries into areas (see the AREA registry in
 * supabase/functions/changelog-digest/index.ts) and shows a stable cover image
 * per area, hosted at founderfirst.one/email/whatsnew/<area>.png. This script
 * captures the covers for the PUBLIC surfaces — the homepage (site) and the
 * Penny demo (product) — which need no auth.
 *
 * The behind-auth admin covers (penny / reach / infra) are captured by the
 * authenticated harness in tools/admin-e2e/run.mjs (run in CI).
 *
 * Flow:
 *   1. assemble dist/ first:  pnpm tsx scripts/build-all.ts   (or build:web + the demo)
 *   2. node tools/email-shots/run.mjs
 *   3. PNGs land in apps/web/public/email/whatsnew/ — commit them; they deploy
 *      with the site and resolve at the URLs the email references.
 *
 * Covers are a fixed banner aspect (1200×630) so every section reads uniformly.
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = resolve(ROOT, "dist");
const OUT = resolve(ROOT, "apps/web/public/email/whatsnew");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [join(DIST, clean)];
  if (!extname(clean)) candidates.push(join(DIST, clean, "index.html"));
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

// Banner geometry: render wide (desktop layout), clip to a 1200×630 banner.
const VIEWPORT = { width: 1200, height: 760 };
const CLIP = { x: 0, y: 0, width: 1200, height: 630 };

const SHOTS = [
  { name: "site.png",    path: "/",                          wait: ".hero, main, body" },
  { name: "product.png", path: "/penny/demo/businessowner/", wait: "body" },
];

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error(`✗ ${join(DIST, "index.html")} not found. Run \`pnpm tsx scripts/build-all.ts\` first.`);
    process.exit(2);
  }
  await mkdir(OUT, { recursive: true });

  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text().slice(0, 120)); });

  let ok = 0;
  for (const shot of SHOTS) {
    try {
      await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle", timeout: 30_000 });
      // Hide the cookie/consent banner so it never sits over the cover.
      await page.addStyleTag({
        content: '[class*="cookie"],[class*="consent"],[id*="cookie"],[id*="consent"]{display:none !important;}',
      });
      // Islands/autofocus can scroll the page — start every cover at the top.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(900); // let fonts + islands settle
      const out = join(OUT, shot.name);
      await page.screenshot({ path: out, clip: CLIP });
      console.log(`✓ ${shot.name}  ←  ${shot.path}`);
      ok++;
    } catch (e) {
      console.log(`✗ ${shot.name}  ←  ${shot.path} — ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`);
    }
  }

  await browser.close();
  server.close();
  console.log(`\n${ok}/${SHOTS.length} public covers → ${OUT}`);
  if (ok < SHOTS.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
