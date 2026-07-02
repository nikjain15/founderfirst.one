/**
 * Report exports (card W1.2) — pure serializers that turn the DERIVED statements
 * (reports.ts) into a downloadable CSV or PDF a CPA can hand to tax software.
 *
 * Invariants:
 *  - CSV ties to the on-screen numbers to the CENT: it formats the SAME integer
 *    minor units the on-screen report renders, via the same money helpers, so the
 *    file and the screen can never disagree (export.test.ts proves it).
 *  - Every feeding entry list is already fully paginated upstream (api.ts
 *    useEntries pages via .range(); org-data pages too) — these are pure functions
 *    over the complete list, so a 10k-entry org exports COMPLETELY, no truncation.
 *  - GL detail is the full entry/line dump with a running balance per account.
 *  - Reports are period- / as-of-scoped and carry an entity-stamped header.
 *
 * No new deps: CSV is RFC-4180 by hand; the PDF is a minimal hand-written
 * single-file document. Brand colors come from the design-system tokens at
 * runtime (getBrandRgb) — never an inlined hex.
 */
import { balanceSheet, generalLedger, profitAndLoss, trialBalance } from "./reports";
import { formatMoney } from "./money";
import type { JournalEntry } from "./types";

export type ReportKind = "tb" | "pnl" | "bs" | "gl";
export type ExportFormat = "csv" | "pdf";

/** Period scope for a report. TB/P&L/GL use a date range; BS uses `asOf`. */
export interface ReportScope {
  /** inclusive start (YYYY-MM-DD); omitted → open-ended (all history). */
  start?: string;
  /** inclusive end / as-of (YYYY-MM-DD); omitted → today, open-ended. */
  end?: string;
}

export interface ExportContext {
  orgName: string;
  scope: ReportScope;
  /** local date the file was generated (YYYY-MM-DD) — stamped in the header. */
  generatedOn: string;
}

/** Date filter matching accountBalances' convention (inclusive both ends). */
export function rangeFilter(scope: ReportScope): ((d: string) => boolean) | undefined {
  const { start, end } = scope;
  if (!start && !end) return undefined;
  return (d: string) => (!start || d >= start) && (!end || d <= end);
}

