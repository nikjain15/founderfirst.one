/**
 * ai-client.js — Claude API wrapper for the Penny demo.
 *
 * Every Penny utterance flows through this module:
 *   intent + context  →  assembled prompt  →  Cloudflare Worker  →  Claude
 *                     →  guardrails.validate  →  (retry on fail)  →  screen
 *
 * The Worker sits between the browser and Anthropic so the API key never
 * ships to the client. Rate-limited by X-Demo-Token.
 *
 * Caching:
 *   Responses are cached in localStorage by a hash of (intent, prompt, context).
 *   Same scenario → instant. Pass { nocache: true } to bypass.
 */

import { validate } from "./guardrails/voice-validator.js";
import { retryWithFeedback, RateLimitError } from "./guardrails/retry-on-fail.js";

const PROMPT_CACHE = new Map(); // in-memory prompt file cache
const RESPONSE_CACHE_PREFIX = "penny.cache.v1.";

/**
 * INTENT_MAP — explicit, exhaustive mapping from intent string to the
 * overlay prompt file under /public/prompts/.
 *
 * Several intents share one prompt file (thread.greeting and thread.idle
 * both use thread.md; every onboarding.<step> uses onboarding.md). The
 * mapping makes that shared structure visible at a glance and prevents
 * the "intent.replace('.', '-')" bug where thread.greeting would look
 * for a non-existent thread-greeting.md.
 *
 * Add to this map whenever you add a new intent. Unknown intents throw
 * loudly rather than 404-loading a mystery file.
 */
const INTENT_MAP = {
  // Thread (Penny tab) — one prompt covers greeting + idle nudges.
  "thread.greeting": "thread",
  "thread.idle": "thread",
  "thread.qa": "thread-qa",

  // Onboarding intents are intentionally NOT mapped. Per settled decision #2
  // (CLAUDE.md), onboarding uses static FALLBACK_COPY in screens/onboarding.jsx —
  // no AI call. If a renderPenny({ intent: "onboarding.*" }) call appears,
  // the unknown-intent throw in resolveOverlayName flags the regression.

  // Approval cards — one prompt covers all nine variants; the variant is
  // passed in context.
  "card.approval": "card-approval",

  // My Books — Ask Penny bar.
  "books.qa": "books-qa",

  // Capture — parse a photo/voice/receipt into a proposed transaction.
  "capture.parse": "capture-parse",
};

// --- Prompt loading -----------------------------------------------------------
async function loadPrompt(name) {
  if (PROMPT_CACHE.has(name)) return PROMPT_CACHE.get(name);
  // Use Vite's BASE_URL so the path works at any deploy sub-path
  // (e.g. /penny/demo/ on GitHub Pages or / in dev).
  const base = window.PENNY_CONFIG?.baseUrl || "/";
  const res = await fetch(`${base}prompts/${name}.md`);
  if (!res.ok) throw new Error(`Prompt not found: ${name}`);
  const text = await res.text();
  PROMPT_CACHE.set(name, text);
  return text;
}

function resolveOverlayName(intent) {
  const name = INTENT_MAP[intent];
  if (!name) {
    throw new Error(
      `Unknown intent "${intent}". Add it to INTENT_MAP in ai-client.js.`
    );
  }
  return name;
}

// --- Prompt assembly ----------------------------------------------------------
// Every call uses penny-system.md as the base + the intent-specific prompt
// layered on top. When viewer_role is "cpa" or the card variant is
// "cpa-suggestion", the cpa-chat.md overlay is appended as a third layer.
// Context is injected as a JSON block the prompt refers to.
async function buildSystemPrompt(intent, context, cpaOverlay = null) {
  const base = await loadPrompt("penny-system");
  const overlay = await loadPrompt(resolveOverlayName(intent));
  let prompt = base + "\n\n---\n\n" + overlay;
  if (cpaOverlay) {
    prompt += "\n\n---\n\n" + cpaOverlay;
  }
  return (
    prompt +
    "\n\n---\n\n## Context for this response\n\n```json\n" +
    JSON.stringify(context, null, 2) +
    "\n```\n"
  );
}

