# Product analytics — capture every interaction, feed product improvement

> Status: **Draft for review** · 6 Jul 2026 · Owner: Nik
> Scope: instrument **every** meaningful interaction across the authed product — owner, CPA, and the
> staff/admin console — with a first-party event pipeline, so we have rock-solid analytics (usage,
> funnels, heatmaps) that directly feed product decisions. First-party (our own DB), privacy-aware,
> no third-party tracker. Design/plan doc — nothing ships until Nik signs off.

## Why
Today the app has **no product analytics** (no event capture, no funnels, no heatmaps). We're making
UX calls from screenshots and intuition. Nik wants the opposite: measure what people actually do —
especially with Penny — across all three lenses, and let the data drive improvements.

## What we capture
Every meaningful interaction, tagged with **lens** (owner / cpa / staff), **surface** (tab/route),
and an **event type**. Illustrative catalog:
- **Navigation** — surface view (which tab/sub-tab), time-on-surface, tab switches.
- **Penny** (the priority) — dock opened/closed, question asked (+ routed intent, not the raw text by
  default), suggestion-chip used, answer received (latency, grounded vs declined), attachment added
  (later, D4), action previewed / confirmed / undone (the operating-agent loop).
- **Core jobs** — categorize approve/undo, import started/committed, invoice created/sent/paid,
  reconcile opened, report viewed/exported, connection added.
- **Clicks/heatmap** — coarse click stream (surface + element key + viewport bucket) to build
  per-surface heatmaps without pixel-level PII.
- **Outcomes/friction** — errors surfaced, empty states hit, dead-ends, rage-clicks.

## Data model (additive)
- `interaction_events` table: `id, org_id, user_id, lens, surface, event_type, target (text key),
  meta jsonb, session_id, ts`. Index on (org_id, ts) and (event_type, ts).
- **No financial values / no raw question text in `meta` by default** — event *shapes*, not book
  contents. A separate opt-in path can capture text for support, clearly flagged.
- **Write**: a batched, fire-and-forget `log_events(jsonb[])` RPC (SECURITY DEFINER, `auth.uid()`),
  callable from the client — same proven pattern as `penny_thread_append`. Client buffers + flushes.
- **Read**: staff-only aggregation RPCs (`is_platform_staff`) — never exposes one tenant's data to
  another; owners/CPAs see their own summaries only where relevant.

## Surfaces that consume it
- **Staff console → Analytics** (deepen the existing module): usage by lens/surface, Penny funnel
  (ask → answer → action → confirm), retention, heatmaps per surface, top friction points.
- **Weekly product loop**: the `/audit` + metrics-review cadence reads these to rank improvements.
- **Owner/CPA** (later): light "your activity" where it helps them, not vanity metrics.

## Heatmaps
Aggregate the click stream by `surface + element key + viewport bucket` → render as a ranked list +
an overlay heat view per surface in the staff console. Element keys are stable `data-analytics`
attributes we add to interactive elements (not brittle CSS paths).

## Privacy & guardrails
- First-party only; no third-party trackers; data stays in our Supabase.
- Per-tenant isolation via RLS; cross-tenant reads gated to `is_platform_staff`.
- Event *shapes* not book contents; PII-minimizing by default; documented retention window.
- Instrumentation must never block the UI (buffered, fire-and-forget, fails silent).
- Honor Do-Not-Track / a future consent flag.

## Build phases
- **A — Pipeline**: `interaction_events` + `log_events` RPC + a tiny client logger (buffer/flush,
  `data-analytics` attributes on key controls) + pgTAP. Instrument Penny + core jobs first.
- **B — Staff Analytics dashboards**: usage + the Penny funnel + friction, in the console.
- **C — Heatmaps**: per-surface element aggregation + overlay view.
- **D — Product loop**: wire into the weekly audit/metrics review; owner/CPA light summaries.

## Open questions for Nik
1. **First-party (this plan) vs a tool** (PostHog/Amplitude)? First-party keeps data in our DB and
   avoids a tracker, but is more to build. I lean first-party for the Penny-specific funnel + tenant
   isolation, optionally a tool later for generic web analytics.
2. **Raw question text** — capture it (better product insight, more PII) or intent-only by default?
   I lean intent-only + explicit opt-in for text.
3. **Priority vs the design-first invoice/Penny-chat rebuilds** — sequence analytics before, after, or
   in parallel with those?
