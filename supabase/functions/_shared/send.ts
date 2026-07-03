/**
 * _shared/send.ts — one send path for every FounderFirst transactional email.
 *
 * Before this, each edge function hardcoded its copy, POSTed to Resend itself,
 * and logged inconsistently. Now they all call sendEmail(), which:
 *   1. loads the admin-editable brand + per-email copy from the DB (email_brand /
 *      email_templates), falling back to code defaults so a missing/empty row can
 *      never brick a send,
 *   2. fills {placeholder} tokens with the function's dynamic vars,
 *   3. renders through the shared emailShell() chrome,
 *   4. POSTs to Resend (chunked ≤50 recipients), and
 *   5. writes one email_log row per chunk (resend_id links to email_events for
 *      open/click rates).
 *
 * The SHELL markup stays in code (email.ts). Only data — colors + copy — is
 * admin-editable, so deliverability can't be edited away.
 */

// deno-lint-ignore-file no-explicit-any
import { BRAND, type Brand, emailShell, resolveBrand } from "./email.ts";

export type Trigger = "cron" | "admin" | "db_trigger" | "test";
export type Vars = Record<string, string | number>;

export interface TemplateRow {
  email_key: string;
  eyebrow: string;
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  cta_label: string;
  footer: string;
  /** Admin-authored body for custom emails (plain text → safe paragraphs).
   *  Built-in emails leave this empty and build their body in code. */
  body?: string;
}

/** Render an admin's plain-text body into safe, escaped HTML paragraphs.
 *  Blank line = new paragraph; single newline = <br/>. No raw HTML passes. */
function renderBodyText(text: string, brand: Brand, vars: Vars): string {
  return fillPlain(text, vars)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const safe = p
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        .replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 14px;color:${brand.ink2};font-size:16px;line-height:1.55;font-family:${brand.font};">${safe}</p>`;
    })
    .join("");
}

/**
 * Code-side fallback copy — used only if the email_templates row is missing.
 * Mirrors the migration seed so a wiped table still sends correct emails.
 */
export const FALLBACK: Record<string, TemplateRow> = {
  signals_digest: {
    email_key: "signals_digest",
    eyebrow: "FounderFirst · Signals",
    subject: "{n} new {leadword} · top intent {topIntent}",
    preheader: "The hottest scores {topIntent}/100 — reach out before it cools.",
    heading: "{n} new {leadword}, highest-intent first.",
    intro: "Scored and sorted. Skim the top one, approve a draft, and reach out while it's warm.",
    cta_label: "Open Signals",
    footer: "You're getting this because you're a FounderFirst admin. It only sends when there's a lead worth your time.",
  },
  changelog_digest: {
    email_key: "changelog_digest",
    eyebrow: "FounderFirst · What's new",
    subject: "{n} {thingword} shipped this week",
    preheader: "Starting with: {topShipped}.",
    heading: "{n} {thingword} shipped this week.",
    intro: "New, Improved, and Fixed — newest first. The short version of where Penny got better.",
    cta_label: "See what shipped",
    footer: "You're getting this because you're a FounderFirst admin. It goes out weekly, only when an admin sends it.",
  },
  changelog_nudge: {
    email_key: "changelog_nudge",
    eyebrow: "FounderFirst · What's new",
    subject: "{count} {updateword} ready to send",
    preheader: "{count} {updateword} to review before they reach the team.",
    heading: "This week's digest is ready for you.",
    intro: "<strong>{count}</strong> {thingword} shipped this week. Give it a read, then send it to the team when it looks right.",
    cta_label: "Review & send",
    footer: "You're getting this because you can send the weekly digest. It's a nudge, not the digest itself.",
  },
  admin_welcome: {
    email_key: "admin_welcome",
    eyebrow: "FounderFirst · Admin",
    subject: "You've got FounderFirst admin access",
    preheader: "Sign in any time with a one-tap magic link — no password.",
    heading: "You're an admin now, {firstName}.",
    intro: "{addedBy} added you to the FounderFirst admin. Sign in any time at founderfirst.one/admin — enter this email and we'll send a one-tap magic link, no password to remember. You'll also get the weekly \"What's new\" and the Signals digests.",
    cta_label: "Open the admin",
    footer: "You're getting this because {addedBy} gave you FounderFirst admin access.",
  },
  invoice_sent: {
    email_key: "invoice_sent",
    eyebrow: "Invoice · {number}",
    subject: "Invoice {number} from FounderFirst — {amount} due {due}",
    preheader: "Here's your invoice for {amount}, due {due}. View and pay online.",
    heading: "Hi {customer}, here's invoice {number}.",
    intro: "Thanks for your business. The details are below — you can view and pay online any time.",
    cta_label: "View & pay invoice",
    footer: "Sent on behalf of your supplier via FounderFirst. Reply to this email with any questions.",
  },
  invoice_nudge: {
    email_key: "invoice_nudge",
    eyebrow: "Invoice · {number}",
    subject: "A gentle reminder: invoice {number} — {amount} due",
    preheader: "Just a friendly nudge — invoice {number} for {amount} is now due.",
    heading: "Hi {customer}, a quick reminder on invoice {number}.",
    intro: "No rush — just flagging that this one's now due. You can view and pay online whenever it's convenient.",
    cta_label: "View & pay invoice",
    footer: "Sent on behalf of your supplier via FounderFirst. Already paid? Please ignore this note.",
  },
  penny_brain: {
    email_key: "penny_brain",
    eyebrow: "Penny's brain",
    subject: "{kindLabel} v{version} is live",
    preheader: "{author} just changed how Penny replies — site, support, in-product.",
    heading: "{kindLabel} v{version} is live on every surface.",
    intro: "",
    cta_label: "Review the change",
    footer: "You're getting this because you're a FounderFirst admin. If you published this yourself, you won't see this email.",
  },
};

