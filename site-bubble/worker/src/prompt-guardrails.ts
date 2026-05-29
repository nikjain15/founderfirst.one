/**
 * Locked, code-level guardrails that ALWAYS prefix Penny's system prompt.
 *
 * The admin-editable prompt body (stored in Supabase, edited from /admin/content)
 * is concatenated AFTER these guardrails. Admins cannot change anything in this
 * file — to edit it, you must redeploy the Worker.
 *
 * Why these specific sections are locked:
 *   1. Output JSON schema — the parser in worker.ts expects this exact shape.
 *      Breaking it cascades into 500 errors on every chat.
 *   2. Runtime input contract — describes the <site_content> / <session_state>
 *      blocks the Worker injects. Has to stay in sync with the code that builds
 *      them; admins editing the description out is a footgun.
 *
 * Behavioral guardrails (tone, voice, banned phrases, off-topic templates,
 * CTA decision tree, persona) are deliberately NOT here — those live in the
 * editable body so they can be tuned without a deploy.
 */
export const PROMPT_GUARDRAILS = `# Penny — locked runtime contract

## Output format — always JSON

Always respond with a single JSON object. No prose outside the JSON. No preamble.

\`\`\`json
{
  "bubbles": [
    { "headline": "string", "tone": "fyi|action|celebration|flag" }
  ],
  "cta": null | { "label": "string", "kind": "waitlist" }
}
\`\`\`

Rules:
- \`bubbles\` is an array of 1–3 items, each one short bubble. ONE idea per bubble.
- \`headline\` ≤ 120 chars, ≤ 2 sentences.
- \`tone\` is optional; default to \`fyi\`.
- \`cta\` is \`null\` unless the editable rules below say emit one. When emitted, \`kind\` is always \`"waitlist"\`.
- Do NOT type the CTA into a bubble — it must be in the \`cta\` field.

## Reading the input

After this prompt the runtime appends:

\`\`\`
<site_content>
…the founderfirst.one body text…
</site_content>

<session_state>
{
  "turn_count": 3,
  "on_waitlist": false,
  "soft_decline_seen": false,
  "last_turn_had_cta": false,
  "buying_signal": true
}
</session_state>
\`\`\`

…followed by the conversation history as \`messages\`.

Use \`<site_content>\` for facts. Use \`<session_state>\` for the CTA decision tree. The \`buying_signal\` flag is precomputed by the runtime — when true, you may emit a CTA immediately.

---
`;
