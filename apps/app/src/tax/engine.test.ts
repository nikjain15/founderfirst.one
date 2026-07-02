/**
 * W1.3-B tax engine + serializers — unit tests (REG scenarios W1.3B-MAP,
 * W1.3B-M1, W1.3B-DRAKE, W1.3B-EXT). Mapping ties to the books to the cent;
 * unmapped accounts are never dropped; M-1 drafts are proposals; serializers
 * produce the suites' expected import shapes (golden strings).
 */
import { describe, expect, it } from "vitest";
import { mapReturn, draftM1Adjustments, scheduleM1 } from "./engine";
import { getSerializer, ULTRATAX_EXCLUDE_CODE } from "./serializers";
import type { AccountResolution, AccountAmount, TaxFormLine } from "./types";

// A compact Schedule-C-shaped fixture (line metadata mirrors the seed file).
const LINES: TaxFormLine[] = [
  { line_key: "gross_receipts", line_code: "1", label: "Gross receipts", section: "income", sort_order: 10, kind: "amount", deductible_pct: null, flows_to: null },
  { line_key: "advertising", line_code: "8", label: "Advertising", section: "deductions", sort_order: 80, kind: "amount", deductible_pct: null, flows_to: null },
  { line_key: "meals", line_code: "24b", label: "Deductible meals", section: "deductions", sort_order: 245, kind: "amount", deductible_pct: 50, flows_to: null },
  { line_key: "other_expenses", line_code: "27a", label: "Other expenses", section: "deductions", sort_order: 270, kind: "amount", deductible_pct: null, flows_to: null },
  { line_key: "penalties_fines", line_code: null, label: "Penalties and fines", section: "deductions", sort_order: 275, kind: "info", deductible_pct: 0, flows_to: "disallowed" },
];

const META = {
  jurisdiction_code: "US-FED", form_code: "SCH_C", entity_type: "sole_prop",
  tax_year: 2025, form_name: "Schedule C (Form 1040)",
};

function res(account_id: string, code: string | null, name: string, type: AccountResolution["account_type"], line_key: string | null, by: AccountResolution["resolved_by"] = "rule"): AccountResolution {
  return { account_id, account_code: code, account_name: name, account_type: type, line_key, resolved_by: by, match_detail: "test" };
}

describe("W1.3B-MAP — mapping ties to the books", () => {
  const resolutions: AccountResolution[] = [
    res("a1", "4000", "Sales", "income", "gross_receipts"),
    res("a2", "6100", "Google Ads", "expense", "advertising"),
    res("a3", "6200", "Client meals", "expense", "meals"),
    res("a4", "6900", "Misc", "expense", "other_expenses"),
  ];
  const amounts: AccountAmount[] = [
    { account_id: "a1", amount_minor: 500000 }, // $5,000 income (credit-normal, positive)
    { account_id: "a2", amount_minor: 120000 }, // $1,200 advertising
    { account_id: "a3", amount_minor: 100000 }, // meals, book amount // law-ok: test fixture amount, not a law fact
    { account_id: "a4", amount_minor: 30000 },  // $300 misc
  ];

  it("rolls each account onto its resolved line and ties to the TB total", () => {
    const r = mapReturn(META, LINES, resolutions, amounts);
    const byKey = Object.fromEntries(r.lines.map((l) => [l.line_key, l.amount_minor]));
    expect(byKey.gross_receipts).toBe(500000);
    expect(byKey.advertising).toBe(120000);
    expect(byKey.meals).toBe(100000);
    expect(byKey.other_expenses).toBe(30000);
    // tie-out: everything mapped, nothing unmapped
    expect(r.unmapped).toHaveLength(0);
    expect(r.totalMappedMinor).toBe(500000 + 120000 + 100000 + 30000);
    expect(r.totalUnmappedMinor).toBe(0);
  });

  it("never silently drops an account — unmapped is a first-class bucket (§B.0.4)", () => {
    const withUnmapped = [...resolutions, res("a5", "9999", "Mystery", "expense", null, "unmapped")];
    const amts = [...amounts, { account_id: "a5", amount_minor: 4200 }];
    const r = mapReturn(META, LINES, withUnmapped, amts);
    expect(r.unmapped).toHaveLength(1);
    expect(r.unmapped[0].account_name).toBe("Mystery");
    expect(r.totalUnmappedMinor).toBe(4200);
    // package-ready gate: unmapped must be zero
    expect(r.unmapped.length === 0).toBe(false);
  });

  it("emits every seeded line even at zero amount (full form shape)", () => {
    const r = mapReturn(META, LINES, resolutions, amounts);
    expect(r.lines.map((l) => l.line_key)).toContain("penalties_fines");
    expect(r.lines.find((l) => l.line_key === "penalties_fines")!.amount_minor).toBe(0);
    // sorted by the form's own sort_order
    expect(r.lines.map((l) => l.sort_order)).toEqual([...r.lines.map((l) => l.sort_order)].sort((a, b) => a - b));
  });

  it("tie-out holds even when a resolution points at a line the form doesn't define", () => {
    // A stale/bad override could claim resolved_by='override' with a line_key that
    // isn't on the form (the set_account_tax_line integrity check now blocks this at
    // write time, but mapReturn must still never LOSE the amount if one slips in).
    const bad = [...resolutions, res("a9", "6950", "Ghost", "expense", "no_such_line", "override")];
    const amts = [...amounts, { account_id: "a9", amount_minor: 7777 }];
    const r = mapReturn(META, LINES, bad, amts);
    // the ghost account is surfaced (in unmapped), never silently dropped
    expect(r.unmapped.some((a) => a.account_id === "a9")).toBe(true);
    // tie-out: mapped + unmapped == the full TB total for every account
    const tbTotal = amts.reduce((s, a) => s + a.amount_minor, 0);
    expect(r.totalMappedMinor + r.totalUnmappedMinor).toBe(tbTotal);
  });
});

