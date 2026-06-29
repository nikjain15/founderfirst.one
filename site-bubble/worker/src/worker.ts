/**
 * Penny site bubble — Cloudflare Worker.
 *
 * Endpoints:
 *   GET  /bubble.js     — serves the bundled bubble UI
 *   POST /chat          — runs a conversation turn through Claude, logs both
 *                         turns to Supabase, returns { reply, sessionState }
 *   POST /waitlist      — captures a waitlist email lead
 *   GET  /health        — liveness check
 *
 * Model: claude-haiku-4-5-20251001 (matches demo's ambient-call decision —
 * cost + 50K TPM headroom).
 *
 * Rate-limit handling: exponential backoff (8s → 16s) with 2 retries on 429,
 * mirroring BookKeeping/demo/guardrails/retry-on-fail.js.
 */

import { SYSTEM_PROMPT_BASE } from "./system-prompt";
import { SITE_CONTENT } from "./site-content";
import { Supabase } from "./supabase";
import { PROMPT_GUARDRAILS } from "./prompt-guardrails";

/**
 * Module-level cache for the live system prompt.
 *
 * The Worker fetches the live prompt from Supabase so admins can edit it from
 * /admin/content without redeploying. We cache it for 60s in the isolate to
 * keep the hot path fast — at our volume that's at most ~60 Supabase calls
 * per hour per isolate, negligible.
 *
 * On any error (network, RLS, table not yet migrated) we fall back to
 * SYSTEM_PROMPT_BASE so Penny stays online.
 */
const PROMPT_TTL_MS = 60_000;
let promptCache: { body: string; fetchedAt: number } | null = null;
let voiceCache: { body: string | null; fetchedAt: number } | null = null;
let discordPersonaCache: { body: string; fetchedAt: number } | null = null;

async function getCachedLiveSystemPrompt(supa: Supabase): Promise<string> {
  const now = Date.now();
  if (promptCache && now - promptCache.fetchedAt < PROMPT_TTL_MS) {
    return promptCache.body;
  }
  try {
    const live = await supa.getLivePrompt();
    const body = live?.body ?? SYSTEM_PROMPT_BASE;
    promptCache = { body, fetchedAt: now };
    return body;
  } catch (e) {
    // Don't poison the cache on failure — fall back, retry next request.
    console.error("getLivePrompt failed, using baked-in prompt:", e);
    return SYSTEM_PROMPT_BASE;
  }
}

/**
 * Live voice guide (VOICE.md), edited via /admin/content#voice and prepended
 * to every Penny system prompt so tone changes propagate to every surface
 * without a redeploy. Returns null if nothing is published yet — in that case
 * we skip the preface and the bot-specific prompt's baked-in voice rules
 * stand alone. Cached ~60s, same as the prompt.
 */
async function getCachedLiveVoice(supa: Supabase): Promise<string | null> {
  const now = Date.now();
  if (voiceCache && now - voiceCache.fetchedAt < PROMPT_TTL_MS) {
    return voiceCache.body;
  }
  try {
    const live = await supa.getLiveVoice();
    const body = live?.body ?? null;
    voiceCache = { body, fetchedAt: now };
    return body;
  } catch (e) {
    console.error("getLiveVoice failed, skipping voice preface:", e);
    return null;
  }
}

/**
 * Live Discord persona — the bot's behavioral instruction block (output format,
 * memory rules, safety), edited via /admin/content#discord. Fetched at runtime
 * (cached ~60s) so changes propagate without redeploying the Worker. Falls back
 * to the baked-in DISCORD_PERSONA_BASE on any error or until a version is
 * published, so Discord stays online and behaves identically pre-migration.
 */
