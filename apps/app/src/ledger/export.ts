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
import { arApAging, balanceSheet, cashFlow, generalLedger, profitAndLoss, trialBalance, AGING_BUCKETS } from "./reports";
import type { AgingReport, NecSummary } from "./reports";
import { formatMoney } from "./money";
import type { JournalEntry } from "./types";

// "nec" = the year-end 1099-NEC contractor summary (card W2.5). Unlike the other
// four reports it is NOT derived from the entry list — it comes from the
// ninetynine_nec_summary RPC (vendor tags + payment-method exclusion + kernel
// threshold, all server-side) and is passed on ExportContext.nec.
// "pkg" = the lender / due-diligence package (card W4.4): a single assembled
// document — cover sheet + P&L + Balance Sheet + Cash-flow + AR/AP aging +
// period comparatives — riding this SAME export machinery (nothing new re-derived).
export type ReportKind = "tb" | "pnl" | "bs" | "gl" | "cf" | "nec" | "pkg";
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
  /** For the "nec" ReportKind only: the 1099-NEC summary from the RPC (server-
   *  computed). Ignored by the four ledger-derived reports. */
  nec?: NecSummary;
  /** For the "pkg" ReportKind: the immediately-prior comparative period, so the
   *  package shows this-period vs prior-period figures side by side. Omit → no
   *  comparative column (the package still assembles, single-period). */
  priorScope?: ReportScope;
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

