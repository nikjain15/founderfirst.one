/**
 * org-settings — read/write a business org's accounting settings (the write-path;
 * ARCHITECTURE.md §6, §8). The owner-facing home for the CPA approval gate.
 *
 * POST { op:'set', org_id, cpa_posts_require_approval?, home_currency?,
 *        fiscal_year_start_month? }
 *
 * org_accounting_settings denies client writes (RLS oas_nowrite); the only
 * sanctioned write is set_org_accounting_settings, which runs as service role and
 * gates to an active OWNER membership using the JWT-verified actor (never the
 * body). Reading the row goes direct under RLS (oas_select) — not here.
 *
 * [stress:cpa-scope] CPATEST-F1: closes the gap where cpa_posts_require_approval
 * could be honoured by the ledger write-path but never turned on by the product.
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
  const op = String(body?.op ?? "set");
  const orgId = String(body?.org_id ?? "");
  if (op !== "set") return json({ error: "bad_op" }, 400);
  if (!orgId) return json({ error: "bad_org" }, 400);

  // Pass only the fields the caller actually sent (null = leave unchanged).
  const approval = typeof body?.cpa_posts_require_approval === "boolean"
    ? body.cpa_posts_require_approval : null;
  const homeCcy = typeof body?.home_currency === "string" ? body.home_currency : null;
  const fyMonth = Number.isInteger(body?.fiscal_year_start_month)
    ? body.fiscal_year_start_month : null;
  if (approval === null && homeCcy === null && fyMonth === null) {
    return json({ error: "nothing_to_set" }, 400);
  }

  const { data, error } = await svc.rpc("set_org_accounting_settings", {
    p_actor: user.id,
    p_org: orgId,
    p_cpa_posts_require_approval: approval,
    p_home_currency: homeCcy,
    p_fiscal_year_start_month: fyMonth,
  });
  if (error) {
    const status = error.code === "42501" ? 403
      : error.code === "22023" || error.code === "invalid_parameter_value" ? 422 : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  return json({ settings: data }, 200);
});
