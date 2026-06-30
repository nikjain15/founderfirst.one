/**
 * xero-callback — OAuth redirect target (ARCHITECTURE.md §6.4). NOT JWT-verified
 * (the browser arrives here from Xero with no app token); security is the
 * unguessable `state` nonce minted by xero-connect.
 *
 * GET ?code=…&state=…  → exchange code for tokens, resolve the tenant, activate
 * the connection, and show a "you can close this window" page.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { exchangeCode, listConnections } from "../_shared/xero.ts";

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
  const err = url.searchParams.get("error");
  if (err) return back({ provider: "xero", status: "error", message: `Xero returned: ${err}` });
  if (!code || !state) return back({ provider: "xero", status: "error", message: "The callback was missing a code or state." });

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: conn } = await svc
    .from("external_connections")
    .select("id, org_id, status")
    .eq("state", state).eq("provider", "xero").maybeSingle();
  if (!conn) return back({ provider: "xero", status: "error", message: "That connection request wasn't recognized (or expired)." });

  try {
    const tok = await exchangeCode(code);
    const tenants = await listConnections(tok.access_token);
    if (!tenants.length) throw new Error("no_tenant_authorized");
    const tenant = tenants[0];
    const expires = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();

    const { error: upErr } = await svc.from("external_connections").update({
      access_token: tok.access_token, refresh_token: tok.refresh_token, token_expires_at: expires,
      realm_id: tenant.tenantId, tenant_name: tenant.tenantName, scope: tok.scope ?? null,
      status: "active", state: null, last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", conn.id);
    if (upErr) throw new Error(upErr.message);

    return back({ provider: "xero", status: "connected", org: conn.org_id, name: tenant.tenantName });
  } catch (e) {
    await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message }).eq("id", conn.id);
    return back({ provider: "xero", status: "error", message: (e as Error).message });
  }
});
