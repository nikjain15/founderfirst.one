// LOOP-2 — affected-consumer map.
//
// Every filing_obligations change ripples to a known set of app surfaces (Roadmap
// 3b "who consumes it" + 3c step 5). This is DATA keyed by obligation_key `kind`
// so a reviewer sees exactly what recomputes on merge — no hunting through code.
//
// Source of truth is the roadmap kernel table: filing_obligations is consumed by
// "Coming up" cards, email nudges, tax-package checklist, and (for information
// returns with a threshold) the 1099 report + categorization first-guess.

import type { SeedDiff } from "./types.js";

/** Base consumers of ANY filing-calendar row. */
const BASE_CONSUMERS = [
  '"Coming up" deadline cards (apps/app Home)',
  "Deadline email nudges (email_schedules dispatcher)",
  "Tax-package checklist (year-end handoff)",
  "Penny deadline explanations (cites the stored source)",
];

/** Extra consumers by obligation kind. */
const BY_KIND: Record<string, string[]> = {
  information_return: [
    "1099 issuance report (threshold_minor gate)",
    "Estimated-taxes / quarterly estimator",
  ],
  estimate: ["Quarterly estimated-tax estimator", "Cash-flow projection"],
  annual_return: ["Tax-readiness % on the Books dashboard", "Export package cover"],
  extension: ["Tax-package checklist (extension path)"],
};

/** Compute the affected-consumer list for a diff. Deterministic + testable. */
export function affectedConsumers(row: {
  kind: string;
  threshold_minor?: number | null;
}): string[] {
  const extra = BY_KIND[row.kind] ?? [];
  const out = [...BASE_CONSUMERS, ...extra];
  return out;
}

/** One-line human summary of the consumer blast-radius, for the PR body. */
export function consumerSummary(diff: SeedDiff): string {
  return `${diff.affected_consumers.length} surfaces recompute on merge: ${diff.affected_consumers.join("; ")}.`;
}
