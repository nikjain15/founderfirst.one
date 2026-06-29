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

export type Entry = {
  id: string; kind: string; area: string; title: string; body: string;
  created_at: string; created_by: string | null;
};

// Bullet-marker color by kind — the ✓ carries New/Improved/Fixed without a pill.
const KIND_COLOR_KEY: Record<string, "income" | "amber" | "ink3"> = { new: "income", improved: "amber", fixed: "ink3" };

const word = (n: number, base: string) => `${base}${n === 1 ? "" : "s"}`;

// -----------------------------------------------------------------------------
// AREA registry — the section spine of the digest. Each shipped entry carries an
// `area`; entries are grouped under these sections in this order. Covers are
// STABLE per-area images (curated once, refreshed when a surface changes) hosted
// at SITE_URL/email/whatsnew/<img>. Empty areas are skipped; unknown areas fall
// into "general". Keep keys in sync with the admin composer (WhatsNew.tsx).
// -----------------------------------------------------------------------------
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://founderfirst.one").replace(/\/+$/, "");
const IMG_BASE = `${SITE_URL}/email/whatsnew`;

type AreaMeta = {
  key: string; label: string; title: string;
  accent: "income" | "amber" | "ink3"; img: string | null; alt: string;
};
const AREAS: AreaMeta[] = [
  { key: "site",    label: "The site",       title: "A new front door",            accent: "income", img: "site.png",    alt: "The new FounderFirst homepage" },
  { key: "product", label: "The product",    title: "Penny grew up",               accent: "income", img: "product.png", alt: "The Penny app — owner and CPA views" },
  { key: "penny",   label: "Smarter Penny",  title: "She checks her own work",     accent: "income", img: "penny.png",   alt: "Penny's quality dashboard and human review queue" },
  { key: "reach",   label: "Reach + care",   title: "Finding people, keeping trust", accent: "amber", img: "reach.png",  alt: "The Signals lead feed in the admin" },
  { key: "infra",   label: "Under the hood", title: "Quietly stronger",            accent: "ink3",   img: "infra.png",   alt: "The search and AI-answer visibility dashboard" },
  { key: "general", label: "More",           title: "Also this week",              accent: "ink3",   img: null,          alt: "" },
];
const AREA_KEYS = new Set(AREAS.map((a) => a.key));
const normArea = (a: string | null | undefined) => (a ?? "general").trim().toLowerCase();

/** Group entries by area key (registry order is applied later by the caller). */
function groupByArea(entries: Entry[]): Map<string, Entry[]> {
  const grouped = new Map<string, Entry[]>();
  for (const e of entries.slice(0, 40)) {
    const key = AREA_KEYS.has(normArea(e.area)) ? normArea(e.area) : "general";
    const list = grouped.get(key) ?? [];
    list.push(e);
    grouped.set(key, list);
  }
  return grouped;
}

/** Three at-a-glance stats. Solid paper cells (Outlook-safe), colored numbers. */
function statStrip(entries: Entry[], areaCount: number, brand: typeof BRAND): string {
  const fresh = entries.filter((e) => e.kind === "new").length;
  const cell = (n: number, label: string, key: "income" | "amber" | "ink3") =>
    `<td width="33%" align="center" bgcolor="${brand.paper}" style="border-radius:10px;padding:14px 8px;text-align:center;">
       <div style="font-size:22px;font-weight:700;color:${brand[key]};font-family:${brand.font};line-height:1.1;">${n}</div>
       <div style="font-size:11px;color:${brand[key]};font-family:${brand.font};">${label}</div></td>`;
  return `<tr><td style="padding:2px 0 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px 0;">
      <tr>${cell(entries.length, "shipped", "income")}${cell(areaCount, areaCount === 1 ? "area" : "areas", "amber")}${cell(fresh, "brand-new", "ink3")}</tr>
    </table></td></tr>`;
}

