/**
 * seed-depreciation — the idempotent loader for W1.3-C fixed-asset & depreciation
 * LAW DATA (asset_classes + macrs_percentages).
 *
 * MACRS recovery classes, §179 caps, bonus %, and the IRS published MACRS
 * percentage tables are SEED DATA the depreciation engine looks up — a law change
 * (bonus step-down, §179 bump, a new class) is a seed-file edit, ZERO schema or
 * code change (Roadmap 3c; mirrors scripts/seed-tax.ts + seed-kernel.ts).
 *
 * Seed layout:
 *   supabase/seeds/depreciation/asset_classes.json      (asset_classes rows)
 *   supabase/seeds/depreciation/macrs_percentages.json  (macrs_percentages rows)
 * → compiled to supabase/seeds/depreciation/_generated.sql, \i-included from
 *   supabase/seed.sql AFTER the kernel + tax seeds (FK to tax_jurisdictions).
 *
 * Idempotency: upsert on the natural effective-dated key
 *   asset_classes:     (jurisdiction_code, class_key, tax_year, effective_from)
 *   macrs_percentages: (jurisdiction_code, recovery_period, convention, macrs_method, year_index, effective_from)
 * A within-year law change is a NEW row with a NEW effective_from (a supersede via
 * supersede_asset_class), never an overwrite.
 *
 * Modes:
 *   (default / --emit)  regenerate _generated.sql.
 *   --check             CI. Regenerate in-memory, assert byte-match (no drift) AND
 *                       lint (below). Exits non-zero on any problem.
 *
 * Lint:
 *   - every asset_class references a known jurisdiction + valid recovery period;
 *   - every asset_class recovery_period+convention has a MACRS percentage table
 *     (so the compute never hits a missing lookup);
 *   - MACRS percentages for a (recovery_period, convention, method) sum to ~100%
 *     (the published tables fully recover basis) — catches a fat-fingered rate;
 *   - no duplicate effective_from for one natural key (a real supersede changes it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED_DIR = resolve(ROOT, "supabase/seeds/depreciation");
const OUT = resolve(SEED_DIR, "_generated.sql");
const SEED_SQL = resolve(ROOT, "supabase/seed.sql");

// Delimited section this card owns inside the SHARED supabase/seed.sql. Supabase's
// stack startup applies that file over the pgx BATCH protocol, which does NOT
// understand psql backslash meta-commands (`\i`, `\set`) — a single `\i` is a raw
// syntax error that aborts the whole reset/replay. So we INLINE the generated SQL
// between these markers instead of `\i`-including it (mirrors scripts/seed-kernel.ts
// and scripts/seed-tax.ts). A loader only rewrites the block between ITS markers,
// appending it (after the kernel + tax sections) if absent.
const SECTION_BEGIN = "-- ==== BEGIN GENERATED: depreciation (scripts/seed-depreciation.ts) — do not edit by hand ====";
const SECTION_END = "-- ==== END GENERATED: depreciation ====";
const KNOWN_JURISDICTIONS = new Set(["US-FED", "US-CA", "CA-FED"]); // aligns tax_jurisdictions seed
const VALID_RECOVERY = new Set([3, 5, 7, 10, 15, 20]);

interface AssetClass {
  jurisdiction_code: string; class_key: string; label: string; tax_year: number;
  recovery_period: number; macrs_method?: string; default_convention?: string;
  section_179_cap_minor?: number | null; bonus_pct?: number | null;
  class_life_years?: number | null; effective_from: string; citation: string; source?: string;
}
interface MacrsPct {
  jurisdiction_code: string; recovery_period: number; convention: string; macrs_method?: string;
  year_index: number; percentage: number; effective_from: string; citation: string; source?: string;
}

const sqlStr = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
};

const loadClasses = (): AssetClass[] =>
  JSON.parse(readFileSync(resolve(SEED_DIR, "asset_classes.json"), "utf8")).rows as AssetClass[];
const loadPcts = (): MacrsPct[] =>
  JSON.parse(readFileSync(resolve(SEED_DIR, "macrs_percentages.json"), "utf8")).rows as MacrsPct[];

function emitClasses(rows: AssetClass[]): string {
  const lines = [`-- asset_classes (${rows.length} rows)`];
  for (const r of rows) {
    lines.push(
      `insert into public.asset_classes (jurisdiction_code, class_key, label, tax_year, recovery_period, ` +
      `macrs_method, default_convention, section_179_cap_minor, bonus_pct, class_life_years, effective_from, citation, source) values (` +
      `${sqlStr(r.jurisdiction_code)}, ${sqlStr(r.class_key)}, ${sqlStr(r.label)}, ${sqlStr(r.tax_year)}, ${sqlStr(r.recovery_period)}, ` +
      `${sqlStr(r.macrs_method ?? "200DB")}, ${sqlStr(r.default_convention ?? "half_year")}, ${sqlStr(r.section_179_cap_minor ?? null)}, ` +
      `${sqlStr(r.bonus_pct ?? null)}, ${sqlStr(r.class_life_years ?? null)}, ${sqlStr(r.effective_from)}, ${sqlStr(r.citation)}, 'seed')\n` +
      `  on conflict (jurisdiction_code, class_key, tax_year, effective_from) do update set ` +
      `label = excluded.label, recovery_period = excluded.recovery_period, macrs_method = excluded.macrs_method, ` +
      `default_convention = excluded.default_convention, section_179_cap_minor = excluded.section_179_cap_minor, ` +
      `bonus_pct = excluded.bonus_pct, class_life_years = excluded.class_life_years, citation = excluded.citation;`,
    );
  }
  return lines.join("\n");
}

function emitPcts(rows: MacrsPct[]): string {
  const lines = [`-- macrs_percentages (${rows.length} rows)`];
  for (const r of rows) {
    lines.push(
      `insert into public.macrs_percentages (jurisdiction_code, recovery_period, convention, macrs_method, year_index, percentage, effective_from, citation, source) values (` +
      `${sqlStr(r.jurisdiction_code)}, ${sqlStr(r.recovery_period)}, ${sqlStr(r.convention)}, ${sqlStr(r.macrs_method ?? "200DB")}, ` +
      `${sqlStr(r.year_index)}, ${sqlStr(r.percentage)}, ${sqlStr(r.effective_from)}, ${sqlStr(r.citation)}, 'seed')\n` +
      `  on conflict (jurisdiction_code, recovery_period, convention, macrs_method, year_index, effective_from) do update set ` +
      `percentage = excluded.percentage, citation = excluded.citation;`,
    );
  }
  return lines.join("\n");
}

function generate(): string {
  const banner =
    "-- GENERATED by scripts/seed-depreciation.ts — DO NOT EDIT BY HAND.\n" +
    "-- Source: supabase/seeds/depreciation/*.json. Regenerate: `pnpm seed:depreciation`.\n" +
    "-- W1.3-C fixed-asset & depreciation LAW DATA. Applied via supabase/seed.sql.\n\n" +
    "begin;\n\n";
  return banner + emitClasses(loadClasses()) + "\n\n" + emitPcts(loadPcts()) + "\n\ncommit;\n";
}

function validate(): string[] {
  const problems: string[] = [];
  const classes = loadClasses();
  const pcts = loadPcts();

  // percentage tables present + sum ~100 per (jurisdiction, recovery, convention, method)
  const groups = new Map<string, number>();
  for (const p of pcts) {
    if (!KNOWN_JURISDICTIONS.has(p.jurisdiction_code))
      problems.push(`macrs_percentages: unknown jurisdiction '${p.jurisdiction_code}'`);
    const k = `${p.jurisdiction_code}|${p.recovery_period}|${p.convention}|${p.macrs_method ?? "200DB"}`;
    groups.set(k, (groups.get(k) ?? 0) + p.percentage);
  }
  for (const [k, sum] of groups)
    if (Math.abs(sum - 100) > 0.05)
      problems.push(`macrs_percentages: table ${k} sums to ${sum.toFixed(2)}% (expected ~100% — the tables fully recover basis)`);

  // effective-dating dup guard + class → table coverage
  const seenClass = new Set<string>();
  for (const c of classes) {
    if (!KNOWN_JURISDICTIONS.has(c.jurisdiction_code))
      problems.push(`asset_classes: unknown jurisdiction '${c.jurisdiction_code}' for ${c.class_key}`);
    if (!VALID_RECOVERY.has(c.recovery_period))
      problems.push(`asset_classes: ${c.class_key}/${c.tax_year} invalid recovery_period ${c.recovery_period}`);
    const nk = `${c.jurisdiction_code}|${c.class_key}|${c.tax_year}|${c.effective_from}`;
    if (seenClass.has(nk))
      problems.push(`asset_classes: duplicate natural key ${nk} — a supersede must change effective_from`);
    seenClass.add(nk);
    const method = c.macrs_method ?? "200DB";
    const conv = (c.default_convention ?? "half_year") === "mid_quarter" ? "mid_quarter_q4" : (c.default_convention ?? "half_year");
    const tableKey = `${c.jurisdiction_code}|${c.recovery_period}|${conv}|${method}`;
    if (!groups.has(tableKey))
      problems.push(`asset_classes: ${c.class_key}/${c.tax_year} needs MACRS table ${tableKey} but none is seeded`);
  }
  return problems;
}

/** The inlined section body (pure SQL, no backslash meta-commands) that belongs
 *  between this card's markers in supabase/seed.sql. */
