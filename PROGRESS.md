# admin-hardening — PROGRESS

Cross-run memory for the autonomous overnight hardening of `apps/admin`.
**Read this first every run. Resume where you left off. Never commit a red build.**

Branch: `admin-hardening` (worktree). Base: `main`.
Status legend: `todo` · `wip` · `done` · `deferred` (see "Needs human review").
Verify column records HOW it was checked (tsc/build/harness@widths/CSS-review). Authed pages cannot be runtime-clicked — note that explicitly.

## Setup checklist (each run)
- [ ] Read CLAUDE.md, LEARNINGS.md, apps/admin/RESPONSIVE.md, packages/design-system/tokens.css
- [ ] `git worktree` is `admin-hardening`; on branch; up to date
- [ ] Read this matrix; pick next `todo`/`wip`

## Dimensions (priority order)
1. Responsiveness · 2. Design/Brand · 3. Security · 4. Architecture · 5. Code quality & scalability

## Route × Dimension matrix

| Route (file) | Resp | Design | Sec | Arch | Quality | Verified how |
|---|---|---|---|---|---|---|
| login (Login.tsx) | todo | todo | todo | todo | todo | |
| support / inbox (Inbox.tsx) | todo | todo | todo | todo | todo | |
| ticket detail (TicketDetail.tsx) | todo | todo | todo | todo | todo | |
| audience (AudienceHome.tsx) | todo | todo | todo | todo | todo | |
| audience: users (Users.tsx) | wip | todo | todo | todo | wip | drawer close-btn tap target 44px (shared CSS); render harness @320 (btn 44×44, no overflow, screenshot). Clickable-row keyboard gap logged (deferred). |
| audience: signals (Signals.tsx) | wip | todo | todo | todo | todo | drawer close-btn tap target 44px (shared `.drawer-head button` CSS) |
| audience: discord (DiscordLinks.tsx) | todo | todo | todo | todo | todo | |
| analytics home (AnalyticsHome.tsx) | todo | todo | todo | todo | todo | |
| analytics: marketing (AnalyticsMarketing.tsx) | todo | todo | todo | todo | todo | |
| analytics: product (AnalyticsProduct.tsx) | todo | todo | todo | todo | todo | |
| analytics: signals (AnalyticsSignals.tsx) | todo | todo | todo | todo | todo | |
| analytics: waitlist (AnalyticsWaitlist.tsx) | todo | todo | todo | todo | todo | |
| content home (ContentHome.tsx) | todo | todo | todo | todo | todo | |
| content: prompt (ContentPrompt.tsx) | done | done | todo | todo | todo | notes-input font fix; runtime harness @320/375 (16px Inter, no overflow) |
| content: voice (ContentVoice.tsx) | todo | todo | wip | todo | todo | marked→dangerouslySetInnerHTML XSS surfaced (deferred, see below) |
| emails (EmailHub.tsx) | todo | todo | todo | todo | todo | |
| how-it-works (HowItWorks.tsx) | todo | todo | todo | todo | todo | |
| what's new (WhatsNew.tsx) | todo | todo | done | todo | todo | iframe srcDoc sandbox=""; tsc+build |
| quality (Quality.tsx) | todo | todo | todo | todo | todo | |
| audit (Audit.tsx) | wip | todo | todo | todo | wip | drawer close-btn tap target 44px (shared CSS). Clickable-row keyboard gap logged (deferred). |
| admins (Admins.tsx) | todo | todo | todo | todo | todo | |

## Change log (append-only; newest first)
<!-- YYYY-MM-DD HH:MM · route · dimension · what changed · commit sha · verify -->
- 2026-06-24 (run 2) · users/signals/audit drawers · Resp(a11y) · `.drawer-head` close button was a 16px SVG icon in a borderless button with no box → ~16px tap target (RESPONSIVE.md rule 4 violation). Replaced the dead `font-size:18px` (vestige of old text "×") with the standard 44×44 inline-flex icon-button box (matches `.nav-toggle`); negative margins keep the icon optically aligned to the drawer edge so the header doesn't grow. Shared CSS class → fixes all three drawers at once. · 233f379 · tsc+build green; render harness with **built** CSS @320: close btn computed = 44×44, `documentElement.scrollWidth==innerWidth` (no overflow), screenshot confirms × aligned to edge + value column wraps long URL.
- 2026-06-24 · cross-cutting · Design/Sec · audit sweep over all routes+CSS: **zero** hardcoded hex in CSS or TSX, every `<table>` is inside `.table-wrap`, every `target="_blank"` carries `rel="noreferrer"`, all `.field` inputs already ≥16px, global `:focus-visible` ring (base.css:29). Codebase token discipline is strong; few real defects. · n/a (read-only) · grep audit
  - **Correction (run 2):** the prior "zero inline numeric font-sizes — every one uses a `--fs-*` token" claim is **inaccurate**. The admin CSS uses raw px font-sizes (13/12/15/16/18/22/24/28px…) as a de-facto convention; only a handful use `--fs-*` tokens, and the token scale (`--fs-h1…--fs-data-row`) is marketing-oriented with no matching `--fs-13`/`--fs-14` etc. **Do NOT mass-tokenize** these — most `--fs-*` tokens are `clamp()` and would change the rendered size (not behavior-preserving). Color tokenization is clean and complete; font-size tokenization is intentionally partial and should be left as-is unless a human re-scopes the token set.
