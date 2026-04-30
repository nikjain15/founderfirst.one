/**
 * voice-validator.js — validates Penny's output against voice rules.
 *
 * Called after every Claude response, before the screen renders it.
 * Returns { ok: true } or { ok: false, reason: "..." }.
 *
 * If validation fails, retry-on-fail.js re-prompts Claude with the reason
 * embedded, so the model knows what to fix on the retry.
 *
 * Contract surfaces enforced here are mirrored in:
 *   public/prompts/penny-system.md  (Output format table)
 *   public/prompts/cpa-chat.md      (CPA tone overlay)
 * If a rule lives in only one of those files and not here (or vice versa),
 * it is a bug. See guardrails/banned-phrases.js for the source-of-truth note.
 */

import { checkBannedPhrases } from "./banned-phrases.js";

// --- Configurable limits ------------------------------------------------------
const LIMITS = {
  headlineMaxChars: 120,
  headlineMaxCharsCpa: 80,        // cpa-chat.md tightens this for CPA viewers.
  whyMaxChars: 160,
  ctaMaxChars: 20,                 // penny-system.md Output format table.
  greetingMaxChars: 60,
  maxSentencesPerField: 2,
  maxEmojiPerMessage: 1,
};

const VALID_TONES = new Set(["fyi", "action", "celebration", "flag"]);

// U+2713 ✓ is a dingbat, not in Extended_Pictographic. The emoji regex below
// won't match it, so it rides through untouched. That's deliberate — ✓ is
// approved as a text character per CLAUDE.md / penny-system.md.
const APPROVED_EMOJI = new Set(["🎉", "👋", "💪"]);

// Tax-claim sniff used by the caveat check (M.6). Conservative regex — if the
// response touches deductibility / IRS-line / quarterly / 1099 / Section 179
// language, it must close with one of the approved caveats.
const TAX_CLAIM_REGEX = /\b(deduct(?:ible)?|schedule c|form 1120|form 1065|section 179|quarterly (?:estimat|tax)|1099|irs|sch c line|sch c\b)/i;
const TAX_CAVEAT_REGEX = /\b(your cpa will confirm|confirm with your filing position|cpa will confirm|filing position)\b/i;

// --- Helpers ------------------------------------------------------------------
function countSentences(text) {
  if (!text) return 0;
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  if (!matches) return text.trim() ? 1 : 0;
  return matches.length;
}

function countEmoji(text) {
  if (!text) return { count: 0, used: [] };
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  const found = text.match(emojiRegex) || [];
  return { count: found.length, used: found };
}

// --- Field-level check --------------------------------------------------------
function validateField(text, label, maxChars, { allowEmpty = false } = {}) {
  if (typeof text !== "string") {
    return { ok: false, reason: `Field "${label}" must be a string.` };
  }
  if (!allowEmpty && !text.trim()) {
    return { ok: false, reason: `Field "${label}" must not be empty.` };
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
// capture-parse.md explicitly allows `parsed.amount === null` when the model
// is asking the user for an amount. Same for `category_guess`. The vendor and
// date stay required (we always have at least a vendor stub from the text).
function validateCaptureParse(response) {
  const parsed = response.parsed;
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "capture.parse requires a `parsed` object." };
  }
  if (typeof parsed.vendor !== "string" || !parsed.vendor.trim()) {
    return { ok: false, reason: "capture.parse.parsed.vendor must be a non-empty string." };
  }
  if (parsed.amount !== null && (typeof parsed.amount !== "number" || isNaN(parsed.amount))) {
    return { ok: false, reason: "capture.parse.parsed.amount must be a number or null." };
  }
  if (parsed.category_guess !== null && parsed.category_guess !== undefined && typeof parsed.category_guess !== "string") {
    return { ok: false, reason: "capture.parse.parsed.category_guess must be a string or null." };
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

  // No null field values per penny-system.md ("Never include `null` values").
  // Exception: capture.parse explicitly allows `parsed.amount` and
  // `parsed.category_guess` to be null — handled inside validateCaptureParse.
  for (const [k, v] of Object.entries(response)) {
    if (v === null && k !== "parsed") {
      return { ok: false, reason: `Field "${k}" is null. Omit fields that are not applicable instead of writing null.` };
    }
  }

  // Headline cap depends on viewer_role (cpa-chat.md tightens to 80).
  const isCpa = meta?.context?.viewer_role === "cpa";
  const headlineCap = isCpa ? LIMITS.headlineMaxCharsCpa : LIMITS.headlineMaxChars;
  const headline = validateField(response.headline, "headline", headlineCap);
  if (!headline.ok) return headline;

  if (response.why !== undefined) {
    const why = validateField(response.why, "why", LIMITS.whyMaxChars);
    if (!why.ok) return why;
  }

  if (response.greeting !== undefined) {
    const greeting = validateField(response.greeting, "greeting", LIMITS.greetingMaxChars);
    if (!greeting.ok) return greeting;
  }

  // Tone enum check.
  if (response.tone !== undefined) {
    if (typeof response.tone !== "string" || !VALID_TONES.has(response.tone)) {
      return {
        ok: false,
        reason: `Field "tone" must be one of ${[...VALID_TONES].join(" | ")}. Got "${response.tone}".`,
      };
    }
    if (isCpa && response.tone === "celebration") {
      return { ok: false, reason: `Field "tone": "celebration" is never emitted in CPA context.` };
    }
  }

  // CTA length checks (penny-system.md Output format table — max 20 chars).
  for (const ctaKey of ["ctaPrimary", "ctaSecondary"]) {
    if (response[ctaKey] !== undefined) {
      if (typeof response[ctaKey] !== "string" || !response[ctaKey].trim()) {
        return { ok: false, reason: `Field "${ctaKey}" must be a non-empty string.` };
      }
      if (response[ctaKey].length > LIMITS.ctaMaxChars) {
        return {
          ok: false,
          reason: `Field "${ctaKey}" exceeds ${LIMITS.ctaMaxChars} characters. Use a shorter button label.`,
        };
      }
    }
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

  // Tax-claim caveat enforcement for Q&A intents (M.6).
  if (meta?.intent === "books.qa" || meta?.intent === "thread.qa") {
    const combined = `${response.headline || ""} ${response.why || ""}`;
    if (TAX_CLAIM_REGEX.test(combined) && !TAX_CAVEAT_REGEX.test(combined)) {
      return {
        ok: false,
        reason: 'Tax-touching answer must close with a caveat — e.g. "your CPA will confirm" (founder voice) or "confirm with your filing position" (CPA voice).',
      };
    }
  }

  // Entity-aware guard (H.1): never speak Schedule C to a partnership.
  const entity = meta?.context?.entity || meta?.context?.persona?.entity;
  if (entity === "partnership") {
    const combined = `${response.headline || ""} ${response.why || ""}`;
    if (/\bschedule\s*c\b|sch c\b/i.test(combined)) {
      return {
        ok: false,
        reason: 'Partnership entity cannot be framed as "Schedule C". Use Form 1065 / Schedule K-1 framing.',
      };
    }
  }

  return { ok: true };
}

// Exported for unit tests.
export const __test__ = { LIMITS, VALID_TONES, APPROVED_EMOJI, validateField, validateCaptureParse };
