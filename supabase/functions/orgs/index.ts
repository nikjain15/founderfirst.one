/**
 * orgs — create a business or firm (the write-path; ARCHITECTURE.md §8, §C10).
 *
 * POST { type: 'business' | 'firm', name }  (verify_jwt = true)
 *
 * Backbone tables are RLS-locked against client writes (no_client_write), so org
 * creation must go through this service-role function. It:
 *   1. verifies the caller's JWT → auth.uid()
 *   2. inserts organizations(type, name, created_by = caller)
 *   3. inserts the caller's membership (owner for a business, firm_admin for a firm)
 *   4. inserts a pilot_free subscription (entitlement stub — §6b)
 *
 * The membership is what grants the caller access (RLS has_membership), so this is
 * the only way a user gets into a new org — consistent with "accepting/creating is
 * the only path to access".
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
  const type = body?.type;
  const name = String(body?.name ?? "").trim();
  if (type !== "business" && type !== "firm") return json({ error: "bad_type" }, 400);
  if (name.length < 1 || name.length > 120) return json({ error: "bad_name" }, 400);

  const { data: org, error: orgErr } = await svc
    .from("organizations")
    .insert({ type, name, created_by: user.id })
    .select("id,name,type")
    .single();
  if (orgErr || !org) return json({ error: "create_failed", detail: orgErr?.message }, 400);

  const role = type === "firm" ? "firm_admin" : "owner";
  const { error: memErr } = await svc
    .from("memberships")
    .insert({ user_id: user.id, org_id: org.id, role, status: "active" });
  if (memErr) {
    // best-effort rollback so a retry isn't blocked by an orphan org
    await svc.from("organizations").delete().eq("id", org.id);
    return json({ error: "membership_failed", detail: memErr.message }, 400);
  }

  await svc.from("subscriptions").insert({ billable_org_id: org.id, plan: "pilot_free" });

  return json({ org }, 201);
});
