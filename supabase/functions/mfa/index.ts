/**
 * mfa — the recovery-code half of SEC-1 (MFA for owner + CPA login). TOTP
 * enrol/challenge/verify itself needs no server code here: it runs entirely
 * against Supabase Auth's own factor API (supabase.auth.mfa.*, called directly
 * from the client) and elevates the session to aal2 on its own.
 *
 * What Supabase does NOT provide is recovery codes, and (by design) a verified
 * factor cannot be unenrolled without first completing a challenge — otherwise
 * MFA would be pointless. So a lost-authenticator recovery path needs the
 * service-role Admin API, gated behind a server-verified one-time code:
 *
 * POST { op:'generate_recovery_codes' }         (requires the caller's JWT to be
 *   at aal2 — i.e. called right after a fresh enrol+verify, while the session is
 *   already elevated) → mints 10 fresh codes, invalidating any unused ones.
 * POST { op:'recovery_codes_remaining' }        → how many unused codes are left.
 * POST { op:'redeem_recovery_code', code }      → the lost-device path: does NOT
 *   require aal2 (that's the whole point). On a valid code, clears every MFA
 *   factor on the account via the Admin API so the user can sign back in at
 *   aal1 and re-enrol from scratch.
 * POST { op:'log_event', action, detail? }      → records an MFA event whose
 *   source of truth is the client-side factor API (enrol/disable), which has no
 *   DB trigger to hook.
 *
 * The actor is always the JWT-verified caller (svc.auth.getUser), never trusted
 * from the request body — the same isolation discipline as org-settings and the
 * other p_actor-first RPCs (LEARNINGS / 20260701000000_isolation_revoke_rpc_execute.sql).
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

const LOGGABLE_ACTIONS = new Set(["mfa.enrolled", "mfa.disabled", "mfa.challenge_failed"]);

// The access-token JWT carries an "aal" claim (aal1 | aal2) once a factor is
// enrolled — reading it locally avoids an extra round trip to check assurance
// level. Never trust anything else out of the token; identity still comes from
// svc.auth.getUser(jwt) below.
function aalFromJwt(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)?.aal ?? null;
  } catch {
    return null;
  }
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
  const op = String(body?.op ?? "");

  if (op === "generate_recovery_codes") {
    if (aalFromJwt(jwt) !== "aal2") {
      return json({ error: "step_up_required" }, 403);
    }
    const { data, error } = await svc.rpc("generate_mfa_recovery_codes", { p_actor: user.id });
    if (error) return json({ error: error.message }, 400);
    return json({ codes: data as string[] });
  }

  if (op === "recovery_codes_remaining") {
    const { data, error } = await svc.rpc("mfa_recovery_codes_remaining", { p_actor: user.id });
    if (error) return json({ error: error.message }, 400);
    return json({ remaining: data as number });
  }

  if (op === "redeem_recovery_code") {
    const code = String(body?.code ?? "").trim();
    if (!code) return json({ error: "bad_code" }, 400);
    const { data: ok, error } = await svc.rpc("consume_mfa_recovery_code", {
      p_actor: user.id,
      p_code: code,
    });
    if (error) return json({ error: error.message }, 400);
    if (!ok) return json({ ok: false }, 200);

    // Valid code: clear every MFA factor on the account (Admin API) so the user
    // can sign back in at aal1 and re-enrol. getUserById returns the embedded
    // factors list; deleteFactor is a raw REST call to the GoTrue admin route
    // (avoids depending on a specific supabase-js admin-MFA helper existing).
    const { data: userRec, error: getErr } = await svc.auth.admin.getUserById(user.id);
    if (getErr) return json({ error: getErr.message }, 400);
    const factors = (userRec?.user as unknown as { factors?: { id: string }[] })?.factors ?? [];
    let cleared = 0;
    for (const f of factors) {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${user.id}/factors/${f.id}`,
        {
          method: "DELETE",
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        },
      );
      if (res.ok) cleared += 1;
    }
    return json({ ok: true, factorsCleared: cleared });
  }

  if (op === "log_event") {
    const action = String(body?.action ?? "");
    if (!LOGGABLE_ACTIONS.has(action)) return json({ error: "bad_action" }, 400);
    const detail = typeof body?.detail === "object" && body.detail !== null ? body.detail : {};
    const { error } = await svc.rpc("log_security_event", {
      p_actor: user.id,
      p_action: action,
      p_detail: detail,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "bad_op" }, 400);
});
