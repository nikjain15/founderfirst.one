/**
 * RV2-A2 — the structured per-suite export ROUND-TRIPS and TIES OUT.
 *
 * REG scenario RV2A2-EXPORT-ROUNDTRIP (AUDIT.md ledger, row filing-export): the whole
 * mission is "the CPA re-keys nothing and the numbers can't be silently wrong near a
 * filing." So the test builds a real RV2-A1 worksheet from ledger entries, serializes it
 * through EVERY suite, PARSES the file back, and asserts the reconstructed per-line
 * totals equal (a) the worksheet lines and (b) the trial balance — to the cent. Plus the
 * adversarial cases from the red-team: unmapped return blocked, empty ledger, rounding,
 * wrong suite, cross-suite code selection.
 */
import { describe, expect, it } from "vitest";
import { buildWorksheet, taxYearDateFilter, worksheetTiesOut, type Worksheet } from "./worksheet";
import { accountBalances } from "../ledger/reports";
import {
  buildCodeMap, worksheetToMappedReturn, serializeWorksheet, taxExportFilename, exportReady,
} from "./taxExport";
import { getSerializer } from "./serializers";
import type { AccountResolution, TaxFormLine } from "./types";
import type { JournalEntry, JournalLine, Side } from "../ledger/types";

let seq = 0;
const uid = () => `id-${seq++}`;

// Schedule-C-shaped lines WITH seeded per-suite export codes (mirrors the seed shape).
const LINES: TaxFormLine[] = [
  { line_key: "gross_receipts", line_code: "1", label: "Gross receipts", section: "income", sort_order: 10, kind: "amount", deductible_pct: null, flows_to: null, export_codes: { drake: "SC-1", ultratax: "SC-1" } },
  { line_key: "advertising", line_code: "8", label: "Advertising", section: "deductions", sort_order: 80, kind: "amount", deductible_pct: null, flows_to: null, export_codes: { drake: "SC-8", ultratax: "SC-8" } },
  { line_key: "meals", line_code: "24b", label: "Deductible meals", section: "deductions", sort_order: 245, kind: "amount", deductible_pct: 50, flows_to: null, export_codes: { drake: "SC-24b", ultratax: "SC-24b" } },
];

const META = {
  jurisdiction_code: "US-FED", form_code: "SCH_C", entity_type: "sole_prop",
  tax_year: 2025, form_name: "Schedule C (Form 1040)",
};

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash", type: "asset" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
  ads: { id: "a-ads", code: "6100", name: "Google Ads", type: "expense" as const },
  meals: { id: "a-meals", code: "6200", name: "Client meals", type: "expense" as const },
  misc: { id: "a-misc", code: "6900", name: "Misc", type: "expense" as const },
};
type Acct = { id: string; code: string; name: string; type: AccountResolution["account_type"] };

function jline(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(date: string, lines: JournalLine[], opts: Partial<Pick<JournalEntry, "status" | "memo">> = {}): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: opts.memo ?? null, status: opts.status ?? "posted",
    source: "manual", source_ref: null, reverses_id: null, created_at: `${date}T00:00:00Z`, lines,
  };
}
function res(acct: Acct, line_key: string | null, by: AccountResolution["resolved_by"] = "rule"): AccountResolution {
  return { account_id: acct.id, account_code: acct.code, account_name: acct.name, account_type: acct.type, line_key, resolved_by: by, match_detail: "test" };
}

// ── shared fixture: a real Schedule C year ──────────────────────────────────
const ENTRIES: JournalEntry[] = [
  entry("2025-02-01", [jline(ACCT.ads, "D", 70_000), jline(ACCT.cash, "C", 70_000)], { memo: "Feb ads" }),
  entry("2025-05-01", [jline(ACCT.ads, "D", 50_000), jline(ACCT.cash, "C", 50_000)], { memo: "May ads" }),
  entry("2025-06-01", [jline(ACCT.meals, "D", 100_000), jline(ACCT.cash, "C", 100_000)], { memo: "Team lunch" }),
  entry("2025-03-01", [jline(ACCT.cash, "D", 500_000), jline(ACCT.sales, "C", 500_000)], { memo: "Sale" }),
];
const RES = [res(ACCT.sales, "gross_receipts"), res(ACCT.ads, "advertising"), res(ACCT.meals, "meals")];

