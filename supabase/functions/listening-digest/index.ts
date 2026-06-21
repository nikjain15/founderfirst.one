/**
 * listening-digest — once-a-day Signals summary email to all admins.
 *
 * Invoked by the sig_trigger_digest() pg_cron job (see
 * 20260621200000_signals_digest.sql), which POSTs here with the shared secret.
 * Reads sig_digest() with the service role, formats new high-intent leads +
 * competitor mentions, and sends one Resend email to every admin. If there's
 * nothing new, it sends nothing.
 *
 * Secrets required (set via `supabase secrets set`):
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

type Lead = {
  id: string; stage: string; platform: string; author: string | null;
  url: string | null; title: string | null; intent: number | null; competitor: string | null;
};

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

  const { data: digest, error } = await supa.rpc("sig_digest", { p_hours: 24 });
  if (error) return json({ error: "digest_failed", detail: error.message }, 500);

  const leads: Lead[] = digest?.leads ?? [];
  const competitors: Array<{ name: string; count: number }> = digest?.competitors ?? [];

  // Nothing new — don't send an empty email.
  if (leads.length === 0 && competitors.length === 0) {
    return json({ ok: true, sent: 0, reason: "nothing_new" });
  }

  const { data: admins, error: aErr } = await supa.from("admins").select("email");
  if (aErr) return json({ error: "admin_lookup_failed", detail: aErr.message }, 500);
  const recipients = (admins ?? []).map((r: { email: string }) => r.email).filter(Boolean);
  if (!recipients.length) return json({ ok: true, sent: 0, reason: "no_recipients" });

  const adminUrl = Deno.env.get("ADMIN_URL") ?? "https://founderfirst.one/admin";
  const leadsUrl = `${adminUrl}/signals#leads`;

  const leadRows = leads.slice(0, 15).map((l) => {
    const who = escapeHtml(l.author || "unknown");
    const what = escapeHtml(l.title || "—");
    const link = l.url ? ` · <a href="${escapeHtml(l.url)}">source ↗</a>` : "";
    const tag = l.competitor ? ` · ${escapeHtml(l.competitor)}` : "";
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;">
        <strong>${who}</strong> <span style="color:#888;">(${escapeHtml(l.platform)}${tag})</span><br/>
        <span style="color:#444;">${what}</span>${link}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-size:14px;white-space:nowrap;">
        intent <strong>${l.intent ?? "—"}</strong>
      </td>
    </tr>`;
  }).join("");

  const compLine = competitors.length
    ? `<p style="margin:16px 0 0;color:#444;font-size:13px;">Competitor mentions (24h): ${
        competitors.map((c) => `<strong>${escapeHtml(c.name)}</strong> ${c.count}`).join(" · ")
      }</p>`
    : "";

  const subject = `Signals — ${leads.length} new lead${leads.length === 1 ? "" : "s"} today`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a;background:#f6f6f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e8e5;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5a5a5a;margin-bottom:8px;">FounderFirst · Signals</div>
    <h1 style="font-size:18px;margin:0 0 4px;">${leads.length} new lead${leads.length === 1 ? "" : "s"} in the last 24h.</h1>
    <p style="margin:0 0 16px;color:#5a5a5a;font-size:13px;">Highest-intent first. Review, approve a draft, and reach out.</p>
    <table style="width:100%;border-collapse:collapse;">${leadRows}</table>
    ${compLine}
    <p style="margin:24px 0 0;">
      <a href="${leadsUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;">Open Signals →</a>
    </p>
  </div>
</body></html>`;

  const text = `Signals — ${leads.length} new lead(s) in the last 24h.\n\n` +
    leads.slice(0, 15).map((l) => `• ${l.author || "unknown"} (${l.platform}${l.competitor ? ", " + l.competitor : ""}) — intent ${l.intent ?? "—"}\n  ${l.title || ""}${l.url ? "\n  " + l.url : ""}`).join("\n") +
    (competitors.length ? `\n\nCompetitor mentions: ${competitors.map((c) => `${c.name} ${c.count}`).join(", ")}` : "") +
    `\n\nOpen Signals: ${leadsUrl}\n`;

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

  return json({ ok: true, sent: recipients.length, leads: leads.length });
});
