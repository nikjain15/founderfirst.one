/**
 * Cash-flow statement (GAAP indirect, card W4.2) ties to the cent.
 *
 * The load-bearing property: the statement's net change in cash equals the
 * balance-sheet cash delta over the same period, AND net income + working-capital
 * changes reconcile to operating cash. These are hand-computed against a known
 * seed so a regression can never silently break the tie.
 */
import { describe, expect, it } from "vitest";
import { balanceSheet, cashFlow, profitAndLoss } from "./reports";
import type { JournalEntry, JournalLine, Side } from "./types";

let seq = 0;
const uid = () => `cf-${seq++}`;

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash", type: "asset" as const },
  checking: { id: "a-chk", code: "1010", name: "Business Checking", type: "asset" as const },
  ar: { id: "a-ar", code: "1100", name: "Accounts Receivable", type: "asset" as const },
  prepaid: { id: "a-prepaid", code: "1200", name: "Prepaid Insurance", type: "asset" as const },
  equipment: { id: "a-equip", code: "1500", name: "Equipment", type: "asset" as const },
  ap: { id: "a-ap", code: "2000", name: "Accounts Payable", type: "liability" as const },
  accrued: { id: "a-accr", code: "2100", name: "Accrued Liabilities", type: "liability" as const },
  loan: { id: "a-loan", code: "2500", name: "Bank Loan Payable", type: "liability" as const },
  capital: { id: "a-cap", code: "3000", name: "Owner's Capital", type: "equity" as const },
  draw: { id: "a-draw", code: "3100", name: "Owner's Draw", type: "equity" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
  cogs: { id: "a-cogs", code: "5000", name: "COGS", type: "expense" as const },
  rent: { id: "a-rent", code: "6000", name: "Rent", type: "expense" as const },
  deprec: { id: "a-dep", code: "6900", name: "Depreciation Expense", type: "expense" as const },
  accumDep: { id: "a-adep", code: "1590", name: "Accumulated Depreciation", type: "asset" as const },
};
type Acct = (typeof ACCT)[keyof typeof ACCT];

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(
  date: string, lines: JournalLine[],
  opts: Partial<Pick<JournalEntry, "status" | "source" | "reverses_id">> = {},
): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: null, status: opts.status ?? "posted",
    source: opts.source ?? "manual", source_ref: null, reverses_id: opts.reverses_id ?? null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}

// A rich single-period seed exercising all three sections + non-cash adjustments.
function seed(): JournalEntry[] {
  return [
    entry("2026-01-05", [line(ACCT.cash, "D", 1_000_000), line(ACCT.capital, "C", 1_000_000)]), // $10k capital (financing)
    entry("2026-01-06", [line(ACCT.cash, "D", 500_000), line(ACCT.loan, "C", 500_000)], {}), // $5k loan draw (financing)
    entry("2026-01-10", [line(ACCT.equipment, "D", 300_000), line(ACCT.cash, "C", 300_000)]), // $3k equipment (investing)
    entry("2026-01-15", [line(ACCT.ar, "D", 400_000), line(ACCT.sales, "C", 400_000)]), // $4k credit sale (op)
    entry("2026-01-16", [line(ACCT.cash, "D", 250_000), line(ACCT.sales, "C", 250_000)]), // $2.5k cash sale (op)
    entry("2026-01-18", [line(ACCT.cogs, "D", 150_000), line(ACCT.ap, "C", 150_000)]), // $1.5k COGS on account (op)
    entry("2026-01-20", [line(ACCT.rent, "D", 200_000), line(ACCT.cash, "C", 200_000)]), // $2k rent cash (op)
    entry("2026-01-22", [line(ACCT.prepaid, "D", 60_000), line(ACCT.cash, "C", 60_000)]), // $600 prepaid (op WC)
    entry("2026-01-25", [line(ACCT.cash, "D", 100_000), line(ACCT.ar, "C", 100_000)]), // $1k AR collection (op WC)
    entry("2026-01-28", [line(ACCT.deprec, "D", 50_000), line(ACCT.accumDep, "C", 50_000)]), // $500 depreciation (non-cash)
    entry("2026-01-30", [line(ACCT.draw, "D", 120_000), line(ACCT.cash, "C", 120_000)]), // $1.2k owner draw (financing)
  ];
}

