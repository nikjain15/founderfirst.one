/**
 * receipts — Penny's receipt capture + match loop (W3.5).
 *
 *   POST { op:"capture", org_id, capture_kind:"photo"|"text",
 *          image_base64?, mime?, raw_text? }
 *     → parses vendor/amount/date via the AI layer (grounded, recorded to
 *       ai_decisions), matches to an existing transaction (W1.1 matcher
 *       discipline: exact date+amount first, fuzzy amount+date-window second),
 *       then bands the match through the W3.2 tier pipeline:
 *         • HIGH  → auto-ATTACH + a "Penny did this" feed row (no card).
 *         • LOW   → a 1-tap confirm card in Review (returned as { card }).
 *         • no candidate → the receipt lands in the short UNMATCHED queue.
 *       → { receipt, match, tier, activity?, card?, candidate? }
 *   POST { op:"attach",  org_id, receipt_id, entry_id }   — owner confirm / re-point
 *     → { receipt }
 *   POST { op:"detach",  org_id, receipt_id }             — 1-tap undo of the link
 *   POST { op:"dismiss", org_id, receipt_id }             — discard a receipt
 *   POST { op:"signed_url", org_id, receipt_id }          — short-lived asset URL
 *     → { url }
 *
 * Everything reuses what is already built — no new hosted service, no new tier
 * model, no inline confidence cutoff:
 *   • Parse runs through the SAME inference seam as categorize (resolveOnDeno,
 *     grounded JSON schema, recorded to ai_decisions).
 *   • The match confidence is banded by tierFor() reading platform_config via
 *     get_effective_behavior_config (CENTRAL-1 / W3.2) — the cutoffs are DATA.
 *   • Owner-facing copy comes from the live 'app' persona (get_live_app_persona).
 *   • The asset lives in the private 'receipts' Supabase Storage bucket; the app
 *     gets a short-lived signed URL, never the object directly.
 *
 * Every write path is RLS-scoped through SECURITY DEFINER RPCs granted only to
 * service_role (ISOTEST discipline); the caller must be able to WRITE the org.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveOnDeno } from "../_shared/inference/deno.ts";
import { orgTenant } from "../_shared/inference/core.ts";
import {
  matchConfidence,
  matchReceipt,
  receiptTier,
  vendorInMemo,
  type EntryCandidate,
  type ParsedReceipt,
} from "./matcher.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USE_CASE_RECEIPT_PARSE = "penny_receipt_parse";
const BUCKET = "receipts";
const MATCH_WINDOW_DAYS = 4; // same ±window discipline as W1.1 fuzzy pass

// ── Trust tiers are DATA (platform_config, CENTRAL-1 / W3.2) — read via the one
//    reader RPC, org override folded over the platform default. Baked fallback
//    mirrors apps/app/src/copy/config.ts CONFIG_DEFAULTS + the migration seed, so
//    behavior is identical whether or not the read lands. NO magic numbers below.
interface BehaviorConfig {
  confidence_high: number; confidence_medium: number;
  auto_propose_limit: number; asks_per_week: number; digest_cadence_days: number;
}
const CONFIG_DEFAULTS: BehaviorConfig = {
  confidence_high: 0.75, confidence_medium: 0.45,
  auto_propose_limit: 8, asks_per_week: 5, digest_cadence_days: 7,
};
// deno-lint-ignore no-explicit-any
async function effectiveConfig(svc: any, orgId: string): Promise<BehaviorConfig> {
  const { data } = await svc.rpc("get_effective_behavior_config", { p_org: orgId });
  const raw = (data ?? {}) as Record<string, unknown>;
  const out = { ...CONFIG_DEFAULTS };
  for (const k of Object.keys(out) as (keyof BehaviorConfig)[]) {
    const v = Number(raw[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}
// The tier band is receiptTier() in matcher.ts (shared, one source of truth with
// the app + the Vitest flow test). The cutoffs are DATA from platform_config —
// never a magic number here.

// ── the live 'app' persona voice (CENTRAL-1) — owner-facing copy, no redeploy ──
// deno-lint-ignore no-explicit-any
async function appPersona(svc: any): Promise<string> {
  const { data } = await svc.rpc("get_live_app_persona", { p_surface: "app" });
  const body = Array.isArray(data) ? data[0]?.body : (data as { body?: string } | null)?.body;
  return typeof body === "string" ? body : "";
}
function money(minor: number | null): string {
  if (minor == null) return "this receipt";
  return "$" + (Math.abs(minor) / 100).toFixed(2);
}
function pennyAttachedSummary(receipt: ParsedReceipt, memo: string | null): string {
  const who = receipt.vendor ? receipt.vendor : (memo ?? "this charge");
  return `Filed your ${money(receipt.amount_minor)} receipt from ${who} with its transaction.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u } = await svc.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? "");
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return json({ error: "bad_request: org_id required" }, 400);

  // Same gate as every write button: only a writer captures / attaches.
  const { data: canWrite } = await svc.rpc("can_write_org_as", { p_actor: user.id, target_org: orgId });
  if (!canWrite) return json({ error: "forbidden" }, 403);

  // ── attach — owner confirms (from the card or the unmatched queue) ───────────
  if (op === "attach") {
    const receiptId = String(body?.receipt_id ?? "");
    const entryId = String(body?.entry_id ?? "");
    if (!receiptId || !entryId) return json({ error: "bad_request: receipt_id + entry_id required" }, 400);
    const { data: receipt, error } = await svc.rpc("attach_receipt", {
      p_actor: user.id, p_org: orgId, p_receipt_id: receiptId, p_entry_id: entryId,
      p_match_kind: "manual", p_confidence: null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ receipt });
  }

  // ── detach — 1-tap undo of the link (does NOT touch the ledger) ──────────────
  if (op === "detach") {
    const receiptId = String(body?.receipt_id ?? "");
    if (!receiptId) return json({ error: "bad_request: receipt_id required" }, 400);
    const { data: receipt, error } = await svc.rpc("detach_receipt", {
      p_actor: user.id, p_org: orgId, p_receipt_id: receiptId,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ receipt });
  }

  // ── dismiss — discard a receipt that documents nothing ───────────────────────
  if (op === "dismiss") {
    const receiptId = String(body?.receipt_id ?? "");
    if (!receiptId) return json({ error: "bad_request: receipt_id required" }, 400);
    const { data: receipt, error } = await svc.rpc("dismiss_receipt", {
      p_actor: user.id, p_org: orgId, p_receipt_id: receiptId,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ receipt });
  }

  // ── signed_url — a short-lived read URL for the private asset ─────────────────
  if (op === "signed_url") {
    const receiptId = String(body?.receipt_id ?? "");
    if (!receiptId) return json({ error: "bad_request: receipt_id required" }, 400);
    // Fetch the object path (service role); RLS on storage.objects also gates reads.
    const { data: r } = await svc.from("receipts").select("storage_path").eq("id", receiptId).eq("org_id", orgId).maybeSingle();
    const path = (r as { storage_path?: string } | null)?.storage_path;
    if (!path) return json({ error: "no_asset" }, 404);
    const { data: signed, error } = await svc.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) return json({ error: error.message }, 400);
    return json({ url: signed?.signedUrl ?? null });
  }

  // ── capture — the main flow: upload + parse + match + tier ───────────────────
  if (op !== "capture") return json({ error: "bad_op" }, 400);

  const captureKind = body?.capture_kind === "text" ? "text" : "photo";
  const rawTextIn = typeof body?.raw_text === "string" ? body.raw_text : null;

  // 1) Store the asset (photo captures) in the private bucket. Path = <org>/<uuid>.
  let storagePath: string | null = null;
  if (captureKind === "photo") {
    const b64 = typeof body?.image_base64 === "string" ? body.image_base64 : "";
    if (!b64) return json({ error: "bad_request: image_base64 required for a photo capture" }, 400);
    const mime = typeof body?.mime === "string" ? body.mime : "image/jpeg";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("heic") ? "heic" : "jpg";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const objId = crypto.randomUUID();
    storagePath = `${orgId}/${objId}.${ext}`;
    const { error: upErr } = await svc.storage.from(BUCKET).upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (upErr) return json({ error: "upload_failed", detail: upErr.message }, 500);
  } else if (!rawTextIn) {
    return json({ error: "bad_request: raw_text required for a text capture" }, 400);
  }

  // 2) Parse vendor / amount / date via the AI layer (grounded, recorded).
  const parsed = await parseReceipt(svc, orgId, captureKind, storagePath, body, rawTextIn);

  // 3) Persist the parsed receipt (pre-match), audit-logged.
  const { data: receipt, error: recErr } = await svc.rpc("record_receipt", {
    p_actor: user.id, p_org: orgId, p_capture_kind: captureKind,
    p_storage_path: storagePath, p_vendor: parsed.vendor,
    p_amount_minor: parsed.amount_minor, p_receipt_date: parsed.receipt_date,
    p_raw_text: parsed.raw_text,
  });
  if (recErr || !receipt) return json({ error: "record_failed", detail: recErr?.message }, 500);

  // 4) Match to an existing transaction (W1.1 discipline). Load candidate entries
  //    in the ±window around the receipt date; skip entries that already carry a
  //    receipt (the matcher enforces this too).
  const candidates = await loadCandidates(svc, orgId, parsed.receipt_date);
  const match = matchReceipt(parsed, candidates, MATCH_WINDOW_DAYS);

  if (!match) {
    // No candidate → the receipt stays in the short UNMATCHED queue.
    return json({ receipt, match: null, tier: "unmatched" });
  }

  const matchedEntry = candidates.find((c) => c.entry_id === match.entry_id) ?? null;
  const corroborated = vendorInMemo(parsed.vendor, matchedEntry?.memo ?? null);
  const confidence = matchConfidence(match, corroborated);

  // 5) Band the match through the W3.2 tiers (cutoffs are DATA, no magic number).
  const cfg = await effectiveConfig(svc, orgId);
  const tier = receiptTier(match, confidence, cfg);

  if (tier === "high") {
    // HIGH → auto-attach + a "Penny did this" feed row.
    const summary = pennyAttachedSummary(parsed, matchedEntry?.memo ?? null);
    const { data: activity, error } = await svc.rpc("autoattach_receipt", {
      p_actor: user.id, p_org: orgId, p_receipt_id: receipt.id, p_entry_id: match.entry_id,
      p_match_kind: match.kind, p_confidence: confidence, p_summary: summary,
    });
    if (error) {
      // Auto-attach lost a race (e.g. the entry got a receipt) → fall back to a card.
      return json({ receipt, match, tier: "low", candidate: cardCandidate(match, matchedEntry, confidence), note: error.message });
    }
    return json({ receipt, match, tier: "high", activity });
  }

  // MEDIUM / LOW → a 1-tap confirm card in Review (not auto-attached).
  return json({ receipt, match, tier, card: true, candidate: cardCandidate(match, matchedEntry, confidence) });
});

// ── the confirm-card payload the app renders ─────────────────────────────────
function cardCandidate(
  match: { entry_id: string; kind: "exact" | "fuzzy"; dateDelta: number },
  entry: EntryCandidate | null,
  confidence: number,
) {
  return {
    entry_id: match.entry_id,
    entry_date: entry?.entry_date ?? null,
    memo: entry?.memo ?? null,
    amount_minor: entry?.amount_minor ?? null,
    match_kind: match.kind,
    date_delta: match.dateDelta,
    confidence,
  };
}

// ── load candidate ledger entries around the receipt date ────────────────────
// deno-lint-ignore no-explicit-any
async function loadCandidates(svc: any, orgId: string, receiptDate: string | null): Promise<EntryCandidate[]> {
  if (!receiptDate) return [];
  const start = new Date(`${receiptDate}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - MATCH_WINDOW_DAYS);
  const end = new Date(`${receiptDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + MATCH_WINDOW_DAYS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: entries } = await svc.from("journal_entries")
    .select("id, entry_date, memo, status, lines:journal_lines(amount_minor, side)")
    .eq("org_id", orgId).neq("status", "reversed")
    .gte("entry_date", iso(start)).lte("entry_date", iso(end));

  const rows = (entries ?? []) as {
    id: string; entry_date: string; memo: string | null;
    lines: { amount_minor: number; side: string }[] | null;
  }[];
  if (rows.length === 0) return [];

  // Which of these already carry a live receipt (so the matcher can skip them).
  const { data: attached } = await svc.rpc("list_attached_receipts", { p_org: orgId });
  const taken = new Set((attached ?? []).map((a: { entry_id: string }) => a.entry_id));

  return rows.map((e) => {
    // The entry's total magnitude = Σ debits (a balanced entry has Σ D = Σ C).
    const total = (e.lines ?? []).filter((l) => l.side === "D").reduce((s, l) => s + Number(l.amount_minor), 0);
    return { entry_id: e.id, entry_date: e.entry_date, amount_minor: total, memo: e.memo, has_receipt: taken.has(e.id) };
  });
}

// ── parse a receipt to vendor/amount/date via the inference layer ────────────
// Photo captures are OCR'd + parsed by the vision model; text captures parse the
// pasted text. The model returns a strict JSON shape; every call is recorded to
// ai_decisions by resolveOnDeno. Amount is normalized to signed minor units
// (−out, the common case for a receipt).
// deno-lint-ignore no-explicit-any
async function parseReceipt(svc: any, orgId: string, captureKind: string, _storagePath: string | null, body: any, rawTextIn: string | null): Promise<ParsedReceipt & { raw_text: string | null }> {
  const persona = await appPersona(svc);
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["vendor", "amount", "date"],
    properties: {
      vendor: { type: ["string", "null"], description: "merchant / seller name, or null if unreadable" },
      amount: { type: ["number", "null"], description: "the receipt TOTAL as a positive decimal in the receipt's currency, or null" },
      date: { type: ["string", "null"], description: "the receipt date as YYYY-MM-DD, or null" },
    },
  } as const;
  const system = [
    persona ? persona + "\n\n" : "",
    "You are Penny, an autonomous bookkeeper, reading one purchase receipt. Extract",
    "the merchant (vendor), the grand TOTAL paid, and the date. Return ONLY those",
    "three fields. If a field is unreadable, return null for it — never guess.",
  ].join(" ");

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const raw = captureKind === "text" ? rawTextIn : null;
  if (!apiKey) {
    // No model available (e.g. local dev) → keep the receipt unparsed; it lands in
    // the unmatched queue and the owner can point it at a transaction by hand.
    return { vendor: null, amount_minor: null, receipt_date: null, raw_text: raw };
  }

  // Build the user content: vision block for a photo, text for a paste.
  // deno-lint-ignore no-explicit-any
  const content: any = captureKind === "photo" && typeof body?.image_base64 === "string"
    ? [
        { type: "image", source: { type: "base64", media_type: typeof body?.mime === "string" ? body.mime : "image/jpeg", data: body.image_base64 } },
        { type: "text", text: "Read this receipt and return { vendor, amount, date }." },
      ]
    : `Receipt text:\n${raw ?? ""}\n\nReturn { vendor, amount, date }.`;

  try {
    const result = await resolveOnDeno(
      {
        useCase: USE_CASE_RECEIPT_PARSE,
        tenantId: orgTenant(orgId),
        system,
        messages: [{ role: "user", content }],
        maxTokens: 300,
        temperature: 0,
        jsonSchema: schema,
        timeoutMs: 30_000,
        anthropic: { maxRetries: 1 },
        pinModel: { provider: "anthropic", model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001" },
        record: { storeInput: false, ref: orgId },
      },
      { ANTHROPIC_API_KEY: apiKey, SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY },
    );
    const parsed = JSON.parse(result.text || "{}") as { vendor?: string | null; amount?: number | null; date?: string | null };
    const amountMinor = typeof parsed.amount === "number" && Number.isFinite(parsed.amount)
      ? -Math.round(parsed.amount * 100) // receipts are money OUT → negative minor units
      : null;
    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    return {
      vendor: typeof parsed.vendor === "string" && parsed.vendor.trim() ? parsed.vendor.trim() : null,
      amount_minor: amountMinor,
      receipt_date: date,
      raw_text: raw,
    };
  } catch (_e) {
    return { vendor: null, amount_minor: null, receipt_date: null, raw_text: raw };
  }
}
