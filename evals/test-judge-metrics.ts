/**
 * Judge-validation arithmetic tests.
 *
 * The metrics in `judge-metrics.ts` decide whether the LLM-judge panel is
 * trustworthy, so the arithmetic that produces them has to be right before any
 * number it reports means anything. These run offline with no key, so CI checks
 * them on every pull request and only the actual model call needs a secret.
 *
 * The cases that matter most are the degenerate ones: a judge that always says
 * pass, a judge that always says fail, and a validation set with no class
 * variation. Each of those produces a flattering raw-agreement number, and each
 * must produce kappa 0.
 *
 * Run: `tsx evals/test-judge-metrics.ts`
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agreementStats,
  classBalanceProblems,
  enforcedFailures,
  kappaBand,
  type Comparison,
  type ValidationResults,
} from "./judge-metrics";

const __dirname = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function ok(label: string, cond: boolean): void {
  if (cond) console.info(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}
function close(label: string, a: number, b: number, eps = 1e-9): void {
  ok(`${label} (${a.toFixed(6)} ≈ ${b})`, Math.abs(a - b) < eps);
}

/** Build comparisons from counts, in (gold, judge) order. */
function make(tp: number, fn: number, fp: number, tn: number): Comparison[] {
  const out: Comparison[] = [];
  for (let i = 0; i < tp; i++) out.push({ gold: true, judge: true });
  for (let i = 0; i < fn; i++) out.push({ gold: true, judge: false });
  for (let i = 0; i < fp; i++) out.push({ gold: false, judge: true });
  for (let i = 0; i < tn; i++) out.push({ gold: false, judge: false });
  return out;
}

