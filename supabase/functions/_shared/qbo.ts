/**
 * QuickBooks Online OAuth2 + Accounting API helpers (ARCHITECTURE.md §6.4, §6.6).
 * Mirrors _shared/xero.ts. Sandbox vs production base URL is chosen by QBO_ENV.
 */
export const QBO_AUTHORIZE = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

const CLIENT_ID = () => Deno.env.get("QBO_CLIENT_ID") ?? "";
const CLIENT_SECRET = () => Deno.env.get("QBO_CLIENT_SECRET") ?? "";
const REDIRECT_URI = () =>
  Deno.env.get("QBO_REDIRECT_URI") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/qbo-callback`;
const API_BASE = () =>
  (Deno.env.get("QBO_ENV") ?? "sandbox") === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

const basicAuth = () => "Basic " + btoa(`${CLIENT_ID()}:${CLIENT_SECRET()}`);

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID(), response_type: "code", scope: QBO_SCOPE,
    redirect_uri: REDIRECT_URI(), state,
  });
  return `${QBO_AUTHORIZE}?${p.toString()}`;
}

export interface QboTokens { access_token: string; refresh_token: string; expires_in: number; }

export async function exchangeCode(code: string): Promise<QboTokens> {
  const res = await fetch(QBO_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI() }),
  });
  // Don't include the provider body — it can echo the auth code / client metadata
  // and these messages get persisted to external_connections.last_error.
  if (!res.ok) throw new Error(`qbo_token_exchange_failed: ${res.status}`);
  return await res.json();
}

export async function refreshToken(refresh_token: string): Promise<QboTokens> {
  const res = await fetch(QBO_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }),
  });
  if (!res.ok) throw new Error(`qbo_token_refresh_failed: ${res.status}`);
  return await res.json();
}

/** Run a QBO SQL-ish query against a company (realm). */
export async function qboQuery(realmId: string, query: string, access_token: string): Promise<any> {
  const url = `${API_BASE()}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=70`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
  // Status only — never the provider body. The response can echo the request
  // (incl. the bearer token in some gateways) and these messages surface to the
  // client (`detail`) and persist to external_connections.last_error.
  if (!res.ok) throw new Error(`qbo_query_failed: ${res.status}`);
  return await res.json();
}

export function mapQboAccountType(classification: string): "asset" | "liability" | "equity" | "income" | "expense" {
  switch ((classification ?? "").toLowerCase()) {
    case "asset": return "asset";
    case "liability": return "liability";
    case "equity": return "equity";
    case "revenue": return "income";
    case "expense": return "expense";
    default: return "expense";
  }
}

// Minor-unit scale by ISO-4217 exponent. The ledger stores amount_minor per the
// home currency's smallest unit — JPY/KRW have 0 decimals (×1), most have 2 (×100),
// a few Gulf currencies 3 (×1000). A hardcoded ×100 inflated JPY 100× (the entry
// still *balances* per-currency, but every figure is 100× too large).
const ZERO_DECIMAL = new Set(["BIF","CLP","DJF","GNF","ISK","JPY","KMF","KRW","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);
const THREE_DECIMAL = new Set(["BHD","IQD","JOD","KWD","LYD","OMR","TND"]);
export function minorFactor(currency: string | undefined): number {
  const c = (currency ?? "USD").toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
}

export function toMinor(n: number | string | undefined, factor = 100): number {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return Math.round((Number.isFinite(v) ? v : 0) * factor);
}
