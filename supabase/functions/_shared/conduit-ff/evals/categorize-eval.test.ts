/**
 * categorize-eval.test.ts: CI-gated labeled categorization eval.
 *
 * Runs the deterministic categorizer over the labeled fixture and asserts that the
 * named IR metrics are actually computed and that macro-F1 / accuracy clear a floor
 * set at or just below the real measured values (so the gate is honest and green).
 *
 * Measured on the committed fixture (40 rows, deterministic path, offline):
 *   accuracy 82.5%, macro precision 92.9%, macro recall 84.9%, macro F1 85.6%.
 * Floors are set below those so an incidental fixture edit does not flip CI red,
 * while a real regression in the matching kernel would. Runs under the Deno gate
 * (deno test _shared/) with only --allow-read for the fixture. No network, no DB.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadFixture, runCategorizeEval, NO_MATCH_CLASS } from "./categorize-runner.ts";

// Floors: at/just below the real measured macro-F1 (0.856) and accuracy (0.825).
const MACRO_F1_FLOOR = 0.85;
const ACCURACY_FLOOR = 0.80;

Deno.test("labeled categorization eval computes named metrics over the fixture", async () => {
  const fixture = await loadFixture();
  assert(fixture.rows.length >= 30, `fixture should have >=30 rows, has ${fixture.rows.length}`);

  const res = runCategorizeEval(fixture);
  const m = res.metrics;

  // The named metrics all exist and are finite numbers in [0, 1].
  for (const [name, v] of Object.entries({
    accuracy: m.accuracy,
    macroPrecision: m.macroPrecision,
    macroRecall: m.macroRecall,
    macroF1: m.macroF1,
  })) {
    assert(Number.isFinite(v), `${name} is finite`);
    assert(v >= 0 && v <= 1, `${name} in [0,1]: ${v}`);
  }

  // Per-class precision/recall/F1 are present for every class in the fixture.
  assertEquals(m.perClass.length, m.classes.length);
  for (const c of m.perClass) {
    assert(Number.isFinite(c.precision) && Number.isFinite(c.recall) && Number.isFinite(c.f1), `${c.class} metrics finite`);
  }

  // The confusion matrix diagonal must sum to the correct count.
  let diag = 0;
  for (const cls of m.classes) diag += m.confusion[cls][cls];
  assertEquals(diag, m.correct);
  assertEquals(m.total, fixture.rows.length);
});

Deno.test("deterministic categorizer clears the honest quality floor", async () => {
  const res = runCategorizeEval(await loadFixture());
  const m = res.metrics;
  assert(m.macroF1 >= MACRO_F1_FLOOR, `macro F1 ${m.macroF1.toFixed(4)} < floor ${MACRO_F1_FLOOR}`);
  assert(m.accuracy >= ACCURACY_FLOOR, `accuracy ${m.accuracy.toFixed(4)} < floor ${ACCURACY_FLOOR}`);
});

Deno.test("unmatched transactions are scored as the no-match class, not dropped", async () => {
  const res = runCategorizeEval(await loadFixture());
  // Every fixture row produced exactly one (expected, predicted) pair.
  assertEquals(res.pairs.length, res.datasetSize);
  assert(res.metrics.classes.includes(NO_MATCH_CLASS));
});