/** Substitute {key} with the raw value (no escaping). For plain headers:
 *  subject, preheader (emailShell escapes it), cta_label (emailButton escapes it). */
export function fillPlain(tpl: string, vars: Vars): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Substitute {key} with an HTML-escaped value. For fields rendered as raw HTML:
 *  eyebrow, heading, intro, footer. Template text itself is trusted (admin); only
 *  the dynamic value is escaped. */
function fillHtml(tpl: string, vars: Vars): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in vars)) return m;
    return String(vars[k])
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  });
}

async function loadBrand(supa: any): Promise<Brand> {
  try {
    const { data } = await supa.from("email_brand").select("*").eq("id", true).maybeSingle();
    return resolveBrand(data);
  } catch {
    return BRAND;
  }
}

async function loadTemplate(supa: any, key: string): Promise<TemplateRow> {
  try {
    const { data } = await supa.from("email_templates").select("*").eq("email_key", key).maybeSingle();
    if (data) return data as TemplateRow;
  } catch { /* fall through */ }
  return FALLBACK[key];
}

export interface RenderInput {
  supa: any;
  key: string;
  vars?: Vars;
  ctaHref?: string;
  /** Build the dynamic body block (lead rows, changelog rows, etc.) with the
   *  resolved brand so its colors match the chrome. */
  buildBody?: (brand: Brand) => string;
  /** Build the plain-text alternative. Optional for custom emails — defaults to
   *  heading + body text. */
  buildText?: (vars: Vars) => string;
}

export interface Rendered { subject: string; html: string; text: string; }

/**
 * Pure render from an explicit template + brand (no DB). Used by renderEmail
 * (DB-backed) and the admin preview endpoint (renders unsaved drafts).
 */
