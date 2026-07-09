/**
 * report-export request validation — pure, dependency-free (no supabase-js import).
 *
 * Kept in its own module so it's unit-testable WITHOUT dragging in supabase-js's
 * npm type-reference chain: importing supabase-js triggers Deno to resolve
 * `npm:@types/node` transitively, which fails `deno check`/`deno test` in this
 * repo's CI (no `node_modules`, no `deno.json` with `nodeModulesDir`). index.ts
 * imports this module for the same logic; index.test.ts imports ONLY this file.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REPORTS = new Set(["tb", "pnl", "bs", "gl", "cf", "nec", "pkg", "tax_export"]);
export const FORMATS = new Set(["csv", "pdf", "html"]);

export interface ExportDetail {
  report: string;
  format: string;
  scope: { start: string | null; end: string | null };
  rows: number | null;
  filename: string | null;
  suite: string | null;
  form_code: string | null;
  tax_year: number | null;
}

/** Pure validation + sanitization of the request body — never trusts shape. */
export function parseExportBody(
  body: Record<string, unknown>,
): { ok: true; orgId: string; detail: ExportDetail } | { ok: false; error: string } {
  const orgId = String(body?.org_id ?? "");
  const report = String(body?.report ?? "");
  const format = String(body?.format ?? "");
  if (!UUID_RE.test(orgId)) return { ok: false, error: "bad_org" };
  if (!REPORTS.has(report)) return { ok: false, error: "bad_report" };
  if (!FORMATS.has(format)) return { ok: false, error: "bad_format" };

  const rawScope = (body?.scope ?? {}) as Record<string, unknown>;
  const scope = {
    start: typeof rawScope.start === "string" ? rawScope.start : null,
    end: typeof rawScope.end === "string" ? rawScope.end : null,
  };
  const rows = Number.isInteger(body?.rows) ? (body.rows as number) : null;
  const filename = typeof body?.filename === "string" ? body.filename.slice(0, 200) : null;
  const suite = typeof body?.suite === "string" ? body.suite.slice(0, 50) : null;
  const form_code = typeof body?.form_code === "string" ? body.form_code.slice(0, 50) : null;
  const tax_year = Number.isInteger(body?.tax_year) ? (body.tax_year as number) : null;

  return {
    ok: true,
    orgId,
    detail: { report, format, scope, rows, filename, suite, form_code, tax_year },
  };
}
