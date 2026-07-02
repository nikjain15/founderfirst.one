/**
 * reconcile — the write-path for bank reconciliation (W1.1; ARCHITECTURE.md §6.1, §8).
 *
 * Every match/unmatch/lock action goes through here, never a direct table write
 * (the reconciliation tables deny client writes). The RPCs are SECURITY DEFINER,
 * service_role-EXECUTE only (ISOTEST pattern) — the actor comes from the verified
 * JWT, so a caller can't forge p_actor. can_write_org_as inside each RPC gates a
 * read-only CPA out (access!='full' → 403). Each RPC audit-logs.
 *
 * POST { op, org_id, ... }:
 *   op=open    { account_id, statement_end, opening_minor?, closing_minor?, period_id? }
 *   op=match   { session_id, import_row_id, entry_id, kind? }
 *   op=unmatch { match_id }
 *   op=lock    { session_id }
 *   op=reopen  { session_id }
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
  if (code === "42501" || code === "insufficient_privilege") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23505" || code === "unique_violation") return 409;
  if (/reconciliation_locked|not_reconciled|already_matched|entry_reversed/.test(message ?? "")) return 409;
  if (code === "restrict_violation") return 409;
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

  let data: unknown;
  let error: { message: string; code?: string } | null = null;

  if (op === "open") {
    const accountId = String(body?.account_id ?? "");
    const statementEnd = String(body?.statement_end ?? "");
    if (!accountId) return json({ error: "bad_account" }, 400);
    if (!statementEnd) return json({ error: "bad_statement_end" }, 400);
    ({ data, error } = await svc.rpc("reconcile_open_session", {
      p_actor: user.id, p_org: orgId, p_account_id: accountId, p_statement_end: statementEnd,
      p_opening_minor: Number(body?.opening_minor ?? 0),
      p_closing_minor: Number(body?.closing_minor ?? 0),
      p_period_id: body?.period_id ?? null,
    }));
  } else if (op === "match") {
    const sessionId = String(body?.session_id ?? "");
    const rowId = String(body?.import_row_id ?? "");
    const entryId = String(body?.entry_id ?? "");
    if (!sessionId || !rowId || !entryId) return json({ error: "bad_match" }, 400);
    ({ data, error } = await svc.rpc("reconcile_match", {
      p_actor: user.id, p_org: orgId, p_session_id: sessionId,
      p_import_row_id: rowId, p_entry_id: entryId, p_kind: String(body?.kind ?? "manual"),
    }));
  } else if (op === "unmatch") {
    const matchId = String(body?.match_id ?? "");
    if (!matchId) return json({ error: "bad_match_id" }, 400);
    ({ data, error } = await svc.rpc("reconcile_unmatch", {
      p_actor: user.id, p_org: orgId, p_match_id: matchId,
    }));
  } else if (op === "lock") {
    const sessionId = String(body?.session_id ?? "");
    if (!sessionId) return json({ error: "bad_session" }, 400);
    ({ data, error } = await svc.rpc("reconcile_lock", {
      p_actor: user.id, p_org: orgId, p_session_id: sessionId,
    }));
  } else if (op === "reopen") {
    const sessionId = String(body?.session_id ?? "");
    if (!sessionId) return json({ error: "bad_session" }, 400);
    ({ data, error } = await svc.rpc("reconcile_reopen", {
      p_actor: user.id, p_org: orgId, p_session_id: sessionId,
    }));
  } else {
    return json({ error: "bad_op" }, 400);
  }

  if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
  return json({ result: data }, 200);
});
