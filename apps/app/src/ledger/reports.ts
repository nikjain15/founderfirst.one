/**
 * Reports are DERIVED from the ledger, not stored as truth (ARCHITECTURE.md §6.5).
 * Pure functions over journal entries + lines.
 *
 * Posting convention: a 'reversed' entry's lines stay in the books and are offset
 * by its reversal entry (both net to zero), so reports include posted + reversed
 * and exclude only 'pending_review' (not yet in the books). All amounts are
 * integer minor units.
 */
import type { AccountType, JournalEntry } from "./types";

export interface AccountBalance {
  account_id: string;
  code: string | null;
  name: string;
  type: AccountType;
  debit: number; // Σ debit minor units
  credit: number; // Σ credit minor units
  net: number; // debit − credit (debit-positive)
}

const inBooks = (e: JournalEntry) => e.status !== "pending_review";

/** Net each account's debits/credits across entries matching `dateFilter`. */
export function accountBalances(
  entries: JournalEntry[],
  dateFilter?: (entryDate: string) => boolean,
): AccountBalance[] {
  const map = new Map<string, AccountBalance>();
  for (const e of entries) {
    if (!inBooks(e)) continue;
    if (dateFilter && !dateFilter(e.entry_date)) continue;
    for (const l of e.lines ?? []) {
      const cur = map.get(l.account_id) ?? {
        account_id: l.account_id,
        code: l.account?.code ?? null,
        name: l.account?.name ?? "—",
        type: (l.account?.type ?? "asset") as AccountType,
        debit: 0,
        credit: 0,
        net: 0,
      };
      if (l.side === "D") cur.debit += l.amount_minor;
      else cur.credit += l.amount_minor;
      cur.net = cur.debit - cur.credit;
      map.set(l.account_id, cur);
    }
  }
  return [...map.values()].sort(
    (a, b) => a.type.localeCompare(b.type) || (a.code ?? "").localeCompare(b.code ?? ""),
  );
}

export interface TrialBalance {
  rows: AccountBalance[];
  totalDebit: number; // Σ positive nets
  totalCredit: number; // Σ negative nets (abs)
  balanced: boolean;
}

/** Trial balance: each account's net placed in its debit/credit column. */
export function trialBalance(entries: JournalEntry[]): TrialBalance {
  const rows = accountBalances(entries).filter((r) => r.net !== 0);
  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of rows) {
    if (r.net >= 0) totalDebit += r.net;
    else totalCredit += -r.net;
  }
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export interface PnlLine { account_id: string; code: string | null; name: string; amount: number; }
export interface ProfitAndLoss {
  income: PnlLine[];
  expense: PnlLine[];
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
}

/** P&L over an optional date range. Income is credit-normal, expense debit-normal. */
export function profitAndLoss(
  entries: JournalEntry[],
  dateFilter?: (entryDate: string) => boolean,
): ProfitAndLoss {
  const balances = accountBalances(entries, dateFilter);
  const income: PnlLine[] = [];
  const expense: PnlLine[] = [];
  let totalIncome = 0;
  let totalExpense = 0;
  for (const b of balances) {
    if (b.type === "income") {
      const amount = b.credit - b.debit; // credit-normal
      if (amount !== 0) income.push({ account_id: b.account_id, code: b.code, name: b.name, amount });
      totalIncome += amount;
    } else if (b.type === "expense") {
      const amount = b.debit - b.credit; // debit-normal
      if (amount !== 0) expense.push({ account_id: b.account_id, code: b.code, name: b.name, amount });
      totalExpense += amount;
    }
  }
  return { income, expense, totalIncome, totalExpense, netIncome: totalIncome - totalExpense };
}

// ── General ledger detail ─────────────────────────────────────────────────────
export interface GlRow {
  account_id: string;
  account: string; // "code · name" (or name)
  entry_date: string;
  memo: string;
  debit: number; // minor units (0 if this line is a credit)
  credit: number; // minor units (0 if this line is a debit)
  balance: number; // running debit-positive balance within the account
}

/**
 * Full entry/line dump with a per-account running balance (debit-positive).
 * Excludes 'pending_review' (not in the books), like every other report; rows are
 * ordered by account, then date, then creation so the running balance is
 * deterministic. Optional inclusive date filter for period scoping. This is the
 * single source the on-screen GL and the GL export both render (they can't drift).
 */
export function generalLedger(
  entries: JournalEntry[],
  dateFilter?: (entryDate: string) => boolean,
): GlRow[] {
  interface Flat {
    account_id: string; account: string; entry_date: string; created: string;
    memo: string; side: "D" | "C"; amount: number;
  }
  const flat: Flat[] = [];
  for (const e of entries) {
    if (!inBooks(e)) continue;
    if (dateFilter && !dateFilter(e.entry_date)) continue;
    for (const l of e.lines ?? []) {
      const code = l.account?.code;
      flat.push({
        account_id: l.account_id,
        account: code ? `${code} · ${l.account?.name ?? "—"}` : (l.account?.name ?? "—"),
        entry_date: e.entry_date,
        created: e.created_at,
        memo: l.memo ?? e.memo ?? "",
        side: l.side,
        amount: l.amount_minor,
      });
    }
  }
  flat.sort(
    (a, b) =>
      a.account.localeCompare(b.account) ||
      a.entry_date.localeCompare(b.entry_date) ||
      a.created.localeCompare(b.created),
  );
  const rows: GlRow[] = [];
  let curAccount: string | null = null;
  let balance = 0;
  for (const r of flat) {
    if (r.account_id !== curAccount) { curAccount = r.account_id; balance = 0; }
    balance += r.side === "D" ? r.amount : -r.amount;
    rows.push({
      account_id: r.account_id,
      account: r.account,
      entry_date: r.entry_date,
      memo: r.memo,
      debit: r.side === "D" ? r.amount : 0,
      credit: r.side === "C" ? r.amount : 0,
      balance,
    });
  }
  return rows;
}

export interface BalanceSheetLine { account_id: string; code: string | null; name: string; amount: number; }
export interface BalanceSheet {
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  currentEarnings: number; // income − expense, folded into equity
  balanced: boolean; // assets == liabilities + equity + currentEarnings
}

/** Balance sheet as of `asOf` (inclusive). Assets debit-normal; L/E credit-normal. */
export function balanceSheet(entries: JournalEntry[], asOf?: string): BalanceSheet {
  const filter = asOf ? (d: string) => d <= asOf : undefined;
  const balances = accountBalances(entries, filter);
  const assets: BalanceSheetLine[] = [];
  const liabilities: BalanceSheetLine[] = [];
  const equity: BalanceSheetLine[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let income = 0;
  let expense = 0;
  for (const b of balances) {
    const line = { account_id: b.account_id, code: b.code, name: b.name, amount: 0 };
    if (b.type === "asset") {
      line.amount = b.debit - b.credit;
      if (line.amount !== 0) assets.push(line);
      totalAssets += line.amount;
    } else if (b.type === "liability") {
      line.amount = b.credit - b.debit;
      if (line.amount !== 0) liabilities.push(line);
      totalLiabilities += line.amount;
    } else if (b.type === "equity") {
      line.amount = b.credit - b.debit;
      if (line.amount !== 0) equity.push(line);
      totalEquity += line.amount;
    } else if (b.type === "income") {
      income += b.credit - b.debit;
    } else if (b.type === "expense") {
      expense += b.debit - b.credit;
    }
  }
  const currentEarnings = income - expense;
  const balanced = totalAssets === totalLiabilities + totalEquity + currentEarnings;
  return {
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity, currentEarnings, balanced,
  };
}
