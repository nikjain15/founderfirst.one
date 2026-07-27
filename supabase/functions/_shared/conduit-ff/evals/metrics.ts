/**
 * metrics.ts: self-contained, dependency-free classification metrics.
 *
 * Given labeled (expected, predicted) pairs over a fixed set of classes, it builds
 * a confusion matrix and computes the standard information-retrieval metrics for a
 * multi-class classifier: overall accuracy, per-class precision / recall / F1, and
 * the macro-averaged precision / recall / F1 (unweighted mean across classes).
 *
 * Definitions (per class c, one-vs-rest):
 *   TP = predicted c and truly c
 *   FP = predicted c but truly not c
 *   FN = truly c but predicted something else
 *   precision = TP / (TP + FP)   (0 when the denominator is 0)
 *   recall    = TP / (TP + FN)   (0 when the denominator is 0)
 *   F1        = 2·P·R / (P + R)   (0 when P + R is 0)
 *   accuracy  = correct / total
 *   macro-*   = unweighted mean of the per-class values
 *
 * No network, no DB, no env. Pure functions, unit-tested in metrics.test.ts.
 */

export interface LabeledPair {
  expected: string;
  predicted: string;
}

export interface ClassMetrics {
  class: string;
  support: number; // number of truly-c instances
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface MetricsReport {
  classes: string[];
  total: number;
  correct: number;
  accuracy: number;
  perClass: ClassMetrics[];
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  /** confusion[expected][predicted] = count */
  confusion: Record<string, Record<string, number>>;
}

/** Build confusion[expected][predicted] counts over the given class set. */
export function confusionMatrix(pairs: LabeledPair[], classes: string[]): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  for (const a of classes) {
    m[a] = {};
    for (const b of classes) m[a][b] = 0;
  }
  for (const p of pairs) {
    if (!(p.expected in m)) throw new Error(`unknown expected class: ${p.expected}`);
    if (!(p.predicted in m[p.expected])) throw new Error(`unknown predicted class: ${p.predicted}`);
    m[p.expected][p.predicted] += 1;
  }
  return m;
}

function safeDiv(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

/** Compute the full metrics report from labeled pairs and an explicit class list. */
export function computeMetrics(pairs: LabeledPair[], classes: string[]): MetricsReport {
  const confusion = confusionMatrix(pairs, classes);
  const total = pairs.length;
  let correct = 0;
  for (const c of classes) correct += confusion[c][c];

  const perClass: ClassMetrics[] = classes.map((c) => {
    const tp = confusion[c][c];
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (const other of classes) {
      if (other !== c) fp += confusion[other][c]; // predicted c, truly other
      fn += other !== c ? confusion[c][other] : 0; // truly c, predicted other
      support += confusion[c][other];
    }
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    return { class: c, support, tp, fp, fn, precision, recall, f1 };
  });

  const macroPrecision = safeDiv(perClass.reduce((s, c) => s + c.precision, 0), classes.length);
  const macroRecall = safeDiv(perClass.reduce((s, c) => s + c.recall, 0), classes.length);
  const macroF1 = safeDiv(perClass.reduce((s, c) => s + c.f1, 0), classes.length);

  return {
    classes,
    total,
    correct,
    accuracy: safeDiv(correct, total),
    perClass,
    macroPrecision,
    macroRecall,
    macroF1,
    confusion,
  };
}

/** Format a percentage for reporting (one decimal place). */
export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
