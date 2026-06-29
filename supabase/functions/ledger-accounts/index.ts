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

  const { data, error } = await svc.rpc("upsert_ledger_account", {
    p_actor: user.id,
    p_org: orgId,
    p_name: name,
    p_type: type,
    p_code: body?.code ?? null,
    p_id: body?.id ?? null,
    p_parent_id: body?.parent_id ?? null,
    p_currency: body?.currency ?? null,
    p_archived: typeof body?.archived === "boolean" ? body.archived : null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "no_data_found" ? 404 : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  return json({ account: data }, body?.id ? 200 : 201);
});
