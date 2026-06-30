/**
 * invites-accept — accept an invite (the write-path; ARCHITECTURE.md §5, §B2.2).
 *
 * POST { token }  (authed — the invitee)
 *
 * Thin wrapper over the SECURITY DEFINER `accept_invite` RPC, which does the whole
 * accept in ONE transaction with `select … for update` on the invite row — so two
 * concurrent accepts can't each spin up a firm-of-one + duplicate engagement (the
 * old non-transactional path did; E2E A-race). The actor is the verified JWT user;
 * the RPC enforces the email-bound recipient check, expiry, and single-use.
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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map the RPC's raised message → HTTP status (mirrors the prior contract).
function statusForMessage(msg: string): number {
  if (/invalid_token/.test(msg)) return 404;
  if (/already_accepted/.test(msg)) return 409;
  if (/already_engaged/.test(msg)) return 409;
  if (/expired/.test(msg)) return 410;
  if (/wrong_recipient/.test(msg)) return 403;
  return 400;
}

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
  const token = String(body?.token ?? "");
  if (!token) return json({ error: "bad_token" }, 400);

  const { data, error } = await svc.rpc("accept_invite", { p_actor: user.id, p_token: token });
  if (error) {
    const msg = error.message ?? "accept_failed";
    const code = (msg.match(/(invalid_token|already_accepted|already_engaged|expired|wrong_recipient)/) ?? [])[0] ?? msg;
    return json({ error: code }, statusForMessage(msg));
  }
  return json(data, 200);
});
