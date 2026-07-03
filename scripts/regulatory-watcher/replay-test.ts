/**
 * REG-1 · regulatory-watcher replay test (LOOP-2 acceptance (a)).
 *
 * Pure-logic gate in the repo's existing self-asserting-tsx style (like
 * check:kernel-seed / check:inference): no new test framework. Exits non-zero on
 * any failed assertion so CI fails loud. Run: `pnpm check:reg-watcher`.
 *
 * Proves, against the OBBBA 1099 fixture and hand-built cases, that the watcher:
 *   1. REPLAY: feeding the 2026 OBBBA 1099 change ($600→$2,000) produces exactly
 *      one seed-diff adding the correct 2026 $2,000 superseding row, with citation,
 *      effective_from 2026-01-01, source=regulatory_watcher, and old law untouched.
 *   2. IDEMPOTENT: re-running when the superseding row already exists → NO diff.
 *   3. NO-OP SAFE: a signal identical to the row in force → NO diff (false-positive-safe).
 *   4. STALE-DATE SAFE: a signal not newer than the in-force row → NO diff.
 *   5. PR BODY carries citation + effective dates + affected-consumer list (acceptance (b)).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "./detect.js";
import { prBody } from "./pr.js";
import type { LawChangeSignal, SeedState } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const fail = (m: string) => { failures++; console.error(`  ✗ ${m}`); };
const ok = (m: string) => console.info(`  ✓ ${m}`);
const assert = (cond: boolean, m: string) => (cond ? ok(m) : fail(m));

function loadFixture(name: string): { state: SeedState; signals: LawChangeSignal[] } {
  return JSON.parse(readFileSync(resolve(__dirname, "fixtures", `${name}.json`), "utf8"));
}

console.info("\nREG-1 regulatory-watcher replay test\n");

// ── 1. REPLAY: OBBBA 1099 change → correct seed-diff ─────────────────────────
console.info("1. OBBBA 1099 replay (acceptance (a)):");
const fx = loadFixture("obbba-1099");
const res = detect(fx.state, fx.signals);
assert(res.diffs.length === 1, `exactly one seed-diff produced (got ${res.diffs.length})`);
const d = res.diffs[0];
if (d) {
  assert(d.new_row.threshold_minor === 200000, "new threshold is $2,000 (200000 minor units)");
  assert(d.new_row.tax_year === 2026, "new row is tax_year 2026 (old 2025 row untouched)");
  assert(d.new_row.effective_from === "2026-01-01", "effective_from is 2026-01-01");
  assert(d.new_row.source === "regulatory_watcher", "source stamped regulatory_watcher");
  assert(d.new_row.effective_to === null, "new row window is OPEN (effective_to null)");
  assert(!!d.citation && d.citation.startsWith("http"), "carries a citation URL");
  // OBBBA is modeled as a NEW tax_year (2026) row, NOT an in-key supersede of the
  // 2025 row — so there is no in-force 2026 row to supersede (supersedes is empty).
  // This is the correct shape: old-year law is a separate, untouched row.
  assert(d.supersedes === undefined, "new tax-year row (no in-key supersede — old year row is separate)");
  assert(
    d.affected_consumers.some((c) => c.includes("1099")) &&
      d.affected_consumers.length >= 4,
    `affected-consumer list includes the 1099 report (${d.affected_consumers.length} surfaces)`,
  );
  // old law must be left intact in the input state (watcher never overwrites)
  const oldRow = fx.state.filing_obligations.find((r) => r.tax_year === 2025);
  assert(oldRow?.threshold_minor === 60000, "2025 row still $600 — old periods keep old law");
}

// ── 2. IDEMPOTENT: superseding row already present → no diff ──────────────────
console.info("2. Idempotency (re-run after applied):");
const applied: SeedState = {
  filing_obligations: [
    ...fx.state.filing_obligations,
    { ...(d?.new_row ?? ({} as never)) },
  ],
};
const res2 = detect(applied, fx.signals);
assert(res2.diffs.length === 0, "no diff when the superseding row already exists");
assert(res2.skipped.some((s) => s.reason.includes("already applied")), "skip reason = already applied");

// ── 3. NO-OP: signal equals row in force → no diff ───────────────────────────
console.info("3. No-op safety (identical to in-force row):");
const noop: LawChangeSignal = {
  source_id: "irs_1099_nec_instructions",
  jurisdiction_code: "US-FED", entity_type: "sole_prop", tax_year: 2025,
  obligation_key: "1099_nec_issue",
  proposed: {
    kind: "information_return", form_code: "1099-NEC",
    label: "Issue 1099-NEC to contractors paid $600+",
    due_month: 1, due_day: 31, threshold_minor: 60000, effective_from: "2024-01-01",
  },
  citation: "https://www.irs.gov/forms-pubs/about-form-1099-nec",
  summary: "no change",
};
const res3 = detect(fx.state, [noop]);
assert(res3.diffs.length === 0, "no diff for a signal identical to the in-force row");

// ── 4. STALE DATE: effective_from not newer → no diff ────────────────────────
console.info("4. Stale-date safety:");
const stale: LawChangeSignal = {
  ...noop,
  proposed: { ...noop.proposed, threshold_minor: 999999, effective_from: "2019-01-01" },
  summary: "backdated bogus change",
};
const res4 = detect(fx.state, [stale]);
assert(res4.diffs.length === 0, "no diff when effective_from is not strictly newer");

// ── 5. PR BODY completeness (acceptance (b)) ─────────────────────────────────
console.info("5. PR body carries citation + effective dates + consumers (acceptance (b)):");
if (d) {
  const body = prBody([d], { detectedAt: "2026-07-03", sources: 5 });
  assert(body.includes(d.citation), "PR body contains the citation");
  assert(body.includes("2026-01-01"), "PR body contains the effective_from date");
  assert(body.includes("Effective from"), "PR body has an effective-window table");
  assert(body.includes("Affected consumers"), "PR body lists affected consumers");
  assert(body.includes("decision-needed"), "PR body is flagged decision-needed");
  assert(body.includes("never self-merge"), "PR body states the watcher never self-merges");
}

if (failures) {
  console.error(`\n✗ REG-1 regulatory-watcher: ${failures} assertion(s) failed.\n`);
  process.exit(1);
}
console.info("\n✓ REG-1 regulatory-watcher: all assertions passed.\n");
