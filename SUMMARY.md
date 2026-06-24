# admin-hardening — SUMMARY (runs 2026-06-24)

Autonomous overnight hardening of `apps/admin`. Branch `admin-hardening` (worktree).
Base: `main`. Across runs: **8 safe fixes** committed + 1 cross-cutting audit + a
full CSS responsive sweep. No prod deploys, no migrations, no main commits. Build is
green at every commit.

**Run 5 (latest):** completed a forms accessible-name pass (Quality/a11y). Audited
**every** form control in the admin and found 13 that had only a `placeholder` — or,
in ContentVoice/SliderRow, a *visually* present but programmatically *unassociated*
`<label>`/`<span>` — so assistive tech announced an unnamed field (WCAG 4.1.2 +
3.3.2). Added `aria-label` to each (Users waitlist-search; WhatsNew changelog
title+detail; ContentPrompt prompt-textarea+notes ×2 states; ContentVoice
markdown-source+notes; Signals ad-search, scoring SliderRow `type=range`, ICP
example, always-score phrase). Pure attribute additions — placeholders intact, zero
visual/layout/behavior change. Confirmed the already-labeled controls need no change
(Login/Admins/DiscordLinks/TicketDetail `htmlFor`; the filter/sort selects already
carry `aria-label`; Signals drawer + capture fields already `htmlFor`). Also
corrected the deferred XSS note (marked is **v18** not v5; **DOMPurify is not
installed anywhere in the workspace** — the fix needs a new shared-lockfile dep, so
it stays deferred). Commit `d70fcb7`.

**Run 4:** completed the Responsiveness dimension and an a11y polish pass.
(1) Audited the last three `todo` routes — **audience** (AudienceHome), **discord**
(DiscordLinks), **admins** (Admins). All structurally clean (tables in `.table-wrap`,
`flex-wrap` toolbars, fluid `.field`s, `.tabs` scroll-x with 44px tabs, `.admins-invite`
stacks @≤640). No fix needed → Resp=done; **Responsiveness is now done across every
route**. (2) Completed the static ARIA tab pattern on **all four** tab containers
(Analytics / Content / Audience / EmailHub): they declared `role=tablist`+`role=tab`+
`aria-selected` but tabs had no `aria-controls` and the panel was a bare `<div>`, so AT
announced a tab with no linked tabpanel. Wired tab `id`+`aria-controls` → a `role=tabpanel`
with `aria-labelledby`, and added the missing `type=button` on Analytics/Content/EmailHub.
Pure markup, zero visual/behavior change. Logged two new deferred items (tab roving-tabindex
+ arrow keys; `.link-danger` row-action tap target).

**Run 3:** 2 fixes + completed the CSS responsive sweep.
(1) `.drawer-list` label column was a fixed `140px 1fr` grid (RESPONSIVE.md rule 2) —
made it `minmax(88px,140px) 1fr` and stack @≤480 so long emails/URLs get full width
on phones. Render-harness verified @320/640 against built CSS. Shared CSS → all three
detail drawers. (2) Gave those drawers `role="dialog"` + `aria-labelledby` (pure ARIA,
no behavior change) so screen readers announce a named dialog. Reviewed all 12 admin
stylesheets: the drawer-list grid was the **only** genuine responsive offender — the
rest is already fluid/token-driven; marked those routes Resp=done via CSS review.
Logged one new deferred item: extract a shared `<Drawer>` for full modal a11y
(focus-trap/aria-modal/Escape) — Escape-to-close is unsafe in the Signals drawer
(unsaved edits), so it needs a dirty-state guard (a product decision).