async function getCachedLiveDiscordPersona(supa: Supabase): Promise<string> {
  const now = Date.now();
  if (discordPersonaCache && now - discordPersonaCache.fetchedAt < PROMPT_TTL_MS) {
    return discordPersonaCache.body;
  }
  try {
    const live = await supa.getLiveDiscordPersona();
    const body = live?.body ?? DISCORD_PERSONA_BASE;
    discordPersonaCache = { body, fetchedAt: now };
    return body;
  } catch (e) {
    console.error("getLiveDiscordPersona failed, using baked-in persona:", e);
    return DISCORD_PERSONA_BASE;
  }
}
import {
  extractEmail,
  extractPhone,
  isBuyingSignal,
  isSoftDecline,
} from "./extractors";
import { decideCta, DEFAULT_CTA, type SessionState } from "./cta";
import { BUBBLE_JS } from "./bubble-js";
import type { Env } from "./worker-env";
import {
  handleDiscordDm,
  handleDiscordConfirm,
  handleDiscordDisconnect,
  handleDiscordErase,
  handleDiscordAttachChannel,
} from "./discord";
import { handleEmailCompose } from "./compose";
import { handleInsights } from "./insights";
import { CONNECT_DISCORD_HTML } from "./connect-page";
// AI quality & cost layer (Phase 0): every AI call routes through resolve(). The
// pure core + per-runtime adapters live in packages/inference (relative import —
// the worker bundles via esbuild and is not a pnpm-workspace member).
// Phase 2 (judging): live chat runs an inline gate pass (Option B, D3) — fail
// closed to a human handoff — and an async score pass, writing one judged row.
import {
  resolveDeferredOnWorkers,
  loadEvalDefs,
  judgeInputFrom,
  judgeChatGatesInline,
  chatNeedsHandoff,
  finalizeChatDecision,
} from "../../../packages/inference/src/adapters/workers";
import { USE_CASE, anonTenant, type ChatMessage, type ResolveTask } from "../../../packages/inference/src/core";

export type { Env };

interface ChatBody {
  sessionId: string;
  turnIndex: number;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionState: Partial<SessionState>;
  userAgent?: string;
  referrer?: string;
  pageUrl?: string;
}

interface PennyResponse {
  bubbles: Array<{ headline: string; tone?: string }>;
  cta: { label: string; kind: string } | null;
}

/* ── CORS ─────────────────────────────────────────────────────────────── */

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, env: Env, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, origin),
    },
  });
}

/* ── Anthropic call with 429 backoff ──────────────────────────────────── */

class RateLimitError extends Error {
  constructor() {
    super("rate-limited");
    this.name = "RateLimitError";
  }
}

async function callAnthropic(env: Env, system: string, messages: object[]): Promise<string> {
  const RATE_LIMIT_BASE_MS = 8_000;
  const MAX_RATE_RETRIES = 2;
  let attempt = 0;

  while (true) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 600,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      }),
    });

    if (res.status === 429) {
      attempt++;
      if (attempt > MAX_RATE_RETRIES) throw new RateLimitError();
      await new Promise((r) => setTimeout(r, RATE_LIMIT_BASE_MS * Math.pow(2, attempt - 1)));
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    return text;
  }
}

/* ── JSON extraction (model sometimes wraps in fenced block) ──────────── */

function parseModelJson(raw: string): PennyResponse {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : raw;
  const obj = JSON.parse(candidate);
  if (!obj || !Array.isArray(obj.bubbles)) {
    throw new Error("Model response missing bubbles[]");
  }
  return obj as PennyResponse;
}

/* ── Penny-voice fallback (used on parse / network failure) ───────────── */

const FALLBACK_RESPONSE: PennyResponse = {
  bubbles: [
    { headline: "Give me just a moment — I'm catching up.", tone: "fyi" },
    { headline: "Try your question again in a few seconds.", tone: "fyi" },
  ],
  cta: null,
};

// Shown when the inline gate blocks/escalates or the judge times out (fail closed,
// D3): the answer is held back and the customer is routed to a human teammate.
const HANDOFF_RESPONSE: PennyResponse = {
  bubbles: [
    { headline: "I want to get this exactly right, so I'm looping in a human teammate.", tone: "fyi" },
    { headline: "Email founder@founderfirst.one with your question and we'll follow up personally.", tone: "fyi" },
  ],
  cta: null,
};

/* ── Site-content cache (15 min in KV) ────────────────────────────────── */

