/**
 * notify-content-change — fires when an admin publishes a new Voice or
 * Prompt version. Looks up every admin (excluding the author) and sends a
 * short email via Resend so the team knows Penny's brain just changed.
 *
 * Called by the after_publish_* database triggers (see
 * SCHEMA-014-publish-notify.sql) using Supabase's pg_net extension. The
 * trigger POSTs the row that just went live; this function does the rest.
 *
 * Secrets required (set via `supabase secrets set`):
 *   RESEND_API_KEY     — Resend API key (kept encrypted; never in repo)
 *   NOTIFY_FROM        — verified sender, e.g. "Penny <penny@founderfirst.one>"
 *   ADMIN_URL          — base admin URL, e.g. "https://founderfirst.one/admin"
 *   SUPABASE_URL       — auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY — auto-provided; used to read admins table
 *
 * Auth:
 *   verify_jwt = false (see ../../config.toml). The trigger calls us with a
 *   shared-secret header (NOTIFY_WEBHOOK_SECRET) instead, so an arbitrary
 *   internet caller can't trigger blast emails.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BRAND, escapeHtml } from "../_shared/email.ts";
import { sendEmail } from "../_shared/send.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notify-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type Payload = {
  kind: "voice" | "prompt";
  version: number;
  author_email: string | null;   // who published (will be excluded from blast)
  notes: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  // Shared-secret auth — the DB trigger sets this header; nothing else can.
  const expected = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
  if (!expected || req.headers.get("x-notify-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Payload;
  try { body = await req.json(); }
  catch { return json({ error: "bad_json" }, 400); }

  if (!body.kind || !body.version) return json({ error: "missing_fields" }, 400);

  // Read the admin allow-list with the service role so RLS doesn't block us.
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Respect the Scheduled-tab toggle: if penny_brain is disabled, send nothing.
  const { data: sched } = await supa
    .from("email_schedules").select("enabled").eq("email_key", "penny_brain").eq("is_builtin", true).maybeSingle();
  if (sched && sched.enabled === false) return json({ ok: true, sent: 0, reason: "disabled" });

  const { data: admins, error } = await supa.from("admins").select("email");
  if (error) return json({ error: "admin_lookup_failed", detail: error.message }, 500);

  const authorLower = body.author_email?.toLowerCase() ?? null;
  const recipients = (admins ?? [])
    .map((r: { email: string }) => r.email)
    .filter((e: string) => e && (!authorLower || e.toLowerCase() !== authorLower));

  if (!recipients.length) return json({ ok: true, sent: 0, reason: "no_recipients" });

  const kindLabel = body.kind === "voice" ? "Voice guide" : "System prompt";
  const adminUrl  = Deno.env.get("ADMIN_URL") ?? "https://founderfirst.one/admin";
  const hash      = body.kind === "voice" ? "voice" : "prompt";
  const reviewUrl = `${adminUrl}/content/#${hash}`;
  const author    = body.author_email ?? "Someone";

  // Dynamic body — the published-change paragraph + optional note, brand-aware.
  const buildBody = (brand: typeof BRAND) => {
    const noteHtml = body.notes
      ? `<p style="margin:16px 0 0;color:${brand.ink3};font-size:14px;line-height:1.55;font-style:italic;">"${escapeHtml(body.notes!)}"</p>`
      : "";
    return `<p style="margin:0;color:${brand.ink2};font-size:16px;line-height:1.55;font-family:${brand.font};">` +
      `<strong style="color:${brand.ink};">${escapeHtml(author)}</strong> published a new ${kindLabel.toLowerCase()}. ` +
      `It's already active everywhere Penny shows up — the site bubble, the support bot, and in-product Penny.</p>${noteHtml}`;
  };

  const buildText = () => `${kindLabel} v${body.version} is live on Penny's brain.\n\n${author} just published it. It's now active on every Penny surface.\n${body.notes ? `\n"${body.notes}"\n` : ""}\nReview: ${reviewUrl}\n`;

  const result = await sendEmail({
    supa, key: "penny_brain", to: recipients, trigger: "db_trigger",
    vars: { kindLabel, version: body.version, author },
    ctaHref: reviewUrl, buildBody, buildText,
  });
  if (!result.ok && result.sent === 0) {
    return json({ ok: false, sent: result.sent, error: "send_failed", detail: result.detail }, 502);
  }
  return json({ ok: true, sent: result.sent });
});
