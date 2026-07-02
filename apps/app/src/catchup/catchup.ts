/**
 * Catch-up mode — pure logic (W2.1). DB-free helpers so the trust-tier gating,
 * per-year grouping, and interruption budget can be unit-tested in node (Vitest),
 * exactly like ledger/reports.ts and lenses/practiceQueue.ts.
 *
 * The flow itself (CatchUpFlow.tsx) is thin orchestration over the reused pipeline;
 * every DECISION that could silently go wrong lives here, under test:
 *   - which picks are safe to bulk-approve (trust tier, server re-checks too),
 *   - how many owner questions a batch actually costs (the interruption budget),
 *   - the year a transaction belongs to, and per-year progress rollups.
 */
import type { CatchUpYear } from "../ledger/api";
import type { BehaviorConfig } from "../copy/config";

/** A staged catch-up transaction with Penny's proposal attached. */
export interface CatchUpProposal {
  entry_id: string;
  memo: string | null;
  /** Penny's chosen account id, or null when she has no grounded pick. */
  to_account_id: string | null;
  /** 0–1; rule matches come back as 1. */
  confidence: number;
  source: "rule" | "penny";
}

/**
 * A proposal is safe to BULK-approve only when Penny is at/above the high-confidence
 * cutoff (config-driven; the server re-checks the same cutoff in catch_up_batch_approve,
 * so this is a UI convenience, never the security boundary). A rule match (conf 1) always
 * qualifies. A proposal with no account never qualifies. This is the trust tier: high
 * confidence auto-batches; everything else becomes an owner question — never auto-posted.
 */
export function isHighConfidence(p: CatchUpProposal, cfg: BehaviorConfig): boolean {
  if (!p.to_account_id) return false;
  return p.confidence >= cfg.confidence_high;
}

export interface Partition {
  /** Picks that can be confirmed in one batch (high confidence). */
  bulk: CatchUpProposal[];
  /** Picks the owner must decide on (the batched questions). */
  questions: CatchUpProposal[];
}

/**
 * Split proposals into the one-tap bulk set and the owner-question set. This is what
 * keeps a 5k-transaction backlog from becoming 5k prompts: the owner confirms `bulk`
 * in a single action and only ever answers `questions`.
 */
export function partitionProposals(proposals: CatchUpProposal[], cfg: BehaviorConfig): Partition {
  const bulk: CatchUpProposal[] = [];
  const questions: CatchUpProposal[] = [];
  for (const p of proposals) (isHighConfidence(p, cfg) ? bulk : questions).push(p);
  return { bulk, questions };
}

/**
 * The owner's interruption count for a batch = the number of low-confidence picks
 * they must personally decide. The high-confidence set costs ONE tap total (a single
 * bulk-approve), so it does NOT count against the interruption budget. This is the
 * number the ≤5 asks/week budget (config.asks_per_week) governs — surfaced so the UI
 * can batch the questions and never exceed the weekly ask ceiling.
 */
export function interruptionCount(proposals: CatchUpProposal[], cfg: BehaviorConfig): number {
  return partitionProposals(proposals, cfg).questions.length;
}

/**
 * Whether a batch of questions fits the weekly interruption budget. When it doesn't,
 * the UI shows only the first `asks_per_week` questions and defers the rest to the
 * next batch — the owner is never asked more than the budget per week.
 */
export function withinAskBudget(questionCount: number, cfg: BehaviorConfig): boolean {
  return questionCount <= cfg.asks_per_week;
}

/** The questions to surface now, capped at the weekly ask budget. */
export function questionsForThisWeek(questions: CatchUpProposal[], cfg: BehaviorConfig): CatchUpProposal[] {
  return questions.slice(0, Math.max(0, cfg.asks_per_week));
}

export type YearStatus = "done" | "in_progress" | "not_started";

/** The status a year renders as in the progress meter. */
export function yearStatus(y: CatchUpYear): YearStatus {
  if (y.done) return "done";
  if (y.entries > 0) return "in_progress";
  return "not_started";
}

/** Overall catch-up completion: every year that has activity is done. */
export function allYearsDone(years: CatchUpYear[]): boolean {
  const active = years.filter((y) => y.entries > 0);
  return active.length > 0 && active.every((y) => y.done);
}

/**
 * The year a YYYY-MM-DD date belongs to (the first four chars, as an int). Returns
 * null for an empty/malformed date so a bad row is grouped as "unknown", never
 * silently folded into the current year.
 */
export function yearOf(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isInteger(y) && y > 1900 && y < 3000 ? y : null;
}

/** Distinct backlog years present in a set of dated rows, newest first. */
export function backlogYears(dates: (string | null | undefined)[]): number[] {
  const set = new Set<number>();
  for (const d of dates) {
    const y = yearOf(d);
    if (y != null) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

/** Total flat-per-year fee for a set of backlog years (minor units). */
export function catchUpFeeTotal(feePerYearMinor: number, years: number[]): number {
  return Math.max(0, Math.trunc(feePerYearMinor)) * years.length;
}