describe("cash-flow ties to the balance-sheet cash delta (single period)", () => {
  const entries = seed();
  const scope = { start: "2026-01-01", end: "2026-01-31" };

  it("net change in cash equals the BS cash delta to the cent", () => {
    const cf = cashFlow(entries, scope);
    // Cash accounts move: +1,000,000 +500,000 −300,000 +250,000 −200,000 −60,000 +100,000 −120,000
    const expectedDelta = 1_170_000;
    expect(cf.bsCashDelta).toBe(expectedDelta);
    expect(cf.netChange).toBe(expectedDelta);
    expect(cf.ties).toBe(true);
  });

  it("net change equals BS cash delta computed independently", () => {
    const cf = cashFlow(entries, scope);
    // Independent BS check: cash + checking + accumDep net (all asset), minus the
    // non-cash assets — but simplest independent tie is via balanceSheet as-of end
    // minus as-of before start. Here all activity is in-period so start-1 is 0.
    const bsEnd = balanceSheet(entries, "2026-01-31");
    const cashEnd = bsEnd.assets
      .filter((a) => a.code === "1000" || a.code === "1010")
      .reduce((s, a) => s + a.amount, 0);
    expect(cf.netChange).toBe(cashEnd - 0);
  });

  it("net income leads operating and matches the P&L", () => {
    const cf = cashFlow(entries, scope);
    const p = profitAndLoss(entries, (d) => d >= scope.start && d <= scope.end);
    expect(cf.netIncome).toBe(p.netIncome);
    // income 650k − (cogs 150k + rent 200k + deprec 50k) = 250k
    expect(cf.netIncome).toBe(250_000);
  });

  it("depreciation is added back as a non-cash operating adjustment", () => {
    const cf = cashFlow(entries, scope);
    const dep = cf.operatingAdjustments.find((l) => l.code === "1590");
    expect(dep?.amount).toBe(50_000); // accumDep credit delta → +cash effect
  });

  it("equipment purchase lands in investing", () => {
    const cf = cashFlow(entries, scope);
    expect(cf.investingTotal).toBe(-300_000);
    expect(cf.investing.some((l) => l.code === "1500" && l.amount === -300_000)).toBe(true);
  });

  it("loan draw + capital + draw land in financing", () => {
    const cf = cashFlow(entries, scope);
    // +1,000,000 capital +500,000 loan −120,000 draw = 1,380,000
    expect(cf.financingTotal).toBe(1_380_000);
  });

  it("the three sections sum to the net change", () => {
    const cf = cashFlow(entries, scope);
    expect(cf.operating + cf.investingTotal + cf.financingTotal).toBe(cf.netChange);
  });
});

describe("beginning + ending cash across two periods", () => {
  const entries = seed();
  // Add a Feb entry so Jan's ending cash becomes Feb's beginning cash.
  entries.push(entry("2026-02-05", [line(ACCT.cash, "D", 90_000), line(ACCT.sales, "C", 90_000)]));

  it("Feb beginning cash equals Jan ending cash", () => {
    const jan = cashFlow(entries, { start: "2026-01-01", end: "2026-01-31" });
    const feb = cashFlow(entries, { start: "2026-02-01", end: "2026-02-28" });
    expect(feb.beginningCash).toBe(jan.endingCash);
    expect(jan.beginningCash).toBe(0);
  });

  it("Feb net change ties and ending = beginning + change", () => {
    const feb = cashFlow(entries, { start: "2026-02-01", end: "2026-02-28" });
    expect(feb.netChange).toBe(90_000);
    expect(feb.ties).toBe(true);
    expect(feb.endingCash).toBe(feb.beginningCash + feb.netChange);
  });
});

describe("reversal + pending discipline (mirrors reports.test.ts)", () => {
  const scope = { start: "2026-01-01", end: "2026-03-31" };

  it("an entry and its reversal leave the statement unchanged", () => {
    const base = seed();
    const bad = entry("2026-02-10", [line(ACCT.rent, "D", 99_999), line(ACCT.cash, "C", 99_999)], {
      status: "reversed",
    });
    const rev = entry("2026-02-10", [line(ACCT.rent, "C", 99_999), line(ACCT.cash, "D", 99_999)], {
      source: "reversal", reverses_id: bad.id,
    });
    expect(cashFlow([...base, bad, rev], scope).netChange).toBe(cashFlow(base, scope).netChange);
    expect(cashFlow([...base, bad, rev], scope).ties).toBe(true);
  });

  it("pending_review entries contribute nothing", () => {
    const base = seed();
    const pending = entry("2026-02-12", [line(ACCT.cash, "D", 500_000), line(ACCT.sales, "C", 500_000)], {
      status: "pending_review",
    });
    expect(cashFlow([...base, pending], scope).netChange).toBe(cashFlow(base, scope).netChange);
  });
});

describe("edge cases", () => {
  it("empty org: zeros, ties, no crash", () => {
    const cf = cashFlow([]);
    expect(cf.netChange).toBe(0);
    expect(cf.bsCashDelta).toBe(0);
    expect(cf.ties).toBe(true);
    expect(cf.beginningCash).toBe(0);
    expect(cf.endingCash).toBe(0);
  });

  it("all-time (no scope) ties across every account", () => {
    const cf = cashFlow(seed());
    expect(cf.ties).toBe(true);
  });
});
