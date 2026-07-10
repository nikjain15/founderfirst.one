/**
 * check-css-vars — guard against the PENNY-UX-2 (F2) class of regression.
 *
 * The PENNY-UX-0 audit found nine CSS custom properties referenced in
 * apps/app/src/styles.css that were defined NOWHERE (--fs-sm, --fs-xs,
 * --fs-caption, --ink-1, --r-sm, --radius-1, --radius-2, --surface,
 * --surface-2). An unresolved `var(--x)` with no fallback is invalid at
 * computed-value time, so the property silently falls back to its initial
 * value: border-radius → 0, background → transparent, font-size → inherit.
 * The build stays green; only the UI quietly loses its intended styles
 * (LEARNINGS rule 14 — guard the silent failure modes).
 *
 * This script collects every `var(--x)` reference in apps/app/src (CSS files
 * plus inline `var(--x)` uses in .ts/.tsx) and fails if the variable is not
 * defined in packages/design-system/tokens.css or in any CSS file under
 * apps/app/src. References that carry an explicit fallback — `var(--x, 12px)`
 * — are exempt: they degrade deliberately, not silently.
 *
 * Run: `pnpm check:css-vars` (or `tsx scripts/check-css-vars.ts`).
 * CI: .github/workflows/centralization.yml (the app-checks workflow),
 * alongside check:app-strings — same silent-drift-guard family as check:css.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOKENS = resolve(ROOT, "packages/design-system/tokens.css");
const APP_SRC = resolve(ROOT, "apps/app/src");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listFiles(resolve(dir, entry.name), exts));
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

/** Every `--name:` custom-property DEFINITION in a stylesheet. */
export function parseDefinitions(css: string): Set<string> {
  const defs = new Set<string>();
  // Matches: `--name:` at declaration position (start of line or after { or ;).
  const re = /(?:^|[{;\s])(--[a-zA-Z0-9-]+)\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) defs.add(m[1]);
  return defs;
}

export type Usage = { name: string; file: string; line: number; hasFallback: boolean };

/** Every `var(--name)` / `var(--name, fallback)` REFERENCE in a file. */
export function parseUsages(text: string, file: string): Usage[] {
  const usages: Usage[] = [];
  const re = /var\(\s*(--[a-zA-Z0-9-]+)\s*(,)?/g;
  const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    usages.push({ name: m[1], file, line: lineOf(m.index), hasFallback: m[2] === "," });
  }
  return usages;
}

/**
 * Core check, factored out of main() so it can run against a fixture root in
 * tests (scripts/tests/check-css-vars.test.ts) as well as the real repo.
 */
export function findUnresolvedCssVars(
  tokensPath: string,
  appSrcDir: string
): { unresolved: Usage[]; checked: number; usageFileCount: number; defsCount: number } {
  const defs = parseDefinitions(readFileSync(tokensPath, "utf8"));
  const appCss = listFiles(appSrcDir, [".css"]);
  for (const file of appCss) {
    for (const d of parseDefinitions(readFileSync(file, "utf8"))) defs.add(d);
  }

  const usageFiles = [...appCss, ...listFiles(appSrcDir, [".ts", ".tsx"])];
  const unresolved: Usage[] = [];
  let checked = 0;
  for (const file of usageFiles) {
    for (const u of parseUsages(readFileSync(file, "utf8"), file)) {
      checked++;
      if (u.hasFallback) continue; // explicit fallback = deliberate degradation
      if (!defs.has(u.name)) unresolved.push(u);
    }
  }

  return { unresolved, checked, usageFileCount: usageFiles.length, defsCount: defs.size };
}

function main(): void {
  const { unresolved, checked, usageFileCount, defsCount } = findUnresolvedCssVars(TOKENS, APP_SRC);

  if (unresolved.length > 0) {
    console.error("check:css-vars FAILED — unresolved CSS custom properties:\n");
    for (const u of unresolved) {
      console.error(
        `  ${u.name}  at ${relative(ROOT, u.file)}:${u.line}` +
          `  (not defined in ${relative(ROOT, TOKENS)} or any apps/app/src stylesheet)`
      );
    }
    console.error(
      "\nEvery var(--x) in apps/app/src must resolve to a token in" +
        " packages/design-system/tokens.css (preferred) or an app-level definition." +
        " Never invent a new value inline — extend tokens.css if a token is missing."
    );
    process.exit(1);
  }

  console.log(
    `check:css-vars OK — ${checked} var() references across ${usageFileCount} files` +
      ` all resolve (${defsCount} known definitions).`
  );
}

// Only run the CLI check when this file is the entry module — importing it
// for its exported functions (tests) must not walk the repo / exit(1).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
