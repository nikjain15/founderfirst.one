# Edge functions — catalog

> Last verified: 1-Jul-2026 · 43 functions, one line each, derived from each function's header comment and code. Owner: Nik

Who calls each function is tagged as: **user-facing** (apps/app or apps/web with a user JWT),
**admin-gated** (requires the `is_admin()` RPC / admins allowlist), **public** (anon-callable by design),
**cron** (invoked on a schedule — every `cron.schedule(...)` lives in a migration under
[../migrations/](../migrations/)), **OAuth callback**, **webhook** (external service or DB trigger posts
to it, gated by signature or shared secret), or **proxy** (holds a third-party API key server-side).
`verify_jwt` per function is set in [../config.toml](../config.toml).

Email architecture and the full email catalog live in [_shared/EMAIL.md](_shared/EMAIL.md) and
[_shared/EMAIL_REGISTRY.md](_shared/EMAIL_REGISTRY.md) — this file doesn't duplicate them.

## Books write-path (user-facing, JWT + `can_write_org_as` RPC authorization)

| Function | What it does |
|---|---|
| `orgs` | Creates a business or firm org atomically (org + membership + pilot_free subscription in one transaction). |
| `org-settings` | Reads/writes accounting settings (CPA approval gate, home currency, fiscal year start); writes gated to OWNER. |
| `org-data` | GDPR/CCPA self-serve: full JSON export of an org's books (RLS-scoped, no integration tokens) and connection-token erasure. |
| `members` | Membership lifecycle: remove a member or transfer org ownership (owner/firm_admin only, last-owner guard). |
| `invites` | Issues membership or CPA-engagement invites. |
| `invites-accept` | Accepts an invite via token (`accept_invite` RPC). |
| `engagements` | CPA engagement lifecycle: revoke, assign/unassign firm staff to clients. |
| `ledger-accounts` | Creates or edits chart-of-accounts rows. |
| `ledger-entries` | Posts a balanced journal entry, or approves a pending one. |
| `ledger-periods` | Closes or reopens an accounting period (locks/unlocks posting). |
| `ledger-reverse` | Posts a reversing correction that flips every line of a posted entry (append-only ledger, idempotent). |
| `imports` | History-import batch lifecycle: create / add_rows / commit / discard. |
| `categorize` | Penny's categorization loop: propose (rules → grounded inference) and approve (recategorize) for journal entries. |

## Accounting integrations (QuickBooks / Xero)

| Function | What it does | Called by |
|---|---|---|
| `qbo-connect` | Starts the QuickBooks OAuth flow: stores a pending connection with a state nonce, returns the authorization URL. | user-facing |
| `qbo-callback` | QuickBooks OAuth redirect target: validates state, exchanges code for tokens, resolves the company realm, activates the connection, 302s back to the app. | OAuth callback |
| `qbo-import` | Pulls chart of accounts + transactions from QuickBooks into a previewable `import_batch` (staged, not committed). | user-facing |
| `xero-connect` | Starts the Xero OAuth flow (same pending-connection + state-nonce pattern as QBO). | user-facing |
| `xero-callback` | Xero OAuth redirect target: validates state, exchanges code for tokens, lists tenants, activates the connection, 302s back to the app. | OAuth callback |
| `xero-import` | Pulls chart of accounts + bank transactions from Xero into a previewable `import_batch`. | user-facing |

## Email (see [_shared/EMAIL.md](_shared/EMAIL.md) + [_shared/EMAIL_REGISTRY.md](_shared/EMAIL_REGISTRY.md))

