/**
 * engagements — engagement lifecycle (the write-path; ARCHITECTURE.md §8).
 *
 * POST { op:'revoke',   engagement_id }                  // client owner OR firm admin
 * POST { op:'assign',   engagement_id, user_id }         // firm_admin assigns staff to a client
 * POST { op:'unassign', engagement_id, user_id }         // firm_admin unassigns staff
 *
 * engagements / client_assignments deny client writes (RLS); these SECURITY
 * DEFINER RPCs are the only sanctioned path. The actor is the verified JWT user
 * (never the body); authorization is enforced inside each RPC.
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
function statusForPgError(code?: string): number {
  if (code === "42501") return 403; // insufficient_privilege
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "22023") return 422;  // bad input
  return 400;
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
  const op = String(body?.op ?? "");
  const engagementId = String(body?.engagement_id ?? "");
  if (!engagementId) return json({ error: "bad_engagement" }, 400);

  if (op === "revoke") {
    const { data, error } = await svc.rpc("revoke_engagement", { p_actor: user.id, p_engagement_id: engagementId });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code));
    return json({ engagement: data }, 200);
  }

  if (op === "assign" || op === "unassign") {
    const userId = String(body?.user_id ?? "");
    if (!userId) return json({ error: "bad_user" }, 400);
    const fn = op === "assign" ? "assign_cpa" : "unassign_cpa";
    const { data, error } = await svc.rpc(fn, { p_actor: user.id, p_engagement_id: engagementId, p_user_id: userId });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code));
    return json({ ok: true, assignment: data ?? null }, 200);
  }

  return json({ error: "bad_op" }, 400);
});
