/**
 * ecbFx — pure ECB daily-reference-rate XML parsing (W5.4-FX).
 *
 * The ECB publishes EUR-base reference rates as a small, stable XML shape:
 *   <Cube time="2026-07-03">
 *     <Cube currency="USD" rate="1.0854"/>
 *     <Cube currency="JPY" rate="163.99"/>
 *     ...
 *   </Cube>
 * (attribute quoting is documented as double quotes but parsed leniently —
 * single or double — since the feed is public and unversioned). No XML
 * dependency is added: the shape is flat and regular enough that a strict
 * regex extraction is simpler and more auditable than a general parser.
 *
 * Kept network-free and DB-free so it is unit-testable under `deno test`
 * (the CI job runs with no --allow-net).
 */

export const ECB_DAILY_URL_DEFAULT = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_HIST90_URL_DEFAULT = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export interface EcbDay {
  asOf: string; // ISO date, e.g. "2026-07-03"
  rates: Record<string, number>; // ISO currency code -> EUR-base rate
}

export interface FxRateRow {
  base_currency: string;
  quote_currency: string;
  rate: number;
  as_of: string;
  source: string;
}

const DAY_RE = /<Cube\s+time=(['"])([\d-]+)\1\s*>([\s\S]*?)<\/Cube>/g;
const RATE_RE = /<Cube\s+currency=(['"])([A-Z]{3})\1\s+rate=(['"])([0-9.]+)\3\s*\/>/g;

/** Extract every (date, {currency: rate}) snapshot from an ECB daily/hist XML doc. */
export function parseEcbXml(xml: string): EcbDay[] {
  const days: EcbDay[] = [];
  const dayRe = new RegExp(DAY_RE.source, "g");
  let dayMatch: RegExpExecArray | null;
  while ((dayMatch = dayRe.exec(xml))) {
    const asOf = dayMatch[2];
    const body = dayMatch[3];
    const rates: Record<string, number> = {};
    const rateRe = new RegExp(RATE_RE.source, "g");
    let rateMatch: RegExpExecArray | null;
    while ((rateMatch = rateRe.exec(body))) {
      const ccy = rateMatch[2];
      const rate = Number(rateMatch[4]);
      if (Number.isFinite(rate) && rate > 0) rates[ccy] = rate;
    }
    if (Object.keys(rates).length > 0) days.push({ asOf, rates });
  }
  return days;
}

/**
 * Shape parsed days into fx_rates upsert rows, dropping any currency not in
 * the org-facing catalog (so the feed can't grow rows for codes the product
 * doesn't support). Returns the dropped codes too — callers should log them,
 * never swallow silently (LOOP_PROMPT "no silent caps").
 */
export function toFxRateRows(
  days: EcbDay[],
  activeCodes: Set<string>,
  source = "ECB",
): { rows: FxRateRow[]; skipped: string[] } {
  const rows: FxRateRow[] = [];
  const skipped = new Set<string>();
  for (const day of days) {
    for (const [ccy, rate] of Object.entries(day.rates)) {
      if (!activeCodes.has(ccy)) {
        skipped.add(ccy);
        continue;
      }
      rows.push({ base_currency: "EUR", quote_currency: ccy, rate, as_of: day.asOf, source });
    }
  }
  return { rows, skipped: [...skipped].sort() };
}
