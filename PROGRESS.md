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
| audience: users (Users.tsx) | todo | todo | todo | todo | todo | |
| audience: signals (Signals.tsx) | todo | todo | todo | todo | todo | |
| audience: discord (DiscordLinks.tsx) | todo | todo | todo | todo | todo | |
| analytics home (AnalyticsHome.tsx) | todo | todo | todo | todo | todo | |
| analytics: marketing (AnalyticsMarketing.tsx) | todo | todo | todo | todo | todo | |
| analytics: product (AnalyticsProduct.tsx) | todo | todo | todo | todo | todo | |
| analytics: signals (AnalyticsSignals.tsx) | todo | todo | todo | todo | todo | |
| analytics: waitlist (AnalyticsWaitlist.tsx) | todo | todo | todo | todo | todo | |
| content home (ContentHome.tsx) | todo | todo | todo | todo | todo | |
| content: prompt (ContentPrompt.tsx) | todo | todo | todo | todo | todo | |
| content: voice (ContentVoice.tsx) | todo | todo | todo | todo | todo | |
| emails (EmailHub.tsx) | todo | todo | todo | todo | todo | |
| how-it-works (HowItWorks.tsx) | todo | todo | todo | todo | todo | |
| what's new (WhatsNew.tsx) | todo | todo | todo | todo | todo | |
| quality (Quality.tsx) | todo | todo | todo | todo | todo | |
| audit (Audit.tsx) | todo | todo | todo | todo | todo | |
| admins (Admins.tsx) | todo | todo | todo | todo | todo | |

## Change log (append-only; newest first)
<!-- YYYY-MM-DD HH:MM · route · dimension · what changed · commit sha · verify -->

## Needs human review (deferred / risky)
<!-- item · why skipped · file:line · suggested action -->
