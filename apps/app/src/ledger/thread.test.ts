/**
 * W3.1 Penny thread — intent routing + grounding-scope guard + tie-out.
 *
 * These are the card's Vitest gates:
 *   • intent routing — greeting / activity / grounded question / unsupported
 *   • grounding-scope guard — an out-of-scope or advice question is `unsupported`
 *     (the fn declines; no number is ever invented)
 *   • tie-out — computeMetric equals the report math to the cent, and an unknown
 *     category is flagged (declined) rather than reported as a real $0
 */
import { describe, it, expect } from "vitest";
import { routeMessage, computeMetric, resolvePeriod } from "./thread";
import { profitAndLoss, balanceSheet } from "./reports";
import type { AccountType, JournalEntry } from "./types";

const NOW = new Date("2026-07-03T12:00:00Z");

// ── fixtures: a tiny but real double-entry ledger ─────────────────────────────
const acct = (code: string, name: string, type: AccountType) => ({ code, name, type });
function entry(id: string, date: string, lines: { acct: ReturnType<typeof acct>; amt: number; side: "D" | "C" }[]): JournalEntry {
  return {
    id, entry_date: date, memo: null, status: "posted", source: "test", source_ref: null,
    reverses_id: null, created_at: `${date}T00:00:00Z`,
    lines: lines.map((l, i) => ({
      id: `${id}-${i}`, account_id: `${l.acct.name}`, amount_minor: l.amt, currency: "USD",
      side: l.side, memo: null, account: l.acct,
    })),
  };
}
const CASH = acct("1000", "Cash — Checking", "asset");
const SOFTWARE = acct("6100", "Software", "expense");
const TRAVEL = acct("6200", "Travel", "expense");
const SALES = acct("4000", "Sales", "income");

const LEDGER: JournalEntry[] = [
  // Q2 2026 spending
  entry("e1", "2026-04-10", [{ acct: SOFTWARE, amt: 12000, side: "D" }, { acct: CASH, amt: 12000, side: "C" }]),
  entry("e2", "2026-05-20", [{ acct: SOFTWARE, amt: 8000, side: "D" }, { acct: CASH, amt: 8000, side: "C" }]),
  entry("e3", "2026-06-05", [{ acct: TRAVEL, amt: 5000, side: "D" }, { acct: CASH, amt: 5000, side: "C" }]),
  // Q2 income
  entry("e4", "2026-04-15", [{ acct: CASH, amt: 50000, side: "D" }, { acct: SALES, amt: 50000, side: "C" }]),
  // Q1 spending (outside Q2 — must be excluded by the period filter)
  entry("e5", "2026-02-01", [{ acct: SOFTWARE, amt: 99900, side: "D" }, { acct: CASH, amt: 99900, side: "C" }]),
];

describe("routeMessage — intent routing", () => {
  it("classifies greetings", () => {
    expect(routeMessage("hi", NOW).intent).toBe("greeting");
    expect(routeMessage("Hey Penny", NOW).intent).toBe("greeting");
  });
  it("classifies activity narration", () => {
    expect(routeMessage("what have you done?", NOW).intent).toBe("activity");
    expect(routeMessage("catch me up", NOW).intent).toBe("activity");
    expect(routeMessage("anything new?", NOW).intent).toBe("activity");
  });
  it("classifies grounded money questions with metric + period + category", () => {
    const r = routeMessage("how much did I spend on software in Q2?", NOW);
    expect(r.intent).toBe("question");
    expect(r.query?.metric).toBe("spend");
    expect(r.query?.categoryHint?.toLowerCase()).toContain("software");
    expect(r.query?.period.start).toBe("2026-04-01");
    expect(r.query?.period.end).toBe("2026-06-30");
  });
  it("routes income / net / cash metrics", () => {
    expect(routeMessage("how much did I bring in this year?", NOW).query?.metric).toBe("income");
    expect(routeMessage("what's my net income?", NOW).query?.metric).toBe("net");
    expect(routeMessage("how much cash do I have?", NOW).query?.metric).toBe("cash");
  });
});

