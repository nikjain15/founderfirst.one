/**
 * Plaid API helpers (SANDBOX build — Roadmap §W2.3). Mirrors _shared/qbo.ts.
 *
 * Secrets come from the fn environment (never hardcoded, never the browser):
 *   PLAID_CLIENT_ID, plus the Plaid secret — selected by PLAID_ENV: production
 *   reads PLAID_SECRET_PRODUCTION, sandbox/development read PLAID_SECRET_SANDBOX
 *   (a bare PLAID_SECRET is honoured as a fallback for older deploys),
 *   PLAID_ENV (defaults 'sandbox').
 * Base URL is chosen by PLAID_ENV; this build targets sandbox. Production requires
 * Plaid's app review (a Nik step before >10 live users) — flip PLAID_ENV and set
 * PLAID_SECRET_PRODUCTION then; no code change needed to switch envs.
 */
const PLAID_ENV = () => Deno.env.get("PLAID_ENV") ?? "sandbox";
const API_BASE = () => {
  switch (PLAID_ENV()) {
    case "production": return "https://production.plaid.com";
    case "development": return "https://development.plaid.com";
    default: return "https://sandbox.plaid.com";
  }
};
const CLIENT_ID = () => Deno.env.get("PLAID_CLIENT_ID") ?? "";
// Pick the secret by env so a single deploy holds both keys. Production uses the
// production secret; sandbox/development use the sandbox secret. A bare
// PLAID_SECRET remains a fallback for older single-secret deploys.
export const plaidSecret = () => {
  const env = PLAID_ENV();
  const specific = env === "production"
    ? Deno.env.get("PLAID_SECRET_PRODUCTION")
    : Deno.env.get("PLAID_SECRET_SANDBOX");
  return specific ?? Deno.env.get("PLAID_SECRET") ?? "";
};
const SECRET = () => plaidSecret();

// Webhook target: Plaid POSTs item/transaction events here. Defaults to the
// deployed plaid-webhook fn; override with PLAID_WEBHOOK_URL if fronted by a tunnel.
export const webhookUrl = () =>
  Deno.env.get("PLAID_WEBHOOK_URL") ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/plaid-webhook`;

async function plaid<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID(), secret: SECRET(), ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json as { error_code?: string; error_message?: string };
    throw new Error(err.error_message ?? err.error_code ?? `plaid_http_${res.status}`);
  }
  return json as T;
}

// ── Webhook JWT verification (Plaid signs each webhook; header Plaid-Verification).
// Plaid signs with ES256; the kid → key comes from /webhook_verification_key/get.
// The JWT payload carries request_body_sha256; we recompute it over the RAW body
// and compare, so a forged body (even with a stale-but-valid JWT) is rejected.
// Returns true only if signature + body hash + freshness all check out.
const b64urlToBytes = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};
const sha256Hex = async (s: string): Promise<string> => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
};

const getWebhookVerificationKey = (keyId: string) =>
  plaid<{ key: JsonWebKey & { alg?: string; expired_at?: string | null } }>(
    "/webhook_verification_key/get", { key_id: keyId },
  );

export async function verifyPlaidJwt(jwt: string, rawBody: string): Promise<boolean> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as { alg?: string; kid?: string };
  if (header.alg !== "ES256" || !header.kid) return false;   // reject alg-confusion / unsigned

  const { key } = await getWebhookVerificationKey(header.kid);
  const pub = await crypto.subtle.importKey(
    "jwk", { ...key, alg: undefined } as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  const sig = b64urlToBytes(parts[2]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const okSig = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, signed);
  if (!okSig) return false;

  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as
    { request_body_sha256?: string; iat?: number };
  // freshness: reject JWTs older than 5 min (replay window per Plaid guidance).
  if (typeof payload.iat === "number" && Date.now() / 1000 - payload.iat > 300) return false;
  const bodyHash = await sha256Hex(rawBody);
  return typeof payload.request_body_sha256 === "string" &&
    payload.request_body_sha256 === bodyHash;
}

export const createLinkToken = (userId: string) =>
  plaid<{ link_token: string; expiration: string }>("/link/token/create", {
    user: { client_user_id: userId },
    client_name: "Penny by FounderFirst",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
    webhook: webhookUrl(),
  });

export const exchangePublicToken = (publicToken: string) =>
  plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });

export const getItem = (accessToken: string) =>
  plaid<{ item: { item_id: string; institution_id?: string } }>("/item/get", { access_token: accessToken });

export const getInstitution = (institutionId: string) =>
  plaid<{ institution: { name: string } }>("/institutions/get_by_id", {
    institution_id: institutionId, country_codes: ["US"],
  });

export interface PlaidTxn {
  transaction_id: string;
  account_id: string;
  date: string;
  amount: number;            // Plaid: positive = money OUT of the account
  name?: string;
  merchant_name?: string;
  iso_currency_code?: string | null;
  pending?: boolean;
}
export interface SyncPage {
  added: PlaidTxn[];
  modified: PlaidTxn[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

// One page of /transactions/sync. Cursor null on first pull.
export const transactionsSync = (accessToken: string, cursor: string | null) =>
  plaid<SyncPage>("/transactions/sync", {
    access_token: accessToken,
    ...(cursor ? { cursor } : {}),
    count: 500,
  });

// SANDBOX ONLY — fire a synthetic webhook so E2E can prove the sync path without
// waiting for Plaid to deliver one. No-op semantics in production.
export const sandboxFireWebhook = (accessToken: string, code = "SYNC_UPDATES_AVAILABLE") =>
  plaid("/sandbox/item/fire_webhook", { access_token: accessToken, webhook_code: code });

// Convert a Plaid txn to our signed minor-unit convention (+into bank / −out).
// Plaid amount>0 is an OUTFLOW, so we negate: outflow → negative (money leaves bank).
export function toSignedMinor(t: PlaidTxn): number {
  const ccyMinor = Math.round(t.amount * 100);
  return -ccyMinor;
}

export function normalizeTxn(t: PlaidTxn): Record<string, unknown> {
  return {
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    date: t.date,
    amount_minor: toSignedMinor(t),
    name: t.merchant_name ?? t.name ?? "Bank transaction",
    iso_currency: t.iso_currency_code ?? "USD",
    pending: t.pending ?? false,
    raw: t as unknown as Record<string, unknown>,
  };
}
