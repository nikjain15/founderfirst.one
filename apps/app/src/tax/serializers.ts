/**
 * W1.3-B tax export serializers (research §A.2, §B.5).
 *
 * A serializer re-shapes the SAME mapped-return data into a tax suite's expected
 * import format. New suites add without touching the engine (pluggable interface —
 * research decision 2). At launch: generic CSV + generic PDF, plus per-suite
 * Drake + UltraTax profiles (their exact import shapes).
 *
 *   generic CSV   — account_code,account_name,debit,credit,tax_form,tax_line_code,
 *                   tax_line_label — every suite's TB utility consumes it with at
 *                   most a column re-map. Doubles as the human-readable package spine.
 *   generic PDF   — returns a print-ready HTML string (the app renders to PDF via
 *                   its existing export machinery / W1.2). Self-contained, no law
 *                   literals — every number/label comes from the mapped return.
 *   Drake         — Drake's fixed TB-import template columns (Account Number,
 *                   Account Name, Beginning/Ending balances, Tax Code). "Modify the
 *                   template = corrupt the import" (research §A.2) — so we emit the
 *                   exact column order and never reorder.
 *   UltraTax      — a tax-code column carrying the account balance (TR numeric tax
 *                   codes). Reserved code 88888 = "exclude from import" for unmapped.
 *
 * NOTE: Drake/UltraTax numeric code MAPS (line_key -> suite code) are DATA, seeded
 * per suite+year in a real deployment; here they are passed in as a codeMap so the
 * serializer stays law-literal-free and a code revision is a data change.
 */
import type { MappedReturn, MappedLine } from "./types";

export interface SerializerContext {
  /** org display name for the artifact header. */
  orgName: string;
  /** line_key -> suite tax code (DATA — a suite's published code listing per year).
   *  Absent entries fall back to the line_code; unmapped uses the suite's exclude code. */
  codeMap?: Record<string, string>;
}

export interface TaxExportSerializer {
  readonly id: string; // 'generic_csv' | 'generic_pdf' | 'drake' | 'ultratax'
  readonly label: string;
  readonly mime: string;
  readonly extension: string;
  serialize(ret: MappedReturn, ctx: SerializerContext): string;
}

const csvCell = (v: string | number | null): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money2 = (minor: number): string => (minor / 100).toFixed(2);

/** Debit/credit split of a signed natural-side amount for TB-shaped exports. */
function debitCredit(line: MappedLine, amt: number): { debit: string; credit: string } {
  // income/equity/liability are credit-normal; expense/asset/cogs debit-normal.
  const creditNormal = line.section === "income" || line.section === "equity_rollforward";
  if (creditNormal) return amt >= 0 ? { debit: "", credit: money2(amt) } : { debit: money2(-amt), credit: "" };
  return amt >= 0 ? { debit: money2(amt), credit: "" } : { debit: "", credit: money2(-amt) };
}

/** iterate every (line, account) pair once — the account-level TB rows. */
function* accountRows(ret: MappedReturn): Generator<{ line: MappedLine; acct: MappedLine["accounts"][number] }> {
  for (const line of ret.lines) for (const acct of line.accounts) yield { line, acct };
}

// ── generic mapped-TB CSV (research §A.2 primary artifact) ────────────────────
export const genericCsvSerializer: TaxExportSerializer = {
  id: "generic_csv",
  label: "Generic mapped trial balance (CSV)",
  mime: "text/csv",
  extension: "csv",
  serialize(ret) {
    const header = [
      "account_code", "account_name", "debit", "credit",
      "tax_form", "tax_line_code", "tax_line_label",
    ];
    const rows: string[] = [header.map(csvCell).join(",")];
    for (const { line, acct } of accountRows(ret)) {
      const { debit, credit } = debitCredit(line, acct.amount_minor);
      rows.push([
        acct.account_code, acct.account_name, debit, credit,
        ret.form_code, line.line_code ?? "", line.label,
      ].map(csvCell).join(","));
    }
    // unmapped accounts appear explicitly (never silently dropped — research §B.0.4)
    for (const a of ret.unmapped) {
      rows.push([
        a.account_code, a.account_name, money2(Math.max(a.amount_minor, 0)),
        money2(Math.max(-a.amount_minor, 0)), ret.form_code, "UNMAPPED", "** needs a tax-line mapping **",
      ].map(csvCell).join(","));
    }
    return rows.join("\n") + "\n";
  },
};

