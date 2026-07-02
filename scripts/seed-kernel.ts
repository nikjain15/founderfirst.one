/**
 * seed-kernel — the idempotent loader for the CENTRAL-2 knowledge kernel.
 *
 * Business knowledge is SEED DATA every app projects from (Roadmap principle 3b):
 * entity_types · industries · filing_obligations · vendor_priors · connectors.
 * Adding a sector/entity/deadline/connector is a seed-file edit — zero schema or
 * feature-code change.
 *
 * This script compiles the JSON seed files in supabase/seeds/kernel/*.json into
 * ONE idempotent SQL file (supabase/seeds/kernel/_generated.sql) using
 * `insert … on conflict … do update`, so:
 *   - re-running is safe (upsert on the natural key),
 *   - a corrected seed value is a re-run, not a hand-written UPDATE,
 *   - the generated SQL is committed and applied via `supabase db reset`
 *     (it is appended to supabase/seed.sql — see the loader-lint below).
 *
 * Modes:
 *   (default / --emit)  regenerate supabase/seeds/kernel/_generated.sql from the
 *                        JSON seeds.
 *   --check             CI mode. Regenerate in-memory, assert it byte-matches the
 *                        committed _generated.sql (no drift), AND validate seed
 *                        referential integrity (industry_key / entity_type refs,
 *                        effective-dating: no two open rows for one obligation).
 *                        Exits non-zero on any problem.
 *
 * Idempotency + lint are wired into CI (.github/workflows/kernel-seed.yml), the
 * same discipline as migrations-unique / check-css-imports (LEARNINGS #14).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED_DIR = resolve(ROOT, "supabase/seeds/kernel");
const OUT = resolve(SEED_DIR, "_generated.sql");
const SEED_SQL = resolve(ROOT, "supabase/seed.sql");

// Delimited section this card owns inside the SHARED supabase/seed.sql. The seed
// file is applied by Supabase's stack startup over the pgx BATCH protocol, which
// does NOT understand psql backslash meta-commands (`\i`, `\set`) — so we INLINE
// the generated SQL between these markers instead of `\i`-including it. Other loop
// cards own their own BEGIN/END-marked sections in the same file; a loader only
// rewrites the block between ITS markers, appending a new one if absent.
const SECTION_BEGIN = "-- ==== BEGIN GENERATED: kernel (scripts/seed-kernel.ts) — do not edit by hand ====";
const SECTION_END = "-- ==== END GENERATED: kernel ====";

type Row = Record<string, unknown>;
interface SeedFile {
  _meta: { table: string; primary_key?: string };
  rows: Row[];
}

const sqlStr = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** Column set + conflict target + update policy per table. Explicit (not inferred
 *  from row keys) so a typo'd seed key fails loudly instead of silently creating a
 *  column mismatch. */
const TABLES: Record<
  string,
  {
    cols: string[];
    conflict: string;
    touchUpdatedAt?: boolean;
    /** Columns NEVER overwritten by a re-seed's DO UPDATE. For effective-dated law
     *  rows this is load-bearing: a supersede sets effective_to on the seeded row and
     *  a regulatory_watcher stamps source — a naive re-seed would reset effective_to
     *  back to null (re-opening a closed window → clobbering old law / colliding with
     *  the one-active index) and overwrite source back to 'seed'. Re-seed only
     *  refreshes descriptive fields; it never resurrects a closed window. */
    immutableOnConflict?: string[];
    /** Columns to OMIT from the INSERT when the seed value is null/absent, so the
     *  DB default applies (e.g. source NOT NULL DEFAULT 'seed'). Without this a
     *  missing key renders as SQL null and violates the NOT NULL constraint. */
    omitIfNull?: string[];
  }
> = {
  entity_types: {
    cols: ["key", "label", "short_label", "description", "diagnostic_questions",
           "owner_draw_treatment", "officer_comp_rule", "forms_filed",
           "files_balance_sheet", "sort_order"],
    conflict: "(key)", touchUpdatedAt: true,
  },
  industries: {
    cols: ["key", "label", "icon", "coa_template_ref", "payment_methods",
           "vendor_priors", "expense_categories", "banks", "tax_quirks",
           "marketing_blurb", "signals_queries", "sample_income_vendor",
           "sample_income_label", "sample_expense_vendor", "sample_expense_label",
           "sort_order"],
    conflict: "(key)", touchUpdatedAt: true,
  },
  filing_obligations: {
    // effective-dated law rows: conflict on the natural key WITHIN an effective
    // window. We key on (jurisdiction, entity, tax_year, obligation_key,
    // effective_from) so re-seeding a corrected row updates in place, but a new
    // effective_from is a NEW row (a supersede) — never overwriting old law.
    cols: ["jurisdiction_code", "entity_type", "tax_year", "obligation_key",
           "kind", "form_code", "label", "due_month", "due_day", "due_year_offset",
           "threshold_minor", "notes", "effective_from", "effective_to",
           "citation", "source"],
    conflict: "(jurisdiction_code, entity_type, tax_year, obligation_key, effective_from)",
    // effective_to + source belong to the law LIFECYCLE (supersede / watcher), not
    // the seed's description of the row. Never let a re-seed reset them.
    immutableOnConflict: ["effective_to", "source"],
    omitIfNull: ["source"],
  },
  vendor_priors: {
    cols: ["match_pattern", "vendor_label", "category_hint", "industry_key", "confidence"],
    conflict: "(match_pattern, coalesce(industry_key, ''))", touchUpdatedAt: true,
  },
  connectors: {
    cols: ["key", "name", "category", "logo_ref", "capabilities", "scopes",
           "status", "sort_order"],
    conflict: "(key)", touchUpdatedAt: true,
  },
  coa_account_templates: {
    // CoA templates keyed by (template_ref, code). Re-seeding a corrected chart
    // updates names/types in place; a new account is a new row (W3.3).
    cols: ["template_ref", "code", "name", "type", "sort_order"],
    conflict: "(template_ref, code)", touchUpdatedAt: true,
  },
};

