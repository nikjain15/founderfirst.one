/**
 * taxbandits — TaxBandits e-file API client for the 1099-NEC spike (EFILE-A1).
 *
 * SPIKE, not GA. This proves the path: map Penny's EXISTING 1099-NEC roll-up
 * (W2.5 ninetynine_nec_summary) → the TaxBandits Create/Transmit payload, run a
 * TIN-match pre-check, and gate transmit behind an explicit human confirm.
 *
 * TRUST-GATE PRINCIPLES baked in:
 *   • NEVER auto-transmit — transmit is a separate, explicitly-confirmed call.
 *   • NO FAKE SUCCESS — if credentials are absent, transmit returns a DRY-RUN
 *     preview (the mapped payload + "would transmit"), never a synthesized
 *     accepted status. A provider reject is surfaced verbatim, never swallowed.
 *   • Creds come from env (TAXBANDITS_*), never inlined. Base URLs from env-
 *     selected sandbox/live.
 *
 * Auth: OAuth 2.0 via a self-signed JWS (HS256 over the client secret) exchanged
 * at the auth server for a 1-hour Bearer AccessToken (per TaxBandits docs).
 * The token is used as `Authorization: Bearer <token>` on API calls.
 *
 * NOTE: the HTTP-calling functions accept an injectable `fetchImpl` so tests run
 * network-free. The pure mappers (buildNecPayload, buildTinMatchPayload,
 * classifyAck) have NO I/O and are unit-tested directly.
 */

// ── env / config ─────────────────────────────────────────────────────────────
export interface TaxBanditsConfig {
  clientId: string;
  clientSecret: string;
  userToken: string;
  authUrl: string; // e.g. https://testoauth.expressauth.net/v2/tbsauth
  apiBase: string; // e.g. https://testapi.taxbandits.com/v1.7.3
}

/**
 * Read config from env. Returns null when creds are ABSENT — the caller MUST
 * treat null as "dry-run only", NEVER as an error-that-becomes-success.
 * We require ALL THREE secret parts; a partial set is treated as absent (a
 * half-configured integration must not look live).
 */
export function readTaxBanditsConfig(env: {
  get(k: string): string | undefined;
}): TaxBanditsConfig | null {
  const clientId = env.get("TAXBANDITS_CLIENT_ID") ?? "";
  const clientSecret = env.get("TAXBANDITS_CLIENT_SECRET") ?? "";
  const userToken = env.get("TAXBANDITS_USER_TOKEN") ?? "";
  if (!clientId || !clientSecret || !userToken) return null;
  // Sandbox by default; env selects live explicitly.
  const sandbox = (env.get("TAXBANDITS_ENV") ?? "sandbox").toLowerCase() !== "live";
  const authUrl = env.get("TAXBANDITS_AUTH_URL") ??
    (sandbox
      ? "https://testoauth.expressauth.net/v2/tbsauth"
      : "https://oauth.expressauth.net/v2/tbsauth");
  const apiBase = env.get("TAXBANDITS_API_BASE") ??
    (sandbox
      ? "https://testapi.taxbandits.com/V1.7.3"
      : "https://api.taxbandits.com/V1.7.3");
  return { clientId, clientSecret, userToken, authUrl, apiBase };
}

// ── the shape of Penny's existing 1099 roll-up (from ninetynine_nec_summary) ──
// We map FROM this — we do NOT redefine the vendor store.
export interface NecSummaryRow {
  vendor_id: string;
  vendor_name: string;
  is_1099_eligible: boolean;
  w9_on_file: boolean;
  tax_id_type: string | null; // 'ein' | 'ssn'
  tax_id_last4: string | null;
  reportable_minor: number;
  excluded_minor: number;
  payment_count: number;
  threshold_minor: number | null;
  meets_threshold: boolean;
}

