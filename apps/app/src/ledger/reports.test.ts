/**
 * Reports tie to the cent. These cases encode hand-computed expected figures for
 * a known seed and assert the derived statements match exactly — the property a
 * CPA relies on. Money is integer minor units throughout (no float rounding).
 */
import { describe, expect, it } from "vitest";
import { accountBalances, balanceSheet, profitAndLoss, trialBalance } from "./reports";
import type { JournalEntry, JournalLine, Side } from "./types";

let seq = 0;
const uid = () => `id-${seq++}`;

// Account registry for the fixtures (code → {id, type, name}).
const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash", type: "asset" as const },
  ar: { id: "a-ar", code: "1100", name: "Accounts Receivable", type: "asset" as const },
  prepaid: { id: "a-prepaid", code: "1200", name: "Prepaid", type: "asset" as const },
  accrued: { id: "a-accrued", code: "2100", name: "Accrued Liabilities", type: "liability" as const },
  capital: { id: "a-capital", code: "3000", name: "Owner's Capital", type: "equity" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
  cogs: { id: "a-cogs", code: "5000", name: "COGS", type: "expense" as const },
  rent: { id: "a-rent", code: "6000", name: "Rent", type: "expense" as const },
};
type Acct = (typeof ACCT)[keyof typeof ACCT];

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(
  date: string,
  lines: JournalLine[],
  opts: Partial<Pick<JournalEntry, "status" | "source" | "reverses_id">> = {},
): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: null, status: opts.status ?? "posted",
    source: opts.source ?? "manual", source_ref: null, reverses_id: opts.reverses_id ?? null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}

// The known seed from the live stress-test (Scenario A), in minor units.
function seedKnown(): JournalEntry[] {
  return [
    entry("2026-03-15", [line(ACCT.cash, "D", 1_000_000), line(ACCT.capital, "C", 1_000_000)]), // $10k capital
    entry("2026-03-15", [line(ACCT.ar, "D", 400_000), line(ACCT.sales, "C", 400_000)]), // $4k credit sale
    entry("2026-03-15", [line(ACCT.cogs, "D", 150_000), line(ACCT.cash, "C", 150_000)]), // $1.5k COGS
    entry("2026-03-15", [line(ACCT.rent, "D", 200_000), line(ACCT.cash, "C", 200_000)]), // $2k rent
    entry("2026-03-15", [line(ACCT.rent, "D", 30_000), line(ACCT.accrued, "C", 30_000)]), // $300 accrual
    entry("2026-03-15", [line(ACCT.prepaid, "D", 60_000), line(ACCT.cash, "C", 60_000)]), // $600 prepaid
    entry("2026-03-15", [line(ACCT.cash, "D", 100_000), line(ACCT.ar, "C", 100_000)]), // $1k AR collection
  ];
}

describe("reports tie to the cent (known seed)", () => {
  const entries = seedKnown();

  it("trial balance: debits == credits", () => {
    const tb = trialBalance(entries);
    expect(tb.totalDebit).toBe(1_430_000);
    expect(tb.totalCredit).toBe(1_430_000);
    expect(tb.balanced).toBe(true);
  });

  it("P&L: income − expense flows to net income", () => {
    const p = profitAndLoss(entries);
    expect(p.totalIncome).toBe(400_000);
    expect(p.totalExpense).toBe(380_000); // COGS 150k + rent 230k
    expect(p.netIncome).toBe(20_000);
  });

  it("balance sheet: assets == liabilities + equity + current earnings", () => {
    const bs = balanceSheet(entries);
    expect(bs.totalAssets).toBe(1_050_000); // cash 690k + AR 300k + prepaid 60k
    expect(bs.totalLiabilities).toBe(30_000);
    expect(bs.totalEquity).toBe(1_000_000);
    expect(bs.currentEarnings).toBe(20_000); // == P&L net income
    expect(bs.totalAssets).toBe(bs.totalLiabilities + bs.totalEquity + bs.currentEarnings);
    expect(bs.balanced).toBe(true);
  });

  it("P&L net income equals balance-sheet current earnings (statements articulate)", () => {
    expect(profitAndLoss(entries).netIncome).toBe(balanceSheet(entries).currentEarnings);
  });
});

describe("reversal nets to zero", () => {
  it("an entry and its reversal leave every report unchanged", () => {
    const base = seedKnown();
    const bad = entry("2026-03-16", [line(ACCT.rent, "D", 99_999), line(ACCT.cash, "C", 99_999)], {
      status: "reversed",
    });
    const rev = entry("2026-03-16", [line(ACCT.rent, "C", 99_999), line(ACCT.cash, "D", 99_999)], {
      source: "reversal", reverses_id: bad.id,
    });
    const withReversal = [...base, bad, rev];
    expect(trialBalance(withReversal).totalDebit).toBe(trialBalance(base).totalDebit);
    expect(profitAndLoss(withReversal).netIncome).toBe(profitAndLoss(base).netIncome);
    expect(balanceSheet(withReversal).totalAssets).toBe(balanceSheet(base).totalAssets);
  });
});

describe("pending_review entries are excluded from the books", () => {
  it("a pending entry contributes nothing to any report", () => {
    const base = seedKnown();
    const pending = entry("2026-03-17", [line(ACCT.cash, "D", 500_000), line(ACCT.sales, "C", 500_000)], {
      status: "pending_review",
    });
    expect(trialBalance([...base, pending]).totalDebit).toBe(trialBalance(base).totalDebit);
    expect(profitAndLoss([...base, pending]).totalIncome).toBe(profitAndLoss(base).totalIncome);
  });
});

describe("edge cases", () => {
  it("empty org: zeros, balanced, no crash", () => {
    const tb = trialBalance([]);
    expect(tb.rows).toEqual([]);
    expect(tb.balanced).toBe(true);
    const bs = balanceSheet([]);
    expect(bs.totalAssets).toBe(0);
    expect(bs.balanced).toBe(true);
    expect(profitAndLoss([]).netIncome).toBe(0);
  });

  it("repeated thirds: integer minor units never drift off-balance", () => {
    // $100.00 split three ways as 3334 / 3333 / 3333 — sums back to 10000.
    const e = entry("2026-03-18", [
      line(ACCT.cash, "D", 10_000),
      line(ACCT.sales, "C", 3_334),
      line(ACCT.sales, "C", 3_333),
      line(ACCT.sales, "C", 3_333),
    ]);
    const tb = trialBalance([e]);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.balanced).toBe(true);
  });

  it("single-sided account (only debits) still nets correctly", () => {
    const e = entry("2026-03-19", [line(ACCT.cash, "D", 12_345), line(ACCT.capital, "C", 12_345)]);
    const cash = accountBalances([e]).find((r) => r.code === "1000");
    expect(cash?.debit).toBe(12_345);
    expect(cash?.credit).toBe(0);
    expect(cash?.net).toBe(12_345);
  });
});
