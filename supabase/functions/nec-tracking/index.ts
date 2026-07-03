/**
 * nec-tracking — 1099 contractor tracking write/read gateway (card W2.5).
 *
 * The vendor + vendor-tag RPCs are service_role only (ISOTEST pattern), so every
 * mutation comes through this function. The actor is taken from the VERIFIED JWT
 * (never the body) and passed as p_actor; the RPCs enforce authorization
 * (can_write_org_as for writes, can_access_org for the summary read), validate
 * their inputs, and write ledger_audit inline.
 *
 * Ops:
 *   vendor_upsert  { op:'vendor_upsert',  org_id, vendor_id?, name, is_1099_eligible,
 *                    legal_name?, tax_id_type?, tax_id_last4?, address?, w9_on_file? }
 *   vendor_archive { op:'vendor_archive', org_id, vendor_id }
 *   tag_entry      { op:'tag_entry',      org_id, entry_id, vendor_id, payment_method_key }
 *   untag_entry    { op:'untag_entry',    org_id, entry_id }
 *   nec_summary    { op:'nec_summary',    org_id, tax_year }   ← read (read_only CPA ok)
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function statusForPgError(code?: string, message?: string): number {
  if (code === "42501") return 403; // insufficient_privilege
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23505") return 409;
  if (code === "23514" || code === "22023" || code === "23503" || code === "22P02") return 422;
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
  if (!UUID_RE.test(orgId)) return json({ error: "bad_org" }, 400);

  const callWrite = async (fn: string, args: Record<string, unknown>, okStatus = 200) => {
    const { data, error } = await svc.rpc(fn, { p_actor: user.id, p_org: orgId, ...args });
    if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
    return json({ result: data }, okStatus);
  };

  switch (op) {
    case "vendor_upsert": {
      const name = String(body?.name ?? "");
      if (!name.trim()) return json({ error: "empty_name" }, 400);
      const vendorId = body?.vendor_id ? String(body.vendor_id) : null;
      if (vendorId && !UUID_RE.test(vendorId)) return json({ error: "bad_vendor" }, 400);
      return callWrite("vendor_upsert", {
        p_vendor_id: vendorId,
        p_name: name,
        p_is_1099_eligible: Boolean(body?.is_1099_eligible),
        p_legal_name: body?.legal_name ?? null,
        p_tax_id_type: body?.tax_id_type ?? null,
        p_tax_id_last4: body?.tax_id_last4 ?? null,
        p_address: body?.address ?? null,
        p_w9_on_file: Boolean(body?.w9_on_file),
      }, 201);
    }
    case "vendor_archive": {
      const vendorId = String(body?.vendor_id ?? "");
      if (!UUID_RE.test(vendorId)) return json({ error: "bad_vendor" }, 400);
      return callWrite("vendor_archive", { p_vendor_id: vendorId });
    }
    case "tag_entry": {
      const entryId = String(body?.entry_id ?? "");
      const vendorId = String(body?.vendor_id ?? "");
      const method = String(body?.payment_method_key ?? "");
      if (!UUID_RE.test(entryId)) return json({ error: "bad_entry" }, 400);
      if (!UUID_RE.test(vendorId)) return json({ error: "bad_vendor" }, 400);
      if (!method) return json({ error: "bad_method" }, 400);
      return callWrite("entry_tag_vendor", {
        p_entry_id: entryId, p_vendor_id: vendorId, p_payment_method_key: method,
      }, 201);
    }
    case "untag_entry": {
      const entryId = String(body?.entry_id ?? "");
      if (!UUID_RE.test(entryId)) return json({ error: "bad_entry" }, 400);
      return callWrite("entry_untag_vendor", { p_entry_id: entryId });
    }
    case "nec_summary": {
      const taxYear = Number(body?.tax_year);
      if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
        return json({ error: "bad_tax_year" }, 400);
      }
      const { data, error } = await svc.rpc("ninetynine_nec_summary", {
        p_org: orgId, p_tax_year: taxYear,
      });
      if (error) return json({ error: error.message, code: error.code }, statusForPgError(error.code, error.message));
      return json({ result: data });
    }
    default:
      return json({ error: "bad_op" }, 400);
  }
});
