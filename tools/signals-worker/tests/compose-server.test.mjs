import { test } from "node:test";
import assert from "node:assert/strict";

// Weekly audit (2026-07-14, PR #338, tools/ section) — "tools/ has zero
// tests ... compose-server.mjs carries real logic uncovered." The prior
// SIGNALS-SEC-1 fix (#326) only covers the timing-safe secret compare;
// this covers the actual request-shaping/validation logic the audit named.
//
// compose-server.mjs has top-level side effects on import (loadEnvFile(),
// process.exit(1) with no COMPOSE_SECRET, server.listen()), so — same
// choice PR #342 made for site-bubble's discord.ts/compose.ts — these are
// mirrors of the source, not live imports. Keep in sync with
// tools/signals-worker/compose-server.mjs.

const cleanStr = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const EMAIL_FORMAT_MARKER = "cta_label";

function buildComposeSystem(voice, persona, emailPersonaBase) {
  const voicePreface = voice && voice.trim()
    ? `# FounderFirst Voice — canonical (applies to every surface)\n\n${voice.trim()}\n\n---\n\n`
    : "";
  const taskNote = persona && persona.trim() ? persona.trim() : emailPersonaBase;
  return `${voicePreface}${taskNote}\n\n${EMAIL_FORMAT_MARKER}`;
}

// Mirror of compose()'s post-ollamaJSON shaping.
function shapeCompose(p) {
  return {
    subject:   cleanStr(p.subject, 60),
    preheader: cleanStr(p.preheader, 120),
    eyebrow:   cleanStr(p.eyebrow, 40) || "FounderFirst",
    heading:   cleanStr(p.heading, 160),
    intro:     cleanStr(p.intro, 200),
    body:      cleanStr(p.body, 1500),
    cta_label: cleanStr(p.cta_label, 40),
    footer:    cleanStr(p.footer, 200) || "You're getting this because you're a FounderFirst customer.",
  };
}

// Mirror of voiceCheck()'s post-ollamaJSON shaping.
function shapeVoiceCheck(p) {
  const rewrites = Array.isArray(p.rewrites)
    ? p.rewrites.filter((r) => r && (r.before || r.after))
        .map((r) => ({ before: cleanStr(r.before, 300), after: cleanStr(r.after, 300) })).slice(0, 12)
    : [];
  return {
    on_voice: !!p.on_voice,
    score: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))),
    deviations: Array.isArray(p.deviations) ? p.deviations.map((d) => cleanStr(d, 300)).filter(Boolean).slice(0, 12) : [],
    rewrites,
    summary: cleanStr(p.summary, 600),
  };
}

// Mirror of insights()'s post-ollamaJSON shaping.
function shapeInsights(p, model) {
  const findings = Array.isArray(p.findings)
    ? p.findings.filter(Boolean).map((f) => ({
        observation: cleanStr(f.observation, 400),
        likely_cause: cleanStr(f.likely_cause, 400),
        suggested_action: cleanStr(f.suggested_action, 400),
        confidence: ["low", "medium", "high"].includes(String(f.confidence).toLowerCase()) ? String(f.confidence).toLowerCase() : "medium",
      })).filter((f) => f.observation || f.suggested_action).slice(0, 8)
    : [];
  return { summary: cleanStr(p.summary, 1200), findings, model };
}

// Mirror of the /compose route's request-validation guard.
function validateBrief(body) {
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  return brief.length < 3 ? { ok: false, status: 400, error: "brief_required" } : { ok: true, brief };
}

// Mirror of the /voice-check route's request-validation guard.
function validateText(body) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  return text.length < 10 ? { ok: false, status: 400, error: "text_required" } : { ok: true, text };
}

// Mirror of /compose's post-draft weak-draft guard.
function weakDraftCheck(draft) {
  return !draft.subject || !draft.heading ? { ok: false, status: 502, error: "weak_draft" } : { ok: true };
}

// ---- cleanStr ---------------------------------------------------------

test("cleanStr — trims and truncates a string", () => {
  assert.equal(cleanStr("  hello world  ", 5), "hello");
});
test("cleanStr — non-string input returns empty string, never throws", () => {
  assert.equal(cleanStr(undefined, 10), "");
  assert.equal(cleanStr(null, 10), "");
  assert.equal(cleanStr(42, 10), "");
  assert.equal(cleanStr({}, 10), "");
});
test("cleanStr — string shorter than max is untouched (after trim)", () => {
  assert.equal(cleanStr(" hi ", 100), "hi");
});

// ---- buildComposeSystem ------------------------------------------------

test("buildComposeSystem — no voice guide omits the voice preface", () => {
  const out = buildComposeSystem("", "task note", "fallback");
  assert.ok(!out.includes("FounderFirst Voice — canonical"));
  assert.ok(out.startsWith("task note"));
});
test("buildComposeSystem — a voice guide is prefaced before the task note", () => {
  const out = buildComposeSystem("Be warm.", "task note", "fallback");
  assert.ok(out.includes("# FounderFirst Voice — canonical (applies to every surface)"));
  assert.ok(out.indexOf("Be warm.") < out.indexOf("task note"));
});
test("buildComposeSystem — blank persona falls back to the baked-in email persona", () => {
  const out = buildComposeSystem("", "   ", "EMAIL_PERSONA_BASE_TEXT");
  assert.ok(out.includes("EMAIL_PERSONA_BASE_TEXT"));
});
test("buildComposeSystem — always appends the output contract", () => {
  const out = buildComposeSystem("", "task note", "fallback");
  assert.ok(out.includes(EMAIL_FORMAT_MARKER));
});

