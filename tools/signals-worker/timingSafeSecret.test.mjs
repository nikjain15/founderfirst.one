import { test } from "node:test";
import assert from "node:assert/strict";
import { secretMatches } from "./timingSafeSecret.mjs";

test("accepts an exact match", () => {
  assert.equal(secretMatches("correct-horse-battery-staple", "correct-horse-battery-staple"), true);
});

test("rejects a wrong value of the same length", () => {
  assert.equal(secretMatches("correct-horse-battery-staplf", "correct-horse-battery-staple"), false);
});

test("rejects a shorter candidate without throwing", () => {
  assert.equal(secretMatches("short", "correct-horse-battery-staple"), false);
});

test("rejects a longer candidate without throwing", () => {
  assert.equal(secretMatches("correct-horse-battery-staple-and-then-some", "correct-horse-battery-staple"), false);
});

test("rejects an empty candidate", () => {
  assert.equal(secretMatches("", "correct-horse-battery-staple"), false);
});

test("rejects when the expected secret is unset (never auto-passes)", () => {
  assert.equal(secretMatches("anything", ""), false);
  assert.equal(secretMatches("", ""), false);
});

test("rejects non-string inputs (e.g. a duplicated header parses as an array)", () => {
  assert.equal(secretMatches(["a", "b"], "correct-horse-battery-staple"), false);
  assert.equal(secretMatches(undefined, "correct-horse-battery-staple"), false);
});
