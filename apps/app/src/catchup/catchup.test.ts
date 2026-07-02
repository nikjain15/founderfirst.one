/**
 * Catch-up mode logic (W2.1) — DB-free unit tests for the decisions that could
 * silently go wrong: trust-tier gating (only high-confidence bulk-approves), the
 * interruption budget (a 5k backlog costs a handful of questions, not 5k prompts),
 * per-year status, and flat-per-year fee math. Mirrors the ledger/*.test.ts style.
 */
import { describe, expect, it } from "vitest";
import {
  allYearsDone, backlogYears, catchUpFeeTotal, interruptionCount, isHighConfidence,
  partitionProposals, questionsForThisWeek, withinAskBudget, yearOf, yearStatus,
  type CatchUpProposal,
} from "./catchup";
import { CONFIG_DEFAULTS, type BehaviorConfig } from "../copy/config";
import type { CatchUpYear } from "../ledger/api";

const cfg: BehaviorConfig = { ...CONFIG_DEFAULTS }; // confidence_high 0.75, asks_per_week 5

function prop(id: string, conf: number, acct: string | null = "acct-1", source: "rule" | "penny" = "penny"): CatchUpProposal {
  return { entry_id: id, memo: `m-${id}`, to_account_id: acct, confidence: conf, source };
}

describe("trust-tier gating", () => {
  it("bulk-approves only at/above confidence_high", () => {
    expect(isHighConfidence(prop("a", 0.75), cfg)).toBe(true);
    expect(isHighConfidence(prop("b", 0.9), cfg)).toBe(true);
    expect(isHighConfidence(prop("c", 0.74), cfg)).toBe(false);
    expect(isHighConfidence(prop("d", 0.45), cfg)).toBe(false);
    expect(isHighConfidence(prop("e", 0), cfg)).toBe(false);
  });

  it("a rule match (confidence 1) always qualifies", () => {
    expect(isHighConfidence(prop("r", 1, "acct-1", "rule"), cfg)).toBe(true);
  });

  it("never bulk-approves a proposal with no account, however confident", () => {
    expect(isHighConfidence(prop("x", 0.99, null), cfg)).toBe(false);
  });

  it("honors an org override that raises the cutoff", () => {
    const strict: BehaviorConfig = { ...cfg, confidence_high: 0.95 };
    expect(isHighConfidence(prop("a", 0.9), strict)).toBe(false);
    expect(isHighConfidence(prop("a", 0.96), strict)).toBe(true);
  });
});

describe("partition into bulk + batched questions", () => {
  it("splits high vs low confidence", () => {
    const props = [prop("a", 0.9), prop("b", 0.5), prop("c", 1, "x", "rule"), prop("d", 0)];
    const { bulk, questions } = partitionProposals(props, cfg);
    expect(bulk.map((p) => p.entry_id)).toEqual(["a", "c"]);
    expect(questions.map((p) => p.entry_id)).toEqual(["b", "d"]);
  });

  it("interruption count = only the low-confidence picks (bulk is one tap)", () => {
    // 5000 transactions: 4990 high-confidence, 10 low. The owner answers 10, not 5000.
    const props: CatchUpProposal[] = [];
    for (let i = 0; i < 4990; i++) props.push(prop(`hi-${i}`, 0.85));
    for (let i = 0; i < 10; i++) props.push(prop(`lo-${i}`, 0.3));
    expect(interruptionCount(props, cfg)).toBe(10);
    expect(partitionProposals(props, cfg).bulk).toHaveLength(4990);
  });

  it("interruption count is zero when Penny is confident about everything", () => {
    const props = [prop("a", 0.9), prop("b", 0.95), prop("c", 1, "x", "rule")];
    expect(interruptionCount(props, cfg)).toBe(0);
  });
});

describe("weekly ask budget (≤5 asks/week)", () => {
  it("flags when questions exceed the budget", () => {
    expect(withinAskBudget(5, cfg)).toBe(true);
    expect(withinAskBudget(6, cfg)).toBe(false);
  });

  it("caps surfaced questions at asks_per_week and defers the rest", () => {
    const questions = Array.from({ length: 12 }, (_, i) => prop(`q-${i}`, 0.2));
    const thisWeek = questionsForThisWeek(questions, cfg);
    expect(thisWeek).toHaveLength(5);
    expect(thisWeek.map((p) => p.entry_id)).toEqual(["q-0", "q-1", "q-2", "q-3", "q-4"]);
  });
});

describe("per-year progress", () => {
  const y = (year: number, entries: number, uncat: number, recon: number, done: boolean): CatchUpYear =>
    ({ year, entries, uncategorized: uncat, reconciled_sessions: recon, done });

  it("classifies year status", () => {
    expect(yearStatus(y(2023, 400, 0, 12, true))).toBe("done");
    expect(yearStatus(y(2024, 200, 40, 0, false))).toBe("in_progress");
    expect(yearStatus(y(2025, 0, 0, 0, false))).toBe("not_started");
  });

  it("overall done only when every active year is done", () => {
    expect(allYearsDone([y(2023, 400, 0, 12, true), y(2024, 200, 0, 6, true)])).toBe(true);
    expect(allYearsDone([y(2023, 400, 0, 12, true), y(2024, 200, 5, 0, false)])).toBe(false);
    expect(allYearsDone([])).toBe(false);
    // a not-started (no activity) year does not block completion
    expect(allYearsDone([y(2023, 400, 0, 12, true), y(2025, 0, 0, 0, false)])).toBe(true);
  });
});

describe("year grouping + fee math", () => {
  it("extracts the year from a YYYY-MM-DD date", () => {
    expect(yearOf("2023-04-15")).toBe(2023);
    expect(yearOf("2024-12-31")).toBe(2024);
    expect(yearOf("")).toBeNull();
    expect(yearOf(null)).toBeNull();
    expect(yearOf("bad")).toBeNull();
  });

  it("collects distinct backlog years, newest first", () => {
    expect(backlogYears(["2022-01-01", "2024-03-03", "2022-06-06", "2023-09-09", null]))
      .toEqual([2024, 2023, 2022]);
  });

  it("flat-per-year fee = per-year × number of years", () => {
    // $500/yr flat, 3 years of backlog = $1500.
    expect(catchUpFeeTotal(50_000, [2022, 2023, 2024])).toBe(150_000);
    expect(catchUpFeeTotal(50_000, [])).toBe(0);
    expect(catchUpFeeTotal(-1, [2023])).toBe(0);
  });
});
