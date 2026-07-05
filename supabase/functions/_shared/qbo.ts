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

// Intuit recommends every integration capture this trace-id header for support
// troubleshooting (CONN-2). Centralized here so the header name is never a
// per-callsite literal, and every QBO fetch reports it the same way.
export const INTUIT_TID_HEADER = "intuit_tid";
export type OnIntuitTid = (tid: string | null) => void;

export function intuitTid(res: Response): string | null {
  return res.headers.get(INTUIT_TID_HEADER);
}

/** Log (Supabase fn logs) + forward the tid to the caller's callback, on both the success and error path. */
function reportTid(event: string, res: Response, onTid?: OnIntuitTid): string | null {
  const tid = intuitTid(res);
  console.log(JSON.stringify({ event, status: res.status, intuit_tid: tid }));
  onTid?.(tid);
  return tid;
}

export interface QboTokens { access_token: string; refresh_token: string; expires_in: number; }

export async function exchangeCode(code: string, onTid?: OnIntuitTid): Promise<QboTokens> {
  const res = await fetch(QBO_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI() }),
  });
  const tid = reportTid("qbo_token_exchange", res, onTid);
  // Don't include the provider body — it can echo the auth code / client metadata
  // and these messages get persisted to external_connections.last_error.
  if (!res.ok) throw new Error(`qbo_token_exchange_failed: ${res.status} tid=${tid ?? "none"}`);
  return await res.json();
}

export async function refreshToken(refresh_token: string, onTid?: OnIntuitTid): Promise<QboTokens> {
  const res = await fetch(QBO_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token }),
  });
  const tid = reportTid("qbo_token_refresh", res, onTid);
  if (!res.ok) throw new Error(`qbo_token_refresh_failed: ${res.status} tid=${tid ?? "none"}`);
  return await res.json();
}

/** Run a QBO SQL-ish query against a company (realm). */
export async function qboQuery(realmId: string, query: string, access_token: string, onTid?: OnIntuitTid): Promise<any> {
  const url = `${API_BASE()}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=70`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
  const tid = reportTid("qbo_query", res, onTid);
  if (!res.ok) throw new Error(`qbo_query_failed: ${res.status} tid=${tid ?? "none"} ${await res.text()}`);
  return await res.json();
}

/**
 * Page every row of one QBO entity (Purchase, Deposit, …) via STARTPOSITION/MAXRESULTS.
 * QBO caps a page at 1000; we walk until a short page. A hard page cap guards against a
 * runaway (a full migration is bounded by the sandbox company size).
 */
export async function qboQueryAll(
  realmId: string, entity: string, access_token: string,
  { pageSize = 1000, maxPages = 200, onTid }: { pageSize?: number; maxPages?: number; onTid?: OnIntuitTid } = {},
): Promise<any[]> {
  const out: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const start = page * pageSize + 1; // QBO STARTPOSITION is 1-based
    const q = `select * from ${entity} startposition ${start} maxresults ${pageSize}`;
    const resp = await qboQuery(realmId, q, access_token, onTid);
    const rows: any[] = resp?.QueryResponse?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Fetch QBO's own Trial Balance report as of a date. Returns a flat list of
 * { name, debit_minor, credit_minor } rows — this is the provider's source of
 * truth we diff the migrated ledger against, to the cent (the trust moment).
 */
export interface ProviderTbRow { name: string; debit_minor: number; credit_minor: number; }
export async function qboTrialBalance(
  realmId: string, access_token: string, asOf?: string, onTid?: OnIntuitTid,
): Promise<{ rows: ProviderTbRow[]; asOf: string | null }> {
  const p = new URLSearchParams({ minorversion: "70" });
  if (asOf) p.set("end_date", asOf);
  const url = `${API_BASE()}/v3/company/${realmId}/reports/TrialBalance?${p.toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" } });
  const tid = reportTid("qbo_trial_balance", res, onTid);
  if (!res.ok) throw new Error(`qbo_report_failed: ${res.status} tid=${tid ?? "none"} ${await res.text()}`);
  const report = await res.json();
  return { rows: parseTrialBalanceReport(report), asOf: report?.Header?.EndPeriod ?? asOf ?? null };
}

/** Flatten QBO's nested report Rows into { name, debit_minor, credit_minor }. */
export function parseTrialBalanceReport(report: any): ProviderTbRow[] {
  const out: ProviderTbRow[] = [];
  const walk = (rows: any[]) => {
    for (const r of rows ?? []) {
      if (r?.Rows?.Row) walk(r.Rows.Row);
      const cols: any[] = r?.ColData ?? [];
      if (cols.length >= 3 && (r?.type === "Data" || !r?.type)) {
        const name = String(cols[0]?.value ?? "").trim();
        if (!name) continue;
        const debit = toMinor(cols[1]?.value);
        const credit = toMinor(cols[2]?.value);
        if (debit !== 0 || credit !== 0) out.push({ name, debit_minor: debit, credit_minor: credit });
      }
    }
  };
  walk(report?.Rows?.Row ?? []);
  return out;
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

export function toMinor(n: number | string | undefined): number {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
}
