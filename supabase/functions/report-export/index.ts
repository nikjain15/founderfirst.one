/**
 * report-export — record ONE ledger_audit row per report export (card W1.2).
 *
 * POST { org_id, report: 'tb'|'pnl'|'bs'|'gl'|'cf'|'nec'|'pkg'|'tax_export',
 *        format: 'csv'|'pdf'|'html', scope?: { start?, end? }, filename?, rows?,
 *        suite?, form_code?, tax_year? }
 *   → inserts a `report.export` row into ledger_audit and returns { ok: true }.
 *
 * The actual file is BUILT and DOWNLOADED client-side (pure serializers over the
 * RLS-scoped, fully-paginated entry list — apps/app/src/ledger/export.ts). This
 * function exists only to leave an audit trail: who exported which report, for
 * which period, and when. A read-only CPA CAN export (they can READ the books) so
 * they are permitted here too — but this endpoint writes NOTHING to the books;
 * the only write is the audit row itself.
 *
 * Trust model (mirrors ledger-* and org-data): the actor is the JWT-verified
 * user, never the body. Access is gated by can_access_org — checked by READING
 * the org AS the user under RLS — so a caller can only log an export for an org
 * they may actually read. The audit insert then runs as service_role (ledger_audit
 * denies client writes; only service_role may insert — see 20260630080000).
 *
 * RV2-A2 follow-up: the structured tax export (Filing → pick a suite → Download)
 * had NO audit trail — every other export (TB/P&L/BS/GL/CF/NEC/lender package)
 * already logs here, so the tax export gains a `tax_export` report kind + an
 * `html` format (the generic_pdf serializer emits a print-ready .html, not a
 * true .pdf — the audit must say what actually happened, not what the label
 * implies) instead of a second, parallel audit path.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseExportBody } from "./validate.ts";

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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const parsed = parseExportBody(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { orgId, detail } = parsed;

  // Access gate: read the org AS the user under RLS. can_access_org gates the
  // organizations select, so no row back → the user may not access this org.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org, error: orgErr } = await asUser
    .from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (orgErr) return json({ error: "lookup_failed" }, 500);
  if (!org) return json({ error: "forbidden" }, 403);

  const { error: insErr } = await svc.from("ledger_audit").insert({
    org_id: orgId,
    actor: user.id,
    action: "report.export",
    target_type: "report",
    target_id: null,
    detail,
  });
  if (insErr) return json({ error: "audit_write_failed" }, 500);

  return json({ ok: true });
}

if (import.meta.main) Deno.serve(handle);