| Function | What it does | Called by |
|---|---|---|
| `email-dispatch` | Sends every due scheduled email (built-in + custom rows in `email_schedules`). | cron, hourly (`0 * * * *`), shared-secret gated |
| `signup-confirmation` | Waitlist welcome email; re-checks the address is on the waitlist, idempotent via the `welcome_sends` ledger. | public (anon-callable from the signup island) |
| `admin-welcome` | Sends a one-time welcome email when someone is added to the admins allowlist. | admin-gated (Settings → Admins UI) |
| `changelog-digest` | Weekly sectioned "What's new" digest with a review-then-send gate (remind / preview / send modes). | cron Mondays 13:00 UTC (remind mode) + admin-gated (preview/send) |
| `email-compose` | Drafts email copy via the local Ollama compose-server (over Cloudflare Tunnel). | admin-gated proxy |
| `email-preview` | Renders a draft email template for the admin editor — sends nothing. | admin-gated |
| `email-test` | Sends one test copy of any email (built-in or custom) to a chosen address. | admin-gated |
| `resend-webhook` | Ingests Resend delivery events (delivered/opened/clicked/bounced/complained) into `email_events`. | webhook (Svix HMAC signature verified) |
| `notify-content-change` | Emails all admins (except the author) when a Voice or Prompt version publishes. | webhook (DB trigger via pg_net, shared-secret gated) |

## Content pipeline (admin-gated via `is_admin()`)

| Function | What it does |
|---|---|
| `content-draft` | Step 5: turns a pipeline idea into a brand-voice blog draft + two-host audio script, grounded in the live Penny voice guide; includes the AI editorial judge gate. |
| `content-audio` | Step 6: renders the audio script into a branded MP3 — Kokoro on Fly (primary), Chatterbox (alt), ElevenLabs (fallback). |
| `content-publish` | Step 8: publishes an approved item as a live blog post and schedules the promo email. |
| `content-voice-preview` | Renders a short voice sample with unsaved Voice Studio slider positions for real-time preview. |
| `voice-check` | Critiques draft copy against the live voice guide (Ollama on the Signals host, via compose-server); returns on-voice score, deviations, rewrites. |

## Signals (social listening — design in [tools/signals-worker/SOLUTION.md](../../tools/signals-worker/SOLUTION.md))

| Function | What it does | Called by |
|---|---|---|
| `listening-intake` | Single intake door for Signals posts; inserts via `sig_ingest_item` RPC with dedup on external_url. | webhook (browser extension / API poller, shared-secret gated) |
| `listening-digest` | Daily Signals summary email (top leads, competitor mentions, sourcing-optimizer insights) to all admins; sends only above an intent threshold or weekly floor. | cron, daily 13:00 UTC |

## Analytics & SEO (admin-gated proxies; keys held server-side)

| Function | What it does | Called by |
|---|---|---|
| `ga-proxy` | Proxies the GA4 Data API with GCP service-account credentials for the admin Analytics page. | admin-gated proxy |
| `gsc-proxy` | Proxies the Google Search Console Search Analytics API. | admin-gated proxy |
| `posthog-proxy` | Proxies PostHog's HogQL Query API (read-only queries for the Analytics page). | admin-gated proxy |
| `geo-probe` | Daily multi-engine AI-answer (GEO) visibility probe for buyer-intent questions. | cron, daily 11:00 UTC, shared-secret gated |

## Learning loop & AI infra

| Function | What it does | Called by |
|---|---|---|
| `bandit` | Learning-loop "Act" optimizer: reads per-arm exposures/conversions from PostHog, shifts flag traffic toward winning arms (auto tier only), auto-promotes decisive winners. | cron, daily 12:00 UTC, shared-secret gated |
| `draft-variant` | Drafts learning-loop experiment copy variants, grounded in the live voice guide. | admin-gated |
| `synthesize-insights` | Collects real metrics (PostHog + admin RPCs), synthesizes grounded findings via Claude (Penny Worker fallback), writes `insight_runs` + `insight_actions`. | admin-gated |
| `ai-catalog-sync` | Refreshes the AI model catalog from OpenRouter, enriched with Cloudflare/leaderboard signals. | admin-gated (Sync-catalog button) |

## Shared code

[_shared/](_shared/) holds the helpers every function imports: email send/render (`email.ts`, `send.ts`),
the vendored AI inference module (`inference/`, mirrored from `packages/inference`), the QBO/Xero API
adapters (`qbo.ts`, `xero.ts`), and the email docs linked above.
