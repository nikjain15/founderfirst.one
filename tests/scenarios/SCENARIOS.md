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

## W1.3-C · Fixed-asset & depreciation subledger

| ID | Proves | Owned by |
|----|--------|----------|
| **W1.3C-MACRS** | Penny COMPUTES depreciation to the cent: book straight-line + tax MACRS per asset per year, driven by DATA (effective-dated `asset_classes` + published `macrs_percentages`), never a code literal. A $10,000 5-year 200DB half-year asset yields the IRS Pub 946 Table A-1 schedule (2000/3200/1920/1152/1152/576, sums to cost); mid-quarter Q4 + §179/bonus stacking also verified. | `apps/app/src/tax/depreciation.test.ts` (Vitest golden numbers) + `supabase/tests/fixed_asset_depreciation_test.sql` (pgTAP: `macrs_tax_depreciation_for_year` / `book_depreciation_for_year` golden) |
| **W1.3C-M1** | The book-vs-tax depreciation delta DRAFTS a `tax_adjustment` via W1.3-B's `draft_tax_adjustment` (origin_kind=`depreciation_book_tax`, status=`proposed`, temporary); the delta picks the bucket (tax>book → deduction_on_return_not_books); a proposal never counts until a human approves; re-draft is idempotent — proves asset → schedule → M-1 round-trip. | `depreciation.test.ts` (m1BucketForDelta, net-zero over life) + pgTAP (draft→bucket→idempotency; proposal excluded from `tax_m1_summary`) |
| **W1.3C-POST** | Book depreciation posts a BALANCED journal entry (Dr depreciation expense / Cr accumulated depreciation) through the existing `post_journal_entry` path — period-lock respected (a closed period refuses), idempotent per (asset, year), audit-logged. No parallel posting path. | pgTAP (balanced JE, closed-period refusal `23001`, idempotent re-post) |
| **W1.3C-DISPOSAL** | Disposal computes gain/loss = proceeds − net book value, records the disposal, and marks the asset disposed. | `depreciation.test.ts` (disposalGainLoss gain + loss) + pgTAP (§8 disposal) |
| **W1.3C-LAW** | `asset_classes` + `macrs_percentages` are year-versioned + effective-dated + cited; `supersede_asset_class` + `asset_class_in_force` make an asset compute under the §179/bonus law of its in-service year; overlapping active windows impossible (EXCLUDE); a law change (bonus step-down, §179 bump, new class) is a seed row. | pgTAP (effective-dating) + `scripts/seed-depreciation.ts --check` (MACRS tables sum to 100%, class→table coverage, effective-dating clean) |
| **W1.3C-ROLE** | The p_actor-first write RPCs (`register_fixed_asset`, `compute_depreciation_schedule`, `post_book_depreciation`, `draft_depreciation_m1`, `dispose_fixed_asset`, `supersede_asset_class`) are `service_role`-EXECUTE-only (forged-actor P0 closed, ISOTEST); cross-tenant register refused; every action audit-logged. | pgTAP (§9 grants + cross-tenant refusal) |
