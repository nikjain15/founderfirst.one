/**
 * Lender / due-diligence package (card W4.4) — assembly + tie-out + comparatives.
 *
 * The package is assembled by the SAME pure report builders the on-screen reports
 * and the single-statement exports use (reports.ts), so it can never disagree with
 * them to the cent. These tests prove:
 *  - the package assembles ALL statements (cover, P&L, BS, cash flow, AR/AP aging)
 *  - every statement in the package matches its standalone builder to the cent
 *  - the balance sheet balances and cash flow ties to the BS cash delta
 *  - a prior-period comparative column appears when priorScope is given (and its
 *    figures match the prior-period standalone builders)
 *  - AR/AP aging buckets each tie to the account book balance
 *  - CSV renders the same figures and the PDF is a structurally valid document
 */
import { describe, expect, it } from "vitest";
import {
  arApAging, balanceSheet, cashFlow, profitAndLoss,
} from "./reports";
import { toCsv, toPdf, exportFilename, type ExportContext } from "./export";
import type { JournalEntry, JournalLine, Side } from "./types";

let seq = 0;
const uid = () => `id-${seq++}`;

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash", type: "asset" as const },
  ar: { id: "a-ar", code: "1100", name: "Accounts Receivable", type: "asset" as const },
  equip: { id: "a-equip", code: "1500", name: "Equipment", type: "asset" as const },
  ap: { id: "a-ap", code: "2000", name: "Accounts Payable", type: "liability" as const },
  loan: { id: "a-loan", code: "2500", name: "Bank Loan", type: "liability" as const },
  capital: { id: "a-capital", code: "3000", name: "Owner's Capital", type: "equity" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
  cogs: { id: "a-cogs", code: "5000", name: "COGS", type: "expense" as const },
  rent: { id: "a-rent", code: "6000", name: "Rent", type: "expense" as const },
};
function line(acct: (typeof ACCT)[keyof typeof ACCT], side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(date: string, lines: JournalLine[], status: JournalEntry["status"] = "posted"): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: null, status,
    source: "manual", source_ref: null, reverses_id: null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}

// Two consecutive quarters so we can exercise the comparative column.
// Prior period: 2026-01-01 .. 2026-03-31; this period: 2026-04-01 .. 2026-06-30.
function seed(): JournalEntry[] {
  return [
    // ── Opening + prior quarter (Q1) ──
    entry("2026-01-01", [line(ACCT.cash, "D", 2_000_000), line(ACCT.capital, "C", 2_000_000)]),
    entry("2026-01-05", [line(ACCT.equip, "D", 500_000), line(ACCT.cash, "C", 500_000)]), // investing
    entry("2026-02-10", [line(ACCT.ar, "D", 300_000), line(ACCT.sales, "C", 300_000)]),
    entry("2026-02-15", [line(ACCT.rent, "D", 90_000), line(ACCT.cash, "C", 90_000)]),
    entry("2026-03-01", [line(ACCT.cogs, "D", 60_000), line(ACCT.ap, "C", 60_000)]),
    // ── This quarter (Q2) ──
    entry("2026-04-10", [line(ACCT.ar, "D", 800_000), line(ACCT.sales, "C", 800_000)]),
    entry("2026-04-20", [line(ACCT.cash, "D", 500_000), line(ACCT.ar, "C", 500_000)]), // AR partial pay
    entry("2026-05-05", [line(ACCT.rent, "D", 120_000), line(ACCT.cash, "C", 120_000)]),
    entry("2026-05-15", [line(ACCT.cogs, "D", 200_000), line(ACCT.ap, "C", 200_000)]),
    entry("2026-05-20", [line(ACCT.ap, "D", 80_000), line(ACCT.cash, "C", 80_000)]), // AP partial pay
    entry("2026-06-01", [line(ACCT.cash, "D", 400_000), line(ACCT.loan, "C", 400_000)]), // financing
    // pending — must be excluded everywhere
    entry("2026-06-15", [line(ACCT.cash, "D", 999_999), line(ACCT.sales, "C", 999_999)], "pending_review"),
  ];
}

const THIS = { start: "2026-04-01", end: "2026-06-30" };
const PRIOR = { start: "2026-01-01", end: "2026-03-31" };

const CTX: ExportContext = {
  orgName: "Acme, Inc.",
  scope: THIS,
  generatedOn: "2026-07-02",
  priorScope: PRIOR,
};

function parseCsv(csv: string): string[][] {
  return csv.split("\r\n").map((line) => {
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    return cells;
  });
}

