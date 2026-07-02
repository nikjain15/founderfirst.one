/**
 * report-export — record ONE ledger_audit row per report export (card W1.2).
 *
 * POST { org_id, report: 'tb'|'pnl'|'bs'|'gl', format: 'csv'|'pdf',
 *        scope?: { start?, end? }, filename?, rows? }
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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORTS = new Set(["tb", "pnl", "bs", "gl"]);
const FORMATS = new Set(["csv", "pdf"]);

Deno.serve(async (req) => {
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
  const orgId = String(body?.org_id ?? "");
  const report = String(body?.report ?? "");
  const format = String(body?.format ?? "");
  if (!UUID_RE.test(orgId)) return json({ error: "bad_org" }, 400);
  if (!REPORTS.has(report)) return json({ error: "bad_report" }, 400);
  if (!FORMATS.has(format)) return json({ error: "bad_format" }, 400);

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

  // Sanitize the recorded scope to plain string dates (never trust shape).
  const rawScope = (body?.scope ?? {}) as Record<string, unknown>;
  const scope = {
    start: typeof rawScope.start === "string" ? rawScope.start : null,
    end: typeof rawScope.end === "string" ? rawScope.end : null,
  };
  const rows = Number.isInteger(body?.rows) ? body.rows : null;
  const filename = typeof body?.filename === "string" ? body.filename.slice(0, 200) : null;

  const { error: insErr } = await svc.from("ledger_audit").insert({
    org_id: orgId,
    actor: user.id,
    action: "report.export",
    target_type: "report",
    target_id: null,
    detail: { report, format, scope, rows, filename },
  });
  if (insErr) return json({ error: "audit_write_failed" }, 500);

  return json({ ok: true });
});