// ── CSV primitives (RFC 4180 + formula-injection defense) ─────────────────────
// A cell whose text starts with = + - @ (or a leading tab/CR) is interpreted by
// Excel/Sheets as a FORMULA when the file is opened — a classic CSV-injection
// vector, since account names and memos are user-controlled (imports,
// categorization). Neutralize by prefixing a tab so the spreadsheet treats it as
// literal text. Numeric amount cells are emitted by csvAmount (e.g. "-300.00")
// and must NOT be mangled, so pure numbers are exempted.
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
function neutralize(s: string): string {
  if (NUMERIC_RE.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `\t${s}` : s;
}
function csvCell(v: string | number): string {
  const s = neutralize(String(v));
  return /[",\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/** Human-readable scope label for a header line. */
export function scopeLabel(kind: ReportKind, scope: ReportScope, nec?: NecSummary): string {
  if (kind === "nec") return `Tax year ${nec?.taxYear ?? scope.end?.slice(0, 4) ?? "—"}`;
  if (kind === "bs") return `As of ${scope.end ?? "today"}`;
  if (kind === "pkg") {
    const from = scope.start ?? "start";
    const to = scope.end ?? "today";
    return `Financial package · ${from} to ${to}`;
  }
  const from = scope.start ?? "start";
  const to = scope.end ?? "today";
  return `${from} to ${to}`;
}

// ── report → tabular model (shared by CSV + PDF so they can't diverge) ─────────
/** Build a report as an ordered list of tables of RAW minor-unit amounts.
 *  The caller formats amounts for CSV (csvAmount) or PDF (formatMoney). */
type Table = { title: string; header: string[]; body: (string | number | { minor: number })[][] };

function buildModel(
  kind: ReportKind,
  entries: JournalEntry[],
  scope: ReportScope,
  nec?: NecSummary,
  priorScope?: ReportScope,
): Table[] {
  const f = rangeFilter(scope);
  if (kind === "nec") return necModel(nec);
  if (kind === "pkg") return packageModel(entries, scope, priorScope);
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
  if (kind === "cf") {
    const cf = cashFlow(entries, scope);
    const op: (string | number | { minor: number })[][] = [["Net income", { minor: cf.netIncome }]];
    for (const l of cf.operatingAdjustments) op.push([labelOf(l.code, l.name), { minor: l.amount }]);
    op.push(["Net cash from operating activities", { minor: cf.operating }]);
    const inv = cf.investing.map((l) => [labelOf(l.code, l.name), { minor: l.amount }]);
    inv.push(["Net cash from investing activities", { minor: cf.investingTotal }]);
    const fin = cf.financing.map((l) => [labelOf(l.code, l.name), { minor: l.amount }]);
    fin.push(["Net cash from financing activities", { minor: cf.financingTotal }]);
    return [
      { title: "Operating activities", header: ["", "Amount"], body: op },
      { title: "Investing activities", header: ["", "Amount"], body: inv },
      { title: "Financing activities", header: ["", "Amount"], body: fin },
      {
        title: "Net change in cash", header: ["", "Amount"], body: [
          ["Net change in cash", { minor: cf.netChange }],
          ["Cash at beginning of period", { minor: cf.beginningCash }],
          ["Cash at end of period", { minor: cf.endingCash }],
        ],
      },
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

const NEC_HEADER = ["Vendor", "W-9", "TIN", "1099-NEC amount", "Excluded (card/1099-K)", "Must file"];

/**
 * The year-end 1099-NEC summary as a table (card W2.5). One row per 1099-eligible
 * vendor, ordered by reportable amount. "1099-NEC amount" already excludes card /
 * third-party-network payments (server-side, from the data-driven exclusion).
 * "Must file" marks vendors that cross the kernel threshold — those are the 1099s
 * the payer actually issues. A trailing total row sums the amounts that must be
 * filed, so the CPA sees the filing obligation at a glance. The header row states
 * the kernel threshold in effect (LAW; never a literal).
 */
function necModel(
  nec?: NecSummary,
): { title: string; header: string[]; body: (string | number | { minor: number })[][] }[] {
  const rows: (string | number | { minor: number })[][] = (nec?.rows ?? []).map((r) => [
    r.vendor_name,
    r.w9_on_file ? "On file" : "Missing",
    r.tax_id_last4 ? `${(r.tax_id_type ?? "").toUpperCase()} ••${r.tax_id_last4}` : "—",
    { minor: r.reportable_minor },
    { minor: r.excluded_minor },
    r.meets_threshold ? "Yes" : "No",
  ]);
  rows.push([
    "Total to file",
    "",
    "",
    { minor: nec?.totalReportable ?? 0 },
    { minor: 0 },
    String(nec?.vendorsToFile ?? 0),
  ]);
  const thr = nec?.thresholdMinor;
  const title = thr != null
    ? `1099-NEC contractor summary (threshold ${csvAmount(thr)})`
    : "1099-NEC contractor summary";
  return [{ title, header: NEC_HEADER, body: rows }];
}

// ── Lender / due-diligence package (card W4.4) ────────────────────────────────
/**
 * Assemble the full lender / DD package as an ordered list of tables — a cover
 * sheet, then P&L, Balance Sheet, Cash-flow, and AR/AP aging — all DERIVED from
 * the same entry list via the SAME pure report builders the on-screen reports and
 * the single-statement exports use, so the package can never disagree with them
 * to the cent. When `priorScope` is given, each statement carries a prior-period
 * comparative column (this period · prior period · Δ).
 *
 * A cover sheet leads: entity, coverage period, comparative period, generation
 * date, and a tie-out attestation line per statement (BS balanced · cash-flow
 * ties to the BS cash delta). Because every figure comes from the audited
 * builders, "ties to the cent" is a property of the assembly, not a re-check.
 */
function packageModel(
  entries: JournalEntry[],
  scope: ReportScope,
  priorScope?: ReportScope,
): Table[] {
  const f = rangeFilter(scope);
  const pf = priorScope ? rangeFilter(priorScope) : undefined;
  const asOf = scope.end;
  const priorAsOf = priorScope?.end;

  const pnl = profitAndLoss(entries, f);
  const bs = balanceSheet(entries, asOf);
  const cf = cashFlow(entries, scope);
  const ar = arApAging(entries, "ar", asOf);
  const ap = arApAging(entries, "ap", asOf);

  const pnlPrior = priorScope ? profitAndLoss(entries, pf) : undefined;
  const bsPrior = priorScope ? balanceSheet(entries, priorAsOf) : undefined;

  // Two-value comparative row: [label, current, prior, Δ]. When no prior, the
  // header/body collapse to [label, amount] (single-period package).
  const cmp = !!priorScope;
  const twoCol = (label: string, cur: number, prior?: number): (string | { minor: number })[] =>
    cmp
      ? [label, { minor: cur }, { minor: prior ?? 0 }, { minor: cur - (prior ?? 0) }]
      : [label, { minor: cur }];
  const money2Header = cmp ? ["", "This period", "Prior period", "Change"] : ["", "Amount"];
  const acctHeader = cmp ? ["Account", "This period", "Prior period", "Change"] : ["Account", "Amount"];

  // Look up a line's prior-period amount by account_id (0 if absent).
  const priorAmount = (lines: { account_id: string; amount: number }[] | undefined, id: string) =>
    lines?.find((l) => l.account_id === id)?.amount ?? 0;

  const tables: Table[] = [];

  // 1) Cover sheet — attestation + scope.
  const coverBody: (string | number | { minor: number })[][] = [
    ["Coverage period", scopeLabel("pnl", scope)],
    ["Balance sheet as of", asOf ?? "today"],
  ];
  if (priorScope) coverBody.push(["Comparative period", scopeLabel("pnl", priorScope)]);
  coverBody.push(
    ["Contents", "P&L · Balance sheet · Cash flow · AR/AP aging"],
    ["Balance sheet balanced", bs.balanced ? "Yes" : "No — review"],
    ["Cash flow ties to balance sheet", cf.ties ? "Yes" : "No — review"],
    ["Net income", { minor: pnl.netIncome }],
    ["Total assets", { minor: bs.totalAssets }],
    ["Cash at end of period", { minor: cf.endingCash }],
    ["AR outstanding", { minor: ar.grandTotal }],
    ["AP outstanding", { minor: ap.grandTotal }],
  );
  tables.push({ title: "Financial package — cover", header: ["", ""], body: coverBody });

  // 2) Profit & loss (with comparatives).
  const pnlBody: (string | number | { minor: number })[][] = [];
  for (const r of pnl.income) pnlBody.push(twoCol(labelOf(r.code, r.name), r.amount, priorAmount(pnlPrior?.income, r.account_id)));
  pnlBody.push(twoCol("Total revenue", pnl.totalIncome, pnlPrior?.totalIncome));
  for (const r of pnl.expense) pnlBody.push(twoCol(labelOf(r.code, r.name), r.amount, priorAmount(pnlPrior?.expense, r.account_id)));
  pnlBody.push(twoCol("Total expenses", pnl.totalExpense, pnlPrior?.totalExpense));
  pnlBody.push(twoCol("Net income", pnl.netIncome, pnlPrior?.netIncome));
  tables.push({ title: "Profit & loss", header: acctHeader, body: pnlBody });

  // 3) Balance sheet (with comparatives).
  const bsBody: (string | number | { minor: number })[][] = [];
  for (const r of bs.assets) bsBody.push(twoCol(labelOf(r.code, r.name), r.amount, priorAmount(bsPrior?.assets, r.account_id)));
  bsBody.push(twoCol("Total assets", bs.totalAssets, bsPrior?.totalAssets));
  for (const r of bs.liabilities) bsBody.push(twoCol(labelOf(r.code, r.name), r.amount, priorAmount(bsPrior?.liabilities, r.account_id)));
  bsBody.push(twoCol("Total liabilities", bs.totalLiabilities, bsPrior?.totalLiabilities));
  for (const r of bs.equity) bsBody.push(twoCol(labelOf(r.code, r.name), r.amount, priorAmount(bsPrior?.equity, r.account_id)));
  bsBody.push(twoCol("Current earnings", bs.currentEarnings, bsPrior?.currentEarnings));
  bsBody.push(twoCol("Total equity", bs.totalEquity + bs.currentEarnings, bsPrior ? bsPrior.totalEquity + bsPrior.currentEarnings : undefined));
  tables.push({ title: "Balance sheet", header: acctHeader, body: bsBody });

  // 4) Cash flow (indirect). Single-period; comparatives on the three totals.
  const cfPrior = priorScope ? cashFlow(entries, priorScope) : undefined;
  const cfBody: (string | number | { minor: number })[][] = [
    twoCol("Net cash from operating activities", cf.operating, cfPrior?.operating),
    twoCol("Net cash from investing activities", cf.investingTotal, cfPrior?.investingTotal),
    twoCol("Net cash from financing activities", cf.financingTotal, cfPrior?.financingTotal),
    twoCol("Net change in cash", cf.netChange, cfPrior?.netChange),
    twoCol("Cash at end of period", cf.endingCash, cfPrior?.endingCash),
  ];
  tables.push({ title: "Cash flow", header: money2Header, body: cfBody });

  // 5) AR aging + 6) AP aging — bucketed schedules (no comparative; as-of snapshot).
  tables.push(agingTable("Accounts receivable aging", ar));
  tables.push(agingTable("Accounts payable aging", ap));

  return tables;
}

function agingTable(title: string, rep: AgingReport): Table {
  const header = ["Account", ...AGING_BUCKETS.map((b) => b.label), "Total"];
  const body: (string | number | { minor: number })[][] = rep.rows.map((r) => [
    labelOf(r.code, r.name),
    ...AGING_BUCKETS.map((b) => ({ minor: r.buckets[b.key] })),
    { minor: r.total },
  ]);
  body.push([
    "Total",
    ...AGING_BUCKETS.map((b) => ({ minor: rep.totals[b.key] })),
    { minor: rep.grandTotal },
  ]);
  return { title, header, body };
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
  const model = buildModel(kind, entries, ctx.scope, ctx.nec, ctx.priorScope);
  const lines: string[] = [];
  // Entity-stamped header block (kept as leading rows so it survives a re-import).
  lines.push(csvRow([ctx.orgName]));
  lines.push(csvRow([model[0].title]));
  lines.push(csvRow([scopeLabel(kind, ctx.scope, ctx.nec)]));
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
  const model = buildModel(kind, entries, ctx.scope, ctx.nec, ctx.priorScope);

  const PAGE_W = 612, PAGE_H = 792, MARGIN = 48;
  const LINE = 16;
  const usable = PAGE_W - MARGIN * 2;

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
  stream += text(MARGIN, y, scopeLabel(kind, ctx.scope, ctx.nec), 10, muted); y -= 12;
  stream += text(MARGIN, y, `Generated ${ctx.generatedOn}`, 10, muted); y -= 8;
  stream += `${rgb(brand)} RG 1.5 w ${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S\n`; y -= 18;

  for (const table of model) {
    ensure(LINE * 2);
    // Per-table column layout so tables with different column counts (e.g. the
    // package's 2-col cover, 4-col comparatives, 6-col aging) each align.
    const cols = layoutColumns(table.header, usable);
    if (model.length > 1) { stream += text(MARGIN, y, table.title, 12, ink, true); y -= LINE; }
    // column headers
    stream += drawRow(table.header.map(String), cols, MARGIN, y, 9, muted, true, text);
    y -= LINE;
    for (const row of table.body) {
      ensure();
      const cells = row.map((c) => (isMinor(c) ? formatMoney(c.minor) : String(c)));
      const bold = typeof row[0] === "string" && /^Total|^Net income|^Totals|^Current earnings|^Net cash|^Net change|^Cash at/.test(row[0]);
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
  const kindSlug = { tb: "trial-balance", pnl: "profit-and-loss", bs: "balance-sheet", gl: "general-ledger", cf: "cash-flow", nec: "1099-nec-summary", pkg: "lender-package" }[kind];
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
