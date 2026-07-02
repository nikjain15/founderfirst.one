/**
 * REG-1 regression scenario — RPTTEST 1000-row report truncation.
 *
 * Finding (docs/stress/SCENARIOS.md → RPTTEST): PostgREST caps a single response at
 * max_rows (1000 on prod). Reports are derived from the FULL entry list, so a one-shot
 * select silently dropped the OLDEST rows (opening balances / capital injections) for
 * any org past 1000 entries — and because every entry is internally balanced, the
 * truncated reports still tied to the cent, just to the WRONG number. useEntries() was
 * fixed to page through every entry (api.ts ENTRY_PAGE loop).
 *
 * This scenario guards the property the fix protects: the reports must reflect ALL
 * entries. It builds >1000 entries where the single oldest entry is a large opening
 * capital injection, and asserts the report totals INCLUDE it — i.e. a report computed
 * over a truncated (first-1000-only) list would be provably wrong, and the full list is
 * right. It fails loudly if a future change ever reintroduces a per-page cap in the
 * report inputs.
 */
import { describe, expect, it } from "vitest";
import { balanceSheet, profitAndLoss, trialBalance } from "./reports";
import type { JournalEntry, JournalLine, Side } from "./types";

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash", type: "asset" as const },
  capital: { id: "a-capital", code: "3000", name: "Owner's Capital", type: "equity" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
};
type Acct = (typeof ACCT)[keyof typeof ACCT];

let seq = 0;
function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: `l-${seq++}`, account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(date: string, lines: JournalLine[]): JournalEntry {
  return {
    id: `e-${seq++}`, entry_date: date, memo: null, status: "posted",
    source: "manual", source_ref: null, reverses_id: null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}

const PAGE = 1000;
const OPENING_CAPITAL = 5_000_000; // $50k — the row truncation would drop (oldest)

/** The single oldest entry is a big capital injection; then PAGE small sales entries. */
function largeLedger(): JournalEntry[] {
  const entries: JournalEntry[] = [];
  // oldest: opening capital (this is the row a first-page-only fetch drops)
  entries.push(
    entry("2020-01-01", [line(ACCT.cash, "D", OPENING_CAPITAL), line(ACCT.capital, "C", OPENING_CAPITAL)]),
  );
  // PAGE more recent, tiny sales entries — pushes the ledger past one page
  for (let i = 0; i < PAGE + 50; i++) {
    entries.push(entry("2026-01-01", [line(ACCT.cash, "D", 100), line(ACCT.sales, "C", 100)]));
  }
  return entries;
}

describe("RPTTEST: reports must include every entry, not just the first page", () => {
  const all = largeLedger();

  it("the ledger exceeds one PostgREST page", () => {
    expect(all.length).toBeGreaterThan(PAGE);
  });

  it("balance sheet includes the oldest opening-capital entry (not truncated away)", () => {
    const bs = balanceSheet(all);
    // equity must contain the full opening capital; a truncated list would miss it.
    expect(bs.totalEquity).toBe(OPENING_CAPITAL);
    // cash = opening capital + every tiny sale
    expect(bs.totalAssets).toBe(OPENING_CAPITAL + (PAGE + 50) * 100);
    expect(bs.balanced).toBe(true);
  });

  it("a first-page-only (truncated) view would give the WRONG, still-balanced total", () => {
    // Simulate the pre-fix bug: keep only the newest PAGE entries (oldest dropped).
    const newestFirst = [...all].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    const truncated = newestFirst.slice(0, PAGE);
    const truncatedBs = balanceSheet(truncated);
    // still ties to the cent (the trap) …
    expect(truncatedBs.balanced).toBe(true);
    // … but to the WRONG number — the opening capital is gone.
    expect(truncatedBs.totalEquity).toBe(0);
    expect(truncatedBs.totalEquity).not.toBe(balanceSheet(all).totalEquity);
  });

  it("trial balance over the full list still balances at scale", () => {
    const tb = trialBalance(all);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it("P&L income counts every sale on the later pages", () => {
    expect(profitAndLoss(all).totalIncome).toBe((PAGE + 50) * 100);
  });
});
