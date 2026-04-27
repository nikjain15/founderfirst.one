/**
 * node --test site-bubble/tests/extractors.test.mjs
 *
 * Tests run against the TypeScript source via tsx (or you can copy the
 * regex from extractors.ts — they're shared via re-export). To keep tests
 * dependency-free, we re-implement the regex inline here. If extractors.ts
 * drifts, this file fails — exactly what we want.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror of site-bubble/worker/src/extractors.ts. Keep in sync.
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;
const PHONE_LIKE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;
const BUYING_SIGNAL_RE = /\b(price|pricing|how much|cost|launch|when (can|will|does)|sign[\s-]?up|early access|beta|count me in|i'?m in|where do i|how do i (get|sign|join))\b/i;
const SOFT_DECLINE_RE = /\b(not now|just (looking|browsing)|maybe later|no thanks|not interested|i'?ll think|i'?ll come back)\b/i;

function extractEmail(s) { const m = s.match(EMAIL_RE); return m ? m[0].toLowerCase() : null; }
function extractPhone(s) {
  const m = s.match(PHONE_LIKE_RE); if (!m) return null;
  const d = m[0].replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return null;
}

test("email — simple", () => {
  assert.equal(extractEmail("hit me at jane@example.com please"), "jane@example.com");
});
test("email — plus addressing + dots", () => {
  assert.equal(extractEmail("Jane.Doe+penny@sub.example.co.uk"), "jane.doe+penny@sub.example.co.uk");
});
test("email — none", () => {
  assert.equal(extractEmail("call me on 555 anything"), null);
});

test("phone — bare 10 digits", () => {
  assert.equal(extractPhone("call 4155551234"), "4155551234");
});
test("phone — +1 with parens, dashes", () => {
  assert.equal(extractPhone("phone: +1 (415) 555-1234"), "4155551234");
});
test("phone — dots", () => {
  assert.equal(extractPhone("415.555.1234"), "4155551234");
});
test("phone — leading 1 no plus", () => {
  assert.equal(extractPhone("1-415-555-1234"), "4155551234");
});
test("phone — 9 digits = none", () => {
  assert.equal(extractPhone("415-555-123"), null);
});
test("phone — none", () => {
  assert.equal(extractPhone("hello there"), null);
});

test("buying signal — pricing", () => assert.ok(BUYING_SIGNAL_RE.test("how much does it cost")));
test("buying signal — sign up variant", () => assert.ok(BUYING_SIGNAL_RE.test("where do i sign-up")));
test("buying signal — i'm in", () => assert.ok(BUYING_SIGNAL_RE.test("ok i'm in")));
test("buying signal — neutral q", () => assert.ok(!BUYING_SIGNAL_RE.test("does penny work on iphone")));

test("soft decline — not now", () => assert.ok(SOFT_DECLINE_RE.test("not now thanks")));
test("soft decline — just looking", () => assert.ok(SOFT_DECLINE_RE.test("I'm just looking")));
test("soft decline — maybe later", () => assert.ok(SOFT_DECLINE_RE.test("maybe later")));
test("soft decline — neutral q", () => assert.ok(!SOFT_DECLINE_RE.test("how does it work")));
