/**
 * build-all — assemble the final deploy artifact at <repo>/dist/.
 *
 * Surface → source → URL (single source of truth for what's live):
 *   apps/web (Astro)  → founderfirst.one/ + /blog + /compare + /confirmed
 *                       + /extension-privacy + /privacy + /terms + llms.txt
 *                       + sitemap.xml + robots.txt   ← the live marketing site
 *   apps/admin (React)→ founderfirst.one/admin/
 *   apps/app (React)  → founderfirst.one/app/  ← unified authed SPA (owner/CPA lenses)
 *   apps/demo         → founderfirst.one/penny/demo/
 * (apps/marketing and apps/blog were retired — apps/web fully replaced them.)
 *
 * Output layout (what GitHub Pages serves):
 *
 *   dist/
 *   ├─ index.html                           ← Astro web homepage
 *   ├─ confirmed/index.html                 ← signup confirmation (Astro)
 *   ├─ _astro/                              ← Astro CSS + JS bundles
 *   ├─ blog/                                ← Astro blog (/blog + /blog/[slug])
 *   │  └─ …
 *   ├─ penny/demo/
 *   │  ├─ index.html                        ← redirect → /penny/demo/businessowner/
 *   │  ├─ assets/  config/  prompts/        ← shared (from apps/demo build)
 *   │  ├─ businessowner/index.html
 *   │  └─ cpa/index.html
 *   └─ CNAME                                ← founderfirst.one
 *
 * Run via `pnpm build`. The GitHub Actions deploy workflow runs the same
 * command and uploads dist/ to Pages.
 *
 * Idempotent: wipes dist/ first.
 */
import {
  cpSync, existsSync, mkdirSync, rmSync, writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const WEB_DIST = resolve(ROOT, "apps/web/dist");
const DEMO_DIST = resolve(ROOT, "apps/demo/dist");
const ADMIN_DIST = resolve(ROOT, "apps/admin/dist");
const APP_DIST = resolve(ROOT, "apps/app/dist");

function step(label: string): void {
  console.info(`\n▸ ${label}`);
}

function run(command: string): void {
  execSync(command, { cwd: ROOT, stdio: "inherit" });
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`copyDir: source missing — ${src}`);
  }
  cpSync(src, dest, { recursive: true });
}

function writeRedirect(filePath: string, target: string, title: string): void {
  // Static-site "redirect" — meta refresh + JS fallback + canonical.
  // GitHub Pages can't issue a real 301, but search engines respect canonical.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="robots" content="noindex,follow" />
  <link rel="canonical" href="https://founderfirst.one${target}" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <script>location.replace(${JSON.stringify(target)} + (location.search || ""));</script>
</head>
<body>
  <p>Redirecting to <a href="${target}">${target}</a>…</p>
</body>
</html>
`;
  writeFileSync(filePath, html, "utf8");
}

function main(): void {
  step("Building web app (Astro — the live homepage + blog + compare + confirmed + extension-privacy + privacy + terms)");
  run("pnpm --filter @ff/web build");

  step("Building Penny demo");
  run("pnpm --filter @ff/demo build");

  step("Building admin app");
  run("pnpm --filter @ff/admin build");

  step("Building unified app (apps/app — authed owner/CPA lenses)");
  run("pnpm --filter @ff/app build");

  step("Wiping dist/");
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // apps/web is the whole marketing site: homepage, /blog, /compare, /confirmed,
  // /extension-privacy, /privacy, /terms, plus index.html + _astro/ + llms.txt
  // + sitemap.xml + robots.txt.
  step("Copying web → dist/ (homepage + blog + compare + confirmed + extension-privacy + privacy + terms)");
  copyDir(WEB_DIST, DIST);

  step("Copying admin → dist/admin/");
  const adminOut = resolve(DIST, "admin");
  copyDir(ADMIN_DIST, adminOut);
  // SPA fallback: GH Pages only honors a root /404.html, not per-directory,
  // so duplicate admin's index.html to each static react-router route. This
  // ensures magic-link landings and hard refreshes boot the SPA instead of
  // hitting GH Pages' 404. MUST stay in sync with the top-level <Route path>
  // entries in apps/admin/src/App.tsx — any route reachable by URL needs an
  // entry here, including ones that only redirect (users/signals/discord).
  // Dynamic routes (/admin/support/:ticketId) fall back to /admin/ — acceptable.
  const ADMIN_ROUTES = [
    "login",
    "support",
    "audience",
    "analytics",
    "content",
    "audit",
    "how-it-works",
    "quality",
    "ai-quality",
    "experiments",
    "emails",
    "site-content",
    "blog-posts",
    "content-pipeline",
    "users",
    "signals",
    "discord",
    "admins",
  ];
  for (const route of ADMIN_ROUTES) {
    mkdirSync(resolve(adminOut, route), { recursive: true });
    cpSync(resolve(adminOut, "index.html"), resolve(adminOut, route, "index.html"));
  }

  step("Copying app → dist/app/");
  const appOut = resolve(DIST, "app");
  copyDir(APP_DIST, appOut);
  // SPA fallback for the unified app's URL-reachable routes (BrowserRouter
  // basename="/app"). Keep in sync with the top-level <Route path> entries in
  // apps/app/src/App.tsx. The catch-all (*) redirects client-side to "/".
  const APP_ROUTES = ["login", "accept", "staff"];
  for (const route of APP_ROUTES) {
    mkdirSync(resolve(appOut, route), { recursive: true });
    cpSync(resolve(appOut, "index.html"), resolve(appOut, route, "index.html"));
  }

  step("Copying penny demo → dist/penny/demo/");
  const demoOut = resolve(DIST, "penny/demo");
  mkdirSync(demoOut, { recursive: true });
  // apps/demo builds with base "/penny/demo/" and emits both personas
  // (businessowner/, cpa/) plus shared assets/ + the public/ tree (config/, prompts/).
  copyDir(DEMO_DIST, demoOut);

  step("Writing /penny/demo/ → /penny/demo/businessowner/ redirect");
  writeRedirect(
    resolve(demoOut, "index.html"),
    "/penny/demo/businessowner/",
    "Penny — redirecting…",
  );

  step("Writing legacy /penny/* compatibility redirects");
  // The legacy Jekyll site exposed /penny/, /penny/businessowner/, and
  // /penny/cpa/ as standalone pages. Anyone with an old link or bookmark
  // would 404 against the new pipeline. Send them to the canonical demo URLs.
  const pennyOut = resolve(DIST, "penny");
  writeRedirect(
    resolve(pennyOut, "index.html"),
    "/penny/demo/businessowner/",
    "Penny — redirecting…",
  );
  mkdirSync(resolve(pennyOut, "businessowner"), { recursive: true });
  writeRedirect(
    resolve(pennyOut, "businessowner/index.html"),
    "/penny/demo/businessowner/",
    "Penny — redirecting…",
  );
  mkdirSync(resolve(pennyOut, "cpa"), { recursive: true });
  writeRedirect(
    resolve(pennyOut, "cpa/index.html"),
    "/penny/demo/cpa/",
    "Penny — redirecting…",
  );

  step("Copying CNAME");
  if (existsSync(resolve(ROOT, "CNAME"))) {
    cpSync(resolve(ROOT, "CNAME"), resolve(DIST, "CNAME"));
  }

  // .nojekyll tells GitHub Pages "do not run Jekyll on this output".
  // Required for files starting with _ (e.g. _shared if we ever exposed it).
  writeFileSync(resolve(DIST, ".nojekyll"), "", "utf8");

  step("Done. dist/ tree:");
  run("find dist -maxdepth 3 -type d | sort");
}

main();
