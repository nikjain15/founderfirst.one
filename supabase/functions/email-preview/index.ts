/**
 * email-preview — render a draft email template (unsaved) for the admin editor.
 *
 * The Templates editor POSTs the in-progress template + brand; this returns the
 * exact rendered HTML + subject using the shared shell and representative sample
 * data, so the admin sees their edits before saving. SENDS NOTHING.
 *
 * Auth: verify_jwt = false; we check the caller's JWT + admin membership in code
 * (mirrors changelog-digest's preview path). Reads nothing it shouldn't.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BRAND, type Brand, escapeHtml, resolveBrand } from "../_shared/email.ts";
import { FALLBACK, fillPlain, renderFromTemplate, type TemplateRow } from "../_shared/send.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

// Representative sample data per email, so a preview looks like a real send.
const SAMPLE_VARS: Record<string, Record<string, string | number>> = {
  signals_digest: { n: 3, leadword: "leads", topIntent: 92 },
  changelog_digest: { n: 3, thingword: "things", topShipped: "Sortable Signals columns" },
  changelog_nudge: { count: 3, updateword: "updates", thingword: "things" },
  penny_brain: { kindLabel: "Voice guide", version: 4, author: "you@founderfirst.one" },
};

function sampleBody(key: string, brand: Brand): string | undefined {
  if (key === "signals_digest") {
    const leads = [
      { who: "@maya_builds", plat: "Reddit", t: "Looking for an AI that understands my pipeline, not just a chatbot", intent: 92 },
      { who: "founderkanav", plat: "X · Notion AI", t: "Anyone using FounderFirst? Evaluating vs Notion AI", intent: 78 },
      { who: "sara.eng", plat: "LinkedIn", t: "Drowning in support tickets, need something smarter", intent: 64 },
    ];
    const rows = leads.map((l) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid ${brand.line};font-size:14px;color:${brand.ink2};">
        <strong style="color:${brand.ink};">${escapeHtml(l.who)}</strong> <span style="color:${brand.ink4};">(${escapeHtml(l.plat)})</span><br/>
        <span style="color:${brand.ink2};">${escapeHtml(l.t)}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid ${brand.line};text-align:right;font-size:14px;white-space:nowrap;color:${brand.ink3};">intent <strong style="color:${brand.ink};">${l.intent}</strong></td>
    </tr>`).join("");
    return `<table style="width:100%;border-collapse:collapse;">${rows}</table>`;
  }
  if (key === "changelog_digest") {
    const entries = [
      { k: "income", label: "New", t: "Sortable Signals columns", b: "Sort leads by intent, platform, or recency." },
      { k: "amber", label: "Improved", t: "Faster Penny replies", b: "Median response time down ~40%." },
      { k: "ink3", label: "Fixed", t: "Empty digest no longer sends", b: "Quiet weeks stay quiet." },
    ] as const;
    return `<table style="width:100%;border-collapse:collapse;">${entries.map((e) => {
      const c = (brand as any)[e.k];
      return `<tr><td style="padding:10px 0;border-bottom:1px solid ${brand.line};font-size:14px;color:${brand.ink2};vertical-align:top;">
        <span style="display:inline-block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${c};border:1px solid ${c}33;border-radius:999px;padding:2px 8px;margin-right:8px;">${e.label}</span>
        <strong style="color:${brand.ink};">${escapeHtml(e.t)}</strong><br/><span style="color:${brand.ink2};">${escapeHtml(e.b)}</span></td></tr>`;
    }).join("")}</table>`;
  }
  if (key === "penny_brain") {
    return `<p style="margin:0;color:${brand.ink2};font-size:16px;line-height:1.55;font-family:${brand.font};"><strong style="color:${brand.ink};">you@founderfirst.one</strong> published a new voice guide. It's already active everywhere Penny shows up — the site bubble, the support bot, and in-product Penny.</p>`;
  }
  return undefined; // changelog_nudge has no body
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Admin check — mirror changelog-digest: valid JWT + membership in admins.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ error: "unauthorized" }, 401);
  const { data: adminRow } = await userClient
    .from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!adminRow) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const key: string = body?.key ?? "";
  if (!key) return json({ error: "missing_key" }, 400);

  // Built-in emails merge over their code fallback + use sample rows. Custom
  // emails start from an empty base and render their admin-authored body field.
  const isBuiltin = key in FALLBACK;
  const EMPTY: TemplateRow = {
    email_key: key, eyebrow: "", subject: "", preheader: "", heading: "",
    intro: "", cta_label: "", footer: "", body: "",
  };
  const tpl: TemplateRow = { ...(isBuiltin ? FALLBACK[key] : EMPTY), ...(body?.template ?? {}), email_key: key };
  const brand = resolveBrand(body?.brand ?? null) ?? BRAND;

  const rendered = renderFromTemplate(tpl, brand, {
    vars: SAMPLE_VARS[key] ?? {},
    ctaHref: body?.cta_href ?? "#",
    // Built-ins get sample rows; custom emails fall through to their body field.
    buildBody: isBuiltin ? (b) => sampleBody(key, b) ?? "" : undefined,
  });

  // Every field with tokens filled in, so the editor can show the human version
  // ("shows as: Voice guide v4 is live") and a consistent inbox preview.
  const vars = SAMPLE_VARS[key] ?? {};
  const filled = {
    subject:   fillPlain(tpl.subject ?? "", vars),
    preheader: fillPlain(tpl.preheader ?? "", vars),
    eyebrow:   fillPlain(tpl.eyebrow ?? "", vars),
    heading:   fillPlain(tpl.heading ?? "", vars),
    intro:     fillPlain(tpl.intro ?? "", vars),
    cta_label: fillPlain(tpl.cta_label ?? "", vars),
    footer:    fillPlain(tpl.footer ?? "", vars),
  };
  return json({ subject: rendered.subject, preheader: filled.preheader, filled, html: rendered.html });
});