function ws(entries = ENTRIES, resolutions = RES): Worksheet {
  return buildWorksheet(META, LINES, resolutions, entries, taxYearDateFilter(2025));
}

/** Parse a TB-import CSV (generic / drake / ultratax) back into per-account net minor
 *  units (debit-normal), so we can reconstruct line totals independent of the writer. */
function parseTbCsv(csv: string, cols: { code: number; debit?: number; credit?: number; balance?: number }): Map<string, number> {
  const rows = csv.trim().split("\n").slice(1); // drop header
  const byCode = new Map<string, number>();
  for (const r of rows) {
    const f = r.split(",");
    const code = f[cols.code];
    let minor: number;
    if (cols.balance !== undefined) {
      minor = Math.round(parseFloat(f[cols.balance] || "0") * 100);
    } else {
      const d = Math.round(parseFloat(f[cols.debit!] || "0") * 100);
      const c = Math.round(parseFloat(f[cols.credit!] || "0") * 100);
      minor = d - c; // debit-normal net
    }
    byCode.set(code, (byCode.get(code) ?? 0) + minor);
  }
  return byCode;
}

describe("RV2A2-EXPORT-ROUNDTRIP — export ties to the worksheet AND the TB, to the cent", () => {
  it("worksheet→MappedReturn preserves every line total exactly", () => {
    const w = ws();
    const ret = worksheetToMappedReturn(w, LINES);
    const wByKey = Object.fromEntries(w.lines.map((l) => [l.line_key, l.amount_minor]));
    for (const l of ret.lines) expect(l.amount_minor).toBe(wByKey[l.line_key]);
    // and each MappedLine's account rows sum to the line (the export tie-out lever)
    for (const l of ret.lines) {
      const sum = l.accounts.reduce((s, a) => s + a.amount_minor, 0);
      expect(sum).toBe(l.amount_minor);
    }
  });

  it("generic CSV round-trips: reconstructed line totals == worksheet == TB", () => {
    const w = ws();
    const { content } = serializeWorksheet(w, LINES, "generic_csv", "Acme LLC");
    const parsed = parseTbCsv(content, { code: 0, debit: 2, credit: 3 });

    // TB (independent source) — the SAME year-scoped balances the worksheet nets from,
    // debit-normal (net = debit − credit). Built independently via accountBalances.
    const tb = accountBalances(ENTRIES, taxYearDateFilter(2025));
    // reconstruct each RETURN line from the parsed file, keyed by account code, and
    // compare to the worksheet line's amount (natural-side) AND to the TB.
    for (const wl of w.lines) {
      if (wl.source_entries.length === 0) continue;
      // sum the parsed per-account debit-normal amounts, flip to natural side for income
      const codes = new Set(wl.source_entries.map((s) => s.account_code));
      let natural = 0;
      for (const code of codes) {
        const dn = parsed.get(code!) ?? 0;
        natural += wl.section === "income" ? -dn : dn;
        // TB tie: the parsed debit-normal balance equals the TB account's net
        const tbRow = tb.find((r) => r.code === code);
        expect(dn).toBe(tbRow ? tbRow.net : 0);
      }
      expect(natural).toBe(wl.amount_minor);
    }
  });

  it("Drake file carries the SEEDED per-suite code (never the raw line_code)", () => {
    const w = ws();
    const { content } = serializeWorksheet(w, LINES, "drake", "Acme LLC");
    expect(content.split("\n")[0]).toBe("Account Number,Account Name,Debit,Credit,Tax Code");
    expect(content).toContain("6100,Google Ads");// account rows present
    expect(content).toContain("SC-1"); // gross receipts seeded code
    expect(content).toContain("SC-8"); // advertising seeded code
    // parse Drake back → the same TB ties
    const parsed = parseTbCsv(content, { code: 0, debit: 2, credit: 3 });
    expect(parsed.get("4000")).toBe(-500_000); // income credit-normal → negative debit-normal
    expect(parsed.get("6100")).toBe(120_000);  // ads: 70k + 50k
  });

  it("UltraTax balance column round-trips to the worksheet line", () => {
    const w = ws();
    const { content } = serializeWorksheet(w, LINES, "ultratax", "Acme LLC");
    const parsed = parseTbCsv(content, { code: 0, balance: 3 });
    expect(parsed.get("6100")).toBe(120_000);
    expect(parsed.get("6200")).toBe(100_000);
  });

  it("codeMap is built purely from seeded export_codes — absent suite ⇒ empty", () => {
    expect(buildCodeMap(LINES, "drake")).toEqual({ gross_receipts: "SC-1", advertising: "SC-8", meals: "SC-24b" });
    expect(buildCodeMap(LINES, "nonexistent")).toEqual({});
    // a line with no export_codes contributes nothing
    const noCodes: TaxFormLine[] = [{ ...LINES[0], export_codes: null }];
    expect(buildCodeMap(noCodes, "drake")).toEqual({});
  });
});

