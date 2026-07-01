/**
 * Money lives as integer minor units (cents) in a bigint column — never float
 * (ARCHITECTURE.md §6.1). Format only at the edge; parse user input back to minor
 * units for the write-path. Pilot magnitudes fit safely in a JS number.
 */
export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format((minor || 0) / 100);
}

/**
 * Compact form for headline numbers on KPI tiles: "$12K", "$1.5M", "$1.8T".
 * Uses compact notation so a large (but valid) balance can't overrun its tile
 * and push the page wide on mobile — the RESPONSIVE.md no-overflow invariant.
 */
export function formatMoneyShort(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format((minor || 0) / 100);
}

/**
 * Convert a cleaned decimal string (digits, optional leading "-", at most one ".")
 * to integer minor units using INTEGER math only — no float multiply, so values
 * like "2.675" can't mis-round (ARCHITECTURE.md §6.1, no float in money). Sub-cent
 * precision (>2 fractional digits) is REJECTED rather than silently rounded.
 */
export function decimalToMinor(cleaned: string): number | null {
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null; // single sign, single dot
  const neg = cleaned.startsWith("-");
  const body = neg ? cleaned.slice(1) : cleaned;
  const [whole = "", frac = ""] = body.split(".");
  if (whole === "" && frac === "") return null;
  if (frac.length > 2) return null; // sub-cent — reject, don't round
  const w = whole === "" ? 0 : parseInt(whole, 10);
  const f = frac === "" ? 0 : parseInt(frac.padEnd(2, "0"), 10);
  if (!Number.isInteger(w) || !Number.isInteger(f)) return null;
  const minor = w * 100 + f;
  return neg ? -minor : minor;
}

/** Parse a typed dollar amount (e.g. "1,234.50") to minor units. null if invalid. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = String(input).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  return decimalToMinor(cleaned);
}