// A vendor's full W-9 detail needed for an actual transmit. The W2.5 store keeps
// only last-4 TINs (data minimization), so a REAL transmit needs the full TIN +
// address supplied at confirm time. For the spike this is optional input; if
// absent the payload carries a masked placeholder and the row is flagged
// `tin_incomplete` so nothing looks ready-to-file when it isn't.
export interface VendorFiling {
  vendor_id: string;
  full_tin?: string; // 9 digits, no dashes — supplied at confirm, NEVER stored
  first_name?: string;
  last_name?: string;
  business_name?: string;
  is_business?: boolean;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// ── payer (the filing business) ──────────────────────────────────────────────
export interface PayerBusiness {
  businessName: string;
  ein?: string; // 9 digits — supplied at confirm for a real transmit
  einLast4?: string;
  email?: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
}

const TIN_RE = /^\d{9}$/;

/** Format a 9-digit EIN as NN-NNNNNNN (TaxBandits expects the dashed EIN). */
export function formatEin(tin: string): string {
  return `${tin.slice(0, 2)}-${tin.slice(2)}`;
}
/** Format a 9-digit SSN as NNN-NN-NNNN. */
export function formatSsn(tin: string): string {
  return `${tin.slice(0, 3)}-${tin.slice(3, 5)}-${tin.slice(5)}`;
}

// ── TIN-match payload (pre-check, before any transmit) ───────────────────────
export interface TinMatchRequest {
  Recipients: Array<{
    RecordId: string;
    Name: string;
    TINType: "EIN" | "SSN";
    TIN: string;
  }>;
}

/**
 * Build the TIN-match request from the summary + supplied full TINs. A vendor
 * WITHOUT a full TIN is EXCLUDED from the match (you can't match what you don't
 * have) and reported back to the caller as unmatched — never faked as matched.
 */
export function buildTinMatchPayload(
  rows: NecSummaryRow[],
  filings: Map<string, VendorFiling>,
): { request: TinMatchRequest; missingTin: string[] } {
  const recipients: TinMatchRequest["Recipients"] = [];
  const missingTin: string[] = [];
  for (const r of rows) {
    const f = filings.get(r.vendor_id);
    if (!f?.full_tin || !TIN_RE.test(f.full_tin)) {
      missingTin.push(r.vendor_id);
      continue;
    }
    const isEin = (r.tax_id_type ?? "ein") === "ein";
    recipients.push({
      RecordId: r.vendor_id,
      Name: r.vendor_name,
      TINType: isEin ? "EIN" : "SSN",
      TIN: isEin ? formatEin(f.full_tin) : formatSsn(f.full_tin),
    });
  }
  return { request: { Recipients: recipients }, missingTin };
}

// ── 1099-NEC Create payload ──────────────────────────────────────────────────
export interface NecCreateRequest {
  SubmissionManifest: { TaxYear: string; IsFederalFiling: boolean };
  ReturnHeader: {
    Business: {
      BusinessNm: string;
      TINType: "EIN";
      EIN: string | null; // null when full EIN not supplied (dry-run)
      Email?: string;
      USAddress?: Record<string, string>;
    };
  };
  ReturnData: Array<{
    RecordId: string;
    Recipient: {
      RecipientId: string;
      TINType: "EIN" | "SSN";
      TIN: string | null; // null when full TIN not supplied
      TINLast4?: string;
      FirstNm?: string;
      LastNm?: string;
      BusinessNm?: string;
      IsForeign: boolean;
      USAddress?: Record<string, string>;
    };
    NECFormData: { B1NEC: number; B4FedTaxWH: number };
  }>;
}

function minorToDollars(minor: number): number {
  return Math.round(minor) / 100;
}

/**
 * Map the NEC roll-up → the TaxBandits Create payload.
 *
 * Only vendors that MEET the threshold AND are 1099-eligible are included (the
 * roll-up already filters to eligible; we additionally require meets_threshold —
 * below-threshold vendors are not required filings). Returns per-row readiness
 * flags so the caller can BLOCK a transmit that isn't fully ready (missing TIN /
 * missing W-9 address) rather than silently filing an incomplete return.
 */
export function buildNecPayload(
  taxYear: number,
  payer: PayerBusiness,
  rows: NecSummaryRow[],
  filings: Map<string, VendorFiling>,
): {
  request: NecCreateRequest;
  included: string[];
  skippedBelowThreshold: string[];
  notReady: Array<{ vendor_id: string; reasons: string[] }>;
} {
  const included: string[] = [];
  const skippedBelowThreshold: string[] = [];
  const notReady: Array<{ vendor_id: string; reasons: string[] }> = [];
  const returnData: NecCreateRequest["ReturnData"] = [];

  for (const r of rows) {
    if (!r.is_1099_eligible) continue; // defensive; summary already filters
    if (!r.meets_threshold) {
      skippedBelowThreshold.push(r.vendor_id);
      continue;
    }
    const f = filings.get(r.vendor_id);
    const reasons: string[] = [];
    if (!r.w9_on_file) reasons.push("no_w9_on_file");
    if (!f?.full_tin || !TIN_RE.test(f.full_tin)) reasons.push("missing_tin");
    if (!f?.address1 || !f?.city || !f?.state || !f?.zip) reasons.push("missing_address");
    if (reasons.length) notReady.push({ vendor_id: r.vendor_id, reasons });

    const isEin = (r.tax_id_type ?? "ein") === "ein";
    const hasFullTin = !!f?.full_tin && TIN_RE.test(f.full_tin);
    included.push(r.vendor_id);
    returnData.push({
      RecordId: r.vendor_id,
      Recipient: {
        RecipientId: r.vendor_id,
        TINType: isEin ? "EIN" : "SSN",
        TIN: hasFullTin ? (isEin ? formatEin(f!.full_tin!) : formatSsn(f!.full_tin!)) : null,
        TINLast4: r.tax_id_last4 ?? undefined,
        FirstNm: f?.first_name,
        LastNm: f?.last_name,
        BusinessNm: f?.is_business ? (f?.business_name ?? r.vendor_name) : undefined,
        IsForeign: false,
        USAddress: f?.address1
          ? {
            Address1: f.address1,
            City: f.city ?? "",
            State: f.state ?? "",
            ZipCd: f.zip ?? "",
          }
          : undefined,
      },
      NECFormData: {
        B1NEC: minorToDollars(r.reportable_minor),
        B4FedTaxWH: 0,
      },
    });
  }

  const hasFullEin = !!payer.ein && TIN_RE.test(payer.ein);
  const request: NecCreateRequest = {
    SubmissionManifest: { TaxYear: String(taxYear), IsFederalFiling: true },
    ReturnHeader: {
      Business: {
        BusinessNm: payer.businessName,
        TINType: "EIN",
        EIN: hasFullEin ? formatEin(payer.ein!) : null,
        Email: payer.email,
        USAddress: payer.address1
          ? { Address1: payer.address1, City: payer.city ?? "", State: payer.state ?? "", ZipCd: payer.zip ?? "" }
          : undefined,
      },
    },
    ReturnData: returnData,
  };
  return { request, included, skippedBelowThreshold, notReady };
}

// ── ack classification — honest accept/reject ingestion ──────────────────────
export type AckOutcome = "accepted" | "rejected" | "error" | "submitted";
export interface ClassifiedAck {
  outcome: AckOutcome;
  submissionId: string | null;
  errors: unknown[];
  raw: unknown;
}

/**
 * Classify a TaxBandits Create/Transmit/Status response. A reject or any error
 * list is surfaced as `rejected`/`error` — NEVER collapsed into success. A
 * missing/garbage response is `error`, not `accepted`.
 */
export function classifyAck(resp: unknown): ClassifiedAck {
  const r = (resp ?? {}) as Record<string, unknown>;
  const errors = collectErrors(r);
  const submissionId = (r.SubmissionId as string) ?? null;
  const statusCode = Number(r.StatusCode ?? 0);
  const status = String(r.Status ?? "").toUpperCase();

  if (errors.length > 0) {
    return { outcome: "rejected", submissionId, errors, raw: resp };
  }
  if (statusCode && (statusCode < 200 || statusCode >= 300)) {
    return { outcome: "error", submissionId, errors, raw: resp };
  }
  if (status.includes("REJECT")) {
    return { outcome: "rejected", submissionId, errors, raw: resp };
  }
  if (status.includes("ACCEPT") || status.includes("TRANSMITTED") || status.includes("SUCCESS")) {
    return { outcome: "accepted", submissionId, errors, raw: resp };
  }
  // A 200 with a SubmissionId but no terminal status = created/submitted, NOT
  // accepted. We never upgrade "submitted" to "accepted".
  if (statusCode >= 200 && statusCode < 300 && submissionId) {
    return { outcome: "submitted", submissionId, errors, raw: resp };
  }
  return { outcome: "error", submissionId, errors, raw: resp };
}

/** Pull an Errors[] from anywhere TaxBandits nests it (top-level or per-record). */
export function collectErrors(r: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  const top = r.Errors;
  if (Array.isArray(top)) out.push(...top);
  const records = (r.ReturnData ?? r.Records ?? r.Recipients) as unknown;
  if (Array.isArray(records)) {
    for (const rec of records) {
      const e = (rec as Record<string, unknown>)?.Errors;
      if (Array.isArray(e)) out.push(...e);
    }
  }
  return out;
}

// ── TIN-match result classification ──────────────────────────────────────────
export interface TinMatchResult {
  matched: string[]; // vendor_ids that matched
  mismatched: string[]; // vendor_ids that did NOT match
  requestId: string | null;
}

/** Classify a TIN-match response into matched / mismatched vendor ids. */
export function classifyTinMatch(resp: unknown): TinMatchResult {
  const r = (resp ?? {}) as Record<string, unknown>;
  const requestId = (r.RequestId as string) ?? (r.SubmissionId as string) ?? null;
  const matched: string[] = [];
  const mismatched: string[] = [];
  const recs = (r.Recipients ?? r.ReturnData ?? r.TINMatchingRecords) as unknown;
  if (Array.isArray(recs)) {
    for (const rec of recs) {
      const o = rec as Record<string, unknown>;
      const id = String(o.RecordId ?? o.RecipientId ?? "");
      const st = String(o.TINMatchStatus ?? o.TINStatus ?? o.Status ?? "").toUpperCase();
      if (!id) continue;
      // Only an explicit match counts as matched; everything else (mismatch,
      // pending, error, unknown) is treated as NOT matched → blocks transmit.
      if (st.includes("MATCH") && !st.includes("MISMATCH") && !st.includes("NO")) matched.push(id);
      else mismatched.push(id);
    }
  }
  return { matched, mismatched, requestId };
}

// ── HTTP calls (injectable fetch for network-free tests) ─────────────────────
type FetchImpl = typeof fetch;

/** Base64URL encode a Uint8Array (no padding). */
function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

/**
 * Build the self-signed JWS TaxBandits expects (HS256 over the client secret).
 * `iat` must be server-synced in production; the caller may pass a synced value.
 */
export async function buildAuthJws(cfg: TaxBanditsConfig, iat: number): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: cfg.clientId, sub: cfg.clientId, aud: cfg.userToken, iat };
  const signingInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cfg.clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

