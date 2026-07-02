/**
 * imports — history-import batch lifecycle (the write-path; ARCHITECTURE.md §6.4, §8).
 *
 * POST { op:'create',  org_id, source, filename?, bank_account_id?, cutover_date? }
 * POST { op:'add_rows', org_id, batch_id, rows:[…] }   // re-staging replaces the batch's rows
 * POST { op:'commit',   org_id, batch_id }              // posts staged rows → ledger
 * POST { op:'discard',  org_id, batch_id }              // reversible BEFORE commit
 *
 * import_batches / import_rows deny client writes (RLS), so everything funnels
 * through these SECURITY DEFINER RPCs. The actor is taken from the verified JWT
 * (never the body) and authorization is enforced server-side (can_write_org_as).
 * CSV parsing + column mapping happen in the browser; this endpoint receives the
 * already-normalized rows.
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
function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23001" || /frozen|committed|discarded/.test(message ?? "")) return 409;
  if (code === "22023" || code === "23503") return 422;
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

  // ── commit: CHUNKED + non-silent (posted / errors / duplicates) ─────────────
  if (op === "commit") {
    if (!body?.batch_id) return json({ error: "bad_batch" }, 400);
    const batchId = String(body.batch_id);
    let result: unknown = null;
    for (let guard = 0; guard < 1000; guard++) {
      const { data, error } = await svc.rpc("commit_import_batch", {
        p_actor: user.id, p_org: orgId, p_batch: batchId, p_limit: 4000,
      });
      if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
      result = data;
      if ((data as { status?: string })?.status === "committed") break;
    }
    const head = (status: string) =>
      svc.from("import_rows").select("row_num", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", status);
    const [{ count: posted }, { count: errors }, { count: duplicates }] = await Promise.all([head("posted"), head("error"), head("skipped")]);
    return json({ result, posted: posted ?? 0, errors: errors ?? 0, duplicates: duplicates ?? 0 }, 200);
  }

  // ── W2.2: confirm a provider migration's cutover date ───────────────────────
  // Stamps every batch in the migration, then marks the migration committed.
  if (op === "migration_cutover") {
    if (!body?.migration_id || !body?.cutover_date) return json({ error: "bad_migration" }, 400);
    const migrationId = String(body.migration_id);
    const cutover = String(body.cutover_date);
    const { data: mig, error: readErr } = await svc
      .from("provider_migrations").select("batch_ids").eq("id", migrationId).eq("org_id", orgId).maybeSingle();
    if (readErr) return json({ error: readErr.message }, 400);
    if (!mig) return json({ error: "not_found" }, 404);
    for (const batchId of ((mig as { batch_ids?: string[] }).batch_ids ?? [])) {
      const { error } = await svc.rpc("set_import_batch_cutover", {
        p_actor: user.id, p_org: orgId, p_batch: batchId, p_cutover: cutover,
      });
      // A committed batch is frozen — treat that as already-done, not a failure.
      if (error && !/committed|frozen/.test(error.message ?? "")) {
        return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
      }
    }
    const { data, error } = await svc.rpc("set_provider_migration_cutover", {
      p_actor: user.id, p_org: orgId, p_migration: migrationId, p_cutover: cutover,
    });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
    return json({ migration: data }, 200);
  }

  let rpc: string;
  let args: Record<string, unknown>;
  switch (op) {
    case "create":
      if (!body?.source) return json({ error: "bad_source" }, 400);
      rpc = "create_import_batch";
      args = {
        p_actor: user.id, p_org: orgId, p_source: body.source,
        p_filename: body?.filename ?? null,
        p_bank_account_id: body?.bank_account_id ?? null,
        p_cutover_date: body?.cutover_date ?? null,
      };
      break;
    case "add_rows":
    case "append_rows": {   // append_rows = insert-only, so a large file stages across several calls
      if (!body?.batch_id || !Array.isArray(body?.rows)) return json({ error: "bad_rows" }, 400);
      // Same money-precision guard as ledger-entries: a JS-number amount_minor
      // above 2^53 silently truncates; require a string for exact bigint, and
      // refuse an unsafe number rather than corrupt the import.
      const rows: unknown[] = [];
      for (const r of body.rows as unknown[]) {
        const a = (r as Record<string, unknown>)?.amount_minor;
        if (typeof a === "number" && !Number.isSafeInteger(a)) {
          return json({ error: "amount_too_large: send amount_minor as a string for values beyond 2^53" }, 422);
        }
        rows.push(typeof a === "number" ? { ...(r as Record<string, unknown>), amount_minor: String(a) } : r);
      }
      rpc = op === "append_rows" ? "append_import_rows" : "add_import_rows";
      args = { p_actor: user.id, p_org: orgId, p_batch: body.batch_id, p_rows: rows };
      break;
    }
    case "commit":
      if (!body?.batch_id) return json({ error: "bad_batch" }, 400);
      rpc = "commit_import_batch";
      args = { p_actor: user.id, p_org: orgId, p_batch: body.batch_id };
      break;
    case "discard":
      if (!body?.batch_id) return json({ error: "bad_batch" }, 400);
      rpc = "discard_import_batch";
      args = { p_actor: user.id, p_org: orgId, p_batch: body.batch_id };
      break;
    default:
      return json({ error: "bad_op" }, 400);
  }

  const { data, error } = await svc.rpc(rpc, args);
  if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
  return json({ result: data }, op === "create" ? 201 : 200);
});
