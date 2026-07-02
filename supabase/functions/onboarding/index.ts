/**
 * onboarding — the final step of the minimal 3-step onboarding wizard (W3.3).
 *
 * POST { org_id, entity_type?, industry_key? }   (verify_jwt = true)
 *
 * Stamps the org's entity_type + industry_key on org_accounting_settings (the
 * CENTRAL-2 filing-calendar consumer reads these) and seeds the chart of accounts
 * from the industry's kernel CoA template — one atomic SECURITY DEFINER call
 * (complete_onboarding), actor-checked with the JWT-verified user. The kernel
 * tables (ledger_accounts write-path) deny client writes, so this must go through
 * the service-role function; there is NO industry→accounts map in code.
 *
 * Returns { seeded } — how many CoA accounts were created (0 if the org already
 * had a chart; idempotent).
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
  const orgId = body?.org_id;
  if (typeof orgId !== "string" || orgId.length < 1) return json({ error: "bad_org" }, 400);
  // entity_type / industry_key are optional strings; the DB validates them against
  // the kernel (a forged key is rejected there), so we only guard the type here.
  const entityType = body?.entity_type == null ? null : String(body.entity_type);
  const industryKey = body?.industry_key == null ? null : String(body.industry_key);

  const { data, error } = await svc
    .rpc("complete_onboarding", {
      p_actor: user.id,
      p_org: orgId,
      p_entity_type: entityType,
      p_industry_key: industryKey,
    });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("forbidden")) return json({ error: "forbidden" }, 403);
    if (msg.includes("bad_entity_type")) return json({ error: "bad_entity_type" }, 400);
    if (msg.includes("bad_industry")) return json({ error: "bad_industry" }, 400);
    if (msg.includes("bad_org")) return json({ error: "bad_org" }, 400);
    return json({ error: "onboarding_failed", detail: msg }, 400);
  }

  return json({ seeded: typeof data === "number" ? data : 0 }, 200);
});
