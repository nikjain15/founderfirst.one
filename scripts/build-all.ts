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
 *   │  ├─ assets/  config/  prompts/        ← shared (from vendor/penny-demo/_shared)
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
const VENDOR = resolve(ROOT, "vendor/penny-demo");

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
  // Shared assets first, then persona index.htmls.
  copyDir(resolve(VENDOR, "_shared"), demoOut);
  mkdirSync(resolve(demoOut, "businessowner"), { recursive: true });
  cpSync(
    resolve(VENDOR, "businessowner/index.html"),
    resolve(demoOut, "businessowner/index.html"),
  );
  mkdirSync(resolve(demoOut, "cpa"), { recursive: true });
  cpSync(
    resolve(VENDOR, "cpa/index.html"),
    resolve(demoOut, "cpa/index.html"),
  );

  step("Writing /penny/demo/ → /penny/demo/businessowner/ redirect");
  writeRedirect(
    resolve(demoOut, "index.html"),
    "/penny/demo/businessowner/",
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