**Run 2:** 1 fix — drawer close-button tap target (a11y/responsive),
shared CSS so it lands on all three detail drawers (Users / Signals / Audit).
Render-harness verified at 320px against the real built CSS. Also corrected an
overstated claim from run 1 (admin CSS is NOT fully font-size-tokenized — that's a
de-facto raw-px convention; mass-tokenizing would change sizes, so it's left alone).
Logged one new deferred item (clickable rows aren't keyboard-operable — needs a
design decision, not a safe autonomous fix).

## What changed (per route / dimension)

| Route | Dimension | Change | Verified | Commit |
|---|---|---|---|---|
| users / whatsnew / content:prompt / content:voice / signals (5 routes) | Code quality (a11y) | Accessible-name pass over all form controls. 13 inputs/textareas + one `type=range` slider had no programmatic accessible name (placeholder-only, or a visible-but-unassociated `<label>`/`<span>` in ContentVoice & the Signals `SliderRow`) → AT announced an unnamed field (WCAG 4.1.2 + 3.3.2). Added `aria-label` to each. Already-labeled controls (Login/Admins/DiscordLinks/TicketDetail `htmlFor`; filter/sort selects' `aria-label`; Signals drawer+capture `htmlFor`) left unchanged. Pure attribute additions — placeholders kept, no visual/layout/behavior delta. | tsc+build green; markup-only ARIA so no visual delta is possible (same verification basis as the prior ARIA commits `f44181f`/`e69b36b`). Authed → not runtime-clicked. | `d70fcb7` |
| analytics / content / audience / emails (4 tab containers) | Code quality (a11y) | Tab bars declared `role=tablist`+`role=tab`+`aria-selected` but tabs had no `aria-controls` and the panel below was a bare `<div>` → AT announced a `tab` with no linked `tabpanel`. Added `id`+`aria-controls` on each tab → a stable `role=tabpanel` (`<route>-tabpanel`) with `aria-labelledby={`tab-${activeTab}`}`; added missing `type=button` on Analytics/Content/EmailHub tab buttons. Pure semantic markup — no class/style/layout/behavior change. Did NOT add roving-tabindex + arrow-key nav (a keyboard-model change → deferred). | tsc+build green at each commit; markup-only so no visual delta is possible. Authed → not runtime-clicked. | `e69b36b`, `ddd31b1` |
| audience / discord / admins (3 routes) | Responsiveness | Audited the last three `todo` routes; all already fluid + token-driven (`.table-wrap` tables, `flex-wrap` toolbars, `flex:1 1 260px` fields, `.tabs` scroll-x + 44px `.tab`, `.admins-invite` stacks @≤640). No code change — marked Resp=done (Admins also Design=done; classes fully token-driven). | CSS review (misc.css/inbox.css/tables.css/content.css). Authed → not runtime-clicked. | — |
| users / signals / audit (shared `.drawer-list` CSS) | Responsiveness | Detail-drawer label column was a fixed `grid-template-columns: 140px 1fr` (RESPONSIVE.md rule 2). On a full-width drawer @320 the value column was squeezed to ~120px, cramping long emails/URLs/ids. → `minmax(88px,140px) 1fr` (caps at 140px on wide drawers, unchanged; shrinks gracefully when tight) + stack to one column @≤480. Shared CSS → all three drawers. | tsc+build green **and** render harness w/ built CSS — @320 row stacks (value = full **271px**, `documentElement.scrollWidth==innerWidth`, close btn 44×44, screenshot), @640 two-col `140px 279px` (wide layout preserved). | `41c8917` |
| users / signals / audit (3 routes) | Responsiveness (a11y) | Detail drawers rendered as a bare `<aside>` — no role, no accessible name. Added `role="dialog"` + `aria-labelledby` (h2 `id="drawer-title"`). Pure ARIA: no layout/focus/JS change; one drawer mounts at a time so the shared id is DOM-unique. Deliberately skipped `aria-modal`/Escape/focus-trap (see Morning review). | tsc+build green. ARIA-only, no runtime click needed; authed page not clicked. | `f44181f` |
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
-1. **Tab bars need roving-tabindex + arrow keys** — run 4 finished the *static* ARIA tab
   semantics; the remaining WAI-ARIA gap (only the active tab in the tab order + Left/Right/Home/End
   focus movement) is a keyboard-model change best designed once in a shared `<Tabs>` primitive and
   click-tested, not bolted onto 4 copies. Today every tab is still Tab-reachable — this is an
   enhancement, not a regression.
-2. **`.link-danger` row-action button is ~30px tall** (< 44px tap target, RESPONSIVE.md rule 4) —
   the Remove/Revoke links in Admins & Discord live in dense `.data-table` rows; forcing 44px would
   inflate every row's height. A design tradeoff (accept denser rows, or move destructive actions into
   the drawer / an overflow menu), not a clear-cut bug — left for a human.
0. **Extract a shared `<Drawer>` component** — the drawer shell is copy-pasted in Users / Signals /
   Audit (learning #6, will drift). A shared component would let `aria-modal`, focus-trap, and
   Escape-to-close be added once. Not done autonomously: it's a 4-file refactor on un-clickable
   authed pages, **and** Escape-to-close would silently discard the Signals lead drawer's unsaved
   edits — that needs a dirty-state guard (product decision). Run 3 shipped the safe subset
   (`role="dialog"` + `aria-labelledby`).
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
Eight functional commits (`91da8af`, `2678b61`, `233f379`, `41c8917`, `f44181f`, `e69b36b`, `ddd31b1`, `d70fcb7`)
+ PROGRESS/SUMMARY doc commits. Re-run `pnpm -C apps/admin exec tsc --noEmit && pnpm -C apps/admin build`
to confirm green.
