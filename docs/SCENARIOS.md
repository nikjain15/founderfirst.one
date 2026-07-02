# Regression scenarios — finding/feature → scenario → status

> Status: **active** · 2 Jul 2026 · Owner: Nik

The index REG-1 formalizes: every stress finding and every shipped feature gets a
permanent, named scenario so the product can't silently re-break. Each row maps a
scenario id → where it lives → what it proves. REG-1 will fold these into the
nightly suite; feature cards seed their row here as they land.

| Scenario id | Feature / finding | Scenario file(s) | Proves | Status |
|---|---|---|---|---|
| W1.6-RULEDEL | W1.6 learned-rules management (delete) | `supabase/tests/w16_learned_rules_test.sql` · `apps/app/src/ledger/nav.test.ts` (learned-rules nav) · `apps/app/src/ledger/learnedRules.test.ts` | Owner/full-CPA can delete a learned rule (soft-deactivate, audit-logged); a deleted rule stops being proposed; non-writers (read_only CPA) are forbidden; Rules reachable in ≤3 taps (Categorize/Advanced → Rules → delete); a CAT-F4-poisoned `%` rule is deletable by id and then dead | ✅ landed w/ W1.6 |
