import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraft, DRAFT_REFUSAL_RE } from "../brain.mjs";

// validateDraft() is the poisoned-draft gate (weekly audit 2026-07-06, #301,
// tests P1 — zero coverage existed across tools/). A saved draft must read
// like a real reply to THIS post; refusals/meta-requests/length blow-outs are
// model failures that must never reach sig_set_lead_draft.

test("rejects empty/whitespace-only text", () => {
  assert.equal(validateDraft("", "some post").ok, false);
  assert.equal(validateDraft("   ", "some post").ok, false);
  assert.equal(validateDraft(undefined, "some post").ok, false);
});

test("rejects a refusal / meta-request for more context", () => {
  const r = validateDraft("I don't have the actual post text to reference here.", "some post");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "refusal/meta-request");
});

test("rejects a too-short draft", () => {
  const r = validateDraft("Sounds tough, good luck!", "the post body text about bookkeeping");
  assert.equal(r.ok, false);
  assert.match(r.reason, /too short/);
});

test("rejects a too-long draft (over 160 words)", () => {
  const longText = Array(170).fill("word").join(" ");
  const r = validateDraft(longText, "irrelevant");
  assert.equal(r.ok, false);
  assert.match(r.reason, /too long/);
});

test("rejects a draft with no reference to a substantive post", () => {
  const post = "Struggling to reconcile quickbooks after switching platforms last quarter";
  const draft = "Thanks for sharing, that sounds like a lot going on, hope things settle down soon for you.";
  const r = validateDraft(draft, post);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no reference to the post");
});

test("accepts a draft that reuses a distinctive word from the post", () => {
  const post = "Struggling to reconcile quickbooks after switching platforms last quarter";
  const draft = "Reconciling after a quickbooks switch is genuinely painful — happy to share what helped me get through it.";
  const r = validateDraft(draft, post);
  assert.deepEqual(r, { ok: true });
});

test("skips the reference check when the post has too few distinctive words", () => {
  const post = "help";
  const draft = "Totally understand — happy to walk through a couple of quick options that might help here.";
  const r = validateDraft(draft, post);
  assert.deepEqual(r, { ok: true });
});

test("DRAFT_REFUSAL_RE catches the documented refusal/meta-request phrasings", () => {
  const samples = [
    "I don't have access to the actual post content.",
    "Could you share the post text?",
    "Please provide the details so I can help.",
    "There's no text provided for this post.",
    "Once you paste the content I can draft something.",
    "As an AI, I can't read the original post.",
    "[insert their specific pain point here]",
  ];
  for (const s of samples) assert.match(s, DRAFT_REFUSAL_RE, `expected refusal match: "${s}"`);
});

test("DRAFT_REFUSAL_RE does not false-positive on a normal outreach draft", () => {
  const normal = "Switching bookkeeping platforms mid-quarter is rough — happy to share what worked for me when I hit the same wall.";
  assert.doesNotMatch(normal, DRAFT_REFUSAL_RE);
});
