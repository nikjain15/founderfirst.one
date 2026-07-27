/**
 * categorize-runner.ts: runs Penny's DETERMINISTIC categorizer (deterministic.ts,
 * the same rule + vendor-prior matching predicate the edge function uses) over a
 * labeled evaluation fixture and computes named IR metrics: overall accuracy plus
 * per-class and macro-averaged precision / recall / F1 from a confusion matrix.
 *
 * The fixture is a SYNTHETIC, hand-labeled set (categorize-labeled.json), not
 * production data and not a claim about live accuracy. Everything runs offline:
 * no API key, no DB, no network. The model path is deliberately NOT exercised here.
 *
 * Programmatic entry point: `runCategorizeEval()`. CLI: `deno run --allow-read
 * .../categorize-runner.ts` prints the scorecard.
 */
import { categorizeDeterministic, type CategorizationRule } from "../deterministic.ts";
import { computeMetrics, pct, type LabeledPair, type MetricsReport } from "./metrics.ts";
import fixtureData from "./categorize-labeled.json" with { type: "json" };

export interface FixtureRow {
  description: string;
  amount: number;
  hints: string[];
  expectedAccount: string;
  note?: string;
}

export interface Fixture {
  accounts: string[];
  rules: CategorizationRule[];
  rows: FixtureRow[];
}

/** The class assigned when the deterministic path finds no matching rule. */
export const NO_MATCH_CLASS = "Uncategorized";

/**
 * The bundled labeled fixture, loaded as a JSON module so no filesystem read
 * permission is needed (it runs under the plain `deno test --allow-env` CI gate).
 */
export function loadFixture(): Fixture {
  return fixtureData as unknown as Fixture;
}

export interface EvalResult {
  datasetSize: number;
  metrics: MetricsReport;
  pairs: LabeledPair[];
}

/** Run the deterministic categorizer over the fixture and score it. */
export function runCategorizeEval(fixture: Fixture): EvalResult {
  const classes = fixture.accounts.includes(NO_MATCH_CLASS)
    ? fixture.accounts
    : [...fixture.accounts, NO_MATCH_CLASS];

  const pairs: LabeledPair[] = fixture.rows.map((row) => {
    const result = categorizeDeterministic(row.description, row.hints ?? [], fixture.rules);
    const predicted = result.account ?? NO_MATCH_CLASS;
    return { expected: row.expectedAccount, predicted };
  });

  return {
    datasetSize: fixture.rows.length,
    metrics: computeMetrics(pairs, classes),
    pairs,
  };
}

/** Human-readable scorecard for the CLI / docs. */
export function formatReport(res: EvalResult): string {
  const m = res.metrics;
  const lines: string[] = [];
  lines.push(`categorize eval, deterministic path, ${res.datasetSize} labeled fixture rows across ${m.classes.length} classes`);
  lines.push("");
  lines.push(`  overall accuracy   ${pct(m.accuracy)}  (${m.correct}/${m.total})`);
  lines.push(`  macro precision    ${pct(m.macroPrecision)}`);
  lines.push(`  macro recall       ${pct(m.macroRecall)}`);
  lines.push(`  macro F1           ${pct(m.macroF1)}`);
  lines.push("");
  lines.push("  per-class (support / precision / recall / F1):");
  for (const c of m.perClass) {
    if (c.support === 0 && c.fp === 0) continue; // skip classes with no presence
    lines.push(
      `    ${c.class.padEnd(24)} n=${String(c.support).padStart(2)}  P=${pct(c.precision).padStart(6)}  R=${pct(c.recall).padStart(6)}  F1=${pct(c.f1).padStart(6)}`,
    );
  }
  return lines.join("\n");
}

// CLI entry point.
if (import.meta.main) {
  const fixture = await loadFixture();
  const res = runCategorizeEval(fixture);
  console.info(formatReport(res));
}
