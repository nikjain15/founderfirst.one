/**
 * voice-validator.js — validates Penny's output against voice rules.
 *
 * Called after every Claude response, before the screen renders it.
 * Returns { ok: true } or { ok: false, reason: "..." }.
 *
 * If validation fails, retry-on-fail.js re-prompts Claude with the reason
 * embedded, so the model knows what to fix on the retry.
 */

import { checkBannedPhrases } from "./banned-phrases.js";

// --- Configurable limits ------------------------------------------------------
const LIMITS = {
  headlineMaxChars: 120,
  whyMaxChars: 160,
  maxSentencesPerField: 2,
  maxEmojiPerMessage: 1,
};

// U+2713 ✓ is a dingbat, not in Extended_Pictographic. The emoji regex below
// won't match it, so it rides through untouched. That's deliberate — ✓ is
// approved as a text character per CLAUDE.md.
const APPROVED_EMOJI = new Set(["🎉", "👋", "💪"]);

// --- Helpers ------------------------------------------------------------------
function countSentences(text) {
  if (!text) return 0;
  // Simple heuristic: periods/question marks/exclamations at clause boundaries.
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  if (!matches) return text.trim() ? 1 : 0;
  return matches.length;
}

function countEmoji(text) {
  if (!text) return { count: 0, used: [] };
  // Match emoji in the extended pictographic range.
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  const found = text.match(emojiRegex) || [];
  return { count: found.length, used: found };
}

// --- Field-level check --------------------------------------------------------
function validateField(text, label, maxChars) {
  if (typeof text !== "string") {
    return { ok: false, reason: `Field "${label}" must be a string.` };
  }
  if (text.length > maxChars) {
    return {
      ok: false,
      reason: `Field "${label}" exceeds ${maxChars} characters. Rewrite shorter.`,
    };
  }

  const sentenceCount = countSentences(text);
  if (sentenceCount > LIMITS.maxSentencesPerField) {
    return {
      ok: false,
      reason: `Field "${label}" has ${sentenceCount} sentences; rule is max ${LIMITS.maxSentencesPerField} per bubble. Split into fewer sentences.`,
    };
  }

  const { count, used } = countEmoji(text);
  if (count > LIMITS.maxEmojiPerMessage) {
    return {
      ok: false,
      reason: `Field "${label}" has ${count} emoji; rule is max 1 per message.`,
    };
  }
  for (const e of used) {
    // `✓` is not Extended_Pictographic, so it cannot appear in `used`.
    // The only disallowed outcome here is an emoji not in APPROVED_EMOJI.
    if (!APPROVED_EMOJI.has(e)) {
      return {
        ok: false,
        reason: `Disallowed emoji "${e}" in "${label}". Only 🎉 👋 💪 are allowed (plus ✓ as a text character).`,
      };
    }
  }

  const banned = checkBannedPhrases(text);
  if (!banned.ok) return banned;

  return { ok: true };
}

// --- Capture parse shape (H4 — parsed transactions need a shape check) -------
function validateCaptureParse(response) {
  const parsed = response.parsed;
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "capture.parse requires a `parsed` object." };
  }
  if (typeof parsed.vendor !== "string" || !parsed.vendor.trim()) {
    return { ok: false, reason: "capture.parse.parsed.vendor must be a non-empty string." };
  }
  if (typeof parsed.amount !== "number" || isNaN(parsed.amount)) {
    return { ok: false, reason: "capture.parse.parsed.amount must be a number." };
  }
  if (typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(parsed.date)) {
    return { ok: false, reason: "capture.parse.parsed.date must be an ISO date string (YYYY-MM-DD)." };
  }
  return { ok: true };
}

// --- Top-level validator ------------------------------------------------------
/**
 * @param {object} response — the parsed JSON from Claude.
 * @param {object} meta — { intent, context }.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validate(response, meta) {
  if (!response || typeof response !== "object") {
    return { ok: false, reason: "Response must be a JSON object." };
  }

  // Expected shape per prompts/penny-system.md — every intent must include
  // a headline at minimum. Other fields vary per intent.
  const headline = validateField(response.headline, "headline", LIMITS.headlineMaxChars);
  if (!headline.ok) return headline;

  if (response.why) {
    const why = validateField(response.why, "why", LIMITS.whyMaxChars);
    if (!why.ok) return why;
  }

  if (response.greeting) {
    const greeting = validateField(response.greeting, "greeting", 60);
    if (!greeting.ok) return greeting;
  }

  // Intent-specific shape checks.
  if (meta?.intent === "card.approval") {
    if (!response.ctaPrimary || !response.ctaSecondary) {
      return {
        ok: false,
        reason: "card.approval requires ctaPrimary and ctaSecondary strings.",
      };
    }
  }

  if (meta?.intent === "capture.parse") {
    const parseCheck = validateCaptureParse(response);
    if (!parseCheck.ok) return parseCheck;
  }

  return { ok: true };
}