describe("grounding-scope guard — refuse out of scope, never invent", () => {
  it("declines advice / prediction as unsupported", () => {
    expect(routeMessage("should I pay estimated taxes?", NOW).intent).toBe("unsupported");
    expect(routeMessage("what will my revenue be next quarter?", NOW).intent).toBe("unsupported");
    expect(routeMessage("is a laptop tax deductible?", NOW).intent).toBe("unsupported");
  });
  it("declines off-books chatter as unsupported", () => {
    expect(routeMessage("what's the weather?", NOW).intent).toBe("unsupported");
    expect(routeMessage("tell me a joke", NOW).intent).toBe("unsupported");
    expect(routeMessage("", NOW).intent).toBe("unsupported");
  });
  it("does not force a metric when none is clearly a books question", () => {
    expect(routeMessage("how are you today", NOW).intent).toBe("unsupported");
  });
  it("declines projection/estimate verbs even with a metric (no hollow number)", () => {
    // "project"/"estimate" ask for a forecast, not a ledger fact — declining
    // avoids reporting a computed figure as if the owner asked a factual question.
    expect(routeMessage("project my income for 2027", NOW).intent).toBe("unsupported");
    expect(routeMessage("estimate my software spend next year", NOW).intent).toBe("unsupported");
    expect(routeMessage("how much should I spend on software?", NOW).intent).toBe("unsupported");
  });
  it("declines a wholly future period — no ledger facts exist to report as $0", () => {
    // A retrospective-sounding question over a future window must NOT answer $0 as
    // if it were real; the period starts after today, so decline.
    expect(routeMessage("how much did I bring in in 2027?", NOW).intent).toBe("unsupported");
    expect(routeMessage("how much did I spend in Q1 2030?", NOW).intent).toBe("unsupported");
    // A current/elapsed period still answers.
    expect(routeMessage("how much did I bring in this year?", NOW).intent).toBe("question");
    expect(routeMessage("how much did I spend in Q2 2026?", NOW).intent).toBe("question");
  });
});

describe("computeMetric — ties to the reports, to the cent", () => {
  const q2 = { start: "2026-04-01", end: "2026-06-30" };
  it("total spend equals P&L totalExpense for the period", () => {
    const pnl = profitAndLoss(LEDGER, (d) => d >= q2.start && d <= q2.end);
    const f = computeMetric(LEDGER, { metric: "spend", categoryHint: null, period: q2, periodLabel: "Q2 2026" });
    expect(f.amountMinor).toBe(pnl.totalExpense);
    expect(f.amountMinor).toBe(12000 + 8000 + 5000); // Q1's 99900 excluded
  });
  it("category-scoped spend sums only the matched account", () => {
    const f = computeMetric(LEDGER, { metric: "spend", categoryHint: "software", period: q2, periodLabel: "Q2 2026" });
    expect(f.amountMinor).toBe(12000 + 8000);
    expect(f.categoryUnmatched).toBe(false);
    expect(f.categoryLabel).toBe("Software");
  });
  it("income ties to P&L totalIncome", () => {
    const pnl = profitAndLoss(LEDGER, (d) => d >= q2.start && d <= q2.end);
    const f = computeMetric(LEDGER, { metric: "income", categoryHint: null, period: q2, periodLabel: "Q2 2026" });
    expect(f.amountMinor).toBe(pnl.totalIncome);
  });
  it("net ties to P&L netIncome", () => {
    const pnl = profitAndLoss(LEDGER, (d) => d >= q2.start && d <= q2.end);
    const f = computeMetric(LEDGER, { metric: "net", categoryHint: null, period: q2, periodLabel: "Q2 2026" });
    expect(f.amountMinor).toBe(pnl.netIncome);
  });
  it("cash ties to balance-sheet total assets as of period end", () => {
    const bs = balanceSheet(LEDGER, "2026-06-30");
    const f = computeMetric(LEDGER, { metric: "cash", categoryHint: null, period: { start: null, end: "2026-06-30" }, periodLabel: "Q2 2026" });
    expect(f.amountMinor).toBe(bs.totalAssets);
  });
  it("flags an unknown category as unmatched (decline, not a fake $0)", () => {
    const f = computeMetric(LEDGER, { metric: "spend", categoryHint: "yachts", period: q2, periodLabel: "Q2 2026" });
    expect(f.categoryUnmatched).toBe(true);
    expect(f.amountMinor).toBe(0); // the caller must NOT report this as a real figure
  });
});

describe("resolvePeriod", () => {
  it("resolves quarters, years, and relative periods deterministically", () => {
    expect(resolvePeriod("in Q2 2026", NOW)).toMatchObject({ start: "2026-04-01", end: "2026-06-30" });
    expect(resolvePeriod("in 2025", NOW)).toMatchObject({ start: "2025-01-01", end: "2025-12-31" });
    expect(resolvePeriod("this year", NOW)).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
    expect(resolvePeriod("last month", NOW)).toMatchObject({ start: "2026-06-01", end: "2026-06-30" });
    expect(resolvePeriod("overall", NOW)).toMatchObject({ start: null, end: null, label: "all time" });
  });
});
