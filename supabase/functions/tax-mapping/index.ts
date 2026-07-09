/**
 * tax-mapping — the CPA account→tax-line mapping edit write-path (W1.3-B
 * follow-up, deferred until carded: docs/AUDIT.md "W1.3-B CPA mapping-edit UI
 * deferred"). set_account_tax_line / clear_account_tax_line are service_role-only
 * SECURITY DEFINER (ISOTEST lineage) — this function is the only door to them.
 *
 * POST { op:'set_line', org_id, account_id, form_code, line_key, tax_year_from?, note? }
 *   → set_account_tax_line(actor, org, account_id, form_code, line_key, tax_year_from, note)
 * POST { op:'clear_line', org_id, account_id, form_code, tax_year_from? }
 *   → clear_account_tax_line(actor, org, account_id, form_code, tax_year_from)
 *
 * The actor always comes from the VERIFIED JWT, never the body — a client cannot
 * forge identity. The CPA-role gate (can_edit_tax_map_as: an active FULL
 * engagement — research decision 3, owners view/CPAs edit) and the line-integrity
 * check (an override must target a real line on an active form) live INSIDE the
 * RPCs; this function makes no authorization decision beyond MFA, mirroring the
 * other org-write edge fns (cpa-close, cpa-collab).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mfaSatisfied } from "../_shared/mfaGate.ts";

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
function statusFor(code?: string): number {
  if (code === "42501") return 403; // insufficient_privilege (not CPA-gated, or cross-tenant)
  if (code === "23514") return 422; // check_violation (line_key not on an active form)
  if (code === "P0002") return 404; // no_data_found
  return 400;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return json({ error: "bad_org" }, 400);
  // Same org-write MFA gate as the other 10 org-write edge fns (SEC-1-CPACLOSE
  // precedent) — a mapping edit changes what the CPA hands the tax preparer.
  if (!(await mfaSatisfied(svc, jwt, orgId))) return json({ error: "mfa_required", code: "mfa_required" }, 403);

  if (op === "set_line") {
    const accountId = String(body?.account_id ?? "");
    const formCode = String(body?.form_code ?? "");
    const lineKey = String(body?.line_key ?? "");
    if (!accountId) return json({ error: "bad_account" }, 400);
    if (!formCode) return json({ error: "bad_form" }, 400);
    if (!lineKey) return json({ error: "bad_line" }, 400);
    const { data, error } = await svc.rpc("set_account_tax_line", {
      p_actor: user.id,
      p_org: orgId,
      p_account_id: accountId,
      p_form_code: formCode,
      p_line_key: lineKey,
      p_tax_year_from: body?.tax_year_from ?? null,
      p_note: body?.note ? String(body.note) : null,
    });
    if (error) return json({ error: error.message, code: error.code }, statusFor(error.code));
    return json({ id: data }, 200);
  }

  if (op === "clear_line") {
    const accountId = String(body?.account_id ?? "");
    const formCode = String(body?.form_code ?? "");
    if (!accountId) return json({ error: "bad_account" }, 400);
    if (!formCode) return json({ error: "bad_form" }, 400);
    const { error } = await svc.rpc("clear_account_tax_line", {
      p_actor: user.id,
      p_org: orgId,
      p_account_id: accountId,
      p_form_code: formCode,
      p_tax_year_from: body?.tax_year_from ?? null,
    });
    if (error) return json({ error: error.message, code: error.code }, statusFor(error.code));
    return json({ ok: true }, 200);
  }

  return json({ error: "bad_op" }, 400);
});
