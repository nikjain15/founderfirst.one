import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror of site-bubble/worker/src/discord.ts authOk — the Discord-bridge
// Bearer-token gate shared by /discord/dm, /discord/confirm,
// /discord/disconnect, /discord/erase, /discord/attach-channel.
function authOk(headerValue, secret) {
  const header = headerValue ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret) return false;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Mirror of the x-compose-secret gate shared by site-bubble/worker/src/compose.ts
// (handleEmailCompose) and insights.ts (handleInsights): missing server secret
// → not_configured/503, mismatched header → unauthorized/401, else pass.
function composeSecretGate(headerValue, secret) {
  if (!secret) return { ok: false, status: 503, error: "not_configured" };
  if (headerValue !== secret) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true };
}

test("authOk — rejects with no server secret configured, even a matching-shaped header", () => {
  assert.equal(authOk("Bearer x", ""), false);
  assert.equal(authOk("Bearer ", ""), false);
});
test("authOk — rejects a missing Authorization header", () => {
  assert.equal(authOk(undefined, "s3cret"), false);
});
test("authOk — rejects a wrong token", () => {
  assert.equal(authOk("Bearer wrong", "s3cret"), false);
});
test("authOk — rejects a same-length near-miss (constant-time compare path)", () => {
  assert.equal(authOk("Bearer s3cre_", "s3cret"), false);
});
test("authOk — accepts the exact expected Bearer token", () => {
  assert.equal(authOk("Bearer s3cret", "s3cret"), true);
});
test("authOk — case-sensitive", () => {
  assert.equal(authOk("bearer s3cret", "s3cret"), false);
});

test("composeSecretGate — 503 not_configured when COMPOSE_SECRET unset", () => {
  const r = composeSecretGate("anything", undefined);
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(r.error, "not_configured");
});
test("composeSecretGate — 401 unauthorized on a mismatched header", () => {
  const r = composeSecretGate("wrong-secret", "real-secret");
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.error, "unauthorized");
});
test("composeSecretGate — 401 unauthorized when the header is missing entirely", () => {
  const r = composeSecretGate(null, "real-secret");
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});
test("composeSecretGate — passes with the exact matching secret", () => {
  const r = composeSecretGate("real-secret", "real-secret");
  assert.equal(r.ok, true);
});