function sectionBody(generated: string): string {
  return `${SECTION_BEGIN}\n${generated.trimEnd()}\n${SECTION_END}\n`;
}

/** Read supabase/seed.sql, replace this card's marked section (or append it — after
 *  the kernel + tax sections — if absent), and return the full file. Leaves other
 *  cards' sections untouched. Guarantees the result contains NO psql backslash
 *  meta-commands (strips any legacy `\i` include of our generated file). */
function renderSeedSql(current: string, generated: string): string {
  const body = sectionBody(generated);
  const bi = current.indexOf(SECTION_BEGIN);
  const ei = current.indexOf(SECTION_END);
  if (bi !== -1 && ei !== -1 && ei > bi) {
    const before = current.slice(0, bi);
    const after = current.slice(ei + SECTION_END.length).replace(/^\n/, "");
    return `${before}${body}${after}`;
  }
  // No section yet — strip any legacy `\i` include of our generated file, then
  // append our inlined section after everything else (kernel + tax load first).
  const stripped = current
    .split("\n")
    .filter((l) => !/^\s*\\i\s+supabase\/seeds\/depreciation\/_generated\.sql\s*$/.test(l))
    .join("\n");
  return `${stripped.trimEnd()}\n\n${body}`;
}

function main(): void {
  const mode = process.argv.includes("--check") ? "check" : "emit";
  const generated = generate();
  if (mode === "check") {
    const problems = validate();
    let committed = "";
    try { committed = readFileSync(OUT, "utf8"); } catch { /* missing */ }
    if (committed !== generated)
      problems.push("supabase/seeds/depreciation/_generated.sql is STALE — run `pnpm seed:depreciation` and commit the result.");

    // seed.sql must inline the generated depreciation section (Supabase startup
    // applies it over the pgx batch protocol — no `\i`/backslash meta-commands).
    let seedSql = "";
    try { seedSql = readFileSync(SEED_SQL, "utf8"); } catch { /* missing */ }
    if (renderSeedSql(seedSql, generated) !== seedSql)
      problems.push("supabase/seed.sql depreciation section is STALE or missing — run `pnpm seed:depreciation` and commit the result.");
    if (/^\s*\\/m.test(seedSql))
      problems.push("supabase/seed.sql contains a psql backslash meta-command (e.g. `\\i`) — unsupported by Supabase startup; inline the SQL instead.");

    if (problems.length) {
      console.error(`\n✗ Depreciation seed lint failed — ${problems.length} problem(s):\n`);
      for (const p of problems) console.error(`  • ${p}`);
      console.error("");
      process.exit(1);
    }
    console.info("✓ Depreciation seed lint passed — generated SQL fresh, MACRS tables sum to 100%, class→table coverage intact, effective-dating clean.");
    return;
  }
  writeFileSync(OUT, generated, "utf8");
  console.info(`✓ Wrote ${OUT} (${generated.split("\n").length} lines).`);

  let seedSql = "";
  try { seedSql = readFileSync(SEED_SQL, "utf8"); } catch { /* missing */ }
  const nextSeedSql = renderSeedSql(seedSql, generated);
  writeFileSync(SEED_SQL, nextSeedSql, "utf8");
  console.info(`✓ Inlined depreciation section into ${SEED_SQL} (no backslash meta-commands).`);
}

main();
