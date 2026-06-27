/**
 * compose-server — tiny local HTTP service for the FounderFirst AI features that
 * run on the local Ollama model. Three POST routes (shared secret, JSON in/out):
 *   /compose      — draft email copy from a brief        (admin EmailHub)
 *   /voice-check  — critique copy vs the live voice guide (admin Penny → Voice)
 *   /insights     — turn a metrics snapshot into findings (admin Analytics → Insights)
 * plus GET /health.
 *
 * The browser can't reach Ollama directly (localhost-only, no auth) and must never
 * hold the shared secret. So each feature's path is:
 *
 *   admin (browser, signed-in)  →  email-compose Supabase function (checks admin)
 *     →  THIS service over a Cloudflare Tunnel (shared secret)  →  local Ollama
 *
 * This server is the last hop. It takes a short brief, asks the local qwen model
 * for strict-JSON email fields in FounderFirst voice, validates them, and returns
 * them. No database, no outbound except localhost Ollama.
 *
 * Run: `node compose-server.mjs`  (see README "AI email drafting" for launchd +
 * the Cloudflare Tunnel + the two Supabase secrets you set).
 *
 * Env (process.env, or a KEY=VALUE file at COMPOSE_ENV_FILE /
 * ~/.config/founderfirst/secrets.env):
 *   COMPOSE_SECRET          required — shared secret; must match the Supabase secret
 *   COMPOSE_PORT            default 8787
 *   OLLAMA_URL              default http://localhost:11434
 *   OLLAMA_COMPOSE_MODEL    default OLLAMA_SCORE_MODEL or qwen2.5:7b-instruct-q4_K_M
 */

import http from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// ---- Env: process.env first, then a dotenv-style secrets file --------------
function loadEnvFile() {
  const path = process.env.COMPOSE_ENV_FILE || `${homedir()}/.config/founderfirst/secrets.env`;
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no file — rely on the process env (launchd/systemd) */ }
}
loadEnvFile();

const SECRET = process.env.COMPOSE_SECRET || "";
const PORT   = Number(process.env.COMPOSE_PORT || 8787);
const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL  = process.env.OLLAMA_COMPOSE_MODEL || process.env.OLLAMA_SCORE_MODEL || "qwen2.5:7b-instruct-q4_K_M";

if (!SECRET) { console.error("compose-server: COMPOSE_SECRET is not set — refusing to start."); process.exit(1); }

const SYSTEM = `You write short transactional/announcement emails for FounderFirst, a bookkeeping and accounting service for US founders, freelancers, and small-business owners. The voice is plain, warm, and useful — never salesy or hypey, no exclamation marks, no emoji.

Given a brief, return ONLY this JSON (no prose around it):
{
  "subject":   <inbox subject line, <= 45 characters, specific and plain>,
  "preheader": <40-90 chars of preview text that ADDS to the subject, never repeats it>,
  "eyebrow":   <a 1-2 word label shown above the headline, Title Case, e.g. "Product update">,
  "heading":   <one clear sentence that pays off the subject>,
  "intro":     <one optional setup sentence, or "">,
  "body":      <the main message in plain text; use \\n\\n between short paragraphs; 2-4 sentences total; sign off as "— The FounderFirst team">,
  "cta_label": <2-4 word button label, or "" if no button fits>,
  "footer":    <one muted line: why they got it, e.g. "You're getting this because you're a FounderFirst customer.">
}
Rules: write for a non-technical reader; do not use {curly-brace} placeholders; do not invent specific numbers, dates, or names that the brief didn't give you. Keep it honest and concrete.`;

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 1e5) { reject(new Error("body_too_large")); req.destroy(); } data += c; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const cleanStr = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Shared local-Ollama JSON call — all routes go through this.
async function ollamaJSON(system, user, temperature = 0.4) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, stream: false, format: "json",
      options: { temperature },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  try { return JSON.parse(data.message?.content ?? "{}"); }
  catch { throw new Error("model did not return valid JSON"); }
}

async function compose(brief) {
  const p = await ollamaJSON(SYSTEM, `Brief:\n${brief.slice(0, 2000)}`, 0.5);
  return {
    subject:   cleanStr(p.subject, 60),
    preheader: cleanStr(p.preheader, 120),
    eyebrow:   cleanStr(p.eyebrow, 40) || "FounderFirst",
    heading:   cleanStr(p.heading, 160),
    intro:     cleanStr(p.intro, 200),
    body:      cleanStr(p.body, 1500),
    cta_label: cleanStr(p.cta_label, 40),
    footer:    cleanStr(p.footer, 200) || "You're getting this because you're a FounderFirst customer.",
  };
}

