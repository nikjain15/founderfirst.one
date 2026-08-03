/**
 * evals/judge-metrics.ts - agreement metrics for validating the LLM-judge panel.
 *
 * WHY THIS FILE EXISTS. `docs/EVALS.md` §4 describes the judge panel as
 * implemented: family-aware, fail-closed, injection-safe, escalating to two
 * judges of different model families. All of that is true and none of it is
 * evidence the panel is RIGHT. A panel can be beautifully constructed and still
 * disagree with a careful human read, and nothing in this repo had ever
 * compared a panel verdict against a human label.
 *
 * The deterministic gates are already measured: `evals/run.ts` scores
 * `safetyPrefilter`, `privacyGate`, `validFormatGate`, `sourceExistsGate` and
 * `mathGate` against a labeled set. Those are pure code. What was unmeasured is
 * the part that uses a model to decide, which is exactly the part that can be
 * wrong in ways code review cannot see.
 *
 * Two LLM-judged GATES exist, both binary pass/fail (see the eval library in
 * `supabase/migrations/20260628140000_ai_evals.sql`):
 *
 *   safety    is this answer giving advice it cannot stand behind?
 *   grounded  is every number and fact traceable to the provided context?
 *
 * The three llm_judge SCORE evals (consistent, voice, helpful) return 0..1
 * rather than a verdict, so they are not graded here. Forcing a continuous
 * score into a binary agreement number would be inventing a measurement.
 *
 * EVERY NUMBER IS REPORTED NEXT TO THE NUMBER IT HAS TO BEAT. Raw agreement
 * measures the dataset as much as the judge: on a set that is 80 percent
 * passing, a judge that answers "pass" to everything scores 80 percent while
 * carrying no signal at all. It also hides WHICH way the judge is wrong, and
 * for a safety gate the two directions are not remotely equivalent. A judge
 * that blocks a good answer costs a customer one retry. A judge that passes
 * definitive tax advice ships the thing the gate exists to stop.
 *
 * Pure functions over recorded verdicts. No network, no key, no DB, so CI
 * checks the arithmetic on every pull request and only the model call needs a
 * secret. Method ported from Conduit and Pulse deliberately rather than
 * reinvented.
 */

/** The two LLM-judged gates. Binary verdicts, so agreement is well defined. */
export type JudgedGate = "safety" | "grounded";

/** One graded case: what the human label says, what the panel returned. */
export interface Comparison {
  /** Ground truth: should this answer PASS the gate? */
  gold: boolean;
  /** What the panel returned for the same case. */
  judge: boolean;
}

export interface AgreementStats {
  n: number;
  /** gold pass, judge pass. */
  tp: number;
  /** gold pass, judge blocked: a good answer wrongly held back. */
  fn: number;
  /**
   * gold fail, judge passed: the answer the gate exists to stop, shipped.
   * The dangerous cell, and the reason per-class rates are reported.
   */
  fp: number;
  /** gold fail, judge blocked. */
  tn: number;
  /** Raw agreement. Never report this alone. */
  agreement: number;
  /** What a judge scores by answering "pass" to everything. The number raw
   *  agreement has to beat before it means anything. */
  baseRate: number;
  /** Cohen's kappa: agreement corrected for chance. 1 perfect, 0 chance level,
   *  negative worse than chance. 0.6 is the common production floor. */
  kappa: number;
  /** Of answers that genuinely SHOULD pass, the share the judge let through.
   *  Low means the gate cries wolf and people route around it. */
  truePassRate: number;
  /** Of answers that genuinely should NOT pass, the share the judge caught.
   *  Low means bad answers ship. This is the rate that matters most. */
  trueBlockRate: number;
}

const div = (a: number, b: number): number => (b === 0 ? 0 : a / b);

/**
 * Cohen's kappa for two binary raters.
 *
 *   po = observed agreement
 *   pe = agreement expected by chance from the two raters' marginals
 *   k  = (po - pe) / (1 - pe)
 *
 * The degenerate case is worth naming. If both raters always answered the same
 * class, pe is 1 and the formula divides by zero. That is a set with no class
 * variation, not a perfect judge, so it returns 0 and the caller must reject
 * the set as unusable. `classBalanceProblems` makes that unreachable with a
 * committed dataset.
 */
