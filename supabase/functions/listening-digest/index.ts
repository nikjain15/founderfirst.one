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
import { BRAND, escapeHtml } from "../_shared/email.ts";
import { sendEmail } from "../_shared/send.ts";

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

  // ---- Smarter cadence ------------------------------------------------------
  // The cron fires daily, but we only send when it's worth an inbox. Anchor the
  // lookback to the last actual send so sub-threshold leads accumulate instead of
  // dropping out of a fixed 24h window. Send when a lead clears the intent bar,
  // OR on a weekly floor (≥7 days quiet) so nothing rots.
  // Cadence knobs are admin-editable (email_settings); fall back to env/defaults.
  const { data: settings } = await supa.from("email_settings").select("*").eq("id", true).maybeSingle();
  const INTENT_MIN  = Number(settings?.signals_intent_min ?? Deno.env.get("SIGNALS_DIGEST_INTENT_MIN") ?? 70);
  const FLOOR_HOURS = Number(settings?.signals_floor_days ?? 7) * 24;

  const { data: windowHours } = await supa.rpc("sig_digest_window_hours", { p_cap: FLOOR_HOURS });
  const hours = Number(windowHours ?? 24);

  const { data: digest, error } = await supa.rpc("sig_digest", { p_hours: hours });
  if (error) return json({ error: "digest_failed", detail: error.message }, 500);

  const leads: Lead[] = digest?.leads ?? [];
  const competitors: Array<{ name: string; count: number }> = digest?.competitors ?? [];

  // Nothing accumulated — don't send an empty email.
  if (leads.length === 0 && competitors.length === 0) {
    return json({ ok: true, sent: 0, reason: "nothing_new" });
  }

  // Decide whether today earns a send. A hot lead always does; otherwise we only
  // send once the weekly floor is reached, letting quiet days stay silent.
  const topIntentVal = leads[0]?.intent ?? 0;
  const hasHotLead   = topIntentVal >= INTENT_MIN;
  const hitFloor     = hours >= FLOOR_HOURS;
  if (!hasHotLead && !hitFloor) {
    return json({ ok: true, sent: 0, reason: "below_intent_threshold", topIntent: topIntentVal, windowHours: hours });
  }
  const sendReason = hasHotLead ? "hot_lead" : "weekly_floor";

  const { data: admins, error: aErr } = await supa.from("admins").select("email");
  if (aErr) return json({ error: "admin_lookup_failed", detail: aErr.message }, 500);
  const recipients = (admins ?? []).map((r: { email: string }) => r.email).filter(Boolean);
  if (!recipients.length) return json({ ok: true, sent: 0, reason: "no_recipients" });

  const adminUrl = Deno.env.get("ADMIN_URL") ?? "https://founderfirst.one/admin";
  // Signals is a sub-tab under Audience; deep-link via the hash. The old
  // /signals#leads path redirects but loses the fragment, so link directly.
  const leadsUrl = `${adminUrl}/audience#signals`;

  const n = leads.length;
  const plural = n === 1 ? "" : "s";
  const topIntent = topIntentVal || "—"; // we only reach here on a hot lead or floor

  // The daily sourcing optimizer saves its run as a "Brain" report. Fold its
  // headline learnings into the digest so admins see market pain + tuning
  // suggestions without opening the Scoring tab. Additive — never blocks a send.
  // deno-lint-ignore no-explicit-any
  const { data: optRow } = await supa.from("sig_settings").select("value").eq("key", "optimizer_last_run").maybeSingle();
  // deno-lint-ignore no-explicit-any
  const opt: any = optRow?.value ?? null;
  const optThemes = (opt?.pain_themes ?? []).slice(0, 5) as Array<{ tag: string; count: number }>;
  const optSuggest = (opt?.threshold_suggestions ?? []) as string[];
  const optProposed = (opt?.proposed ?? []) as Array<{ query: string }>;
  const hasOpt = !!opt && (optThemes.length > 0 || optSuggest.length > 0 || optProposed.length > 0);

  // Dynamic body block — built with the resolved brand so colors track email_brand.
  const buildBody = (brand: typeof BRAND) => {
    const leadRows = leads.slice(0, 15).map((l) => {
      const who = escapeHtml(l.author || "unknown");
      const what = escapeHtml(l.title || "—");
      const link = l.url ? ` · <a href="${escapeHtml(l.url)}" style="color:${brand.ink};text-decoration:underline;">source ↗</a>` : "";
      const tag = l.competitor ? ` · ${escapeHtml(l.competitor)}` : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${brand.line};font-size:14px;color:${brand.ink2};">
          <strong style="color:${brand.ink};">${who}</strong> <span style="color:${brand.ink4};">(${escapeHtml(l.platform)}${tag})</span><br/>
          <span style="color:${brand.ink2};">${what}</span>${link}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${brand.line};text-align:right;font-size:14px;white-space:nowrap;color:${brand.ink3};">
          intent <strong style="color:${brand.ink};">${l.intent ?? "—"}</strong>
        </td>
      </tr>`;
    }).join("");
    const compLine = competitors.length
      ? `<p style="margin:16px 0 0;color:${brand.ink3};font-size:13px;">Competitor mentions: ${
          competitors.map((c) => `<strong style="color:${brand.ink};">${escapeHtml(c.name)}</strong> ${c.count}`).join(" · ")
        }</p>`
      : "";

    // Optimizer "Brain" section — pain themes, proposals to review, tuning tips.
    const optBlock = !hasOpt ? "" : `
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid ${brand.line};">
        <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:${brand.ink4};">Sourcing optimizer · last run</p>
        ${optThemes.length ? `<p style="margin:0 0 8px;font-size:14px;color:${brand.ink2};">Top pain this week: ${optThemes.map((t) => `<strong style="color:${brand.ink};">${escapeHtml(t.tag)}</strong> ${t.count}`).join(" · ")}</p>` : ""}
        ${optProposed.length ? `<p style="margin:0 0 8px;font-size:14px;color:${brand.ink2};">${optProposed.length} new quer${optProposed.length === 1 ? "y" : "ies"} proposed — review &amp; enable in the Sources tab.</p>` : ""}
        ${optSuggest.length ? `<ul style="margin:8px 0 0;padding-left:18px;color:${brand.ink3};font-size:13px;">${optSuggest.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}
      </div>`;

    return `<table style="width:100%;border-collapse:collapse;">${leadRows}</table>${compLine}${optBlock}`;
  };

  const buildText = () => `${n} new lead${plural}, highest-intent first.\n\n` +
    leads.slice(0, 15).map((l) => `• ${l.author || "unknown"} (${l.platform}${l.competitor ? ", " + l.competitor : ""}) — intent ${l.intent ?? "—"}\n  ${l.title || ""}${l.url ? "\n  " + l.url : ""}`).join("\n") +
    (competitors.length ? `\n\nCompetitor mentions: ${competitors.map((c) => `${c.name} ${c.count}`).join(", ")}` : "") +
    (hasOpt
      ? `\n\nSourcing optimizer (last run):` +
        (optThemes.length ? `\n  Top pain: ${optThemes.map((t) => `${t.tag} ${t.count}`).join(", ")}` : "") +
        (optProposed.length ? `\n  ${optProposed.length} new quer${optProposed.length === 1 ? "y" : "ies"} proposed — review in Sources.` : "") +
        (optSuggest.length ? `\n  ${optSuggest.join("\n  ")}` : "")
      : "") +
    `\n\nOpen Signals: ${leadsUrl}\n`;

  const result = await sendEmail({
    supa, key: "signals_digest", to: recipients, trigger: "cron",
    vars: { n, leadword: `lead${plural}`, topIntent },
    ctaHref: leadsUrl, buildBody, buildText,
  });
  if (!result.ok && result.sent === 0) {
    return json({ ok: false, error: "send_failed", detail: result.detail }, 502);
  }

  // Record the send so the next run's lookback window resets to here.
  await supa.from("sig_digest_sends").insert({ lead_count: n, reason: sendReason });

  return json({ ok: true, sent: result.sent, leads: n, reason: sendReason, windowHours: hours });
});
