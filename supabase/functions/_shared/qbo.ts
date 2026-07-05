/**
 * QuickBooks Online OAuth2 + Accounting API helpers (ARCHITECTURE.md §6.4, §6.6).
 * Mirrors _shared/xero.ts. Sandbox vs production base URL is chosen by QBO_ENV.
 */
export const QBO_AUTHORIZE = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
// Intuit OAuth2 token revocation (IQ-1 disconnect) — revokes a grant at Intuit.
export const QBO_REVOKE = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

/**
 * Resilience knobs (IQ-1). Defaults MUST match get_qbo_config() in
 * 20260707130000_iq1_qbo_token_encryption.sql — they are the baked fallback used
 * when the config fetch hasn't landed. Thresholds are DATA (platform_config), not
 * magic numbers scattered across callsites.
 */
export interface QboConfig {
  qbo_max_retries: number;
  qbo_backoff_base_ms: number;
  qbo_backoff_max_ms: number;
  qbo_page_throttle_ms: number;
  qbo_state_ttl_minutes: number;
}
export const QBO_CONFIG_DEFAULTS: QboConfig = {
  qbo_max_retries: 4,
  qbo_backoff_base_ms: 500,
  qbo_backoff_max_ms: 30000,
  qbo_page_throttle_ms: 250,
  qbo_state_ttl_minutes: 10,
};

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

/** Marker error carrying the HTTP status so callers can react (e.g. 401→refresh). */
export class QboHttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "QboHttpError"; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse a Retry-After header (seconds, or an HTTP-date) into ms; null if absent.
 */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("Retry-After");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

/** exp backoff with cap; honors Retry-After when the server sent one. */
function backoffMs(attempt: number, cfg: QboConfig, res?: Response): number {
  const ra = res ? retryAfterMs(res) : null;
  const exp = cfg.qbo_backoff_base_ms * Math.pow(2, attempt);
  return Math.min(cfg.qbo_backoff_max_ms, Math.max(ra ?? 0, exp));
}

/**
 * Options threaded through the QBO client. `refresh` (IQ-1 reactive refresh) is an
 * async callback that returns a FRESH access token; when provided, a single 401 is
 * retried once with the new token before failing. `cfg` supplies retry/backoff
 * thresholds (centralized). A mutable `token` box lets a refresh update the token
 * used by subsequent paged requests in the same pull.
 */
export interface QboCallOpts {
  onTid?: OnIntuitTid;
  cfg?: QboConfig;
  refresh?: () => Promise<string>;
}

/**
 * Low-level GET with: exponential backoff + Retry-After on 429/5xx (bounded by
 * cfg.qbo_max_retries), and a single reactive refresh-on-401. Returns the parsed
 * JSON body. Token is passed by a getter so a refresh mid-call is picked up.
 */
async function qboGet(
  url: string, event: string, getToken: () => string, opts: QboCallOpts,
): Promise<any> {
  const cfg = opts.cfg ?? QBO_CONFIG_DEFAULTS;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/json" } });
    const tid = reportTid(event, res, opts.onTid);
    if (res.ok) return await res.json();

    // reactive refresh: one 401 → refresh the access token and retry once.
    if (res.status === 401 && opts.refresh && !refreshed) {
      refreshed = true;
      await res.body?.cancel();
      await opts.refresh(); // updates the token behind getToken()
      continue;            // does NOT count as a backoff attempt
    }

    // transient: 429 (rate limit) / 5xx → backoff + retry, bounded.
    if ((res.status === 429 || res.status >= 500) && attempt < cfg.qbo_max_retries) {
      const wait = backoffMs(attempt, cfg, res);
      await res.body?.cancel();
      await sleep(wait);
      continue;
    }

    throw new QboHttpError(res.status, `${event}_failed: ${res.status} tid=${tid ?? "none"} ${await res.text()}`);
  }
}

/** Run a QBO SQL-ish query against a company (realm). */
export async function qboQuery(
  realmId: string, query: string, access_token: string,
  onTid?: OnIntuitTid | QboCallOpts,
): Promise<any> {
  const opts: QboCallOpts = typeof onTid === "function" ? { onTid } : (onTid ?? {});
  const url = `${API_BASE()}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=70`;
  // when no refresh callback is provided, token is a constant.
  let tok = access_token;
  const wrapped: QboCallOpts = opts.refresh
    ? { ...opts, refresh: async () => { tok = await opts.refresh!(); return tok; } }
    : opts;
  return await qboGet(url, "qbo_query", () => tok, wrapped);
}

