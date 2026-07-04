/**
 * commerceApi — Square + PayPal SANDBOX, READ-ONLY payout pull (W4.1-C/D).
 *
 * Runs on the server (Deno) because it holds the provider access tokens, which
 * MUST NEVER reach the browser. It pulls settlements/payouts + their component
 * transactions read-only and normalizes them into the SAME split as the
 * file-import path — the classification logic here is a deliberate mirror of
 * apps/app/src/ecommerce/payouts.ts squareRowsFrom / paypalRowsFrom (the split
 * math is provider-agnostic; each side only classifies rows). apiSync.test.ts on
 * the app side pins the mapping to the cent so the two stay in lockstep.
 *
 * READ-ONLY: only GET / search endpoints are called. Nothing writes to the
 * provider or moves money. SANDBOX base URLs only — production OAuth is a
 * separate, human-gated step (W4.1-C/D scope boundary).
 *
 * ⭐ EXACTLY-ONCE: the caller posts each payout via post_ecommerce_payout using
 * the provider's NATIVE payout id (payoutId below). The CSV upload path uses that
 * same native id, so both collapse on `ext:<provider>:payout:<id>` — one entry.
 */

/** A normalized payout ready for post_ecommerce_payout — minor units throughout. */
export interface CommercePayout {
  provider: "square" | "paypal";
  payoutId: string; // native id — the exactly-once anchor (shared with CSV path)
  payoutDate: string; // YYYY-MM-DD deposit date
  currency: string;
  grossMinor: number;
  feesMinor: number;
  refundsMinor: number;
  adjustMinor: number; // signed
  netMinor: number;
  reportedNetMinor: number | null;
  reconciles: boolean;
}

type Kind = "sale" | "fee" | "refund" | "adjustment";
export interface Row {
  kind: Kind;
  amountMinor: number;
}

/** Provider-agnostic split — identical to componentsFromRows in payouts.ts. */
export function componentsOf(rows: Row[]): { gross: number; fees: number; refunds: number; adjust: number; net: number } {
  let gross = 0, fees = 0, refunds = 0, adjust = 0;
  for (const r of rows) {
    if (!Number.isInteger(r.amountMinor)) throw new Error("row amount must be integer minor units");
    if (r.kind === "sale") gross += Math.abs(r.amountMinor);
    else if (r.kind === "fee") fees += Math.abs(r.amountMinor);
    else if (r.kind === "refund") refunds += Math.abs(r.amountMinor);
    else adjust += r.amountMinor;
  }
  return { gross, fees, refunds, adjust, net: gross - fees - refunds + adjust };
}

/** Shared signed gross/fee classifier — mirrors splitSignedGrossFee in payouts.ts. */
function splitSignedGrossFee(kind: "sale" | "refund" | "adjustment", grossMinor: number, feeMinor: number): Row[] {
  const out: Row[] = [];
  if (kind === "sale") {
    if (grossMinor !== 0) out.push({ kind: "sale", amountMinor: Math.abs(grossMinor) });
    if (feeMinor < 0) out.push({ kind: "fee", amountMinor: -feeMinor });
    else if (feeMinor > 0) out.push({ kind: "adjustment", amountMinor: feeMinor });
  } else if (kind === "refund") {
    if (grossMinor !== 0) out.push({ kind: "refund", amountMinor: Math.abs(grossMinor) });
    if (feeMinor !== 0) out.push({ kind: "adjustment", amountMinor: feeMinor });
  } else {
    if (grossMinor !== 0) out.push({ kind: "adjustment", amountMinor: grossMinor });
    if (feeMinor < 0) out.push({ kind: "fee", amountMinor: -feeMinor });
    else if (feeMinor > 0) out.push({ kind: "adjustment", amountMinor: feeMinor });
  }
  return out;
}

