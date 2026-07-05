/**
 * seed-tax — the idempotent loader for the W1.3-B data-driven tax mapping engine.
 *
 * Tax knowledge is SEED DATA the engine projects from (research §B.0.1): a new
 * country, state, entity form, or tax year is a seed-file edit — ZERO schema or
 * code change. This mirrors scripts/seed-kernel.ts exactly (CENTRAL-2 loader
 * contract): compile the per-form JSON seeds into ONE idempotent SQL file
 * (supabase/seeds/tax/_generated.sql) using `insert … on conflict … do update`,
 * committed and applied via supabase/seed.sql.
 *
 * Seed layout (research §B.3): one file per jurisdiction+form+year:
 *   supabase/seeds/tax/US-FED/SCH_C/2025.json   { jurisdiction, form_code,
 *   entity_type, tax_year, name, citation, effective_from, params, lines[], rules[] }
 * plus supabase/seeds/tax/jurisdictions.json (the tax_jurisdictions rows).
 *
 * Loader idempotency (research §B.3): upsert keyed on the natural key so a
 * corrected seed re-runs safely; a NEW tax year is a NEW file. Lines key on
 * (form, line_key); rules are cleared+reinserted per form (they carry no stable
 * external key). Forms upsert on (jurisdiction, form_code, tax_year,
 * effective_from) — a within-year supersede is a NEW effective_from (a new file /
 * a supersede_tax_form call), never an overwrite (Roadmap 3c).
 *
 * Modes:
 *   (default / --emit)  regenerate supabase/seeds/tax/_generated.sql.
 *   --check             CI. Regenerate in-memory, assert byte-match with the
 *                       committed file (no drift), AND lint (below). Exits non-zero.
 *
 * Lint (research §B build order — "seed-lint CI check"):
 *   - every rule.line_key references a line that exists on its form;
 *   - every non-Sch-C entity form has type-fallback coverage (an account_type
 *     rule for 'expense' and 'income') so typed accounts never fall through;
 *   - jurisdiction referenced by each form exists in jurisdictions.json;
 *   - entity_type is one of the kernel's known set;
 *   - effective-dating: no two form files for one (jurisdiction, form, year) share
 *     an effective_from (a real supersede changes effective_from).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED_DIR = resolve(ROOT, "supabase/seeds/tax");
const OUT = resolve(SEED_DIR, "_generated.sql");
const SEED_SQL = resolve(ROOT, "supabase/seed.sql");

// Delimited section this card owns inside the SHARED supabase/seed.sql. Supabase's
// stack startup applies that file over the pgx BATCH protocol, which does NOT
// understand psql backslash meta-commands (`\i`, `\set`) — a single `\i` is a raw
// syntax error that aborts the whole reset/replay. So we INLINE the generated SQL
// between these markers instead of `\i`-including it (mirrors scripts/seed-kernel.ts).
// Other loop cards own their own BEGIN/END-marked sections; a loader only rewrites
// the block between ITS markers, appending it (after the kernel section) if absent.
const SECTION_BEGIN = "-- ==== BEGIN GENERATED: tax (scripts/seed-tax.ts) — do not edit by hand ====";
const SECTION_END = "-- ==== END GENERATED: tax ====";

// kept in sync with entity_types.json (kernel) — a lint check, not a source of truth.
const KNOWN_ENTITY_TYPES = new Set([
  "sole_prop", "s_corp", "c_corp", "partnership", "nonprofit",
]);

interface Line {
  line_key: string; line_code?: string | null; label: string; section: string;
  kind?: string; sort?: number; deductible_pct?: number | null; flows_to?: string | null; notes?: string | null;
  export_codes?: Record<string, string> | null; // RV2-A2: per-suite import codes (DATA)
}
interface Rule { priority: number; match_kind: string; match_value: string; line_key: string; }
interface FormSeed {
  jurisdiction: string; form_code: string; entity_type: string; tax_year: number;
  name: string; citation: string; effective_from: string; params?: Record<string, unknown>;
  lines: Line[]; rules: Rule[];
}
interface Jurisdiction {
  code: string; name: string; country_code: string; currency: string;
  parent_code?: string | null; params?: Record<string, unknown>; sort_order?: number;
}

const sqlStr = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** Recursively collect every <jurisdiction>/<form>/<year>.json form-seed file. */
function formFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".json") && !e.startsWith("_") && e !== "jurisdictions.json") out.push(p);
    }
  };
  walk(SEED_DIR);
  return out.sort();
}