// ---- /compose validation + shaping -------------------------------------

test("validateBrief — rejects a brief under 3 chars", () => {
  assert.deepEqual(validateBrief({ brief: "hi" }), { ok: false, status: 400, error: "brief_required" });
  assert.deepEqual(validateBrief({}), { ok: false, status: 400, error: "brief_required" });
  assert.deepEqual(validateBrief({ brief: 123 }), { ok: false, status: 400, error: "brief_required" });
});
test("validateBrief — accepts a 3+ char brief, trimmed", () => {
  const r = validateBrief({ brief: "  new feature  " });
  assert.equal(r.ok, true);
  assert.equal(r.brief, "new feature");
});

test("shapeCompose — clamps long fields and defaults empty eyebrow/footer", () => {
  const out = shapeCompose({ subject: "S".repeat(100), eyebrow: "", footer: "" });
  assert.equal(out.subject.length, 60);
  assert.equal(out.eyebrow, "FounderFirst");
  assert.equal(out.footer, "You're getting this because you're a FounderFirst customer.");
});
test("shapeCompose — preserves a real eyebrow/footer instead of defaulting", () => {
  const out = shapeCompose({ eyebrow: "Product update", footer: "Because you asked." });
  assert.equal(out.eyebrow, "Product update");
  assert.equal(out.footer, "Because you asked.");
});

test("weakDraftCheck — flags a draft missing subject or heading", () => {
  assert.equal(weakDraftCheck({ subject: "", heading: "x" }).ok, false);
  assert.equal(weakDraftCheck({ subject: "x", heading: "" }).ok, false);
  assert.equal(weakDraftCheck({ subject: "x", heading: "x" }).ok, true);
});

// ---- /voice-check validation + shaping ----------------------------------

test("validateText — rejects text under 10 chars", () => {
  assert.equal(validateText({ text: "short" }).ok, false);
  assert.equal(validateText({}).ok, false);
});
test("validateText — accepts 10+ chars, trimmed", () => {
  const r = validateText({ text: "  this is long enough  " });
  assert.equal(r.ok, true);
  assert.equal(r.text, "this is long enough");
});

test("shapeVoiceCheck — clamps score into 0-100 and rounds", () => {
  assert.equal(shapeVoiceCheck({ score: 150 }).score, 100);
  assert.equal(shapeVoiceCheck({ score: -20 }).score, 0);
  assert.equal(shapeVoiceCheck({ score: 42.6 }).score, 43);
  assert.equal(shapeVoiceCheck({ score: "not a number" }).score, 0);
});
test("shapeVoiceCheck — caps rewrites/deviations at 12 and drops empty rewrite pairs", () => {
  const manyDeviations = Array.from({ length: 20 }, (_, i) => `issue ${i}`);
  const rewrites = [
    { before: "x", after: "y" },
    { before: "", after: "" },
    null,
  ];
  const out = shapeVoiceCheck({ score: 50, deviations: manyDeviations, rewrites });
  assert.equal(out.deviations.length, 12);
  assert.equal(out.rewrites.length, 1);
});
test("shapeVoiceCheck — non-array deviations/rewrites shape to empty arrays, not a crash", () => {
  const out = shapeVoiceCheck({ score: 10, deviations: "not an array", rewrites: null });
  assert.deepEqual(out.deviations, []);
  assert.deepEqual(out.rewrites, []);
});

// ---- /insights shaping ---------------------------------------------------

test("shapeInsights — an invalid confidence value defaults to medium, not dropped", () => {
  const out = shapeInsights({ findings: [{ observation: "x", confidence: "extremely high" }] }, "model-x");
  assert.equal(out.findings[0].confidence, "medium");
});
test("shapeInsights — confidence is case-insensitive", () => {
  const out = shapeInsights({ findings: [{ observation: "x", confidence: "HIGH" }] }, "model-x");
  assert.equal(out.findings[0].confidence, "high");
});
test("shapeInsights — caps findings at 8 even if the model returns more", () => {
  const findings = Array.from({ length: 20 }, (_, i) => ({ observation: `obs ${i}`, confidence: "low" }));
  const out = shapeInsights({ findings }, "model-x");
  assert.equal(out.findings.length, 8);
});
test("shapeInsights — a finding with neither observation nor suggested_action is dropped", () => {
  const out = shapeInsights({ findings: [{ likely_cause: "x", confidence: "low" }] }, "model-x");
  assert.equal(out.findings.length, 0);
});
test("shapeInsights — non-array findings shapes to an empty array, not a crash", () => {
  const out = shapeInsights({ findings: "not an array" }, "model-x");
  assert.deepEqual(out.findings, []);
});
test("shapeInsights — carries the model name through unchanged", () => {
  const out = shapeInsights({ findings: [] }, "qwen2.5:7b-instruct-q4_K_M");
  assert.equal(out.model, "qwen2.5:7b-instruct-q4_K_M");
});