// A dollars string with NO currency symbol/grouping, for machine-readable CSV
// cells. Ties to the cent: minor units / 100 with exactly two decimals. Negative
// keeps a leading '-'. (formatMoney is used for the human PDF; this for CSV.)
function csvAmount(minor: number): string {
  const n = minor || 0;
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

// ── CSV primitives (RFC 4180) ────────────────────────────────────────────────
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/** Human-readable scope label for a header line. */
export function scopeLabel(kind: ReportKind, scope: ReportScope): string {
  if (kind === "bs") return `As of ${scope.end ?? "today"}`;
  const from = scope.start ?? "start";
  const to = scope.end ?? "today";
  return `${from} to ${to}`;
}

// ── report → tabular model (shared by CSV + PDF so they can't diverge) ─────────
/** Build a report as an ordered list of tables of RAW minor-unit amounts.
 *  The caller formats amounts for CSV (csvAmount) or PDF (formatMoney). */
function buildModel(
  kind: ReportKind,
  entries: JournalEntry[],
  scope: ReportScope,
): { title: string; header: string[]; body: (string | number | { minor: number })[][] }[] {
  const f = rangeFilter(scope);
  if (kind === "tb") {
    const tb = trialBalance(entriesInScope(entries, f));
    const rows = tb.rows.map((r) => [
      r.code ? `${r.code} · ${r.name}` : r.name,
      { minor: r.net >= 0 ? r.net : 0 },
      { minor: r.net < 0 ? -r.net : 0 },
    ]);
    rows.push(["Totals", { minor: tb.totalDebit }, { minor: tb.totalCredit }]);
    return [{ title: "Trial balance", header: ["Account", "Debit", "Credit"], body: rows }];
  }
  if (kind === "pnl") {
    const p = profitAndLoss(entries, f);
    const income = p.income.map((r) => [labelOf(r.code, r.name), { minor: r.amount }]);
    income.push(["Total revenue", { minor: p.totalIncome }]);
    const expense = p.expense.map((r) => [labelOf(r.code, r.name), { minor: r.amount }]);
    expense.push(["Total expenses", { minor: p.totalExpense }]);
    return [
      { title: "Revenue", header: ["Account", "Amount"], body: income },
      { title: "Expenses", header: ["Account", "Amount"], body: expense },
      { title: "Net income", header: ["", "Amount"], body: [["Net income", { minor: p.netIncome }]] },
    ];
  }
  if (kind === "bs") {
    const bs = balanceSheet(entries, scope.end);
    const assets = bs.assets.map((r) => [labelOf(r.code, r.name), { minor: r.amount }]);
    assets.push(["Total assets", { minor: bs.totalAssets }]);
    const liab = bs.liabilities.map((r) => [labelOf(r.code, r.name), { minor: r.amount }]);
    liab.push(["Total liabilities", { minor: bs.totalLiabilities }]);
    const eq = bs.equity.map((r) => [labelOf(r.code, r.name), { minor: r.amount }]);
    eq.push(["Current earnings", { minor: bs.currentEarnings }]);
    eq.push(["Total equity", { minor: bs.totalEquity + bs.currentEarnings }]);
    return [
      { title: "Assets", header: ["Account", "Amount"], body: assets },
      { title: "Liabilities", header: ["Account", "Amount"], body: liab },
      { title: "Equity", header: ["Account", "Amount"], body: eq },
    ];
  }
  // GL detail — full entry/line dump with a running balance per account. Reuses
  // the SAME pure function the on-screen GL renders, so file ≡ screen.
  const gl = generalLedger(entries, f).map((r) => [
    r.entry_date, r.account, r.memo,
    { minor: r.debit }, { minor: r.credit }, { minor: r.balance },
  ]);
  return [{ title: "General ledger detail", header: GL_HEADER, body: gl }];
}

const GL_HEADER = ["Date", "Account", "Memo", "Debit", "Credit", "Running balance"];

function labelOf(code: string | null, name: string): string {
  return code ? `${code} · ${name}` : name;
}

// TB shares P&L/BS's convention of deriving from posted+reversed, excluding
// pending_review; trialBalance already applies inBooks. But the range filter is
// applied inside accountBalances for P&L/BS; TB has no filter arg, so pre-filter
// the entry list for TB and GL.
function entriesInScope(entries: JournalEntry[], f?: (d: string) => boolean): JournalEntry[] {
  if (!f) return entries;
  return entries.filter((e) => f(e.entry_date));
}

// ── CSV output ────────────────────────────────────────────────────────────────
export function toCsv(kind: ReportKind, entries: JournalEntry[], ctx: ExportContext): string {
  const model = buildModel(kind, entries, ctx.scope);
  const lines: string[] = [];
  // Entity-stamped header block (kept as leading rows so it survives a re-import).
  lines.push(csvRow([ctx.orgName]));
  lines.push(csvRow([model[0].title]));
  lines.push(csvRow([scopeLabel(kind, ctx.scope)]));
  lines.push(csvRow([`Generated ${ctx.generatedOn}`]));
  lines.push("");
  for (const table of model) {
    if (model.length > 1) lines.push(csvRow([table.title]));
    lines.push(csvRow(table.header));
    for (const row of table.body) {
      lines.push(csvRow(row.map((c) => (isMinor(c) ? csvAmount(c.minor) : c))));
    }
    if (model.length > 1) lines.push("");
  }
  // Excel-friendly CRLF line endings.
  return lines.join("\r\n");
}

function isMinor(c: unknown): c is { minor: number } {
  return typeof c === "object" && c !== null && "minor" in c;
}

// ── PDF output (minimal, self-contained, branded via tokens) ──────────────────
/** Read a design-system token and convert to a PDF rgb triple (0–1 floats). */
function getBrandRgb(varName: string, fallback: [number, number, number]): [number, number, number] {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(raw);
    if (!m) return fallback;
    const int = parseInt(m[1], 16);
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  } catch {
    return fallback;
  }
}

