/**
 * plaid-sync — pull new/changed transactions for a connected Plaid item on demand
 * (the "Sync now" button; also usable by a scheduled job later).
 * POST { org_id, connection_id } (authed) → { added, modified, removed, skipped }.
 * All idempotency + reversal handling is in the DB RPC — a redundant sync is safe.
 * Gated by can_write_org_as. (Roadmap §W2.3.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runPlaidSync } from "../_shared/plaidSync.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.org_id ?? "");
  const connId = String(body?.connection_id ?? "");
  if (!orgId || !connId) return json({ error: "bad_request" }, 400);

  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  const { data: conn } = await svc.from("external_connections")
    .select("id, access_token, sync_cursor, status")
    .eq("id", connId).eq("org_id", orgId).eq("provider", "plaid").maybeSingle();
  if (!conn || conn.status !== "active") return json({ error: "no_active_connection" }, 404);

  try {
    const r = await runPlaidSync(svc, user.id, orgId, conn as { id: string; access_token: string; sync_cursor: string | null });
    return json(r, 200);
  } catch (e) {
    await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message }).eq("id", connId);
    return json({ error: "sync_failed", detail: (e as Error).message }, 502);
  }
});
