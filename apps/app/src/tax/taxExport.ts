/**
 * RV2-A2 — the structured per-suite tax export (roadmap-v2 Candidate A, step 2).
 *
 * The mission's second leg: after the RV2-A1 worksheet establishes the TRUST surface
 * (every return line traced to the ledger), this emits that SAME return in the
 * structured format tax software imports (Drake / UltraTax TB-import files, a generic
 * mapped-TB CSV, and a print-ready package) so the CPA re-keys NOTHING.
 *
 * Design (centralization gate): this module does NOT re-compute the return. It takes
 * the already-tied-out RV2-A1 `Worksheet` and re-shapes it into the serializer engine's
 * `MappedReturn` — so an exported line total is, BY CONSTRUCTION, the worksheet line
 * total (which itself ties to the ledger/TB to the cent). One computation, one truth.
 * The per-suite line CODES come from the SEEDED tax_form_lines.export_codes (DATA); no
 * suite code is ever a literal here (research §B.5; the serializer stays law-free).
 *
 * Pure functions over DATA (no React, no law facts) so the round-trip tie is
 * unit-testable in node and check-law-literals stays clean. The only DOM touch is the
 * thin `downloadTaxExport` wrapper (mirrors ledger/export.ts downloadReport).
 */
import type { MappedReturn, MappedLine, TaxFormLine } from "./types";
import type { Worksheet } from "./worksheet";
import { getSerializer, type SerializerContext } from "./serializers";

/**
 * Build the per-suite codeMap (line_key -> suite import code) from the SEEDED form
 * lines. The suite key ('drake'|'ultratax'|…) selects each line's published code; a
 * line with no seeded code for that suite is simply absent, and the serializer falls
 * back to its display line_code. NEVER hardcodes a code — the map is entirely seed data.
 */
export function buildCodeMap(lines: TaxFormLine[], suiteKey: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of lines) {
    const code = l.export_codes?.[suiteKey];
    if (code) map[l.line_key] = code;
  }
  return map;
}

/**
 * Re-shape an RV2-A1 worksheet into the serializer engine's MappedReturn. The two are
 * consistent by construction: a MappedLine's amount == the worksheet line's amount ==
 * Σ of its traced source entries. We roll the worksheet's per-entry sources UP to the
 * account level (the grain the TB-import serializers emit), preserving each line's exact
 * total. Unmapped accounts carry straight through — never silently dropped (§B.0.4).
 */
export function worksheetToMappedReturn(ws: Worksheet, formLines: TaxFormLine[]): MappedReturn {
  const metaByKey = new Map(formLines.map((l) => [l.line_key, l]));

  const lines: MappedLine[] = ws.lines.map((wl) => {
    // Roll the line's per-ENTRY sources up to per-ACCOUNT rows (the TB grain). An
    // account can feed a line via many entries; the account row is Σ of those entries,
    // so Σ account rows == the line total (the export's tie-out lever).
    const byAccount = new Map<string, MappedLine["accounts"][number]>();
    for (const s of wl.source_entries) {
      const cur = byAccount.get(s.account_id) ?? {
        account_id: s.account_id, account_code: s.account_code,
        account_name: s.account_name, amount_minor: 0, account_type: s.account_type,
      };
      cur.amount_minor += s.amount_minor;
      byAccount.set(s.account_id, cur);
    }
    const meta = metaByKey.get(wl.line_key);
    return {
      line_key: wl.line_key, line_code: wl.line_code, label: wl.label,
      section: wl.section, sort_order: wl.sort_order, kind: wl.kind,
      deductible_pct: meta?.deductible_pct ?? null, flows_to: meta?.flows_to ?? null,
      amount_minor: wl.amount_minor,
      accounts: [...byAccount.values()],
    };
  });

  const unmapped: MappedReturn["unmapped"] = ws.unmapped.map((u) => ({
    account_id: u.account_id, account_code: u.account_code,
    account_name: u.account_name, amount_minor: u.amount_minor,
  }));

  return {
    jurisdiction_code: ws.jurisdiction_code, form_code: ws.form_code,
    entity_type: ws.entity_type, tax_year: ws.tax_year, form_name: ws.form_name,
    lines, unmapped,
    totalMappedMinor: ws.totalMappedMinor, totalUnmappedMinor: ws.totalUnmappedMinor,
  };
}

/** Serialize a worksheet through one suite's serializer. Convenience wrapper that
 *  bridges worksheet→MappedReturn and builds the seeded codeMap for the suite. */
export function serializeWorksheet(
  ws: Worksheet, formLines: TaxFormLine[], suiteId: string, orgName: string,
): { content: string; extension: string; mime: string } {
  const ser = getSerializer(suiteId);
  const ret = worksheetToMappedReturn(ws, formLines);
  const ctx: SerializerContext = { orgName, codeMap: buildCodeMap(formLines, suiteId) };
  return { content: ser.serialize(ret, ctx), extension: ser.extension, mime: ser.mime };
}

/** kebab-safe filename stem, e.g. "acme-llc_sch_c_2025_drake.csv" (mirrors
 *  ledger/export.ts exportFilename). Includes the suite so a CPA can tell exports apart. */
export function taxExportFilename(
  orgName: string, ws: Worksheet, suiteId: string, extension: string,
): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `${slug(orgName)}_${slug(ws.form_code)}_${ws.tax_year}_${slug(suiteId)}.${extension}`;
}

/** A return is safe to hand to tax software only when it (a) TIES OUT — every line ==
 *  Σ its sources — and (b) is REVIEW-READY — no account is unmapped. An unmapped account
 *  would land on the wrong line or a blank/exclude code, silently understating the
 *  return: the #1 filing trust risk. The UI gates the Download button on this. */
export function exportReady(ws: Worksheet, tiesOut: boolean): boolean {
  return tiesOut && ws.reviewReady;
}

/** Serialize + trigger a browser download. Returns the filename + the extension it
 *  actually wrote (for the audit line — the caller must never guess/relabel a
 *  format; e.g. `generic_pdf` emits real `.html`, not a true `.pdf`). Thin DOM
 *  wrapper — the serializers + bridge above are unit-tested; this is the only part
 *  that isn't pure, and it mirrors ledger/export.ts downloadReport exactly. */
export function downloadTaxExport(
  ws: Worksheet, formLines: TaxFormLine[], suiteId: string, orgName: string,
): { filename: string; extension: string } {
  const { content, extension, mime } = serializeWorksheet(ws, formLines, suiteId, orgName);
  const filename = taxExportFilename(orgName, ws, suiteId, extension);
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { filename, extension };
}
