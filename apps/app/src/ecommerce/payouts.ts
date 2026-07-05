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
 * All five majors ship here: Stripe · Shopify (W4.1) + PayPal · Square · Amazon
 * (W4.1-B) — each one is a connector-registry seed row + one parser + one
 * `PAYOUT_PARSERS` entry. The split MATH is provider-agnostic and lives in
 * `componentsFromRows`; each parser only knows how to CLASSIFY its own report
 * rows into the shared `PayoutRowKind`. No rewrite — a new provider is data + a
 * classifier, never a change to the posting path.
 *
 * File/report import is the fallback + starting point (no OAuth lead time):
 * Stripe balance-transactions CSV, Shopify payout CSV, PayPal transaction CSV,
 * Square payout-details CSV, and Amazon's tab-delimited V2 flat-file settlement
 * report. An API sync path can feed the SAME `PayoutRow[]` later (gated on
 * provider credentials Nik is registering — explicit follow-up, not this card).
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

// ═══════════════════════════════════════════════════════════════════════════
// PayPal — transaction / activity report CSV (W4.1-B, file-import first)
//
// Format: the PayPal transaction report ("Activity download" / Transactions
// report), whose balance-affecting rows carry Type, Status, Currency, Gross,
// Fee, Net and Transaction ID columns. Format doc:
//   https://developer.paypal.com/docs/reports/reference/transactions-report/
//
// POLARITY (differs from Stripe/Shopify — the fixture tests pin this):
//   • Fee is SIGNED from the merchant's side: a fee on a sale is NEGATIVE,
//     a fee credited back on a refund is POSITIVE.
//   • Net = Gross + Fee on every row.
//   • A refund row's Gross is NEGATIVE.
//   • "General Withdrawal" / transfer-to-bank rows are the payout leaving
//     PayPal — the net line itself, never a component (mirrors Stripe `payout`).
// ═══════════════════════════════════════════════════════════════════════════
export interface PayPalTxnRow {
  type: string;
  gross: string | number; // signed
  fee: string | number; // signed (fee on a sale is negative)
}

// ── PayPal exactly-once anchor (Option A, Nik 4 Jul) ─────────────────────────
// A PayPal settlement window has NO native "payout/batch id" the way Square or
// Stripe do (Transaction Search groups by date range, not by settlement). The
// ONE thing that is the same on both the API pull and the CSV export — and that
// IS the actual payout — is the TRANSFER-TO-BANK (General Withdrawal) transaction
// that moves the balance out to the owner's bank. We key every PayPal payout on
// THAT transaction's id, so the API path and a CSV upload of the same payout
// derive the identical `ext:paypal:payout:<id>` key and collapse to one post.
//
// The withdrawal is PayPal event code T0400 (and the T04xx family). Named here so
// no path inlines the literal (centralization gate).
export const PAYPAL_WITHDRAWAL_EVENT_CODE = "T0400";
export const PAYPAL_WITHDRAWAL_EVENT_PREFIX = "T04";
/** Substrings that identify the withdrawal/transfer-to-bank row by its human type. */
export const PAYPAL_TRANSFER_TYPE_HINTS = ["withdrawal", "transfer to bank"] as const;

/** The withdrawal/transfer of the payout itself — excluded from the split AND
 *  from the report-net sum (it IS the net, not a component of it). */
function isPayPalTransferRow(type: string): boolean {
  const t = type.trim().toLowerCase();
  return PAYPAL_TRANSFER_TYPE_HINTS.some((h) => t.includes(h));
}

/** Is this PayPal transaction_event_code the transfer-to-bank (withdrawal)? */
export function isPayPalWithdrawalEventCode(code: string): boolean {
  const c = (code ?? "").toString().trim().toUpperCase();
  return c === PAYPAL_WITHDRAWAL_EVENT_CODE || c.startsWith(PAYPAL_WITHDRAWAL_EVENT_PREFIX);
}

