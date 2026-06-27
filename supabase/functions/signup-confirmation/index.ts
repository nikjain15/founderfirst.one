/**
 * signup-confirmation — the waitlist welcome email, sent once per new signup.
 *
 * POST { email, slug? }  (verify_jwt = false — this is called by the public
 * signup island with the anon key right after signup_to_waitlist succeeds).
 *
 * It is deliberately safe to call from the client:
 *   • It re-checks the address actually exists in `waitlist` (service role), so
 *     it can't be abused to email arbitrary people.
 *   • Idempotency is enforced server-side via the welcome_sends ledger
 *     (insert-on-conflict-do-nothing), so a double-submit / retry never
 *     double-sends — the frontend's "new signup only" guard is just an optimisation.
 *   • It respects the Settings → Emails → Scheduled toggle (email_schedules
 *     'welcome' row): a disabled welcome email sends nothing.
 *   • A send failure rolls back the ledger row so a later retry can re-send, and
 *     it always returns graceful JSON — signup must never break on an email error.
 *
 * Secrets (all already set for the email stack): RESEND_API_KEY, NOTIFY_FROM,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: SITE_URL (CTA target;
 * defaults to https://founderfirst.one).
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/send.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "jane.doe@x.com" → "Jane" — a friendly fallback when we have no real name. */
function firstNameFrom(email: string): string {
  const local = email.split("@")[0]?.split(/[._+-]/)[0] ?? "there";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const slug = body?.slug ? String(body.slug) : null;
  if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Anti-abuse: only ever email an address that actually joined the waitlist.
  const { data: wl, error: wlErr } = await service
    .from("waitlist").select("email, slug").eq("email", email).maybeSingle();
  if (wlErr) return json({ error: "lookup_failed", detail: wlErr.message }, 500);
  if (!wl) return json({ error: "not_on_waitlist" }, 404);

  // Respect the Scheduled-tab toggle.
  const { data: sched } = await service
    .from("email_schedules").select("enabled").eq("email_key", "welcome").eq("is_builtin", true).maybeSingle();
  if (sched && sched.enabled === false) {
    return json({ ok: true, skipped: "disabled" });
  }

  // Idempotency: claim the send. If the row already exists, we've sent before.
  const { data: claimed, error: claimErr } = await service
    .from("welcome_sends")
    .insert({ email, slug: slug ?? wl.slug ?? null })
    .select("email")
    .maybeSingle();
  if (claimErr) {
    // Unique violation = already sent. Any other error: don't block signup.
    if ((claimErr as any).code === "23505") return json({ ok: true, skipped: "already_sent" });
    return json({ ok: true, skipped: "ledger_error", detail: claimErr.message });
  }
  if (!claimed) return json({ ok: true, skipped: "already_sent" });

  const site = (Deno.env.get("SITE_URL") ?? "https://founderfirst.one").replace(/\/$/, "");
  const confirmedSlug = slug ?? wl.slug ?? null;
  const ctaHref = confirmedSlug
    ? `${site}/confirmed/?slug=${encodeURIComponent(confirmedSlug)}`
    : `${site}/confirmed/`;
  const firstName = firstNameFrom(email);

  const result = await sendEmail({
    supa: service,
    key: "welcome",
    to: [email],
    trigger: "db_trigger",
    vars: { firstName },
    ctaHref,
    buildText: () =>
      `Welcome to FounderFirst, ${firstName}.\n\n` +
      `You're on the waitlist — your spot is saved. We'll email you the moment ` +
      `your access is ready.\n\nSee your spot: ${ctaHref}\n`,
  });

  if (!result.ok && result.sent === 0) {
    // Roll back the claim so a retry can re-send. Send failures must not be sticky.
    await service.from("welcome_sends").delete().eq("email", email);
    return json({ ok: false, error: "send_failed", detail: result.detail }, 502);
  }

  return json({ ok: true, sent: result.sent });
});
