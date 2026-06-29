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

function page(title: string, body: string, ok = true): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center;color:#1a1a1a">
     <h1 style="font-size:1.4rem">${ok ? "✓ " : "⚠️ "}${title}</h1><p style="color:#555">${body}</p>
     <p><button onclick="window.close()" style="padding:.6rem 1.2rem;border-radius:999px;border:0;background:#0a7d6b;color:#fff;font-size:1rem">Close</button></p>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  if (err) return page("Connection cancelled", `Xero returned: ${err}`, false);
  if (!code || !state) return page("Missing code", "The callback was missing a code or state.", false);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: conn } = await svc
    .from("external_connections")
    .select("id, org_id, status")
    .eq("state", state).eq("provider", "xero").maybeSingle();
  if (!conn) return page("Unknown request", "That connection request wasn't recognized (or expired).", false);

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

    return page("Connected to Xero", `${tenant.tenantName} is linked. Head back to FounderFirst and run the import.`);
  } catch (e) {
    await svc.from("external_connections").update({ status: "error", last_error: (e as Error).message }).eq("id", conn.id);
    return page("Couldn't finish connecting", (e as Error).message, false);
  }
});
