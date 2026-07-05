/**
 * efile-1099 — E-file Phase A spike: 1099-NEC transmittal via TaxBandits (EFILE-A1).
 *
 * SPIKE, not GA. Proves the path from Penny's EXISTING 1099-NEC roll-up (W2.5
 * ninetynine_nec_summary) to a TaxBandits sandbox e-file, with the FULL TRUST
 * GATE the e-file research demanded:
 *
 *   op:'preview'    → map the roll-up → the TaxBandits Create payload; report who
 *                     is included / below-threshold / not-ready. No provider call.
 *   op:'tin_match'  → TIN-match pre-check (a mismatch is surfaced; it does NOT
 *                     transmit). Logged (phase='tin_match'). No creds → dry-run.
 *   op:'transmit'   → REQUIRES { confirm:true } AND a preceding successful TIN
 *                     match for every included vendor. NEVER auto-runs. No creds
 *                     → DRY-RUN preview logged (phase='dry_run', status='dry_run'),
 *                     never a fake success. With creds: Create → Transmit →
 *                     classify ack → log accept OR reject honestly.
 *   op:'history'    → read the immutable efile_submissions log.
 *
 * The actor is taken from the VERIFIED JWT (never the body). Vendor data is READ
 * from the W2.5 store — no vendor table is duplicated here. Full TINs / EIN, if
 * supplied at confirm time for a real transmit, are used transiently and NEVER
 * stored (the log keeps last-4 only, upstream).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildNecPayload,
  buildTinMatchPayload,
  classifyAck,
  classifyTinMatch,
  createNec,
  getAccessToken,
  type NecSummaryRow,
  readTaxBanditsConfig,
  requestTinMatch,
  transmitNec,
  type VendorFiling,
} from "../_shared/taxbandits.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function statusForPgError(code?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23514" || code === "restrict_violation" || code === "check_violation") return 422;
  return 400;
}

/** Parse the caller-supplied per-vendor filing detail (full TIN/address) for a
 *  real transmit. Never persisted; used only to build the provider payload. */
