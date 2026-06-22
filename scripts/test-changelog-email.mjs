#!/usr/bin/env node
/**
 * One-off test of the weekly "What's new" email — sends a single message via
 * Resend so you can see the real format and tone before the cron pipeline is
 * live. Sends FROM nik@founderfirst.one (your verified Resend domain) to the
 * test recipients only. Nothing here touches the database or the admins list.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx node scripts/test-changelog-email.mjs
 *
 * Optional overrides:
 *   FROM="FounderFirst <nik@founderfirst.one>"   (default below)
 *   TEST_TO="nik@founderfirst.one,lindsay@founderfirst.one"
 *
 * The API key is read from your shell env — it is never written to disk or
 * printed. founderfirst.one must be a verified sending domain in Resend.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY. Run:\n  RESEND_API_KEY=re_xxx node scripts/test-changelog-email.mjs");
  process.exit(1);
}

const FROM = process.env.FROM || "FounderFirst <nik@founderfirst.one>";
const TO = (process.env.TEST_TO || "nik@founderfirst.one,lindsay@founderfirst.one")
  .split(",").map((s) => s.trim()).filter(Boolean);

const WHATS_NEW_URL = "https://founderfirst.one/admin/how-it-works#whats-new";

// Today's updates — accurate summary of what shipped, in plain language.
const ENTRIES = [
  {
    kind: "New",
    color: "#1a7f4b",
    title: "A “How it works” guide inside the admin",
    body: "A plain-English tour of every part of the admin — Support, Audience, Analytics and Penny, plus the Settings menu — so anyone on the team can see what each section does and how to use it, without a walkthrough. You'll find it under the ⚙️ Settings menu, top-right.",
  },
  {
    kind: "New",
    color: "#1a7f4b",
    title: "A “What's new” board, with a weekly email",
    body: "At the top of that guide there's now a running list of everything we ship. Whenever we make a change it gets posted here so the whole team stays in the loop, you'll get a short email like this one once a week, and anything posted since you last looked is flagged for you.",
  },
];

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const rows = ENTRIES.map((e) => `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;vertical-align:top;">
    <span style="display:inline-block;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${e.color};border:1px solid ${e.color}33;border-radius:999px;padding:2px 8px;margin-right:8px;">${esc(e.kind)}</span>
    <strong>${esc(e.title)}</strong><br/>
    <span style="color:#444;">${esc(e.body)}</span>
  </td>
</tr>`).join("");

const subject = "What's new at FounderFirst this week";

const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0a0a0a;background:#f6f6f4;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e8e5;border-radius:12px;padding:24px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5a5a5a;margin-bottom:8px;">FounderFirst · What's new</div>
    <h1 style="font-size:18px;margin:0 0 4px;">Here's what we shipped this week.</h1>
    <p style="margin:0 0 16px;color:#5a5a5a;font-size:13px;">Newest first.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin:24px 0 0;">
      <a href="${WHATS_NEW_URL}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;">See it in the admin →</a>
    </p>
    <p style="margin:18px 0 0;color:#9a9a9a;font-size:11px;">You're getting this because you're a FounderFirst admin. It goes out once a week whenever something's changed.</p>
  </div>
</body></html>`;

const text = `What's new at FounderFirst this week\n\n` +
  `Here's what we shipped this week. Newest first.\n\n` +
  ENTRIES.map((e) => `• [${e.kind}] ${e.title}\n  ${e.body}`).join("\n\n") +
  `\n\nSee it in the admin: ${WHATS_NEW_URL}\n`;

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: FROM, to: TO, subject, html, text }),
});

const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Send failed:", res.status, out);
  process.exit(1);
}
console.log("Sent ✓", { to: TO, from: FROM, id: out.id });
