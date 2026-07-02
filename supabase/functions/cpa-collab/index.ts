/**
 * cpa-collab — CPA collaboration primitives + the owner's approval round-trip
 * (card W1.5). The flag/note/suggest/add-txn/approve/reject RPCs are service_role
 * only (ISOTEST pattern), so every mutation comes through this function. The actor
 * is taken from the VERIFIED JWT (never the body) and passed as p_actor; the RPCs
 * enforce authorization (can_write_org_as for CPA writes, has_membership_as for
 * owner decisions), period-lock (transitively via post/recategorize), and audit.
 *
 * Ops:
 *   flag          { op:'flag',           org_id, entry_id, reason? }
 *   resolve_flag  { op:'resolve_flag',   org_id, flag_id }
 *   note          { op:'note',           org_id, entry_id, body }
 *   suggest_reclass { op:'suggest_reclass', org_id, entry_id, from_account_id, to_account_id, note? }
 *   add_txn       { op:'add_txn',        org_id, entry_date, lines:[…], memo?, note? }
 *   approve       { op:'approve',        org_id, suggestion_id }
 *   reject        { op:'reject',         org_id, suggestion_id, note? }
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

function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403; // insufficient_privilege
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "2F004" || code === "38000" || /period_closed/.test(message ?? "")) return 409;
  if (code === "23505") return 409;
  if (code === "23514" || code === "22023" || code === "23503") return 422;
  return 400;
}

// Normalize add_txn line amounts to exact bigint (mirrors ledger-entries): a
// number beyond 2^53 must be sent as a string or we refuse (never truncate).
function normalizeAmounts(lines: unknown[]): { ok: true; lines: unknown[] } | { ok: false; error: string } {
  const out: unknown[] = [];
  for (const l of lines) {
    if (l && typeof l === "object") {
      const a = (l as Record<string, unknown>).amount_minor;
      if (typeof a === "string") {
        if (!/^-?\d+$/.test(a)) return { ok: false, error: "bad_amount: amount_minor string must be an integer in minor units" };
        out.push(l); continue;
      }
      if (typeof a === "number") {
        if (!Number.isSafeInteger(a)) return { ok: false, error: "amount_too_large: send amount_minor as a string for values beyond 2^53" };
        out.push({ ...(l as Record<string, unknown>), amount_minor: String(a) }); continue;
      }
    }
    out.push(l);
  }
  return { ok: true, lines: out };
}

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

  const call = async (fn: string, args: Record<string, unknown>, okStatus = 200) => {
    const { data, error } = await svc.rpc(fn, { p_actor: user.id, p_org: orgId, ...args });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
    return json({ result: data }, okStatus);
  };

  switch (op) {
    case "flag": {
      const entryId = String(body?.entry_id ?? "");
      if (!entryId) return json({ error: "bad_entry" }, 400);
      return call("cpa_flag_entry", { p_entry_id: entryId, p_reason: body?.reason ?? null }, 201);
    }
    case "resolve_flag": {
      const flagId = String(body?.flag_id ?? "");
      if (!flagId) return json({ error: "bad_flag" }, 400);
      return call("cpa_resolve_flag", { p_flag_id: flagId });
    }
    case "note": {
      const entryId = String(body?.entry_id ?? "");
      const noteBody = String(body?.body ?? "");
      if (!entryId) return json({ error: "bad_entry" }, 400);
      if (!noteBody.trim()) return json({ error: "empty_note" }, 400);
      return call("cpa_add_note", { p_entry_id: entryId, p_body: noteBody }, 201);
    }
    case "suggest_reclass": {
      const entryId = String(body?.entry_id ?? "");
      const from = String(body?.from_account_id ?? "");
      const to = String(body?.to_account_id ?? "");
      if (!entryId || !from || !to) return json({ error: "bad_reclass" }, 400);
      return call("cpa_suggest_reclass", {
        p_entry_id: entryId, p_from_account_id: from, p_to_account_id: to, p_note: body?.note ?? null,
      }, 201);
    }
    case "add_txn": {
      const entryDate = String(body?.entry_date ?? "");
      const lines = body?.lines;
      if (!entryDate) return json({ error: "bad_entry_date" }, 400);
      if (!Array.isArray(lines) || lines.length < 2) return json({ error: "bad_lines" }, 400);
      const norm = normalizeAmounts(lines);
      if (!norm.ok) return json({ error: norm.error }, 422);
      return call("cpa_add_transaction", {
        p_entry_date: entryDate, p_lines: norm.lines, p_memo: body?.memo ?? null, p_note: body?.note ?? null,
      }, 201);
    }
    case "approve": {
      const sid = String(body?.suggestion_id ?? "");
      if (!sid) return json({ error: "bad_suggestion" }, 400);
      return call("owner_approve_suggestion", { p_suggestion_id: sid });
    }
    case "reject": {
      const sid = String(body?.suggestion_id ?? "");
      if (!sid) return json({ error: "bad_suggestion" }, 400);
      return call("owner_reject_suggestion", { p_suggestion_id: sid, p_note: body?.note ?? null });
    }
    default:
      return json({ error: "bad_op" }, 400);
  }
});
