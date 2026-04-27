/**
 * Validates that Penny responses have the expected JSON shape across 10
 * representative input cases. This is a smoke test on the parser, not on
 * the model — we feed in pre-canned JSON strings (some fenced, some bare,
 * some malformed) and assert the parser handles each correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

function parseModelJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : raw;
  const obj = JSON.parse(candidate);
  if (!obj || !Array.isArray(obj.bubbles)) throw new Error("Model response missing bubbles[]");
  return obj;
}

const SAMPLES = [
  { input: '{"bubbles":[{"headline":"hi"}],"cta":null}', valid: true },
  { input: '```json\n{"bubbles":[{"headline":"hi"}],"cta":null}\n```', valid: true },
  { input: '```\n{"bubbles":[{"headline":"hi"}],"cta":null}\n```', valid: true },
  { input: '{"bubbles":[{"headline":"a","tone":"fyi"},{"headline":"b","tone":"action"}],"cta":{"label":"x","kind":"waitlist"}}', valid: true },
  { input: '{"bubbles":[]}', valid: true }, // empty array still valid shape (rendering layer handles)
  { input: '{"foo":"bar"}', valid: false },
  { input: '{"bubbles":"not an array"}', valid: false },
  { input: 'literally not json', valid: false },
  { input: '{"bubbles":[{"headline":"What is Penny?"}],"cta":{"label":"Save your spot","kind":"waitlist"}}', valid: true },
  { input: '```json\n{\n  "bubbles": [\n    {"headline": "Pricing\'s coming soon."},\n    {"headline": "Want me to save your spot?"}\n  ],\n  "cta": {"label":"Save your spot — just an email.","kind":"waitlist"}\n}\n```', valid: true },
];

for (const [i, s] of SAMPLES.entries()) {
  test(`sample ${i + 1} — ${s.valid ? "valid" : "invalid"}`, () => {
    if (s.valid) {
      const out = parseModelJson(s.input);
      assert.ok(Array.isArray(out.bubbles));
    } else {
      assert.throws(() => parseModelJson(s.input));
    }
  });
}
