/**
 * qbo-callback — QuickBooks OAuth redirect target (ARCHITECTURE.md §6.4). NOT
 * JWT-verified (browser redirect); security is the `state` nonce. QBO passes the
 * company id as `realmId` on the redirect.
 * GET ?code=…&state=…&realmId=…
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { exchangeCode } from "../_shared/qbo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Supabase's function gateway force-rewrites any text/html body to text/plain
// (anti-phishing sandbox), so an HTML page rendered from *.supabase.co shows raw
// source. Redirect to the app domain — which can render — instead.
const APP_BASE = Deno.env.get("APP_BASE_URL") ?? "https://penny.founderfirst.one/";

/** 302 back to the app with a connection result the UI can surface. */
function back(params: Record<string, string>): Response {
  const u = new URL(APP_BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const err = url.searchParams.get("error");
  if (err) return back({ provider: "qbo", status: "error", message: `QuickBooks returned: ${err}` });
  if (!code || !state || !realmId) return back({ provider: "qbo", status: "error", message: "Missing code, state, or realmId." });

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: conn } = await svc
    .from("external_connections").select("id, org_id, status, created_at").eq("state", state).eq("provider", "qbo").maybeSingle();
  if (!conn || conn.status !== "pending")
    return back({ provider: "qbo", status: "error", message: "That connection request wasn't recognized (or expired)." });

  // IQ-1: expire the OAuth state — reject a callback whose pending row is older
  // than the centralized TTL (state is already single-use + unique; this bounds
  // the replay window for an intercepted redirect).
  const { data: cfg } = await svc.rpc("get_qbo_config", {});
  const ttlMin = Number((cfg as { qbo_state_ttl_minutes?: number } | null)?.qbo_state_ttl_minutes ?? 10);
  const ageMs = Date.now() - new Date(conn.created_at as string).getTime();
  if (ageMs > ttlMin * 60_000) {
    await svc.from("external_connections").update({ status: "error", state: null, last_error: "oauth_state_expired" }).eq("id", conn.id);
    return back({ provider: "qbo", status: "error", message: "That connection request expired. Please try connecting again." });
  }

  let lastTid: string | null = null;
  try {
    const tok = await exchangeCode(code, (tid) => { if (tid) lastTid = tid; });
    const expires = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
    // IQ-1: encrypt tokens at rest — set_qbo_tokens writes *_enc + nulls plaintext.
    const { error: tokErr } = await svc.rpc("set_qbo_tokens", {
      p_connection: conn.id, p_access: tok.access_token, p_refresh: tok.refresh_token, p_expires: expires,
    });
    if (tokErr) throw new Error(tokErr.message);
    const { error: upErr } = await svc.from("external_connections").update({
      realm_id: realmId, tenant_name: `QuickBooks company ${realmId}`, scope: "com.intuit.quickbooks.accounting",
      status: "active", state: null, last_error: null, last_intuit_tid: lastTid, updated_at: new Date().toISOString(),
    }).eq("id", conn.id);
    if (upErr) throw new Error(upErr.message);
    return back({ provider: "qbo", status: "connected", org: conn.org_id });
  } catch (e) {
    await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message, last_intuit_tid: lastTid }).eq("id", conn.id);
    return back({ provider: "qbo", status: "error", message: (e as Error).message });
  }
});
