/**
 * check-tenant-predicate — enforce the ai_decisions tenant-isolation invariant
 * in CI (plan D15).
 *
 * The stack runs as the Supabase service role, which BYPASSES RLS. So tenant
 * isolation for the AI quality & cost layer cannot rely on RLS or an AI Privacy
 * eval — it must be a deterministic data-layer invariant: every query that
 * touches `ai_decisions` (and, in later phases, the cache + rule tables) must
 * carry `tenant_id`. A missing predicate is a silent cross-tenant leak no test
 * would otherwise catch.
 *
 * This guard fails the build if:
 *   - a TS/TSX file queries ai_decisions (.from("ai_decisions") or a
 *     /rest/v1/ai_decisions request) without referencing tenant_id, or
 *   - a SQL file runs DML against ai_decisions (insert/update/delete/select…from)
 *     in a statement that doesn't mention tenant_id.
 * DDL (create table / index / policy / comment) is exempt by design.
 *
 * Deliberate cross-tenant access (the is_admin()-gated operator dashboard, the
 * system reconcile job) is legitimate — those views aggregate across tenants and
 * never return another customer's data to a customer. Such a statement opts out
 * with an explicit `-- tenant-ok: <reason>` marker in the same statement, so the
 * exemption is documented and reviewable, never silent. Default is still
 * tenant_id-or-fail.
 *
 * The canonical writer is @ff/inference resolve() via buildRecordRequest, where
 * the AiDecisionRecord type + the runtime tenant assertion already guarantee
 * tenant_id. This guard is defense-in-depth so a NEW reader/writer can't skip it.
 *
 * Run: `pnpm check:tenant` (or `tsx scripts/check-tenant-predicate.ts`).
 * Mirrors scripts/check-css-imports.ts (LEARNINGS rule 14 — guard silent
 * failure modes in CI, not just type/lint errors).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SELF = resolve(__dirname, "check-tenant-predicate.ts");
const SCAN_DIRS = ["apps", "packages", "supabase", "site-bubble"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vitepress", ".git", "tests"]);
const EXTS = [".ts", ".tsx", ".sql"];

/** Tenant-partitioned tables the invariant applies to. Cache + rule tables join
 *  this list when they land (Phase 5). */
const GUARDED_TABLES = ["ai_decisions"];

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

function checkTs(text: string, table: string): boolean {
  // Returns true if this file QUERIES the table; the caller checks tenant_id.
  const fromCall = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`).test(text);
  const restPath = text.includes(`/rest/v1/${table}`);
  return fromCall || restPath;
}

function dmlStatementsMissingTenant(sql: string, table: string): string[] {
  const bad: string[] = [];
  // Split on ';' is good enough for our migration style (no PL/pgSQL DML against
  // these tables today). DDL keywords (create/alter/index/policy/comment/on) are
  // not matched by the DML regex below, so the CREATE TABLE etc. are exempt.
  const dml = new RegExp(`\\b(?:insert\\s+into|update|delete\\s+from|from)\\s+${table}\\b`, "i");
  for (const stmt of sql.split(";")) {
    // Safe if the statement filters by tenant_id, or is an explicitly-marked,
    // documented cross-tenant operator/system query (`-- tenant-ok: <reason>`).
    if (dml.test(stmt) && !/tenant_id/i.test(stmt) && !/tenant-ok:/i.test(stmt)) {
      bad.push(stmt.trim().replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return bad;
}

function main(): void {
  const problems: string[] = [];
  let checkedTs = 0;
  let checkedSql = 0;

  const files = SCAN_DIRS.map((d) => resolve(ROOT, d))
    .filter(existsSync)
    .flatMap(listFiles)
    .filter((f) => f !== SELF);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!GUARDED_TABLES.some((t) => text.includes(t))) continue;
    const from = relative(ROOT, file);

    for (const table of GUARDED_TABLES) {
      if (!text.includes(table)) continue;

      if (file.endsWith(".sql")) {
        const bad = dmlStatementsMissingTenant(text, table);
        for (const stmt of bad) {
          problems.push(`SQL DML on ${table} without tenant_id — ${from}\n           …${stmt}…`);
        }
        if (dmlStatementsMissingTenant(text, table).length === 0) checkedSql++;
      } else if (checkTs(text, table)) {
        if (!/tenant_id/.test(text)) {
          problems.push(`${from} queries ${table} but never references tenant_id`);
        } else {
          checkedTs++;
        }
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n✗ Tenant-predicate guard failed — ${problems.length} unprotected ai_decisions access(es):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("\nEvery query against a tenant-partitioned table MUST carry tenant_id (D15).");
    console.error("Service-role bypasses RLS — a missing predicate is a silent cross-tenant leak.\n");
    process.exit(1);
  }

  console.info(
    `✓ Tenant-predicate guard passed — ${checkedTs} TS + ${checkedSql} SQL site(s) carry tenant_id; no unprotected access.`,
  );
}

main();