export function agreementStats(comparisons: Comparison[]): AgreementStats {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;

  for (const { gold, judge } of comparisons) {
    if (gold && judge) tp++;
    else if (gold && !judge) fn++;
    else if (!gold && judge) fp++;
    else tn++;
  }

  const n = comparisons.length;
  const po = div(tp + tn, n);

  const goldTrue = tp + fn;
  const goldFalse = fp + tn;
  const judgeTrue = tp + fp;
  const judgeFalse = fn + tn;
  const pe = n === 0 ? 0 : (goldTrue * judgeTrue + goldFalse * judgeFalse) / (n * n);

  return {
    n,
    tp,
    fn,
    fp,
    tn,
    agreement: po,
    baseRate: div(goldTrue, n),
    kappa: pe >= 1 ? 0 : div(po - pe, 1 - pe),
    truePassRate: div(tp, goldTrue),
    trueBlockRate: div(tn, goldFalse),
  };
}

/** Landis and Koch bands, the convention kappa is normally read against. */
export function kappaBand(kappa: number): string {
  if (kappa < 0) return "worse than chance";
  if (kappa < 0.21) return "slight";
  if (kappa < 0.41) return "fair";
  if (kappa < 0.61) return "moderate";
  if (kappa < 0.81) return "substantial";
  return "almost perfect";
}

/**
 * The class-balance guard.
 *
 * A validation set skewed towards one class makes an always-one-answer judge
 * look competent on raw agreement, and it makes kappa unstable. This refuses
 * anything outside a 40/60 split, and refuses a set with no variation at all,
 * which is the input that would silently return kappa 0 above.
 *
 * Returns the reasons the set is unusable. Empty means it is usable.
 */
export function classBalanceProblems(golds: boolean[], tolerance = 0.1): string[] {
  const out: string[] = [];
  const n = golds.length;
  if (n === 0) {
    out.push("the validation set is empty");
    return out;
  }
  const passing = golds.filter(Boolean).length;
  const share = passing / n;
  if (passing === 0) out.push("every case is labelled fail, so kappa cannot be computed");
  if (passing === n) out.push("every case is labelled pass, so kappa cannot be computed");
  if (Math.abs(share - 0.5) > tolerance) {
    out.push(
      `class balance is ${passing}/${n} passing (${(share * 100).toFixed(0)}%), outside the ` +
        `${((0.5 - tolerance) * 100).toFixed(0)} to ${((0.5 + tolerance) * 100).toFixed(0)}% band. ` +
        `An always-pass judge would score ${(share * 100).toFixed(0)}% raw agreement on it.`,
    );
  }
  return out;
}

/** One gate's result for one panel configuration. */
export interface GateReport {
  gate: JudgedGate;
  /** The generator whose answers were graded; it drives the panel (D20). */
  generator: string;
  stats: AgreementStats;
}

/**
 * A (gate, generator) pair FounderFirst claims is validated, and therefore
 * holds to the kappa floor.
 *
 * Every pair measured gets recorded. Only what the repo CLAIMS gets enforced.
 * The distinction runs the strict way: a pair not listed here is not exempt,
 * it is UNVALIDATED, and an unvalidated judge must not be described anywhere as
 * a quality gate. Adding a pair here is a claim that a recorded measurement
 * backs it.
 */
export interface EnforcedPair {
  gate: JudgedGate;
  generator: string;
}

export interface ValidationResults {
  /** ISO date of the run. A stale result is a stale claim. */
  ran: string;
  datasetVersion: string;
  reports: GateReport[];
  /** Kappa an enforced pair must clear. */
  kappaFloor: number;
  /** What this repo claims is validated. Anything absent is unvalidated. */
  enforced: EnforcedPair[];
  notes?: string;
}

/**
 * Every enforced pair that does not clear the floor, described for an error
 * message. Empty means every claim this repo makes is backed by a measurement.
 */
export function enforcedFailures(results: ValidationResults): string[] {
  const out: string[] = [];
  for (const pair of results.enforced) {
    const report = results.reports.find(
      (r) => r.gate === pair.gate && r.generator === pair.generator,
    );
    if (!report) {
      out.push(
        `${pair.gate} on ${pair.generator}: claimed validated but never measured`,
      );
      continue;
    }
    if (report.stats.kappa < results.kappaFloor) {
      out.push(
        `${pair.gate} on ${pair.generator}: kappa ${report.stats.kappa.toFixed(3)} is below ` +
          `the floor ${results.kappaFloor} (${kappaBand(report.stats.kappa)})`,
      );
    }
  }
  return out;
}
