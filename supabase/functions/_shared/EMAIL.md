# Email standard — FounderFirst transactional emails

These are emails Penny sends on FounderFirst's behalf: the daily Signals digest, the
weekly What's-new, the "Penny's brain updated" alert. Every one goes through **one**
shell so the brand stays consistent and a change is a one-file edit. The shell lives
in [`email.ts`](email.ts); this file is how to use it well — written for whoever is
writing the words, not just the person wiring the code.

**Voice = Penny.** Warm, calm, founder-to-founder, concrete, zero hype. Penny is
FounderFirst's AI assistant; she writes like a sharp colleague who respects your
inbox, never like a marketing list.

---

## ① The anatomy — seven stacked pieces

Every email is the same seven pieces, top to bottom. You only write the middle
five; the shell owns the frame around them.

```
┌─ paper page  (#f6f6f4)                                      ← shell
│  ┌─ white card  (max 600px, 1px border, rounded 12px)       ← shell
│  │
│  │   1. EYEBROW          who this is from / what context   ← you: eyebrow
│  │   2. Heading.         the one thing, a full sentence     ← you: title
│  │   3. Intro paragraph  one line of setup (optional)       ← you: intro
│  │   4. [ body block ]   the list / detail / the substance  ← you: body
│  │   5. ( CTA button )    one black pill, one action         ← you: cta
│  │   6. footer line       why you got this + how to opt out  ← you: footer
│  │
│  └─
└─
```

There is also a **0th piece you never see in the email but everyone sees in their
inbox: the preheader** — the grey preview text after the subject line. It's hidden
inside the email and supplied via `preheader`. Treat it as part of the subject.

---

## ② Attention order — write in the order the reader meets it

A reader decides whether to open in about one second, scanning three things in this
order. Win them in order; don't bury the value.

1. **Sender — Penny.** Always from the one verified `founderfirst.one` identity.
   Familiar sender = opened. Never invent a new "from".
2. **Subject — ≤ 45 characters, value- or number-led.** Lead with the thing that
   changed or the number that matters. "21 new leads today" beats "Your Signals
   update". No "Re:", no fake urgency, no ALL CAPS, no emoji-as-bait.
3. **Preheader — 40–90 characters that *extend* the subject.** This is the second
   line of the subject, not a repeat of it. Subject states the what; preheader adds
   the so-what. If the subject says "21 new leads today", the preheader says
   "Top one scores 92/100 intent — reach out before it cools."
4. **Heading — pays off the subject.** The first thing inside. It should answer the
   promise the subject made, as a real sentence ending in a period: "21 new leads in
   the last 24h." Don't restate the subject verbatim; complete the thought.
5. **Body — one idea, inverted pyramid.** Most important line first, supporting
   detail after, nice-to-know last. One email = one job. If you're tempted to add a
   second topic, it's a second email.
6. **CTA — one button, verb + payoff.** "Open Signals", "Review the change",
   "See what shipped". The reader should know exactly what happens on click.
7. **Footer — why you got this + how to stop.** One muted line. The recipient reason
   ("you're a FounderFirst admin") and any unsubscribe/erasure note. Never a CTA.

---

## ③ Copy formulas with examples

**Subject patterns** (pick one, keep it ≤ 45 chars):
- `{number} {noun} {timeframe}` → "21 new leads today"
- `{what changed} is live` → "Voice guide v4 is live"
- `{verb} this week's {thing}` → "See what shipped this week"
- Avoid: "Your weekly update", "An update from FounderFirst", "Newsletter #12" — no
  number, no value, nothing to open for.

**Preheader — do / don't:**
- DO extend: subject "21 new leads today" → "Top one scores 92/100 — reach out first."
- DON'T repeat: subject "21 new leads today" → "You have 21 new leads today." ✗
- DON'T leave empty: a blank preheader leaks the raw HTML/first body words into the
  inbox. Always set one.

**CTA verbs** (start with the verb, name the payoff): Open, Review, See, Read,
Approve, Reach out. Not "Click here", not "Learn more", not "Submit".

**Penny voice — sounds like / not like:**
- ✓ "21 new leads landed overnight. Highest-intent first — reach out before they cool."
  ✗ "We're excited to share that your lead pipeline has been updated!"
- ✓ "Voice guide v4 is live. It changes how Penny replies on every surface."
  ✗ "🚀 Big news! Penny just got a major upgrade you won't want to miss!!"
- ✓ "Nothing shipped this week, so there's nothing to send." (we just don't send)
  ✗ "Stay tuned for exciting updates coming soon!"

---

## ④ Deliverability rules (don't land in spam)

1. **Always send a `text` part alongside the HTML.** Build the plain-text version
   by hand and pass both to Resend. Missing it hurts inbox placement and breaks
   text-only clients.
2. **Keep image-to-text low.** These emails are text-first by design — no hero
   images, no image-only content. A wall of one big image reads as spam.
3. **One primary link.** A single CTA plus, at most, inline source links. Many
   competing links looks like a blast.
4. **Escape every dynamic value** with `escapeHtml()` — author names, titles, notes,
   lead text, competitor names. Never drop raw DB text into HTML.
5. **Never send empty.** No leads, no changelog entries → send nothing. An email
   with no substance trains people to ignore the next one. Every sender here already
   guards this; keep it that way.

---

## ⑤ Recipes

### Add a new email
1. In your edge function: `import { emailShell, BRAND, escapeHtml } from "../_shared/email.ts"`.
2. Build the `body` HTML using `BRAND.*` colors (never raw hex) and `escapeHtml()` on
   every dynamic value.
3. Call `emailShell({ eyebrow, preheader, title, intro?, body?, cta?, footer? })` for `html`.
4. Build a parallel plain-text string for `text` — same content, no markup.
5. POST `{ from, to, subject, html, text }` to `https://api.resend.com/emails` with
   `from = NOTIFY_FROM`.
6. Add a row to [`EMAIL_REGISTRY.md`](EMAIL_REGISTRY.md) in the same commit.
7. Deploy: `supabase functions deploy <name>` (bundles `_shared/email.ts` with it).

### Change the brand
Edit `email.ts` only — the `BRAND` constants or the `emailShell` markup. Every email
inherits the change on its next deploy. If a value changes in
`packages/design-system/tokens.css`, update the matching `BRAND` constant so the
mirror stays true. Never inline a hex value in a caller.

### Preview before sending
- **In-app (truest):** admin → How it works → What's new → **Preview** runs the
  deployed `changelog-digest` in `preview` mode and returns the real HTML.
- **Test send:** invoke the function with its shared secret to land a real email in
  your own inbox, then check it on a phone and in dark mode.

---

## Note: magic-link sign-in is *not* in this repo

The passwordless sign-in email is generated by **Supabase Auth**, not our code — so it
does **not** go through `emailShell()`. It is nonetheless **already on-brand**: the live
Auth template mirrors the shell and its source of truth is [`auth-magic-link.html`](auth-magic-link.html).
To change it, edit that file and PATCH the project's auth config
(`mailer_templates_magic_link_content`) via the Management API — no dashboard paste.
See [`EMAIL_REGISTRY.md`](EMAIL_REGISTRY.md) entry 7.
