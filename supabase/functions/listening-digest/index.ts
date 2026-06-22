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
import { BRAND, emailShell, escapeHtml } from "../_shared/email.ts";

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
  // Signals is a sub-tab under Audience; deep-link via the hash. The old
  // /signals#leads path redirects but loses the fragment, so link directly.
  const leadsUrl = `${adminUrl}/audience#signals`;

  const leadRows = leads.slice(0, 15).map((l) => {
    const who = escapeHtml(l.author || "unknown");
    const what = escapeHtml(l.title || "—");
    const link = l.url ? ` · <a href="${escapeHtml(l.url)}" style="color:${BRAND.ink};text-decoration:underline;">source ↗</a>` : "";
    const tag = l.competitor ? ` · ${escapeHtml(l.competitor)}` : "";
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;color:${BRAND.ink2};">
        <strong style="color:${BRAND.ink};">${who}</strong> <span style="color:${BRAND.ink4};">(${escapeHtml(l.platform)}${tag})</span><br/>
        <span style="color:${BRAND.ink2};">${what}</span>${link}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};text-align:right;font-size:14px;white-space:nowrap;color:${BRAND.ink3};">
        intent <strong style="color:${BRAND.ink};">${l.intent ?? "—"}</strong>
      </td>
    </tr>`;
  }).join("");

  const compLine = competitors.length
    ? `<p style="margin:16px 0 0;color:${BRAND.ink3};font-size:13px;">Competitor mentions (24h): ${
        competitors.map((c) => `<strong style="color:${BRAND.ink};">${escapeHtml(c.name)}</strong> ${c.count}`).join(" · ")
      }</p>`
    : "";

  const subject = `Signals — ${leads.length} new lead${leads.length === 1 ? "" : "s"} today`;

  const html = emailShell({
    eyebrow: "FounderFirst · Signals",
    title: `${leads.length} new lead${leads.length === 1 ? "" : "s"} in the last 24h.`,
    intro: "Highest-intent first. Review, approve a draft, and reach out.",
    body: `<table style="width:100%;border-collapse:collapse;">${leadRows}</table>${compLine}`,
    cta: { label: "Open Signals →", href: leadsUrl },
  });

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