function parseFilings(input: unknown): Map<string, VendorFiling> {
  const m = new Map<string, VendorFiling>();
  if (Array.isArray(input)) {
    for (const f of input) {
      const o = (f ?? {}) as Record<string, unknown>;
      const id = String(o.vendor_id ?? "");
      if (UUID_RE.test(id)) m.set(id, { vendor_id: id, ...(o as object) } as VendorFiling);
    }
  }
  return m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? "");
  const orgId = String(body?.org_id ?? "");
  if (!UUID_RE.test(orgId)) return json({ error: "bad_org" }, 400);

  // Authorization: writes require can_write_org_as; reads require can_access_org.
  const isRead = op === "history" || op === "preview";
  const gate = isRead ? "can_access_org" : "can_write_org_as";
  const gateArgs = isRead ? { org_id: orgId } : { p_actor: user.id, target_org: orgId };
  const { data: allowed } = await svc.rpc(gate, gateArgs as Record<string, unknown>);
  if (!allowed) return json({ error: "forbidden" }, 403);

  if (op === "history") {
    const { data, error } = await svc
      .from("efile_submissions")
      .select("id, tax_year, phase, provider, submission_id, request_id, status, recipient_count, ack, confirmed_by, created_by, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 400);
    return json({ result: data });
  }

  const taxYear = Number(body?.tax_year);
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) return json({ error: "bad_tax_year" }, 400);

  // READ the roll-up from the EXISTING 1099 store (no duplicate vendor table).
  const { data: sumData, error: sumErr } = await svc.rpc("ninetynine_nec_summary", { p_org: orgId, p_tax_year: taxYear });
  if (sumErr) return json({ error: sumErr.message, code: sumErr.code }, statusForPgError(sumErr.code));
  const rows = (sumData ?? []) as NecSummaryRow[];
  const filings = parseFilings(body?.filings);
  const payer = {
    businessName: String(body?.payer?.business_name ?? "").trim() || "(payer)",
    ein: typeof body?.payer?.ein === "string" ? body.payer.ein : undefined,
    email: body?.payer?.email,
    address1: body?.payer?.address1,
    city: body?.payer?.city,
    state: body?.payer?.state,
    zip: body?.payer?.zip,
  };

  const built = buildNecPayload(taxYear, payer, rows, filings);
  const cfg = readTaxBanditsConfig({ get: (k) => Deno.env.get(k) });
  const hasCreds = cfg !== null;

  // Helper: append an immutable event to the log.
  const record = async (args: {
    phase: string;
    status: string;
    submission_id?: string | null;
    request_id?: string | null;
    confirmed_by?: string | null;
    payload?: unknown;
    ack?: unknown;
  }) => {
    const { error } = await svc.rpc("efile_record_event", {
      p_actor: user.id,
      p_org: orgId,
      p_tax_year: taxYear,
      p_phase: args.phase,
      p_status: args.status,
      p_submission_id: args.submission_id ?? null,
      p_request_id: args.request_id ?? null,
      p_confirmed_by: args.confirmed_by ?? null,
      p_request_payload: args.payload ?? {},
      p_ack: args.ack ?? {},
      p_recipient_count: built.included.length,
    });
    if (error) throw error;
  };

  try {
    // ── PREVIEW — pure mapping, no provider, no log write ─────────────────────
    if (op === "preview") {
      return json({
        result: {
          included: built.included,
          skipped_below_threshold: built.skippedBelowThreshold,
          not_ready: built.notReady,
          has_credentials: hasCreds,
          would_transmit: hasCreds,
          payload: built.request,
        },
      });
    }

    // ── TIN MATCH — pre-check, NEVER transmits ────────────────────────────────
    if (op === "tin_match") {
      const { request: tmReq, missingTin } = buildTinMatchPayload(rows.filter((r) => r.meets_threshold), filings);
      if (!hasCreds) {
        await record({ phase: "dry_run", status: "dry_run", payload: { tin_match: tmReq, missing_tin: missingTin } });
        return json({
          result: { dry_run: true, has_credentials: false, missing_tin: missingTin, would_check: tmReq.Recipients.length },
        });
      }
      const token = await getAccessToken(cfg!);
      const resp = await requestTinMatch(cfg!, token, tmReq);
      const cls = classifyTinMatch(resp);
      await record({
        phase: "tin_match",
        status: cls.mismatched.length ? "tin_mismatch" : "tin_matched",
        request_id: cls.requestId,
        ack: resp,
      });
      return json({ result: { matched: cls.matched, mismatched: cls.mismatched, missing_tin: missingTin, request_id: cls.requestId } });
    }

    // ── TRANSMIT — hard human-confirm gate; TIN-match precondition ────────────
    if (op === "transmit") {
      if (body?.confirm !== true) {
        return json({ error: "confirm_required", detail: "transmit requires an explicit confirm:true — this endpoint NEVER auto-transmits" }, 428);
      }
      if (built.included.length === 0) {
        return json({ error: "nothing_to_file", detail: "no vendors meet the 1099-NEC threshold for this year" }, 422);
      }
      // Precondition: every included vendor must have PASSED a prior TIN match
      // recorded in the immutable log (unless the caller has no creds → dry-run,
      // where there is nothing to transmit anyway). This is enforced by reading
      // the log, not by trusting the request.
      if (hasCreds) {
        const { data: matchRows } = await svc
          .from("efile_submissions")
          .select("status, ack, created_at")
          .eq("org_id", orgId).eq("tax_year", taxYear).eq("phase", "tin_match")
          .order("created_at", { ascending: false }).limit(1);
        const last = (matchRows ?? [])[0] as { status?: string; ack?: unknown } | undefined;
        if (!last || last.status !== "tin_matched") {
          return json({ error: "tin_match_required", detail: "run op:'tin_match' successfully (no mismatches) before transmitting" }, 428);
        }
        // Confirm every included vendor was in the matched set.
        const matched = new Set(classifyTinMatch(last.ack).matched);
        const unmatched = built.included.filter((v) => !matched.has(v));
        if (unmatched.length) {
          return json({ error: "tin_unmatched_vendors", detail: "some vendors were not TIN-matched", vendors: unmatched }, 428);
        }
      }

      // NO CREDS → DRY-RUN. Log the mapped payload as a would-transmit preview.
      // This is the honest "we can't actually file yet" path — NOT a fake success.
      if (!hasCreds) {
        await record({
          phase: "dry_run",
          status: "dry_run",
          confirmed_by: null, // dry_run needs no confirmer at the data layer
          payload: built.request,
        });
        return json({
          result: {
            dry_run: true,
            has_credentials: false,
            would_transmit: true,
            reason: "TAXBANDITS_* credentials are not set — returning the mapped payload, not filing",
            included: built.included,
            not_ready: built.notReady,
            payload: built.request,
          },
        });
      }

      // REAL TRANSMIT (sandbox). Refuse if any included vendor is not-ready
      // (missing TIN/address) — never file an incomplete return.
      if (built.notReady.length) {
        return json({ error: "vendors_not_ready", detail: "supply full TIN + address before transmitting", not_ready: built.notReady }, 422);
      }

      const token = await getAccessToken(cfg!);
      // 1) Create
      const createResp = await createNec(cfg!, token, built.request);
      const created = classifyAck(createResp);
      if (created.outcome === "rejected" || created.outcome === "error" || !created.submissionId) {
        await record({ phase: "transmit", status: "rejected", confirmed_by: user.id, submission_id: created.submissionId, payload: built.request, ack: createResp });
        return json({ result: { transmitted: false, outcome: created.outcome, submission_id: created.submissionId, errors: created.errors, ack: createResp } }, 200);
      }
      // 2) Transmit
      const txResp = await transmitNec(cfg!, token, created.submissionId, built.included);
      const tx = classifyAck(txResp);
      // Honest status: accepted only if the provider says so; reject/submitted/error surfaced verbatim.
      const finalStatus = tx.outcome === "accepted" ? "accepted" : tx.outcome === "submitted" ? "submitted" : tx.outcome === "rejected" ? "rejected" : "error";
      await record({
        phase: "transmit",
        status: finalStatus,
        confirmed_by: user.id, // the human confirm — required by the data-layer trust gate
        submission_id: tx.submissionId ?? created.submissionId,
        payload: built.request,
        ack: txResp,
      });
      return json({
        result: {
          transmitted: tx.outcome === "accepted" || tx.outcome === "submitted",
          outcome: tx.outcome,
          submission_id: tx.submissionId ?? created.submissionId,
          errors: tx.errors,
          ack: txResp,
        },
      });
    }

    return json({ error: "bad_op" }, 400);
  } catch (e) {
    // Fail loud — a provider/auth failure is surfaced, never turned into success.
    return json({ error: "efile_failed", detail: String((e as Error)?.message ?? e) }, 502);
  }
});