/** Exchange the JWS for a Bearer access token. Throws on non-200 (fail-loud). */
export async function getAccessToken(
  cfg: TaxBanditsConfig,
  fetchImpl: FetchImpl = fetch,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<string> {
  const jws = await buildAuthJws(cfg, now());
  const resp = await fetchImpl(cfg.authUrl, { headers: { Authentication: jws } });
  const body = await resp.json().catch(() => ({}));
  const token = (body as Record<string, unknown>)?.AccessToken as string | undefined;
  if (!resp.ok || !token) {
    throw new Error(`taxbandits_auth_failed: status=${resp.status} ${JSON.stringify(body)}`);
  }
  return token;
}

async function apiPost(
  cfg: TaxBanditsConfig,
  token: string,
  path: string,
  body: unknown,
  fetchImpl: FetchImpl,
): Promise<unknown> {
  const resp = await fetchImpl(`${cfg.apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  // We DON'T throw on a non-2xx here — a reject/validation failure is a real,
  // ingestable outcome the caller records honestly. Only network-level failure
  // (thrown by fetch) fails loud.
  return { StatusCode: resp.status, ...(json as Record<string, unknown>) };
}

export function createNec(cfg: TaxBanditsConfig, token: string, req: NecCreateRequest, fetchImpl: FetchImpl = fetch) {
  return apiPost(cfg, token, "/Form1099NEC/Create", req, fetchImpl);
}
export function transmitNec(cfg: TaxBanditsConfig, token: string, submissionId: string, recordIds: string[], fetchImpl: FetchImpl = fetch) {
  return apiPost(cfg, token, "/Form1099NEC/Transmit", { SubmissionId: submissionId, RecordIds: recordIds }, fetchImpl);
}
export function requestTinMatch(cfg: TaxBanditsConfig, token: string, req: TinMatchRequest, fetchImpl: FetchImpl = fetch) {
  return apiPost(cfg, token, "/TINMatching/Request", req, fetchImpl);
}
export function statusNec(cfg: TaxBanditsConfig, token: string, submissionId: string, fetchImpl: FetchImpl = fetch) {
  return apiPost(cfg, token, "/Form1099NEC/Status", { SubmissionId: submissionId }, fetchImpl);
}
