/**
 * Xero OAuth2 + API helpers (ARCHITECTURE.md §6.4, §6.6). Confidential web-app
 * flow: authorize → code→token → call the Accounting API with the tenant header.
 * Tokens live server-side only (external_connections, service-role).
 */
export const XERO_AUTHORIZE = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS = "https://api.xero.com/connections";
export const XERO_API = "https://api.xero.com/api.xro/2.0";
// Scopes. This app was created after Xero's 2 Mar 2026 granular-scope cutoff, so
// the OLD broad scopes (accounting.transactions/reports/journals) no longer exist
// for it and return invalid_scope — verified empirically at the authorize endpoint.
// The granular replacements ARE available with no app review:
//   • accounting.settings.read         → chart of accounts (Accounts endpoint)
//   • accounting.contacts.read         → contacts
//   • accounting.banktransactions.read → BankTransactions endpoint (what we import)
// (See https://developer.xero.com/faq/granular-scopes — broad accounting.transactions
// split into invoices / payments / banktransactions.) Scope must be %20-delimited
// (URLSearchParams encodes spaces as '+', which Xero rejects) — see authorizeUrl.
export const XERO_SCOPE =
  "openid offline_access accounting.settings.read accounting.contacts.read accounting.banktransactions.read";

const CLIENT_ID = () => Deno.env.get("XERO_CLIENT_ID") ?? "";
const CLIENT_SECRET = () => Deno.env.get("XERO_CLIENT_SECRET") ?? "";
const REDIRECT_URI = () =>
  Deno.env.get("XERO_REDIRECT_URI") ??
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/xero-callback`;

function basicAuth(): string {
  return "Basic " + btoa(`${CLIENT_ID()}:${CLIENT_SECRET()}`);
}

export function authorizeUrl(state: string): string {
  // NOTE: scope must be %20-delimited, not '+'. URLSearchParams encodes spaces as
  // '+', which Xero rejects as a single invalid_scope — so build scope explicitly.
  const p = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID(),
    redirect_uri: REDIRECT_URI(),
    state,
  });
  return `${XERO_AUTHORIZE}?${p.toString()}&scope=${encodeURIComponent(XERO_SCOPE)}`;
}

export interface XeroTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCode(code: string): Promise<XeroTokens> {
  const res = await fetch(XERO_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI() }),
  });
  // Don't include the provider body — it can echo the auth code / client metadata
  // and these messages get persisted to external_connections.last_error.
  if (!res.ok) throw new Error(`xero_token_exchange_failed: ${res.status}`);
  return await res.json();
}

export async function refreshToken(refresh_token: string): Promise<XeroTokens> {
  const res = await fetch(XERO_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }),
  });
  if (!res.ok) throw new Error(`xero_token_refresh_failed: ${res.status}`);
  return await res.json();
}

/** List the tenants (organisations) this token can access. */
export async function listConnections(access_token: string): Promise<{ tenantId: string; tenantName: string }[]> {
  const res = await fetch(XERO_CONNECTIONS, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`xero_connections_failed: ${res.status}`);
  return await res.json();
}

export async function xeroGet(path: string, access_token: string, tenantId: string): Promise<unknown> {
  const res = await fetch(`${XERO_API}/${path}`, {
    headers: { Authorization: `Bearer ${access_token}`, "Xero-tenant-id": tenantId, Accept: "application/json" },
  });
  // Status only — never the provider body (it surfaces to the client `detail`/`note`
  // and persists to last_error). Keep the endpoint path (no secrets) for triage.
  if (!res.ok) throw new Error(`xero_api_failed ${path}: ${res.status}`);
  return await res.json();
}

/** Map a Xero account Class → our ledger account_type. */
export function mapXeroAccountType(klass: string): "asset" | "liability" | "equity" | "income" | "expense" {
  switch ((klass ?? "").toUpperCase()) {
    case "ASSET": return "asset";
    case "LIABILITY": return "liability";
    case "EQUITY": return "equity";
    case "REVENUE": return "income";
    case "EXPENSE": return "expense";
    default: return "expense";
  }
}

// Minor-unit scale by ISO-4217 exponent. JPY/KRW have 0 decimals (×1), most 2
// (×100), a few Gulf currencies 3 (×1000). A hardcoded ×100 inflated 0-decimal
// currencies 100×. Mirrors _shared/qbo.ts.
const ZERO_DECIMAL = new Set(["BIF","CLP","DJF","GNF","ISK","JPY","KMF","KRW","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"]);
const THREE_DECIMAL = new Set(["BHD","IQD","JOD","KWD","LYD","OMR","TND"]);
export function minorFactor(currency: string | undefined): number {
  const c = (currency ?? "USD").toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 1;
  if (THREE_DECIMAL.has(c)) return 1000;
  return 100;
}

/** Money string ("123.45") → integer minor units, scaled by the currency factor. */
export function toMinor(n: number | string | undefined, factor = 100): number {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return Math.round((Number.isFinite(v) ? v : 0) * factor);
}

/** Xero's "/Date(1612137600000+0000)/" or ISO → yyyy-mm-dd. */
export function xeroDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/\/Date\((\d+)/);
  if (m) return new Date(Number(m[1])).toISOString().slice(0, 10);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
