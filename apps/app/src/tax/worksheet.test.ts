/**
 * RV2-A1 — the return worksheet ties to the ledger to the CENT, and every line
 * traces back to the exact journal entries behind it. This is the trust surface: a
 * reviewer must be able to drill from a return line to the transactions that produced
 * it, and the sum of those transactions must equal the line — always.
 *
 * REG scenario RV2A1-WORKSHEET-TIEOUT (AUDIT.md ledger): worksheet ties to ledger.
 */
import { describe, expect, it } from "vitest";
import { buildWorksheet, taxYearDateFilter, worksheetTiesOut } from "./worksheet";
import type { AccountResolution, TaxFormLine } from "./types";
import type { JournalEntry, JournalLine, Side } from "../ledger/types";

let seq = 0;
const uid = () => `id-${seq++}`;

// Schedule-C-shaped line metadata (mirrors the seed; NO law facts asserted here).
const LINES: TaxFormLine[] = [
  { line_key: "gross_receipts", line_code: "1", label: "Gross receipts", section: "income", sort_order: 10, kind: "amount", deductible_pct: null, flows_to: null },
  { line_key: "advertising", line_code: "8", label: "Advertising", section: "deductions", sort_order: 80, kind: "amount", deductible_pct: null, flows_to: null },
  { line_key: "meals", line_code: "24b", label: "Deductible meals", section: "deductions", sort_order: 245, kind: "amount", deductible_pct: 50, flows_to: null },
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
type Acct = (typeof ACCT)[keyof typeof ACCT];

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(
  date: string, lines: JournalLine[],
  opts: Partial<Pick<JournalEntry, "status" | "memo" | "reverses_id">> = {},
): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: opts.memo ?? null, status: opts.status ?? "posted",
    source: "manual", source_ref: null, reverses_id: opts.reverses_id ?? null,
    created_at: `${date}T00:00:00Z`, lines,
  };
}
function res(acct: Acct, line_key: string | null, by: AccountResolution["resolved_by"] = "rule"): AccountResolution {
  return {
    account_id: acct.id, account_code: acct.code, account_name: acct.name,
    account_type: acct.type, line_key, resolved_by: by, match_detail: "test",
  };
}

describe("RV2A1-WORKSHEET-TIEOUT — worksheet ties to the ledger to the cent", () => {
  // Two ad transactions + one meals + one sale. Each expense pairs against cash.
  const entries: JournalEntry[] = [
    entry("2025-02-01", [line(ACCT.ads, "D", 70_000), line(ACCT.cash, "C", 70_000)], { memo: "Feb ads" }),
    entry("2025-05-01", [line(ACCT.ads, "D", 50_000), line(ACCT.cash, "C", 50_000)], { memo: "May ads" }),
    entry("2025-06-01", [line(ACCT.meals, "D", 100_000), line(ACCT.cash, "C", 100_000)], { memo: "Team lunch" }),
    entry("2025-03-01", [line(ACCT.cash, "D", 500_000), line(ACCT.sales, "C", 500_000)], { memo: "Sale" }),
  ];
  const resolutions = [
    res(ACCT.sales, "gross_receipts"),
    res(ACCT.ads, "advertising"),
    res(ACCT.meals, "meals"),
    res(ACCT.cash, null, "unmapped"), // cash has no line on Schedule C but IS resolved → surfaced, not dropped
  ];

  it("rolls journal entries onto the correct lines with natural-side signs", () => {
    const ws = buildWorksheet(META, LINES, resolutions, entries);
    const byKey = Object.fromEntries(ws.lines.map((l) => [l.line_key, l.amount_minor]));
    expect(byKey.gross_receipts).toBe(500_000); // income, credit-normal → positive
    expect(byKey.advertising).toBe(120_000);    // 70k + 50k, two entries
    expect(byKey.meals).toBe(100_000);          // book amount (deductibility is the M-1 layer's job)
  });

  it("traces each line to the exact entries behind it (drill-down)", () => {
    const ws = buildWorksheet(META, LINES, resolutions, entries);
    const ads = ws.lines.find((l) => l.line_key === "advertising")!;
    expect(ads.source_entries).toHaveLength(2);
    expect(ads.source_entries.map((s) => s.memo).sort()).toEqual(["Feb ads", "May ads"]);
    expect(ads.source_entries.every((s) => s.account_id === ACCT.ads.id)).toBe(true);
  });

  it("the tie-out holds: Σ traced entries per line === the line amount", () => {
    const ws = buildWorksheet(META, LINES, resolutions, entries);
    for (const l of ws.lines) {
      const traced = l.source_entries.reduce((s, x) => s + x.amount_minor, 0);
      expect(traced).toBe(l.amount_minor); // to the cent
    }
    expect(worksheetTiesOut(ws)).toBe(true);
  });

  it("surfaces a resolved-but-unmapped account, never silently drops it", () => {
    const ws = buildWorksheet(META, LINES, resolutions, entries);
    // Cash is resolved with no line → it lands in unmapped (with its own tie-out).
    const cash = ws.unmapped.find((u) => u.account_id === ACCT.cash.id);
    expect(cash).toBeDefined();
    expect(worksheetTiesOut(ws)).toBe(true); // unmapped ties too
    expect(ws.reviewReady).toBe(false);      // not ready while an account is unmapped
  });

  it("shows the full form shape — every seeded line renders even at zero", () => {
    const ws = buildWorksheet(META, LINES, [], []);
    expect(ws.lines.map((l) => l.line_key)).toEqual(["gross_receipts", "advertising", "meals"]);
    expect(ws.lines.every((l) => l.amount_minor === 0)).toBe(true);
    expect(ws.reviewReady).toBe(true); // no activity → nothing unmapped
  });

  it("excludes pending-review entries (not yet in the books) — matches reports.ts", () => {
    const withPending = [
      ...entries,
      entry("2025-07-01", [line(ACCT.ads, "D", 999_999), line(ACCT.cash, "C", 999_999)], { status: "pending_review" }),
    ];
    const ws = buildWorksheet(META, LINES, resolutions, withPending);
    const ads = ws.lines.find((l) => l.line_key === "advertising")!;
    expect(ads.amount_minor).toBe(120_000); // the pending $9,999.99 is excluded
  });

  it("nets a reversed entry against its reversal (both stay in the books)", () => {
    const original = entry("2025-08-01", [line(ACCT.ads, "D", 30_000), line(ACCT.cash, "C", 30_000)], { status: "reversed" });
    const reversal = entry("2025-08-02", [line(ACCT.ads, "C", 30_000), line(ACCT.cash, "D", 30_000)], { reverses_id: original.id });
    const ws = buildWorksheet(META, LINES, resolutions, [original, reversal]);
    const ads = ws.lines.find((l) => l.line_key === "advertising")!;
    expect(ads.amount_minor).toBe(0);              // reversal cancels the original
    expect(ads.source_entries).toHaveLength(2);    // both are traced (auditability)
    expect(worksheetTiesOut(ws)).toBe(true);
  });

  it("promotes the resolved_by badge (override beats seed rule)", () => {
    const overridden = [res(ACCT.ads, "advertising", "override"), res(ACCT.meals, "meals")];
    const ws = buildWorksheet(META, LINES, overridden, entries);
    expect(ws.lines.find((l) => l.line_key === "advertising")!.resolved_by).toBe("override");
    expect(ws.lines.find((l) => l.line_key === "meals")!.resolved_by).toBe("rule");
  });
});

