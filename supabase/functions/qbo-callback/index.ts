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
    .from("external_connections").select("id, org_id").eq("state", state).eq("provider", "qbo").maybeSingle();
  if (!conn) return back({ provider: "qbo", status: "error", message: "That connection request wasn't recognized (or expired)." });

  let lastTid: string | null = null;
  try {
    const tok = await exchangeCode(code, (tid) => { if (tid) lastTid = tid; });
    const expires = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
    const { error: upErr } = await svc.from("external_connections").update({
      access_token: tok.access_token, refresh_token: tok.refresh_token, token_expires_at: expires,
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
