# admin-hardening — SUMMARY (run 2026-06-24)

Autonomous overnight hardening of `apps/admin`. Branch `admin-hardening` (worktree).
Base: `main`. This run: 2 safe fixes committed + 1 cross-cutting audit. No prod
deploys, no migrations, no main commits. Build is green at every commit.

## What changed (per route / dimension)

| Route | Dimension | Change | Verified | Commit |
|---|---|---|---|---|
| content: prompt | Responsiveness + Design | `.prompt-editor` notes `input[type=text]` had no font set → fell to UA default (~13px, non-Inter): iOS auto-zoom + typography drift. Added `font-family:inherit; font-size:16px`. Textareas keep their inline mono overrides, so only the notes inputs change. | tsc+build green **and** runtime render-harness (built CSS + representative markup): input computed = **16px Inter**; width-ladder @320 `documentElement.scrollWidth == innerWidth` (no overflow); wide table scrolls inside `.table-wrap`; screenshot @375 clean. | `91da8af` |
| what's new | Security | `<iframe srcDoc={preview.html}>` rendered admin-controlled email HTML with **no sandbox** → any script in that HTML executes in the admin origin. Added `sandbox=""`. Scripts + same-origin blocked; HTML/CSS/images still render; the Send action lives outside the frame so nothing is lost. | tsc+build green. CSS review (email previews are static; no JS/forms/same-origin needed). Not runtime-clicked (authed page, no Supabase login this run). | `2678b61` |
| cross-cutting (all routes + CSS) | Design + Security | Read-only audit sweep. Findings: **0** hardcoded hex in CSS/TSX, **0** inline numeric font-sizes (all use `--fs-*` tokens), every `<table>` inside `.table-wrap`, every `target="_blank"` has `rel="noreferrer"`, all `.field` inputs ≥16px. Token/responsive discipline is already strong. | grep audit (read-only) | — |

## Verified how (and what I could NOT verify)
- **Runtime-verified:** the content-prompt input fix, via a render harness that inlined
  the worktree's **built** CSS (`dist/assets/index-*.css`) with representative markup,
  served on a throwaway static server and driven with the preview tools across the width
  ladder. Harness file + temporary launch.json entry were both removed afterward; `git
  diff` on `main`'s `launch.json` is empty and the worktree tree is clean.
- **Could NOT runtime-click:** every authed page (no Supabase login in an autonomous run).
  The iframe-sandbox change is CSS/markup-review + build only. The dev server in
  `.claude/launch.json` points at the **main** repo, not this worktree, so it would not
  exercise worktree changes regardless — hence the inlined-built-CSS harness approach.

## Morning review — risky diffs / human decisions

**Risky diffs:** none. Both commits are 2-line, behavior-preserving CSS/attribute additions.
The only behavior delta worth a glance: `sandbox=""` on the digest preview will also block
in-frame link click-through and form submission — for a static email *preview* this is the
intended hardening, but confirm no one relied on clicking links inside the preview.

**Needs a human decision (see PROGRESS.md → "Needs human review"):**
1. **ContentVoice XSS sink** — `marked.parse → dangerouslySetInnerHTML` is unsanitized.
   Low severity (admin-authored, admin origin) but real. Fix needs a DOMPurify pass with a
   tag allow-list that preserves the `upgradeRenderedHtml` upgrades; left for a human to
   pick the config and re-verify the rendered voice guide.
2. **Dependency advisories reachable from admin** — `ws` (<8.21.0, via supabase-js; low
   real risk in a browser bundle) and `react-router` (6.30.3 → 6.30.4 patch). Both bump the
   shared workspace lockfile and need an authed routing/realtime smoke test, so not applied
   autonomously. Commands in PROGRESS.md.

## How to review
```
git -C .claude/worktrees/admin-hardening log --oneline main..admin-hardening
git diff main...admin-hardening -- apps/admin
```
Two functional commits (`91da8af`, `2678b61`) + the PROGRESS/SUMMARY doc commit.
Re-run `pnpm -C apps/admin exec tsc --noEmit && pnpm -C apps/admin build` to confirm green.
