import { test } from "node:test";
import assert from "node:assert/strict";
import { perSourceStats, anomalyScan, thresholdSuggestions } from "../optimizer.mjs";

// perSourceStats/anomalyScan/thresholdSuggestions are the optimizer's pure
// scoring/anomaly-detection core (weekly audit 2026-07-06, #301, tests P1 —
// zero coverage existed across tools/). All three are DB-free and settings-in,
// data-out, so they're unit-testable without Ollama/Supabase.

function item({ source_id = "src-1", status = "new", relevance, intent, geo, role, stage, title = "", body = "" } = {}) {
  return {
    source_id, status, title, body,
    sig_scores: relevance == null && intent == null && geo == null && role == null
      ? null
      : { relevance, intent, geo, role },
    sig_leads: stage ? { stage } : null,
  };
}

test("perSourceStats: composite yield reflects relevance/geo/role/promo rates", () => {
  const items = [
    item({ source_id: "A", relevance: 0.9, intent: 80, geo: "us", role: "needs_help", status: "promoted" }),
    item({ source_id: "A", relevance: 0.9, intent: 60, geo: "us", role: "needs_help" }),
  ];
  const stats = perSourceStats(items, 0.7);
  const a = stats.get("A");
  assert.equal(a.n, 2);
  assert.equal(a.rel_rate, 1);
  assert.equal(a.us_rate, 1);
  assert.equal(a.needs_rate, 1);
  assert.equal(a.promo_rate, 0.5);
  assert.ok(Math.abs(a.yield - 1.2) < 1e-9, `expected yield ~1.2, got ${a.yield}`);
});

test("perSourceStats: reply/won outcomes cap at 0.25 and never lower yield", () => {
  const items = [
    item({ source_id: "B", relevance: 0.2, intent: 10, geo: "non_us", role: "other", stage: "replied" }),
    item({ source_id: "B", relevance: 0.2, intent: 10, geo: "non_us", role: "other" }),
  ];
  const stats = perSourceStats(items, 0.7);
  const b = stats.get("B");
  assert.equal(b.rel_rate, 0);
  assert.equal(b.reply_rate, 0.5);
  assert.ok(Math.abs(b.yield - 0.25) < 1e-9, `expected yield ~0.25, got ${b.yield}`);
});

test("perSourceStats: unscored items (pending) are excluded from the denominator", () => {
  const items = [
    item({ source_id: "C", relevance: 0.9, intent: 80, geo: "us", role: "needs_help" }),
    item({ source_id: "C" }), // no sig_scores yet — pending, must not count
  ];
  const stats = perSourceStats(items, 0.7);
  assert.equal(stats.get("C").n, 1);
});

test("anomalyScan: flags a cluster of identical high-intent score signatures", () => {
  const settings = { intent_threshold: 70 };
  const items = Array.from({ length: 8 }, () =>
    item({ intent: 90, geo: "us", role: "needs_help", body: "a".repeat(80) }));
  items[0].sig_scores.pain_tags = ["hates_quickbooks"];
  for (const it of items) it.sig_scores.pain_tags = ["hates_quickbooks"];
  const out = anomalyScan(items, [], settings);
  assert.ok(out.some((m) => m.includes("IDENTICAL score signature")), out.join(" | "));
});

test("anomalyScan: below the cluster threshold produces no cluster flag", () => {
  const settings = { intent_threshold: 70 };
  const items = Array.from({ length: 7 }, () =>
    item({ intent: 90, geo: "us", role: "needs_help", body: "a".repeat(80) }));
  const out = anomalyScan(items, [], settings);
  assert.ok(!out.some((m) => m.includes("IDENTICAL score signature")));
});

test("anomalyScan: flags high-intent items with suspiciously thin text", () => {
  const settings = { intent_threshold: 70 };
  const items = [item({ intent: 95, geo: "us", role: "needs_help", body: "too short" })];
  const out = anomalyScan(items, [], settings);
  assert.ok(out.some((m) => m.includes("under 40 chars")));
});

test("anomalyScan: flags saved drafts that read like model refusals", () => {
  const settings = { intent_threshold: 70 };
  const drafts = [{ id: 1, draft: "I don't have the actual post text to reference." }];
  const out = anomalyScan([], drafts, settings);
  assert.ok(out.some((m) => m.includes("read like model refusals")));
});

test("anomalyScan: a clean, varied batch produces zero anomalies", () => {
  const settings = { intent_threshold: 70 };
  const items = [
    item({ intent: 80, geo: "us", role: "needs_help", body: "a".repeat(80) }),
    item({ intent: 20, geo: "non_us", role: "other", body: "b".repeat(80) }),
  ];
  const drafts = [{ id: 1, draft: "Happy to help with your quickbooks reconciliation issue this quarter." }];
  const out = anomalyScan(items, drafts, settings);
  assert.deepEqual(out, []);
});

function eligibleItem(relevance, intent) {
  return item({ relevance, intent, geo: "us", role: "needs_help" });
}

test("thresholdSuggestions: suggests lowering relevance_threshold on a wide near-miss band", () => {
  const settings = { relevance_threshold: 0.7, intent_threshold: 60 };
  const items = [
    ...Array.from({ length: 6 }, () => eligibleItem(0.66, 10)), // within 0.06 below, near-miss
    ...Array.from({ length: 14 }, () => eligibleItem(0.9, 10)), // clear hits, not near-miss
  ];
  const out = thresholdSuggestions(items, settings);
  assert.ok(out.some((m) => m.includes("Lower relevance_threshold")), out.join(" | "));
});

test("thresholdSuggestions: suggests lowering intent_threshold on a wide near-miss band", () => {
  const settings = { relevance_threshold: 0.7, intent_threshold: 60 };
  const items = [
    ...Array.from({ length: 6 }, () => eligibleItem(0.9, 50)), // within 15 below 60, near-miss
    ...Array.from({ length: 14 }, () => eligibleItem(0.9, 90)), // clear hits
  ];
  const out = thresholdSuggestions(items, settings);
  assert.ok(out.some((m) => m.includes("Lower intent_threshold")), out.join(" | "));
});

test("thresholdSuggestions: stays silent below the 20-item eligibility floor", () => {
  const settings = { relevance_threshold: 0.7, intent_threshold: 60 };
  const items = Array.from({ length: 5 }, () => eligibleItem(0.66, 50));
  assert.deepEqual(thresholdSuggestions(items, settings), []);
});

test("thresholdSuggestions: stays silent when hits are clearly clear of the cutoffs", () => {
  const settings = { relevance_threshold: 0.7, intent_threshold: 60 };
  const items = Array.from({ length: 25 }, () => eligibleItem(0.95, 95));
  assert.deepEqual(thresholdSuggestions(items, settings), []);
});