function loadSeed(file: string): SeedFile {
  return JSON.parse(readFileSync(resolve(SEED_DIR, file), "utf8")) as SeedFile;
}

/** Column names appearing in a conflict target, so we never write them in the
 *  DO UPDATE set (they're the key). Handles bare cols + coalesce(col, '') forms. */
function conflictCols(conflict: string): Set<string> {
  const inner = conflict.replace(/^\s*\(|\)\s*$/g, "");
  const out = new Set<string>();
  for (const part of inner.split(",")) {
    const m = part.trim().match(/^([a-z_]+)/i);        // first identifier in the term
    const co = part.trim().match(/coalesce\(\s*([a-z_]+)/i);
    if (co) out.add(co[1]);
    else if (m) out.add(m[1]);
  }
  return out;
}

function emitTable(table: string, seed: SeedFile): string {
  const spec = TABLES[table];
  if (!spec) throw new Error(`No column spec for table '${table}'`);
  const keyCols = conflictCols(spec.conflict);
  const immutable = new Set(spec.immutableOnConflict ?? []);
  const omitIfNull = new Set(spec.omitIfNull ?? []);
  const lines: string[] = [];
  lines.push(`-- ${table} (${seed.rows.length} rows)`);
  for (const row of seed.rows) {
    // Omit NOT-NULL-defaulted columns whose seed value is absent/null so the DB
    // default applies (otherwise SQL null violates the NOT NULL constraint).
    const cols = spec.cols.filter(
      (c) => !(omitIfNull.has(c) && (row[c] === null || row[c] === undefined)),
    );
    const values = cols.map((c) => sqlStr(row[c])).join(", ");
    const updates = cols
      .filter((c) => !keyCols.has(c) && !immutable.has(c))
      .map((c) => `${c} = excluded.${c}`);
    if (spec.touchUpdatedAt) updates.push("updated_at = now()");
    lines.push(
      `insert into public.${table} (${cols.join(", ")}) values (${values})\n` +
      `  on conflict ${spec.conflict} do update set ${updates.join(", ")};`,
    );
  }
  return lines.join("\n");
}

// Deterministic file order so output is stable.
const FILE_ORDER = ["entity_types.json", "industries.json", "connectors.json",
                    "vendor_priors.json", "filing_obligations.json",
                    "coa_account_templates.json"];

function generate(): string {
  const banner =
    "-- GENERATED by scripts/seed-kernel.ts — DO NOT EDIT BY HAND.\n" +
    "-- Source: supabase/seeds/kernel/*.json. Regenerate: `pnpm seed:kernel`.\n" +
    "-- Idempotent upserts (CENTRAL-2 knowledge kernel). Applied via supabase/seed.sql.\n\n" +
    "begin;\n\n";
  const files = new Set(readdirSync(SEED_DIR).filter((f) => f.endsWith(".json")));
  const ordered = [...FILE_ORDER.filter((f) => files.has(f))];
  const blocks = ordered.map((f) => {
    const seed = loadSeed(f);
    return emitTable(seed._meta.table, seed);
  });
  return banner + blocks.join("\n\n") + "\n\ncommit;\n";
}

/** Referential + effective-dating validation (CI). */
function validate(): string[] {
  const problems: string[] = [];
  const entities = new Set(loadSeed("entity_types.json").rows.map((r) => r.key as string));
  const industries = new Set(loadSeed("industries.json").rows.map((r) => r.key as string));

  // filing_obligations: entity_type must exist; no two OPEN rows (effective_to
  // null) for one (jurisdiction, entity, year, obligation).
  const openKeys = new Map<string, number>();
  for (const r of loadSeed("filing_obligations.json").rows) {
    if (!entities.has(r.entity_type as string))
      problems.push(`filing_obligations references unknown entity_type '${r.entity_type}'`);
    if (r.effective_to === undefined || r.effective_to === null) {
      const k = `${r.jurisdiction_code}|${r.entity_type}|${r.tax_year}|${r.obligation_key}`;
      openKeys.set(k, (openKeys.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of openKeys)
    if (n > 1) problems.push(`filing_obligations has ${n} OPEN (effective_to=null) rows for ${k} — effective-dating invariant broken (only one active rule allowed)`);

  // vendor_priors.industry_key + industries.coa_template_ref sanity.
  for (const r of loadSeed("vendor_priors.json").rows)
    if (r.industry_key && !industries.has(r.industry_key as string))
      problems.push(`vendor_priors references unknown industry_key '${r.industry_key}'`);

  // W3.3: every industry's coa_template_ref must resolve to a real template (else
  // onboarding would seed an empty chart for that sector). The general_business
  // template is the seed_org_coa fallback, so it must exist too.
  const templateRefs = new Set(
    loadSeed("coa_account_templates.json").rows.map((r) => r.template_ref as string),
  );
  if (!templateRefs.has("general_business"))
    problems.push("coa_account_templates is missing the 'general_business' template — it's seed_org_coa's fallback for any industry with no CoA template.");
  for (const r of loadSeed("industries.json").rows) {
    const ref = r.coa_template_ref as string | undefined;
    if (ref && !templateRefs.has(ref))
      problems.push(`industry '${r.key}' references coa_template_ref '${ref}' with no accounts in coa_account_templates`);
  }

  return problems;
}

/** The inlined section body (pure SQL, no backslash meta-commands) that belongs
 *  between this card's markers in supabase/seed.sql. */
function sectionBody(generated: string): string {
  return `${SECTION_BEGIN}\n${generated.trimEnd()}\n${SECTION_END}\n`;
}

/** Read supabase/seed.sql, replace this card's marked section (or append it if
 *  absent), and return the full file. Leaves other cards' sections untouched.
 *  Guarantees the result contains NO psql backslash meta-commands. */
function renderSeedSql(current: string, generated: string): string {
  const body = sectionBody(generated);
  const bi = current.indexOf(SECTION_BEGIN);
  const ei = current.indexOf(SECTION_END);
  let next: string;
  if (bi !== -1 && ei !== -1 && ei > bi) {
    const before = current.slice(0, bi);
    const after = current.slice(ei + SECTION_END.length).replace(/^\n/, "");
    next = `${before}${body}${after}`;
  } else {
    // No section yet — strip any legacy `\i` include of our generated file, then
    // append our inlined section.
    const stripped = current
      .split("\n")
      .filter((l) => !/^\s*\\i\s+supabase\/seeds\/kernel\/_generated\.sql\s*$/.test(l))
      .join("\n");
    next = `${stripped.trimEnd()}\n\n${body}`;
  }
  return next;
}

function main(): void {
  const mode = process.argv.includes("--check") ? "check" : "emit";
  const generated = generate();

  if (mode === "check") {
    const problems = validate();
    let committed = "";
    try { committed = readFileSync(OUT, "utf8"); } catch { /* missing */ }
    if (committed !== generated)
      problems.push("supabase/seeds/kernel/_generated.sql is STALE — run `pnpm seed:kernel` and commit the result.");

    // seed.sql must inline the generated section (Supabase startup applies it over
    // the pgx batch protocol — no `\i`/backslash meta-commands allowed).
    let seedSql = "";
    try { seedSql = readFileSync(SEED_SQL, "utf8"); } catch { /* missing */ }
    if (renderSeedSql(seedSql, generated) !== seedSql)
      problems.push("supabase/seed.sql kernel section is STALE or missing — run `pnpm seed:kernel` and commit the result.");
    if (/^\s*\\/m.test(seedSql))
      problems.push("supabase/seed.sql contains a psql backslash meta-command (e.g. `\\i`) — unsupported by Supabase startup; inline the SQL instead.");

    if (problems.length) {
      console.error(`\n✗ Kernel seed lint failed — ${problems.length} problem(s):\n`);
      for (const p of problems) console.error(`  • ${p}`);
      console.error("");
      process.exit(1);
    }
    console.info("✓ Kernel seed lint passed — generated SQL is fresh, refs valid, effective-dating intact.");
    return;
  }

  writeFileSync(OUT, generated, "utf8");
  console.info(`✓ Wrote ${OUT} (${generated.split("\n").length} lines).`);

  let seedSql = "";
  try { seedSql = readFileSync(SEED_SQL, "utf8"); } catch { /* missing */ }
  const nextSeedSql = renderSeedSql(seedSql, generated);
  writeFileSync(SEED_SQL, nextSeedSql, "utf8");
  console.info(`✓ Inlined kernel section into ${SEED_SQL} (no backslash meta-commands).`);
}

main();