function isoDate(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid timestamp: ${ts}`);
  return d.toISOString().slice(0, 10);
}
function payoutId(id: string): string {
  const v = (id ?? "").trim();
  if (!v) throw new Error("payout id required for idempotency");
  return v;
}

// ── HTTP helper (read-only, sandbox) ─────────────────────────────────────────
async function getJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Square — Payouts API (sandbox connect.squareupsandbox.com), READ-ONLY
// ═══════════════════════════════════════════════════════════════════════════
const SQUARE_SANDBOX_BASE = "https://connect.squareupsandbox.com";
const SQUARE_VERSION = "2024-01-18";

interface SquareMoney { amount?: number | null; currency?: string | null }

export function squareRow(type: string, gross: number, fees: number): Row[] {
  const t = (type ?? "").trim().toLowerCase();
  if (t === "deposit" || t === "transfer" || t === "payout") return []; // the payout line itself
  if (gross === 0 && fees === 0) return [];
  let kind: "sale" | "refund" | "adjustment";
  if (t === "charge" || t === "payment" || t === "sale") kind = "sale";
  else if (t === "refund") kind = "refund";
  else kind = "adjustment";
  return splitSignedGrossFee(kind, gross, fees);
}

/**
 * Pull recent Square payouts + their entries (read-only) and normalize each into
 * a CommercePayout. location_id + access token come from the caller (env).
 */
export async function fetchSquarePayouts(accessToken: string, locationId: string): Promise<CommercePayout[]> {
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json",
  };
  const list = await getJson(
    `${SQUARE_SANDBOX_BASE}/v2/payouts?location_id=${encodeURIComponent(locationId)}&status=PAID`,
    headers,
  );
  const payouts = (list.payouts as Array<Record<string, unknown>> | undefined) ?? [];
  const out: CommercePayout[] = [];
  for (const p of payouts) {
    const id = payoutId(String(p.id ?? ""));
    const amount = (p.amount_money as SquareMoney | undefined) ?? {};
    const entriesResp = await getJson(`${SQUARE_SANDBOX_BASE}/v2/payouts/${encodeURIComponent(id)}/payout-entries`, headers);
    const entries = (entriesResp.payout_entries as Array<Record<string, unknown>> | undefined) ?? [];
    const rows: Row[] = [];
    for (const e of entries) {
      const gm = (e.gross_amount_money as SquareMoney | undefined) ?? {};
      const fm = (e.fee_amount_money as SquareMoney | undefined) ?? {};
      rows.push(...squareRow(String(e.type ?? ""), Math.trunc(Number(gm.amount ?? 0)), Math.trunc(Number(fm.amount ?? 0))));
    }
    const c = componentsOf(rows);
    const reportedNetMinor = amount.amount != null ? Math.trunc(Number(amount.amount)) : null;
    out.push({
      provider: "square",
      payoutId: id,
      payoutDate: isoDate(String(p.created_at ?? "")),
      currency: String(amount.currency ?? "USD"),
      grossMinor: c.gross, feesMinor: c.fees, refundsMinor: c.refunds, adjustMinor: c.adjust, netMinor: c.net,
      reportedNetMinor,
      reconciles: reportedNetMinor == null ? true : reportedNetMinor === c.net,
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PayPal — OAuth token + Transaction Search (sandbox api-m.sandbox.paypal.com)
// READ-ONLY. Transactions grouped into a single settlement window per call.
// ═══════════════════════════════════════════════════════════════════════════
const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

/** Client-credentials token (read-only scope) — sandbox only. */
async function paypalToken(clientId: string, secret: string): Promise<string> {
  const res = await fetch(`${PAYPAL_SANDBOX_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${clientId}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`paypal token → ${res.status} ${await res.text().catch(() => "")}`);
  return String(((await res.json()) as { access_token?: string }).access_token ?? "");
}

function paypalTypeForEvent(code: string, signedGrossMinor: number): string {
  const c = (code ?? "").trim().toUpperCase();
  if (c.startsWith("T11")) return "refund";
  if (c === "T0400" || c.startsWith("T04")) return "general withdrawal";
  if (c.startsWith("T20") || c.startsWith("T03")) return "adjustment";
  return signedGrossMinor >= 0 ? "payment" : "adjustment";
}

export function toMinor(v: string): number {
  const cleaned = (v ?? "").replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`not a money value: ${v}`);
  return Math.round(n * 100);
}

export function paypalRow(eventCode: string, gross: number, fee: number): Row[] {
  const type = paypalTypeForEvent(eventCode, gross);
  if (type.includes("withdrawal") || type.includes("transfer to bank")) return []; // the payout line
  if (gross === 0 && fee === 0) return [];
  let kind: "sale" | "refund" | "adjustment";
  if (type.includes("refund")) kind = "refund";
  else if (type.includes("chargeback") || type.includes("reversal") || type.includes("dispute") || type.includes("hold")) kind = "adjustment";
  else if (gross > 0) kind = "sale";
  else kind = "adjustment";
  return splitSignedGrossFee(kind, gross, fee);
}

/**
 * Pull PayPal transactions for a settlement window (read-only) and roll them into
 * ONE CommercePayout keyed by the window's payout id (batch/settlement id passed
 * by the caller, or the start-date as a stable fallback). Sandbox only.
 */
export async function fetchPayPalPayout(
  clientId: string,
  secret: string,
  startIso: string,
  endIso: string,
  windowPayoutId?: string,
): Promise<CommercePayout | null> {
  const token = await paypalToken(clientId, secret);
  const params = new URLSearchParams({
    start_date: startIso,
    end_date: endIso,
    fields: "transaction_info",
    page_size: "500",
  });
  const resp = await getJson(`${PAYPAL_SANDBOX_BASE}/v1/reporting/transactions?${params}`, {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  const details = (resp.transaction_details as Array<Record<string, unknown>> | undefined) ?? [];
  if (details.length === 0) return null;
  const rows: Row[] = [];
  let currency = "USD";
  for (const d of details) {
    const info = (d.transaction_info as Record<string, unknown> | undefined) ?? {};
    const ga = (info.transaction_amount as { value?: string; currency_code?: string } | undefined) ?? {};
    const fa = (info.fee_amount as { value?: string } | undefined) ?? {};
    if (ga.currency_code) currency = String(ga.currency_code);
    rows.push(...paypalRow(String(info.transaction_event_code ?? ""), toMinor(String(ga.value ?? "0")), toMinor(String(fa.value ?? "0"))));
  }
  const c = componentsOf(rows);
  const id = payoutId(windowPayoutId ?? `paypal:${startIso.slice(0, 10)}`);
  return {
    provider: "paypal",
    payoutId: id,
    payoutDate: isoDate(endIso),
    currency,
    grossMinor: c.gross, feesMinor: c.fees, refundsMinor: c.refunds, adjustMinor: c.adjust, netMinor: c.net,
    reportedNetMinor: c.net,
    reconciles: true,
  };
}
