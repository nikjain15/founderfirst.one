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

/**
 * grid2 — lay boxed cards two-up, but flush to the OUTER margins: the left card's
 * left edge and the right card's right edge line up exactly with the section
 * headers (no floating indent). Gaps live only between the two columns and rows.
 * Single trailing card spans full width. `boxes` are the inner card <table>s.
 */
function grid2(boxes: string[]): string {
  let out = "";
  for (let i = 0; i < boxes.length; i += 2) {
    const L = boxes[i], R = boxes[i + 1];
    if (R) {
      out += `<tr><td width="50%" valign="top" style="padding:0 7px 12px 0;">${L}</td><td width="50%" valign="top" style="padding:0 0 12px 7px;">${R}</td></tr>`;
    } else {
      out += `<tr><td colspan="2" valign="top" style="padding:0 0 12px 0;">${L}</td></tr>`;
    }
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">${out}</table>`;
}

/** One themed section: pill label + title + cover image + two-up boxed entry cards. */
function sectionRow(area: AreaMeta, items: Entry[], brand: typeof BRAND): string {
  const accent = brand[area.accent];
  // Plain eyebrow label (not a pill) so it starts on the same left edge as the
  // title below it — pill chips inset their text and broke the alignment.
  const pill = `<div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:${accent};font-family:${brand.font};">${escapeHtml(area.label)}</div>`;
  const title = `<div style="margin:8px 0 0;font-size:18px;font-weight:700;color:${brand.ink};letter-spacing:-0.01em;font-family:${brand.font};">${escapeHtml(area.title)}</div>`;
  const cover = area.img
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 6px;"><tr>
         <td bgcolor="${brand.paper}" style="border-radius:10px;border:1px solid ${brand.line};">
           <img src="${IMG_BASE}/${area.img}" width="100%" alt="${escapeHtml(area.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:10px;border:0;outline:none;text-decoration:none;" />
         </td></tr></table>`
    : "";
  const kindLabel: Record<string, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
  const boxes = items.map((e) => {
    const marker = brand[KIND_COLOR_KEY[e.kind] ?? "ink3"];
    const label = kindLabel[e.kind] ?? "New";
    const body = e.body
      ? `<div style="font-size:13px;line-height:1.5;color:${brand.ink2};font-family:${brand.font};margin-top:6px;">${escapeHtml(e.body)}</div>`
      : "";
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.white};border:1px solid ${brand.line};border-radius:14px;">
      <tr><td style="padding:15px 16px 16px;">
        <div style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${marker};font-family:${brand.font};">${label}</div>
        <div style="font-size:15px;font-weight:700;color:${brand.ink};font-family:${brand.font};margin-top:6px;letter-spacing:-0.01em;">${escapeHtml(e.title || "—")}</div>
        ${body}
      </td></tr></table>`;
  });
  return `<tr><td style="padding:26px 0 0;border-top:1px solid ${brand.line};">
    ${pill}${title}${cover}
    ${grid2(boxes)}
  </td></tr>`;
}

// -----------------------------------------------------------------------------
// PROVIDERS — the evergreen "where the money comes in" strip. Each digest names
// the payout sources Penny reconciles and how each connects. Data-driven so the
// list stays honest as connectors ship; edit here when a provider's status
// changes. `method` maps to a colored chip; `href` deep-links the provider.
// -----------------------------------------------------------------------------
type ProviderMethod = "auto" | "sync" | "file";
type Provider = { wm: string; color: string; method: ProviderMethod; example: string; href: string };
const PROVIDERS: Provider[] = [
  { wm: "stripe",   color: "#635BFF", method: "auto", example: "$4,820 payout → $5,000 sales − $180 fees", href: "https://dashboard.stripe.com/payouts" },
  { wm: "shopify",  color: "#5E8E3E", method: "auto", example: "$2,140 payout → sales, fees &amp; refunds split", href: "https://admin.shopify.com" },
  { wm: "PayPal",   color: "#003087", method: "sync", example: "$980 payout → net deposit reconciled", href: "https://www.paypal.com" },
  { wm: "Square",   color: "#0a0a0a", method: "sync", example: "$1,505 payout → card fees separated", href: "https://squareup.com/dashboard" },
  { wm: "amazon",   color: "#e07b00", method: "file", example: "Settlement report → itemized to the ledger", href: "https://sellercentral.amazon.com" },
];
const METHOD_LABEL: Record<ProviderMethod, string> = { auto: "Auto-sync", sync: "API sync", file: "Upload" };

