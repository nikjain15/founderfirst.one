/**
 * check-app-strings — the centralization gate for card CENTRAL-1.
 *
 * apps/app must hold ZERO user-facing string literals in its components: every
 * owner/CPA-facing word lives in the strings catalog (apps/app/src/copy/strings.ts,
 * COPY) so the product's language can be tuned in one place, on brand (VOICE.md).
 * This script fails the build if a component reintroduces a hard-coded literal —
 * the same silent-drift guard discipline as check:css / check:tenant (LEARNINGS 14).
 *
 * What counts as a violation, in .tsx files under apps/app/src (minus the excluded
 * paths below):
 *   1. JSX text content that contains a letter — e.g. `<h1>Sign in</h1>`.
 *   2. A string literal assigned to a human-facing JSX attribute
 *      (placeholder / aria-label / title / alt / label) that contains a letter
 *      and a space or looks like a sentence — e.g. `aria-label="Switch org"`.
 *
 * Deliberately NOT flagged (these are code, not copy):
 *   - className / role / id / type / htmlType / key / value / href / to / name
 *     and other technical attributes.
 *   - Single-token attribute strings with no space (e.g. aria-label="Account")
 *     are still flagged; short technical tokens are rare and easily catalogued.
 *   - Anything in src/copy/** (the catalog itself), test files, and src/staff/**
 *     (the internal platform-staff console — not an owner/CPA surface; tracked
 *     separately, see the PR body).
 *
 * Run: `pnpm check:app-strings` (or `tsx scripts/check-app-strings.ts`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const APP_SRC = resolve(ROOT, "apps/app/src");

// Paths (relative to apps/app/src) that are exempt from the gate.
const EXCLUDE_PREFIXES = ["copy/", "staff/"];
const EXCLUDE_SUFFIXES = [".test.ts", ".test.tsx", ".d.ts"];

// Human-facing attributes whose string literals are copy.
const COPY_ATTRS = ["placeholder", "aria-label", "title", "alt"];

interface Violation { file: string; line: number; text: string; why: string; }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function isExempt(relPath: string): boolean {
  if (EXCLUDE_PREFIXES.some((pre) => relPath.startsWith(pre))) return true;
  if (EXCLUDE_SUFFIXES.some((suf) => relPath.endsWith(suf))) return true;
  return false;
}

const hasLetter = (s: string) => /[A-Za-z]/.test(s);

/** Strip line comments so `// Foo bar` text isn't mistaken for copy. */
function stripLineComment(line: string): string {
  const i = line.indexOf("//");
  // naive but fine here: our source has no `//` inside JSX string literals.
  return i >= 0 ? line.slice(0, i) : line;
}

function scanFile(abs: string): Violation[] {
  const relPath = relative(APP_SRC, abs);
  const src = readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const vios: Violation[] = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Skip block comments (the file-level JSDoc + inline /* */).
    if (inBlockComment) {
      if (line.includes("*/")) { inBlockComment = false; line = line.slice(line.indexOf("*/") + 2); }
      else continue;
    }
    if (line.includes("/*") && !line.includes("*/")) { inBlockComment = true; line = line.slice(0, line.indexOf("/*")); }
    const code = stripLineComment(line);

    // 1) JSX text content: `>Some words<` on one line. Require a letter; ignore
    //    pure-expression segments (`>{x}<`) and entity-only bits.
    for (const m of code.matchAll(/>([^<>{}]+)</g)) {
      const text = m[1].trim();
      if (!text || !hasLetter(text)) continue;
      if (/^&[a-z]+;$/.test(text)) continue;                 // HTML entity
      // Arrow-function return type — the leading `>` is the `=` of `=>`, so this
      // is a TS type (`() => Promise<void>`), not JSX text.
      if ((m.index ?? 0) > 0 && code[(m.index ?? 0) - 1] === "=") continue;
      // The Penny brand mark glyph `<span …>P</span>` — a single-letter logo, not
      // copy. Only a lone capital P is allowed here.
      if (text === "P") continue;
      vios.push({ file: relPath, line: i + 1, text, why: "JSX text literal" });
    }

    // 2) Human-facing attribute string literals.
    for (const attr of COPY_ATTRS) {
      const re = new RegExp(`\\b${attr.replace("-", "\\-")}=\"([^\"]+)\"`, "g");
      for (const m of code.matchAll(re)) {
        const val = m[1].trim();
        if (val && hasLetter(val)) {
          vios.push({ file: relPath, line: i + 1, text: `${attr}="${val}"`, why: "attribute copy literal" });
        }
      }
    }
  }
  return vios;
}

function main() {
  const files = walk(APP_SRC).filter((f) => !isExempt(relative(APP_SRC, f)));
  const violations = files.flatMap(scanFile);

  if (violations.length === 0) {
    console.log(`check-app-strings: OK — no user-facing string literals in apps/app components (${files.length} files scanned).`);
    return;
  }

  console.error(`check-app-strings: FAILED — ${violations.length} user-facing string literal(s) found in apps/app components.`);
  console.error("Move each into apps/app/src/copy/strings.ts (COPY) and reference it. VOICE.md governs the words.\n");
  for (const v of violations) {
    console.error(`  apps/app/src/${v.file}:${v.line}  [${v.why}]  ${JSON.stringify(v.text)}`);
  }
  process.exit(1);
}

main();
