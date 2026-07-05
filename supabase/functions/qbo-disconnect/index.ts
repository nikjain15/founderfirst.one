/**
 * qbo-disconnect — revoke a QuickBooks grant (IQ-1).
 * POST { org_id, connection_id } (authed) → revokes at Intuit, sets the
 * connection status='revoked', clears the stored tokens.
 *
 * Security: JWT-verified + can_write_org_as gated (same as qbo-import/qbo-connect).
 * Tokens are read via the server-side decrypt RPC (ext_connection_secrets) and the
 * ciphertext is cleared afterward, so a disconnected connection retains no live
 * credential. A revoke that FAILS at Intuit still flips the row to 'revoked' and
 * clears tokens locally — leaving a live-looking grant that we can no longer use
 * would be worse — but the Intuit outcome is surfaced in the response + last_error.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { revokeToken } from "../_shared/qbo.ts";

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
    .select("id, status").eq("id", connId).eq("org_id", orgId).eq("provider", "qbo").maybeSingle();
  if (!conn) return json({ error: "no_connection" }, 404);
  // already revoked → idempotent success (no live grant to revoke).
  if (conn.status === "revoked") return json({ revoked: true, intuit_revoked: null, already: true }, 200);

  // Read the (decrypted) refresh token server-side; revoking it kills the grant.
  const { data: secretsRow } = await svc.rpc("ext_connection_secrets", { p_connection: conn.id });
  const secrets = Array.isArray(secretsRow) ? secretsRow[0] : secretsRow;
  const token = (secrets?.refresh_token ?? secrets?.access_token) as string | undefined;

  let lastTid: string | null = null;
  let intuitRevoked = false;
  if (token) {
    try {
      intuitRevoked = await revokeToken(token, (tid) => { if (tid) lastTid = tid; });
    } catch (_e) {
      intuitRevoked = false; // network/Intuit failure — still revoke locally below.
    }
  }

  // Flip to 'revoked' and clear BOTH plaintext (legacy) and ciphertext tokens so
  // no live credential remains, regardless of the Intuit outcome.
  const { error: upErr } = await svc.from("external_connections").update({
    status: "revoked",
    access_token: null, refresh_token: null,
    access_token_enc: null, refresh_token_enc: null,
    token_expires_at: null, state: null,
    last_error: intuitRevoked ? null : "intuit_revoke_unconfirmed",
    last_intuit_tid: lastTid, updated_at: new Date().toISOString(),
  }).eq("id", conn.id);
  if (upErr) return json({ error: "disconnect_failed", detail: upErr.message }, 400);

  return json({ revoked: true, intuit_revoked: intuitRevoked }, 200);
});
