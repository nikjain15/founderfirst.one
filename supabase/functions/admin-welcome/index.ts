/**
 * admin-welcome — the welcome email sent once when someone is added to the
 * `admins` allow-list. Tells the new admin they have access and how to sign in
 * (one-tap magic link), through the shared on-brand send path.
 *
 * POST { email }  — gated by a signed-in admin's JWT (mirrors email-test):
 *   • Caller must be an admin (valid JWT + row in `admins`).
 *   • Anti-abuse: only ever emails an address that is ITSELF already in `admins`,
 *     so it can't be used to email arbitrary people.
 *   • Idempotency via the admin_welcome_sends ledger (insert-on-conflict): a
 *     re-add / retry never double-sends.
 *   • Respects the Settings → Emails → Scheduled toggle (email_schedules
 *     'admin_welcome' row): disabled → sends nothing.
 *   • A send failure rolls back the ledger row so a later retry can re-send, and
 *     always returns graceful JSON — adding an admin must never break on email.
 *
 * Secrets (all already set for the email stack): RESEND_API_KEY, NOTIFY_FROM,
 * SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Optional: ADMIN_URL.
 * Auth: verify_jwt = false — the admin check is in code below.
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
  if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;

  // ---- Auth: caller must be a signed-in admin -------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ error: "unauthorized" }, 401);
  const { data: callerRow } = await userClient
    .from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!callerRow) return json({ error: "forbidden" }, 403);

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Anti-abuse: only ever email an address that is actually an admin.
  const { data: target, error: tErr } = await service
    .from("admins").select("email, added_by").eq("email", email).maybeSingle();
  if (tErr) return json({ error: "lookup_failed", detail: tErr.message }, 500);
  if (!target) return json({ error: "not_an_admin" }, 404);

  // Respect the Scheduled-tab toggle.
  const { data: sched } = await service
    .from("email_schedules").select("enabled").eq("email_key", "admin_welcome").eq("is_builtin", true).maybeSingle();
  if (sched && sched.enabled === false) return json({ ok: true, skipped: "disabled" });

  const addedBy = target.added_by || user.email || "A teammate";

  // Idempotency: claim the send. If the row already exists, we've sent before.
  const { data: claimed, error: claimErr } = await service
    .from("admin_welcome_sends")
    .insert({ email, added_by: addedBy })
    .select("email")
    .maybeSingle();
  if (claimErr) {
    if ((claimErr as any).code === "23505") return json({ ok: true, skipped: "already_sent" });
    return json({ ok: true, skipped: "ledger_error", detail: claimErr.message });
  }
  if (!claimed) return json({ ok: true, skipped: "already_sent" });

  const admin = (Deno.env.get("ADMIN_URL") ?? "https://founderfirst.one/admin").replace(/\/$/, "");
  const firstName = firstNameFrom(email);

  const result = await sendEmail({
    supa: service,
    key: "admin_welcome",
    to: [email],
    trigger: "db_trigger",
    vars: { firstName, addedBy },
    ctaHref: admin,
    buildText: () =>
      `You're an admin now, ${firstName}.\n\n` +
      `${addedBy} added you to the FounderFirst admin. Sign in any time at ` +
      `${admin} — enter this email and we'll send a one-tap magic link, no ` +
      `password to remember.\n\nOpen the admin: ${admin}\n`,
  });

  if (!result.ok && result.sent === 0) {
    // Roll back the claim so a retry can re-send. Send failures must not be sticky.
    await service.from("admin_welcome_sends").delete().eq("email", email);
    return json({ ok: false, error: "send_failed", detail: result.detail }, 502);
  }

  return json({ ok: true, sent: result.sent });
});
