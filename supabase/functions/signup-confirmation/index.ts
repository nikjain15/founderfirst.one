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
 *   • An email NOT on the waitlist gets the SAME response as one already sent
 *     (SEC-4, weekly audit PR #301 P2) — otherwise an attacker could POST
 *     arbitrary addresses and enumerate waitlist membership from the 404 vs 200
 *     split. The real signup flow always calls this right after
 *     `signup_to_waitlist` succeeds, so this branch is never hit legitimately.
 *   • Requests are rate-limited per source IP, hourly, via
 *     `check_signup_confirmation_rate_limit` (threshold in `platform_config`,
 *     admin-tunable, no redeploy) — this only bounds probing volume; it never
 *     changes which response an address gets.
 *
 * Secrets (all already set for the email stack): RESEND_API_KEY, NOTIFY_FROM,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: SITE_URL (CTA target;
 * defaults to https://founderfirst.one).
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/send.ts";
import { clientIp, NOTHING_TO_SEND } from "./guard.ts";

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

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Rate-limit BEFORE parsing/validating the body — probing volume is bounded
  // regardless of whether individual requests are well-formed.
  const { data: allowed, error: rlErr } = await service.rpc("check_signup_confirmation_rate_limit", {
    p_ip: clientIp(req),
  });
  if (rlErr) return json({ error: "rate_limit_check_failed", detail: rlErr.message }, 500);
  if (allowed === false) return json({ error: "rate_limited" }, 429);

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  const slug = body?.slug ? String(body.slug) : null;
  if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);

  // Anti-abuse: only ever email an address that actually joined the waitlist.
  // A miss here gets the SAME response as "already sent" (see NOTHING_TO_SEND)
  // — never a distinguishable 404 — so this endpoint can't be used to
  // enumerate waitlist membership by probing arbitrary addresses.
  const { data: wl, error: wlErr } = await service
    .from("waitlist").select("email, slug").eq("email", email).maybeSingle();
  if (wlErr) return json({ error: "lookup_failed", detail: wlErr.message }, 500);
  if (!wl) return json(NOTHING_TO_SEND);

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
    if ((claimErr as any).code === "23505") return json(NOTHING_TO_SEND);
    return json({ ok: true, skipped: "ledger_error", detail: claimErr.message });
  }
  if (!claimed) return json(NOTHING_TO_SEND);

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
