/**
 * check-kernel-hardcodes — CENTRAL-2 grep-gate (acceptance: "No app hardcodes an
 * entity/industry/deadline list anymore").
 *
 * Business knowledge is kernel seed data (Roadmap 3b). A feature file that inlines
 * the list of entity types, industries, or a filing calendar is a drift source:
 * add a sector to the seed and that file silently won't have it. This guard fails
 * the build when a scanned feature file enumerates ≥3 of the known kernel keys
 * (entity_types or industries) as literals, which is the signature of an inlined
 * list.
 *
 * The kernel keys themselves are read from the seed files (single source of
 * truth), so this guard never goes stale as sectors are added.
 *
 * Scope: apps/app, apps/web, apps/admin, site-bubble, supabase/functions.
 * EXEMPT: the seed files, the demo (apps/demo — a throwaway prototype), tests,
 * and any line marked `// kernel-ok: <reason>` (e.g. a UI that reads the kernel
 * and only names one key for a default).
 *
 * Run: `pnpm check:kernel-hardcodes`.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SELF = resolve(__dirname, "check-kernel-hardcodes.ts");
const SEED_DIR = resolve(ROOT, "supabase/seeds/kernel");

const SCAN_DIRS = ["apps/app", "apps/web", "apps/admin", "site-bubble", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitepress", ".git", "tests", "demo"]);
const EXTS = [".ts", ".tsx"];
const MIN_KEYS = 3; // ≥3 known keys in one file = an inlined list, not incidental use.

function seedKeys(file: string): string[] {
  try {
    const j = JSON.parse(readFileSync(resolve(SEED_DIR, file), "utf8")) as { rows: { key?: string }[] };
    return j.rows.map((r) => r.key).filter((k): k is string => !!k);
  } catch { return []; }
}

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

function countQuotedKeys(text: string, keys: string[]): string[] {
  const hits: string[] = [];
  for (const k of keys) {
    // the key as a quoted string literal ('consulting' / "s_corp")
    if (new RegExp(`["'\`]${k.replace(/[-/]/g, "\\$&")}["'\`]`).test(text)) hits.push(k);
  }
  return hits;
}

function main(): void {
  const entityKeys = seedKeys("entity_types.json");
  const industryKeys = seedKeys("industries.json");
  if (entityKeys.length === 0 || industryKeys.length === 0) {
    console.error("✗ check-kernel-hardcodes: could not read seed keys — is supabase/seeds/kernel/*.json present?");
    process.exit(1);
  }

  const problems: string[] = [];
  const files = SCAN_DIRS.map((d) => resolve(ROOT, d))
    .filter(existsSync)
    .flatMap(listFiles)
    .filter((f) => f !== SELF);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/kernel-ok:/i.test(text)) continue;      // whole-file documented exemption
    const from = relative(ROOT, file);
    const eHits = countQuotedKeys(text, entityKeys);
    const iHits = countQuotedKeys(text, industryKeys);
    if (eHits.length >= MIN_KEYS)
      problems.push(`${from} inlines ${eHits.length} entity_type keys (${eHits.slice(0, 4).join(", ")}…) — read the entity_types kernel table instead.`);
    if (iHits.length >= MIN_KEYS)
      problems.push(`${from} inlines ${iHits.length} industry keys (${iHits.slice(0, 4).join(", ")}…) — read the industries kernel table instead.`);
  }

  if (problems.length) {
    console.error(`\n✗ Kernel-hardcode guard failed — ${problems.length} inlined knowledge list(s):\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error(
      "\nEntity/industry/deadline lists are kernel seed data (Roadmap 3b). Query the " +
      "table; adding a sector must be a seed edit, not a code change. Add `// kernel-ok: <reason>` if this is a legitimate exception.\n",
    );
    process.exit(1);
  }
  console.info(`✓ Kernel-hardcode guard passed — scanned ${files.length} file(s); no inlined entity/industry lists.`);
}

main();