async function getSiteContent(env: Env): Promise<string> {
  // Bundled content is the source of truth (per launch decision: option B).
  // We still cache through KV so future swap to a live crawl is a one-line
  // change without touching call sites.
  const KEY = "site-content:v1";
  const cached = await env.SITE_CACHE.get(KEY);
  if (cached) return cached;
  await env.SITE_CACHE.put(KEY, SITE_CONTENT, { expirationTtl: 900 });
  return SITE_CONTENT;
}

/* ── /chat handler ────────────────────────────────────────────────────── */

async function handleChat(req: Request, env: Env, ctx: ExecutionContext, origin: string | null): Promise<Response> {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return json({ error: "invalid_json" }, 400, env, origin);
  }
  if (!body.sessionId || typeof body.message !== "string" || body.message.length === 0) {
    return json({ error: "missing_fields" }, 400, env, origin);
  }
  if (body.message.length > 2000) {
    return json({ error: "message_too_long" }, 400, env, origin);
  }

  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // Compute signals on this user message.
  const buying = isBuyingSignal(body.message);
  const declined = isSoftDecline(body.message);
  const prior: Partial<SessionState> = body.sessionState || {};
  const state: SessionState = {
    turn_count: typeof prior.turn_count === "number" ? prior.turn_count : 0,
    on_waitlist: !!prior.on_waitlist,
    soft_decline_seen: !!prior.soft_decline_seen || declined,
    last_turn_had_cta: !!prior.last_turn_had_cta,
    buying_signal: buying,
  };

  // Volunteered email / phone — log before calling the model.
  const meta = {
    user_agent: body.userAgent ?? null,
    referrer: body.referrer ?? null,
    page_url: body.pageUrl ?? null,
  };
  const email = extractEmail(body.message);
  const phone = extractPhone(body.message);
  if (email) {
    await supa.logLead({ session_id: body.sessionId, kind: "email", value: email, source: "volunteered", ...meta });
  }
  if (phone) {
    await supa.logLead({ session_id: body.sessionId, kind: "phone", value: phone, source: "volunteered", ...meta });
  }

  // Log user turn.
  await supa.logChat({
    session_id: body.sessionId,
    turn_index: body.turnIndex,
    role: "user",
    message: body.message,
    on_waitlist: state.on_waitlist,
    soft_decline: state.soft_decline_seen,
    buying_signal: buying,
    ...meta,
  });

  // Build the prompt.
  //   PROMPT_GUARDRAILS = locked runtime contract (output schema + input format).
  //                       Lives in prompt-guardrails.ts; admins cannot edit it.
  //   promptBase        = editable body (persona, voice, CTA decision tree,
  //                       off-topic templates). Fetched from Supabase, falls
  //                       back to SYSTEM_PROMPT_BASE if unreachable.
  //   <site_content>    = live page text, injected per request.
  //   <session_state>   = runtime-tracked flags for the CTA decision tree.
  const site = await getSiteContent(env);
  const promptBase = await getCachedLiveSystemPrompt(supa);
  const voice = await getCachedLiveVoice(supa);
  const voicePreface = voice
    ? `# FounderFirst Voice — canonical (applies to every surface)\n\n${voice}\n\n---\n\n`
    : "";
  const system = `${PROMPT_GUARDRAILS}

${voicePreface}${promptBase}

<site_content>
${site}
</site_content>

<session_state>
${JSON.stringify(state, null, 2)}
</session_state>`;

  const messages: ChatMessage[] = [
    ...body.history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: body.message },
  ];

  // Call model + parse, then judge (Phase 2, Option B / D3). The answer model,
  // max_tokens, prompt-caching beta, and 429 backoff are unchanged. The decision
  // log is DEFERRED so the inline gate result lands on the same row. tenant_id =
  // the anonymous session, so each visitor is its own isolation unit (D15).
  const chatTask: ResolveTask = {
    useCase: USE_CASE.PENNY_CHAT,
    tenantId: anonTenant(body.sessionId),
    system,
    messages,
    maxTokens: 600,
    // Phase 4 (D10): the model now comes from DB routing (ai_model_config) via the
    // cached config loader — seeded to the same model, now editable from the admin.
    anthropic: {
      betas: ["prompt-caching-2024-07-31"],
      cacheSystem: true,
      maxRetries: 2,
      retryBaseMs: 8_000,
    },
    record: { id: crypto.randomUUID(), ref: body.sessionId, storeInput: true },
  };
  let parsed: PennyResponse;
  try {
    // Resolve the answer (log deferred) and load eval config in parallel.
    const [result, evalDefs] = await Promise.all([
      resolveDeferredOnWorkers(chatTask, env, ctx),
      loadEvalDefs(env, USE_CASE.PENNY_CHAT),
    ]);
    parsed = parseModelJson(result.text);

    // Inline gate pass: deterministic floor + classifier-triaged LLM gates under a
    // 400ms budget. On block / escalate / timeout / error → FAIL CLOSED to a human
    // handoff. The original answer is still recorded (for review); only what SHIPS
    // is swapped. Score evals run async; one enriched row is written on waitUntil.
    const jinput = judgeInputFrom(chatTask, result.model, result.text, parsed, evalDefs);
    const gate = await judgeChatGatesInline(jinput, env, ctx, 400);
    if (chatNeedsHandoff(gate.gateStatus)) parsed = HANDOFF_RESPONSE;
    if (result.record) finalizeChatDecision(env, ctx, result.record, jinput, gate);
  } catch (err) {
    console.error("model_call_failed", err instanceof Error ? err.message : err);
    parsed = FALLBACK_RESPONSE;
  }

  // Apply runtime CTA gate over whatever the model produced.
  const decision = decideCta(state);
  if (decision === "block") {
    parsed.cta = null;
  } else if (decision === "force" && !parsed.cta) {
    parsed.cta = DEFAULT_CTA;
  }
  // "allow" — keep model's choice as-is.

  const ctaEmitted = !!parsed.cta;
  const firstBubble = parsed.bubbles[0];
  const pennyMessage = parsed.bubbles.map((b) => b.headline).join("\n\n");

  // Log Penny turn.
  await supa.logChat({
    session_id: body.sessionId,
    turn_index: body.turnIndex,
    role: "penny",
    message: pennyMessage,
    cta_emitted: ctaEmitted,
    tone: firstBubble?.tone ?? null,
    on_waitlist: state.on_waitlist,
    soft_decline: state.soft_decline_seen,
    buying_signal: buying,
    ...meta,
  });

  const nextState: SessionState = {
    ...state,
    turn_count: state.turn_count + 1,
    last_turn_had_cta: ctaEmitted,
  };

  return json({ reply: parsed, sessionState: nextState }, 200, env, origin);
}