describe("RV2A2-EXPORT-GATE — a return that can't be trusted is NOT exportable", () => {
  it("blocks export when an account is unmapped (would land on the wrong line)", () => {
    const withUnmapped = [...RES, res(ACCT.misc, null, "unmapped")];
    const entries = [...ENTRIES, entry("2025-07-01", [jline(ACCT.misc, "D", 4_200), jline(ACCT.cash, "C", 4_200)])];
    const w = buildWorksheet(META, LINES, withUnmapped, entries, taxYearDateFilter(2025));
    expect(w.reviewReady).toBe(false);
    expect(exportReady(w, worksheetTiesOut(w))).toBe(false);
  });

  it("blocks export when the worksheet does not tie out", () => {
    const w = ws();
    // a tying worksheet is exportable; a non-tying one never is, regardless of mapping
    expect(exportReady(w, true)).toBe(true);
    expect(exportReady(w, false)).toBe(false);
  });

  it("empty ledger produces an all-zero, review-ready, exportable return (no crash)", () => {
    const w = buildWorksheet(META, LINES, RES, [], taxYearDateFilter(2025));
    expect(w.reviewReady).toBe(true);
    const { content } = serializeWorksheet(w, LINES, "generic_csv", "Acme LLC");
    // header only (no account rows) — nothing to re-key, but the file is valid
    expect(content.trim().split("\n").length).toBe(1);
  });

  it("wrong-year entries never leak onto the return (period scoping)", () => {
    const priorYear = entry("2024-12-31", [jline(ACCT.ads, "D", 999_999), jline(ACCT.cash, "C", 999_999)]);
    const w = ws([...ENTRIES, priorYear]);
    const ret = worksheetToMappedReturn(w, LINES);
    const ads = ret.lines.find((l) => l.line_key === "advertising")!;
    expect(ads.amount_minor).toBe(120_000); // 2024 activity excluded
  });

  it("rounding: half-cent-free minor-unit math ties exactly (no float drift)", () => {
    const odd = entry("2025-09-01", [jline(ACCT.ads, "D", 33_333), jline(ACCT.cash, "C", 33_333)]);
    const w = ws([...ENTRIES, odd]);
    const { content } = serializeWorksheet(w, LINES, "generic_csv", "Acme LLC");
    const parsed = parseTbCsv(content, { code: 0, debit: 2, credit: 3 });
    expect(parsed.get("6100")).toBe(120_000 + 33_333);
  });

  it("unknown suite id throws (pluggable-registry guard)", () => {
    expect(() => getSerializer("lacerte")).toThrow(/unknown tax export serializer/);
  });

  it("filename is suite-stamped + kebab-safe", () => {
    const w = ws();
    expect(taxExportFilename("Acme, LLC!", w, "drake", "csv")).toBe("acme-llc_sch-c_2025_drake.csv");
  });
});

