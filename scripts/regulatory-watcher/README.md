# Regulatory-watcher (LOOP-2)

The scheduled loop routine that turns a **tax-law / deadline change** into **ONE
reviewed, cited, effective-dated seed-diff PR** — never a code sweep, never a
self-merge (Roadmap principle 3c; BACKLOG `## LOOP-2`).

## Why it exists

Law lives in the kernel as **effective-dated data** (`filing_obligations` +
`supersede_filing_obligation()` / `filing_obligations_for()`, CENTRAL-2). Apps
only look up; they never hold a threshold/deadline literal. So a law change is a
**new superseding seed row** — and this routine drafts that row for a human to
review. Old-law rows are never touched, so old periods keep old law (catch-up
mode, filed-year integrity).

## Shape

| File | Role |
|---|---|
| `sources.json` | Watched-source registry (DATA). IRS newsroom, form-instruction pages, state DOR feeds, trade press. `governs` scopes each source to the obligation keys it may speak to. Add a source/jurisdiction = a row. |
| `detect.ts` | **Pure** detection core. `detect(state, signals) → {diffs, skipped}`. Deterministic; the OBBBA replay proves it. All false-positive guards live here (idempotent / no-op / backdated / stale). |
| `consumers.ts` | Affected-consumer map (which surfaces recompute on merge), by obligation kind. |
| `fetch.ts` | Probe layer. Fetches sources for reachability + a content hash; accepts **confirmed** changes via `REG_WATCHER_SIGNALS` (JSON `LawChangeSignal[]`). Does NOT auto-extract from free text (a false positive drafts a WRONG law PR — the most dangerous failure). |
| `pr.ts` | Builds the superseding rows + the `decision-needed` PR body (citation, old→new effective window, affected consumers). |
| `run.ts` | CLI. `--replay <name>`, `--scan [--season] [--open-pr]`. |
| `fixtures/obbba-1099.json` | Replay fixture: the 2026 OBBBA 1099 change ($600→$2,000). |
| `replay-test.ts` | `pnpm check:reg-watcher` — the acceptance test (REG-1). |

## Run it

```bash
pnpm check:reg-watcher                 # replay test (CI gate)
pnpm reg-watcher -- --replay obbba-1099 # show the OBBBA seed-diff + PR body
pnpm reg-watcher -- --scan             # live probe, no signal ⇒ no PR (log only)
REG_WATCHER_SIGNALS='[…]' pnpm reg-watcher -- --scan --open-pr   # draft the PR
```

Scheduled by `.github/workflows/regulatory-watcher.yml` (weekly + daily Jan–Apr).

## Invariants

- **Never self-merges.** Opens a *draft* PR labelled `decision-needed`; a human
  merges. `supersede_filing_obligation()` is `service_role`-only (pgTAP-proven).
- **False-positive-safe.** No confirmed, new, material change ⇒ no PR, log only.
- **Never overwrites old law.** A change is a NEW effective-dated row.
- **No law literals in code.** Thresholds/deadlines live only in the seed JSON.

## Follow-up (decision-needed for Nik)

Turning on automated LLM free-text extraction (with the primary-source
corroboration rule) adds an inference dependency + a false-positive budget — a
product decision, not a builder's call. Until then, confirmed changes come from a
human/agent via `REG_WATCHER_SIGNALS`.
