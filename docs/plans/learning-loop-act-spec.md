# Learning Loop — "Act" stage spec

> Status: active · 10 Jul 2026 · Owner: Nik

> The learning loop is **Capture → Synthesize → Surface → Act**. Three stages are live;
> this spec covers the fourth. Authored 28 Jun 2026.

## Where we are
- **Capture** ✅ — PostHog (pageviews, heatmaps, session replay, scroll/dwell, funnels) + GA, consent-gated.
- **Synthesize** ✅ — `supabase/functions/synthesize-insights` (PostHog + RPC metrics → Claude → judged findings).
- **Surface** ✅ — admin Analytics → PostHog tab (pageviews/users/sessions, traffic, top pages, top events).
- **Act** ⬅️ *this spec* — turn insights into **safe, measured changes**.

## Goal
Close the loop: run controlled experiments on marketing copy/structure, shift traffic to
winners, personalize by segment, and attribute lift **per content version** — without ever
auto-changing anything outside an admin-approved set.

## Guardrails (non-negotiable, from GAME_PLAN §7)
Per-experiment policy tier: `auto` / `propose` / `inform`.
- **auto** — bandits may shift traffic among **admin-approved variants** and auto-pick winners.
- **propose** — anything *new* (copy, offers, structural) is AI-drafted but needs **human publish**.
- **never auto** — **pricing, legal, security** changes. Hard-excluded.

## Architecture (lean on what exists)
- **Content versions are the variants.** `content_pages` is already versioned. An experiment
  arm = a content version tagged as an arm. No parallel copy store.
- **PostHog owns assignment + stats** (multivariate feature flags + experiments / Bayesian),
  so we don't reinvent significance testing.
- **Supabase stores** the experiment↔version mapping + the policy tier + lift attribution.
  New tables: `experiments`, `experiment_arms` (→ content_version_id, flag_key, variant_key),
  `experiment_results` (cached arm outcomes for the admin view).
- **Assignment on a static (Astro) site**: the homepage is SSG, so arm assignment is
  client-side via the PostHog JS SDK — a React island reads the flag and swaps the section
  variant. Mitigate flicker with PostHog bootstrap + hide-until-decided (CSS), or move the
  decision to an edge middleware + cookie if flicker is unacceptable.
- **Outcomes already captured**: signup, CTA click, scroll-depth, section dwell → PostHog.
  Define the primary metric per experiment (default: waitlist signup).

## Build order (each shippable)
- **Act-0 — manual A/B rail.** Author 2 variants of one section (content versions), wire a
  PostHog multivariate flag, render the assigned arm client-side, measure signup lift, **promote
  by hand** in admin. Proves the rail end-to-end.
- **Act-1 — AI-drafted variants + experiments tab.** "Draft a variant" in admin reuses the
  `email-compose` + `voice-check` path; N arms; admin **Experiments** tab shows arms, exposures,
  conversion, lift, and Promote/Stop controls. Policy tier defaults to `propose`.
  - **Voice is single-sourced (mandatory).** Auto-drafting pulls the **live admin Voice guide**
    (`/content#voice`) as system context and runs **`voice-check`** on every draft (same soft
    warning used elsewhere) — it must NEVER hardcode tone rules. So when the Voice guide changes,
    every future variant follows automatically; one source of truth for brand voice across emails,
    site copy, Penny, and experiments.
- **Act-2 — bandit.** Scheduled job (or PostHog experiments) auto-shifts rollout % toward the
  leading arm and auto-promotes at a confidence threshold — **only** for `auto`-tier experiments.
- **Act-3 — personalization by segment.** Owner vs CPA, new vs returning, source, device →
  segment-conditioned variants. Attribution rolls up per segment.

## Open decisions
1. **Flicker vs simplicity** — client-side assignment (simple, slight flicker) vs edge/cookie SSR
   (no flicker, more infra). Recommend client-side + bootstrap for Act-0/1.
2. **Stats engine** — PostHog experiments (built-in Bayesian) vs a small custom calc. Recommend PostHog.
3. **Traffic reality** — *current traffic is low (a handful of signups)*. A/B and especially bandits
   need volume to reach significance. **Recommendation: build Act-0/1 now (the rail + AI variants +
   admin tab), but don't run bandits (Act-2) until waitlist traffic supports a powered test.**

## Definition of done (Act-1, the realistic near-term target)
- Admin can create an experiment with 2–N variants of a section (AI-drafted or hand-written),
  start it, watch per-arm signup conversion + lift, and promote the winner to the live content
  version — with pricing/legal/security hard-excluded and a `propose` default.