function loadJurisdictions(): Jurisdiction[] {
  return JSON.parse(readFileSync(resolve(SEED_DIR, "jurisdictions.json"), "utf8")).rows as Jurisdiction[];
}
function loadForm(path: string): FormSeed {
  return JSON.parse(readFileSync(path, "utf8")) as FormSeed;
}

function emitJurisdictions(rows: Jurisdiction[]): string {
  const lines = [`-- tax_jurisdictions (${rows.length} rows)`];
  for (const r of rows) {
    lines.push(
      `insert into public.tax_jurisdictions (code, name, country_code, currency, parent_code, params, sort_order) values (` +
      `${sqlStr(r.code)}, ${sqlStr(r.name)}, ${sqlStr(r.country_code)}, ${sqlStr(r.currency)}, ` +
      `${sqlStr(r.parent_code ?? null)}, ${sqlStr(r.params ?? {})}, ${sqlStr(r.sort_order ?? 0)})\n` +
      `  on conflict (code) do update set name = excluded.name, country_code = excluded.country_code, ` +
      `currency = excluded.currency, parent_code = excluded.parent_code, params = excluded.params, ` +
      `sort_order = excluded.sort_order, updated_at = now();`,
    );
  }
  return lines.join("\n");
}

function emitForm(f: FormSeed): string {
  const lines: string[] = [];
  lines.push(`-- ${f.jurisdiction} / ${f.form_code} / ${f.tax_year} (${f.lines.length} lines, ${f.rules.length} rules)`);
  // upsert the form; capture its id in a psql variable via a CTE-free approach:
  // we use a DO block so each form's line/rule inserts can reference its id.
  lines.push(`do $tax$
declare v_form uuid;
begin
  insert into public.tax_forms
    (jurisdiction_code, form_code, entity_type, tax_year, name, params, status, effective_from, citation, source)
  values
    (${sqlStr(f.jurisdiction)}, ${sqlStr(f.form_code)}, ${sqlStr(f.entity_type)}, ${sqlStr(f.tax_year)},
     ${sqlStr(f.name)}, ${sqlStr(f.params ?? {})}, 'active', ${sqlStr(f.effective_from)}, ${sqlStr(f.citation)}, 'seed')
  on conflict (jurisdiction_code, form_code, tax_year, effective_from)
    do update set entity_type = excluded.entity_type, name = excluded.name,
                  params = excluded.params, citation = excluded.citation
  returning id into v_form;`);
  // lines: upsert on (form, line_key)
  for (const l of f.lines) {
    lines.push(`  insert into public.tax_form_lines
    (form_id, line_key, line_code, label, section, sort_order, kind, deductible_pct, flows_to, notes, export_codes)
  values
    (v_form, ${sqlStr(l.line_key)}, ${sqlStr(l.line_code ?? null)}, ${sqlStr(l.label)}, ${sqlStr(l.section)},
     ${sqlStr(l.sort ?? 0)}, ${sqlStr(l.kind ?? "amount")}, ${sqlStr(l.deductible_pct ?? null)},
     ${sqlStr(l.flows_to ?? null)}, ${sqlStr(l.notes ?? null)}, ${sqlStr(l.export_codes ?? {})})
  on conflict (form_id, line_key) do update set
    line_code = excluded.line_code, label = excluded.label, section = excluded.section,
    sort_order = excluded.sort_order, kind = excluded.kind, deductible_pct = excluded.deductible_pct,
    flows_to = excluded.flows_to, notes = excluded.notes, export_codes = excluded.export_codes;`);
  }
  // rules carry no stable external key → clear + reinsert this form's seed rules.
  lines.push(`  delete from public.tax_mapping_rules where form_id = v_form and is_seed;`);
  for (const r of f.rules) {
    lines.push(`  insert into public.tax_mapping_rules (form_id, priority, match_kind, match_value, line_key, is_seed)
  values (v_form, ${sqlStr(r.priority)}, ${sqlStr(r.match_kind)}, ${sqlStr(r.match_value)}, ${sqlStr(r.line_key)}, true);`);
  }
  lines.push(`end $tax$;`);
  return lines.join("\n");
}

function generate(): string {
  const banner =
    "-- GENERATED by scripts/seed-tax.ts — DO NOT EDIT BY HAND.\n" +
    "-- Source: supabase/seeds/tax/**/*.json. Regenerate: `pnpm seed:tax`.\n" +
    "-- Idempotent upserts (W1.3-B tax mapping engine). Applied via supabase/seed.sql.\n\n" +
    "begin;\n\n";
  const jur = emitJurisdictions(loadJurisdictions());
  const forms = formFiles().map((p) => emitForm(loadForm(p)));
  return banner + jur + "\n\n" + forms.join("\n\n") + "\n\ncommit;\n";
}