- 2026-06-24 · what's new (WhatsNew.tsx) · Security · added `sandbox=""` to the digest-preview `<iframe srcDoc>` so script in admin-controlled email HTML can't execute in the admin origin; HTML/CSS/images still render, Send button is outside the frame. · 2678b61 · tsc+build green
- 2026-06-24 · content: prompt (ContentPrompt.tsx) · Resp+Design · gave `.prompt-editor input[type=text]` notes fields `font-family:inherit; font-size:16px` (were UA-default ~13px non-Inter → iOS auto-zoom + typo drift). Both textareas keep inline mono overrides. · 91da8af · tsc+build + render harness inspect: input = 16px Inter; width-ladder @320 docScrollW==innerWidth (no overflow), table scrolls inside `.table-wrap`; screenshot @375

## Needs human review (deferred / risky)
<!-- item · why skipped · file:line · suggested action -->
- **Clickable data-table rows are not keyboard-operable** · [routes/Users.tsx:121](apps/admin/src/routes/Users.tsx), [routes/Audit.tsx:106](apps/admin/src/routes/Audit.tsx) · `<tr onClick={…} className="row-clickable">` opens the detail drawer on mouse click but has no `tabIndex`/`onKeyDown`, so keyboard users can't open it (WCAG 2.1.1). · NOT auto-fixed because every clean option has a real downside: `tabIndex={0}` on every row makes a 100s-of-rows waitlist table one giant tab-trap; `role="button"` on a `<tr>` breaks table row semantics for screen readers. The correct fix is a design choice (e.g. make the first cell a real `<button>`, or add a dedicated "view" action column) — needs a human. Mouse + the drawer's own focus ring are unaffected today.
- **`marked.parse` → `dangerouslySetInnerHTML` (stored XSS surface)** · [routes/ContentVoice.tsx:72,353](apps/admin/src/routes/ContentVoice.tsx) · `marked` v5+ does not sanitize; raw HTML/`<script>`/`<img onerror>` in the voice-guide markdown reaches the DOM. Blast radius is limited (content is authored by allow-listed admins → self/compromised-admin XSS, admin origin only), so it's low severity, but it is a real sink. · Not fixed autonomously: the right fix adds a DOMPurify pass (new dep + could strip legitimate voice-guide HTML the `upgradeRenderedHtml` step relies on) — needs a human to choose the sanitizer config and re-verify the rendered voice guide. Suggested: `marked.parse` → `DOMPurify.sanitize(...)` before `upgradeRenderedHtml`, allow-listing the tags the guide actually uses (blockquote/table/ul/strong/em/code/h2/h3/p/a).
- **`pnpm audit` — admin-reachable transitive advisories (dependency bumps, lockfile-wide)** · run `pnpm -C apps/admin audit --prod`:
  - `ws` <8.21.0 (1 high DoS + 1 moderate mem-disclosure) via `@supabase/supabase-js@2.105.1`. **Real-world risk is low in this app**: the admin SPA is a browser build and uses the native `WebSocket`, not the Node `ws` package (only bundled in Node targets). Remediation: bump `@supabase/supabase-js` to a release that pins `ws ≥8.21.0`.
  - `react-router` 6.30.3 → patched **6.30.4** (moderate: same-origin redirect with `//`-prefixed path). Trivial patch bump.
  - Not applied autonomously: both touch the shared pnpm-workspace lockfile (affects demo/marketing too) and routing/realtime can't be fully runtime-verified this run (authed pages). Suggested: `pnpm -C apps/admin update react-router-dom@^6.30.4 @supabase/supabase-js@latest`, then `pnpm -C apps/admin build` + smoke the app while logged in.
  - Note: the other 14 advisories are in `apps/demo` / `apps/marketing` (posthog-js → dompurify) — **out of admin scope**, untouched.
