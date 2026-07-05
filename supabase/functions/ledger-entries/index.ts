/**
 * ledger-entries — post a balanced journal entry, or approve a pending one
 * (the write-path; ARCHITECTURE.md §6.1, §8).
 *
 * POST { op?: 'post', org_id, entry_date, idempotency_key, lines:[{account_id,
 *        amount_minor, side:'D'|'C', currency?, memo?}], source?, source_ref?, memo? }
 * POST { op: 'approve', org_id, entry_id }
 *
 * journal_entries/journal_lines are RLS-locked against client writes, so posting
 * must go through this service-role function. The actor is taken from the verified
 * JWT (never the body) and passed to post_journal_entry, which enforces
 * authorization (can_write_org_as), idempotency, balance, account ownership, and
 * period-open — atomically. Reads go direct to Supabase under RLS; only mutations
 * come here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mfaSatisfied } from "../_shared/mfaGate.ts";

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

// Map a posting-function SQLSTATE / message to an HTTP status. The function
// raises specific errcodes; default to 400 for anything unrecognized.
function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403; // insufficient_privilege — forbidden
  if (code === "P0002" || code === "no_data_found") return 404; // not_found
  if (code === "2F004" || code === "38000" || /period_closed/.test(message ?? "")) return 409;
  if (code === "23505") return 409; // unique — should be handled as replay, but just in case
  if (code === "23514" || code === "22023" || code === "23503") return 422; // unbalanced / bad input / bad account
  return 400;
}

// Normalize each line's amount_minor so the bigint reaches Postgres EXACTLY.
// A string integer is passed through as a string (the RPC's `->>'amount_minor'`
// preserves it); a JS number must be a safe integer or we refuse (never truncate).
function normalizeAmounts(lines: unknown[]): { ok: true; lines: unknown[] } | { ok: false; error: string } {
  const out: unknown[] = [];
  for (const l of lines) {
    if (l && typeof l === "object") {
      const a = (l as Record<string, unknown>).amount_minor;
      if (typeof a === "string") {
        if (!/^-?\d+$/.test(a)) return { ok: false, error: "bad_amount: amount_minor string must be an integer in minor units" };
        out.push(l);
        continue;
      }
      if (typeof a === "number") {
        if (!Number.isSafeInteger(a)) {
          return { ok: false, error: "amount_too_large: send amount_minor as a string for values beyond 2^53 (no silent precision loss)" };
        }
        out.push({ ...(l as Record<string, unknown>), amount_minor: String(a) });
        continue;
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
  const op = String(body?.op ?? "post");
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return json({ error: "bad_org" }, 400);

  if (!(await mfaSatisfied(svc, jwt, orgId))) return json({ error: "mfa_required", code: "mfa_required" }, 403);

  // ── approve a pending_review entry ──────────────────────────────────────
  if (op === "approve") {
    const entryId = String(body?.entry_id ?? "");
    if (!entryId) return json({ error: "bad_entry" }, 400);
    const { data, error } = await svc.rpc("approve_journal_entry", {
      p_actor: user.id,
      p_org: orgId,
      p_entry_id: entryId,
    });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
    return json({ entry: data }, 200);
  }

  // ── post a new entry ────────────────────────────────────────────────────
  const entryDate = String(body?.entry_date ?? "");
  const idemKey = String(body?.idempotency_key ?? "");
  const lines = body?.lines;
  if (!entryDate) return json({ error: "bad_entry_date" }, 400);
  if (!idemKey) return json({ error: "missing_idempotency_key" }, 400);
  if (!Array.isArray(lines) || lines.length < 2) return json({ error: "bad_lines" }, 400);

  // Money precision guard. JSON numbers parse as JS doubles, so an amount_minor
  // above 2^53 silently truncates (E2E B3-big). Accept a string for exact bigint
  // values; reject any NUMBER that isn't a safe integer rather than corrupt it.
  const norm = normalizeAmounts(lines);
  if (!norm.ok) return json({ error: norm.error }, 422);

  const { data, error } = await svc.rpc("post_journal_entry", {
    p_actor: user.id,
    p_org: orgId,
    p_entry_date: entryDate,
    p_idempotency_key: idemKey,
    p_lines: norm.lines,
    p_source: body?.source ?? "manual",
    p_source_ref: body?.source_ref ?? null,
    p_memo: body?.memo ?? null,
  });
  if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
  return json({ entry: data }, 201);
});
