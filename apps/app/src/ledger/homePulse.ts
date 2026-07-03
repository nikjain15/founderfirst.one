/**
 * Owner Home ("am I okay?") derivations — card W3.4.
 *
 * Pure functions over the SAME ledger entries the Reports tab renders, so Home can
 * never drift from the reports (ARCHITECTURE.md §6.5: reports are derived, not a
 * separate store). No new data source: cash position, the needs-you count, and the
 * plain-English monthly summary all fold out of `journal_entries` + `ledger_accounts`
 * — the very rows `useEntries`/`useAccounts` already page through (RPTTEST-safe).
 *
 * Kept React-free so the tie-out logic is unit-testable in node without a DOM, and
 * so the Home component and any test read the SAME numbers.
 */
import { balanceSheet, profitAndLoss, type BalanceSheet } from "./reports";
import type { JournalEntry, LedgerAccount } from "./types";

// A calendar month key, "YYYY-MM", from an entry date (already local YYYY-MM-DD).
const monthKey = (isoDate: string) => isoDate.slice(0, 7);

/** The current + previous month keys as of a reference date (local). */
export function monthWindow(asOf: Date): { thisMonth: string; lastMonth: string } {
  const y = asOf.getFullYear();
  const m = asOf.getMonth(); // 0-based
  const thisMonth = `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = new Date(y, m - 1, 1);
  const lastMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return { thisMonth, lastMonth };
}

/**
 * Cash position = the net of the org's CASH/BANK asset accounts (debit-normal),
 * NOT total assets (which folds in receivables, fixed assets, etc.). We identify
 * cash accounts by the platform CoA convention: asset accounts whose code starts
 * "10" (1000–1099 cash & bank in the seeded templates) or whose name reads as a
 * bank/cash/checking/savings account. If none match, fall back to total assets so
 * a hand-rolled CoA still shows a sensible headline rather than $0. This reads the
 * same balance-sheet the Reports tab shows — it can't disagree with them.
 */
const CASH_NAME = /\b(cash|bank|checking|chequing|savings|current account|money market)\b/i;
export function isCashAccount(a: Pick<LedgerAccount, "code" | "name" | "type">): boolean {
  if (a.type !== "asset") return false;
  if (a.code && /^10\d/.test(a.code)) return true;
  return CASH_NAME.test(a.name ?? "");
}

export function cashPosition(entries: JournalEntry[], accounts: LedgerAccount[]): {
  cashMinor: number;
  fromCashAccounts: boolean;
  bs: BalanceSheet;
} {
  const bs = balanceSheet(entries);
  const cashIds = new Set(accounts.filter(isCashAccount).map((a) => a.id));
  // Sum only balance-sheet asset lines that belong to a cash account.
  const cashLines = bs.assets.filter((l) => cashIds.has(l.account_id));
  if (cashLines.length > 0) {
    return { cashMinor: cashLines.reduce((s, l) => s + l.amount, 0), fromCashAccounts: true, bs };
  }
  // No recognizable cash account → headline the total assets (best available).
  return { cashMinor: bs.totalAssets, fromCashAccounts: false, bs };
}

export interface MonthlySummary {
  thisMonth: string;             // "YYYY-MM"
  incomeMinor: number;           // this month's income
  expenseMinor: number;          // this month's expense
  netMinor: number;              // income − expense
  prevNetMinor: number;          // last month's net (for the comparative)
  deltaMinor: number;            // net − prevNet
  direction: "up" | "down" | "flat";
  hasThisMonth: boolean;         // any activity this month at all
  hasPrev: boolean;              // any activity last month (else no comparison)
}

/**
 * This-month P&L with a comparison to last month — the input to the plain-English
 * "how did the month go" summary (theme #8). Derived from the same entries the
 * P&L report uses, filtered by calendar month, so it ties to Reports to the cent.
 */
export function monthlySummary(entries: JournalEntry[], asOf: Date): MonthlySummary {
  const { thisMonth, lastMonth } = monthWindow(asOf);
  const cur = profitAndLoss(entries, (d) => monthKey(d) === thisMonth);
  const prev = profitAndLoss(entries, (d) => monthKey(d) === lastMonth);
  const netMinor = cur.netIncome;
  const prevNetMinor = prev.netIncome;
  const deltaMinor = netMinor - prevNetMinor;
  const hasThisMonth = cur.totalIncome !== 0 || cur.totalExpense !== 0;
  const hasPrev = prev.totalIncome !== 0 || prev.totalExpense !== 0;
  const direction: MonthlySummary["direction"] =
    deltaMinor > 0 ? "up" : deltaMinor < 0 ? "down" : "flat";
  return {
    thisMonth,
    incomeMinor: cur.totalIncome,
    expenseMinor: cur.totalExpense,
    netMinor,
    prevNetMinor,
    deltaMinor,
    direction,
    hasThisMonth,
    hasPrev,
  };
}

/**
 * The "needs you" count — how many things funnel to the owner's Review queue
 * (APP_PRINCIPLES §2). Today that is entries awaiting the owner's approval
 * (`pending_review`) plus posted transactions still sitting on the Uncategorized
 * holding account (code 9999 / "Uncategorized"). Both are derived from the ledger
 * the owner already loaded — no extra fetch, and it matches what the Review tab
 * actually shows.
 */
export function needsYouCount(entries: JournalEntry[], accounts: LedgerAccount[]): number {
  const pending = entries.filter((e) => e.status === "pending_review").length;
  const uncat = accounts.find(
    (a) => a.code === "9999" || a.name.toLowerCase() === "uncategorized",
  );
  const uncategorized = uncat
    ? entries.filter(
        (e) =>
          e.status === "posted" &&
          e.source !== "reversal" &&
          (e.lines ?? []).some((l) => l.account_id === uncat.id),
      ).length
    : 0;
  return pending + uncategorized;
}
