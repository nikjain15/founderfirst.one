# FounderFirst — audit rubric

The concrete sub-attributes each `/audit` dimension checks, tailored to this
repo (Vite marketing, React admin SPA, VitePress blog, Preact Penny widget,
Supabase + edge functions, Cloudflare Worker, Fly Discord bridge, Signals
worker). This is the **what to check**; `.claude/commands/audit.md` is the
**how to run**. Every finding is `file:line` + why + fix, severitied P0/P1/P2.

**Severity key:** P0 = broken, security hole, data loss, or silent failure ·
P1 = guideline breach / UX regression / real risk · P2 = polish.
**Score per dimension:** `max(0, 100 − 25·P0 − 8·P1 − 2·P2)`; overall = mean.

---

## Trust cluster — findings here are ALWAYS P0/P1, never P2

### 1. security
- **RLS** enabled on every `public` table; policies exist and are correct for
  each operation; nothing unintentionally world-readable; admin-only tables gated
  by `is_admin()`.
- **SECURITY DEFINER functions** set `search_path`, validate inputs, avoid
  dynamic SQL injection, grant least privilege.
- **`service_role` key** never reaches a browser — grep `apps/*/dist` + source;
  only the `anon` key is client-side. Workers/edge functions hold the service
  key server-side only.
- **Edge-function / worker auth** actually enforced in code, matching intent
  (e.g. changelog digest: `remind`=cron secret, `send`/`preview`=admin JWT;
  `verify_jwt` setting consistent with the in-code check).
- **Secrets hygiene** — none committed (scan for `sbp_`, `sk_`, `service_role`,
  private keys, bearer tokens); `.env*` ignored; rotated via GH secrets / Vault.
- **Server-side authorization** — every privileged RPC re-checks `is_admin()`;
  the UI gate is never the only gate.
- **Injection / XSS** — no unsanitised `dangerouslySetInnerHTML`; user input
  escaped; rendered markdown sanitised.
- **CORS / rate limiting** — worker CORS scoped to known origins; public
  endpoints (waitlist signup, Penny) have abuse protection.
- **Auth redirect allow-list** correct (prod + localhost), no open redirect.
- **Dependencies** — `pnpm audit` shows no high/critical; no risky postinstall.

### 2. privacy
- **Retention disclosed** — anything personal that's stored (Discord DMs after
  `/disconnect`, waitlist data, Penny chat logs) is described in the privacy
  policy; copy matches actual behaviour (LEARNINGS Rule 8).
- **Erasure path** — a real delete/erase route exists for each store of personal
  data, separate from soft-delete/archive.
- **No PII in logs** — emails, Discord handles, message bodies not written to
  `wrangler tail` / `flyctl logs` / console in plaintext beyond what's needed.
- **Minimisation** — only collect fields the product uses; no silent
  fingerprinting; analytics respects consent (cookie banner) before identifying.
- **Consent** — captured before storing personal data; revocable.
- **Third-party data flow** — what leaves to Resend / PostHog / GA / Discord is
  intended and disclosed.

### 3. reliability
- **Every fetch/RPC has three states** — loading, empty, and error — rendered,
  not blank or crashing.
- **Graceful degradation** — a failing *secondary* call never takes a page down
  (pattern: inbox swallows a broken analytics RPC and still renders tickets).
- **No unhandled rejections / floating promises** — awaited or `.catch()`ed;
  worker `waitUntil` used for background work.
- **Idempotent writes** — retries/double-clicks don't double-insert; dedupe keys
  where needed (e.g. one audit row per sign-in).
- **Error boundaries** — routes wrapped so one component crash doesn't white-screen
  the admin.
- **Timeouts / retries** on network calls to flaky externals (Discord, Resend).
- **Optimistic UI rolls back** on failure; forms re-enable after error.

### 4. data_integrity
- **One source of truth** — no two tables/flags/stores meaning the same thing
  (the `admins` vs `admin_users` incident, Rule 6).
- **`supabase/migrations/` authoritative** — no parallel `SCHEMA-*.sql`; schema
  fully in git; no hand-written squashed dumps.
- **Migrations are forward-only & consistent** — every referenced table/column/
  function exists; FKs + `on delete` behaviour intentional; constraints/checks
  present; indexes on hot columns.
- **No orphaned data paths** — every reader and writer routes through the same
  canonical store.

---

## Experience cluster

### 5. performance — REAL BROWSER CHECK
- **Core Web Vitals** via Lighthouse (`web-perf` skill) on marketing home + 2–3
  key admin pages: LCP < 2.5s, INP < 200ms, CLS < 0.1.
- **Bundle** — no unexpectedly large route chunks; code-split heavy routes;
  no duplicate deps.
- **Images** — sized, lazy-loaded, modern formats; no multi-MB hero PNGs.
- **DB queries** — no N+1; indexes on filtered/ordered columns; RPCs return only
  needed columns.
