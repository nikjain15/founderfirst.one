/**
 * _shared/email.ts — one place for FounderFirst's transactional email brand.
 *
 * Every email we send (Signals digest, Penny-brain notify, weekly changelog)
 * shares the same chrome: paper background, white card, uppercase eyebrow,
 * tight-tracked heading, pill CTA, muted footer. Rather than re-inline that in
 * each edge function, build the body here so the look stays consistent and a
 * brand tweak is a one-file change.
 *
 * Email clients can't read CSS variables, so the brand values are mirrored from
 * packages/design-system/tokens.css below. Keep them in sync with that file.
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

/** Escape user-supplied text before interpolating into an HTML email. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The brand's pill CTA — black background, white label, matches the site .btn. */
export function emailButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.ink};color:${BRAND.white};` +
    `text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:500;">${label}</a>`;
}

export interface EmailShellOptions {
  /** Uppercase eyebrow above the heading, e.g. "FounderFirst · Signals". */
  eyebrow: string;
  /** The headline (already escaped / safe HTML). */
  title: string;
  /** Optional lead-in paragraph under the heading (safe HTML). */
  intro?: string;
  /** Main content block — tables, rows, paragraphs (safe HTML). */
  body?: string;
  /** Optional call-to-action button. */
  cta?: { label: string; href: string };
  /** Optional muted footer line (safe HTML). */
  footer?: string;
}

/**
 * Wrap inner content in the standard FounderFirst email document.
 * Callers build only the parts that differ; the chrome is shared.
 */
export function emailShell(opts: EmailShellOptions): string {
  const intro  = opts.intro
    ? `<p style="margin:0 0 20px;color:${BRAND.ink3};font-size:14px;line-height:1.5;">${opts.intro}</p>`
    : "";
  const body   = opts.body ?? "";
  const cta    = opts.cta
    ? `<p style="margin:28px 0 0;">${emailButton(opts.cta.label, opts.cta.href)}</p>`
    : "";
  const footer = opts.footer
    ? `<p style="margin:24px 0 0;color:${BRAND.ink4};font-size:12px;line-height:1.5;">${opts.footer}</p>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <!--<![endif]-->
</head>
<body style="font-family:${BRAND.font};color:${BRAND.ink};background:${BRAND.paper};margin:0;padding:24px;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;background:${BRAND.white};border:1px solid ${BRAND.line};border-radius:12px;padding:28px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.ink3};font-weight:600;margin-bottom:10px;">${opts.eyebrow}</div>
    <h1 style="font-size:21px;line-height:1.25;letter-spacing:-0.022em;font-weight:700;color:${BRAND.ink};margin:0 0 6px;">${opts.title}</h1>
    ${intro}
    ${body}
    ${cta}
    ${footer}
  </div>
</body></html>`;
}
