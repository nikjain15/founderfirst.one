# Screen brief 00 — Seed data (personas, scenarios, industries)

*This is not a screen. It's a data brief. Read it before any screen work that
touches `public/config/personas.json` or `public/config/scenarios.json`.*

---

## What the demo needs from seed data

The demo has to feel *real* to a prospective user in under five minutes.
Real means:

- The business name is plausible for the industry (no "ACME Consulting").
- The transactions are plausible for the entity and the industry.
- The dollar amounts are plausible (a solo designer doesn't spend $4,300
  on a single Adobe invoice).
- The approval-card mix hits all nine variants without feeling staged.

Seed data is how we get there. The demo picks a persona at onboarding,
then every downstream screen reads from that persona's scenario file.

---

## Personas — 20 total

**Shape:** 2 personas per industry × 10 industries = 20 personas.
**Breakdown:** one sole prop + one S-Corp per industry.

This covers the only two entity types the MVP supports on day 1 (per
`product/11-entity-type-and-s-corp.md`). LLC (sole owner → taxed as sole
prop) and LLC (multi-member → partnership) are represented by reusing
the sole prop flow; Partnerships are not in the MVP; C-Corp is not in
the MVP.

### Industries (from `public/config/industries.json`)

1. Consulting
2. Design (graphic / brand / UX)
3. Photography / video
4. Writing / editing
5. Software / dev-as-service
6. Coaching / training
7. E-commerce (physical goods, small)
8. Local service (trades / home services)
9. Wellness (yoga, massage, PT, nutrition)
10. Real estate (solo agent)

### Persona schema

```json
{
  "id": "consulting-solo-sarah",
  "name": "Sarah",
  "business": "Studio Nine",
  "entity": "sole-prop",
  "industry": "consulting",
  "city": "Austin, TX",
  "years_in_business": 3,
  "monthly_revenue_range": [8000, 14000],
  "primary_payment_rail": "stripe",
  "bank": "Chase Business",
  "quirks": [
    "Bills clients monthly retainer + project milestones.",
    "Pays one contractor $800 / month for design help.",
    "Drives to client sites — mileage matters."
  ],
  "voice_notes": "Calm, confident. Doesn't want to be told she's behind."
}
```

### Why two per industry

Variance. A prospective user in consulting should see plausible data
whether they click "sole prop" or "S-Corp". With one persona per
industry we'd force S-Corp users through sole-prop narration and vice
versa — and the S-Corp-specific surfaces (owner's-draw card, payroll
integrations, 1120-S export) would never appear in the consulting
walkthrough.

---

## Scenarios — 20 total

One per persona. Each scenario is a replay-able transaction stream for
the walkthrough.

### Scenario schema

```json
{
  "persona_id": "consulting-solo-sarah",
  "ledger_opening_balance": 7420.15,
  "runway_months": 4.2,
  "events": [
    {
      "at": "2026-04-22T09:03:00Z",
      "type": "card.approval",
      "variant": "expense-simple",
      "vendor": "Notion",
      "amount": -19.00,
      "category_suggestion": "software"
    },
    {
      "at": "2026-04-22T11:18:00Z",
      "type": "card.approval",
      "variant": "income-celebration",
      "payer": "Acme Co",
      "amount": 3500.00,
      "memo": "April retainer"
    }
  ]
}
```

Minimum **8 events** per scenario, covering all 9 card variants across
the 20 scenarios (so the demo exercises every variant at least once no
matter which persona the user picked — but any single walkthrough only
sees 6–10).

### Required variant coverage across the scenario set

| Variant | In at least |
|---|---|
| expense-simple | every scenario |
| income-celebration | every scenario |
| expense-ambiguous | 15 / 20 |
| split-transaction | 10 / 20 |
| rule-proposal | 10 / 20 |
| variable-recurring | 8 / 20 |
| owner-draw (S-Corp only) | every S-Corp scenario |
| mileage | consulting, design, real-estate, local-service scenarios |
| duplicate-flag | 6 / 20 |

---

## What the Claude Code session builds

1. Open `public/config/personas.json`. Replace the 6 stub personas with
   the full 20 described above. Use the schema exactly.
2. Open `public/config/scenarios.json`. Replace the 2 stubs with the
   full 20. Use the schema exactly. Verify variant coverage matches the
   table above.
3. Sanity-check industry values against `public/config/industries.json`.
   If an industry slug doesn't exist there, add it with real-looking
   banks and expense categories.
4. Do **not** add Penny copy anywhere. Seed data is raw facts only.
   Penny's voice comes from the live AI.

---

## What to ask the CEO before starting

Nothing — this brief is complete. If a persona feels implausible to
you, flag it in the commit description rather than inventing around it.
