/**
 * changelog-digest — once-a-week "What's new" summary email to all admins.
 *
 * Invoked by the changelog_trigger_digest() pg_cron job (see
 * 20260623120000_changelog.sql), which POSTs here with the shared secret.
 * Reads changelog_digest() with the service role, formats the entries shipped
 * in the last 7 days, and sends one Resend email to every admin with a link
 * back to the What's-new section. If nothing shipped, it sends nothing.
 *
 * Secrets required (all already set if listening-digest works):
 *   LISTENING_INTAKE_SECRET   — shared secret; cron sends it as x-listening-secret
 *   RESEND_API_KEY            — Resend API key
 *   NOTIFY_FROM               — verified sender (reused from notify-content-change)
 *   ADMIN_URL                 — base admin URL, e.g. "https://founderfirst.one/admin"
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided
 *
 * Auth: verify_jwt = false; the shared secret gates it.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("LISTENING_INTAKE_SECRET");
  if (!expected || req.headers.get("x-listening-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: digest, error } = await supa.rpc("changelog_digest", { p_days: 7 });
  if (error) return json({ error: "digest_failed", detail: error.message }, 500);

  const entries: Entry[] = digest?.entries ?? [];

  // Nothing shipped this week — don't send an empty email.
  if (entries.length === 0) {
    return json({ ok: true, sent: 0, reason: "nothing_new" });
  }

  const { data: admins, error: aErr } = await supa.from("admins").select("email");
  if (aErr) return json({ error: "admin_lookup_failed", detail: aErr.message }, 500);
  const recipients = (admins ?? []).map((r: { email: string }) => r.email).filter(Boolean);
  if (!recipients.length) return json({ ok: true, sent: 0, reason: "no_recipients" });

  const adminUrl = Deno.env.get("ADMIN_URL") ?? "https://founderfirst.one/admin";
  const whatsNewUrl = `${adminUrl}/how-it-works#whats-new`;

  const entryRows = entries.slice(0, 25).map((e) => {
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
    <table style="width:100%;border-collapse:collapse;">${entryRows}</table>
    <p style="margin:24px 0 0;">
      <a href="${whatsNewUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;">See it in the admin →</a>
    </p>
    <p style="margin:18px 0 0;color:#9a9a9a;font-size:11px;">You're getting this because you're a FounderFirst admin. It goes out once a week whenever something's changed.</p>
  </div>
</body></html>`;

  const text = `What's new at FounderFirst this week\n\n` +
    `Here's what we shipped this week. Newest first.\n\n` +
    entries.slice(0, 25).map((e) => `• [${KIND_LABEL[e.kind] ?? e.kind}] ${e.title}${e.body ? "\n  " + e.body : ""}`).join("\n") +
    `\n\nSee it in the admin: ${whatsNewUrl}\n`;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM") ?? "FounderFirst <onboarding@resend.dev>";
  if (!resendKey) return json({ error: "resend_key_missing" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, html, text }),
  });
  const respBody = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, error: "send_failed", detail: respBody }, 502);

  return json({ ok: true, sent: recipients.length, entries: entries.length });
});
