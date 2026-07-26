/**
 * check-definer-tenant-guard — CI gate for the pattern the 6-Jul weekly audit
 * (PR #301) proposed graduating into a LEARNINGS rule: the audit's #1 finding,
 * recurring for the 2nd time after the Wave-3 F1
 * `owner_asks_this_week` leak): a `security definer` function granted to
 * `authenticated` that takes a tenant-scoping parameter (p_org_id / p_org /
 * target_org / p_client_org_id[s]) MUST check membership before it reads —
 * DEFINER runs as the function's OWNER and BYPASSES the base table's RLS, so an
 * ungated reader lets any authenticated user pass another tenant's id and read
 * its data. SEC-3 (pr:#309, 7 Jul) fixed the 4 confirmed instances
 * (resolve_account_tax_lines, tax_unmapped_accounts, tax_m1_summary,
 * fixed_asset_listing) by adding `can_access_org(p_org_id)`; this guard exists
 * so a NEW one can't ship the same way and go undetected until the next audit.
 *
 * Parses every `create [or replace] function` in supabase/migrations/*.sql
 * (chronological by filename), keeping the LATEST body per function name
 * (later migrations legitimately redefine earlier ones — CREATE OR REPLACE is
 * the only schema-change mechanism, LEARNINGS #2), and the LATEST
 * grant/revoke state per function name (a `revoke … from …` after a `grant`
 * removes that role — the common `revoke all … from public, anon,
 * authenticated; grant … to service_role;` lockdown pattern must resolve to
 * "not reachable by authenticated", not "reachable" from a stale grant match).
 * Flags a function whose latest body is `security definer`, currently granted
 * to `authenticated`, takes an org-scoping parameter, and never calls a
 * membership check (`can_access_org`, `staff_can_access_org`, `is_admin`,
 * `is_platform_staff`, `is_super`) anywhere in its body. A deliberate
 * cross-tenant reader (an operator/admin view) opts out with an explicit
 * `-- definer-ok: <reason>` marker in its body, mirroring
 * check-tenant-predicate.ts's `-- tenant-ok:` convention — so the exemption is
 * documented and reviewable, never silent.
 *
 * Heuristic, like its siblings (check-tenant-predicate.ts, check-law-literals.ts):
 * matches by function NAME (not full type signature) — this codebase does not
 * overload security-sensitive readers (verified at authoring time: every
 * `create or replace function` name that recurs across migrations keeps the
 * same argument shape). A narrower variant of this same class — a DEFINER
 * reader keyed on an opaque per-row id (e.g. `p_asset_id`) with NO org
 * parameter at all, like `macrs_tax_depreciation_for_year` /
 * `book_depreciation_for_year` before SEC-3 fixed them — is NOT detected here
 * (there is no org parameter to key on); a real remaining gap, disclosed as a
 * follow-up rather than silently unhandled.
 *
 * Run: `pnpm check:definer-guard` (or `tsx scripts/check-definer-tenant-guard.ts`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Parameter names that scope a query to one tenant (verified against every
// naming convention in use today: p_org_id, p_org, target_org,
// p_client_org_id[s]).
const ORG_PARAM_RE = /\b(p_org_id|p_org|target_org|p_client_org_id|p_client_org_ids)\b/;

// Any of these calls in the body count as a membership/authorization check —
// every tenant/membership/admin predicate helper defined in the migrations
// (verified: `create or replace function (can_|has_|is_)...` across
// supabase/migrations, minus is_monetary_account which is unrelated business
// logic, not an auth predicate).
const GUARD_CALL_RE =
  /\b(can_access_org|can_write_org|has_membership|has_engagement_access|can_edit_tax_map|staff_can_access_org|is_admin|is_platform_staff|is_platform_super|is_super)\w*\s*\(/;

const OPT_OUT_RE = /--\s*definer-ok:/i;

export interface FunctionDef {
  name: string;
  file: string;
  line: number;
  params: string;
  header: string;
  body: string;
  isDefiner: boolean;
}

function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort() // filenames are YYYYMMDDHHMMSS_name.sql — lexicographic == chronological
    .map((f) => resolve(migrationsDir, f));
}

/** Find the index just past the matching close-paren for the '(' at openIdx. */
export function matchParen(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const FUNC_START_RE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;

function lineOf(text: string, idx: number): number {
  return text.slice(0, idx).split("\n").length;
}

/** Parse every `create [or replace] function` in one migration file's text. */
export function parseFunctions(text: string, file: string): FunctionDef[] {
  const out: FunctionDef[] = [];
  FUNC_START_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNC_START_RE.exec(text))) {
    const name = m[1];
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchParen(text, openParen);
    if (closeParen === -1) continue; // malformed — skip rather than crash the guard
    const params = text.slice(openParen + 1, closeParen);

    // Header = everything between the params and the body's opening dollar-quote
    // tag ("... returns … language sql security definer set search_path = public
    // as $$"). Body = everything up to the matching close tag.
    const afterParams = text.slice(closeParen + 1);
    const asMatch = /\bas\s+(\$[a-zA-Z_]*\$)/.exec(afterParams);
    if (!asMatch) continue; // not a SQL-body function (e.g. a C/internal stub) — skip
    const header = afterParams.slice(0, asMatch.index);
    const tag = asMatch[1];
    const bodyStart = asMatch.index + asMatch[0].length;
    const closeTagIdx = afterParams.indexOf(tag, bodyStart);
    if (closeTagIdx === -1) continue;
    const body = afterParams.slice(bodyStart, closeTagIdx);

    out.push({
      name,
      file,
      line: lineOf(text, m.index),
      params,
      header,
      body,
      isDefiner: /security\s+definer/i.test(header),
    });
  }
  return out;
}