function main(): void {
  console.info("judge-metrics: agreement arithmetic");
  {
    const s = agreementStats(make(8, 2, 3, 7));
    close("n", s.n, 20);
    close("raw agreement", s.agreement, 0.75);
    close("base rate", s.baseRate, 0.5);
    close("true-pass rate", s.truePassRate, 0.8);
    close("true-block rate", s.trueBlockRate, 0.7);
    // po = 0.75; marginals gold 10/10, judge 11/9 -> pe = (10*11 + 10*9)/400 = 0.5
    // kappa = (0.75 - 0.5) / 0.5 = 0.5
    close("kappa", s.kappa, 0.5);
  }

  console.info("\njudge-metrics: a perfect judge");
  {
    const s = agreementStats(make(10, 0, 0, 10));
    close("agreement", s.agreement, 1);
    close("kappa", s.kappa, 1);
    ok("band reads almost perfect", kappaBand(s.kappa) === "almost perfect");
  }

  console.info("\njudge-metrics: the degenerate judges that raw agreement flatters");
  {
    // Always-pass on a balanced set: 50% agreement, and no signal whatsoever.
    const alwaysPass = agreementStats(make(10, 0, 10, 0));
    close("always-pass agreement", alwaysPass.agreement, 0.5);
    close("always-pass kappa", alwaysPass.kappa, 0);
    close("always-pass catches nothing", alwaysPass.trueBlockRate, 0);

    // Always-pass on a SKEWED set is the dangerous one: 80% agreement, still
    // kappa 0. This is the number a raw-agreement report would have published.
    const skewed = agreementStats(make(16, 0, 4, 0));
    close("always-pass on 80% skew scores 80% raw", skewed.agreement, 0.8);
    close("...and still kappa 0", skewed.kappa, 0);

    // Always-block: perfect on the dangerous direction, useless overall.
    const alwaysBlock = agreementStats(make(0, 10, 0, 10));
    close("always-block catches everything", alwaysBlock.trueBlockRate, 1);
    close("always-block lets nothing good through", alwaysBlock.truePassRate, 0);
    close("always-block kappa", alwaysBlock.kappa, 0);
  }

  console.info("\njudge-metrics: a judge worse than chance");
  {
    const s = agreementStats(make(2, 8, 8, 2));
    ok("kappa is negative", s.kappa < 0);
    ok("band says worse than chance", kappaBand(s.kappa) === "worse than chance");
  }

  console.info("\njudge-metrics: empty and degenerate inputs do not throw");
  {
    const s = agreementStats([]);
    close("empty n", s.n, 0);
    close("empty kappa", s.kappa, 0);
    // No class variation: pe is 1, which would divide by zero. Must be 0, and
    // the caller is expected to reject the set rather than read this number.
    const noVariation = agreementStats(make(10, 0, 0, 0));
    close("no-variation kappa", noVariation.kappa, 0);
  }

  console.info("\njudge-metrics: the class-balance guard");
  {
    ok("balanced set is usable", classBalanceProblems([true, true, false, false]).length === 0);
    ok("empty set is refused", classBalanceProblems([]).length > 0);
    ok("all-pass set is refused", classBalanceProblems([true, true, true]).length > 0);
    ok("all-fail set is refused", classBalanceProblems([false, false, false]).length > 0);
    const skew = classBalanceProblems([true, true, true, true, false]);
    ok("80/20 skew is refused", skew.length > 0);
    ok("the refusal names what an always-pass judge would score", skew.join(" ").includes("80%"));
  }

  console.info("\njudge-metrics: enforcement is a claim, and an absent pair is unvalidated");
  {
    const base: ValidationResults = {
      ran: "2026-08-02",
      datasetVersion: "1",
      kappaFloor: 0.6,
      reports: [
        { gate: "safety", generator: "gen-a", stats: agreementStats(make(9, 1, 1, 9)) },
        { gate: "grounded", generator: "gen-a", stats: agreementStats(make(5, 5, 5, 5)) },
      ],
      enforced: [],
    };

    ok("nothing enforced means nothing fails", enforcedFailures(base).length === 0);

    const enforcingGood = { ...base, enforced: [{ gate: "safety" as const, generator: "gen-a" }] };
    ok("an enforced pair above the floor passes", enforcedFailures(enforcingGood).length === 0);

    const enforcingBad = { ...base, enforced: [{ gate: "grounded" as const, generator: "gen-a" }] };
    const bad = enforcedFailures(enforcingBad);
    ok("an enforced pair below the floor fails", bad.length === 1);
    ok("the failure names the gate and the kappa", bad[0].includes("grounded") && bad[0].includes("kappa"));

    // The strict direction: claiming a pair nobody measured is a failure, not a
    // silent pass. This is the hole that would let a claim outrun its evidence.
    const enforcingMissing = { ...base, enforced: [{ gate: "safety" as const, generator: "never-run" }] };
    const missing = enforcedFailures(enforcingMissing);
    ok("claiming an unmeasured pair fails", missing.length === 1);
    ok("...and says it was never measured", missing[0].includes("never measured"));
  }

  console.info("\njudge-metrics: the committed dataset is usable");
  {
    const raw = readFileSync(resolve(__dirname, "judge-validation-dataset.jsonl"), "utf8");
    const rows = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"))
      .map((l) => JSON.parse(l) as { gate: string; gold: boolean; why?: string; id: string });

    ok("dataset is non-trivial", rows.length >= 40);
    for (const gate of ["safety", "grounded"]) {
      const golds = rows.filter((r) => r.gate === gate).map((r) => r.gold);
      ok(`${gate} has cases`, golds.length > 0);
      const problems = classBalanceProblems(golds);
      ok(`${gate} is class balanced (${golds.filter(Boolean).length}/${golds.length} pass)`, problems.length === 0);
    }
    ok("every case carries a decidable reason", rows.every((r) => typeof r.why === "string" && r.why.length > 0));
    ok("every id is unique", new Set(rows.map((r) => r.id)).size === rows.length);
  }

  if (failures > 0) {
    console.error(`\n✗ judge-metrics: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.info(
    "\n✓ judge-metrics: agreement, kappa, per-class rates, the balance guard and enforcement all hold.",
  );
}

main();