describe("RV2A2-EXPORT-REDTEAM — silently-wrong numbers near a filing", () => {
  // A balance-sheet section holds BOTH assets (debit-normal) and liabilities
  // (credit-normal). Splitting debit/credit off the SECTION alone would silently
  // reverse a liability on the import (a filing error). The serializer must split
  // off the ACCOUNT TYPE. This is the highest-risk silent-corruption path.
  it("a liability on a balance_sheet line is credit-normal, NOT reversed by section", () => {
    const BS_LINES: TaxFormLine[] = [
      { line_key: "loans", line_code: "L·18", label: "Loans", section: "balance_sheet", sort_order: 900, kind: "amount", deductible_pct: null, flows_to: null, export_codes: { drake: "L-18" } },
      { line_key: "cash_bs", line_code: "L·1", label: "Cash", section: "balance_sheet", sort_order: 800, kind: "amount", deductible_pct: null, flows_to: null, export_codes: { drake: "L-1" } },
    ];
    const loan = { id: "a-loan", code: "2100", name: "Bank loan", type: "liability" as const };
    const meta = { ...META, form_code: "1120S", form_name: "Form 1120-S" };
    // borrow $10k: cash up (debit), loan up (credit). A liability's natural balance is a credit.
    const entries = [entry("2025-04-01", [jline(ACCT.cash, "D", 1_000_000), jline(loan, "C", 1_000_000)])];
    const resns = [res(ACCT.cash, "cash_bs"), res(loan, "loans")];
    const w = buildWorksheet(meta, BS_LINES, resns, entries, taxYearDateFilter(2025));
    const { content } = serializeWorksheet(w, BS_LINES, "drake", "Acme");
    const parsed = parseTbCsv(content, { code: 0, debit: 2, credit: 3 });
    // debit-normal net: cash +10k (asset), loan −10k (liability sits in the CREDIT column).
    expect(parsed.get("1000")).toBe(1_000_000);
    expect(parsed.get("2100")).toBe(-1_000_000);
    // the loan MUST NOT appear as a debit (that would understate liabilities / flip the sign)
    const loanRow = content.split("\n").find((r) => r.startsWith("2100,"));
    expect(loanRow).toMatch(/2100,Bank loan,,10000\.00,/); // empty debit, credit filled
  });

  // A CPA override can point an account at a 'computed' line (e.g. depreciation). It must
  // still export as an account row and tie — never be silently dropped or double-counted.
  it("an account overridden onto a computed line still exports and ties", () => {
    const LN: TaxFormLine[] = [
      { line_key: "depreciation", line_code: "13", label: "Depreciation", section: "deductions", sort_order: 130, kind: "computed", deductible_pct: null, flows_to: null, export_codes: { drake: "SC-13" } },
    ];
    const dep = { id: "a-dep", code: "6500", name: "Depreciation exp", type: "expense" as const };
    const entries = [entry("2025-06-01", [jline(dep, "D", 250_000), jline(ACCT.cash, "C", 250_000)])];
    const resns = [res(dep, "depreciation", "override")];
    const w = buildWorksheet(META, LN, resns, entries, taxYearDateFilter(2025));
    const ret = worksheetToMappedReturn(w, LN);
    const line = ret.lines.find((l) => l.line_key === "depreciation")!;
    expect(line.amount_minor).toBe(250_000);
    expect(line.accounts.reduce((s, a) => s + a.amount_minor, 0)).toBe(250_000);
    const { content } = serializeWorksheet(w, LN, "drake", "Acme");
    expect(content).toContain("6500,Depreciation exp");
    expect(content).toContain("SC-13"); // seeded code carried even on a computed line
    expect(worksheetTiesOut(w)).toBe(true);
  });

  // Reversed entries stay in the books (offset by their reversal) → net to zero on the
  // export, exactly as the TB shows. A reversal must never over- or under-state a line.
  it("a reversed entry nets to zero on the export (matches the ledger)", () => {
    const bad = entry("2025-08-01", [jline(ACCT.ads, "D", 88_000), jline(ACCT.cash, "C", 88_000)], { status: "reversed" });
    const rev = entry("2025-08-02", [jline(ACCT.ads, "C", 88_000), jline(ACCT.cash, "D", 88_000)]);
    const w = ws([...ENTRIES, bad, rev]);
    const { content } = serializeWorksheet(w, LINES, "generic_csv", "Acme");
    const parsed = parseTbCsv(content, { code: 0, debit: 2, credit: 3 });
    expect(parsed.get("6100")).toBe(120_000); // the reversed pair cancels; ads unchanged
  });

  // pending_review entries are NOT in the books → must never reach the export.
  it("a pending_review entry never reaches the export", () => {
    const pending = entry("2025-10-01", [jline(ACCT.ads, "D", 77_000), jline(ACCT.cash, "C", 77_000)], { status: "pending_review" });
    const w = ws([...ENTRIES, pending]);
    const { content } = serializeWorksheet(w, LINES, "generic_csv", "Acme");
    const parsed = parseTbCsv(content, { code: 0, debit: 2, credit: 3 });
    expect(parsed.get("6100")).toBe(120_000); // pending excluded
  });
});
