/**
 * compose-server — tiny local HTTP service that drafts email copy with Ollama.
 *
 * The admin "Draft with AI" button (Settings → Emails → + New email) can't reach
 * Ollama directly: Ollama binds to localhost on this machine and has no auth, and
 * the browser must never hold a shared secret. So the path is:
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

async function compose(brief) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, stream: false, format: "json",
      options: { temperature: 0.5 },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Brief:\n${brief.slice(0, 2000)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  let p;
  try { p = JSON.parse(data.message?.content ?? "{}"); }
  catch { throw new Error("model did not return valid JSON"); }
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

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, model: MODEL });
  if (req.method !== "POST" || req.url !== "/compose") return send(res, 404, { error: "not_found" });
  if (req.headers["x-compose-secret"] !== SECRET) return send(res, 401, { error: "unauthorized" });

  try {
    const body = JSON.parse((await readBody(req)) || "{}");
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length < 3) return send(res, 400, { error: "brief_required" });
    const draft = await compose(brief);
    if (!draft.subject || !draft.heading) return send(res, 502, { error: "weak_draft", detail: "model returned an empty subject/heading" });
    send(res, 200, { ok: true, draft });
  } catch (e) {
    send(res, 500, { error: "compose_failed", detail: String(e?.message ?? e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`compose-server listening on 127.0.0.1:${PORT} → Ollama ${OLLAMA} (${MODEL})`);
});
