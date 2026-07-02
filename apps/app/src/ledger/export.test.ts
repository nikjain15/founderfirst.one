/**
 * Report exports (W1.2) — serialization + tie-out. The CSV must render the SAME
 * figures the on-screen report shows, to the cent; the GL running balance must be
 * per-account and deterministic; a large org must serialize completely (no
 * truncation — the serializers are pure over the already-paginated list); and the
 * PDF must be a structurally valid document.
 */
import { describe, expect, it } from "vitest";
import { balanceSheet, generalLedger, profitAndLoss, trialBalance } from "./reports";
import { exportFilename, toCsv, toPdf, type ExportContext } from "./export";
import type { JournalEntry, JournalLine, Side } from "./types";

let seq = 0;
const uid = () => `id-${seq++}`;

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
// code is `string | null` in production (LedgerAccount) — an uncategorized
// holding account legitimately has no code. Widen the literal-inferred code so
// tests can exercise the no-code path (and cast such accounts without error).
type Acct = Omit<(typeof ACCT)[keyof typeof ACCT], "code"> & { code: string | null };

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(
  date: string, lines: JournalLine[],
  opts: Partial<Pick<JournalEntry, "status" | "source" | "memo">> = {},
): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: opts.memo ?? null, status: opts.status ?? "posted",
    source: opts.source ?? "manual", source_ref: null, reverses_id: null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}

// Same known seed as reports.test.ts (Scenario A), in minor units.
function seedKnown(): JournalEntry[] {
  return [
    entry("2026-03-15", [line(ACCT.cash, "D", 1_000_000), line(ACCT.capital, "C", 1_000_000)]),
    entry("2026-03-15", [line(ACCT.ar, "D", 400_000), line(ACCT.sales, "C", 400_000)]),
    entry("2026-03-15", [line(ACCT.cogs, "D", 150_000), line(ACCT.cash, "C", 150_000)]),
    entry("2026-03-15", [line(ACCT.rent, "D", 200_000), line(ACCT.cash, "C", 200_000)]),
    entry("2026-03-15", [line(ACCT.rent, "D", 30_000), line(ACCT.accrued, "C", 30_000)]),
    entry("2026-03-15", [line(ACCT.prepaid, "D", 60_000), line(ACCT.cash, "C", 60_000)]),
    entry("2026-03-15", [line(ACCT.cash, "D", 100_000), line(ACCT.ar, "C", 100_000)]),
  ];
}

const CTX: ExportContext = {
  orgName: "Acme, Inc.",
  scope: {},
  generatedOn: "2026-07-02",
};

// Parse a CSV into rows of cells (handles the quoted-cell cases we emit).
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

describe("CSV ties to the on-screen numbers to the cent", () => {
  const entries = seedKnown();

  it("trial balance CSV totals match trialBalance()", () => {
    const tb = trialBalance(entries);
    const rows = parseCsv(toCsv("tb", entries, CTX));
    const totals = rows.find((r) => r[0] === "Totals")!;
    // $14,300.00 debit == credit
    expect(totals[1]).toBe("14300.00");
    expect(totals[2]).toBe("14300.00");
    expect(Number(totals[1]) * 100).toBe(tb.totalDebit);
    expect(Number(totals[2]) * 100).toBe(tb.totalCredit);
  });

  it("P&L CSV net income matches profitAndLoss()", () => {
    const p = profitAndLoss(entries);
    const rows = parseCsv(toCsv("pnl", entries, CTX));
    // The multi-section P&L emits "Net income" both as a section title (1 cell)
    // and as a data row (2 cells) — pick the data row.
    const net = rows.find((r) => r[0] === "Net income" && r.length > 1)!;
    expect(net[1]).toBe("200.00"); // net income 20_000 minor = $200.00
    expect(Number(net[1]) * 100).toBe(p.netIncome);
  });

  it("balance-sheet CSV total assets match balanceSheet()", () => {
    const bs = balanceSheet(entries);
    const rows = parseCsv(toCsv("bs", entries, CTX));
    const ta = rows.find((r) => r[0] === "Total assets")!;
    expect(Number(ta[1]) * 100).toBe(bs.totalAssets); // 1_050_000 → 10500.00
    expect(ta[1]).toBe("10500.00");
  });

  it("stamps the entity name, report title, scope and generated date", () => {
    const rows = parseCsv(toCsv("pnl", entries, CTX));
    expect(rows[0][0]).toBe("Acme, Inc."); // comma → quoted, round-trips clean
    expect(rows[3][0]).toBe("Generated 2026-07-02");
  });
});

describe("GL detail — full dump with per-account running balances", () => {
  const entries = seedKnown();

  it("emits one row per posted line and resets the balance per account", () => {
    const gl = generalLedger(entries);
    // 7 balanced entries × 2 lines = 14 lines.
    expect(gl.length).toBe(14);
    // Cash: +1,000,000 −150,000 −200,000 −60,000 +100,000 = 690,000 (last cash row).
    const cash = gl.filter((r) => r.account.startsWith("1000"));
    expect(cash[cash.length - 1].balance).toBe(690_000);
    // Each account starts fresh: the first row of an account equals its own signed line.
    const ar = gl.filter((r) => r.account.startsWith("1100"));
    expect(ar[0].balance).toBe(400_000); // opening AR debit
  });

  it("GL CSV closing balance per account ties to the ledger", () => {
    const rows = parseCsv(toCsv("gl", entries, CTX));
    // header rows (4) + column header (1) then data
    const dataRows = rows.filter((r) => r[0]?.startsWith("2026-"));
    expect(dataRows.length).toBe(14);
    // the balance column is the 6th cell
    const cashRows = dataRows.filter((r) => r[1].startsWith("1000"));
    expect(cashRows[cashRows.length - 1][5]).toBe("6900.00"); // $6,900.00
  });
});

