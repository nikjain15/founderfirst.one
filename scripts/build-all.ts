/**
 * build-all — assemble the final deploy artifact at <repo>/dist/.
 *
 * Output layout (what GitHub Pages serves):
 *
 *   dist/
 *   ├─ index.html                           ← marketing landing
 *   ├─ confirmed/index.html                 ← signup confirmation
 *   ├─ assets/                              ← marketing CSS + JS bundles
 *   ├─ blog/                                ← VitePress
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
const MARKETING_DIST = resolve(ROOT, "apps/marketing/dist");
const BLOG_DIST = resolve(ROOT, "apps/blog/.vitepress/dist");
const DEMO_DIST = resolve(ROOT, "apps/demo/dist");

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
  step("Building marketing app");
  run("pnpm --filter @ff/marketing build");

  step("Building blog");
  run("pnpm --filter @ff/blog build");

  step("Building Penny demo");
  run("pnpm --filter @ff/demo build");

  step("Wiping dist/");
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  step("Copying marketing → dist/");
  copyDir(MARKETING_DIST, DIST);

  step("Copying blog → dist/blog/");
  copyDir(BLOG_DIST, resolve(DIST, "blog"));

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
