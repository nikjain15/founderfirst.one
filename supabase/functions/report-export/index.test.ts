/**
 * report-export validation tests (RV2-A2 follow-up — tax_export audit coverage).
 *
 * Network-free: exercises `parseExportBody`, the pure validation/sanitization
 * core the handler calls before ever touching Supabase, so the `tax_export`
 * report kind + the sanitization discipline (never trust shape) are proven
 * without a live server. Imports ONLY `./validate.ts` (dependency-free) —
 * NOT `./index.ts`, which pulls in supabase-js's npm type-reference chain and
 * fails `deno check`/`deno test` in this repo's CI (no node_modules).
 *
 *   deno test --allow-env supabase/functions/report-export/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseExportBody } from "./validate.ts";

const ORG = "00000000-0000-0000-0000-000000000001";

Deno.test("accepts a tax_export body with suite/form_code/tax_year in detail", () => {
  const res = parseExportBody({
    org_id: ORG, report: "tax_export", format: "csv",
    suite: "drake", form_code: "1120s", tax_year: 2025,
    filename: "acme_1120s_2025_drake.csv",
  });
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.detail.report, "tax_export");
    assertEquals(res.detail.suite, "drake");
    assertEquals(res.detail.form_code, "1120s");
    assertEquals(res.detail.tax_year, 2025);
    assertEquals(res.detail.filename, "acme_1120s_2025_drake.csv");
  }
});

Deno.test("accepts the html format (generic_pdf serializer's real extension)", () => {
  const res = parseExportBody({ org_id: ORG, report: "tax_export", format: "html" });
  assertEquals(res.ok, true);
});

Deno.test("rejects an unknown report kind", () => {
  assertEquals(
    parseExportBody({ org_id: ORG, report: "bogus", format: "csv" }),
    { ok: false, error: "bad_report" },
  );
});

Deno.test("rejects a non-UUID org", () => {
  assertEquals(
    parseExportBody({ org_id: "not-a-uuid", report: "tb", format: "csv" }),
    { ok: false, error: "bad_org" },
  );
});

Deno.test("rejects an unsupported format", () => {
  assertEquals(
    parseExportBody({ org_id: ORG, report: "tb", format: "docx" }),
    { ok: false, error: "bad_format" },
  );
});

Deno.test("existing report kinds still validate unchanged (no regression)", () => {
  for (const report of ["tb", "pnl", "bs", "gl", "cf", "nec", "pkg"]) {
    for (const format of ["csv", "pdf"]) {
      const res = parseExportBody({ org_id: ORG, report, format });
      assertEquals(res.ok, true, `${report}/${format} should validate`);
    }
  }
});

Deno.test("non-tax report kinds carry null tax-specific detail fields", () => {
  const res = parseExportBody({ org_id: ORG, report: "tb", format: "csv" });
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.detail.suite, null);
    assertEquals(res.detail.form_code, null);
    assertEquals(res.detail.tax_year, null);
  }
});

Deno.test("suite and form_code are truncated to 50 chars (never trust shape)", () => {
  const long = "x".repeat(100);
  const res = parseExportBody({
    org_id: ORG, report: "tax_export", format: "csv", suite: long, form_code: long,
  });
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.detail.suite?.length, 50);
    assertEquals(res.detail.form_code?.length, 50);
  }
});

Deno.test("filename is truncated to 200 chars", () => {
  const long = "y".repeat(300);
  const res = parseExportBody({ org_id: ORG, report: "tb", format: "csv", filename: long });
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.detail.filename?.length, 200);
});

Deno.test("a non-integer tax_year is dropped, never coerced", () => {
  const res = parseExportBody({
    org_id: ORG, report: "tax_export", format: "csv", tax_year: "2025",
  });
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.detail.tax_year, null);
});

Deno.test("a non-string suite/form_code/filename is dropped, never coerced", () => {
  const res = parseExportBody({
    org_id: ORG, report: "tax_export", format: "csv",
    suite: 123, form_code: {}, filename: ["a"],
  });
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.detail.suite, null);
    assertEquals(res.detail.form_code, null);
    assertEquals(res.detail.filename, null);
  }
});
