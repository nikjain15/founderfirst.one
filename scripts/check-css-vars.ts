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
 * The weekly audit (2026-07-06, LEARNINGS Rule 25 companion finding) found
 * this guard scanned ONLY apps/app/src — three unresolved vars in
 * apps/admin/src (--accent-soft/--accent/--accent-ink, --warn,
 * --text-warning) rendering invisible UI states sailed through CI
 * undetected ("a guard scoped to one surface" — the same class of gap as
 * check:css-vars itself was created to close). This script now scans every
 * app surface that ships its own stylesheets: apps/app/src, apps/admin/src,
 * apps/web/src (CSS + inline var() in .ts/.tsx/.astro).
 *
 * This script collects every `var(--x)` reference across those roots and
 * fails if the variable is not defined in packages/design-system/tokens.css
 * or in any CSS/astro file under the same root. References that carry an
 * explicit fallback — `var(--x, 12px)` — are exempt: they degrade
 * deliberately, not silently.
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
const APP_ROOTS = [
  { dir: resolve(ROOT, "apps/app/src"), exts: [".css", ".ts", ".tsx"] },
  { dir: resolve(ROOT, "apps/admin/src"), exts: [".css", ".ts", ".tsx"] },
  { dir: resolve(ROOT, "apps/web/src"), exts: [".css", ".astro", ".ts", ".tsx"] },
];
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
function parseDefinitions(css: string): Set<string> {
  const defs = new Set<string>();
  // Matches: `--name:` at declaration position (start of line or after { or ;).
  const re = /(?:^|[{;\s])(--[a-zA-Z0-9-]+)\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) defs.add(m[1]);
  return defs;
}

type Usage = { name: string; file: string; line: number; hasFallback: boolean };

/** Every `var(--name)` / `var(--name, fallback)` REFERENCE in a file. */
function parseUsages(text: string, file: string): Usage[] {
  const usages: Usage[] = [];
  const re = /var\(\s*(--[a-zA-Z0-9-]+)\s*(,)?/g;
  const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    usages.push({ name: m[1], file, line: lineOf(m.index), hasFallback: m[2] === "," });
  }
  return usages;
}

function main(): void {
  // Definitions: the design-system source of truth + any app-level stylesheet
  // (a CSS var defined in one app's stylesheet is a legitimate local definition
  // for that app's own usages — checked per-root below, not pooled globally).
  const tokenDefs = parseDefinitions(readFileSync(TOKENS, "utf8"));

  const unresolved: Usage[] = [];
  let checked = 0;
  let filesScanned = 0;

  for (const { dir, exts } of APP_ROOTS) {
    const cssLikeExts = exts.filter((e) => e === ".css" || e === ".astro");
    const styleFiles = listFiles(dir, cssLikeExts);
    const defs = new Set(tokenDefs);
    for (const file of styleFiles) {
      for (const d of parseDefinitions(readFileSync(file, "utf8"))) defs.add(d);
    }

    const usageFiles = listFiles(dir, exts);
    filesScanned += usageFiles.length;
    for (const file of usageFiles) {
      for (const u of parseUsages(readFileSync(file, "utf8"), file)) {
        checked++;
        if (u.hasFallback) continue; // explicit fallback = deliberate degradation
        if (!defs.has(u.name)) unresolved.push(u);
      }
    }
  }

  if (unresolved.length > 0) {
    console.error("check:css-vars FAILED — unresolved CSS custom properties:\n");
    for (const u of unresolved) {
      console.error(
        `  ${u.name}  at ${relative(ROOT, u.file)}:${u.line}` +
          `  (not defined in ${relative(ROOT, TOKENS)} or any stylesheet in its app root)`
      );
    }
    console.error(
      "\nEvery var(--x) in apps/{app,admin,web}/src must resolve to a token in" +
        " packages/design-system/tokens.css (preferred) or an app-level definition." +
        " Never invent a new value inline — extend tokens.css if a token is missing."
    );
    process.exit(1);
  }

  console.log(
    `check:css-vars OK — ${checked} var() references across ${filesScanned} files` +
      ` (apps/app, apps/admin, apps/web) all resolve (${tokenDefs.size} shared token definitions).`
  );
}

main();