/**
 * RED-TEAM P0 — tax-period boundary leak. Without a date filter scoped to the form's
 * tax year, activity from other years rolls onto THIS year's return lines. The tie-out
 * still passes (Σ traced entries == line) but the money is for the WRONG period — a
 * "review-ready" lie. Filing.tsx must pass taxYearDateFilter(activeForm.tax_year).
 *
 * REG scenario RV2A1-WORKSHEET-PERIOD-SCOPE (AUDIT.md ledger).
 */
describe("RV2A1-WORKSHEET-PERIOD-SCOPE — a form only carries its own tax year", () => {
  const resolutions = [res(ACCT.ads, "advertising"), res(ACCT.cash, null, "unmapped")];
  // Same $700 ad expense booked in three different years.
  const multiYear: JournalEntry[] = [
    entry("2024-12-31", [line(ACCT.ads, "D", 70_000), line(ACCT.cash, "C", 70_000)], { memo: "2024 ads" }),
    entry("2025-06-15", [line(ACCT.ads, "D", 70_000), line(ACCT.cash, "C", 70_000)], { memo: "2025 ads" }),
    entry("2026-01-01", [line(ACCT.ads, "D", 70_000), line(ACCT.cash, "C", 70_000)], { memo: "2026 ads" }),
  ];

  it("REPRO: with no date filter, prior/next-year entries leak onto the line", () => {
    const ws = buildWorksheet(META, LINES, resolutions, multiYear); // no filter — the bug
    const ads = ws.lines.find((l) => l.line_key === "advertising")!;
    expect(ads.amount_minor).toBe(210_000); // all three years summed — WRONG for a 2025 return
    expect(worksheetTiesOut(ws)).toBe(true); // and it "ties" — the lie
  });

  it("FIX: scoping to the tax year keeps only that year's activity", () => {
    const ws = buildWorksheet(META, LINES, resolutions, multiYear, taxYearDateFilter(2025));
    const ads = ws.lines.find((l) => l.line_key === "advertising")!;
    expect(ads.amount_minor).toBe(70_000); // only the 2025 entry
    expect(ads.source_entries).toHaveLength(1);
    expect(ads.source_entries[0].memo).toBe("2025 ads");
    expect(worksheetTiesOut(ws)).toBe(true);
  });

  it("the tax-year filter is inclusive on both calendar boundaries", () => {
    const f = taxYearDateFilter(2025);
    expect(f("2025-01-01")).toBe(true);  // first day in
    expect(f("2025-12-31")).toBe(true);  // last day in
    expect(f("2024-12-31")).toBe(false); // day before out
    expect(f("2026-01-01")).toBe(false); // day after out
  });
});