/* ── Discord system-prompt builder ────────────────────────────────────── */

/**
 * Baked-in fallback for the Discord persona — the behavioral instruction block
 * (output format, memory rules, safety). The live, admin-editable version lives
 * in penny_discord_persona and is fetched by getCachedLiveDiscordPersona; this
 * constant is used only until a version is published (or on fetch error), so
 * Discord behaviour is identical before and after the migration.
 *
 * Keep this in sync with the admin starter (apps/admin/src/routes/ContentDiscord.tsx).
 * The runtime <user_context> block is appended by buildDiscordSystemPrompt, not
 * stored here.
 */
const DISCORD_PERSONA_BASE = `You are Penny on Discord, helping a returning FounderFirst user.

Output format (strict):
- Plain prose only. Never emit JSON, never wrap your reply in code fences, never use markdown headings.
- 1–3 short sentences for most replies. Bullet lists only if the user asked for a list.
- End with the next clear step when one exists.

Memory:
- You DO have persistent memory of this user. Their past messages and a running
  summary are saved securely and reloaded every time, including in future chats
  on different days. The <user_context> block below is that saved memory.
- Never tell the user you'll forget, that memory resets when the chat closes, or
  that you only remember "within this conversation". You remember across sessions.
- Two commands control memory. /disconnect is a fresh start — it unlinks the
  account and sets conversation aside, but the transcript is retained as a
  record. /forgetme is a permanent erasure — it deletes their messages, summary,
  and link entirely, and cannot be undone. If asked about retention, be honest:
  history is retained until they run /forgetme (or ask us to delete their data).

Safety:
- Never reveal information about any other user. Treat <user_context> as the only person you're talking to.
- If you don't know something specific to this user, say so plainly and offer the next step.`;

