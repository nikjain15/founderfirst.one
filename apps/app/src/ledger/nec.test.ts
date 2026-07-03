/**
 * 1099-NEC contractor summary (card W2.5) — pure roll-up + export serialization.
 *
 * These tests prove the two acceptance invariants that live client-side:
 *   1. A seeded year-end summary is correct with card / third-party-network
 *      payments EXCLUDED from the 1099-NEC amount (the IRS 1099-K exclusion,
 *      applied server-side; here we assert the client honors the split the RPC
 *      returns and never sums excluded amounts into the filing total).
 *   2. Changing the THRESHOLD (which comes from the kernel/config, not a literal)
 *      changes the output — the same vendor rows flip meets_threshold, so the
 *      filing total + count change with no code edit.
 * The threshold itself is exercised end-to-end in the pgTAP suite (it reads
 * filing_obligations); here the RPC rows carry it, so we vary it as input.
 */
import { describe, expect, it } from "vitest";
import { necSummary } from "./reports";
import type { NecVendorRow } from "./reports";
import { toCsv } from "./export";
import type { ExportContext } from "./export";

// A vendor row as the ninetynine_nec_summary RPC returns it. `threshold_minor`
// is the same value on every row (the org/year kernel threshold).
function row(
  name: string,
  reportable: number,
  excluded: number,
  threshold: number,
  extra: Partial<NecVendorRow> = {},
): NecVendorRow {
  return {
    vendor_id: `v-${name}`,
    vendor_name: name,
    is_1099_eligible: true,
    w9_on_file: true,
    tax_id_type: "ein",
    tax_id_last4: "1234",
    reportable_minor: reportable,
    excluded_minor: excluded,
    payment_count: 1,
    threshold_minor: threshold,
    meets_threshold: reportable >= threshold,
    ...extra,
  };
}

describe("necSummary", () => {
  it("excludes card/1099-K amounts and files only vendors over the threshold", () => {
    // threshold injected as RPC input; the real value lives in the kernel. law-ok: test fixture
    const T = 60000;
    const rows = [
      // Contractor A: paid by check, over threshold -> FILE. law-ok: test fixture
      row("Alpha LLC", 120000, 0, T),
      // Contractor B: $500 by check + $900 by card → only $500 reportable, UNDER → no file.
      row("Bravo Design", 50000, 90000, T),
      // Contractor C: $700 all by card → $0 reportable (card excluded) → no file.
      row("Card Co", 0, 70000, T),
      // Contractor D: paid by ACH at exactly the threshold -> FILE. law-ok: test fixture
      row("Delta Ops", 60000, 0, T),
    ];
    const s = necSummary(2025, rows);

    expect(s.thresholdMinor).toBe(60000);
    // Only Alpha ($1,200) and Delta ($600) must be filed.
    expect(s.vendorsToFile).toBe(2);
    expect(s.totalReportable).toBe(180000); // 120000 + 60000
    // Card Co appears in rows (a CPA sees near-misses) but contributes $0.
    expect(s.rows.find((r) => r.vendor_name === "Card Co")?.reportable_minor).toBe(0);
    // Rows are sorted by reportable desc.
    expect(s.rows.map((r) => r.vendor_name)).toEqual([
      "Alpha LLC", "Delta Ops", "Bravo Design", "Card Co",
    ]);
  });

  it("changing the threshold (kernel value) changes who must file — no code edit", () => {
    const rows600 = [row("Alpha LLC", 120000, 0, 60000), row("Bravo Design", 80000, 0, 60000)];
    const at600 = necSummary(2025, rows600);
    expect(at600.vendorsToFile).toBe(2);
    expect(at600.totalReportable).toBe(200000);

    // Same payments, but under the higher 2026 threshold value (kernel-sourced): law-ok: test fixture
    // Bravo ($800) now drops below; Alpha ($1,200) also drops below → 0 to file.
    const rows2000 = [row("Alpha LLC", 120000, 0, 200000), row("Bravo Design", 80000, 0, 200000)];
    const at2000 = necSummary(2026, rows2000);
    expect(at2000.thresholdMinor).toBe(200000);
    expect(at2000.vendorsToFile).toBe(0);
    expect(at2000.totalReportable).toBe(0);
  });

  it("empty summary is well-formed", () => {
    const s = necSummary(2025, []);
    expect(s.rows).toEqual([]);
    expect(s.vendorsToFile).toBe(0);
    expect(s.totalReportable).toBe(0);
    expect(s.thresholdMinor).toBeNull();
  });
});

describe("nec export (rides the W1.2 machinery)", () => {
  const ctx = (nec: ReturnType<typeof necSummary>): ExportContext => ({
    orgName: "Acme Studio",
    scope: {},
    generatedOn: "2026-01-15",
    nec,
  });

  it("CSV shows the threshold, the excluded column, and ties the filing total to the cent", () => {
    const T = 60000;
    const s = necSummary(2025, [
      row("Alpha LLC", 120000, 0, T),
      row("Bravo Design", 50000, 90000, T), // under
    ]);
    const csv = toCsv("nec", [], ctx(s));
    // Entity-stamped header + tax-year scope label.
    expect(csv).toContain("Acme Studio");
    expect(csv).toContain("Tax year 2025");
    // Threshold shown in the title (from the kernel value, formatted as dollars).
    expect(csv).toContain("threshold 600.00");
    // Reportable amounts tie to the cent.
    expect(csv).toContain("1200.00"); // Alpha reportable
    expect(csv).toContain("900.00"); // Bravo excluded (card)
    // "Total to file" row = only Alpha (Bravo is under threshold). law-ok: test fixture
    const totalLine = csv.split("\r\n").find((l) => l.startsWith("Total to file"));
    expect(totalLine).toBeTruthy();
    expect(totalLine).toContain("1200.00");
  });
});
