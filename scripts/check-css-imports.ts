/**
 * check-css-imports — guard against the #66 class of regression.
 *
 * PR #66 accidentally truncated apps/admin/src/styles/content.css and
 * signals.css to 0 bytes. styles.css still `@import`ed them, so the bundler
 * silently skipped the empty files and shipped an admin with no tab/signals
 * styling. The build stayed green; only prod looked broken.
 *
 * This script walks every `@import` chain across the repo's CSS and fails if
 * any imported partial is MISSING or 0 bytes. Run it before `pnpm build` (CI
 * does, see .github/workflows/pages.yml) so an emptied partial breaks the
 * build instead of the live site.
 *
 * Scope: only `@import` targets resolved from CSS files under apps/, packages/,
 * and site-bubble/ are checked — i.e. the exact failure mode #66 hit. Bare /
 * URL / package-name imports (no relative path) are skipped; the bundler owns
 * those.
 *
 * Run: `pnpm check:css` (or `tsx scripts/check-css-imports.ts`).
 */
import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = ["apps", "packages", "site-bubble"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitepress", ".git"]);

/** Every `@import "<path>"` / `@import url(<path>)` target in a CSS file. */
export function parseImports(css: string): string[] {
  const targets: string[] = [];
  // Matches: @import "x.css";  @import url("x.css");  @import url(x.css);
  const re = /@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) targets.push(m[1]);
  return targets;
}

/** True if the import points at a local relative file we can resolve on disk. */
export function isRelativeCssImport(spec: string): boolean {
  if (!spec.endsWith(".css")) return false;            // skip @import "tailwindcss" etc.
  if (spec.startsWith("http://") || spec.startsWith("https://")) return false;
  if (spec.startsWith("/")) return false;              // absolute URL, bundler/CDN owns it
  // Bare specifier (package import like "@ff/design-system/x.css") — bundler owns it.
  return spec.startsWith(".");
}

function listCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listCssFiles(resolve(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

/**
 * Core check, factored out of main() so it can run against a fixture root in
 * tests (scripts/tests/check-css-imports.test.ts) as well as the real repo.
 */
export function findCssImportProblems(
  root: string,
  scanDirs: string[]
): { problems: string[]; checked: number } {
  const problems: string[] = [];
  let checked = 0;

  const cssFiles = scanDirs
    .map((d) => resolve(root, d))
    .filter(existsSync)
    .flatMap(listCssFiles);

  for (const file of cssFiles) {
    const imports = parseImports(readFileSync(file, "utf8")).filter(isRelativeCssImport);
    for (const spec of imports) {
      const target = resolve(dirname(file), spec);
      const from = relative(root, file);
      if (!existsSync(target)) {
        problems.push(`MISSING  ${relative(root, target)}  (@import'ed from ${from})`);
        continue;
      }
      checked++;
      if (statSync(target).size === 0) {
        problems.push(`0 BYTES  ${relative(root, target)}  (@import'ed from ${from})`);
      }
    }
  }

  return { problems, checked };
}

function main(): void {
  const { problems, checked } = findCssImportProblems(ROOT, SCAN_DIRS);

  if (problems.length > 0) {
    console.error(`\n✗ CSS import guard failed — ${problems.length} bad @import target(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("\nAn @import'ed partial is missing or empty. The bundler would");
    console.error("silently skip it and ship unstyled UI. Fix the file, then rebuild.\n");
    process.exit(1);
  }

  console.info(`✓ CSS import guard passed — ${checked} @import target(s) present and non-empty.`);
}

// Only run the CLI check when this file is the entry module — importing it
// for its exported functions (tests) must not walk the repo / exit(1).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