function needsCpaOverlay(context) {
  return context.viewer_role === "cpa" || context.card?.variant === "cpa-suggestion";
}

// --- Hash (cheap, non-cryptographic; cache key only) --------------------------
function hashKey(parts) {
  const str = JSON.stringify(parts);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return `${RESPONSE_CACHE_PREFIX}${h >>> 0}`;
}

// --- Client factory -----------------------------------------------------------
// Intents that fire automatically (not user-initiated) — routed to Haiku to
// preserve Sonnet's 30K input TPM budget for user Q&A.
const AMBIENT_INTENTS = new Set(["thread.greeting", "thread.idle", "card.approval"]);

export function createClient({ workerUrl, demoToken, defaultModel, booksModel, ambientModel }) {
  async function callClaude({ systemPrompt, userMessage, model }) {
    const res = await fetch(`${workerUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Demo-Token": demoToken,
      },
      body: JSON.stringify({
        model: model || defaultModel,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (res.status === 429) throw new RateLimitError();
    if (!res.ok) throw new Error(`Worker error: ${res.status}`);
    const json = await res.json();
    return json.content?.[0]?.text || "";
  }

  async function renderPenny({ intent, context, nocache = false, model }) {
    const effectiveModel = model || (
      intent === "books.qa"             ? booksModel :
      AMBIENT_INTENTS.has(intent)       ? (ambientModel || defaultModel) :
      defaultModel
    );
    const key = hashKey({ intent, context, model: effectiveModel });
    if (!nocache) {
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (_) {
          // Corrupt cache entry; fall through and regenerate.
        }
      }
    }

    const cpaOverlay = needsCpaOverlay(context) ? await loadPrompt("cpa-chat") : null;
    const systemPrompt = await buildSystemPrompt(intent, context, cpaOverlay);

    const result = await retryWithFeedback(async (feedback) => {
      const contextJson = JSON.stringify(context, null, 2);
      const baseMessage = `Intent: ${intent}\n\nContext:\n${contextJson}\n\nProduce the JSON response per the contract in the system prompt. Return ONLY a single valid JSON object — no commentary, no code fences, no // or /* */ comments, no example labels, no duplicate objects. Do not echo any example from the prompt; write a fresh response for this specific context.`;
      const userMessage = feedback
        ? `${baseMessage}\n\nYour previous attempt had this issue: ${feedback}. Fix it and return valid JSON only.`
        : baseMessage;

      const raw = await callClaude({
        systemPrompt,
        userMessage,
        model: effectiveModel,
      });

      // Penny's contract is JSON. Extract from fenced block if present.
      const jsonText = extractJSON(raw);
      const parsed = JSON.parse(jsonText);
      const verdict = validate(parsed, { intent, context });
      if (!verdict.ok) throw new ValidationError(verdict.reason);
      return parsed;
    });

    try {
      localStorage.setItem(key, JSON.stringify(result));
    } catch (_) {
      // Storage full or unavailable — caller still gets the result.
    }
    return result;
  }

  return { renderPenny };
}

// --- Helpers ------------------------------------------------------------------
class ValidationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ValidationError";
  }
}

function extractJSON(text) {
  // Prefer the LAST top-level fenced ```json block, then fall back to the
  // LAST balanced top-level {...} object in the raw text. Models occasionally
  // echo an example object before the real response — taking the last one
  // keeps the live answer rather than the example.
  const fences = [...text.matchAll(/```json\s*([\s\S]+?)\s*```/g)];
  const source = fences.length > 0 ? fences[fences.length - 1][1] : text;

  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(source.slice(start, i + 1));
        start = -1;
      } else if (depth < 0) {
        throw new Error("Unbalanced JSON in model output");
      }
    }
  }
  if (objects.length === 0) throw new Error("No JSON found in model output");
  return objects[objects.length - 1];
}

// Exported for unit tests.
export const __test__ = { resolveOverlayName, INTENT_MAP, extractJSON };
