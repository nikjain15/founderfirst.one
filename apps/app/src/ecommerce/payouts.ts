/**
 * E-commerce payout splitting — provider-agnostic framework (W4.1). Pure logic,
 * DB-free, so the split math + every provider parser can be unit-tested in node
 * (Vitest), exactly like ledger/reports.ts and catchup/catchup.ts.
 *
 * THE PROBLEM (roadmap theme #6): a Stripe/Shopify payout hits the bank as ONE
 * lump deposit that is really gross sales − processing fees − refunds (± other).
 * Recorded as a single deposit, revenue and fees are silently wrong even though
 * the bank reconciles. This module splits any provider's payout report into the
 * normalized component buckets the ledger RPC (post_ecommerce_payout) posts.
 *
 * ── EXTENSIBILITY (Nik 3 Jul: integrate the MAJOR providers) ─────────────────
 * Adding PayPal / Square / Amazon = a connector-registry row (in the migration)
 * + one `PayoutParser` here. The split MATH is provider-agnostic and lives in
 * `componentsFromRows`; each parser only knows how to CLASSIFY its own report
 * rows into the shared `PayoutRowKind`. No rewrite — a new provider is data + a
 * classifier, never a change to the posting path.
 *
 * File/report import is the fallback + starting point (no OAuth lead time): the
 * Stripe balance-transactions report and the Shopify payout report are parsed
 * from their exported CSV rows. An API path can feed the SAME `PayoutRow[]` later.
 */

/** Registered commerce providers (mirror the connector-registry `key`s). */
export type PayoutProvider = "stripe" | "shopify" | "paypal" | "square" | "amazon";

/**
 * The economic bucket a single report row belongs to. Provider parsers map their
 * native row types onto these; the split math only ever sees these four kinds.
 */
export type PayoutRowKind =
  | "sale" // gross sale / charge (increases revenue)
  | "fee" // processing fee withheld (an expense)
  | "refund" // refund / return (contra-revenue)
  | "adjustment"; // anything else that moves the net (chargeback reversal, tax held, etc.)

/** One normalized row from a payout report, in minor units (cents). */
export interface PayoutRow {
  kind: PayoutRowKind;
  /**
   * Minor units. Convention: `sale` is the gross positive amount; `fee` and
   * `refund` are the positive magnitude withheld/returned; `adjustment` is SIGNED
   * (+ increases the deposit, − decreases it). Parsers must emit this convention.
   */
  amountMinor: number;
  /** Provider row id, for traceability (not required by the math). */
  ref?: string;
}

/** The normalized payout the ledger RPC consumes. All amounts in minor units. */
export interface PayoutComponents {
  provider: PayoutProvider;
  payoutId: string;
  /** ISO date (YYYY-MM-DD) the deposit settles to the bank. */
  payoutDate: string;
  currency: string;
  grossMinor: number; // Σ sale rows (>= 0)
  feesMinor: number; // Σ fee rows (>= 0)
  refundsMinor: number; // Σ refund rows (>= 0)
  adjustMinor: number; // Σ adjustment rows (SIGNED)
  /** gross − fees − refunds + adjust. This is what post_ecommerce_payout posts. */
  netMinor: number;
}

/** A parser turns a provider's raw exported rows into normalized PayoutRow[]. */
export interface PayoutParser<TRaw = Record<string, string>> {
  provider: PayoutProvider;
  /** Classify + normalize one raw report row; return null to ignore the row. */
  parseRow(raw: TRaw): PayoutRow | null;
}

/**
 * The provider-agnostic split math. Sum each bucket and derive the net. Every
 * amount is an integer in minor units so there is NO floating-point drift — the
 * payout ties to the cent by construction.
 */
export function componentsFromRows(
  provider: PayoutProvider,
  payoutId: string,
  payoutDate: string,
  currency: string,
  rows: PayoutRow[],
): PayoutComponents {
  let grossMinor = 0;
  let feesMinor = 0;
  let refundsMinor = 0;
  let adjustMinor = 0;

  for (const r of rows) {
    if (!Number.isInteger(r.amountMinor)) {
      throw new Error(`payout row amount must be integer minor units, got ${r.amountMinor}`);
    }
    switch (r.kind) {
      case "sale":
        grossMinor += Math.abs(r.amountMinor);
        break;
      case "fee":
        feesMinor += Math.abs(r.amountMinor);
        break;
      case "refund":
        refundsMinor += Math.abs(r.amountMinor);
        break;
      case "adjustment":
        adjustMinor += r.amountMinor; // signed
        break;
    }
  }

  const netMinor = grossMinor - feesMinor - refundsMinor + adjustMinor;
  return { provider, payoutId, payoutDate, currency, grossMinor, feesMinor, refundsMinor, adjustMinor, netMinor };
}

