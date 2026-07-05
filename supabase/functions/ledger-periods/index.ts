/**
 * ledger-periods — close or reopen an accounting period (the write-path;
 * ARCHITECTURE.md §6.2, §8).
 *
 * POST { org_id, period_id, action:'close'|'reopen' }
 *
 * Closing a period is how a CPA locks the books — post_journal_entry refuses to
 * post into a closed period. close/reopen_accounting_period run as service role
 * and check can_write_org_as with the JWT-verified actor. Reading periods goes
 * direct under RLS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mfaSatisfied } from "../_shared/mfaGate.ts";

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
  const periodId = String(body?.period_id ?? "");
  const action = String(body?.action ?? "");
  if (!orgId) return json({ error: "bad_org" }, 400);
  if (!periodId) return json({ error: "bad_period" }, 400);
  if (action !== "close" && action !== "reopen") return json({ error: "bad_action" }, 400);

  if (!(await mfaSatisfied(svc, jwt, orgId))) return json({ error: "mfa_required", code: "mfa_required" }, 403);

  const fn = action === "close" ? "close_accounting_period" : "reopen_accounting_period";
  const { data, error } = await svc.rpc(fn, {
    p_actor: user.id,
    p_org: orgId,
    p_period_id: periodId,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "no_data_found" ? 404 : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  return json({ period: data }, 200);
});
