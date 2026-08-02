# Data retention and deletion

> Last verified: 2 Aug 2026. Owner: Nik.
> Closes finding S-3 in [STAKEHOLDERS.md](STAKEHOLDERS.md) §4a; partially closes S-5.

This page describes what personal data the system stores, how long it keeps it,
and what happens when someone asks for it to be deleted. It does not assert
compliance with any regulation. Legal sign-off is still open and is still gated
on real bookkeeping data flowing (`GUARDRAILS.md`:213).

## Why this file is generated

The retention table below is written by `scripts/check-retention-doc.ts` from the
`RETENTION` constant in `packages/inference/src/core.ts`, which is the same
constant the running code imports. `pnpm check:retention-doc` fails if:

- a rule declares a window with no job named as its enforcer;
- a named job does not appear in a `cron.schedule(...)` call in
  `supabase/migrations/`;
- the table below has drifted from the constant.

That is not decoration. The problem this replaces was specific: `GUARDRAILS.md`
stated a 90-day raw-retention window, `ai_decisions.retain_until` existed with an
index built for the job that would read it, and no such job was ever written.
`grep -rn retain_until` returned nine documents describing behaviour and zero
lines of code performing it. A window could be written down without anything
checking it ran. Now it cannot.

## Retention table

<!-- BEGIN GENERATED: retention-table (scripts/check-retention-doc.ts) -->

| Store | Personal data it holds | Window | At the end of it | Enforced by | Erasure |
| --- | --- | --- | --- | --- | --- |
| `ai_decisions.input / ai_decisions.output` | prompt and completion text; can contain transaction descriptions, merchant names and amounts for any call that did not use inputPolicy 'none' | 90 days | de-identify in place | `ai-decisions-retention-daily` (pg_cron) | ai_erase_tenant() nulls input, output and output_json for the tenant immediately |
| `ai_decisions (all other columns)` | tenant id, use case, model, token counts, cost, latency, gate status. No prompt content once the row is de-identified | no automatic window | nothing automatic | nothing, by design | ai_erase_tenant() deletes the rows outright when hard erasure is requested |
| `penny_site_chats` | anonymous marketing-site chat turns, keyed by session id, for visitors who never joined the waitlist | 90 days | hard delete | `penny-site-chats-purge-daily` (pg_cron) | the purge is a hard delete; there is no per-visitor request path because there is no visitor identity |
| `signup_confirmation_rate_limit` | hashed signup identifiers used for enumeration rate limiting | no automatic window | hard delete | `signup-confirmation-rate-limit-purge` (pg_cron) | rows expire within 6 hours regardless of erasure requests |
| `discord_dm_messages` | Discord direct-message turns and the account link | no automatic window | nothing automatic | nothing, by design | discord_dm_erase() / admin_discord_erase() hard-delete every row for the user |
| `journal_entries, ledger_lines, bank transactions` | small-business financial records | no automatic window | nothing automatic | nothing, by design | not self-serve. Posted entries are an append-only, legally retained financial record; a full org purge is an operator-run, audited path that does not exist yet |

<!-- END GENERATED: retention-table -->

## What "de-identify" means here, and what it does not

At the end of the `ai_decisions` window the row is **de-identified, not deleted**
(D24): `input`, `output` and `output_json` are set to null and the row is stamped
`deidentified = true` with `archived_at`. Cost, latency, token counts and quality
history survive, because those are what make cheaper in-house models trainable
later, and none of them are personal.

## What we keep of a prompt, per call

`resolve()` in `packages/inference/src/core.ts` decides this before the provider
is called. Three states:

| Policy | `ai_decisions.input` | When |
| --- | --- | --- |
| `none` | null | Forced for any use case flagged `financial`. No caller can widen it. Explicitly set on `categorize` and `penny-thread`. |
| `redacted` | patterned identifiers masked | **The default.** Emails, phone numbers, SSN/EIN shapes, card-length digit runs, currency amounts and 6+ digit runs are replaced with markers. |
| `raw` | verbatim | Explicit opt-in, non-financial use cases only. |

The previous default was verbatim storage: `storeInput` defaulted to on, so every
call site that said nothing got the prompt kept in full. For `categorize` that was
merchant names, transaction descriptions and amounts, per tenant, forever.

**The honest limit of `redacted`:** `redactPii()` is pattern matching. It removes
things that have a shape. It cannot remove a merchant name, a counterparty, or a
free-text memo, because those are not patterns. That is exactly why financial use
cases are forced to `none` rather than being allowed to rely on redaction. Do not
read "redacted" as "anonymous".

## Deleting a person's or an organisation's data

| Ask | Path | Reaches |
| --- | --- | --- |
| Erase an org's AI data | `admin_erase_org_ai_data(org_uuid, hard)`, `is_admin()` gated | `ai_decisions` rows for `org:<uuid>` |
| Erase a tenant directly | `ai_erase_tenant(tenant, hard)`, service role only | `ai_decisions` rows for one namespaced tenant, including an `anon:<session>` visitor |
| Erase a Discord user | `discord_dm_erase()` / `admin_discord_erase()` | `discord_dm_messages` plus the account link, hard delete |
| Disconnect an integration | `org-data` edge function, `op: 'disconnect'` | the `external_connections` row |
| Export an org's data | `org-data` edge function, `op: 'export'` | the org's books, tokens excluded |

Soft erasure (the default) nulls every field that can carry personal detail and
stamps `deleted_at`. Hard erasure deletes the rows. Both are scoped to a single
namespaced `tenant_id`.

## What deletion does not reach

This is the part worth reading. Every store below sits outside the database, and
nothing in `supabase/migrations` can erase any of it.

| Store | What lands there | Why erasure misses it | What is in place |
| --- | --- | --- | --- |
| Cloudflare AI Gateway logs | Request and response bodies, so full prompts | A third-party log store with its own retention, not queryable from our database | `core.ts` now sends `cf-aig-collect-log: false` whenever the input policy is not `raw`, so financial and default-path prompts are no longer offered to it. Bodies logged **before** 2 Aug 2026 are still there and are not reachable by any code in this repository. |
| Supabase edge function logs | `slog()` JSON lines, and PostgREST error bodies echoed on a failed `ai_decisions` insert, which can contain row content | Platform-managed log retention | Nothing beyond Supabase's own retention window. Open. |
| Cloudflare Worker logs | `console.error` from `site-bubble/worker`, including model-call failures | Platform-managed | Open. |
| Fly.io logs (Discord bridge) | Relay diagnostics | Platform-managed | Open. |
| PostHog | Product analytics events | Third party, deletion is via PostHog's own person-deletion API, which nothing here calls | Consent-gated before identification. No automated deletion path. Open. |
| The de-identified archive | `ai_decisions` rows past their window | Reached by `ai_erase_tenant` because `tenant_id` survives de-identification | Covered. |

`docs/AUDIT.md`:44 requires "a real delete/erase route exists for each store of
personal data". Against that bar, the database is covered and the five log and
analytics sinks above are not. Saying so is the point of this section.

## Cross-references

- Constant: `packages/inference/src/core.ts` → `RETENTION`, `resolveInputPolicy`, `redactPii`
- Tests: `packages/inference/test/retention.ts` (`pnpm check:retention`)
- Doc guard: `scripts/check-retention-doc.ts` (`pnpm check:retention-doc`)
- Migration: `supabase/migrations/20260802140000_sh9_retention_and_erasure.sql`
- Spec: `docs/ai-quality-cost-layer/GUARDRAILS.md` §"Data rules, retention, archive & erasure"
