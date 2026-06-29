/**
 * email-shots/cards.mjs — branded cover cards for the digest's behind-auth areas.
 *
 * The public covers (site, product) are real screenshots from run.mjs. The admin
 * areas (penny / reach / infra) live behind auth, so until the authenticated
 * harness (tools/admin-e2e/run.mjs, run in CI) drops real screenshots here, we
 * ship clean on-brand cover cards — same idea as the blog's PennyGlance/PennySafe
 * hero components. Colors mirror packages/design-system/tokens.css.
 *
 *   node tools/email-shots/cards.mjs   →   apps/web/public/email/whatsnew/{penny,reach,infra}.png
 *
 * To replace a card with the real thing later: capture it via the admin harness
 * and overwrite the PNG — the email references the filename, not the source.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const OUT = resolve(ROOT, "apps/web/public/email/whatsnew");

const B = {
  ink: "#0a0a0a", ink2: "#2a2a2a", ink3: "#5a5a5a", line: "#e8e8e5",
  paper: "#f6f6f4", white: "#ffffff", income: "#1A9E6A", amber: "#C97D1A",
  font: "-apple-system,'SF Pro Text','Segoe UI',Helvetica,Arial,sans-serif",
};

const chip = (t, bg, fg) =>
  `<span style="display:inline-block;font-size:18px;border-radius:999px;padding:6px 16px;background:${bg};color:${fg};margin-right:10px;">${t}</span>`;

// Each card: eyebrow + title on the left, a representative UI motif on the right.
const CARDS = [
  {
    name: "penny.png", eyebrow: "Smarter Penny", title: "She checks her own work.",
    motif: `
      <div style="display:flex;gap:14px;margin-bottom:16px;">
        <div style="flex:1;background:${B.paper};border-radius:12px;padding:18px;text-align:center;">
          <div style="font-size:40px;font-weight:700;color:${B.income};">96</div>
          <div style="font-size:15px;color:${B.ink3};">quality score</div></div>
        <div style="flex:1;background:${B.paper};border-radius:12px;padding:18px;text-align:center;">
          <div style="font-size:40px;font-weight:700;color:${B.income};">$0.02</div>
          <div style="font-size:15px;color:${B.ink3};">avg cost</div></div>
      </div>
      <div style="border:1px solid ${B.line};border-radius:12px;padding:16px;">
        <div style="font-size:16px;color:${B.ink2};margin-bottom:10px;">Flagged answer · low confidence</div>
        ${chip("Approve", B.income, "#fff")}${chip("Edit", "#fff", B.ink3)}${chip("Reject", "#fff", "#b2291e")}
      </div>`,
  },
  {
    name: "reach.png", eyebrow: "Reach + care", title: "Finding people, keeping trust.",
    motif: `
      <div style="border:1px solid ${B.line};border-radius:12px;overflow:hidden;">
        ${[["Reddit · “need a bookkeeper for my LLC”", "92", B.income],
           ["X · “drowning in receipts, help”", "84", B.amber],
           ["Reddit · “best tool for small-biz books”", "71", B.ink3]]
          .map(([t, s, c], i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 18px;${i < 2 ? `border-bottom:1px solid ${B.line};` : ""}">
             <span style="font-size:16px;color:${B.ink2};">${t}</span>
             <span style="font-size:18px;font-weight:700;color:${c};">${s}</span></div>`).join("")}
      </div>`,
  },
  {
    name: "infra.png", eyebrow: "Under the hood", title: "Quietly stronger.",
    motif: `
      <svg viewBox="0 0 520 150" width="100%" height="150" style="display:block;margin-bottom:14px;">
        <polyline fill="none" stroke="${B.income}" stroke-width="4" points="0,120 90,108 180,112 270,76 360,64 450,36 520,24"/>
        <circle cx="520" cy="24" r="7" fill="${B.income}"/>
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:16px;color:${B.ink2};border-top:1px solid ${B.line};padding-top:14px;">
        <span>Google · “AI bookkeeping”</span><span style="font-weight:700;color:${B.ink};">#6 ↑</span></div>
      <div style="display:flex;justify-content:space-between;font-size:16px;color:${B.ink2};padding-top:10px;">
        <span>AI answers · cited</span><span style="font-weight:700;color:${B.income};">3× this week</span></div>`,
  },
];

const cardHtml = (c) => `<!doctype html><html><body style="margin:0;">
  <div style="width:1200px;height:630px;box-sizing:border-box;background:${B.paper};font-family:${B.font};padding:64px;display:flex;align-items:center;gap:56px;">
    <div style="flex:0 0 42%;">
      <div style="font-size:18px;letter-spacing:0.12em;text-transform:uppercase;color:${B.income};font-weight:700;margin-bottom:18px;">${c.eyebrow}</div>
      <div style="font-size:48px;line-height:1.1;letter-spacing:-0.02em;font-weight:700;color:${B.ink};">${c.title}</div>
    </div>
    <div style="flex:1;background:${B.white};border:1px solid ${B.line};border-radius:18px;padding:32px;">${c.motif}</div>
  </div>
</body></html>`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const c of CARDS) {
    await page.setContent(cardHtml(c), { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, c.name), clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log(`✓ ${c.name}  (branded cover card)`);
  }
  await browser.close();
  console.log(`\n${CARDS.length} cover cards → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
