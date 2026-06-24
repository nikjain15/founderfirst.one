# admin-hardening — SUMMARY (runs 2026-06-24)

Autonomous overnight hardening of `apps/admin`. Branch `admin-hardening` (worktree).
Base: `main`. Across runs: **3 safe fixes** committed + 1 cross-cutting audit. No prod
deploys, no migrations, no main commits. Build is green at every commit.

**Run 2 (latest):** 1 fix — drawer close-button tap target (a11y/responsive),
shared CSS so it lands on all three detail drawers (Users / Signals / Audit).
Render-harness verified at 320px against the real built CSS. Also corrected an
overstated claim from run 1 (admin CSS is NOT fully font-size-tokenized — that's a
de-facto raw-px convention; mass-tokenizing would change sizes, so it's left alone).
Logged one new deferred item (clickable rows aren't keyboard-operable — needs a
design decision, not a safe autonomous fix).

## What changed (per route / dimension)

| Route | Dimension | Change | Verified | Commit |
|---|---|---|---|---|
| users / signals / audit (shared `.drawer-head` CSS) | Responsiveness (a11y) | Detail-drawer close button was a 16px SVG icon in a borderless button with **no box** → ~16px tap target (RESPONSIVE.md rule 4). Replaced the dead `font-size:18px` (vestige of the old text "×") with the standard 44×44 inline-flex icon-button box used by `.nav-toggle`; negative margins keep the icon optically aligned to the drawer edge so the header doesn't grow taller. Mouse behavior + the existing `aria-label="Close"` unchanged. | tsc+build green **and** render harness (built `index-*.css` + representative drawer markup) @320: close button computed = **44×44**, `documentElement.scrollWidth==innerWidth` (no overflow), screenshot confirms × aligned to drawer edge and the value column wraps a long URL. | `233f379` |
| content: prompt | Responsiveness + Design | `.prompt-editor` notes `input[type=text]` had no font set → fell to UA default (~13px, non-Inter): iOS auto-zoom + typography drift. Added `font-family:inherit; font-size:16px`. Textareas keep their inline mono overrides, so only the notes inputs change. | tsc+build green **and** runtime render-harness (built CSS + representative markup): input computed = **16px Inter**; width-ladder @320 `documentElement.scrollWidth == innerWidth` (no overflow); wide table scrolls inside `.table-wrap`; screenshot @375 clean. | `91da8af` |
| what's new | Security | `<iframe srcDoc={preview.html}>` rendered admin-controlled email HTML with **no sandbox** → any script in that HTML executes in the admin origin. Added `sandbox=""`. Scripts + same-origin blocked; HTML/CSS/images still render; the Send action lives outside the frame so nothing is lost. | tsc+build green. CSS review (email previews are static; no JS/forms/same-origin needed). Not runtime-clicked (authed page, no Supabase login this run). | `2678b61` |
| cross-cutting (all routes + CSS) | Design + Security | Read-only audit sweep. Findings: **0** hardcoded hex in CSS/TSX, every `<table>` inside `.table-wrap`, every `target="_blank"` has `rel="noreferrer"`, all `.field` inputs ≥16px, global `:focus-visible` ring. Color/responsive discipline is strong. _(Run-2 correction: font-sizes are NOT all tokenized — raw px is the admin convention; see Morning review #4.)_ | grep audit (read-only) | — |

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

**Risky diffs:** none. All three functional commits are small, behavior-preserving CSS/attribute
additions. Two behavior deltas worth a glance:
- `sandbox=""` on the digest preview (run 1) also blocks in-frame link click-through and form
  submission — intended for a static email *preview*, but confirm no one relied on clicking
  links inside the preview.
- The drawer close button (run 2) now occupies a 44×44 box with negative margins (`-10px`) to
  stay edge-aligned. Verified at 320px the negative margin doesn't push past the viewport; sanity-
  check at desktop width too if you want, but the box is centered and the icon is unchanged.

**Needs a human decision (see PROGRESS.md → "Needs human review"):**
1. **Clickable data-table rows aren't keyboard-operable** (Users.tsx, Audit.tsx) — `<tr onClick>`
   with no `tabIndex`/`onKeyDown`. Every clean fix has a downside (mass tab stops vs. broken row
   semantics); needs a design choice (real `<button>` in a cell, or a "view" action column).
2. **ContentVoice XSS sink** — `marked.parse → dangerouslySetInnerHTML` is unsanitized.
   Low severity (admin-authored, admin origin) but real. Needs a DOMPurify pass with a tag
   allow-list that preserves the `upgradeRenderedHtml` upgrades.
3. **Dependency advisories reachable from admin** — `ws` (<8.21.0, via supabase-js; low real risk
   in a browser bundle) and `react-router` (6.30.3 → 6.30.4 patch). Both bump the shared workspace
   lockfile and need an authed routing/realtime smoke test. Commands in PROGRESS.md.
4. **Font-size tokens are intentionally partial** — admin CSS uses raw px font-sizes as a
   convention; the `--fs-*` scale is marketing-oriented (`clamp()`-based) with no matching steps.
   Don't mass-tokenize (it would change rendered sizes). If consistent font tokens are wanted, a
   human should first extend the token set with admin-appropriate flat steps.

## How to review
```
git -C .claude/worktrees/admin-hardening log --oneline main..admin-hardening
git diff main...admin-hardening -- apps/admin
```
Three functional commits (`91da8af`, `2678b61`, `233f379`) + PROGRESS/SUMMARY doc commits.
Re-run `pnpm -C apps/admin exec tsc --noEmit && pnpm -C apps/admin build` to confirm green.