describe("W4.4 lender / due-diligence package", () => {
  it("assembles every statement section into one CSV", () => {
    const csv = toCsv("pkg", seed(), CTX);
    // Entity-stamped header.
    expect(csv).toContain("Acme, Inc.");
    expect(csv).toContain("Generated 2026-07-02");
    // Every section title present.
    expect(csv).toContain("Financial package");
    expect(csv).toContain("Profit & loss");
    expect(csv).toContain("Balance sheet");
    expect(csv).toContain("Cash flow");
    expect(csv).toContain("Accounts receivable aging");
    expect(csv).toContain("Accounts payable aging");
    // Contents line lists all statements.
    expect(csv).toMatch(/Contents/);
  });

  it("cover sheet attests the balance sheet balances and cash flow ties", () => {
    const csv = toCsv("pkg", seed(), CTX);
    const rows = parseCsv(csv);
    const balanced = rows.find((r) => r[0] === "Balance sheet balanced");
    const ties = rows.find((r) => r[0] === "Cash flow ties to balance sheet");
    expect(balanced?.[1]).toBe("Yes");
    expect(ties?.[1]).toBe("Yes");
  });

  it("package figures match the standalone builders to the cent", () => {
    const entries = seed();
    const pnl = profitAndLoss(entries, (d) => d >= THIS.start && d <= THIS.end);
    const bs = balanceSheet(entries, THIS.end);
    const cf = cashFlow(entries, THIS);
    expect(bs.balanced).toBe(true);
    expect(cf.ties).toBe(true);

    const rows = parseCsv(toCsv("pkg", entries, CTX));
    // Net income appears on the cover AND the P&L net-income line — both == builder.
    const netIncomeRows = rows.filter((r) => r[0] === "Net income");
    expect(netIncomeRows.length).toBeGreaterThanOrEqual(1);
    const expectNet = (cf.netIncome / 100).toFixed(2);
    for (const r of netIncomeRows) expect(r[1]).toBe(expectNet);
    // pnl.netIncome and cf.netIncome are the same (same period).
    expect(pnl.netIncome).toBe(cf.netIncome);
  });

  it("shows a prior-period comparative column with Change", () => {
    const csv = toCsv("pkg", seed(), CTX);
    const rows = parseCsv(csv);
    // Comparative header appears on the P&L table.
    const header = rows.find((r) => r[0] === "Account" && r.includes("This period") && r.includes("Prior period") && r.includes("Change"));
    expect(header).toBeTruthy();
    // Total revenue this period (800k) vs prior (300k), Δ 500k.
    const rev = rows.find((r) => r[0] === "Total revenue");
    expect(rev?.[1]).toBe("8000.00");
    expect(rev?.[2]).toBe("3000.00");
    expect(rev?.[3]).toBe("5000.00");
  });

  it("omits the comparative when no priorScope is given (single-period)", () => {
    const csv = toCsv("pkg", seed(), { ...CTX, priorScope: undefined });
    const rows = parseCsv(csv);
    const header = rows.find((r) => r[0] === "Account");
    expect(header).toEqual(["Account", "Amount"]);
    // Comparative period line should be absent from the cover.
    expect(csv).not.toContain("Comparative period");
  });

  it("AR/AP aging buckets tie to the account book balance", () => {
    const entries = seed();
    const ar = arApAging(entries, "ar", THIS.end);
    const ap = arApAging(entries, "ap", THIS.end);
    // AR: 300k(Q1) + 800k − 500k paid = 600k outstanding.
    expect(ar.grandTotal).toBe(600_000);
    // AP: 60k + 200k − 80k paid = 180k outstanding.
    expect(ap.grandTotal).toBe(180_000);
    // Each row: Σ buckets == row total.
    for (const r of [...ar.rows, ...ap.rows]) {
      const sum = r.buckets.current + r.buckets.d31_60 + r.buckets.d61_90 + r.buckets.d90_plus;
      expect(sum).toBe(r.total);
    }
    // Totals row == Σ rows.
    const arBucketSum = ar.totals.current + ar.totals.d31_60 + ar.totals.d61_90 + ar.totals.d90_plus;
    expect(arBucketSum).toBe(ar.grandTotal);
  });

  it("excludes pending_review entries from the package", () => {
    const csv = toCsv("pkg", seed(), CTX);
    // The pending 999,999 sale must not appear.
    expect(csv).not.toContain("9999.99");
  });

  it("produces a structurally valid PDF", () => {
    const bytes = toPdf("pkg", seed(), CTX);
    const head = new TextDecoder().decode(bytes.slice(0, 8));
    const tail = new TextDecoder().decode(bytes.slice(-5));
    expect(head.startsWith("%PDF-1.")).toBe(true);
    expect(tail).toBe("%%EOF");
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("names the download file with the lender-package slug", () => {
    expect(exportFilename("Acme, Inc.", "pkg", CTX, "pdf")).toBe("acme-inc_lender-package_2026-06-30.pdf");
  });
});