/** One themed section: pill label + title + (optional) cover image + ✓ bullets. */
function sectionRow(area: AreaMeta, items: Entry[], brand: typeof BRAND): string {
  const accent = brand[area.accent];
  const pill = `<span style="display:inline-block;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:${accent};border:1px solid ${accent}33;border-radius:999px;padding:3px 10px;font-family:${brand.font};">${escapeHtml(area.label)}</span>`;
  const title = `<div style="margin:12px 0 0;font-size:18px;font-weight:700;color:${brand.ink};letter-spacing:-0.01em;font-family:${brand.font};">${escapeHtml(area.title)}</div>`;
  const cover = area.img
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 6px;"><tr>
         <td bgcolor="${brand.paper}" style="border-radius:10px;border:1px solid ${brand.line};">
           <img src="${IMG_BASE}/${area.img}" width="100%" alt="${escapeHtml(area.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:10px;border:0;outline:none;text-decoration:none;" />
         </td></tr></table>`
    : "";
  const rows = items.map((e) => {
    const marker = brand[KIND_COLOR_KEY[e.kind] ?? "ink3"];
    const body = e.body ? `<br/><span style="color:${brand.ink2};">${escapeHtml(e.body)}</span>` : "";
    return `<tr>
      <td valign="top" style="padding:6px 0;width:20px;color:${marker};font-size:14px;font-weight:700;font-family:${brand.font};">&#10003;</td>
      <td style="padding:6px 0;font-size:14px;line-height:1.5;color:${brand.ink2};font-family:${brand.font};"><strong style="color:${brand.ink};">${escapeHtml(e.title || "—")}</strong>${body}</td>
    </tr>`;
  }).join("");
  return `<tr><td style="padding:26px 0 0;border-top:1px solid ${brand.line};">
    ${pill}${title}${cover}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
  </td></tr>`;
}

/** Dynamic body for the digest — built with the resolved brand so colors track email_brand. */
export function digestBody(entries: Entry[]) {
  return (brand: typeof BRAND) => {
    const grouped = groupByArea(entries);
    const live = AREAS.filter((a) => (grouped.get(a.key)?.length ?? 0) > 0);
    const sections = live.map((a) => sectionRow(a, grouped.get(a.key)!, brand)).join("");
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${statStrip(entries, live.length, brand)}
      ${sections}
    </table>`;
  };
}

export function digestVars(entries: Entry[]) {
  const n = entries.length;
  // topShipped goes into the (hidden) preheader, which emailShell escapes — pass raw.
  return { n, thingword: word(n, "thing"), topShipped: entries[0]?.title ?? "" };
}

export const digestText = (entries: Entry[], whatsNewUrl: string) => () => {
  const grouped = groupByArea(entries);
  let out = `${entries.length} ${word(entries.length, "thing")} shipped this week.\n\n`;
  for (const a of AREAS) {
    const items = grouped.get(a.key);
    if (!items?.length) continue;
    out += `${a.label.toUpperCase()} — ${a.title}\n`;
    for (const e of items) out += `  • ${e.title}${e.body ? " — " + e.body : ""}\n`;
    out += `\n`;
  }
  return out + `See it all in the admin: ${whatsNewUrl}\n`;
};

const nudgeText = (count: number, whatsNewUrl: string) => () =>
  `This week's digest is ready to review.\n\n` +
  `There ${count === 1 ? "is" : "are"} ${count} update(s) from this week. Review and send when you're ready:\n${whatsNewUrl}\n`;

const handler = async (req: Request): Promise<Response> => {
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
  const allAdmins = (admins ?? []).map((r: { email: string }) => r.email).filter(Boolean);

  // Optional admin-supplied recipient list (one or more emails, comma/whitespace
  // separated). When provided, the digest goes only to these addresses instead
  // of the full admin list — lets an admin forward it to specific people.
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const overrideTo = [...new Set(
    String(body?.to ?? "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean),
  )];
  const badTo = overrideTo.filter((e) => !EMAIL_RE.test(e));
  if (badTo.length) return json({ error: "bad_recipient", detail: badTo.join(", ") }, 400);
  const recipients = overrideTo.length ? overrideTo : allAdmins;

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
  // Respect the Scheduled-tab toggle: a disabled digest can't be sent.
  const { data: digestSched } = await service
    .from("email_schedules").select("enabled").eq("email_key", "changelog_digest").eq("is_builtin", true).maybeSingle();
  if (digestSched && digestSched.enabled === false) {
    return json({ ok: false, sent: 0, error: "disabled", reason: "digest_disabled" }, 409);
  }

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
};

// Start the server only when run as the entrypoint — importing this module (e.g.
// the local email-preview renderer) gets the exported builders without serving.
if (import.meta.main) Deno.serve(handler);
