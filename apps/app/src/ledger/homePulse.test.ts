/**
 * W3.4 Owner Home derivations tie to the same ledger the Reports tab renders.
 *
 * These assert the pulse numbers (cash on hand, needs-you count, this-month vs
 * last-month summary) are exactly what the reports produce over the SAME entries —
 * the "Home can't disagree with Reports" property the card requires. Money is
 * integer minor units throughout; no dates or thresholds are hardcoded in the
 * production derivations (they take an `asOf` and read the ledger).
 */
import { describe, expect, it } from "vitest";
import {
  cashPosition, isCashAccount, monthWindow, monthlySummary, needsYouCount,
} from "./homePulse";
import { balanceSheet, profitAndLoss } from "./reports";
import type { JournalEntry, JournalLine, LedgerAccount, Side } from "./types";

let seq = 0;
const uid = () => `id-${seq++}`;

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash — Checking", type: "asset" as const },
  savings: { id: "a-sav", code: "1010", name: "Savings", type: "asset" as const },
  ar: { id: "a-ar", code: "1100", name: "Accounts Receivable", type: "asset" as const },
  equip: { id: "a-eq", code: "1500", name: "Equipment", type: "asset" as const },
  uncat: { id: "a-uncat", code: "9999", name: "Uncategorized", type: "expense" as const },
  capital: { id: "a-cap", code: "3000", name: "Owner's Capital", type: "equity" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
  rent: { id: "a-rent", code: "6000", name: "Rent", type: "expense" as const },
};
type Acct = (typeof ACCT)[keyof typeof ACCT];

const account = (a: Acct): LedgerAccount => ({
  id: a.id, code: a.code, name: a.name, type: a.type,
  parent_id: null, currency: "USD", is_archived: false,
});
const ACCOUNTS: LedgerAccount[] = Object.values(ACCT).map(account);

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(
  date: string, lines: JournalLine[],
  opts: Partial<Pick<JournalEntry, "status" | "source">> = {},
): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: null, status: opts.status ?? "posted",
    source: opts.source ?? "manual", source_ref: null, reverses_id: null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}

describe("isCashAccount", () => {
  it("matches cash/bank asset accounts by code (10xx) or name", () => {
    expect(isCashAccount(ACCT.cash)).toBe(true);
    expect(isCashAccount(ACCT.savings)).toBe(true);
    expect(isCashAccount({ code: "1250", name: "Petty cash", type: "asset" })).toBe(true);
  });
  it("does not match non-cash assets or non-assets", () => {
    expect(isCashAccount(ACCT.ar)).toBe(false);      // receivable
    expect(isCashAccount(ACCT.equip)).toBe(false);   // fixed asset (code 1500)
    expect(isCashAccount(ACCT.sales)).toBe(false);   // income
  });
});

describe("cashPosition ties to the balance sheet", () => {
  // $10k capital in; $4k credit sale (AR); collect $1k of it; buy $3k equipment cash.
  const entries = [
    entry("2026-06-01", [line(ACCT.cash, "D", 1_000_000), line(ACCT.capital, "C", 1_000_000)]),
    entry("2026-06-02", [line(ACCT.ar, "D", 400_000), line(ACCT.sales, "C", 400_000)]),
    entry("2026-06-03", [line(ACCT.cash, "D", 100_000), line(ACCT.ar, "C", 100_000)]),
    entry("2026-06-04", [line(ACCT.equip, "D", 300_000), line(ACCT.cash, "C", 300_000)]),
  ];
  it("sums only the cash/bank accounts (not AR or equipment)", () => {
    const { cashMinor, fromCashAccounts } = cashPosition(entries, ACCOUNTS);
    // cash = 1,000,000 + 100,000 − 300,000 = 800,000
    expect(cashMinor).toBe(800_000);
    expect(fromCashAccounts).toBe(true);
    // and it is strictly less than total assets (which folds in AR + equipment)
    expect(cashMinor).toBeLessThan(balanceSheet(entries).totalAssets);
  });
  it("falls back to total assets when no recognizable cash account exists", () => {
    // Same books but with no cash-typed account in the registry.
    const noCash = ACCOUNTS.filter((a) => a.id !== ACCT.cash.id && a.id !== ACCT.savings.id);
    const { cashMinor, fromCashAccounts } = cashPosition(entries, noCash);
    expect(fromCashAccounts).toBe(false);
    expect(cashMinor).toBe(balanceSheet(entries).totalAssets);
  });
});

