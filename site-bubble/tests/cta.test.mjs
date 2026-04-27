import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror of site-bubble/worker/src/cta.ts decideCta.
function decideCta(s) {
  if (s.on_waitlist) return "block";
  if (s.buying_signal) return "force";
  if (s.soft_decline_seen) return "block";
  if (s.turn_count < 2) return "block";
  if (s.last_turn_had_cta) return "block";
  return "allow";
}

const base = {
  turn_count: 5,
  on_waitlist: false,
  soft_decline_seen: false,
  last_turn_had_cta: false,
  buying_signal: false,
};

test("on_waitlist beats everything", () => {
  assert.equal(decideCta({ ...base, on_waitlist: true, buying_signal: true }), "block");
});
test("buying signal forces — even on turn 0", () => {
  assert.equal(decideCta({ ...base, turn_count: 0, buying_signal: true }), "force");
});
test("soft decline blocks", () => {
  assert.equal(decideCta({ ...base, soft_decline_seen: true }), "block");
});
test("soft decline ranks below buying signal", () => {
  assert.equal(decideCta({ ...base, soft_decline_seen: true, buying_signal: true }), "force");
});
test("turn_count < 2 blocks", () => {
  assert.equal(decideCta({ ...base, turn_count: 1 }), "block");
});
test("last_turn_had_cta blocks", () => {
  assert.equal(decideCta({ ...base, last_turn_had_cta: true }), "block");
});
test("default allow at turn 2+ no flags", () => {
  assert.equal(decideCta({ ...base, turn_count: 2 }), "allow");
});
test("ordering — declined + last had cta + turn 5 → block (any blocker wins)", () => {
  assert.equal(decideCta({ ...base, soft_decline_seen: true, last_turn_had_cta: true }), "block");
});
