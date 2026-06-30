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

/**
 * Sniff the field delimiter from the header line. Bank/QBO/Xero exports are
 * usually comma-separated, but EU locales emit semicolons (comma is the decimal
 * point there) and some tools emit tabs. We count candidates OUTSIDE quotes on
 * the first line and pick the most frequent; comma wins ties / a single column.
 * Without this, a `;`-delimited file collapses to one unusable column and the
 * whole import silently yields zero mappable rows.
 */
function detectDelimiter(src: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') { if (inQuotes && src[i + 1] === '"') i++; else inQuotes = !inQuotes; }
    else if (!inQuotes && (c === "\n" || c === "\r")) break; // header line only
    else if (!inQuotes && c in counts) counts[c]++;
  }
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d] > counts[best]) best = d;
  return best;
}

export function parseCsv(text: string): ParsedCsv {
  // strip BOM
  const src = text.replace(/^﻿/, "");
  const delim = detectDelimiter(src);
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
    } else if (c === delim) {
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
 * True only for a REAL calendar date. A day in 1..31 is not enough: 2026-02-30,
 * 2026-04-31 and Feb-29 of a non-leap year all pass a naive range check but are
 * rejected by Postgres `::date` (errcode 22008) — and because the import stages
 * every row in one INSERT, a single such row would abort the WHOLE batch with an
 * opaque "date/time field value out of range", even though the preview marked it
 * ✓. Round-tripping through Date catches these so the row is flagged invalid in
 * the preview instead of detonating the import. (Verified live: see csv stress PR.)
 */
function isRealCalendarDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parse a date cell → ISO yyyy-mm-dd, or null. `fmt` disambiguates slash/dash dates
 * that could be month-first (US) or day-first (UK/EU/AU). When a value is
 * self-disambiguating (a part > 12), that wins regardless of `fmt`. Invalid
 * month/day combinations — including impossible calendar dates like "02/30/2026"
 * — return null rather than producing a bogus ISO string (e.g. "13/04/2026" no
 * longer yields "2026-13-04", and "02/30/2026" no longer yields "2026-02-30").
 */
export function parseDateCell(v: string, fmt: DateFormat = "mdy"): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  // already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const mm = +iso[2], dd = +iso[3];
    if (!isRealCalendarDate(+iso[1], mm, dd)) return null;
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const parts = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (parts) {
    let [, a, b, y] = parts;
    if (y.length === 2) y = `20${y}`;
    const na = +a, nb = +b;
    let m: string, d: string;
    if (na > 12 && nb <= 12) { d = a; m = b; }        // first part must be the day
    else if (nb > 12 && na <= 12) { m = a; d = b; }   // second part must be the day
    else if (fmt === "dmy") { d = a; m = b; }         // ambiguous → honour fmt
    else { m = a; d = b; }
    const mi = +m, di = +d;
    if (!isRealCalendarDate(+y, mi, di)) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
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
