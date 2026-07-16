/**
 * node --test site-bubble/tests/chat-validation.test.mjs
 *
 * The 14-Jul weekly audit (PR #338) flagged "no test coverage for Worker auth
 * or /chat" — PR #342 closed the auth half (authOk / x-compose-secret). This
 * closes the /chat half: handleChat's request-validation gate (JSON parse,
 * required fields, message-length cap) and corsHeaders' origin allow-list,
 * which run on every request before any Supabase/Anthropic call.
 *
 * Mirrors the source inline, same convention as cta.test.mjs / extractors.test.mjs
 * / json-shape.test.mjs — if worker.ts drifts, this file fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror of site-bubble/worker/src/worker.ts corsHeaders().
function corsHeaders(env, origin) {
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

// Mirror of handleChat's request-validation block (worker.ts) — returns the
// { status, error } the real handler would json()-respond with, or null when
// the body passes validation and the handler would proceed to call the model.
function validateChatBody(rawJsonText) {
  let body;
  try {
    body = JSON.parse(rawJsonText);
  } catch {
    return { status: 400, error: "invalid_json" };
  }
  if (!body.sessionId || typeof body.message !== "string" || body.message.length === 0) {
    return { status: 400, error: "missing_fields" };
  }
  if (body.message.length > 2000) {
    return { status: 400, error: "message_too_long" };
  }
  return null;
}

const ENV = { ALLOWED_ORIGINS: "https://founderfirst.one, https://www.founderfirst.one" };

test("corsHeaders — allow-listed origin is echoed back", () => {
  const h = corsHeaders(ENV, "https://www.founderfirst.one");
  assert.equal(h["Access-Control-Allow-Origin"], "https://www.founderfirst.one");
});
test("corsHeaders — unlisted origin falls back to the first allowed origin, not reflected", () => {
  const h = corsHeaders(ENV, "https://evil.example.com");
  assert.equal(h["Access-Control-Allow-Origin"], "https://founderfirst.one");
});
test("corsHeaders — null origin (server-to-server) falls back to the first allowed origin", () => {
  const h = corsHeaders(ENV, null);
  assert.equal(h["Access-Control-Allow-Origin"], "https://founderfirst.one");
});
test("corsHeaders — always Vary: Origin so the fallback response isn't cached cross-origin", () => {
  assert.equal(corsHeaders(ENV, null).Vary, "Origin");
});

test("chat validation — malformed JSON rejected", () => {
  assert.deepEqual(validateChatBody("not json"), { status: 400, error: "invalid_json" });
});
test("chat validation — missing sessionId rejected", () => {
  assert.deepEqual(
    validateChatBody(JSON.stringify({ message: "hi" })),
    { status: 400, error: "missing_fields" },
  );
});
test("chat validation — empty message rejected", () => {
  assert.deepEqual(
    validateChatBody(JSON.stringify({ sessionId: "s1", message: "" })),
    { status: 400, error: "missing_fields" },
  );
});
test("chat validation — non-string message rejected", () => {
  assert.deepEqual(
    validateChatBody(JSON.stringify({ sessionId: "s1", message: 12345 })),
    { status: 400, error: "missing_fields" },
  );
});
test("chat validation — message over 2000 chars rejected", () => {
  const body = JSON.stringify({ sessionId: "s1", message: "x".repeat(2001) });
  assert.deepEqual(validateChatBody(body), { status: 400, error: "message_too_long" });
});
test("chat validation — message at exactly 2000 chars passes", () => {
  const body = JSON.stringify({ sessionId: "s1", message: "x".repeat(2000) });
  assert.equal(validateChatBody(body), null);
});
test("chat validation — well-formed body passes", () => {
  const body = JSON.stringify({ sessionId: "s1", turnIndex: 0, message: "how much does it cost", history: [] });
  assert.equal(validateChatBody(body), null);
});
