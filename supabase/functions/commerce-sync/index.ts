/**
 * commerce-sync — pull Square/PayPal SANDBOX payouts (read-only) and post each
 * split through post_ecommerce_payout, the SAME write-path the CSV upload uses.
 * (W4.1-C/D · ARCHITECTURE.md §8.)
 *
 * POST { org_id, provider:'square'|'paypal', bank_account_id,
 *        start_date?, end_date?, window_payout_id? } (authed)
 *   → { synced: CommercePayoutResult[], skipped: number }
 *
 * READ-ONLY toward the provider: only GET/search endpoints are hit; nothing
 * writes to Square/PayPal or moves money. SANDBOX only — provider tokens come
 * from function env (SQUARE_SANDBOX_ACCESS_TOKEN / SQUARE_SANDBOX_LOCATION_ID /
 * PAYPAL_SANDBOX_CLIENT_ID / PAYPAL_SANDBOX_SECRET), NEVER the request body and
 * NEVER hardcoded. Production OAuth (a prod app + owner consent) is a separate,
 * human-gated step and is intentionally not wired here.
 *
 * ⭐ EXACTLY-ONCE: each payout is posted with the provider's NATIVE payout id.
 * post_ecommerce_payout keys on `ext:<provider>:payout:<id>` (unique per org),
 * so a payout pulled here and the same payout uploaded via CSV collapse to ONE
 * posted entry — the RPC returns the ORIGINAL entry on collision, surfaced as
 * `duplicate:true`. The actor is the verified JWT (never the body); the RPC
 * enforces can_write_org_as.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchPayPalPayout, fetchSquarePayouts, type CommercePayout } from "../_shared/commerceApi.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23505" || /reconcile/.test(message ?? "")) return 409;
  if (code === "22023" || code === "23503" || code === "23514") return 422;
  return 400;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Captured before any post: any entry whose created_at predates this request
  // was an idempotency hit (post_journal_entry returns the ORIGINAL row on a
  // key collision) — a robust duplicate signal that does not depend on how long
  // ago the original was posted (the old >10s heuristic mislabelled a payout
  // posted <10s earlier as freshly-posted, lying in the very response meant to
  // prove exactly-once).
  const requestStart = Date.now();

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orgId = String(body?.org_id ?? "");
  const provider = String(body?.provider ?? "");
  const bankAccountId = String(body?.bank_account_id ?? "");
  if (!orgId) return json({ error: "bad_org" }, 400);
  if (provider !== "square" && provider !== "paypal") return json({ error: "bad_provider" }, 400);
  if (!bankAccountId) return json({ error: "bad_bank" }, 400);

  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  // Pull payouts read-only from the SANDBOX provider using function-env creds.
  let payouts: CommercePayout[];
  try {
    if (provider === "square") {
      const token = Deno.env.get("SQUARE_SANDBOX_ACCESS_TOKEN");
      const location = Deno.env.get("SQUARE_SANDBOX_LOCATION_ID");
      if (!token || !location) return json({ error: "provider_not_configured", detail: "square sandbox creds missing" }, 501);
      payouts = await fetchSquarePayouts(token, location);
    } else {
      const clientId = Deno.env.get("PAYPAL_SANDBOX_CLIENT_ID");
      const secret = Deno.env.get("PAYPAL_SANDBOX_SECRET");
      if (!clientId || !secret) return json({ error: "provider_not_configured", detail: "paypal sandbox creds missing" }, 501);
      const now = new Date();
      const end = body?.end_date ? new Date(String(body.end_date)) : now;
      const start = body?.start_date ? new Date(String(body.start_date)) : new Date(end.getTime() - 31 * 864e5);
      const one = await fetchPayPalPayout(clientId, secret, start.toISOString(), end.toISOString(), body?.window_payout_id ? String(body.window_payout_id) : undefined);
      payouts = one ? [one] : [];
    }
  } catch (e) {
    return json({ error: "provider_fetch_failed", detail: (e as Error).message }, 502);
  }

  // Post each payout via the SAME RPC as the CSV path. Exactly-once is the RPC's
  // idempotency key; a re-pull (or a CSV of the same payout) returns the original.
  const synced: Array<{ payoutId: string; netMinor: number; duplicate: boolean; reconciles: boolean; posted: boolean; error?: string }> = [];
  let skipped = 0;
  for (const p of payouts) {
    if (!p.reconciles) {
      // Never post a split that doesn't tie to the provider's own net (LEARNINGS #16).
      synced.push({ payoutId: p.payoutId, netMinor: p.netMinor, duplicate: false, reconciles: false, posted: false, error: "does_not_reconcile" });
      skipped++;
      continue;
    }
    const { data, error } = await svc.rpc("post_ecommerce_payout", {
      p_actor: user.id, p_org: orgId, p_provider: p.provider,
      p_payout_id: p.payoutId, p_payout_date: p.payoutDate,
      p_bank_account: bankAccountId,
      p_gross_minor: p.grossMinor, p_fees_minor: p.feesMinor,
      p_refunds_minor: p.refundsMinor, p_adjust_minor: p.adjustMinor,
      p_net_minor: p.netMinor, p_currency: p.currency, p_memo: null,
    });
    if (error) {
      synced.push({ payoutId: p.payoutId, netMinor: p.netMinor, duplicate: false, reconciles: true, posted: false, error: error.message });
      // a 409 reconcile/dup collision is not fatal to the batch — keep going
      if (statusForPgError(error.code, error.message) >= 500) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
      continue;
    }
    const created = (data as { created_at?: string } | null)?.created_at;
    // predates this request → the RPC returned a pre-existing entry (dedup hit).
    const duplicate = created ? new Date(created).getTime() < requestStart : false;
    synced.push({ payoutId: p.payoutId, netMinor: p.netMinor, duplicate, reconciles: true, posted: !duplicate });
  }

  return json({ synced, skipped }, 200);
});
