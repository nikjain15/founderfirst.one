/**
 * responsive-ci/run.mjs — the responsive gate.
 *
 * 1. Serves the assembled artifact at <repo>/dist/ over a tiny static server
 *    (build it first with `pnpm build`).
 * 2. For every ROUTE × WIDTH, loads the page in headless chromium and checks the
 *    RESPONSIVE.md invariants:
 *      • no horizontal scroll  (documentElement.scrollWidth − innerWidth ≤ slack)
 *      • interactive elements ≥ 44×44 px
 *      • inputs/selects/textareas font-size ≥ 16px
 * 3. Prints a readable report; exits non-zero if any non-baselined violation is
 *    found.
 *
 * Usage: node tools/responsive-ci/run.mjs   (chromium via `playwright install`)
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { WIDTHS, THRESHOLDS, ROUTES, BASELINE, VIEWPORT_HEIGHT } from "./config.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = resolve(ROOT, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/** Resolve a URL path to a file inside dist/: try the path, then path/index.html. */
async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [join(DIST, clean)];
  if (!extname(clean)) candidates.push(join(DIST, clean, "index.html"));
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isFile()) return c;
    } catch { /* next */ }
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
    } catch {
      res.statusCode = 500; res.end("error");
    }
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
}

// Runs in the browser: collect every invariant violation for the current width.
function collectViolations(thresholds) {
  const out = [];
  const de = document.documentElement;
  const overflow = de.scrollWidth - window.innerWidth;
  if (overflow > thresholds.horizontalScrollSlackPx) {
    out.push({ rule: "horizontalScroll", detail: `scrollWidth ${de.scrollWidth} > innerWidth ${window.innerWidth} (+${overflow}px)`, el: "document" });
  }

  const interactive = Array.from(
    document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"], select, summary'),
  );
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    // Ignore hidden / zero-size (display:none, collapsed) elements.
    if (r.width === 0 && r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if ((r.height > 0 && r.height < thresholds.tapMinPx) || (r.width > 0 && r.width < thresholds.tapMinPx)) {
      const label = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40);
      out.push({ rule: "tapTarget", detail: `${Math.round(r.width)}×${Math.round(r.height)}px (< ${thresholds.tapMinPx})`, el: `${el.tagName.toLowerCase()} "${label}"` });
    }
  }

  const fields = Array.from(document.querySelectorAll("input, select, textarea"));
  for (const el of fields) {
    if (el.type === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < thresholds.inputMinFontPx) {
      out.push({ rule: "inputFont", detail: `${fs}px (< ${thresholds.inputMinFontPx})`, el: `${el.tagName.toLowerCase()}[type=${el.type || "text"}]` });
    }
  }
  return out;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`✗ dist/ not found at ${DIST}. Run \`pnpm build\` first.`);
    process.exit(2);
  }

  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const failures = [];
  const known = [];

  for (const route of ROUTES) {
    const page = await browser.newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      const resp = await page.goto(base + route, { waitUntil: "networkidle" }).catch(() => null);
      if (!resp || !resp.ok()) {
        failures.push({ route, width, rule: "load", el: "-", detail: `failed to load (${resp ? resp.status() : "no response"})` });
        continue;
      }
      const violations = await page.evaluate(collectViolations, THRESHOLDS);
      for (const v of violations) {
        const key = `${route} @ ${width} :: ${v.rule}`;
        (BASELINE.has(key) ? known : failures).push({ route, width, ...v });
      }
    }
    await page.close();
  }

  await browser.close();
  server.close();

  const fmt = (r) => `  ${r.route} @ ${r.width}px  [${r.rule}]  ${r.el} — ${r.detail}`;
  if (known.length) {
    console.log(`\n⚠ ${known.length} known (baselined) issue(s) — not failing CI:`);
    known.forEach((r) => console.log(fmt(r)));
  }
  if (failures.length) {
    console.error(`\n✗ ${failures.length} responsive violation(s):`);
    failures.forEach((r) => console.error(fmt(r)));
    console.error("\nFix the layout, or (if intentional debt) add the `${route} @ ${width} :: ${rule}` key to BASELINE in tools/responsive-ci/config.mjs.");
    process.exit(1);
  }
  console.log(`\n✓ Responsive gate passed — ${ROUTES.length} routes × ${WIDTHS.length} widths, no violations.`);
}

main().catch((e) => { console.error(e); process.exit(2); });
