/**
 * Plaid API helpers (SANDBOX build — Roadmap §W2.3). Mirrors _shared/qbo.ts.
 *
 * Secrets come from the fn environment (never hardcoded, never the browser):
 *   PLAID_CLIENT_ID, PLAID_SECRET (the integrator sets this to the SANDBOX secret
 *   from ~/.config/founderfirst/secrets.env → PLAID_SECRET_SANDBOX at deploy),
 *   PLAID_ENV (defaults 'sandbox').
 * Base URL is chosen by PLAID_ENV; this build targets sandbox. Production requires
 * Plaid's app review (a Nik step before >10 live users) — flip PLAID_ENV +
 * PLAID_SECRET to production then.
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
const SECRET = () => Deno.env.get("PLAID_SECRET") ?? "";

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