/**
 * Page every row of one QBO entity (Purchase, Deposit, …) via STARTPOSITION/MAXRESULTS.
 * QBO caps a page at 1000; we walk until a short page. A hard page cap guards against a
 * runaway (a full migration is bounded by the sandbox company size).
 */
export async function qboQueryAll(
  realmId: string, entity: string, access_token: string,
  { pageSize = 1000, maxPages = 200, onTid, cfg, refresh }:
    { pageSize?: number; maxPages?: number } & QboCallOpts = {},
): Promise<any[]> {
  const conf = cfg ?? QBO_CONFIG_DEFAULTS;
  // one shared, refreshable token across all pages of this pull.
  let tok = access_token;
  const opts: QboCallOpts = {
    onTid, cfg: conf,
    refresh: refresh ? async () => { tok = await refresh(); return tok; } : undefined,
  };
  const out: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    if (page > 0 && conf.qbo_page_throttle_ms > 0) await sleep(conf.qbo_page_throttle_ms); // rate-limit-friendly paging
    const start = page * pageSize + 1; // QBO STARTPOSITION is 1-based
    const q = `select * from ${entity} startposition ${start} maxresults ${pageSize}`;
    const resp = await qboQuery(realmId, q, tok, opts);
    const rows: any[] = resp?.QueryResponse?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Revoke a QBO grant at Intuit (IQ-1 disconnect). Pass the refresh token (Intuit
 * accepts either token; the refresh token revokes the whole grant). Returns true
 * on a 200, false otherwise — the caller marks the connection 'revoked' regardless
 * (a revoke that fails at Intuit must not strand the user on a live-looking grant),
 * but we surface the outcome so it can be logged.
 */
export async function revokeToken(token: string, onTid?: OnIntuitTid): Promise<boolean> {
  const res = await fetch(QBO_REVOKE, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
  });
  reportTid("qbo_token_revoke", res, onTid);
  return res.ok;
}

/**
 * Fetch QBO's own Trial Balance report as of a date. Returns a flat list of
 * { name, debit_minor, credit_minor } rows — this is the provider's source of
 * truth we diff the migrated ledger against, to the cent (the trust moment).
 */
export interface ProviderTbRow { name: string; debit_minor: number; credit_minor: number; }
export async function qboTrialBalance(
  realmId: string, access_token: string, asOf?: string, onTid?: OnIntuitTid | QboCallOpts,
): Promise<{ rows: ProviderTbRow[]; asOf: string | null }> {
  const opts: QboCallOpts = typeof onTid === "function" ? { onTid } : (onTid ?? {});
  const p = new URLSearchParams({ minorversion: "70" });
  if (asOf) p.set("end_date", asOf);
  const url = `${API_BASE()}/v3/company/${realmId}/reports/TrialBalance?${p.toString()}`;
  // a refresh callback that returns a fresh token, threaded so 401→refresh works.
  let tok = access_token;
  const wrapped: QboCallOpts = opts.refresh
    ? { ...opts, refresh: async () => { tok = await opts.refresh!(); return tok; } }
    : opts;
  const report = await qboGet(url, "qbo_trial_balance", () => tok, wrapped);
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

export type LedgerType = "asset" | "liability" | "equity" | "income" | "expense";

/**
 * Map a QBO Classification to a ledger account type.
 *
 * IQ-1: an UNKNOWN classification returns null — it must NOT be silently bucketed
 * as 'expense' (that produced silently-wrong books). The caller routes a null to
 * the uncategorized/holding account and flags the account for mapping review.
 */
export function mapQboAccountType(classification: string): LedgerType | null {
  switch ((classification ?? "").toLowerCase()) {
    case "asset": return "asset";
    case "liability": return "liability";
    case "equity": return "equity";
    case "revenue": return "income";
    case "expense": return "expense";
    default: return null;
  }
}

export function toMinor(n: number | string | undefined): number {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
}
