/**
 * resend-webhook — ingests Resend delivery events into email_events.
 *
 * Resend signs every webhook with Svix. We verify the signature before trusting
 * anything: an unsigned or tampered request is rejected with 401, so an arbitrary
 * caller can't poison our open/click stats. Verified events (delivered / opened /
 * clicked / bounced / complained) are written to email_events, keyed by the Resend
 * message id (data.email_id) which links back to email_log.resend_id.
 *
 * Setup:
 *   1. supabase secrets set RESEND_WEBHOOK_SECRET=whsec_…   (from Resend → Webhooks)
 *   2. supabase functions deploy resend-webhook
 *   3. In Resend → Webhooks, add the function URL and subscribe to the
 *      email.delivered / opened / clicked / bounced / complained events.
 *
 * Auth: verify_jwt = false (see config.toml). The Svix signature is the gate.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Constant-time-ish compare of two strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify a Svix-signed payload (Resend's scheme).
 * signedContent = `${id}.${timestamp}.${body}`; HMAC-SHA256 with the secret
 * (the part after "whsec_", base64-decoded); compare base64 to any v1 sig.
 */
async function verifySvix(
  secret: string, id: string, timestamp: string, body: string, sigHeader: string,
): Promise<boolean> {
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", base64ToBytes(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const data = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // Header is space-separated "v1,<sig> v1,<sig2>". Match any.
  return sigHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    return safeEqual(sig, expected);
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook_secret_missing" }, 500);

  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signature = req.headers.get("svix-signature") ?? "";
  const raw = await req.text();

  if (!id || !timestamp || !signature) return json({ error: "missing_signature" }, 401);

  // Reject stale timestamps (>5 min skew) to blunt replay.
  const ts = Number(timestamp) * 1000;
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return json({ error: "stale_timestamp" }, 401);
  }

  const ok = await verifySvix(secret, id, timestamp, raw, signature).catch(() => false);
  if (!ok) return json({ error: "bad_signature" }, 401);

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }

  const type: string = payload?.type ?? "";
  const data = payload?.data ?? {};
  const resendId: string | null = data?.email_id ?? data?.id ?? null;
  if (!type) return json({ ok: true, ignored: "no_type" });

  const recipient = Array.isArray(data?.to) ? data.to[0] : (data?.to ?? null);
  const occurredAt = payload?.created_at ?? new Date().toISOString();

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { error } = await supa.from("email_events").insert({
    resend_id: resendId,
    type,
    recipient,
    occurred_at: occurredAt,
    raw: payload,
  });
  if (error) return json({ ok: false, error: "insert_failed", detail: error.message }, 500);

  return json({ ok: true, type, resend_id: resendId });
});
