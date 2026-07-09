/**
 * check-site-url — guard against re-hardcoding the canonical origin in apps/web.
 *
 * The 6-Jul weekly audit (docs/AUDIT.md, apps/web P2s) found `https://founderfirst.one`
 * baked as a string literal into terms.astro / privacy.astro / extension-privacy.astro
 * (canonical URLs) and llms.txt.ts (5x), instead of reading `SITE.url` from
 * apps/web/src/lib/site.ts — the single source of truth (LEARNINGS rule 13 /
 * CLAUDE.md centralization gate). A hardcoded literal drifts silently the next
 * time the domain/origin changes; this check fails the build before that happens.
 *
 * Scans apps/web/src for a quoted `https://founderfirst.one` string literal
 * (a real URL usage, not prose) outside of lib/site.ts itself.
 *
 * Run: `pnpm check:site-url` (or `tsx scripts/check-site-url.ts`).
 * CI: .github/workflows/centralization.yml, alongside check:css-vars / check:app-strings.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB_SRC = resolve(ROOT, "apps/web/src");
const SOURCE_OF_TRUTH = resolve(WEB_SRC, "lib/site.ts");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const EXTS = [".ts", ".tsx", ".astro"];

// A quoted string literal containing the scheme+host — matches "...", '...', or
// `...` opening with https://founderfirst.one. Prose in comments/markdown that
// isn't inside quotes/backticks doesn't match.
const RE = /["'`]https:\/\/founderfirst\.one/g;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listFiles(resolve(dir, entry.name)));
    } else if (entry.isFile() && EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

function main(): void {
  const hits: { file: string; line: number }[] = [];
  for (const file of listFiles(WEB_SRC)) {
    if (file === SOURCE_OF_TRUTH) continue;
    const text = readFileSync(file, "utf8");
    const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;
    let m: RegExpExecArray | null;
    RE.lastIndex = 0;
    while ((m = RE.exec(text)) !== null) hits.push({ file, line: lineOf(m.index) });
  }

  if (hits.length > 0) {
    console.error("check:site-url FAILED — hardcoded founderfirst.one URL literal(s):\n");
    for (const h of hits) {
      console.error(`  ${relative(ROOT, h.file)}:${h.line}`);
    }
    console.error(
      "\nImport SITE from '../lib/site' (re-exports @ff/site) and build the URL from" +
        " `${SITE.url}/path/` instead of a literal — one place to change the origin."
    );
    process.exit(1);
  }

  console.log("check:site-url OK — no hardcoded founderfirst.one URL literals in apps/web/src.");
}

main();
