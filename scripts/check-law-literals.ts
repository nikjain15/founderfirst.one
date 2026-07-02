/**
 * check-law-literals — CI guard for Roadmap principle 3c step 2:
 * "Apps only look up, never know." No app or edge fn may contain a law-derived
 * literal (a $ threshold, %, filing deadline, or IRS form line number). Those are
 * kernel data (filing_obligations / tax tables) queried at runtime — a literal in
 * feature code is a law fact that will silently go stale when the law changes.
 *
 * Scans feature code only (apps/app, apps/web, site-bubble, supabase/functions).
 * Flags lines that pair a law KEYWORD (1099, threshold, quarterly estimate, filing
 * deadline, meals %, mileage, due date) with a hard NUMBER ($ amount, %, or a
 * MM/DD-style date). This is intentionally a heuristic; a legitimate exception
 * opts out with an explicit `// law-ok: <reason>` marker on the same line, so
 * every exemption is reviewable (same pattern as check-tenant-predicate's
 * `-- tenant-ok:`).
 *
 * Run: `pnpm check:law-literals`.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SELF = resolve(__dirname, "check-law-literals.ts");

// Feature code that must be law-literal-free. Seeds/tests/migrations are the
// SANCTIONED home for law data and are NOT scanned.
const SCAN_DIRS = ["apps/app", "apps/web", "site-bubble", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitepress", ".git", "tests", "seeds"]);
const EXTS = [".ts", ".tsx"];

// A law keyword near a hard number is the smell. Keywords that name a law fact:
const LAW_KEYWORDS = [
  /\b1099(?:-?[a-z]+)?\b/i,        // 1099, 1099-NEC, 1099-K…
  /\bthreshold\b/i,
  /\bquarterly\s+estimate/i,
  /\bestimated\s+tax/i,
  /\bfiling\s+deadline/i,
  /\bdue\s+(?:date|by)\b/i,
  /\bmeals?\b.*\b(?:deduct|%)/i,
  /\bmileage\s+rate\b/i,
  /\bstandard\s+deduction\b/i,
  /\bself[-\s]?employment\s+tax\b/i,
];
// A "hard number" that would encode the law: a dollar amount, a percentage, or a
// month/day filing date literal.
const HARD_NUMBER =
  /\$\s?\d[\d,]{2,}|\b\d{1,2}\s?%|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/i;

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
  const problems: string[] = [];
  const files = SCAN_DIRS.map((d) => resolve(ROOT, d))
    .filter(existsSync)
    .flatMap(listFiles)
    .filter((f) => f !== SELF);

  for (const file of files) {
    const from = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/law-ok:/i.test(line)) return;                    // documented exemption
      if (!LAW_KEYWORDS.some((re) => re.test(line))) return;
      if (!HARD_NUMBER.test(line)) return;
      problems.push(`${from}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }

  if (problems.length) {
    console.error(`\n✗ Law-literal guard failed — ${problems.length} law-looking literal(s) in feature code:\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error(
      "\nLaw facts ($ thresholds, %, deadlines, form lines) live in the kernel " +
      "(filing_obligations / tax tables), queried at runtime (Roadmap 3c). " +
      "Move the value to a seed row, or add `// law-ok: <reason>` if it's genuinely not a law fact.\n",
    );
    process.exit(1);
  }
  console.info(`✓ Law-literal guard passed — scanned ${files.length} feature file(s); no law literals.`);
}

main();