/** The provider strip — 2-up cards, email-safe. */
function providerStrip(brand: typeof BRAND): string {
  const chip = (m: ProviderMethod) => {
    const c = m === "file" ? brand.amber : m === "sync" ? brand.ink3 : brand.income;
    return `<span style="font-size:9px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${c};border:1px solid ${c}44;border-radius:999px;padding:3px 8px;font-family:${brand.font};">${METHOD_LABEL[m]}</span>`;
  };
  const boxes = PROVIDERS.map((p) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.white};border:1px solid ${brand.line};border-radius:12px;"><tr><td style="padding:13px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="font-family:${brand.font};font-weight:800;font-size:15px;letter-spacing:-0.02em;color:${p.color};">${p.wm}</td>
        <td align="right">${chip(p.method)}</td>
      </tr></table>
      <div style="font-family:${brand.font};font-size:12px;color:${brand.ink2};margin:9px 0 6px;">${p.example}</div>
      <a href="${p.href}" style="font-family:${brand.font};font-size:11px;color:${brand.income};text-decoration:none;">Reconciled in Penny →</a>
    </td></tr></table>`);
  return `<tr><td style="padding:26px 0 0;border-top:1px solid ${brand.line};">
    <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:${brand.income};font-family:${brand.font};">Connections</div>
    <div style="margin:8px 0 2px;font-size:18px;font-weight:700;color:${brand.ink};letter-spacing:-0.01em;font-family:${brand.font};">Five ways the money comes in — each reconciled for you</div>
    ${grid2(boxes)}
  </td></tr>`;
}

// -----------------------------------------------------------------------------
// FEATURED MOMENTS — an optional visual band of product "snapshot" cards, drawn
// in email-safe HTML (no <img>, no JS) so they render everywhere. Curated, not
// data-driven, so it only shows when a send explicitly asks for it (body
// { featured:true }) — normal weekly digests stay lean. Use for launch moments.
// -----------------------------------------------------------------------------
function featuredMoments(brand: typeof BRAND): string {
  const B = brand;
  const row = (av: string, name: string, sub: string, amt: string, amtc: string, dark = false) => {
    const bg = dark ? "#141414" : B.paper, tc = dark ? "#ffffff" : B.ink, sc = dark ? "#9a9a9a" : B.ink4,
      ab = dark ? "#333333" : "#dcdcd6", af = dark ? "#ffffff" : B.ink3;
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${bg};border-radius:10px;margin:4px 0;"><tr>
      <td width="30" style="padding:9px 0 9px 10px;"><table cellpadding="0" cellspacing="0"><tr><td width="22" height="22" align="center" valign="middle" style="background:${ab};color:${af};border-radius:6px;font-size:10px;font-weight:700;font-family:${B.font};">${av}</td></tr></table></td>
      <td style="padding:9px 8px;font-family:${B.font};"><div style="font-size:12.5px;font-weight:600;color:${tc};">${name}</div><div style="font-size:10.5px;color:${sc};">${sub}</div></td>
      ${amt ? `<td align="right" style="padding:9px 12px 9px 0;font-family:${B.font};font-size:12.5px;font-weight:700;color:${amtc};white-space:nowrap;">${amt}</td>` : ""}
    </tr></table>`;
  };
  const kv = (k: string, v: string, vc?: string) =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:${B.font};"><tr><td style="font-size:12px;color:${B.ink3};padding:5px 0;border-bottom:1px solid ${B.line};">${k}</td><td align="right" style="font-size:12px;font-weight:700;color:${vc ?? B.ink};padding:5px 0;border-bottom:1px solid ${B.line};">${v}</td></tr></table>`;
  const card = (tag: string, title: string, note: string, inner: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.white};border:1px solid ${B.line};border-radius:14px;"><tr><td style="padding:15px 16px 16px;">
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:${B.income};font-family:${B.font};">${tag}</div>
      <div style="font-family:${B.font};font-weight:700;font-size:15px;color:${B.ink};margin:7px 0 2px;line-height:1.2;letter-spacing:-.01em;">${title}</div>
      <div style="font-size:12px;color:${B.ink3};font-family:${B.font};line-height:1.45;margin-bottom:10px;">${note}</div>
      ${inner}
    </td></tr></table>`;
  const cells = [
    card("Catch-up mode", "3 months behind? Fixed.", "Penny takes them in order, oldest first.",
      row("&#10003;", "March", "Reconciled &middot; 214 txns", "Done", B.income) +
      row("&#10003;", "April", "Reconciled &middot; 198 txns", "Done", B.income) +
      row("&rarr;", "May", "Penny is working&hellip;", "", B.amber)),
    card("Bills in, invoices out", "Invoice #1042 is on its way", "PDF attached. A gentle nudge if it runs late.",
      row("BC", "Bright Co", "Due in 14 days", "$3,000", B.income, true) +
      kv("Sent", "Today, 9:02am") + kv("Reminder", "Auto &middot; day 12") + kv("Status", "Delivered", B.income)),
    card("Payouts", "One Stripe payout, split right", "Sales and fees separated automatically.",
      row("S", "Stripe payout", "Deposited today", "$4,820", B.income) +
      kv("Gross sales", "$5,000.00") + kv("Processing fees", "&minus;$180.00", B.ink3) + kv("Net to bank", "$4,820.00", B.income)),
    card("Every currency", "&euro;1,000 today is $1,082", "Daily rate feed, override when you need it.",
      row("&euro;", "Berlin GmbH", "EUR invoice", "&euro;1,000", B.ink) +
      `<div style="text-align:center;font-size:16px;color:${B.ink4};line-height:1;">&darr;</div>` +
      row("$", "Booked in USD", "Rate 1.082 &middot; ECB &middot; today", "$1,082", B.income)),
    card("The pulse", "Your books are healthy", "Nothing needs you right now.",
      row("&#10003;", "0 need review", "Everything categorized", "", B.income) +
      row("&#128247;", "Receipt matched", "Adobe CC &middot; &minus;$55 &middot; Confirmed", "Auto", B.income) +
      row("&uarr;", "Trust level 2", "Penny files subscriptions herself", "", B.income)),
    card("Locks that matter", "One step to close June", "Closing the books verifies it is you.",
      `<table cellpadding="0" cellspacing="0" align="center" style="margin:2px auto 8px;"><tr>${["4", "1", "9", "2", "", ""].map((d) => `<td width="30" height="38" align="center" valign="middle" style="border:1px solid ${B.line};border-radius:8px;font-family:${B.font};font-weight:700;font-size:17px;color:${B.ink};">${d}</td><td width="4"></td>`).join("")}</tr></table>` +
      row("&#128274;", "June locked after this", "Two-step verification", "", B.ink)),
  ];
  return `<tr><td style="padding:22px 0 0;">
    <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${B.income};font-family:${B.font};">See it in action</div>
    <div style="height:10px;line-height:10px;">&nbsp;</div>
    ${grid2(cells)}
  </td></tr>`;
}

/** Dynamic body for the digest — built with the resolved brand so colors track email_brand. */
export function digestBody(entries: Entry[], opts: { featured?: boolean } = {}) {
  return (brand: typeof BRAND) => {
    const grouped = groupByArea(entries);
    const live = AREAS.filter((a) => (grouped.get(a.key)?.length ?? 0) > 0);
    const sections = live.map((a) => sectionRow(a, grouped.get(a.key)!, brand)).join("");
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${statStrip(entries, live.length, brand)}
      ${opts.featured ? featuredMoments(brand) : ""}
      ${sections}
      ${providerStrip(brand)}
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
  return out + `See it in Penny: ${whatsNewUrl}\n`;
};

const nudgeText = (count: number, whatsNewUrl: string) => () =>
  `This week's digest is ready to review.\n\n` +
  `There ${count === 1 ? "is" : "are"} ${count} update(s) from this week. Review and send when you're ready:\n${whatsNewUrl}\n`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const mode: string = body?.mode ?? "remind";
  // Opt-in visual band of product-snapshot cards — for launch sends, not weekly.
  const featured: boolean = body?.featured === true;
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
  // Pull a wide window, then keep only entries created AFTER the last digest
  // send — so a digest is always "what's new since last time" and can never
  // re-send items an earlier digest already covered (even if <7 days old). If
  // there's no prior send, fall back to the classic 7-day window.
  const { data: lastSend } = await service
    .from("changelog_sends").select("sent_at").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const sinceIso: string | null = lastSend?.sent_at ?? null;
  const { data: digest, error } = await service.rpc("changelog_digest", { p_days: sinceIso ? 90 : 7 });
  if (error) return json({ error: "digest_failed", detail: error.message }, 500);
  const entries: Entry[] = (digest?.entries ?? []).filter(
    (e: Entry) => !sinceIso || e.created_at > sinceIso,
  );

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
  // The digest CTA sends readers to the product, not the admin console.
  const productUrl = "https://penny.founderfirst.one";

  // ---- Preview (no send) ----------------------------------------------------
  if (mode === "preview") {
    const { subject, html, text } = await renderEmail({
      supa: service, key: "changelog_digest", vars: digestVars(entries),
      ctaHref: productUrl, buildBody: digestBody(entries, { featured }), buildText: digestText(entries, productUrl),
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
    vars: digestVars(entries), ctaHref: productUrl,
    buildBody: digestBody(entries, { featured }), buildText: digestText(entries, productUrl),
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
