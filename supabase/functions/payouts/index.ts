/**
 * payouts — e-commerce payout splitting write-path (W4.1; ARCHITECTURE.md §8).
 *
 * POST { op:'post',    org_id, provider, payout_id, payout_date, bank_account_id,
 *                       gross_minor, fees_minor?, refunds_minor?, adjust_minor?,
 *                       net_minor?, currency?, memo? }
 * POST { op:'reverse', org_id, provider, payout_id, date?, memo? }
 *
 * The split MATH + CSV parsing happen in the browser (apps/app/src/ecommerce/*);
 * this endpoint receives the already-normalized component totals and posts them
 * through the SECURITY DEFINER RPCs (post_ecommerce_payout / reverse_ecommerce_
 * payout), which are locked to service_role (isolation P0). The actor is taken
 * from the verified JWT — NEVER the body — and authorization is enforced
 * server-side (can_write_org_as inside the RPC).
 *
 * Idempotency is the RPC's job: a re-post of the same payout collides on the
 * `ext:<provider>:payout:<id>` idempotency key inside post_journal_entry and
 * returns the ORIGINAL entry — no double-post. We surface that to the caller as
 * `duplicate: true` by comparing the returned entry's created_at to now.
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
  if (code === "23505" || /reconcile/.test(message ?? "")) return 409;
  if (code === "22023" || code === "23503" || code === "23514") return 422;
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
  const provider = String(body?.provider ?? "");
  if (!provider) return json({ error: "bad_provider" }, 400);
  const payoutId = String(body?.payout_id ?? "");
  if (!payoutId) return json({ error: "bad_payout" }, 400);

  if (op === "reverse") {
    const { data, error } = await svc.rpc("reverse_ecommerce_payout", {
      p_actor: user.id, p_org: orgId, p_provider: provider, p_payout_id: payoutId,
      p_date: body?.date ?? null, p_memo: body?.memo ?? null,
    });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
    return json({ entry: data }, 200);
  }

  if (op !== "post") return json({ error: "bad_op" }, 400);
  if (!body?.payout_date) return json({ error: "bad_date" }, 400);
  if (!body?.bank_account_id) return json({ error: "bad_bank" }, 400);

  const { data, error } = await svc.rpc("post_ecommerce_payout", {
    p_actor: user.id, p_org: orgId, p_provider: provider,
    p_payout_id: payoutId, p_payout_date: body.payout_date,
    p_bank_account: body.bank_account_id,
    p_gross_minor: body?.gross_minor ?? 0,
    p_fees_minor: body?.fees_minor ?? 0,
    p_refunds_minor: body?.refunds_minor ?? 0,
    p_adjust_minor: body?.adjust_minor ?? 0,
    p_net_minor: body?.net_minor ?? null,
    p_currency: body?.currency ?? null,
    p_memo: body?.memo ?? null,
  });
  if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));

  // Idempotent re-post: the RPC returns the ORIGINAL entry (created earlier) on a
  // collision. Flag it so the UI can say "already imported" instead of double-posting.
  const created = (data as { created_at?: string } | null)?.created_at;
  const duplicate = created ? Date.now() - new Date(created).getTime() > 10_000 : false;
  return json({ entry: data, duplicate }, 200);
});