describe("period scoping", () => {
  const entries = [
    entry("2026-01-10", [line(ACCT.cash, "D", 500_00), line(ACCT.sales, "C", 500_00)]),
    entry("2026-06-20", [line(ACCT.cash, "D", 300_00), line(ACCT.sales, "C", 300_00)]),
  ];

  it("P&L CSV only includes entries inside the range", () => {
    const rows = parseCsv(toCsv("pnl", entries, { ...CTX, scope: { start: "2026-06-01", end: "2026-06-30" } }));
    const totalRev = rows.find((r) => r[0] === "Total revenue")!;
    expect(totalRev[1]).toBe("300.00"); // only the June entry
  });

  it("balance sheet respects as-of", () => {
    const rows = parseCsv(toCsv("bs", entries, { ...CTX, scope: { end: "2026-03-01" } }));
    const ta = rows.find((r) => r[0] === "Total assets")!;
    expect(ta[1]).toBe("500.00"); // only the Jan entry is on the books as of March 1
  });
});

describe("completeness at scale (no 1000-row truncation)", () => {
  it("serializes a 10k-entry org completely", () => {
    const big: JournalEntry[] = [];
    for (let i = 0; i < 10_000; i++) {
      big.push(entry("2026-05-01", [line(ACCT.cash, "D", 100), line(ACCT.sales, "C", 100)]));
    }
    const gl = generalLedger(big);
    expect(gl.length).toBe(20_000); // every line present
    const rows = parseCsv(toCsv("gl", big, CTX));
    const dataRows = rows.filter((r) => r[0]?.startsWith("2026-"));
    expect(dataRows.length).toBe(20_000);
    // Cash running balance climbs to 10,000 × $1.00 = $10,000.00.
    const cash = gl.filter((r) => r.account.startsWith("1000"));
    expect(cash[cash.length - 1].balance).toBe(1_000_000);
  });
});

describe("CSV formula-injection defense", () => {
  // An account name that starts with a formula trigger. Excel/Sheets would
  // execute it on open unless it is neutralized to literal text.
  const evilAcct = { id: "a-evil", code: null, name: "=HYPERLINK(\"http://evil\")", type: "expense" as const };
  const entries = [
    entry("2026-05-01", [line(ACCT.cash, "D", 100_00), line(evilAcct as Acct, "C", 100_00)]),
  ];

  it("neutralizes a leading = in an account name (raw text is guarded)", () => {
    const csv = toCsv("gl", entries, CTX);
    // The dangerous cell must NOT appear as a bare formula: no line begins the
    // account cell with a raw '='. Neutralized cells carry a leading tab and are
    // RFC-quoted.
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(csv).toContain('"\t=HYPERLINK');
  });

  it("still parses back to the original name (tab-prefixed) and does not corrupt numbers", () => {
    const rows = parseCsv(toCsv("gl", entries, CTX));
    const data = rows.filter((r) => r[0]?.startsWith("2026-"));
    // account is cell[1]; leading tab neutralizer preserved, value intact.
    expect(data.some((r) => r[1] === "\t=HYPERLINK(\"http://evil\")")).toBe(true);
    // A negative amount is a number, not a formula — must be left as-is.
    expect(csvCellIsNumberSafe()).toBe(true);
  });
});

// Guard: a negative amount cell like "-300.00" must survive untouched.
function csvCellIsNumberSafe(): boolean {
  const e = [entry("2026-05-01", [line(ACCT.sales, "D", 300_00), line(ACCT.cash, "C", 300_00)])];
  const csv = toCsv("gl", e, { ...CTX, scope: {} });
  return csv.includes("300.00") && !csv.includes("\t-") && !csv.includes("\t3");
}

describe("filename + PDF structure", () => {
  it("builds a period-stamped, kebab filename", () => {
    expect(exportFilename("Acme, Inc.", "tb", { ...CTX, scope: { end: "2026-06-30" } }, "csv"))
      .toBe("acme-inc_trial-balance_2026-06-30.csv");
    expect(exportFilename("Acme, Inc.", "gl", CTX, "pdf"))
      .toBe("acme-inc_general-ledger_2026-07-02.pdf");
  });

  it("PDF is a structurally valid document (magic header + EOF + xref)", () => {
    const bytes = toPdf("pnl", seedKnown(), CTX);
    const s = new TextDecoder().decode(bytes);
    expect(s.startsWith("%PDF-1.")).toBe(true);
    expect(s.includes("/Type /Catalog")).toBe(true);
    expect(s.includes("startxref")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("PDF paginates a long GL onto multiple pages (no clipping)", () => {
    const big: JournalEntry[] = [];
    for (let i = 0; i < 500; i++) {
      big.push(entry("2026-05-01", [line(ACCT.cash, "D", 100), line(ACCT.sales, "C", 100)]));
    }
    const s = new TextDecoder().decode(toPdf("gl", big, CTX));
    const pageCount = (s.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });
});
