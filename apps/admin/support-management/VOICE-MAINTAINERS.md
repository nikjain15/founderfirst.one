# Voice guide — maintainer notes

Internal-only. Not seen by users, not shipped into any bot's system prompt.
The canonical user-facing voice lives in [`/VOICE.md`](../../VOICE.md) at the
repo root and is edited from `/admin/content#voice`.

---

## Where the voice gets used

When a Penny surface sends a message, the published voice is prepended to that
bot's own system prompt. The full prompt the model sees looks like:

```
[locked runtime contract — JSON schema, never editable]
[live voice guide from Supabase, fetched every 60s]   ← from /admin/content#voice
[bot-specific persona + CTA logic + off-topic templates]
<site_content>…</site_content>
<session_state>…</session_state>
```

Bot-specific additions (JSON output shape, escalation behavior, KB scoping,
demo URLs) belong **in each bot's own prompt**, not in `VOICE.md`. Voice rules
(tone, banned phrases, emoji, off-topic templates) belong **in `VOICE.md`** so
every surface inherits the same canon.

---

## How to update the voice

1. Open `/admin/content#voice`.
2. Click **Edit**, change the markdown, hit **Save as new version**.
3. Click **Set this version live**.
4. Every surface picks it up within ~60 seconds — no redeploy.

The repo file `VOICE.md` is a historical seed: it's what new admin instances
load when there's no published version yet. After v1 is saved, file edits to
`VOICE.md` do **not** propagate anywhere. Either edit in the admin, or edit the
repo file *and* re-publish.

---

## When you add a rule that must be auto-enforced

The LLM follows voice rules most of the time, but not always. Critical rules
(banned phrases, "no exclamation marks", "no British spellings") are enforced
mechanically by `site-bubble/worker/src/prompt-guardrails.ts` and the demo
guardrails in `FounderFirst_Building Demo/demo/guardrails/banned-phrases.js`.

If a rule must be machine-enforced:

1. Add the rule to the voice guide (so it's also in the prompt).
2. Add a regex to the appropriate guardrails file.
3. Add a test verifying the regex rejects the bad phrase.

If you changed an existing banned phrase, also `grep` the codebase for
accidental violations of the old rule before publishing.

---

## Source documents this canon consolidates

Historical — kept here so we don't lose the provenance:

- `founderfirst-internal-backup-2026-04-29/FounderFirst OS/website-planning/website-tone-guide.md` — marketing-site tone.
- `FounderFirst_Building Demo/demo/public/prompts/penny-system.md` — Penny's product system prompt.
- `FounderFirst_Building Demo/demo/guardrails/banned-phrases.js` — machine-enforced banned phrases.
- `FounderFirst_Building Products/site-bubble/worker/penny-site-system.md` — the Penny chatbot on founderfirst.one.

If any of these source docs change in a way that affects voice, the change
should be reflected in `VOICE.md` (and re-published) — not left to drift.
