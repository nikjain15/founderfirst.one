/**
 * metrics.test.ts: verifies the classification metrics math on a hand-built
 * confusion matrix whose expected precision/recall/F1 are computed by hand below.
 * No network, no DB. Runs in the Deno CI gate (deno test _shared/).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeMetrics, confusionMatrix, type LabeledPair } from "./metrics.ts";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// Hand-built 3-class set (classes A, B, C). Rows = expected, cols = predicted:
//        pred A  pred B  pred C
//  A         3       1       0     (support 4)
//  B         2       1       0     (support 3)
//  C         0       0       2     (support 2)
// total = 9, correct = 3 + 1 + 2 = 6, accuracy = 6/9.
//
// Per class (one-vs-rest), verified by hand:
//   A: TP=3 FP=2 FN=1  -> P=3/5=0.60   R=3/4=0.75   F1=0.6666666…
//   B: TP=1 FP=1 FN=2  -> P=1/2=0.50   R=1/3=0.3333 F1=0.40
//   C: TP=2 FP=0 FN=0  -> P=1.00       R=1.00       F1=1.00
//   macroP = (0.60+0.50+1.00)/3 = 0.70
//   macroR = (0.75+0.3333…+1.00)/3 = 0.6944…
//   macroF1 = (0.6666…+0.40+1.00)/3 = 0.6888…
function handBuiltPairs(): LabeledPair[] {
  const pairs: LabeledPair[] = [];
  const push = (expected: string, predicted: string, n: number) => {
    for (let i = 0; i < n; i++) pairs.push({ expected, predicted });
  };
  push("A", "A", 3); push("A", "B", 1);
  push("B", "A", 2); push("B", "B", 1);
  push("C", "C", 2);
  return pairs;
}

Deno.test("confusionMatrix counts land in the right cells", () => {
  const m = confusionMatrix(handBuiltPairs(), ["A", "B", "C"]);
  assertEquals(m.A.A, 3);
  assertEquals(m.A.B, 1);
  assertEquals(m.B.A, 2);
  assertEquals(m.B.B, 1);
  assertEquals(m.C.C, 2);
  assertEquals(m.A.C, 0);
});

Deno.test("computeMetrics matches hand-computed precision/recall/F1", () => {
  const r = computeMetrics(handBuiltPairs(), ["A", "B", "C"]);

  assertEquals(r.total, 9);
  assertEquals(r.correct, 6);
  assert(close(r.accuracy, 6 / 9), `accuracy ${r.accuracy}`);

  const byClass = Object.fromEntries(r.perClass.map((c) => [c.class, c]));

  assertEquals(byClass.A.tp, 3);
  assertEquals(byClass.A.fp, 2);
  assertEquals(byClass.A.fn, 1);
  assertEquals(byClass.A.support, 4);
  assert(close(byClass.A.precision, 0.6), `A precision ${byClass.A.precision}`);
  assert(close(byClass.A.recall, 0.75), `A recall ${byClass.A.recall}`);
  assert(close(byClass.A.f1, (2 * 0.6 * 0.75) / (0.6 + 0.75)), `A f1 ${byClass.A.f1}`);

  assert(close(byClass.B.precision, 0.5), `B precision ${byClass.B.precision}`);
  assert(close(byClass.B.recall, 1 / 3), `B recall ${byClass.B.recall}`);
  assert(close(byClass.B.f1, 0.4), `B f1 ${byClass.B.f1}`);

  assert(close(byClass.C.precision, 1), `C precision ${byClass.C.precision}`);
  assert(close(byClass.C.recall, 1), `C recall ${byClass.C.recall}`);
  assert(close(byClass.C.f1, 1), `C f1 ${byClass.C.f1}`);

  assert(close(r.macroPrecision, 0.7), `macroP ${r.macroPrecision}`);
  assert(close(r.macroRecall, (0.75 + 1 / 3 + 1) / 3), `macroR ${r.macroRecall}`);
  assert(close(r.macroF1, (byClass.A.f1 + 0.4 + 1) / 3), `macroF1 ${r.macroF1}`);
});

Deno.test("empty-denominator classes score zero, not NaN", () => {
  // Class Z is never predicted and never true -> P=R=F1=0 by convention.
  const r = computeMetrics([{ expected: "A", predicted: "A" }], ["A", "Z"]);
  const z = r.perClass.find((c) => c.class === "Z")!;
  assertEquals(z.precision, 0);
  assertEquals(z.recall, 0);
  assertEquals(z.f1, 0);
  assert(Number.isFinite(r.macroF1));
});
