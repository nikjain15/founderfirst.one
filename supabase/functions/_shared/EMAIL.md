# Email standard — FounderFirst transactional emails

Every email we send goes through **one** shell so the brand stays consistent and a
change is a one-file edit. The shell lives in [`email.ts`](email.ts); this file is
the rulebook for using it.

**Rule zero:** never hand-write a full email document. Build the parts that differ,
pass them to `emailShell()`, and let it own the chrome.

---

## Anatomy — top to bottom

Every email renders in this fixed order. You only supply the middle bits.

```
┌─ paper background  (#f6f6f4, --paper)        ← shell
│  ┌─ white card  (560px, 1px #e8e8e5, r12)    ← shell
│  │  EYEBROW            uppercase, 11px, tracked   ← you: opts.eyebrow
│  │  Heading.           21px, 700, -0.022em        ← you: opts.title
│  │  Intro paragraph.   14px, muted (optional)     ← you: opts.intro
│  │  [ body block ]     table / rows / copy        ← you: opts.body
│  │  ( CTA button )     black pill, 14px (optional) ← you: opts.cta
│  │  footer line        12px, muted (optional)     ← you: opts.footer
│  └─
└─
```

```ts
import { emailShell, BRAND, escapeHtml, emailButton } from "../_shared/email.ts";

const html = emailShell({
  eyebrow: "FounderFirst · Signals",
  title:   "21 new leads in the last 24h.",
  intro:   "Highest-intent first. Review, approve a draft, and reach out.",
  body:    `<table style="width:100%;border-collapse:collapse;">${rows}</table>`,
  cta:     { label: "Open Signals →", href: leadsUrl },
  footer:  "You're getting this because you're a FounderFirst admin.",
});
```

---

## The rules

1. **Colors come from `BRAND`, never raw hex.** `BRAND.ink`, `.ink2`, `.ink3`,
   `.ink4`, `.line`, `.paper`, `.white`, plus `.income` / `.amber` / `.error` for
   status. These mirror `packages/design-system/tokens.css` — if you reach for a
   hex not in `BRAND`, add it to `BRAND` with a token comment first.
2. **One eyebrow per surface.** It names the sender context, sentence-spaced with
   a `·`: `FounderFirst · Signals`, `FounderFirst · What's new`, `Penny's brain`.
3. **Heading is a real sentence, ends in a period.** "21 new leads in the last 24h."
   not "New leads". The shell handles size/weight/tracking — don't restyle it.
4. **Escape every user/db value** with `escapeHtml()` before interpolating —
   author names, titles, notes, competitor names. Never trust DB text in HTML.
5. **One CTA.** A single black pill via `opts.cta`. Need a second action? Put it
   as a text link in the footer, not a second button.
6. **Always send a `text` part too.** Build a plain-text version alongside the
   HTML and pass both to Resend. Some clients and spam filters require it.
7. **Footer is for "why am I getting this".** Keep it to the recipient reason and
   any unsubscribe/erasure note — muted, never a CTA.
8. **Send through Resend** with `from = NOTIFY_FROM`. Don't invent new sender
   identities; keep all admin mail under the one verified domain.

---

## Adding a new email (welcome, receipt, …)

1. In your edge function, `import { emailShell, BRAND, escapeHtml } from "../_shared/email.ts"`.
2. Build `rows`/`body` HTML using `BRAND.*` colors and `escapeHtml()`.
3. Call `emailShell({ eyebrow, title, intro?, body?, cta?, footer? })` for `html`.
4. Build a parallel plain-text string for `text`.
5. POST `{ from, to, subject, html, text }` to `https://api.resend.com/emails`.
6. Deploy: `supabase functions deploy <name>` (bundles `_shared/email.ts` with it).

---

## Changing the brand

Edit `email.ts` only — `BRAND` constants or the `emailShell` markup. Every email
inherits the change on its next deploy. If a brand value changes in
`packages/design-system/tokens.css`, update the matching `BRAND` constant so the
mirror stays true.

## Previewing

- **In-app (truest):** admin → How it works → What's new → **Preview** runs the
  deployed `changelog-digest` in `preview` mode and returns the real HTML.
- **Test send:** invoke the function with its shared secret to land a real email.