- **Render** — no obvious waterfalls; memoisation on hot lists; no layout thrash.

### 6. responsive — REAL BROWSER CHECK
- **Width ladder** (320·360·375·414·480·540·640·768·834·1024·1280·1440·1920):
  `documentElement.scrollWidth > innerWidth` is **false** at every width.
- **No hardcoded px widths** in horizontal layouts — `clamp()`/`minmax()`/
  `flex-wrap`/`grid auto-fit` instead.
- **Tables** inside `.table-wrap` (scroll + edge fade).
- **Tap targets** ≥ 44×44 (`--tap-min`); **inputs** ≥ 16px (no iOS zoom).
- **Fixed elements** (Penny bubble, cookie banner) don't cover CTAs at any width.
- Breakpoints only where layout must change shape (nav→hamburger).

### 7. accessibility — REAL BROWSER CHECK
- **axe scan** clean on key pages (admin support/audience/quality, marketing,
  Penny widget).
- **Keyboard** — full Tab traversal, visible `:focus-visible`, dropdowns/drawers
  close on Esc + outside-click, no focus traps, logical order.
- **Semantics** — landmarks/roles, `label`↔input association, button vs link
  used correctly.
- **Contrast** — text meets WCAG AA against its token background.
- **Images/icons** — alt text / `aria-hidden` as appropriate.
- **Motion / reduced-motion** respected.

### 8. design_system
- **No inline hex / `rgba()`** — colours come from `tokens.css`.
- **No magic px font-sizes** — `--fs-*` tokens only.
- **No undefined CSS vars** — every `var(--x)` resolves in tokens.css/admin css.
- **Radius / spacing** from tokens, not literals.
- **Icons** via shared `lib/icons` components, not emoji/glyphs.
- **Typography / weights** from `--fw-*`; one type scale.

### 9. ia_ux
- **Primary nav** ≤ 4 tabs + Settings menu; every item leads somewhere real;
  active states correct.
- **No dead/stub/"coming soon"** destinations shipped (the KB stub).
- **No duplicate destinations** — each job has exactly one home (the dup Support
  KPI case); deep-links/redirects wired (`/users → /audience#web`).
- **Labels match content** — tab name, URL, and page agree.
- **No orphan routes** — everything reachable from nav or an intended deep link.
- **Depth** — any task in ≤ 2–3 clicks; sub-tabs not confusingly nested.
- **Consistency** — drawers/toolbars/modals reuse one pattern across pages.
- **States** — helpful empty states, loading states, and destructive-action
  confirmations everywhere they're needed.
- **Orientation** — page title/eyebrow tells you where you are; mobile nav +
  Settings menu reachable.

---

## Operability & hygiene cluster

### 10. observability
- **Error reporting** — client + worker errors surface somewhere a human sees
  (PostHog/console/log), not swallowed silently.
- **Logs reachable** — `wrangler tail` (Worker), `flyctl logs` (bridge) produce
  the expected lines; correlation/ids where useful.
- **Audit trail** — privileged admin actions logged (`log_admin_action`) with
  enough context.
- **Health / alerts** — a way to know the Worker/bridge/Signals worker is down;
  cron jobs report success/failure.

### 11. tests
- **Critical paths covered** — auth gate, waitlist signup RPC, admin RPC
  authorization, Penny message flow, Signals scoring.
- **Tests run & pass** in CI; no perma-skipped specs.
- **Manual-only flows flagged** — anything only checkable by hand is called out
  as a coverage gap.

### 12. copy_docs
- **No stale tool names** — copy/READMEs/prompts don't reference dropped tools
  (e.g. Dify) or contradict current behaviour (Rule 7).
- **Self-description matches behaviour** — Penny's prompt, UI copy, privacy
  policy, How-it-works guide reflect what the system actually does now.
- **READMEs current** — setup/deploy docs match reality; `CLAUDE.md` /
  `LEARNINGS.md` references valid.

### 13. dead_code
- **Unused exports / files** (ts-prune-style) removed or justified.
- **No shipped placeholders** — "coming soon" UI behind flags, not in prod.
- **TODO/FIXME** triaged — real ones tracked, stale ones removed.
- **No large commented-out blocks** or orphaned assets.

### 14. seo
- **Marketing + blog**: unique `<title>` / meta description / canonical per page;
  Open Graph + Twitter card tags; `sitemap.xml` + `robots.txt` present and
  correct; structured data where relevant.
- **Semantic HTML** — one `<h1>`, sensible heading order, `<main>`/`<nav>`.
- **Image alt text** for content images.
- **Admin is `noindex`** — excluded from this dimension (don't penalise it).

---

*Refine a dimension's checklist here when a run surfaces a sub-attribute worth
making explicit. Keep it stack-specific and checkable.*
