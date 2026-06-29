/**
 * _shared/email.ts — the one place FounderFirst's transactional email brand lives.
 *
 * Every email we send (Signals digest, What's-new changelog, Penny-brain notify)
 * shares the same chrome: paper page, white card, uppercase eyebrow, tight-tracked
 * heading, pill CTA, muted footer. Rather than re-inline that markup in each edge
 * function, we build the body here so the look stays consistent and a brand tweak
 * is a one-file change.
 *
 * WHY IT LOOKS LIKE 2004 HTML
 * Email clients are not browsers. Gmail strips <style> partially, Outlook renders
 * with Microsoft Word's engine, Apple Mail respects modern CSS, and dark mode
 * inverts colors unpredictably. The robust intersection is: table-based layout,
 * every visual style inlined on the element, fixed widths expressed in tables,
 * and `<!--[if mso]>` conditional comments to hand Outlook its own version of the
 * bits it can't do (web fonts, rounded buttons). This file pays that tax once.
 *
 * Email clients also can't read CSS variables, so the brand values are mirrored
 * from packages/design-system/tokens.css below. Keep them in sync with that file.
 */

// Brand tokens — mirror of packages/design-system/tokens.css.
export const BRAND = {
  font:   "'Inter',-apple-system,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif",
  ink:    "#0a0a0a", // --ink   : headings, primary text
  ink2:   "#2a2a2a", // --ink-2 : body / secondary text
  ink3:   "#5a5a5a", // --ink-3 : eyebrow, muted copy
  ink4:   "#8a8a8a", // --ink-4 : meta, footer
  line:   "#e8e8e5", // --line  : borders, row dividers
  paper:  "#f6f6f4", // --paper : page background
  white:  "#ffffff", // --white : card / button text
  income: "#1A9E6A", // --income: positive / "new"
  amber:  "#C97D1A", // --amber : warning / "improved"
  error:  "#b2291e", // --error : destructive / down
} as const;

/**
 * The colors + sender name the shell renders with. Defaults to code `BRAND`, but
 * `email_brand` (a single admin-editable DB row) can override any field at send
 * time. `resolveBrand()` merges a partial DB row over the code defaults so a
 * missing/empty field can never blank out a color.
 */
export type Brand = typeof BRAND;
export function resolveBrand(partial?: Partial<Brand> | null): Brand {
  if (!partial) return BRAND;
  const out: Record<string, string> = { ...BRAND };
  for (const [k, v] of Object.entries(partial)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out as Brand;
}

/** Escape user-supplied text before interpolating into an HTML email. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The brand's pill CTA — black background, white label, matches the site .btn.
 *
 * Built as a single-cell table so it keeps its shape in Outlook (which ignores
 * padding on <a>), with a VML roundrect fallback inside an mso conditional so
 * even Word-engine Outlook shows a real rounded button. Tap target is ≥44px tall
 * (14px text + 15px padding top/bottom) per the responsive standard.
 */
export function emailButton(label: string, href: string, brand: Brand = BRAND): string {
  const h = escapeHtml(href);
  const l = escapeHtml(label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0;"><tr>
    <td align="center" bgcolor="${brand.ink}" style="border-radius:999px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${brand.ink}">
        <w:anchorlock/><center style="color:${brand.white};font-family:${brand.font};font-size:15px;font-weight:600;">${l}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${h}" style="display:inline-block;background:${brand.ink};color:${brand.white};text-decoration:none;padding:15px 28px;border-radius:999px;font-family:${brand.font};font-size:15px;font-weight:600;line-height:1;mso-padding-alt:0;">${l}</a>
      <!--<![endif]-->
    </td>
  </tr></table>`;
}

export interface EmailShellOptions {
  /** Uppercase eyebrow above the heading, e.g. "FounderFirst · Signals". */
  eyebrow: string;
  /** The headline (already escaped / safe HTML). A real sentence, ends in a period. */
  title: string;
  /** Optional lead-in paragraph under the heading (safe HTML). */
  intro?: string;
  /** Main content block — tables, rows, paragraphs (safe HTML). */
  body?: string;
  /** Optional call-to-action button. */
  cta?: { label: string; href: string };
  /** Optional muted footer line (safe HTML). */
  footer?: string;
  /**
   * Inbox preview text — the snippet shown after the subject in most clients.
   * The single biggest open-rate lever after the subject line. Keep it ~40-90
   * chars, EXTEND the subject (don't repeat it), and front-load value.
   * Plain text only; rendered hidden so it never shows inside the email body.
   */
  preheader?: string;
  /** Optional brand override (from email_brand). Defaults to code `BRAND`. */
  brand?: Brand;
}

/**
 * Wrap inner content in the standard FounderFirst email document.
 * Callers build only the parts that differ; the chrome is shared.
 *
 * Structure (outer → inner): full-bleed paper table → centered 600px card table
 * → content cell. Each text block is its own paragraph with inline styles so no
 * client has to resolve a stylesheet to render it correctly.
 */
export function emailShell(opts: EmailShellOptions): string {
  const b = opts.brand ?? BRAND;
  const intro = opts.intro
    ? `<tr><td style="padding:0 0 4px;"><p class="ff-intro" style="margin:14px 0 0;color:${b.ink3};font-size:16px;line-height:1.55;font-family:${b.font};">${opts.intro}</p></td></tr>`
    : "";
  const body = opts.body
    ? `<tr><td style="padding:18px 0 0;">${opts.body}</td></tr>`
    : "";
  const cta = opts.cta
    ? `<tr><td style="padding:28px 0 0;">${emailButton(opts.cta.label, opts.cta.href, b)}</td></tr>`
    : "";
  const footer = opts.footer
    ? `<tr><td style="padding:26px 0 0;"><p style="margin:0;color:${b.ink4};font-size:13px;line-height:1.55;font-family:${b.font};">${opts.footer}</p></td></tr>`
    : "";

  // Hidden inbox-preview snippet. The trailing zero-width chars stop the client
  // from leaking the email body into the preview after the preheader ends.
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${b.paper};opacity:0;">${escapeHtml(opts.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <!--<![endif]-->
  <style>
    /* Progressive enhancement only — every critical style is also inlined. */
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:${b.ink}; }
    @media (max-width:600px) {
      .ff-card { padding:24px 22px !important; }
      .ff-page { padding:14px !important; }
      .ff-title { font-size:22px !important; }
      .ff-body, .ff-intro { font-size:16px !important; }
    }
  </style>
</head>
<body bgcolor="${b.paper}" style="margin:0;padding:0;background:${b.paper};font-family:${b.font};color:${b.ink};-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table role="presentation" class="ff-page" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${b.paper}" style="background:${b.paper};padding:28px 16px;">
    <tr>
      <td align="center">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="ff-card" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background:${b.white};border:1px solid ${b.line};border-radius:12px;padding:34px;">
          <tr><td>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr><td style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${b.ink3};font-weight:600;font-family:${b.font};padding:0 0 12px;">${opts.eyebrow}</td></tr>
              <tr><td><h1 class="ff-title" style="margin:0;font-size:23px;line-height:1.25;letter-spacing:-0.022em;font-weight:700;color:${b.ink};font-family:${b.font};">${opts.title}</h1></td></tr>
              ${intro}
              ${body}
              ${cta}
              ${footer}
            </table>
          </td></tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body></html>`;
}
