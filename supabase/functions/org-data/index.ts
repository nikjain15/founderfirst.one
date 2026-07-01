/**
 * org-data — GDPR/CCPA self-serve export + connection erasure (audit #13).
 *
 * POST { op: 'export', org_id }        → full JSON of the org's books (member-only,
 *                                         RLS-scoped). Integration tokens are NEVER
 *                                         included — only connection metadata.
 * POST { op: 'disconnect', org_id, connection_id }
 *                                       → DELETE an external_connections row, wiping the
 *                                         live OAuth access/refresh tokens we store (the
 *                                         sensitive personal/financial data the privacy
 *                                         policy promises a user can erase). Gated by
 *                                         can_write_org_as; audited. NOTE: this erases the
 *                                         tokens WE hold; it does not call the provider's
 *                                         upstream token-revocation endpoint (the grant at
 *                                         Xero/QBO lapses on expiry) — upstream revoke is a
 *                                         tracked follow-up, not part of this self-serve op.
 *
 * Why no ledger hard-delete here: posted journal entries are an append-only,
 * legally-retained financial record. "Deleting your data" for the books means
 * closing the org + revoking access + erasing connection tokens, not nuking the
 * ledger. A full org purge is an operator-run, audited path (flagged for legal),
 * not a self-serve button.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// non-secret connection columns only — tokens never leave the server
const CONN_COLS = "id, provider, status, realm_id, tenant_name, scope, last_error, connected_by, created_at, updated_at";

// org_id / connection_id are uuids — validate up front so a malformed value returns
// a clean 400 instead of leaking a raw Postgres "invalid input syntax for type uuid"
// error (which also names internal tables).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? "");
  const orgId = String(body?.org_id ?? "");
  if (!orgId || !UUID_RE.test(orgId)) return json({ error: "bad_org" }, 400);

  // ── export: read AS the user (RLS scopes to orgs they may access) ───────────
  if (op === "export") {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // PostgREST hard-caps rows per request (db-max-rows, 1000 on this project), so a
    // single select silently TRUNCATES a real org's history. Page by a stable key
    // until a short page proves we've drained the table — the export must be COMPLETE
    // (the privacy policy promises "a copy of the data we hold about you").
    const PAGE = 1000;
    const grab = async (table: string, cols = "*") => {
      const out: unknown[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await asUser
          .from(table).select(cols).eq("org_id", orgId)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        const batch = data ?? [];
        out.push(...batch);
        if (batch.length < PAGE) break;
      }
      return out;
    };
    try {
      // cheap access gate first: if the user can't read the org, RLS returns no row →
      // 403 before we run any (now-paginated) table reads.
      const { data: org } = await asUser.from("organizations").select("*").eq("id", orgId).maybeSingle();
      if (!org) return json({ error: "forbidden_or_not_found" }, 403);
      const [settings, accounts, entries, lines, periods, batches, rows, rules, connections, audit] =
        await Promise.all([
          asUser.from("org_accounting_settings").select("*").eq("org_id", orgId).maybeSingle().then((r) => r.data),
          grab("ledger_accounts"), grab("journal_entries"), grab("journal_lines"),
          grab("accounting_periods"), grab("import_batches"), grab("import_rows"),
          grab("categorization_rules"), grab("external_connections", CONN_COLS), grab("ledger_audit"),
        ]);
      return json({
        exported_at: new Date().toISOString(),
        org, accounting_settings: settings,
        accounts, journal_entries: entries, journal_lines: lines,
        accounting_periods: periods, import_batches: batches, import_rows: rows,
        categorization_rules: rules, connections, ledger_audit: audit,
      });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // ── disconnect: erase an integration's live tokens (write → can_write_org) ──
  if (op === "disconnect") {
    const connId = String(body?.connection_id ?? "");
    if (!connId || !UUID_RE.test(connId)) return json({ error: "bad_connection" }, 400);
    const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
    if (!canWrite) return json({ error: "forbidden" }, 403);
    const { data: conn } = await svc.from("external_connections")
      .select("id, provider").eq("id", connId).eq("org_id", orgId).maybeSingle();
    if (!conn) return json({ error: "not_found" }, 404);
    const { error: delErr } = await svc.from("external_connections").delete().eq("id", connId).eq("org_id", orgId);
    if (delErr) return json({ error: delErr.message }, 400);
    // tenant-scoped audit (actor is an owner/CPA, not a platform admin); best-effort
    try {
      await svc.from("ledger_audit").insert({
        org_id: orgId, actor: user.id, action: "integration.disconnect",
        target_type: "connection", target_id: connId, detail: { provider: conn.provider },
      });
    } catch { /* audit is best-effort — never fail the disconnect on it */ }
    return json({ ok: true, erased: conn.provider });
  }

  return json({ error: "bad_op" }, 400);
});