/**
 * Derive the ONE canonical PayPal payout id (Option A) from the transfer-to-bank
 * transaction ids seen in a settlement window. This is the single source of truth
 * both the API path and the CSV path call, so the same payout collapses to one
 * `ext:paypal:payout:<id>` key regardless of how it was ingested.
 *
 * Returns null when the window has NO withdrawal (money still sitting in the
 * PayPal balance, not yet paid out) — that is NOT a completed payout, so the
 * caller must SKIP it rather than synthesize a date-based id and post an
 * incomplete payout (mirrors the "non-reconciling → skip, never plug" rule).
 *
 * If a window somehow carries more than one withdrawal, we use the FIRST by a
 * stable sort so the id is deterministic across paths/re-pulls.
 */
export function paypalCanonicalPayoutId(withdrawalTxnIds: string[]): string | null {
  const ids = withdrawalTxnIds.map((s) => (s ?? "").toString().trim()).filter((s) => s.length > 0);
  if (ids.length === 0) return null;
  ids.sort();
  return ids[0];
}

/**
 * Classify one signed gross/fee pair into normalized rows. Shared by the PayPal
 * and Square parsers, whose reports both state `net = gross + fee` with a signed
 * fee column — the classification preserves each row's signed contribution, so
 * Σcomponents always equals Σ(gross+fee) and the payout ties by construction.
 */
function splitSignedGrossFee(
  rowKind: "sale" | "refund" | "adjustment",
  grossMinor: number,
  feeMinor: number,
  ref: string,
): PayoutRow[] {
  const out: PayoutRow[] = [];
  if (rowKind === "sale") {
    if (grossMinor !== 0) out.push({ kind: "sale", amountMinor: Math.abs(grossMinor), ref });
    // a sale's fee is withheld (negative) → fee bucket; a positive fee on a sale
    // (rare correction) increases the deposit → signed adjustment
    if (feeMinor < 0) out.push({ kind: "fee", amountMinor: -feeMinor, ref: `${ref}:fee` });
    else if (feeMinor > 0) out.push({ kind: "adjustment", amountMinor: feeMinor, ref: `${ref}:fee` });
  } else if (rowKind === "refund") {
    if (grossMinor !== 0) out.push({ kind: "refund", amountMinor: Math.abs(grossMinor), ref });
    // fee movement on a refund row is the provider's fee credit-back (usually +,
    // sometimes 0/none) — a signed adjustment either way
    if (feeMinor !== 0) out.push({ kind: "adjustment", amountMinor: feeMinor, ref: `${ref}:fee` });
  } else {
    if (grossMinor !== 0) out.push({ kind: "adjustment", amountMinor: grossMinor, ref });
    if (feeMinor < 0) out.push({ kind: "fee", amountMinor: -feeMinor, ref: `${ref}:fee` });
    else if (feeMinor > 0) out.push({ kind: "adjustment", amountMinor: feeMinor, ref: `${ref}:fee` });
  }
  return out;
}

