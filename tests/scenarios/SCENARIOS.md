# Regression scenario index — automated coverage IDs

Each row names a **permanent automated scenario** (Roadmap §Regression engineer):
a stable ID, what it proves, and the test that owns it. The suite only grows —
do not weaken or delete a scenario without a retro decision.

## W1.3-B · Tax mapping engine

| ID | Proves | Owned by |
|----|--------|----------|
| **W1.3B-MAP** | Trial balance × entity × year → per-form-line amounts via data-driven rules; ties to the books; every account lands on one line **or** the first-class UNMAPPED bucket (never silently dropped). | `apps/app/src/tax/engine.test.ts` (Vitest) + `supabase/tests/tax_mapping_engine_test.sql` (pgTAP: resolution precedence override>rule>unmapped) |
| **W1.3B-M1** | Penny **drafts** book-tax differences (meals 50%, penalties 0%) from seeded line metadata as `status=proposed`; a human approves; only approved rows reach the M-1 summary — never auto-posted. Idempotent re-draft (no dup). | `engine.test.ts` (draftM1Adjustments / scheduleM1) + pgTAP (draft→approve→summary, idempotency) |
| **W1.3B-DRAKE** | Per-suite serializers emit Drake's fixed-column TB import + UltraTax tax-code column (88888 excludes unmapped) + generic CSV/PDF spine; pluggable registry rejects unknown suites. | `engine.test.ts` (serializer golden strings) |
| **W1.3B-EXT** | A **second** jurisdiction/entity (CA-FED T2125) **and** a US state form (US-CA CA_565) map through the identical engine by seed rows alone — zero code change (research §B.8). | pgTAP (§9 extensibility) + `scripts/seed-tax.ts --check` type-fallback lint |
| **W1.3B-ROLE** | Mapping edits + M-1 approval require CPA-role (`can_edit_tax_map_as`); owners read only; all write RPCs are `service_role`-EXECUTE-only (forged-actor P0 closed, ISOTEST). Edits audit-logged. | pgTAP (owner-blocked, grants, audit rows) |
| **W1.3B-LAW** | Forms are year-versioned + effective-dated; `supersede_tax_form` closes the old row and opens the new atomically; `tax_form_in_force` returns old law for old periods, new for new; overlapping active windows are impossible. | pgTAP (§6 effective-dating) |

**Follow-on (not in this card):** `W1.3B-UI` — the CPA mapping-edit surface (stacks
on the app-UI base; this card ships the RPCs it will call).
