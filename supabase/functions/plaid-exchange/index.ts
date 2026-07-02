/**
 * plaid-exchange — swap Plaid Link's public_token for an access token, store the
 * connection (provider 'plaid', token column-walled off the browser, same as
 * QBO/Xero), then run the initial /transactions/sync pull.
 * POST { org_id, public_token } (authed) → { connection_id, added, modified, removed }.
 * Gated by can_write_org_as. (Roadmap §W2.3.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { exchangePublicToken, getItem, getInstitution } from "../_shared/plaid.ts";
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
  const publicToken = String(body?.public_token ?? "");
  if (!orgId || !publicToken) return json({ error: "bad_request" }, 400);

  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  let accessToken: string, itemId: string, tenantName: string | null = null;
  try {
    const ex = await exchangePublicToken(publicToken);
    accessToken = ex.access_token;
    itemId = ex.item_id;
    try {
      const item = await getItem(accessToken);
      if (item.item.institution_id) {
        const inst = await getInstitution(item.item.institution_id);
        tenantName = inst.institution?.name ?? null;
      }
    } catch { /* institution name is best-effort */ }
  } catch (e) {
    return json({ error: "exchange_failed", detail: (e as Error).message }, 502);
  }

  // Upsert the connection on (org, provider, realm_id=item_id). Re-linking the same
  // item refreshes the token and keeps the existing cursor.
  const { data: existing } = await svc.from("external_connections")
    .select("id, sync_cursor")
    .eq("org_id", orgId).eq("provider", "plaid").eq("realm_id", itemId).maybeSingle();

  let connId: string;
  if (existing) {
    connId = existing.id as string;
    await svc.from("external_connections").update({
      access_token: accessToken, status: "active", tenant_name: tenantName,
      last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", connId);
  } else {
    const { data: ins, error: insErr } = await svc.from("external_connections").insert({
      org_id: orgId, provider: "plaid", realm_id: itemId, tenant_name: tenantName,
      access_token: accessToken, status: "active", connected_by: user.id,
    }).select("id").single();
    if (insErr) return json({ error: "store_failed", detail: insErr.message }, 500);
    connId = ins.id as string;
  }

  // initial pull
  try {
    const { data: conn } = await svc.from("external_connections")
      .select("id, access_token, sync_cursor").eq("id", connId).single();
    const r = await runPlaidSync(svc, user.id, orgId, conn as { id: string; access_token: string; sync_cursor: string | null });
    return json({ connection_id: connId, tenant_name: tenantName, ...r }, 200);
  } catch (e) {
    await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message }).eq("id", connId);
    return json({ error: "initial_sync_failed", detail: (e as Error).message, connection_id: connId }, 502);
  }
});