// PDF strings must escape (, ), and \.
function pdfText(s: string): string {
  // Latin-1 only in the base-14 fonts; drop the "·" separator to a hyphen and
  // strip anything non-ASCII so the stream stays valid WinAnsi.
  return s
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Build a branded PDF. Kept deliberately simple: Helvetica base-14 font, a brand
 * rule under the entity header, one page that flows onto continuation pages when
 * the rows overflow — so a long GL detail is not clipped. Returns raw bytes.
 */
export function toPdf(kind: ReportKind, entries: JournalEntry[], ctx: ExportContext): Uint8Array {
  const brand = getBrandRgb("--brand", [0.196, 0.522, 0.298]);
  const ink = getBrandRgb("--ink", [0.157, 0.196, 0.247]);
  const muted = getBrandRgb("--ink-3", [0.357, 0.388, 0.431]);
  const model = buildModel(kind, entries, ctx.scope);

  const PAGE_W = 612, PAGE_H = 792, MARGIN = 48;
  const LINE = 16;
  const cols = layoutColumns(model[0].header, PAGE_W - MARGIN * 2);

  // Content-stream builder with automatic page breaks.
  const pages: string[] = [];
  let stream = "";
  let y = 0;

  const rgb = (c: [number, number, number]) => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
  const text = (x: number, yy: number, s: string, size: number, color: [number, number, number], bold = false) =>
    `BT /${bold ? "FB" : "F1"} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x} ${yy} Tm (${pdfText(s)}) Tj ET\n`;

  const newPage = () => {
    if (stream) pages.push(stream);
    stream = "";
    y = PAGE_H - MARGIN;
  };
  const ensure = (needed = LINE) => {
    if (y - needed < MARGIN) newPage();
  };

  newPage();
  // Entity-stamped header + brand rule.
  stream += text(MARGIN, y, ctx.orgName, 18, ink, true); y -= 22;
  stream += text(MARGIN, y, model[0].title, 13, brand, true); y -= 16;
  stream += text(MARGIN, y, scopeLabel(kind, ctx.scope), 10, muted); y -= 12;
  stream += text(MARGIN, y, `Generated ${ctx.generatedOn}`, 10, muted); y -= 8;
  stream += `${rgb(brand)} RG 1.5 w ${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S\n`; y -= 18;

  for (const table of model) {
    ensure(LINE * 2);
    if (model.length > 1) { stream += text(MARGIN, y, table.title, 12, ink, true); y -= LINE; }
    // column headers
    stream += drawRow(table.header.map(String), cols, MARGIN, y, 9, muted, true, text);
    y -= LINE;
    for (const row of table.body) {
      ensure();
      const cells = row.map((c) => (isMinor(c) ? formatMoney(c.minor) : String(c)));
      const bold = typeof row[0] === "string" && /^Total|^Net income|^Totals|^Current earnings/.test(row[0]);
      stream += drawRow(cells, cols, MARGIN, y, 9, bold ? ink : ink, bold, text);
      y -= LINE;
    }
    y -= LINE;
  }
  pages.push(stream);

  return assemblePdf(pages, PAGE_W, PAGE_H);
}

interface Col { x: number; width: number; align: "left" | "right"; }
function layoutColumns(header: string[], usable: number): Col[] {
  const n = header.length;
  // First column is widest (account/label); remaining share equally, right-aligned.
  const firstW = Math.round(usable * (n <= 2 ? 0.62 : 0.34));
  const rest = (usable - firstW) / (n - 1);
  const cols: Col[] = [{ x: 0, width: firstW, align: "left" }];
  for (let i = 1; i < n; i++) cols.push({ x: firstW + rest * (i - 1), width: rest, align: "right" });
  return cols;
}
function drawRow(
  cells: string[], cols: Col[], originX: number, y: number, size: number,
  color: [number, number, number], bold: boolean,
  text: (x: number, y: number, s: string, size: number, c: [number, number, number], b?: boolean) => string,
): string {
  let out = "";
  cells.forEach((raw, i) => {
    const col = cols[i] ?? cols[cols.length - 1];
    const s = clip(raw, col.width, size);
    const x = col.align === "right"
      ? originX + col.x + col.width - approxWidth(s, size)
      : originX + col.x;
    out += text(x, y, s, size, color, bold);
  });
  return out;
}
// Helvetica avg glyph ≈ 0.5em; good enough to right-align + clip without a metrics table.
const approxWidth = (s: string, size: number) => s.length * size * 0.5;
function clip(s: string, width: number, size: number): string {
  if (approxWidth(s, size) <= width) return s;
  const max = Math.max(1, Math.floor(width / (size * 0.5)) - 1);
  return `${s.slice(0, max)}…`.replace("…", "");
}

/** Assemble pages + fonts into a valid PDF byte array (xref table + trailer). */
function assemblePdf(pages: string[], w: number, h: number): Uint8Array {
  const objects: string[] = [];
  const enc = new TextEncoder();
  // Object numbering: 1=catalog, 2=pages, 3=F1(Helvetica), 4=FB(Helvetica-Bold),
  // then per page: content + page object.
  const pageObjNums: number[] = [];
  let objNum = 5;
  const contentObjs: { num: number; body: string }[] = [];
  for (const p of pages) {
    const contentNum = objNum++;
    const pageNum = objNum++;
    contentObjs.push({ num: contentNum, body: p });
    pageObjNums.push(pageNum);
  }
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");

  const put = (num: number, body: string) => { objects[num] = `${num} 0 obj\n${body}\nendobj\n`; };
  put(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  put(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageObjNums.length} >>`);
  put(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  put(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  contentObjs.forEach((c, i) => {
    const bytes = enc.encode(c.body).length;
    put(c.num, `<< /Length ${bytes} >>\nstream\n${c.body}endstream`);
    put(pageObjNums[i],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /Font << /F1 3 0 R /FB 4 0 R >> >> /Contents ${c.num} 0 R >>`);
  });

  // Serialize with a byte-accurate xref table.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  const maxNum = objNum - 1;
  for (let n = 1; n <= maxNum; n++) {
    if (!objects[n]) continue;
    offsets[n] = enc.encode(pdf).length;
    pdf += objects[n];
  }
  const xrefStart = enc.encode(pdf).length;
  pdf += `xref\n0 ${maxNum + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= maxNum; n++) {
    const off = offsets[n] ?? 0;
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxNum + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return enc.encode(pdf);
}

// ── download trigger + filename ───────────────────────────────────────────────
/** kebab-safe filename stem, e.g. "acme-inc_trial-balance_2026-06-30". */
export function exportFilename(orgName: string, kind: ReportKind, ctx: ExportContext, ext: ExportFormat): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
  const kindSlug = { tb: "trial-balance", pnl: "profit-and-loss", bs: "balance-sheet", gl: "general-ledger" }[kind];
  const stamp = ctx.scope.end ?? ctx.generatedOn;
  return `${slug(orgName)}_${kindSlug}_${stamp}.${ext}`;
}

/** Serialize + trigger a browser download. Returns the filename (for the caller
 *  to record in the audit line). Pure serializers above are unit-tested; this
 *  thin DOM wrapper is exercised by the E2E download test. */
export function downloadReport(
  kind: ReportKind, format: ExportFormat, entries: JournalEntry[], ctx: ExportContext,
): string {
  const filename = exportFilename(ctx.orgName, kind, ctx, format);
  const blob = format === "csv"
    ? new Blob([toCsv(kind, entries, ctx)], { type: "text/csv;charset=utf-8" })
    : new Blob([toPdf(kind, entries, ctx) as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}
