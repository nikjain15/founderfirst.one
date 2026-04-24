# Demo — IRS Routing Implementation Notes

*Demo-local mapping between `scenarios.json` category labels and IRS line routing.*
*Companion to `BookKeeping/engineering/categories.v1.json` (the production source of truth).*
*Last updated: 24 April 2026*

---

## What this folder is

The demo at `BookKeeping/demo/` ships `scenarios.json` with transaction data across 20 personas. This folder documents **how those labels map to IRS lines** for any demo surface that displays tax-ready output (P&L, My Books stats, export previews).

**This is a demo-local reference, not the production source of truth.** Production is `BookKeeping/engineering/categories.v1.json`. The demo consumes a subset of that taxonomy — enough for credible on-screen routing without shipping the full export pipeline.

---

## Source-of-truth hierarchy

```
BookKeeping/engineering/categories.v1.json   ← Production source of truth (831 lines)
          ↓ (subset consumed by demo)
BookKeeping/demo/implementation/irs-routing.md   ← Demo-local routing logic (this folder)
          ↓ (applied to data)
BookKeeping/demo/public/config/scenarios.json   ← Demo transaction data
          ↓ (rendered in)
BookKeeping/demo/screens/books.jsx   ← My Books P&L view
```

If a demo component needs to show an IRS line, it reads from this folder. If the labels here diverge from `categories.v1.json`, `categories.v1.json` wins and this folder gets updated.

---

## Files in this folder

| File | Purpose |
|---|---|
| `README.md` | This file. |
| `irs-routing.md` | Exact label → line map for every label in `scenarios.json`. |

---

## What's intentionally left out of the demo

The production `categories.v1.json` includes a lot that the demo does not surface:

- Full SSTB phase-in/phase-out compute for QBI §199A (demo just flags eligibility)
- Form 8829 home office actual-method worksheet (demo uses simplified method only)
- §179 / bonus depreciation / MACRS routing for items over de minimis (demo hand-waves)
- 1099-NEC issuance flow (demo only flags threshold crossings)
- Multi-state sales tax nexus detection (not in demo at all)
- State PTET election detection (not in demo)
- Retirement plan contribution calculators (out of demo scope)
- Accountable plan setup flow for S-Corps (out of demo scope)

These are production features the demo does not attempt to render accurately. Any tax-readiness claim in the demo ("Schedule C-ready in 3 seconds") should surface the caveat "preview — CPA review required before filing."

---

## Color / visual conventions for tax-line surfaces

For any demo screen that displays an IRS line alongside a category:
- Line number displayed as monospace, `color: var(--ink-3)`, small eyebrow-style.
- Category label stays `color: var(--ink)`.
- If a category has an open CPA flag (Q-C3, Q-C4, etc.), append a small amber dot (`background: var(--amber)`) — same treatment as My Books "Needs a look" badge.
- Never show the raw IRS code section in demo surfaces (it's too technical for the Penny user). Save IRC cites for tooltip/help content only.

---

## Verification checklist

Before each demo push that touches IRS labels:

- [ ] Every `scenarios.json` category label has a matching entry in `irs-routing.md`.
- [ ] `grep "Van lease + gas" scenarios.json` returns 0 (the split fix must not regress).
- [ ] `grep "Inventory / COGS" scenarios.json` returns 0 (variant label fix must not regress).
- [ ] Mileage rate displayed in any vehicle-related copy matches `categories.v1.json` taxYearConstants for the current year.
- [ ] P04 Marcus "Equipment" $1,840 never shows a depreciation prompt — it's under de minimis.
- [ ] No demo screen ever routes insurance to "Line 18" (that's Retirement plans on Form 1065).

---

## How this folder ships

This folder is **documentation-only**. It is not imported by any `.jsx` screen. The demo does not currently have a "show me the IRS line for this category" surface — when it does (Screen 5 My Books drill-down or Screen 7 Invoice export preview), the routing logic should be driven from a config file that mirrors `irs-routing.md`. Until that surface exists, this folder is a reference for demo devs writing tax-related copy.

## Cross-reference

- `BookKeeping/engineering/categories.v1.json` — production taxonomy
- `BookKeeping/engineering/build-plan-cpa-fixes-apr-2026.md` — audit trail of the 24 April fix pass
- `BookKeeping/product/irs-persona-taxonomy.md` v1.2 — per-persona IRS cards
- `BookKeeping/reviews/irs-taxonomy-cpa-stress-test-apr-2026.md` — full CPA stress test
- `BookKeeping/research/solo-freelancer/irs-tax-research.md` — open research items
