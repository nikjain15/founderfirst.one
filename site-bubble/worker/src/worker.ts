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
import {
  extractEmail,
  extractPhone,
  isBuyingSignal,
  isSoftDecline,
} from "./extractors";
import { decideCta, DEFAULT_CTA, type SessionState } from "./cta";
import { BUBBLE_JS } from "./bubble-js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SITE_CACHE: KVNamespace;
  ALLOWED_ORIGINS: string;
  ANTHROPIC_MODEL: string;
  SITE_URL: string;
}

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

async function handleChat(req: Request, env: Env, origin: string | null): Promise<Response> {
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
  const site = await getSiteContent(env);
  const system = `${SYSTEM_PROMPT_BASE}

<site_content>
${site}
</site_content>

<session_state>
${JSON.stringify(state, null, 2)}
</session_state>`;

  const messages = [
    ...body.history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: body.message },
  ];

  // Call model + parse.
  let parsed: PennyResponse;
  try {
    const raw = await callAnthropic(env, system, messages);
    parsed = parseModelJson(raw);
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
  async fetch(req: Request, env: Env): Promise<Response> {
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
      return handleChat(req, env, origin);
    }
    if (url.pathname === "/waitlist" && req.method === "POST") {
      return handleWaitlist(req, env, origin);
    }
    return json({ error: "not_found" }, 404, env, origin);
  },
};
