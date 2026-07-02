/**
 * plaid-link-token — mint a Plaid Link token for the client to open Plaid Link.
 * POST { org_id } (authed) → { link_token, expiration }.
 * The token is short-lived and safe for the browser; the ACCESS token (minted on
 * exchange) never reaches the client. Gated by can_write_org_as. (Roadmap §W2.3.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createLinkToken } from "../_shared/plaid.ts";

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
  if (!orgId) return json({ error: "bad_request" }, 400);

  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  try {
    const t = await createLinkToken(`${orgId}:${user.id}`);
    return json({ link_token: t.link_token, expiration: t.expiration }, 200);
  } catch (e) {
    return json({ error: "link_token_failed", detail: (e as Error).message }, 502);
  }
});