export function renderFromTemplate(
  tpl: TemplateRow, brand: Brand,
  opts: { vars?: Vars; ctaHref?: string; buildBody?: (b: Brand) => string; buildText?: (v: Vars) => string },
): Rendered {
  const vars = opts.vars ?? {};
  // Body precedence: code builder (built-in emails) → admin body (custom emails).
  const body = opts.buildBody
    ? opts.buildBody(brand)
    : (tpl.body ? renderBodyText(tpl.body, brand, vars) : undefined);
  const html = emailShell({
    brand,
    eyebrow: fillHtml(tpl.eyebrow, vars),
    preheader: tpl.preheader ? fillPlain(tpl.preheader, vars) : undefined,
    title: fillHtml(tpl.heading, vars),
    intro: tpl.intro ? fillHtml(tpl.intro, vars) : undefined,
    body,
    cta: tpl.cta_label ? { label: fillPlain(tpl.cta_label, vars), href: opts.ctaHref ?? "#" } : undefined,
    footer: tpl.footer ? fillHtml(tpl.footer, vars) : undefined,
  });
  const text = opts.buildText
    ? opts.buildText(vars)
    : `${fillPlain(tpl.heading, vars)}${tpl.body ? "\n\n" + fillPlain(tpl.body, vars) : ""}`;
  return { subject: fillPlain(tpl.subject, vars), html, text };
}

/** DB-backed render — no send. Used by sendEmail and the changelog preview path. */
export async function renderEmail(input: RenderInput): Promise<Rendered> {
  const brand = await loadBrand(input.supa);
  const tpl = await loadTemplate(input.supa, input.key);
  return renderFromTemplate(tpl, brand, {
    vars: input.vars, ctaHref: input.ctaHref, buildBody: input.buildBody, buildText: input.buildText,
  });
}

export interface SendInput extends RenderInput {
  to: string[];
  trigger: Trigger;
}

export interface SendResult {
  ok: boolean;
  sent: number;
  failed: number;
  resendIds: string[];
  detail?: unknown;
}

/** Render, POST to Resend (chunked ≤50), and write one email_log row per chunk. */
export async function sendEmail(input: SendInput): Promise<SendResult> {
  const { supa, key, to, trigger } = input;
  const rendered = await renderEmail(input);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  // Keep the verified From identity from the secret — never override the sender
  // domain from the DB (would break Resend domain verification).
  const from = Deno.env.get("NOTIFY_FROM") ?? "FounderFirst <founder@founderfirst.one>";
  if (!resendKey) {
    await log(supa, key, rendered.subject, to.length, trigger, "failed", null, "resend_key_missing");
    return { ok: false, sent: 0, failed: to.length, resendIds: [], detail: "resend_key_missing" };
  }

  // Resend allows ≤50 recipients per call.
  const chunks: string[][] = [];
  for (let i = 0; i < to.length; i += 50) chunks.push(to.slice(i, i + 50));

  let sent = 0, failed = 0;
  const resendIds: string[] = [];
  let lastDetail: unknown;

  for (const chunk of chunks) {
    // Privacy: a single recipient gets a normal To (transactional emails should
    // address the person). Multiple recipients (admin digests, broadcasts) go in
    // BCC with To set to our own From, so recipients never see each other's
    // addresses.
    const envelope = chunk.length === 1
      ? { to: chunk }
      : { to: [from], bcc: chunk };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, ...envelope, subject: rendered.subject, html: rendered.html, text: rendered.text }),
    });
    const respBody: any = await res.json().catch(() => ({}));
    if (res.ok) {
      sent += chunk.length;
      const id = respBody?.id ?? null;
      if (id) resendIds.push(id);
      await log(supa, key, rendered.subject, chunk.length, trigger, "sent", id, null);
    } else {
      failed += chunk.length;
      lastDetail = respBody;
      await log(supa, key, rendered.subject, chunk.length, trigger, "failed", null, JSON.stringify(respBody).slice(0, 500));
    }
  }

  return { ok: failed === 0, sent, failed, resendIds, detail: lastDetail };
}

async function log(
  supa: any, key: string, subject: string, count: number,
  trigger: Trigger, status: "sent" | "failed" | "skipped",
  resendId: string | null, error: string | null,
): Promise<void> {
  try {
    await supa.from("email_log").insert({
      email_key: key, subject, recipient_count: count,
      trigger, status, resend_id: resendId, error,
    });
  } catch { /* logging must never break a send */ }
}
