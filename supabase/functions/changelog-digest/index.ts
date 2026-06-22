/**
 * changelog-digest — the weekly "What's new" email, with a review-then-send gate.
 *
 * Three modes (POST body { "mode": ... }):
 *   • "remind"  — gated by the shared secret (x-listening-secret). Called by the
 *                 changelog_trigger_digest() pg_cron job each Monday. Emails all
 *                 admins a short nudge to review and send this week's digest.
 *                 Sends nothing if no entries shipped in the last 7 days.
 *   • "preview" — gated by a signed-in admin's JWT. Returns the exact rendered
 *                 email (subject/html/text) + recipient count. SENDS NOTHING.
 *   • "send"    — gated by a signed-in admin's JWT. Sends the full digest to all
 *                 admins via Resend and logs the send to changelog_sends.
 *
 * So the digest only ever leaves on an admin's explicit click. The cron can only
 * nudge, never send the digest itself.
 *
 * Secrets (all already set): LISTENING_INTAKE_SECRET, RESEND_API_KEY, NOTIFY_FROM,
 * ADMIN_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Auth: verify_jwt = false — both auth paths are checked in code below.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-listening-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Entry = {
  id: string; kind: string; title: string; body: string;
  created_at: string; created_by: string | null;
};

const KIND_LABEL: Record<string, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const KIND_COLOR: Record<string, string> = { new: "#1a7f4b", improved: "#9a6a00", fixed: "#444" };

function renderDigest(entries: Entry[], whatsNewUrl: string) {
  const rows = entries.slice(0, 25).map((e) => {
    const label = KIND_LABEL[e.kind] ?? e.kind;
    const color = KIND_COLOR[e.kind] ?? "#444";
    const title = escapeHtml(e.title || "—");
    const body = e.body ? `<br/><span style="color:#444;">${escapeHtml(e.body)}</span>` : "";
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;vertical-align:top;">
        <span style="display:inline-block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${color};border:1px solid ${color}33;border-radius:999px;padding:2px 8px;margin-right:8px;">${escapeHtml(label)}</span>
        <strong>${title}</strong>${body}
      </td>
    </tr>`;
  }).join("");

  const subject = `What's new at FounderFirst this week`;
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a;background:#f6f6f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e8e5;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5a5a5a;margin-bottom:8px;">FounderFirst · What's new</div>
    <h1 style="font-size:18px;margin:0 0 4px;">Here's what we shipped this week.</h1>
    <p style="margin:0 0 16px;color:#5a5a5a;font-size:13px;">Newest first.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:24px 0 0;">
      <a href="${whatsNewUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;">See it in the admin →</a>
    </p>
    <p style="margin:18px 0 0;color:#9a9a9a;font-size:11px;">You're getting this because you're a FounderFirst admin. It goes out weekly when an admin sends it.</p>
  </div>
</body></html>`;
  const text = `What's new at FounderFirst this week\n\n` +
    `Here's what we shipped this week. Newest first.\n\n` +
    entries.slice(0, 25).map((e) => `• [${KIND_LABEL[e.kind] ?? e.kind}] ${e.title}${e.body ? "\n  " + e.body : ""}`).join("\n") +
    `\n\nSee it in the admin: ${whatsNewUrl}\n`;
  return { subject, html, text };
}

function renderReminder(count: number, whatsNewUrl: string) {
  const subject = `Your weekly What's-new digest is ready to review`;
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a;background:#f6f6f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e8e5;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5a5a5a;margin-bottom:8px;">FounderFirst · What's new</div>
    <h1 style="font-size:18px;margin:0 0 4px;">This week's digest is ready to review.</h1>
    <p style="margin:0 0 16px;color:#5a5a5a;font-size:13px;">There ${count === 1 ? "is" : "are"} <strong>${count}</strong> update${count === 1 ? "" : "s"} from this week. Take a look, then send it to the team when you're happy.</p>
    <p style="margin:20px 0 0;">
      <a href="${whatsNewUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;">Review &amp; send →</a>
    </p>
  </div>
</body></html>`;
  const text = `This week's digest is ready to review.\n\n` +
    `There ${count === 1 ? "is" : "are"} ${count} update(s) from this week. Review and send when you're ready:\n${whatsNewUrl}\n`;
  return { subject, html, text };
}

async function sendResend(to: string[], subject: string, html: string, text: string): Promise<Response | null> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM") ?? "FounderFirst <onboarding@resend.dev>";
  if (!resendKey) return json({ error: "resend_key_missing" }, 500);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return json({ ok: false, error: "send_failed", detail }, 502);
  }
  return null; // success
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const mode: string = body?.mode ?? "remind";
  if (!["remind", "preview", "send"].includes(mode)) {
    return json({ error: "bad_mode" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // ---- Auth -----------------------------------------------------------------
  // "remind" is the cron path (shared secret). "preview"/"send" require a
  // signed-in admin's JWT — the cron secret can never trigger a real digest.
  const expected = Deno.env.get("LISTENING_INTAKE_SECRET");
  const hasSecret = !!expected && req.headers.get("x-listening-secret") === expected;

  let actorEmail: string | null = null;
  if (!hasSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return json({ error: "unauthorized" }, 401);
    const { data: adminRow } = await userClient
      .from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    if (!adminRow) return json({ error: "forbidden" }, 403);
    actorEmail = user.email;
  }

  // Only an admin can preview or send the digest.
  if ((mode === "preview" || mode === "send") && !actorEmail) {
    return json({ error: "forbidden" }, 403);
  }

  // ---- Data -----------------------------------------------------------------
  const { data: digest, error } = await service.rpc("changelog_digest", { p_days: 7 });
  if (error) return json({ error: "digest_failed", detail: error.message }, 500);
  const entries: Entry[] = digest?.entries ?? [];

  const { data: admins, error: aErr } = await service.from("admins").select("email");
  if (aErr) return json({ error: "admin_lookup_failed", detail: aErr.message }, 500);
  const recipients = (admins ?? []).map((r: { email: string }) => r.email).filter(Boolean);

  const adminUrl = Deno.env.get("ADMIN_URL") ?? "https://founderfirst.one/admin";
  const whatsNewUrl = `${adminUrl}/how-it-works#whats-new`;

  // ---- Preview (no send) ----------------------------------------------------
  if (mode === "preview") {
    const { subject, html, text } = renderDigest(entries, whatsNewUrl);
    return json({
      ok: true,
      entryCount: entries.length,
      recipientCount: recipients.length,
      subject, html, text,
    });
  }

  // Nothing shipped this week — never send an empty digest or nudge.
  if (entries.length === 0) return json({ ok: true, sent: 0, reason: "nothing_new" });
  if (!recipients.length)   return json({ ok: true, sent: 0, reason: "no_recipients" });

  // ---- Reminder (cron) ------------------------------------------------------
  if (mode === "remind") {
    const { subject, html, text } = renderReminder(entries.length, whatsNewUrl);
    const fail = await sendResend(recipients, subject, html, text);
    if (fail) return fail;
    return json({ ok: true, sent: recipients.length, mode: "remind" });
  }

  // ---- Send (admin-approved) ------------------------------------------------
  const { subject, html, text } = renderDigest(entries, whatsNewUrl);
  const fail = await sendResend(recipients, subject, html, text);
  if (fail) return fail;
  await service.from("changelog_sends").insert({
    sent_by: actorEmail,
    entry_count: entries.length,
    recipients: recipients.length,
  });
  return json({ ok: true, sent: recipients.length, mode: "send", entryCount: entries.length });
});
