/**
 * PENNY-UX F8 — the Overview "no activity" takeaway must agree with the
 * "Latest activity" panel beneath it.
 *
 * Regression: `hasActivity` used to derive from P&L income/expense only, so a
 * balance-sheet-only book (opening balance, transfer between accounts — zero
 * income, zero expense) claimed "No activity yet" while the panel listed its
 * posted entries. The derivation now counts entries, exactly like the panel.
 */
import { describe, expect, it } from "vitest";
import { hasLedgerActivity } from "./overview";
import { profitAndLoss } from "./reports";
import type { JournalEntry, JournalLine, Side } from "./types";

let seq = 0;
const uid = () => `id-${seq++}`;

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash — Checking", type: "asset" as const },
  savings: { id: "a-sav", code: "1010", name: "Savings", type: "asset" as const },
  capital: { id: "a-cap", code: "3000", name: "Owner's Capital", type: "equity" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
};
type Acct = (typeof ACCT)[keyof typeof ACCT];

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}

function entry(entry_date: string, lines: JournalLine[], status: JournalEntry["status"] = "posted"): JournalEntry {
  return {
    id: uid(), entry_date, memo: null, status, source: "manual", source_ref: null,
    reverses_id: null, created_at: `${entry_date}T00:00:00Z`, lines,
  };
}

describe("hasLedgerActivity (F8)", () => {
  it("an empty book has no activity — the takeaway may say so", () => {
    expect(hasLedgerActivity([])).toBe(false);
  });

  it("a balance-sheet-only book (opening balance + transfer) IS activity, even though the P&L is empty", () => {
    const entries = [
      // Opening balance: cash funded by owner's capital — no income, no expense.
      entry("2026-01-01", [line(ACCT.cash, "D", 500_000), line(ACCT.capital, "C", 500_000)]),
      // Transfer between two balance-sheet accounts.
      entry("2026-01-15", [line(ACCT.savings, "D", 100_000), line(ACCT.cash, "C", 100_000)]),
    ];
    // The old derivation's inputs really are zero for this book…
    const pnl = profitAndLoss(entries);
    expect(pnl.totalIncome).toBe(0);
    expect(pnl.totalExpense).toBe(0);
    // …but the Latest-activity panel lists these entries, so the takeaway must
    // NOT claim "no activity" (the F8 dishonesty).
    expect(hasLedgerActivity(entries)).toBe(true);
  });

  it("a book with P&L activity still reads as active (no regression on the common path)", () => {
    const entries = [
      entry("2026-02-01", [line(ACCT.cash, "D", 25_000), line(ACCT.sales, "C", 25_000)]),
    ];
    expect(hasLedgerActivity(entries)).toBe(true);
  });
});