/**
 * Assert a normalized payout ties to the cent against the provider's own reported
 * net (when the report carries a net line). Throws rather than plugging silently —
 * a payout that doesn't reconcile is a parse bug the owner must see (LEARNINGS #16:
 * never let "it balanced" hide a wrong split). The RPC re-checks this server-side.
 */
export function assertReconciles(c: PayoutComponents, reportedNetMinor: number): void {
  if (c.netMinor !== reportedNetMinor) {
    throw new Error(
      `payout ${c.provider}:${c.payoutId} does not reconcile: ` +
        `gross ${c.grossMinor} − fees ${c.feesMinor} − refunds ${c.refundsMinor} + adjust ${c.adjustMinor} ` +
        `= ${c.netMinor}, but report net = ${reportedNetMinor}`,
    );
  }
}

// ── money helpers ────────────────────────────────────────────────────────────
/** Parse a decimal money string ("48.20", "-1.24", "$1,240.00") to minor units. */
export function toMinor(v: string | number): number {
  if (typeof v === "number") return Math.round(v * 100);
  const cleaned = v.replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`not a money value: ${JSON.stringify(v)}`);
  return Math.round(n * 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// Stripe — balance-transactions report (the file-import fallback / starting point)
//
// Each row has a `type` and a signed `amount` + a `fee`. We treat:
//   type=charge|payment          → sale (gross = amount, fee = fee)
//   type=refund|payment_refund   → refund (magnitude), plus its own fee credit-back
//   type=stripe_fee|...          → fee
//   type=adjustment|payout|other → adjustment (signed), payout itself is ignored
// Stripe reports fees as a POSITIVE column on the same row as the charge, so a
// charge row yields TWO normalized rows: a sale and a fee.
// ═══════════════════════════════════════════════════════════════════════════
export interface StripeBalanceRow {
  type: string;
  amount: string | number; // gross, signed
  fee: string | number; // fee withheld, positive
}

export const stripeBalanceTxnParser: PayoutParser<StripeBalanceRow> = {
  provider: "stripe",
  parseRow(raw) {
    const t = (raw.type || "").toString().trim().toLowerCase();
    const amt = toMinor(raw.amount);
    const fee = toMinor(raw.fee);
    // A single balance-transaction row carries both gross and fee; callers fan a
    // charge into a sale + a fee. We return the SALE kind here and expect callers
    // to also account for the fee via `stripeRowsFrom` below, which does the fan-out.
    if (t === "charge" || t === "payment") return { kind: "sale", amountMinor: Math.abs(amt), ref: raw.type };
    if (t === "refund" || t === "payment_refund" || t === "payment_refunded")
      return { kind: "refund", amountMinor: Math.abs(amt), ref: raw.type };
    if (t === "stripe_fee" || t === "application_fee" || t === "fee")
      return { kind: "fee", amountMinor: Math.abs(amt), ref: raw.type };
    if (t === "payout") return null; // the payout line itself is the net, not a component
    // adjustment, transfer, chargeback, etc. — signed net mover
    if (amt !== 0) return { kind: "adjustment", amountMinor: amt, ref: raw.type };
    if (fee !== 0) return { kind: "fee", amountMinor: Math.abs(fee), ref: raw.type };
    return null;
  },
};

/**
 * Fan Stripe balance rows into normalized PayoutRow[] — a charge row becomes a
 * `sale` (gross) AND a `fee` (its withheld fee), which is how Stripe nets.
 */
export function stripeRowsFrom(rows: StripeBalanceRow[]): PayoutRow[] {
  const out: PayoutRow[] = [];
  for (const raw of rows) {
    const primary = stripeBalanceTxnParser.parseRow(raw);
    if (primary) out.push(primary);
    // charges/payments carry a fee column that is withheld from the payout
    const t = (raw.type || "").toString().trim().toLowerCase();
    const fee = toMinor(raw.fee);
    if ((t === "charge" || t === "payment") && fee > 0) out.push({ kind: "fee", amountMinor: fee, ref: `${raw.type}:fee` });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shopify — payout report (the file-import fallback / starting point)
//
// Shopify's payout export has a `Type` column: charge / refund / adjustment, plus
// `Amount`, `Fee`, `Net`. We map charge→sale (+ fee), refund→refund, else adjustment.
// ═══════════════════════════════════════════════════════════════════════════
export interface ShopifyPayoutRow {
  Type: string;
  Amount: string | number;
  Fee: string | number;
}

export const shopifyPayoutParser: PayoutParser<ShopifyPayoutRow> = {
  provider: "shopify",
  parseRow(raw) {
    const t = (raw.Type || "").toString().trim().toLowerCase();
    const amt = toMinor(raw.Amount);
    if (t === "charge" || t === "sale") return { kind: "sale", amountMinor: Math.abs(amt), ref: raw.Type };
    if (t === "refund") return { kind: "refund", amountMinor: Math.abs(amt), ref: raw.Type };
    if (t === "adjustment" || t === "dispute" || t === "chargeback")
      return { kind: "adjustment", amountMinor: amt, ref: raw.Type };
    if (amt !== 0) return { kind: "adjustment", amountMinor: amt, ref: raw.Type };
    return null;
  },
};

export function shopifyRowsFrom(rows: ShopifyPayoutRow[]): PayoutRow[] {
  const out: PayoutRow[] = [];
  for (const raw of rows) {
    const primary = shopifyPayoutParser.parseRow(raw);
    if (primary) out.push(primary);
    const t = (raw.Type || "").toString().trim().toLowerCase();
    const fee = toMinor(raw.Fee);
    if ((t === "charge" || t === "sale") && fee > 0) out.push({ kind: "fee", amountMinor: fee, ref: `${raw.Type}:fee` });
  }
  return out;
}

/** Registry of report parsers, keyed by provider. Adding a provider = one entry. */
export const PAYOUT_PARSERS: Partial<Record<PayoutProvider, { rowsFrom: (rows: any[]) => PayoutRow[] }>> = {
  stripe: { rowsFrom: stripeRowsFrom },
  shopify: { rowsFrom: shopifyRowsFrom },
};

// ═══════════════════════════════════════════════════════════════════════════
// CSV → PayoutComponents bridge (the upload UI's parse path).
//
// The upload surface (PayoutUpload.tsx) hands us the already-parsed CSV (headers
// + string rows, from import/csv.ts) plus the provider key. This turns that into
// the normalized PayoutComponents the RPC consumes AND reconciles it against the
// report's own net (when the export carries a net column) so a parse bug surfaces
// to the owner BEFORE anything posts — never a silent plug (LEARNINGS #16). Kept
// DB-free + pure so the whole preview is unit-testable in node.
// ═══════════════════════════════════════════════════════════════════════════

/** A parsed CSV as import/csv.ts produces it (kept local to avoid a UI import). */
export interface ParsedPayoutCsv {
  headers: string[];
  rows: string[][];
}

/** The result of parsing an uploaded report: the split + optional reported net. */
export interface ParsedPayout {
  components: PayoutComponents;
  /** Net the report itself declares (Σ of its net column), if present, in minor units. */
  reportedNetMinor: number | null;
  /** True when the report carried a net column AND it ties to our computed net. */
  reconciles: boolean;
  /** How many report rows were classified into a bucket (ignored rows excluded). */
  rowCount: number;
}

/** Case/space-insensitive header lookup → column index, or -1. */
function colIndex(headers: string[], ...names: string[]): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "");
  const want = names.map(norm);
  return headers.findIndex((h) => want.includes(norm(h)));
}

/**
 * Map a provider's parsed CSV into typed raw rows, run its parser, and total the
 * report's own net column for the reconcile check. Provider column names mirror
 * the Stripe balance-transactions export and the Shopify payout export.
 */
export function parsePayoutCsv(
  provider: PayoutProvider,
  payoutId: string,
  payoutDate: string,
  currency: string,
  csv: ParsedPayoutCsv,
): ParsedPayout {
  const parser = PAYOUT_PARSERS[provider];
  if (!parser) throw new Error(`no report parser for provider ${provider}`);
  const { headers, rows } = csv;

  // Locate the columns each provider's parser needs, plus a net column if present.
  const cType = colIndex(headers, "type");
  const cAmount = colIndex(headers, "amount", "gross");
  const cFee = colIndex(headers, "fee", "fees");
  const cNet = colIndex(headers, "net");
  if (cType < 0 || cAmount < 0) {
    throw new Error("report is missing a Type and/or Amount column");
  }

  // Build the provider's typed raw shape from the CSV cells. Both current parsers
  // (Stripe balance-txn, Shopify payout) read type/amount/fee, so one mapping serves.
  const raw = rows.map((r) => ({
    type: r[cType] ?? "",
    Type: r[cType] ?? "",
    amount: r[cAmount] ?? "0",
    Amount: r[cAmount] ?? "0",
    fee: cFee >= 0 ? (r[cFee] ?? "0") : "0",
    Fee: cFee >= 0 ? (r[cFee] ?? "0") : "0",
  }));

  const normalized = parser.rowsFrom(raw as any[]);
  const components = componentsFromRows(provider, payoutId, payoutDate, currency, normalized);

  let reportedNetMinor: number | null = null;
  if (cNet >= 0) {
    reportedNetMinor = rows.reduce((s, r) => s + toMinor(r[cNet] ?? "0"), 0);
  }
  const reconciles = reportedNetMinor == null ? true : reportedNetMinor === components.netMinor;

  return { components, reportedNetMinor, reconciles, rowCount: normalized.length };
}
