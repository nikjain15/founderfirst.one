/**
 * admin-e2e/run.mjs — authenticated smoke test for the admin SPA.
 *
 * This is the durable answer to "we keep getting stuck behind auth": the admin
 * build is produced with VITE_E2E=1 + a throwaway test-admin's creds, so it
 * auto-signs-in (lib/devAuth.ts) with a REAL session. We then drive the real,
 * authenticated UI headlessly and assert the new surfaces render.
 *
 * Flow:
 *   1. serve the assembled <repo>/dist/ (run `pnpm build` first),
 *   2. load /admin/ — devAuth auto-signs-in,
 *   3. wait for the authed nav, route to Analytics → Product (client-side),
 *   4. assert the Insights generator renders (config panel, sources, goals),
 *   5. screenshot to tools/admin-e2e/artifacts/ for the CI artifact.
 *
 * It deliberately does NOT click Generate — that spends Workers-AI tokens and
 * depends on live data, which would make the gate flaky. This proves auth +
 * render (the regression net); the live Generate is verified manually via the
 * same dev shim. Exits non-zero on any failed assertion.
 *
 * Usage: node tools/admin-e2e/run.mjs
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mintE2ESession, injectSession } from "../e2e-lib/mintSession.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = resolve(ROOT, "dist");
const ARTIFACTS = resolve(fileURLToPath(new URL("./artifacts/", import.meta.url)));
// Cover images for the weekly "What's new" digest live here. The behind-auth
// areas (penny/reach/infra) are captured below; copy them from the CI artifact
// into this folder and commit to refresh the email covers.
const EMAIL_OUT = resolve(ROOT, "apps/web/public/email/whatsnew");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

/** Resolve to a file; SPA-fallback /admin/* deep links to dist/admin/index.html. */
async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [join(DIST, clean)];
  if (!extname(clean)) candidates.push(join(DIST, clean, "index.html"));
  if (clean.startsWith("/admin")) candidates.push(join(DIST, "admin", "index.html"));
  for (const c of candidates) {
    try { if ((await stat(c)).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

function startServer() {
  const server = createServer(async (req, res) => {
    const file = await resolveFile(req.url || "/");
    if (!file) { res.statusCode = 404; res.end("not found"); return; }
    try {
      const data = await readFile(file);
      res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
      res.end(data);
    } catch { res.statusCode = 500; res.end("error"); }
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!existsSync(join(DIST, "admin", "index.html"))) {
    console.error(`✗ ${join(DIST, "admin", "index.html")} not found. Run \`pnpm build\` (with VITE_E2E=1 + test creds) first.`);
    process.exit(2);
  }
  await mkdir(ARTIFACTS, { recursive: true });

  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error]", m.text()); });

  // ── Captcha-exempt auth (SEC-2) ──────────────────────────────────────────
  // Turnstile now guards signInWithPassword, so the in-app devAuth shim can no
  // longer log in from CI. Mint a session for the E2E admin via the service-role
  // admin API (bypasses captcha) and inject it before navigation so the admin SPA
  // boots already authed. Node-only: E2E_SERVICE_ROLE_KEY is never bundled into the
  // client (not a VITE_ var). Falls back to the in-app devAuth path when unset.
  if (process.env.E2E_SERVICE_ROLE_KEY) {
    try {
      const minted = await mintE2ESession({
        supabaseUrl: process.env.VITE_SUPABASE_URL,
        anonKey: process.env.VITE_SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.E2E_SERVICE_ROLE_KEY,
        email: process.env.E2E_ADMIN_EMAIL || process.env.VITE_DEV_ADMIN_EMAIL,
      });
      await injectSession(page, minted);
      check(`minted a captcha-exempt admin session (service-role; no password sign-in)`, true);
    } catch (e) {
      check("session mint", false, (e?.message || String(e)).slice(0, 200));
    }
  } else {
    console.log("  ℹ️ E2E_SERVICE_ROLE_KEY unset — relying on the in-app devAuth password sign-in (only works with captcha OFF)");
  }

  try {
    await page.goto(`${base}/admin/`, { waitUntil: "networkidle" });

    // 1. Auto-login lands us on the authed nav (not the login screen).
    const navAnalytics = page.getByRole("link", { name: "Analytics", exact: true });
    await navAnalytics.waitFor({ state: "visible", timeout: 20_000 });
    check("authed nav renders (auto-login worked)", true);

    // 2. Route to Analytics → Product (Insights lives in the Product tab).
    await navAnalytics.click();
    await page.getByRole("heading", { name: /numbers that matter/i }).waitFor({ timeout: 10_000 });
    check("Analytics page loads", true);

    await page.getByRole("tab", { name: "Product", exact: true }).click();

    // 3. The Insights generator renders with its config panel + sources + goals.
    await page.locator(".ins-config").waitFor({ state: "visible", timeout: 15_000 });
    check("Insights config panel renders", true);

    const ga4 = await page.getByRole("button", { name: /Marketing · GA4/ }).count();
    check("GA4 source chip present", ga4 > 0, `${ga4} found`);

    const contentGoal = await page.getByText("Content engine", { exact: false }).count();
    check("Content-engine outcome area present", contentGoal > 0);

    const genBtn = page.getByRole("button", { name: /Generate insights/ });
    check("Generate button present", (await genBtn.count()) > 0);

    await page.screenshot({ path: join(ARTIFACTS, "insights.png"), fullPage: true });
    console.log(`\nScreenshot → ${join(ARTIFACTS, "insights.png")}`);

    // 4. Content pipeline board (Penny → Pipeline) renders.
    await page.goto(`${base}/admin/content-pipeline`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /content pipeline/i }).waitFor({ timeout: 15_000 });
    check("Content Pipeline board renders", true);

    const pipelineTab = await page.getByRole("tab", { name: "Pipeline", exact: true }).count();
    check("Pipeline sub-tab present under Penny", pipelineTab > 0);

    await page.screenshot({ path: join(ARTIFACTS, "content-pipeline.png"), fullPage: true });
    console.log(`Screenshot → ${join(ARTIFACTS, "content-pipeline.png")}`);

    // 5. What's-new weekly digest: the admin recipient picker + the stale-count
    // guard. We exercise preview (sends nothing) but NEVER click Send.
    await page.goto(`${base}/admin/how-it-works`, { waitUntil: "networkidle" });
    const digestInput = page.getByLabel("Digest recipients (optional)");
    await digestInput.waitFor({ state: "visible", timeout: 15_000 });
    await digestInput.scrollIntoViewIfNeeded();
    check("What's-new digest renders", true);

    const chips = page.locator(".whatsnew-pick-chip");
    const chipCount = await chips.count();
    check("admin picker chips render", chipCount > 0, `${chipCount} chips`);

    // Toggling an admin chip writes that email into the recipient box.
    if (chipCount > 1) {
      await digestInput.fill("");
      const firstAdmin = chips.nth(1); // nth(0) is the "All admins" chip
      const chipEmail = (await firstAdmin.innerText()).replace(/^✓\s*/, "").trim();
      await firstAdmin.click();
      const afterToggle = await digestInput.inputValue();
      check("chip toggle fills recipient box", afterToggle.includes(chipEmail), afterToggle);

      // Stale-count guard: open a preview, then toggle a chip — the preview must
      // disappear so its "Send to N" count can't diverge from the new list.
      const reviewBtn = page.getByRole("button", { name: /Review & send/ });
      if (await reviewBtn.isEnabled().catch(() => false)) {
        await reviewBtn.click();
        const previewEl = page.locator(".whatsnew-preview");
        await previewEl.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
        if (await previewEl.count()) {
          await chips.nth(2 < chipCount ? 2 : 1).click(); // edit the list
          await previewEl.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
          check("editing recipients clears the open preview", (await previewEl.count()) === 0);
        } else {
          check("digest preview rendered", false, "preview did not appear (no recent entries?)");
        }
      } else {
        console.log("  (Review & send disabled — nothing shipped in last 7 days; skipping preview check)");
      }
    }

    await page.evaluate(() => document.getElementById("whats-new")?.scrollIntoView());
    await page.screenshot({ path: join(ARTIFACTS, "whatsnew-digest.png"), fullPage: true });
    console.log(`Screenshot → ${join(ARTIFACTS, "whatsnew-digest.png")}`);

    // 5b. Build-loop dashboard (Settings → Build) renders (LOOP-1). Reads
    // loop_runs/loop_events; asserts the page + Waiting-on-Nik section render even
    // with no live sessions (the empty state is a valid render).
    await page.goto(`${base}/admin/build`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /what the loop is doing/i }).waitFor({ timeout: 15_000 });
    check("Build dashboard renders", true);
    // The Waiting-on-Nik section only renders once ≥1 loop_runs row exists. Until
    // the migration is deployed (write-don't-deploy) the page shows its empty/error
    // state, which is still a valid render — so this is informational, not a gate.
    const waitingHead = await page.getByRole("heading", { name: /waiting on nik/i }).count();
    console.log(`  (Build: Waiting-on-Nik section ${waitingHead > 0 ? "present" : "absent — no loop_runs yet / table not deployed"})`);
    await page.screenshot({ path: join(ARTIFACTS, "build.png"), fullPage: true });
    console.log(`Screenshot → ${join(ARTIFACTS, "build.png")}`);

    // 5c. Voice Studio (Content → Voice tab) range sliders are screen-reader
    // labeled. Weekly audit (PR #338) flagged pace/pause/warmth as unlabeled
    // <input type="range"> with no id/htmlFor tie to their <label>. Blend ratio
    // only renders when a blend voice is picked (not the default seeded state),
    // so it's excluded here rather than clicking a select to force it into view.
    await page.goto(`${base}/admin/content#voice`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /^penny\.$/i }).waitFor({ timeout: 15_000 });
    for (const id of ["voice-pace", "voice-pause", "voice-warmth"]) {
      const input = page.locator(`#${id}`);
      await input.waitFor({ state: "attached", timeout: 10_000 });
      const tiedLabel = await page.locator(`label[for="${id}"]`).count();
      check(`Voice Studio #${id} slider has a tied <label for>`, tiedLabel > 0);
    }

    // 6. Capture the behind-auth digest covers (best-effort — never fails the
    // gate). Banner clip matches the public covers (1200×630). Written to both
    // the CI artifact and the public folder (for local authed runs).
    await mkdir(EMAIL_OUT, { recursive: true });
    const COVERS = [
      { name: "penny.png", url: `${base}/admin/quality` },
      { name: "reach.png", url: `${base}/admin/audience#signals` },
      { name: "infra.png", url: `${base}/admin/analytics#visibility` },
    ];
    const COVER_CLIP = { x: 0, y: 132, width: 1200, height: 630 };
    for (const c of COVERS) {
      try {
        await page.goto(c.url, { waitUntil: "networkidle", timeout: 20_000 });
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: join(ARTIFACTS, c.name), clip: COVER_CLIP });
        await page.screenshot({ path: join(EMAIL_OUT, c.name), clip: COVER_CLIP });
        console.log(`Cover → ${c.name}  (from ${c.url.replace(base, "")})`);
      } catch (err) {
        console.log(`  (cover ${c.name} skipped — ${(err instanceof Error ? err.message : String(err)).slice(0, 100)})`);
      }
    }
  } catch (e) {
    check("smoke run completed", false, (e instanceof Error ? e.message : String(e)).slice(0, 200));
    await page.screenshot({ path: join(ARTIFACTS, "failure.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    server.close();
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`\n✗ admin E2E smoke failed (${failed.length}/${checks.length}).`);
    process.exit(1);
  }
  console.log(`\n✓ admin E2E smoke passed (${checks.length} checks).`);
}

main().catch((e) => { console.error(e); process.exit(2); });