const GRANT_RE = /grant\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*to\s+([^;]+);/gi;
const REVOKE_RE = /revoke\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*from\s+([^;]+);/gi;

function splitRoles(text: string): string[] {
  return text
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Core check, factored out of main() so it can run against a fixture root in
 * tests (scripts/tests/check-definer-tenant-guard.test.ts) as well as the real
 * repo. `migrationsDir` is relative to `root` (default "supabase/migrations").
 */
export function findDefinerTenantProblems(
  root: string,
  migrationsDir = "supabase/migrations",
): { problems: string[]; checked: number } {
  const files = listMigrationFiles(resolve(root, migrationsDir));
  const functionsByName = new Map<string, FunctionDef>();
  const grantedRoles = new Map<string, Set<string>>();

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = relative(root, file);

    for (const def of parseFunctions(text, rel)) {
      functionsByName.set(def.name, def); // later file wins — CREATE OR REPLACE semantics
    }

    // Walk grant/revoke statements in file order so a later revoke correctly
    // overrides an earlier grant within (or across) migrations.
    type Event = { pos: number; kind: "grant" | "revoke"; name: string; roles: string[] };
    const events: Event[] = [];
    for (const re of [GRANT_RE, REVOKE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        events.push({
          pos: m.index,
          kind: re === GRANT_RE ? "grant" : "revoke",
          name: m[1],
          roles: splitRoles(m[3]),
        });
      }
    }
    events.sort((a, b) => a.pos - b.pos);
    for (const ev of events) {
      const set = grantedRoles.get(ev.name) ?? new Set<string>();
      if (ev.kind === "grant") for (const r of ev.roles) set.add(r);
      else for (const r of ev.roles) set.delete(r);
      grantedRoles.set(ev.name, set);
    }
  }

  const problems: string[] = [];
  let checked = 0;

  for (const def of functionsByName.values()) {
    if (!def.isDefiner) continue;
    const orgParamMatch = ORG_PARAM_RE.exec(def.params);
    if (!orgParamMatch) continue;
    const roles = grantedRoles.get(def.name);
    if (!roles || !roles.has("authenticated")) continue; // not reachable by end users
    checked++;
    if (OPT_OUT_RE.test(def.body)) continue;
    if (GUARD_CALL_RE.test(def.body)) continue;

    problems.push(
      `${def.file}:${def.line} — public.${def.name}(…${orgParamMatch[1]}…) is SECURITY DEFINER, ` +
        `granted to authenticated, and never calls a membership check ` +
        `(can_access_org/staff_can_access_org/is_admin/is_platform_staff/is_super) in its body.`,
    );
  }

  return { problems, checked };
}

function main(): void {
  const { problems, checked } = findDefinerTenantProblems(ROOT);

  if (problems.length > 0) {
    console.error(
      `\n✗ Definer-tenant guard failed — ${problems.length} unguarded SECURITY DEFINER reader(s) (the pattern the 6-Jul weekly audit, PR #301, proposed graduating into a LEARNINGS rule):\n`,
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nDEFINER bypasses the base table's RLS — an org-scoped reader without a membership " +
        "check leaks every tenant's data to any authenticated caller. Add a can_access_org(...) " +
        "guard (see resolve_account_tax_lines / bill_ap_aging / estimated_tax_basis for the " +
        "pattern), or restrict the grant to service_role, or opt out with a documented " +
        "`-- definer-ok: <reason>` marker in the function body.\n",
    );
    process.exit(1);
  }

  console.info(
    `✓ Definer-tenant guard passed — ${checked} authenticated-reachable SECURITY DEFINER org-scoped reader(s) all carry a membership check.`,
  );
}

// Only run the CLI check when this file is the entry module — importing it
// for its exported functions (tests) must not walk the repo / exit(1).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
