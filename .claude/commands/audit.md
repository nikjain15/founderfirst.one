---
description: Full-surface audit of FounderFirst (IA/UX, design-system, responsive, a11y, security, data, perf, copy-drift) with findings logged to LEARNINGS.md
---

# /audit — full-surface health check

You are running a recurring, full-sweep audit of the FounderFirst monorepo so we
catch regressions early and **stop repeating mistakes**. Optional scope filter:
"$ARGUMENTS" (e.g. `admin`, `security`, `marketing`). If empty, audit EVERYTHING.

## 0. Ground yourself first — mandatory
Read, in order, before judging anything:
- `CLAUDE.md` — guardrails, responsive standard, the "Don't" list
- `LEARNINGS.md` — every rule here is a past mistake. If the audit re-finds a
  known issue, cite the rule number; a recurrence means the rule isn't landing.
- `apps/admin/RESPONSIVE.md` — the width ladder + breakpoints
- `packages/design-system/tokens.css` — the ONLY source of color/type/radius tokens
Then note the current state: `git log --oneline -1` and `git log --oneline -20`
(what changed since the last audit deserves the closest look).

## 1. Surfaces (full sweep)
- **apps/admin** — React SPA at `/admin`
- **apps/marketing** — Vite landing site
- **apps/blog** — VitePress
- **site-bubble/bubble** — Penny chat widget (Shadow-DOM isolated)
- **site-bubble/worker** + Discord concierge — Cloudflare/Fly runtime
- **supabase/** — migrations, edge functions, RLS
- **tools/** — Signals worker and scripts

## 2. Dimensions — apply each to every relevant surface
Fan out: run PARALLEL subagents (one per surface, or per dimension) to collect
findings, then **verify each finding by opening the file** before reporting it —
never assert from a single grep (LEARNINGS: "verify claims against real data").

1. **IA / UX coherence** — nav depth, duplicated destinations, dead/stub tabs,
   orphan routes, confusing labels. Target: ≤4 primary admin tabs + a Settings
   menu (see the admin-IA memory).
2. **Design-system adherence** — NO inline hex/`rgba()`, NO magic px font-sizes,
   NO CSS vars that don't resolve in `tokens.css`, icons via shared components
   not emoji/glyphs. Grep `style={{`, `#[0-9a-fA-F]{3,6}`, `rgba(`,
   `fontSize: ?[0-9]`, and every `var(--…)`; cross-check against tokens.css.
3. **Responsive** — at each width on the ladder
   (320·360·375·414·480·540·640·768·834·1024·1280·1440·1920),
   `document.documentElement.scrollWidth > innerWidth` must be **false**. No
   hardcoded px widths in horizontal layouts; tables inside `.table-wrap`; tap
   targets ≥44px; inputs ≥16px font-size.
4. **Accessibility** — roles/aria, `label`↔input, `:focus-visible`, keyboard
   operability (dropdowns/drawers close on Esc + outside-click), contrast, alt text.
5. **Security** — RLS on every table; SECURITY DEFINER functions scoped; the
   `service_role` key NEVER in a browser bundle; edge-function auth (JWT vs cron
   secret) actually enforced in code; no secrets committed; auth redirect
   allow-list correct.
6. **Data integrity / one source of truth** — duplicated stores that can drift;
   `supabase/migrations/` as the only schema source; no hand-edited squashed dumps.
7. **Copy / docs / self-description drift** — UI copy, READMEs, prompts that name
   tools we no longer use (e.g. Dify) or contradict current behaviour
   (LEARNINGS Rule 7: a capability change isn't done until the system's
   self-description matches it).
8. **Dead code & placeholders** — unused exports, "coming soon" stubs shipped to
   prod, real TODO/FIXME, commented-out blocks.
9. **Performance** — bundle bloat, unoptimised images, N+1 / unindexed queries,
   render waterfalls, missing memoisation on hot paths.
10. **Tests / verification gaps** — critical paths with no coverage; flows only
    checkable by hand.

## 3. Output — a prioritised report
A 5-line executive summary first: counts by severity, the top 3 to fix now, and
any NEW systemic pattern. Then findings grouped by surface, each with:
- **Severity** — P0 (broken / security / data-loss) · P1 (guideline breach, UX
  regression) · P2 (polish)
- `file:line`, the offending snippet, why it matters (cite a LEARNINGS rule # if
  recurring), and the concrete fix + the token/pattern to use instead.

## 4. Score every dimension — feeds the /quality dashboard
Give each of the ten dimensions a **0–100 score** using this fixed formula so
runs are comparable over time:

    score = max(0, 100 − 25·P0 − 8·P1 − 2·P2)   (that dimension's finding counts)

Overall = round(mean of the ten dimension scores). Use these exact dimension
keys: `ia_ux`, `design_system`, `responsive`, `accessibility`, `security`,
`data_integrity`, `copy_docs`, `dead_code`, `performance`, `tests`.

Record the run into the `audit_runs` Supabase table (powers `/quality` —
`apps/admin/src/routes/Quality.tsx`). Insert one row:
`{ commit_sha, overall, dimensions: { <key>: {score,p0,p1,p2}, … }, totals: {p0,p1,p2}, summary, pr_url }`.
Use the `service_role` key (server-side only, never a browser bundle) or an
admin session — RLS allows admin inserts. If credentials aren't available in the
run, skip this insert and note it in the report rather than failing the audit.

## 5. Persist the learnings — the reason we do this regularly
Append to `LEARNINGS.md` under the `## Audit log` section (newest first):
- `### YYYY-MM-DD audit — <short-commit>` followed by the exec summary and a
  one-line entry per P0/P1, marking each **fixed** or **deferred**.
- If a finding is a *repeatable* mistake (not a one-off), PROMOTE it to a
  numbered Rule in the list above — that is how we stop repeating it.
Keep it terse: this file is read at the start of every risky task.

## 6. Guardrails for the audit itself
- **Read-only by default.** Do NOT fix-and-commit during the audit unless the
  user explicitly says so — propose fixes, get a go, then implement in a
  worktree (one task per worktree).
- A full sweep is token-heavy — summarise via subagents, don't dump whole files.
- Leave the working tree as you found it; the only file an audit may write
  unprompted is `LEARNINGS.md` (the audit-log entry).
