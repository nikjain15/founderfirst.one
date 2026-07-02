/**
 * catch-up — W2.1 Catch-up mode orchestration write-path.
 *
 * Catch-up mode gets a years-behind owner organized in ONE guided flow. This fn is
 * the thin, audited write-path for the two orchestration actions that don't already
 * have one; import / categorize-propose / reconcile / export each keep their own fn.
 *
 *   POST { op:"set_plan", org_id, fee_per_year_minor, backlog_years[], currency? }
 *     → { plan }                    flat-per-year packaging for this catch-up
 *   POST { op:"batch_approve", org_id, items:[{ entry_id, to_account_id, confidence, learn_value? }] }
 *     → { approved, skipped, failed, results }
 *        bulk-approve HIGH-confidence picks in one owner action so a 5k backlog is
 *        not 5k prompts. The RPC re-derives the trust tier (confidence_high) from
 *        platform_config and REFUSES anything below it — a low-confidence pick can
 *        never be bulk-auto-posted, it goes to the batched question queue (skipped).
 *   POST { op:"progress", org_id }
 *     → { years:[{ year, entries, uncategorized, reconciled_sessions, done }] }
 *        the per-year progress meter ("2023 ✓ · 2024 in progress").
 *
 * Every path is RLS-scoped: writes require can_write_org_as (a read-only CPA is
 * refused, same as Approve); progress requires only can_access_org_as (read-only
 * CPAs may view). Every action is audit-logged inside its SECURITY DEFINER RPC.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? "");
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return json({ error: "bad_request" }, 400);

  // ── progress (read) — read-only CPAs may view; the RPC gates on can_access_org_as.
  if (op === "progress") {
    const { data, error } = await svc.rpc("catch_up_progress", { p_actor: user.id, p_org: orgId });
    if (error) return json({ error: error.message }, 400);
    return json({ years: data ?? [] });
  }

  // Both remaining ops WRITE — same gate as the Approve button (a read-only CPA
  // fails here AND in the RPC).
  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  // ── set_plan — flat-per-year packaging ──────────────────────────────────────
  if (op === "set_plan") {
    const feePerYear = Number(body?.fee_per_year_minor ?? 0);
    const years = Array.isArray(body?.backlog_years)
      ? (body.backlog_years as unknown[]).map((y) => Math.trunc(Number(y))).filter((y) => Number.isFinite(y))
      : [];
    const currency = body?.currency != null ? String(body.currency) : "USD";
    const { data: plan, error } = await svc.rpc("catch_up_set_plan", {
      p_actor: user.id, p_org: orgId, p_fee_per_year_minor: Math.max(0, Math.trunc(feePerYear)),
      p_backlog_years: years, p_currency: currency,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ plan });
  }

  // ── batch_approve — bulk-approve high-confidence picks ───────────────────────
  if (op === "batch_approve") {
    if (!Array.isArray(body?.items)) return json({ error: "bad_request: items must be an array" }, 400);
    const { data, error } = await svc.rpc("catch_up_batch_approve", {
      p_actor: user.id, p_org: orgId, p_items: body.items,
    });
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }

  return json({ error: "bad_op" }, 400);
});
