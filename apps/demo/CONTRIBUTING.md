# Contributing to the Penny demo

This folder is the public, shareable, browser-based demo of Penny — an AI
bookkeeper for US small business owners. It exists to give prospective
users a five-minute walkthrough and to gather feedback that shapes the MVP.

If you're a stranger reading this: you are welcome to fork, study, or lift
the engineering patterns (validator, retry loop, prompt layering, token
system). You are **not** welcome to ship a product named Penny or a product
that copies the voice and brand. See `LICENSE.md` for the exact line.

---

## How work is organised

One screen per session. For each screen there is a **brief** in
`screen-briefs/0X-<screen>.md` and a **stub** in `screens/<screen>.jsx`.
The brief is a scoped, self-sufficient spec; the stub is a placeholder
that will be filled in.

The shared concerns — voice, tokens, validator, AI client — live at the
root and should rarely change. When they do change, it's a deliberate
versioned decision, not drift.

## What you must not do

Read `CLAUDE.md` § "Settled decisions — do not re-open". In short:

- No hard-coded Penny copy in `screens/`. Every Penny utterance comes
  from Claude via `renderPenny()`.
- No new colors / fonts / radii. Use `styles/tokens.css`.
- No British spellings. American English only.
- No emojis except `🎉 👋 ✓ 💪`.
- Three tabs only: Penny · Add · My Books.
- 375px minimum width, always.

If your change conflicts with any of the above, stop and open an issue.
Do not "just this once" it.

## How to run it

```bash
npm install
npm run dev
```

Open the URL Vite prints. Hot reload works.

## How to run the tests

```bash
npm test
```

Vitest runs `tests/*.test.js`. The validator is the highest-leverage thing
to test — bad validator output means bad Penny voice at the user.

## Style

- Small functions. One job each.
- Prose comments on anything non-obvious. Explain **why**, not what.
- No trailing whitespace, no mixed tabs/spaces.
- Commit messages: imperative present (`Add approval card variant`, not
  `Added ...`).

## Questions

Open an issue, or email nik@founderfirst.one.