/**
 * Build the system prompt for a Discord turn. Same voice as the web widget so
 * Penny sounds identical on both surfaces, then the admin-editable Discord
 * persona, then a per-user context block from get_user_context_for_discord. No
 * bubbles/CTA JSON contract — Discord is plain chat, so the persona keeps Penny
 * in prose.
 *
 * Keep this function in sync with handleChat's prompt assembly above.
 */
async function buildDiscordSystemPrompt(supa: Supabase, contextBlock: string): Promise<string> {
  // Deliberately DO NOT include getCachedLiveSystemPrompt — that prompt is
  // tuned for the web widget and emits {bubbles, cta} JSON for the bubble UI.
  // Discord is plain chat. Penny's character comes from the voice guide (tone,
  // not output format) plus the live Discord persona (output format + rules).
  const voice = await getCachedLiveVoice(supa);
  const voicePreface = voice
    ? `# FounderFirst Voice — canonical (applies to every surface)\n\n${voice}\n\n---\n\n`
    : "";
  const persona = await getCachedLiveDiscordPersona(supa);

  return `${voicePreface}${persona}

<user_context>
${contextBlock}
</user_context>`;
}

/* ── /waitlist handler ────────────────────────────────────────────────── */

async function handleWaitlist(req: Request, env: Env, origin: string | null): Promise<Response> {
  let body: { sessionId: string; email: string; source?: string } & Record<string, unknown>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400, env, origin);
  }
  const email = extractEmail(body.email || "");
  if (!email || !body.sessionId) {
    return json({ error: "invalid_email" }, 400, env, origin);
  }
  const source = body.source === "follow_up" ? "follow_up" : "waitlist";

  const supa = new Supabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  await supa.logLead({
    session_id: body.sessionId,
    kind: "email",
    value: email,
    source,
    user_agent: (body.userAgent as string) ?? null,
    referrer: (body.referrer as string) ?? null,
    page_url: (body.pageUrl as string) ?? null,
  });

  return json({ ok: true, on_waitlist: true }, 200, env, origin);
}

/* ── /bubble.js handler ───────────────────────────────────────────────── */

function handleBubbleJs(env: Env): Response {
  return new Response(BUBBLE_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ── Router ───────────────────────────────────────────────────────────── */

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get("Origin");
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, 200, env, origin);
    }
    if (url.pathname === "/bubble.js" && req.method === "GET") {
      return handleBubbleJs(env);
    }
    if (url.pathname === "/chat" && req.method === "POST") {
      return handleChat(req, env, ctx, origin);
    }
    if (url.pathname === "/waitlist" && req.method === "POST") {
      return handleWaitlist(req, env, origin);
    }

    // Discord bridge endpoints — gated on DISCORD_BRIDGE_SECRET. CORS not
    // applied because the bridge is server-to-server; the confirm endpoint
    // is called from the admin app and is public-by-token.
    if (url.pathname === "/connect-discord" && req.method === "GET") {
      return new Response(CONNECT_DISCORD_HTML, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (url.pathname === "/discord/dm" && req.method === "POST") {
      return handleDiscordDm(req, env, (system, messages) => callAnthropic(env, system, messages), buildDiscordSystemPrompt);
    }
    if (url.pathname === "/discord/confirm" && req.method === "POST") {
      return handleDiscordConfirm(req, env);
    }
    if (url.pathname === "/discord/disconnect" && req.method === "POST") {
      return handleDiscordDisconnect(req, env);
    }
    if (url.pathname === "/discord/erase" && req.method === "POST") {
      return handleDiscordErase(req, env);
    }
    if (url.pathname === "/compose" && req.method === "POST") {
      return handleEmailCompose(req, env, ctx);
    }
    if (url.pathname === "/insights" && req.method === "POST") {
      return handleInsights(req, env, ctx);
    }
    if (url.pathname === "/discord/attach-channel" && req.method === "POST") {
      return handleDiscordAttachChannel(req, env);
    }

    return json({ error: "not_found" }, 404, env, origin);
  },
};
