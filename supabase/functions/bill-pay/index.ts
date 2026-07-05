/**
 * bill-pay — the bill (accounts-payable) lifecycle write-path (card RV2-D1).
 *
 * TRACKING ONLY (Nik 4 Jul): this records what the org OWES and RECORDS payments
 * as bookkeeping entries. It NEVER moves money — there is no payments provider,
 * no transfer/disbursement API, no external side effect of any kind. The only
 * effects of any op are Supabase rows + journal postings. Payroll stays out
 * (→ Gusto). Modular / opt-in: off by default (org_ap_settings.enabled), nested
 * under an existing owner job (Connections → "Paying bills"), no new top-level
 * nav (APP_PRINCIPLES §2 usability gate).
 *
 * Ops (all POST):
 *   settings  { op, org_id, enabled? }                            → { settings }
 *   upsert    { op, org_id, bill_id?, vendor_id?, due_date?, bill_date?,
 *               currency?, memo?, expense_account_id?,
 *               lines:[{description,quantity_milli?,unit_price_minor}] }
 *                                                                  → { bill }
 *   enter     { op, org_id, bill_id }   posts Dr Expense / Cr AP   → { bill }
 *   pay       { op, org_id, bill_id, amount_minor, paid_date?, method? }
 *               RECORDS a payment: posts Dr AP / Cr Cash (moves NO money)
 *                                                                  → { bill }
 *   void      { op, org_id, bill_id, memo? }  reverses the accrual (append-only)
 *                                                                  → { bill }
 *
 * Everything funnels through SECURITY DEFINER RPCs granted to service_role only
 * (ISOTEST); the actor is the JWT-verified caller (never the body). The ledger
 * posting lives entirely in the RPCs — this fn never touches journal tables and
 * never calls any payments API. Vendors are the EXISTING 1099 vendor store (one
 * source, no duplicate); this fn only references vendor_id, never creates one.
 */
// deno-lint-ignore-file no-explicit-any
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function statusForPgError(code?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23505") return 409;
  // 23001 = restrict_violation (our business-rule guards); 23514 check, 23503 fk,
  // 22023/22P02 bad param — all client-correctable → 422.
  if (code === "23514" || code === "22023" || code === "23503" || code === "22P02" || code === "23001") return 422;
  return 400;
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
  if (orgId && !(await mfaSatisfied(svc, jwt, orgId))) return json({ error: "mfa_required", code: "mfa_required" }, 403);
  if (!UUID_RE.test(orgId)) return json({ error: "bad_org" }, 400);

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await svc.rpc(fn, { p_actor: user.id, p_org: orgId, ...args });
    if (error) return { error, data: null };
    return { error: null, data };
  };
  const fail = (error: { message: string; code?: string }) =>
    json({ error: error.message, code: error.code }, statusForPgError(error.code));

  try {
    switch (op) {
      case "settings": {
        const r = await rpc("set_ap_settings", {
          p_enabled: typeof body.enabled === "boolean" ? body.enabled : null,
        });
        if (r.error) return fail(r.error);
        return json({ settings: r.data });
      }

      case "upsert": {
        if (!Array.isArray(body.lines) || body.lines.length < 1) return json({ error: "no_lines" }, 400);
        const billId = body.bill_id ? String(body.bill_id) : null;
        if (billId && !UUID_RE.test(billId)) return json({ error: "bad_bill" }, 400);
        const vendorId = body.vendor_id ? String(body.vendor_id) : null;
        if (vendorId && !UUID_RE.test(vendorId)) return json({ error: "bad_vendor" }, 400);
        const r = await rpc("upsert_bill", {
          p_lines: body.lines,
          p_vendor_id: vendorId,
          p_due_date: body.due_date ?? null,
          p_bill_date: body.bill_date ?? null,
          p_currency: body.currency ?? null,
          p_memo: body.memo ?? null,
          p_expense_account_id: body.expense_account_id ?? null,
          p_bill_id: billId,
        });
        if (r.error) return fail(r.error);
        return json({ bill: r.data });
      }

      case "enter": {
        const billId = String(body.bill_id ?? "");
        if (!UUID_RE.test(billId)) return json({ error: "bad_bill" }, 400);
        const r = await rpc("enter_bill", { p_bill_id: billId });
        if (r.error) return fail(r.error);
        return json({ bill: r.data });
      }

      case "pay": {
        // RECORDS a payment only — no funds move. The RPC posts Dr AP / Cr Cash.
        const billId = String(body.bill_id ?? "");
        if (!UUID_RE.test(billId)) return json({ error: "bad_bill" }, 400);
        const amount = Number(body.amount_minor);
        if (!Number.isFinite(amount) || amount <= 0) return json({ error: "bad_amount" }, 400);
        const r = await rpc("record_bill_payment", {
          p_bill_id: billId, p_amount_minor: amount,
          p_paid_date: body.paid_date ?? null, p_method: body.method ?? null,
        });
        if (r.error) return fail(r.error);
        return json({ bill: r.data });
      }

      case "void": {
        const billId = String(body.bill_id ?? "");
        if (!UUID_RE.test(billId)) return json({ error: "bad_bill" }, 400);
        const r = await rpc("void_bill", { p_bill_id: billId, p_memo: body.memo ?? null });
        if (r.error) return fail(r.error);
        return json({ bill: r.data });
      }

      default:
        return json({ error: "bad_op" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
