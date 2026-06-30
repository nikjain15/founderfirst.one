/**
 * Minimal, dependency-free CSV parser for the history importer. Handles quoted
 * fields, embedded commas/newlines, and "" escapes — enough for bank/QBO/Xero CSV
 * exports. Parsing happens in the browser; only normalized rows reach the server.
 */
import { decimalToMinor } from "../ledger/money";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** How ambiguous slash/dash dates (e.g. 03/04/2026) should be read. */
export type DateFormat = "mdy" | "dmy";

export function parseCsv(text: string): ParsedCsv {
  // strip BOM
  const src = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++; // CRLF
      row.push(field); field = "";
      // skip blank lines
      if (row.length > 1 || row[0] !== "") records.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== "") records.push(row); }

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  return { headers, rows: records.slice(1) };
}

/**
 * Parse a date cell → ISO yyyy-mm-dd, or null. `fmt` disambiguates slash/dash dates
 * that could be month-first (US) or day-first (UK/EU/AU). When a value is
 * self-disambiguating (a part > 12), that wins regardless of `fmt`. Invalid
 * month/day combinations return null rather than producing a bogus ISO string
 * (e.g. "13/04/2026" no longer yields "2026-13-04").
 */
// A real calendar date? (rejects Feb 30, Apr 31, and Feb 29 in a non-leap year).
function realDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const pad2 = (n: number) => String(n).padStart(2, "0");

export function parseDateCell(v: string, fmt: DateFormat = "mdy"): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  // ISO-ish (also yyyy/mm/dd, yyyy.mm.dd) — VALIDATED so "2026/02/30" rejects
  // instead of silently rolling over to "2026-03-02".
  const iso = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (iso) {
    const y = +iso[1], mm = +iso[2], dd = +iso[3];
    return realDate(y, mm, dd) ? `${y}-${pad2(mm)}-${pad2(dd)}` : null;
  }
  const parts = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    let [, a, b, y] = parts;
    if (y.length === 2) y = `20${y}`;
    const na = +a, nb = +b;
    let m: number, d: number;
    if (na > 12 && nb <= 12) { d = na; m = nb; }        // first part must be the day
    else if (nb > 12 && na <= 12) { m = na; d = nb; }   // second part must be the day
    else if (fmt === "dmy") { d = na; m = nb; }         // ambiguous → honour fmt
    else { m = na; d = nb; }
    return realDate(+y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;  // rejects 29/02 non-leap, etc.
  }
  // Excel / Google Sheets SERIAL date — a bare integer with no separators
  // ("45292" → 2024-01-01). The most common spreadsheet date encoding, which
  // previously fell to Date.parse and became the YEAR 45292.
  if (/^\d{4,6}$/.test(s)) {
    const serial = +s;
    if (serial < 20000 || serial > 80000) return null;   // ~1954..2119 sanity window
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  // Named-month formats only ("Jan 5, 2026", "5-Jan-2026"). We do NOT fall back to
  // Date.parse for numeric input — that silently rolls invalid dates over.
  if (/[a-z]/i.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/** Parse an amount cell → minor units, or null. Handles US ("1,234.56", "$10",
 *  "(45.00)") AND European ("1.234,56") notation: when BOTH '.' and ',' appear the
 *  LAST one is the decimal separator and the other is the thousands grouping. With
 *  a single separator we keep the US convention (',' = thousands, '.' = decimal),
 *  so sub-cent values like "1.005" still reject. Integer-only via decimalToMinor. */
export function parseAmountCell(v: string): number | null {
  let s = (v ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } // (123) = negative
  // Scientific notation (Excel's default render for large numbers, e.g. "1.23E+09").
  // Must run BEFORE the symbol-strip below, which would drop the 'e' and turn
  // "1e9" into "19" ($1,000,000,000 → $19.00). Expand precisely; reject if the
  // result overflows exact integer cents rather than silently corrupting.
  const sci = s.replace(/[\s$€£,]/g, "");
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(sci)) {
    const num = Number(sci);
    if (!Number.isFinite(num)) return null;
    const minor = Math.round(Math.abs(num) * 100);
    if (!Number.isSafeInteger(minor)) return null;
    return (neg || num < 0) ? -minor : minor;
  }
  s = s.replace(/[^0-9.,\-]/g, "");
  if (s.startsWith("-")) neg = true;
  s = s.replace(/-/g, "");
  if (s === "") return null;

  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // both present → the later one is the decimal point, the other is thousands
    normalized = lastDot > lastComma
      ? s.split(",").join("")                      // US: 1,234.56
      : s.split(".").join("").replace(",", ".");   // EU: 1.234,56
  } else if (lastComma >= 0) {
    // only comma(s): a single comma with 1-2 trailing digits is a EU decimal
    // (1234,56); anything else (1,234 / 12,345,678) is thousands grouping.
    const after = s.length - lastComma - 1;
    normalized = (s.indexOf(",") === lastComma && after >= 1 && after <= 2)
      ? s.replace(",", ".")
      : s.replace(/,/g, "");
  } else {
    normalized = s;                                // only dot(s) → US decimal (1.005 still rejects)
  }

  const minor = decimalToMinor(normalized);
  if (minor === null) return null;
  return neg ? -Math.abs(minor) : minor;
}
