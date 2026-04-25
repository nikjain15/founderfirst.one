/**
 * banned-phrases.js — rule-based regex filter for Penny's voice.
 *
 * These rules catch the exact violations called out in:
 *   ../product/02-principles-and-voice.md   (banned phrases, emoji rules)
 *   ../penny-system-prompt.md                (anti-hallucination phrases)
 *
 * A phrase match is a hard fail — the validator will reject the response and
 * ask Claude to regenerate, with the specific violation included in the retry
 * prompt so the model knows what to fix.
 *
 * ---------------------------------------------------------------------------
 * SOURCE-OF-TRUTH NOTE
 * ---------------------------------------------------------------------------
 * This file is the authoritative, machine-enforced list. The prose list in
 * `public/prompts/penny-system.md` is a human-readable summary the model sees
 * at inference time. The two can drift: the model may hear a rule the
 * validator doesn't enforce, or vice versa.
 *
 * When you change a rule, change both:
 *   1. Add / update the regex here.
 *   2. Add / update the matching sentence in penny-system.md.
 *   3. Add a test case in tests/validator.test.js.
 *
 * If a rule exists only in one place, it's a bug.
 * ---------------------------------------------------------------------------
 */

export const BANNED_PATTERNS = [
  // --- Shame-free re-entry (D61) ----------------------------------------
  {
    pattern: /\byou have \d+ (items?|transactions?|things?) to review\b/i,
    reason: "Violates D61 (shame-free re-entry). Never say 'You have N items to review'. Try 'N things came in while you were away'."
  },
  {
    pattern: /\b(you'?re on a|reached a) \d+[- ]day streak\b/i,
    reason: "Violates hard rule (no streak mechanics). Never use streak language."
  },
  {
    pattern: /\b(you haven'?t (reviewed|checked in|been here) in \d+ days?|you'?re behind on)\b/i,
    reason: "Shames the user for a gap in activity. Penny owns the backlog — never guilt the user."
  },

  // --- AI tells and robotic language ------------------------------------
  {
    pattern: /\bas an AI\b/i,
    reason: "Never say 'As an AI'. Penny speaks like a person."
  },
  {
    pattern: /\bi'?m unable to\b/i,
    reason: "Never say 'I'm unable to'. Find a way to help or explain simply what's needed."
  },
  {
    pattern: /\btransaction logged successfully\b/i,
    reason: "Robotic confirmation language. Use 'Done — got it ✓'."
  },
  {
    pattern: /\bplease be advised\b/i,
    reason: "Legal-disclaimer phrasing. Speak like a friend, not a lawyer."
  },

  // --- Over-apology / defensive --------------------------------------------
  {
    pattern: /\bi apologize for any (confusion|inconvenience)\b/i,
    reason: "Vague apology. If you got something wrong, name what was wrong and fix it."
  },
  {
    pattern: /\bi may have been slightly off\b/i,
    reason: "Softens a mistake. Acknowledge it clearly instead."
  },

  // --- Unsubstantiated confidence words for numbers -----------------------
  {
    pattern: /\b(roughly|approximately|about|probably) \$\d/i,
    reason: "Never approximate a financial figure. State the exact number or say you don't have it."
  },
  {
    pattern: /\b(i estimate|i believe|i think) (that )?you\b/i,
    reason: "Don't hedge with 'I think' / 'I estimate'. State the number with source or say unknown."
  },

  // --- Banned emoji -------------------------------------------------------
  // Emoji enforcement lives in voice-validator.js via the APPROVED_EMOJI
  // allow-list (only 🎉 👋 💪 are permitted; ✓ rides through as text).
  // The previous deny-list duplicated and contradicted that gate — retired.

  // --- British spellings (sample — validator adds more) ------------------
  {
    pattern: /\b(categorised|organised|recognised|cancelled|colour|behaviour|centred|analyse)\b/i,
    reason: "British spelling detected. Use American English (categorized, organized, recognized, canceled, color, behavior, centered, analyze)."
  }
];

/**
 * Check a message for banned phrases.
 * Returns { ok: true } or { ok: false, reason: "..." }.
 */
export function checkBannedPhrases(text) {
  for (const rule of BANNED_PATTERNS) {
    if (rule.pattern.test(text)) {
      return { ok: false, reason: rule.reason };
    }
  }
  return { ok: true };
}