describe("W1.3B-M1 — book-tax difference drafts + reconciliation", () => {
  it("proposes a 50% meals disallowance from line metadata (no hardcoded %)", () => {
    const r = mapReturn(META, LINES,
      [res("a3", "6200", "Client meals", "expense", "meals")],
      [{ account_id: "a3", amount_minor: 100000 }]);
    const drafts = draftM1Adjustments(r);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].m1_bucket).toBe("expense_on_books_not_return");
    expect(drafts[0].kind).toBe("permanent");
    expect(drafts[0].amount_minor).toBe(50000); // 50% of $1,000 disallowed
    expect(drafts[0].origin_ref).toBe("meals:2025"); // idempotency key
  });

  it("proposes full disallowance for a 0% line (penalties/entertainment)", () => {
    const r = mapReturn(META, LINES,
      [res("a6", "6800", "IRS penalty", "expense", "penalties_fines")],
      [{ account_id: "a6", amount_minor: 25000 }]);
    const drafts = draftM1Adjustments(r);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].amount_minor).toBe(25000); // 100% disallowed
  });

  it("proposes nothing for fully-deductible lines", () => {
    const r = mapReturn(META, LINES,
      [res("a2", "6100", "Google Ads", "expense", "advertising")],
      [{ account_id: "a2", amount_minor: 120000 }]);
    expect(draftM1Adjustments(r)).toHaveLength(0);
  });

  it("scheduleM1 adds approved disallowances to book net income", () => {
    const m1 = scheduleM1(1000000, [
      { m1_bucket: "expense_on_books_not_return", kind: "permanent", amount_minor: 50000 },
      { m1_bucket: "income_on_books_not_return", kind: "permanent", amount_minor: 20000 },
    ]);
    expect(m1.taxableIncomeMinor).toBe(1000000 + 50000 - 20000); // add disallowance, subtract book-only income
    expect(m1.additions).toHaveLength(1);
    expect(m1.subtractions).toHaveLength(1);
  });

  it("proposals do NOT flow into M-1 — only approved rows count (§B.0.5)", () => {
    // scheduleM1 is fed only approved rows by contract; a proposal would simply not
    // appear here. Assert an empty approved set leaves book == taxable.
    expect(scheduleM1(777700, []).taxableIncomeMinor).toBe(777700);
  });
});

describe("W1.3B-DRAKE / serializers — suite import shapes (golden)", () => {
  const resolutions: AccountResolution[] = [
    res("a1", "4000", "Sales", "income", "gross_receipts"),
    res("a2", "6100", "Advertising", "expense", "advertising"),
  ];
  const amounts: AccountAmount[] = [
    { account_id: "a1", amount_minor: 500000 },
    { account_id: "a2", amount_minor: 120000 },
  ];
  const ret = mapReturn(META, LINES, resolutions, amounts);
  const ctx = { orgName: "Acme LLC", codeMap: { gross_receipts: "S-01", advertising: "S-08" } };

  it("generic CSV carries the account->line spine", () => {
    const csv = getSerializer("generic_csv").serialize(ret, ctx);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("account_code,account_name,debit,credit,tax_form,tax_line_code,tax_line_label");
    expect(csv).toContain("4000,Sales,,5000.00,SCH_C,1,Gross receipts");
    expect(csv).toContain("6100,Advertising,1200.00,,SCH_C,8,Advertising");
  });

  it("Drake emits its fixed column order with the tax code (never reordered)", () => {
    const csv = getSerializer("drake").serialize(ret, ctx);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Account Number,Account Name,Debit,Credit,Tax Code");
    // codeMap wins for the tax code
    expect(csv).toContain("4000,Sales,,5000.00,S-01");
    expect(csv).toContain("6100,Advertising,1200.00,,S-08");
  });

  it("UltraTax emits a tax-code + balance column, 88888 excludes unmapped", () => {
    const withUnmapped = mapReturn(META, LINES,
      [...resolutions, res("a9", "8000", "Suspense", "expense", null, "unmapped")],
      [...amounts, { account_id: "a9", amount_minor: 4200 }]);
    const csv = getSerializer("ultratax").serialize(withUnmapped, ctx);
    expect(csv.split("\n")[0]).toBe("Account,Description,Tax Code,Balance");
    expect(csv).toContain(`8000,Suspense,${ULTRATAX_EXCLUDE_CODE},42.00`);
    expect(csv).toContain("4000,Sales,S-01,5000.00");
  });

  it("generic PDF renders a print-ready package spine with tie-out", () => {
    const html = getSerializer("generic_pdf").serialize(ret, ctx);
    expect(html).toContain("Acme LLC — Schedule C (Form 1040)");
    expect(html).toContain("Tie-out:");
    expect(html).toContain("5000.00");
  });

  it("unknown serializer id throws (pluggable registry guard)", () => {
    expect(() => getSerializer("lacerte")).toThrow(/unknown tax export serializer/);
  });
});
