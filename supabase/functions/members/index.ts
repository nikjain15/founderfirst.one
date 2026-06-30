/**
 * members — membership lifecycle (the write-path; ARCHITECTURE.md §5.4).
 *
 * POST { op:'remove',   org_id, user_id }   // owner/firm_admin removes a member (soft)
 * POST { op:'transfer', org_id, user_id }   // current owner promotes a member to owner
 *
 * memberships denies client writes (RLS); these SECURITY DEFINER RPCs enforce the
 * LAST-OWNER guard (an org always keeps ≥1 active owner / firm_admin). The actor is
 * the verified JWT user (never the body).
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
function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "2BP01" || /last_owner/.test(message ?? "")) return 409; // last-owner guard
  if (code === "22023") return 422;
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
  const orgId = String(body?.org_id ?? "");
  const userId = String(body?.user_id ?? "");
  if (!orgId || !userId) return json({ error: "bad_request" }, 400);

  let error;
  if (op === "remove") {
    ({ error } = await svc.rpc("remove_member", { p_actor: user.id, p_org: orgId, p_user: userId }));
  } else if (op === "transfer") {
    ({ error } = await svc.rpc("transfer_ownership", { p_actor: user.id, p_org: orgId, p_to_user: userId }));
  } else {
    return json({ error: "bad_op" }, 400);
  }
  if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
  return json({ ok: true }, 200);
});
