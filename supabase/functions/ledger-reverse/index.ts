/**
 * ledger-reverse — post a reversing correction (the write-path; ARCHITECTURE.md §6.1, §8).
 *
 * POST { org_id, entry_id, idempotency_key, entry_date?, memo? }
 *
 * Append-only ledger: a posted entry is never edited or deleted; a correction is
 * a NEW entry that flips every line's side and references the original. The
 * correction lands in an open period (a closed original period stays locked).
 * reverse_journal_entry enforces authorization + idempotency atomically; the
 * actor comes from the verified JWT.
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
function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (/already_reversed|not_posted/.test(message ?? "")) return 409;
  if (/period_closed/.test(message ?? "")) return 409;
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
  const orgId = String(body?.org_id ?? "");
  const entryId = String(body?.entry_id ?? "");
  const idemKey = String(body?.idempotency_key ?? "");
  if (!orgId) return json({ error: "bad_org" }, 400);

  if (!(await mfaSatisfied(svc, jwt, orgId))) return json({ error: "mfa_required", code: "mfa_required" }, 403);
  if (!entryId) return json({ error: "bad_entry" }, 400);
  if (!idemKey) return json({ error: "missing_idempotency_key" }, 400);

  const { data, error } = await svc.rpc("reverse_journal_entry", {
    p_actor: user.id,
    p_org: orgId,
    p_entry_id: entryId,
    p_idempotency_key: idemKey,
    p_entry_date: body?.entry_date ?? null,
    p_memo: body?.memo ?? null,
  });
  if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
  return json({ entry: data }, 201);
});
