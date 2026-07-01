/**
 * ledger-accounts — create or edit a chart-of-accounts row (the write-path;
 * ARCHITECTURE.md §6, §8).
 *
 * POST { org_id, name, type:'asset'|'liability'|'equity'|'income'|'expense',
 *        code?, id?, parent_id?, currency?, archived? }
 *
 * Omit `id` to create; pass `id` to edit (rename / recode / re-parent / archive).
 * ledger_accounts is RLS-locked against client writes; upsert_ledger_account runs
 * as service role and checks can_write_org_as with the JWT-verified actor. Reads
 * (the chart of accounts) go direct under RLS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"];
const MAX_CODE_LEN = 32;

// Map raw Postgres error codes to friendly, leak-free messages. Raw pg text
// names internal constraints/columns (e.g. "ledger_accounts_org_id_code_key",
// "value too long for type character(3)") — never surface that to a client.
// Codes we raise ourselves with a safe, intentional message pass through.
const PG_FRIENDLY: Record<string, string> = {
  "23505": "code_in_use", // unique(org_id, code)
  "23503": "bad_parent", // FK / cross-org parent
  "22001": "value_too_long",
};
const PG_SAFE_MESSAGE = new Set([
  "23514", // check_violation — our raises: bad_currency / account_cycle / account_type_locked / account_nonzero_balance / bad_parent_type
  "insufficient_privilege",
  "no_data_found",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.org_id ?? "");
  const name = String(body?.name ?? "").trim();
  const type = String(body?.type ?? "");
  if (!orgId) return json({ error: "bad_org" }, 400);
  if (name.length < 1 || name.length > 120) return json({ error: "bad_name" }, 400);
  if (!ACCOUNT_TYPES.includes(type)) return json({ error: "bad_type" }, 400);

  // code: optional, but bound the length (the column is untyped text → a 5,000-char
  // code would otherwise sail straight in and wreck payloads / UI layout).
  const codeRaw = body?.code == null ? null : String(body.code).trim();
  const code = codeRaw === "" ? null : codeRaw;
  if (code !== null && code.length > MAX_CODE_LEN) return json({ error: "bad_code" }, 400);

  // currency: optional (NULL inherits the org home). Validate the ISO-4217 SHAPE
  // here — a non-3-letter code (e.g. "US$", "1") is storable in char(3) but makes
  // Intl.NumberFormat throw, which crashes the Accounts tab and every report row.
  let currency: string | null = null;
  if (body?.currency != null) {
    currency = String(body.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return json({ error: "bad_currency" }, 400);
  }

  const { data, error } = await svc.rpc("upsert_ledger_account", {
    p_actor: user.id,
    p_org: orgId,
    p_name: name,
    p_type: type,
    p_code: code,
    p_id: body?.id ?? null,
    p_parent_id: body?.parent_id ?? null,
    p_currency: currency,
    p_archived: typeof body?.archived === "boolean" ? body.archived : null,
  });
  if (error) {
    const code = error.code ?? "";
    const status = code === "42501" || code === "insufficient_privilege"
      ? 403
      : code === "no_data_found"
      ? 404
      : code === "23505"
      ? 409
      : 400;
    // friendly mapping first; our own intentional raises pass through; anything
    // else collapses to a generic message so internals never leak.
    const message = PG_FRIENDLY[code] ??
      (PG_SAFE_MESSAGE.has(code) ? error.message : "request_failed");
    return json({ error: message, code }, status);
  }
  return json({ account: data }, body?.id ? 200 : 201);
});