describe("needsYouCount funnels to Review", () => {
  it("counts pending-review entries plus posted-uncategorized transactions", () => {
    const entries = [
      entry("2026-06-01", [line(ACCT.cash, "D", 5000), line(ACCT.sales, "C", 5000)],
        { status: "pending_review" }),
      // posted onto the Uncategorized holding account → needs a decision
      entry("2026-06-02", [line(ACCT.uncat, "D", 2000), line(ACCT.cash, "C", 2000)]),
      // a clean posted entry → not counted
      entry("2026-06-03", [line(ACCT.rent, "D", 1000), line(ACCT.cash, "C", 1000)]),
    ];
    expect(needsYouCount(entries, ACCOUNTS)).toBe(2);
  });
  it("is zero when nothing is pending or uncategorized", () => {
    const entries = [entry("2026-06-03", [line(ACCT.rent, "D", 1000), line(ACCT.cash, "C", 1000)])];
    expect(needsYouCount(entries, ACCOUNTS)).toBe(0);
  });
});

describe("monthlySummary ties to the P&L and compares to last month", () => {
  const asOf = new Date("2026-06-15T12:00:00");
  const { thisMonth, lastMonth } = monthWindow(asOf);
  it("derives the current + previous month keys from asOf (no hardcoded dates)", () => {
    expect(thisMonth).toBe("2026-06");
    expect(lastMonth).toBe("2026-05");
  });
  it("this-month net equals the P&L over this month's entries, and the delta is signed", () => {
    const entries = [
      // May: income 300, expense 100 → net 200
      entry("2026-05-10", [line(ACCT.cash, "D", 30000), line(ACCT.sales, "C", 30000)]),
      entry("2026-05-12", [line(ACCT.rent, "D", 10000), line(ACCT.cash, "C", 10000)]),
      // June: income 500, expense 100 → net 400
      entry("2026-06-05", [line(ACCT.cash, "D", 50000), line(ACCT.sales, "C", 50000)]),
      entry("2026-06-06", [line(ACCT.rent, "D", 10000), line(ACCT.cash, "C", 10000)]),
    ];
    const s = monthlySummary(entries, asOf);
    const junePnl = profitAndLoss(entries, (d) => d.slice(0, 7) === "2026-06");
    expect(s.netMinor).toBe(junePnl.netIncome); // ties to the report
    expect(s.netMinor).toBe(40000);
    expect(s.prevNetMinor).toBe(20000);
    expect(s.deltaMinor).toBe(20000);
    expect(s.direction).toBe("up");
    expect(s.hasThisMonth).toBe(true);
    expect(s.hasPrev).toBe(true);
  });
  it("reports 'down' and no-prev correctly", () => {
    const down = monthlySummary([
      entry("2026-05-10", [line(ACCT.cash, "D", 50000), line(ACCT.sales, "C", 50000)]),
      entry("2026-06-05", [line(ACCT.cash, "D", 10000), line(ACCT.sales, "C", 10000)]),
    ], asOf);
    expect(down.direction).toBe("down");

    const noPrev = monthlySummary([
      entry("2026-06-05", [line(ACCT.cash, "D", 10000), line(ACCT.sales, "C", 10000)]),
    ], asOf);
    expect(noPrev.hasPrev).toBe(false);
    expect(noPrev.hasThisMonth).toBe(true);
  });
  it("is quiet when nothing happened this month", () => {
    const s = monthlySummary([
      entry("2026-05-10", [line(ACCT.cash, "D", 50000), line(ACCT.sales, "C", 50000)]),
    ], asOf);
    expect(s.hasThisMonth).toBe(false);
  });
});