// ---- /voice-check — critique draft copy against the live voice guide --------
const VOICE_SYSTEM = `You are a brand-voice editor for FounderFirst. You are given (1) the official VOICE GUIDE and (2) a piece of DRAFT copy. Judge how well the draft matches the guide.

Return ONLY this JSON (no prose around it):
{
  "on_voice":   <true if the draft broadly matches the guide, false otherwise>,
  "score":      <integer 0-100, how on-voice it is>,
  "deviations": <array of short strings, each a specific way the draft breaks the guide; [] if none>,
  "rewrites":   <array of {"before": <offending phrase from the draft>, "after": <on-voice rewrite>}; [] if none>,
  "summary":    <one or two plain sentences summarizing the verdict>
}
Rules: cite only phrases that actually appear in the draft. Be concrete and brief. Do not invent rules that aren't in the guide.`;

async function voiceCheck(text, guide) {
  const p = await ollamaJSON(
    VOICE_SYSTEM,
    `VOICE GUIDE:\n${String(guide).slice(0, 8000)}\n\nDRAFT:\n${String(text).slice(0, 4000)}`,
    0.3,
  );
  const rewrites = Array.isArray(p.rewrites)
    ? p.rewrites.filter((r) => r && (r.before || r.after))
        .map((r) => ({ before: cleanStr(r.before, 300), after: cleanStr(r.after, 300) })).slice(0, 12)
    : [];
  return {
    on_voice: !!p.on_voice,
    score: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))),
    deviations: Array.isArray(p.deviations) ? p.deviations.map((d) => cleanStr(d, 300)).filter(Boolean).slice(0, 12) : [],
    rewrites,
    summary: cleanStr(p.summary, 600),
  };
}

// ---- /insights — turn a metrics snapshot into findings ---------------------
const INSIGHTS_SYSTEM = `You are a product analyst for FounderFirst (an autonomous AI bookkeeper for small businesses; the site collects waitlist signups). You are given a JSON snapshot of product metrics (pageviews, users, sessions, top pages, top events) over a time window. Produce a short, concrete read.

Return ONLY this JSON (no prose around it):
{
  "summary":  <2-4 plain sentences on what the numbers say overall>,
  "findings": <array (3-6 items) of {
     "observation":     <one specific thing the data shows>,
     "likely_cause":    <a plausible reason>,
     "suggested_action":<one concrete next step the team could take>,
     "confidence":      <"low" | "medium" | "high">
  }>
}
Rules: base every observation on the numbers given; do not invent metrics that aren't present. Be specific and actionable, not generic.`;

async function insights(metrics, windowDays) {
  const p = await ollamaJSON(
    INSIGHTS_SYSTEM,
    `Window: ${windowDays} days\nMetrics JSON:\n${JSON.stringify(metrics).slice(0, 6000)}`,
    0.4,
  );
  const findings = Array.isArray(p.findings)
    ? p.findings.filter(Boolean).map((f) => ({
        observation: cleanStr(f.observation, 400),
        likely_cause: cleanStr(f.likely_cause, 400),
        suggested_action: cleanStr(f.suggested_action, 400),
        confidence: ["low", "medium", "high"].includes(String(f.confidence).toLowerCase()) ? String(f.confidence).toLowerCase() : "medium",
      })).filter((f) => f.observation || f.suggested_action).slice(0, 8)
    : [];
  return { summary: cleanStr(p.summary, 1200), findings, model: MODEL };
}

const ROUTES = new Set(["/compose", "/voice-check", "/insights"]);

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, model: MODEL });
  if (req.method !== "POST" || !ROUTES.has(req.url)) return send(res, 404, { error: "not_found" });
  if (req.headers["x-compose-secret"] !== SECRET) return send(res, 401, { error: "unauthorized" });

  try {
    const body = JSON.parse((await readBody(req)) || "{}");

    if (req.url === "/compose") {
      const brief = typeof body.brief === "string" ? body.brief.trim() : "";
      if (brief.length < 3) return send(res, 400, { error: "brief_required" });
      const draft = await compose(brief);
      if (!draft.subject || !draft.heading) return send(res, 502, { error: "weak_draft", detail: "model returned an empty subject/heading" });
      return send(res, 200, { ok: true, draft });
    }

    if (req.url === "/voice-check") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const guide = typeof body.guide === "string" ? body.guide : "";
      if (text.length < 10) return send(res, 400, { error: "text_required" });
      const review = await voiceCheck(text, guide);
      return send(res, 200, { ok: true, review });
    }

    if (req.url === "/insights") {
      const metrics = body.metrics ?? {};
      const windowDays = Number(body.window_days) || 30;
      const out = await insights(metrics, windowDays);
      return send(res, 200, { ok: true, ...out });
    }
  } catch (e) {
    send(res, 500, { error: "request_failed", detail: String(e?.message ?? e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`compose-server listening on 127.0.0.1:${PORT} → Ollama ${OLLAMA} (${MODEL})`);
});