export function paypalRowsFrom(rows: PayPalTxnRow[]): PayoutRow[] {
  const out: PayoutRow[] = [];
  for (const raw of rows) {
    const t = (raw.type || "").toString().trim().toLowerCase();
    if (isPayPalTransferRow(t)) continue; // the payout line itself
    const gross = toMinor(raw.gross);
    const fee = toMinor(raw.fee);
    if (gross === 0 && fee === 0) continue;
    let kind: "sale" | "refund" | "adjustment";
    if (t.includes("refund")) kind = "refund";
    else if (t.includes("chargeback") || t.includes("reversal") || t.includes("dispute") || t.includes("hold"))
      kind = "adjustment";
    else if (gross > 0) kind = "sale"; // Express Checkout Payment, Website Payment, …
    else kind = "adjustment"; // any other negative mover (adjustments, fees debited)
    out.push(...splitSignedGrossFee(kind, gross, fee, raw.type));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Square — payout (transfer) report CSV (W4.1-B, file-import first)
//
// Format: the Square Dashboard transfer/payout details export — per-payment rows
// with Type (Charge / Refund / Adjustment / …), Gross Amount, Fees, Net Amount,
// Transaction ID, Payout ID columns. Format doc:
//   https://squareup.com/help/us/en/article/5104-transfer-reports
//
// POLARITY (fixture tests pin this): Fees are NEGATIVE on charges, and
// Net Amount = Gross Amount + Fees on every row (same signed-fee model as
// PayPal, opposite of Stripe/Shopify's positive fee column).
// ═══════════════════════════════════════════════════════════════════════════
export interface SquarePayoutRow {
  type: string;
  gross: string | number; // "Gross Amount", signed
  fees: string | number; // "Fees", signed (negative on charges)
}

export function squareRowsFrom(rows: SquarePayoutRow[]): PayoutRow[] {
  const out: PayoutRow[] = [];
  for (const raw of rows) {
    const t = (raw.type || "").toString().trim().toLowerCase();
    // a deposit/transfer row is the payout itself, not a component
    if (t === "deposit" || t === "transfer" || t === "payout") continue;
    const gross = toMinor(raw.gross);
    const fees = toMinor(raw.fees);
    if (gross === 0 && fees === 0) continue;
    let kind: "sale" | "refund" | "adjustment";
    if (t === "charge" || t === "payment" || t === "sale") kind = "sale";
    else if (t === "refund") kind = "refund";
    else kind = "adjustment"; // Adjustment / Dispute / Held funds / …
    out.push(...splitSignedGrossFee(kind, gross, fees, raw.type));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Amazon — flat-file settlement report V2 (W4.1-B, file-import first)
//
// Format: GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE — TAB-delimited; header row
// includes settlement-id, settlement-start-date, settlement-end-date,
// deposit-date, total-amount, currency, transaction-type, order-id, amount-type,
// amount-description, amount, posted-date. Format doc:
//   https://developer-docs.amazon.com/sp-api/docs/report-type-values-settlement
//
// SHAPE: the FIRST data row is the settlement SUMMARY — total-amount is the
// actual bank deposit and transaction-type is empty (it's the reconcile target,
// not a component). Every later row is ONE signed amount component:
//   transaction-type=Order,  amount-type=ItemPrice  (+) → gross sale
//   transaction-type=Order,  amount-type=ItemFees   (−) → fee (Commission, FBA…)
//   transaction-type=Refund, amount-type=ItemPrice  (−) → refund
//   transaction-type=Refund, fee reversals          (+) → adjustment
//   ServiceFee / Subscription Fee rows              (−) → fee
//   everything else (Adjustment, other-transaction, Promotion…) → signed adjustment
// Every mapping preserves the row's SIGNED contribution, so Σcomponents equals
// Σamounts and ties to total-amount exactly when the file is complete — a
// truncated upload fails the reconcile check instead of posting a wrong split.
// ═══════════════════════════════════════════════════════════════════════════
export interface AmazonSettlementRow {
  transactionType: string; // "transaction-type"
  amountType: string; // "amount-type"
  amount: string | number; // signed decimal
}

export function amazonRowsFrom(rows: AmazonSettlementRow[]): PayoutRow[] {
  const out: PayoutRow[] = [];
  for (const raw of rows) {
    const t = (raw.transactionType || "").toString().trim().toLowerCase();
    if (!t) continue; // the settlement summary row (reconcile target, not a component)
    const at = (raw.amountType || "").toString().trim().toLowerCase();
    const amt = toMinor(raw.amount);
    if (amt === 0) continue;
    const ref = `${raw.transactionType}:${raw.amountType}`;
    if (t === "order") {
      if (at.includes("fee")) out.push(amt < 0 ? { kind: "fee", amountMinor: -amt, ref } : { kind: "adjustment", amountMinor: amt, ref });
      else if (at.includes("promotion")) out.push({ kind: "adjustment", amountMinor: amt, ref });
      else if (amt > 0) out.push({ kind: "sale", amountMinor: amt, ref });
      else out.push({ kind: "adjustment", amountMinor: amt, ref });
    } else if (t === "refund") {
      if (amt < 0 && !at.includes("fee")) out.push({ kind: "refund", amountMinor: -amt, ref });
      else out.push({ kind: "adjustment", amountMinor: amt, ref }); // fee reversals (+) et al, signed
    } else if (t.includes("fee")) {
      // ServiceFee / subscription-fee rows: a withheld fee when negative
      out.push(amt < 0 ? { kind: "fee", amountMinor: -amt, ref } : { kind: "adjustment", amountMinor: amt, ref });
    } else {
      out.push({ kind: "adjustment", amountMinor: amt, ref }); // Adjustment / other-transaction / …
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV → PayoutComponents bridge (the upload UI's parse path).
//
// The upload surface (PayoutUpload.tsx) hands us the already-parsed report
// (headers + string rows, from import/csv.ts — which also sniffs the delimiter,
// so Amazon's TAB-delimited settlement file arrives here the same shape as a
// comma CSV) plus the provider key. Each provider's adapter maps ITS report
// columns onto its typed rows, runs its parser, and totals the report's own net
// for the reconcile check — so a parse bug surfaces to the owner BEFORE anything
// posts, never a silent plug (LEARNINGS #16). Kept DB-free + pure so the whole
// preview is unit-testable in node.
//
// FORMULA-INJECTION NOTE (import discipline, see export.ts + #211): report cells
// only ever become (a) integer minor units via toMinor — a formula string like
// "=SUM(A1:A9)" is NOT money and throws, surfacing as a parse error, or (b) a
// classification match against known lowercase type names — an unrecognized
// (possibly hostile) type string classifies as a signed adjustment or is
// ignored; the raw string itself never reaches the ledger. Everything the RPC
// posts is numbers + server-built memos; exports re-neutralize on the way out.
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
  /**
   * Set (with a reason) when this report is NOT a completed payout that can be
   * posted — currently PayPal windows with no transfer-to-bank transaction (money
   * still in the PayPal balance, not yet withdrawn). The caller MUST NOT post; it
   * shows the reason instead of synthesizing an id (avoids the old double-post).
   */
  skip?: { reason: "paypal_not_withdrawn" };
}

/** What a provider's report adapter extracts from an uploaded file. */
export interface PayoutReportParse {
  rows: PayoutRow[];
  /** The net the report itself declares, in minor units, when it carries one. */
  reportedNetMinor: number | null;
  /**
   * The canonical payout id an adapter DERIVES from the report itself (PayPal:
   * the transfer-to-bank transaction id — see paypalCanonicalPayoutId). When an
   * adapter sets this, it OVERRIDES the caller-supplied payoutId so the CSV and
   * API paths share one exactly-once anchor. `null` means "no completed payout in
   * this report" (e.g. PayPal window not yet withdrawn) → the caller must skip.
   * `undefined` means the adapter does not derive an id (use the caller's id).
   */
  canonicalPayoutId?: string | null;
}

/** Case/space/dash-insensitive header lookup → column index, or -1 ("Gross Amount",
 *  "transaction-type", "Fee" all normalize). */
function colIndex(headers: string[], ...names: string[]): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const want = names.map(norm);
  return headers.findIndex((h) => want.includes(norm(h)));
}

/** Shared type/amount/fee/net mapping — the Stripe balance-transactions export
 *  and the Shopify payout export both fit it (positive fee column). */
function typeAmountFeeCsv(
  csv: ParsedPayoutCsv,
  rowsFrom: (raw: { type: string; Type: string; amount: string; Amount: string; fee: string; Fee: string }[]) => PayoutRow[],
): PayoutReportParse {
  const { headers, rows } = csv;
  const cType = colIndex(headers, "type");
  const cAmount = colIndex(headers, "amount", "gross");
  const cFee = colIndex(headers, "fee", "fees");
  const cNet = colIndex(headers, "net");
  if (cType < 0 || cAmount < 0) {
    throw new Error("report is missing a Type and/or Amount column");
  }
  const raw = rows.map((r) => ({
    type: r[cType] ?? "",
    Type: r[cType] ?? "",
    amount: r[cAmount] ?? "0",
    Amount: r[cAmount] ?? "0",
    fee: cFee >= 0 ? (r[cFee] ?? "0") : "0",
    Fee: cFee >= 0 ? (r[cFee] ?? "0") : "0",
  }));
  const reportedNetMinor = cNet >= 0 ? rows.reduce((s, r) => s + toMinor(r[cNet] ?? "0"), 0) : null;
  return { rows: rowsFrom(raw), reportedNetMinor };
}

/** PayPal transaction/activity CSV → Type / Gross / Fee (+ Net). Withdrawal
 *  (transfer-to-bank) rows are the payout line itself — excluded from BOTH the
 *  split and the report-net sum, so the remaining rows reconcile to the deposit. */
function paypalCsv(csv: ParsedPayoutCsv): PayoutReportParse {
  const { headers, rows } = csv;
  const cType = colIndex(headers, "type");
  const cGross = colIndex(headers, "gross");
  const cFee = colIndex(headers, "fee");
  const cNet = colIndex(headers, "net");
  const cTxnId = colIndex(headers, "transaction id", "transactionid", "txn id");
  if (cType < 0 || cGross < 0) {
    throw new Error("report is missing a Type and/or Gross column — export the PayPal transaction (activity) CSV");
  }
  const isTransfer = (r: string[]) => isPayPalTransferRow(r[cType] ?? "");
  const component = rows.filter((r) => !isTransfer(r));
  const raw: PayPalTxnRow[] = component.map((r) => ({
    type: r[cType] ?? "",
    gross: r[cGross] ?? "0",
    fee: cFee >= 0 ? (r[cFee] ?? "0") : "0",
  }));
  const reportedNetMinor = cNet >= 0 ? component.reduce((s, r) => s + toMinor(r[cNet] ?? "0"), 0) : null;
  // Option A: the canonical payout id is the transfer-to-bank (withdrawal) row's
  // Transaction ID — the same money movement the API path keys on. No Transaction
  // ID column, or no withdrawal row → derivation yields null and the caller skips.
  const withdrawalTxnIds =
    cTxnId >= 0 ? rows.filter(isTransfer).map((r) => r[cTxnId] ?? "") : [];
  const canonicalPayoutId = paypalCanonicalPayoutId(withdrawalTxnIds);
  return { rows: paypalRowsFrom(raw), reportedNetMinor, canonicalPayoutId };
}

/** Square transfer/payout details CSV → Type / Gross Amount / Fees (+ Net Amount). */
function squareCsv(csv: ParsedPayoutCsv): PayoutReportParse {
  const { headers, rows } = csv;
  const cType = colIndex(headers, "type");
  const cGross = colIndex(headers, "gross amount", "gross");
  const cFees = colIndex(headers, "fees", "fee");
  const cNet = colIndex(headers, "net amount", "net");
  if (cType < 0 || cGross < 0) {
    throw new Error("report is missing a Type and/or Gross Amount column — export the Square payout (transfer) details CSV");
  }
  const raw: SquarePayoutRow[] = rows.map((r) => ({
    type: r[cType] ?? "",
    gross: r[cGross] ?? "0",
    fees: cFees >= 0 ? (r[cFees] ?? "0") : "0",
  }));
  const reportedNetMinor = cNet >= 0 ? rows.reduce((s, r) => s + toMinor(r[cNet] ?? "0"), 0) : null;
  return { rows: squareRowsFrom(raw), reportedNetMinor };
}

/** Amazon V2 flat-file settlement report (tab-delimited) → transaction-type /
 *  amount-type / amount, with the summary row's total-amount as the reported net. */
function amazonCsv(csv: ParsedPayoutCsv): PayoutReportParse {
  const { headers, rows } = csv;
  const cTxnType = colIndex(headers, "transaction-type");
  const cAmountType = colIndex(headers, "amount-type");
  const cAmount = colIndex(headers, "amount");
  const cTotal = colIndex(headers, "total-amount");
  if (cTxnType < 0 || cAmount < 0) {
    throw new Error("report is missing transaction-type and/or amount columns — upload the Amazon V2 flat-file settlement report");
  }
  const raw: AmazonSettlementRow[] = rows.map((r) => ({
    transactionType: r[cTxnType] ?? "",
    amountType: cAmountType >= 0 ? (r[cAmountType] ?? "") : "",
    amount: r[cAmount] ?? "0",
  }));
  // the summary row (no transaction-type) declares the actual deposit in total-amount
  let reportedNetMinor: number | null = null;
  if (cTotal >= 0) {
    const summary = rows.find((r) => (r[cTxnType] ?? "").trim() === "" && (r[cTotal] ?? "").trim() !== "");
    if (summary) reportedNetMinor = toMinor(summary[cTotal]);
  }
  return { rows: amazonRowsFrom(raw), reportedNetMinor };
}

/**
 * Registry of report adapters, keyed by provider — adding a provider = one
 * parser + one entry here (+ its connector-registry seed row). The upload UI
 * derives which tiles are LIVE from this registry (`hasPayoutParser`) + the
 * connector registry's status — never from a hardcoded provider list.
 */
export const PAYOUT_PARSERS: Partial<Record<PayoutProvider, { fromCsv: (csv: ParsedPayoutCsv) => PayoutReportParse }>> = {
  stripe: { fromCsv: (csv) => typeAmountFeeCsv(csv, stripeRowsFrom) },
  shopify: { fromCsv: (csv) => typeAmountFeeCsv(csv, shopifyRowsFrom) },
  paypal: { fromCsv: paypalCsv },
  square: { fromCsv: squareCsv },
  amazon: { fromCsv: amazonCsv },
};

/** Does a report parser exist for this connector key? (registry-driven tiles) */
export function hasPayoutParser(key: string): boolean {
  return key in PAYOUT_PARSERS;
}

/**
 * Parse an uploaded report for a provider: adapter → normalized rows → split
 * components, reconciled against the report's own declared net when present.
 */
export function parsePayoutCsv(
  provider: PayoutProvider,
  payoutId: string,
  payoutDate: string,
  currency: string,
  csv: ParsedPayoutCsv,
): ParsedPayout {
  const adapter = PAYOUT_PARSERS[provider];
  if (!adapter) throw new Error(`no report parser for provider ${provider}`);
  const { rows, reportedNetMinor, canonicalPayoutId } = adapter.fromCsv(csv);
  // When the adapter derives its own exactly-once anchor from the report (PayPal:
  // the transfer-to-bank txn id), it OVERRIDES the caller-supplied id so the CSV
  // and API paths collapse to one post. `null` = no completed payout → skip.
  const derivesId = canonicalPayoutId !== undefined;
  const effectiveId = derivesId ? (canonicalPayoutId ?? "") : payoutId;
  const components = componentsFromRows(provider, effectiveId, payoutDate, currency, rows);
  const reconciles = reportedNetMinor == null ? true : reportedNetMinor === components.netMinor;
  const skip =
    derivesId && canonicalPayoutId == null && provider === "paypal"
      ? { reason: "paypal_not_withdrawn" as const }
      : undefined;
  return { components, reportedNetMinor, reconciles, rowCount: rows.length, skip };
}
