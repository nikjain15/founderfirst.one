/**
 * cpa-close — the CPA month-end close write-path (card RV2-C1).
 *
 * POST { op:'batch_close', firm_id, client_org_ids[], period_end?, force? }
 *   → cpa_batch_close_periods(actor, firm, ids, period_end, force)
 * POST { op:'request_docs', firm_id, client_org_id, template, note? }
 *   → cpa_request_docs(actor, firm, client_org_id, template, note)
 * POST { op:'resolve_docs', request_id }
 *   → cpa_resolve_doc_request(actor, request_id)
 *
 * Both close and doc-request RPCs are p_actor-first, service_role-only SECURITY
 * DEFINER (ISOTEST lineage): the ACTOR always comes from the JWT verified here,
 * NEVER from the body, so a client cannot forge identity. Per-client authz +
 * period-lock TOCTOU live inside the RPC. This function only authenticates and
 * marshals — it makes NO authorization decision of its own.
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
function statusFor(code?: string): number {
  if (code === "42501") return 403;             // insufficient_privilege
  if (code === "P0002") return 404;             // no_data_found (SQLSTATE)
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

  if (op === "batch_close") {
    const firm = String(body?.firm_id ?? "");
    const ids = Array.isArray(body?.client_org_ids) ? body.client_org_ids.map(String) : [];
    if (!firm) return json({ error: "bad_firm" }, 400);
    if (ids.length === 0) return json({ error: "no_clients" }, 400);
    const { data, error } = await svc.rpc("cpa_batch_close_periods", {
      p_actor: user.id,
      p_firm: firm,
      p_client_org_ids: ids,
      p_period_end: body?.period_end ? String(body.period_end) : undefined,
      p_force: Boolean(body?.force),
    });
    if (error) return json({ error: error.message, code: error.code }, statusFor(error.code));
    return json({ results: data ?? [] }, 200);
  }

  if (op === "request_docs") {
    const firm = String(body?.firm_id ?? "");
    const client = String(body?.client_org_id ?? "");
    const template = String(body?.template ?? "");
    if (!firm) return json({ error: "bad_firm" }, 400);
    if (!client) return json({ error: "bad_client" }, 400);
    if (!template) return json({ error: "bad_template" }, 400);
    const { data, error } = await svc.rpc("cpa_request_docs", {
      p_actor: user.id,
      p_firm: firm,
      p_client_org_id: client,
      p_template: template,
      p_note: body?.note ? String(body.note) : null,
    });
    if (error) return json({ error: error.message, code: error.code }, statusFor(error.code));
    return json({ request: data }, 200);
  }

  if (op === "resolve_docs") {
    const requestId = String(body?.request_id ?? "");
    if (!requestId) return json({ error: "bad_request" }, 400);
    const { data, error } = await svc.rpc("cpa_resolve_doc_request", {
      p_actor: user.id,
      p_request_id: requestId,
    });
    if (error) return json({ error: error.message, code: error.code }, statusFor(error.code));
    return json({ request: data }, 200);
  }

  return json({ error: "bad_op" }, 400);
});
