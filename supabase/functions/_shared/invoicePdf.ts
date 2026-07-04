/**
 * _shared/invoicePdf.ts — a minimal, self-contained invoice PDF for the invoice /
 * nudge email attachment (card W5.1).
 *
 * Why not reuse apps/app/src/ledger/export.ts toPdf()? That one is a browser
 * function — it reads brand colors via getComputedStyle(document…) and is typed
 * over the report model (ReportKind / JournalEntry), not an invoice. This edge
 * function runs in Deno with no DOM, so we build a small invoice-specific PDF here
 * on the SAME hand-written single-file PDF technique (Helvetica base-14, brand
 * rule, byte-accurate xref) proven by export.ts — no new dependency, no headless
 * browser, no external service.
 *
 * The document mirrors the on-screen / HTML-email invoice (invoicing/index.ts
 * invoiceBody): number + customer header, one row per line (desc · qty×unit ·
 * amount), then Total / Paid-to-date / Balance-due — so the attached PDF and the
 * email body can never disagree. Brand colors come from the shared email BRAND
 * constant (single source), converted to PDF rgb — never an inlined hex here.
 */

import { BRAND } from "./email.ts";

export interface PdfLine {
  description: string;
  quantity_milli: number;
  unit_price_minor: number;
  amount_minor: number;
}
export interface PdfInvoice {
  number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  currency: string;
  memo: string | null;
  total_minor: number;
  amount_paid_minor: number;
}

/** Money string mirroring invoicing/index.ts money() so PDF ≡ email body. */
function money(minor: number, ccy = "USD"): string {
  const v = (Math.abs(minor) / 100).toFixed(2);
  return `${ccy === "USD" ? "$" : ccy + " "}${v}`;
}

/** "#rrggbb" → PDF rgb triple (0–1 floats). Falls back to black on a bad value. */
function hexToRgb(hex: string, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const int = parseInt(m[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

// PDF text strings escape (, ), \; base-14 Helvetica is WinAnsi (Latin-1) only, so
// drop the "·" separator and strip non-ASCII to keep the content stream valid.
function pdfText(s: string): string {
  return s
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

const approxWidth = (s: string, size: number) => s.length * size * 0.5;
function clip(s: string, width: number, size: number): string {
  if (approxWidth(s, size) <= width) return s;
  const max = Math.max(1, Math.floor(width / (size * 0.5)) - 1);
  return s.slice(0, max);
}

/**
 * Build the invoice PDF as raw bytes. `reminder` only changes the "Balance due" /
 * "Amount due" label so it matches the reminder email's wording.
 */
export function invoicePdfBytes(
  inv: PdfInvoice,
  lines: PdfLine[],
  opts: { orgName: string; generatedOn: string; reminder?: boolean } = { orgName: "", generatedOn: "" },
): Uint8Array {
  const brand = hexToRgb(BRAND.income, [0.102, 0.62, 0.416]); // --income teal
  const ink = hexToRgb(BRAND.ink, [0.04, 0.04, 0.04]);
  const muted = hexToRgb(BRAND.ink3, [0.353, 0.353, 0.353]);

  const PAGE_W = 612, PAGE_H = 792, MARGIN = 48;
  const LINE = 16;
  const usable = PAGE_W - MARGIN * 2;
  // Columns: description (left), qty×unit (right), amount (right).
  const descW = Math.round(usable * 0.5);
  const qtyX = descW;
  const amtRight = usable; // right edge of the amount column
  const midRight = Math.round(usable * 0.78); // right edge of qty×unit column

  const pages: string[] = [];
  let stream = "";
  let y = 0;

  const rgb = (c: [number, number, number]) => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
  const text = (x: number, yy: number, s: string, size: number, color: [number, number, number], bold = false) =>
    `BT /${bold ? "FB" : "F1"} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x} ${yy} Tm (${pdfText(s)}) Tj ET\n`;
  // Right-align a string so its right edge sits at originX+rightX.
  const textR = (rightX: number, yy: number, s: string, size: number, color: [number, number, number], bold = false) =>
    text(MARGIN + rightX - approxWidth(s, size), yy, s, size, color, bold);

  const newPage = () => {
    if (stream) pages.push(stream);
    stream = "";
    y = PAGE_H - MARGIN;
  };
  const ensure = (needed = LINE) => { if (y - needed < MARGIN) newPage(); };

  newPage();
  // Header: org name (or generic), INVOICE title, number + dates + customer.
  if (opts.orgName) { stream += text(MARGIN, y, opts.orgName, 18, ink, true); y -= 22; }
  stream += text(MARGIN, y, `Invoice ${inv.number}`, 15, brand, true); y -= 18;
  stream += text(MARGIN, y, `Bill to: ${inv.customer_name}`, 11, muted); y -= 13;
  stream += text(MARGIN, y, `Issued ${inv.issue_date}  ·  Due ${inv.due_date}`, 10, muted); y -= 8;
  stream += `${rgb(brand)} RG 1.5 w ${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S\n`; y -= 20;

  // Line-item column headers.
  stream += text(MARGIN, y, "Description", 9, muted, true);
  stream += textR(midRight, y, "Qty x Unit", 9, muted, true);
  stream += textR(amtRight, y, "Amount", 9, muted, true);
  y -= LINE;

  for (const l of lines) {
    ensure();
    const qty = (l.quantity_milli / 1000).toString();
    stream += text(MARGIN, y, clip(l.description, descW, 10), 10, ink);
    stream += textR(midRight, y, `${qty} x ${money(l.unit_price_minor, inv.currency)}`, 10, ink);
    stream += textR(amtRight, y, money(l.amount_minor, inv.currency), 10, ink);
    y -= LINE;
  }

  const balance = inv.total_minor - inv.amount_paid_minor;
  y -= 4;
  ensure(LINE * 3);
  stream += `${rgb(muted)} RG 0.5 w ${MARGIN + qtyX} ${y + 6} m ${PAGE_W - MARGIN} ${y + 6} l S\n`;
  stream += text(MARGIN + qtyX, y, "Total", 11, ink, true);
  stream += textR(amtRight, y, money(inv.total_minor, inv.currency), 11, ink, true);
  y -= LINE;
  if (inv.amount_paid_minor > 0) {
    stream += text(MARGIN + qtyX, y, "Paid to date", 10, muted);
    stream += textR(amtRight, y, `-${money(inv.amount_paid_minor, inv.currency)}`, 10, muted);
    y -= LINE;
  }
  stream += text(MARGIN + qtyX, y, opts.reminder ? "Amount due" : "Balance due", 12, brand, true);
  stream += textR(amtRight, y, money(balance, inv.currency), 12, brand, true);
  y -= LINE + 6;

  if (inv.memo) {
    ensure(LINE * 2);
    stream += text(MARGIN, y, clip(inv.memo, usable, 9), 9, muted); y -= LINE;
  }
  if (opts.generatedOn) {
    ensure();
    stream += text(MARGIN, MARGIN, `Generated ${opts.generatedOn}`, 8, muted);
  }

  pages.push(stream);
  return assemblePdf(pages, PAGE_W, PAGE_H);
}

/** Assemble pages + fonts into a valid PDF byte array (xref table + trailer). */
function assemblePdf(pages: string[], w: number, h: number): Uint8Array {
  const objects: string[] = [];
  const enc = new TextEncoder();
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

/** kebab-safe attachment filename, e.g. "invoice-INV-1042.pdf". */
export function invoicePdfFilename(number: string): string {
  const slug = number.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "invoice";
  return `invoice-${slug}.pdf`;
}
