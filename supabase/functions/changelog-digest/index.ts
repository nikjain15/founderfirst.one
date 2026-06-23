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
import { BRAND, escapeHtml } from "../_shared/email.ts";
import { renderEmail, sendEmail } from "../_shared/send.ts";

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

type Entry = {
  id: string; kind: string; title: string; body: string;
  created_at: string; created_by: string | null;
};

const KIND_LABEL: Record<string, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const KIND_COLOR_KEY: Record<string, "income" | "amber" | "ink3"> = { new: "income", improved: "amber", fixed: "ink3" };

const word = (n: number, base: string) => `${base}${n === 1 ? "" : "s"}`;

/** Dynamic body for the digest — built with the resolved brand so colors track email_brand. */
function digestBody(entries: Entry[]) {
  return (brand: typeof BRAND) => entries.slice(0, 25).map((e) => {
    const label = KIND_LABEL[e.kind] ?? e.kind;
    const color = brand[KIND_COLOR_KEY[e.kind] ?? "ink3"];
    const title = escapeHtml(e.title || "—");
    const body = e.body ? `<br/><span style="color:${brand.ink2};">${escapeHtml(e.body)}</span>` : "";
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${brand.line};font-size:14px;color:${brand.ink2};vertical-align:top;">
        <span style="display:inline-block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${color};border:1px solid ${color}33;border-radius:999px;padding:2px 8px;margin-right:8px;">${escapeHtml(label)}</span>
        <strong style="color:${brand.ink};">${title}</strong>${body}
      </td>
    </tr>`;
  }).join("");
}

function digestVars(entries: Entry[]) {
  const n = entries.length;
  // topShipped goes into the (hidden) preheader, which emailShell escapes — pass raw.
  return { n, thingword: word(n, "thing"), topShipped: entries[0]?.title ?? "" };
}

const digestText = (entries: Entry[], whatsNewUrl: string) => () =>
  `${entries.length} ${word(entries.length, "thing")} shipped this week.\n\n` +
  `New, Improved, and Fixed — newest first.\n\n` +
  entries.slice(0, 25).map((e) => `• [${KIND_LABEL[e.kind] ?? e.kind}] ${e.title}${e.body ? "\n  " + e.body : ""}`).join("\n") +
  `\n\nSee it in the admin: ${whatsNewUrl}\n`;

const nudgeText = (count: number, whatsNewUrl: string) => () =>
  `This week's digest is ready to review.\n\n` +
  `There ${count === 1 ? "is" : "are"} ${count} update(s) from this week. Review and send when you're ready:\n${whatsNewUrl}\n`;

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
    const { subject, html, text } = await renderEmail({
      supa: service, key: "changelog_digest", vars: digestVars(entries),
      ctaHref: whatsNewUrl, buildBody: digestBody(entries), buildText: digestText(entries, whatsNewUrl),
    });
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
    const count = entries.length;
    const result = await sendEmail({
      supa: service, key: "changelog_nudge", to: recipients, trigger: "cron",
      vars: { count, updateword: word(count, "update"), thingword: word(count, "thing") },
      ctaHref: whatsNewUrl, buildText: nudgeText(count, whatsNewUrl),
    });
    if (!result.ok && result.sent === 0) return json({ ok: false, error: "send_failed", detail: result.detail }, 502);
    return json({ ok: true, sent: result.sent, mode: "remind" });
  }

  // ---- Send (admin-approved) ------------------------------------------------
  const result = await sendEmail({
    supa: service, key: "changelog_digest", to: recipients, trigger: "admin",
    vars: digestVars(entries), ctaHref: whatsNewUrl,
    buildBody: digestBody(entries), buildText: digestText(entries, whatsNewUrl),
  });
  if (!result.ok && result.sent === 0) return json({ ok: false, error: "send_failed", detail: result.detail }, 502);
  await service.from("changelog_sends").insert({
    sent_by: actorEmail,
    entry_count: entries.length,
    recipients: recipients.length,
  });
  return json({ ok: true, sent: result.sent, mode: "send", entryCount: entries.length });
});