// ── generic PDF package spine (print-ready HTML; app renders to PDF) ──────────
export const genericPdfSerializer: TaxExportSerializer = {
  id: "generic_pdf",
  label: "Year-end package — mapped trial balance (PDF)",
  mime: "text/html",
  extension: "html",
  serialize(ret, ctx) {
    const sectionOrder = ["income", "cogs", "deductions", "balance_sheet", "equity_rollforward", "info"];
    const bySection = new Map<string, MappedLine[]>();
    for (const l of ret.lines) {
      if (l.accounts.length === 0 && l.amount_minor === 0 && l.kind !== "subtotal") continue;
      (bySection.get(l.section) ?? bySection.set(l.section, []).get(l.section)!).push(l);
    }
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const parts: string[] = [];
    parts.push(`<h1>${esc(ctx.orgName)} — ${esc(ret.form_name)}</h1>`);
    parts.push(`<p>Tax year ${ret.tax_year} · ${esc(ret.jurisdiction_code)} · ${esc(ret.form_code)}</p>`);
    for (const section of sectionOrder) {
      const ls = bySection.get(section);
      if (!ls || ls.length === 0) continue;
      parts.push(`<h2>${esc(section.replace(/_/g, " "))}</h2><table><thead><tr><th>Line</th><th>Description</th><th>Amount</th></tr></thead><tbody>`);
      for (const l of ls) {
        parts.push(`<tr><td>${esc(l.line_code ?? "")}</td><td>${esc(l.label)}</td><td>${money2(l.amount_minor)}</td></tr>`);
      }
      parts.push(`</tbody></table>`);
    }
    if (ret.unmapped.length > 0) {
      parts.push(`<h2>Unmapped accounts (package NOT ready — assign a tax line)</h2><ul>`);
      for (const a of ret.unmapped) parts.push(`<li>${esc(a.account_name)} — ${money2(a.amount_minor)}</li>`);
      parts.push(`</ul>`);
    } else {
      parts.push(`<p><strong>Tie-out:</strong> all ${accountCount(ret)} accounts mapped; total ${money2(ret.totalMappedMinor)}.</p>`);
    }
    return parts.join("\n");
  },
};

// ── Drake — fixed TB-import template (research §A.2: modify = corrupt) ─────────
// Drake's Trial Balance Import expects a rigid column order. We emit account-level
// rows with the mapped tax code in the last column and NEVER reorder columns.
export const drakeSerializer: TaxExportSerializer = {
  id: "drake",
  label: "Drake Tax — trial balance import",
  mime: "text/csv",
  extension: "csv",
  serialize(ret, ctx) {
    // Drake's canonical TB-import columns (order is load-bearing).
    const header = ["Account Number", "Account Name", "Debit", "Credit", "Tax Code"];
    const rows = [header.join(",")];
    const code = suiteCode(ctx, "drake");
    for (const { line, acct } of accountRows(ret)) {
      const { debit, credit } = debitCredit(line, acct.amount_minor);
      rows.push([
        csvCell(acct.account_code ?? ""), csvCell(acct.account_name),
        debit, credit, csvCell(code(line.line_key, line.line_code)),
      ].join(","));
    }
    for (const a of ret.unmapped) {
      // Drake has no exclude sentinel like UltraTax's 88888; unmapped rows carry a
      // blank tax code and MUST be resolved before import (the package gate enforces this).
      rows.push([csvCell(a.account_code ?? ""), csvCell(a.account_name),
        money2(Math.max(a.amount_minor, 0)), money2(Math.max(-a.amount_minor, 0)), ""].join(","));
    }
    return rows.join("\n") + "\n";
  },
};

// ── UltraTax CS — tax-code column carrying the balance (research §A.2) ────────
// Reserved code 88888 = "exclude from import" for unmapped (research §A.2).
export const ULTRATAX_EXCLUDE_CODE = "88888";
export const ultraTaxSerializer: TaxExportSerializer = {
  id: "ultratax",
  label: "UltraTax CS — tax-code balance import",
  mime: "text/csv",
  extension: "csv",
  serialize(ret, ctx) {
    const header = ["Account", "Description", "Tax Code", "Balance"];
    const rows = [header.join(",")];
    const code = suiteCode(ctx, "ultratax");
    for (const { line, acct } of accountRows(ret)) {
      rows.push([
        csvCell(acct.account_code ?? ""), csvCell(acct.account_name),
        csvCell(code(line.line_key, line.line_code)), money2(acct.amount_minor),
      ].join(","));
    }
    for (const a of ret.unmapped) {
      rows.push([csvCell(a.account_code ?? ""), csvCell(a.account_name),
        ULTRATAX_EXCLUDE_CODE, money2(a.amount_minor)].join(","));
    }
    return rows.join("\n") + "\n";
  },
};

/** suite tax-code resolver: codeMap wins (DATA, per suite+year), else the line_code,
 *  else empty. Keeps the serializer law-literal-free. */
function suiteCode(ctx: SerializerContext, _suite: string) {
  return (lineKey: string, lineCode: string | null): string =>
    ctx.codeMap?.[lineKey] ?? lineCode ?? "";
}

function accountCount(ret: MappedReturn): number {
  let n = ret.unmapped.length;
  for (const l of ret.lines) n += l.accounts.length;
  return n;
}

/** The serializer registry — add a suite here (pluggable; research decision 2). */
export const SERIALIZERS: Record<string, TaxExportSerializer> = {
  generic_csv: genericCsvSerializer,
  generic_pdf: genericPdfSerializer,
  drake: drakeSerializer,
  ultratax: ultraTaxSerializer,
};

export function getSerializer(id: string): TaxExportSerializer {
  const s = SERIALIZERS[id];
  if (!s) throw new Error(`unknown tax export serializer '${id}' (have: ${Object.keys(SERIALIZERS).join(", ")})`);
  return s;
}
