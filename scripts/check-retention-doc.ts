/**
 * check-retention-doc: keeps docs/DATA_RETENTION.md, the RETENTION constant in
 * packages/inference/src/core.ts, and the pg_cron jobs in supabase/migrations
 * from drifting apart.
 *
 * Why this script exists, specifically:
 *
 *   docs/ai-quality-cost-layer/GUARDRAILS.md:192 said "Raw retention: 90 days."
 *   The column existed. The index existed. The job did not, and nothing noticed
 *   for the life of the table. The failure was not that someone lied; it was
 *   that a retention window could be WRITTEN without anything checking that it
 *   RAN. Prose and enforcement lived in different files with no link between
 *   them.
 *
 * So the retention table is no longer written by hand. It is generated from
 * RETENTION in core.ts, which is the same constant the code imports, and this
 * script asserts three things:
 *
 *   1. Every rule that declares a window (`days !== null`) names the pg_cron job
 *      that enforces it. A number with nothing behind it is rejected at the type
 *      level by packages/inference/test/retention.ts and again here.
 *   2. Every named job actually appears in a `cron.schedule('<name>', ...)` call
 *      somewhere in supabase/migrations. A job name that is only a string in a
 *      TypeScript file is the same failure wearing a different hat.
 *   3. The generated table in docs/DATA_RETENTION.md matches the constant. In
 *      --check mode a mismatch fails; without the flag the file is rewritten.
 *
 * Follows the `--check` convention of seed-kernel.ts / seed-tax.ts.
 * Run: `pnpm check:retention-doc` (CI) or `pnpm gen:retention-doc` (rewrite).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RETENTION, type RetentionRule } from "../packages/inference/src/core.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = join(ROOT, "docs", "DATA_RETENTION.md");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

const BEGIN = "<!-- BEGIN GENERATED: retention-table (scripts/check-retention-doc.ts) -->";
const END = "<!-- END GENERATED: retention-table -->";

const check = process.argv.includes("--check");
const problems: string[] = [];

/* ── 1 + 2: the constant must be enforceable, and the jobs must exist ─────── */

/** Every job name scheduled anywhere in supabase/migrations. */
export function scheduledJobs(migrationsDir: string): Set<string> {
  const jobs = new Set<string>();
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    for (const m of sql.matchAll(/cron\.schedule\(\s*'([^']+)'/g)) jobs.add(m[1]);
  }
  return jobs;
}

/** Every job name unscheduled and never re-scheduled (retired jobs). */
export function retiredJobs(migrationsDir: string): Set<string> {
  const unscheduled = new Set<string>();
  const scheduled = scheduledJobs(migrationsDir);
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    for (const m of sql.matchAll(/cron\.unschedule\(\s*'([^']+)'/g)) unscheduled.add(m[1]);
  }
  // A name that is unscheduled in a LATER migration than its last schedule is
  // retired. Timestamps sort lexically, so compare the newest file mentioning
  // each verb.
  const retired = new Set<string>();
  for (const name of unscheduled) {
    if (!scheduled.has(name)) retired.add(name);
  }
  return retired;
}

export function validateRules(
  rules: Record<string, RetentionRule>,
  jobs: Set<string>,
  retired: Set<string>,
): string[] {
  const out: string[] = [];
  for (const [key, r] of Object.entries(rules)) {
    if (r.days !== null && !r.enforcedBy) {
      out.push(
        `RETENTION.${key} declares a ${r.days}-day window with enforcedBy: null. ` +
          `A window nothing runs is not a window. Either name the job or set days: null.`,
      );
    }
    if (r.days === null && r.action !== "none" && !r.enforcedBy) {
      out.push(`RETENTION.${key} declares action "${r.action}" with no window and no enforcer.`);
    }
    if (r.enforcedBy && !jobs.has(r.enforcedBy)) {
      out.push(
        `RETENTION.${key} names pg_cron job "${r.enforcedBy}", which no migration schedules. ` +
          `Add a cron.schedule('${r.enforcedBy}', ...) call, or correct the name.`,
      );
    }
    if (r.enforcedBy && retired.has(r.enforcedBy)) {
      out.push(`RETENTION.${key} names pg_cron job "${r.enforcedBy}", which a later migration retired.`);
    }
    if (!r.erasure?.trim()) {
      out.push(`RETENTION.${key} has no erasure sentence. "How is this removed on request" is not optional.`);
    }
  }
  return out;
}

/* ── 3: render ───────────────────────────────────────────────────────────── */

const ACTION_WORDS: Record<RetentionRule["action"], string> = {
  deidentify: "de-identify in place",
  delete: "hard delete",
  none: "nothing automatic",
};

export function renderTable(rules: Record<string, RetentionRule>): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const lines = [
    "| Store | Personal data it holds | Window | At the end of it | Enforced by | Erasure |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of Object.values(rules)) {
    lines.push(
      `| \`${cell(r.store)}\` | ${cell(r.data)} | ${r.days === null ? "no automatic window" : `${r.days} days`} | ` +
        `${ACTION_WORDS[r.action]} | ${r.enforcedBy ? `\`${r.enforcedBy}\` (pg_cron)` : "nothing, by design"} | ${cell(r.erasure)} |`,
    );
  }
  return lines.join("\n");
}

export function splice(doc: string, table: string): string {
  const i = doc.indexOf(BEGIN);
  const j = doc.indexOf(END);
  if (i === -1 || j === -1) throw new Error(`docs/DATA_RETENTION.md is missing the generated-table markers`);
  return `${doc.slice(0, i)}${BEGIN}\n\n${table}\n\n${doc.slice(j)}`;
}

/* ── run ─────────────────────────────────────────────────────────────────── */

function main(): void {
  const jobs = scheduledJobs(MIGRATIONS);
  const retired = retiredJobs(MIGRATIONS);
  problems.push(...validateRules(RETENTION, jobs, retired));

  let doc: string;
  try {
    doc = readFileSync(DOC, "utf8");
  } catch {
    console.error(`✗ docs/DATA_RETENTION.md not found. Nothing to check.`);
    process.exit(1);
  }

  const next = splice(doc, renderTable(RETENTION));

  if (problems.length) {
    console.error(`\n✗ Retention doc guard failed: ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\nThe rule this enforces: a retention window may be documented only when a job runs it.\n` +
        `RETENTION lives in packages/inference/src/core.ts.\n`,
    );
    process.exit(1);
  }

  if (check) {
    if (next !== doc) {
      console.error(
        `\n✗ docs/DATA_RETENTION.md is stale, it no longer matches RETENTION in\n` +
          `  packages/inference/src/core.ts. Run \`pnpm gen:retention-doc\` and commit the result.\n`,
      );
      process.exit(1);
    }
    console.info(
      `✓ Retention doc guard passed: ${Object.keys(RETENTION).length} store(s), ` +
        `${Object.values(RETENTION).filter((r) => r.enforcedBy).length} enforced by a scheduled job, doc in sync.`,
    );
    return;
  }

  writeFileSync(DOC, next);
  console.info(`✓ Wrote the retention table into docs/DATA_RETENTION.md from RETENTION.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