function validate(): string[] {
  const problems: string[] = [];
  const jurCodes = new Set(loadJurisdictions().map((j) => j.code));
  const effByFormYear = new Map<string, Set<string>>();

  for (const p of formFiles()) {
    const f = loadForm(p);
    const rel = p.slice(SEED_DIR.length + 1);
    if (!jurCodes.has(f.jurisdiction))
      problems.push(`${rel}: unknown jurisdiction '${f.jurisdiction}' (add it to jurisdictions.json)`);
    if (!KNOWN_ENTITY_TYPES.has(f.entity_type))
      problems.push(`${rel}: unknown entity_type '${f.entity_type}'`);

    const lineKeys = new Set(f.lines.map((l) => l.line_key));
    for (const r of f.rules)
      if (!lineKeys.has(r.line_key))
        problems.push(`${rel}: rule targets line_key '${r.line_key}' which no line defines`);

    // type-fallback coverage: entity returns (not sole_prop Sch C, which has 27a
    // other) must catch every typed expense/income account.
    const hasTypeFallback = (t: string) =>
      f.rules.some((r) => r.match_kind === "account_type" && r.match_value === t);
    if (!hasTypeFallback("expense"))
      problems.push(`${rel}: no account_type='expense' fallback rule — typed expense accounts could fall through to UNMAPPED`);
    if (!hasTypeFallback("income"))
      problems.push(`${rel}: no account_type='income' fallback rule — typed income accounts could fall through to UNMAPPED`);

    // effective-dating: one effective_from per (jurisdiction, form, year) file set.
    const k = `${f.jurisdiction}|${f.form_code}|${f.tax_year}`;
    const set = effByFormYear.get(k) ?? new Set<string>();
    if (set.has(f.effective_from))
      problems.push(`${rel}: duplicate effective_from ${f.effective_from} for ${k} — a supersede must change effective_from`);
    set.add(f.effective_from);
    effByFormYear.set(k, set);
  }
  return problems;
}

/** The inlined section body (pure SQL, no backslash meta-commands) that belongs
 *  between this card's markers in supabase/seed.sql. */
function sectionBody(generated: string): string {
  return `${SECTION_BEGIN}\n${generated.trimEnd()}\n${SECTION_END}\n`;
}

/** Read supabase/seed.sql, replace this card's marked section (or append it — after
 *  the kernel section — if absent), and return the full file. Leaves other cards'
 *  sections untouched. Guarantees the result contains NO psql backslash meta-commands
 *  (strips any legacy `\i` include of our generated file). */
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
  // append our inlined section after everything else (kernel section loads first).
  const stripped = current
    .split("\n")
    .filter((l) => !/^\s*\\i\s+supabase\/seeds\/tax\/_generated\.sql\s*$/.test(l))
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
      problems.push("supabase/seeds/tax/_generated.sql is STALE — run `pnpm seed:tax` and commit the result.");

    // seed.sql must inline the generated tax section (Supabase startup applies it
    // over the pgx batch protocol — no `\i`/backslash meta-commands allowed).
    let seedSql = "";
    try { seedSql = readFileSync(SEED_SQL, "utf8"); } catch { /* missing */ }
    if (renderSeedSql(seedSql, generated) !== seedSql)
      problems.push("supabase/seed.sql tax section is STALE or missing — run `pnpm seed:tax` and commit the result.");
    if (/^\s*\\/m.test(seedSql))
      problems.push("supabase/seed.sql contains a psql backslash meta-command (e.g. `\\i`) — unsupported by Supabase startup; inline the SQL instead.");

    if (problems.length) {
      console.error(`\n✗ Tax seed lint failed — ${problems.length} problem(s):\n`);
      for (const p of problems) console.error(`  • ${p}`);
      console.error("");
      process.exit(1);
    }
    console.info("✓ Tax seed lint passed — generated SQL fresh, rule line_keys valid, type-fallback coverage intact, effective-dating clean.");
    return;
  }
  writeFileSync(OUT, generated, "utf8");
  console.info(`✓ Wrote ${OUT} (${generated.split("\n").length} lines).`);

  let seedSql = "";
  try { seedSql = readFileSync(SEED_SQL, "utf8"); } catch { /* missing */ }
  const nextSeedSql = renderSeedSql(seedSql, generated);
  writeFileSync(SEED_SQL, nextSeedSql, "utf8");
  console.info(`✓ Inlined tax section into ${SEED_SQL} (no backslash meta-commands).`);
}

main();
