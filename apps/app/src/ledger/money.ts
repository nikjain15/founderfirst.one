/**
 * Money lives as integer minor units in a bigint column — never float
 * (ARCHITECTURE.md §6.1). Format only at the edge; parse user input back to minor
 * units for the write-path. Pilot magnitudes fit safely in a JS number.
 *
 * Minor-unit precision (W5.4 / design D2): most currencies use 2dp ("cents"),
 * but not all — JPY/KRW/VND have NO minor unit (whole units only) and
 * BHD/KWD/OMR/JOD/TND/IQD/LYD use 3dp. This table must stay in sync with the
 * `currencies` seed (supabase/migrations/20260707060000_w5_4_currency_catalog.sql)
 * — both encode the same fixed ISO-4217 fact, one for the DB, one for the
 * client's format/parse path (no shared JS/SQL module to source it from once).
 */
const ZERO_DP = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DP = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** Minor-unit digit count for a currency (0, 2, or 3) — defaults to 2. */
export function minorUnitFor(currency: string): number {
  const c = (currency || "USD").toUpperCase();
  if (ZERO_DP.has(c)) return 0;
  if (THREE_DP.has(c)) return 3;
  return 2;
}

export function formatMoney(minor: number, currency = "USD"): string {
  const dp = minorUnitFor(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: dp,
    minimumFractionDigits: dp,
  }).format((minor || 0) / 10 ** dp);
}

/**
 * Compact form for headline numbers on KPI tiles: "$12K", "$1.5M", "$1.8T".
 * Uses compact notation so a large (but valid) balance can't overrun its tile
 * and push the page wide on mobile — the RESPONSIVE.md no-overflow invariant.
 */
export function formatMoneyShort(minor: number, currency = "USD"): string {
  const dp = minorUnitFor(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format((minor || 0) / 10 ** dp);
}

/**
 * Convert a cleaned decimal string (digits, optional leading "-", at most one ".")
 * to integer minor units using INTEGER math only — no float multiply, so values
 * like "2.675" can't mis-round (ARCHITECTURE.md §6.1, no float in money). Sub-
 * minor-unit precision is REJECTED rather than silently rounded. `minorUnit`
 * defaults to 2 (USD/EUR/GBP/…) — pass minorUnitFor(currency) for a foreign
 * currency (W5.4 / design D2).
 */
export function decimalToMinor(cleaned: string, minorUnit = 2): number | null {
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null; // single sign, single dot
  const neg = cleaned.startsWith("-");
  const body = neg ? cleaned.slice(1) : cleaned;
  const [whole = "", frac = ""] = body.split(".");
  if (whole === "" && frac === "") return null;
  if (frac.length > minorUnit) return null; // sub-minor-unit — reject, don't round
  const w = whole === "" ? 0 : parseInt(whole, 10);
  const f = frac === "" ? 0 : parseInt(frac.padEnd(minorUnit, "0"), 10);
  if (!Number.isInteger(w) || !Number.isInteger(f)) return null;
  const minor = w * 10 ** minorUnit + f;
  return neg ? -minor : minor;
}

/** Parse a typed amount (e.g. "1,234.50") to minor units. null if invalid. */
export function parseMoneyToMinor(input: string, minorUnit = 2): number | null {
  const cleaned = String(input).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  return decimalToMinor(cleaned, minorUnit);
}
