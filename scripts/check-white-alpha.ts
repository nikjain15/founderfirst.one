/**
 * check-white-alpha — guard against re-inlined white-on-dark overlay literals.
 *
 * The 14-Jul weekly audit found ~13 inline `rgba(255,255,255,x)` literals
 * scattered across apps/web (Base.astro, Section.astro, PennyPodcast.astro,
 * blog/[slug].astro) doing the same job — a translucent white border/fill/
 * text color on a dark (.dark section, navy hero) background — with no
 * shared token (LEARNINGS rule 13, one source of truth for design values).
 * They were centralized into the `--on-dark-*` family in
 * packages/design-system/tokens.css. This script fails the build if a new
 * `rgba(255, 255, 255, ...)` literal reappears in apps/web/src — extend the
 * --on-dark-* family in tokens.css instead of re-inlining.
 *
 * Run: `pnpm check:white-alpha` (or `tsx scripts/check-white-alpha.ts`).
 * CI: .github/workflows/centralization.yml.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB_SRC = resolve(ROOT, "apps/web/src");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const EXTS = [".astro", ".css", ".ts", ".tsx"];

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

type Hit = { file: string; line: number; text: string };

function main(): void {
  const re = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g;
  const hits: Hit[] = [];
  const files = listFiles(WEB_SRC);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) hits.push({ file, line: i + 1, text: line.trim() });
    });
  }

  if (hits.length > 0) {
    console.error("check:white-alpha FAILED — inline rgba(255,255,255,x) literal(s) found:\n");
    for (const h of hits) {
      console.error(`  ${relative(ROOT, h.file)}:${h.line}\n    ${h.text}`);
    }
    console.error(
      "\nUse a --on-dark-* token from packages/design-system/tokens.css instead of" +
        " inlining a white-overlay literal. Add a new --on-dark-N step there if the" +
        " exact alpha you need doesn't exist yet — never re-inline the rgba()."
    );
    process.exit(1);
  }

  console.log(`check:white-alpha OK — no inline rgba(255,255,255,x) literals across ${files.length} apps/web files.`);
}

main();
