-- =============================================================================
-- FounderFirst — gate the flagship categorization path ("Penny categorizes every
-- transaction"). Registers the `penny_categorize` use case in the eval config and
-- attaches its floor so the judge grades every proposal instead of shipping 100%
-- raw-LLM with no automated check (audit Dims 1/4/6).
-- =============================================================================
--
-- The categorize edge function already runs a rules-first cascade (learned rule /
-- vendor prior before any model) and constrains the model to the org's own chart
-- of accounts. What it lacked was an automated GATE on the model's pick: the only
-- quality bar was the human one-tap confirm. This registers `penny_categorize`
-- (the use_case string the function already records under, kept so the existing
-- categorization_budget accounting on 'penny_categorize' / 'penny_categorize_panel'
-- is untouched) and attaches the floor.
--
-- It is financial + customer_facing, so the mandatory floor (D8) locks on: safety,
-- privacy, source_exists, source_correct, math. On Supabase Edge (Deno, no
-- Workers-AI binding) the deterministic + SQL-reconciliation gates run for real —
-- privacy, source_exists, source_correct (via the injected account-grounding
-- reconciler wired in categorize/index.ts in this same change), math, valid_format
-- — while the llm_judge `safety` gate is recorded deferred (D20: an Anthropic judge
-- can't grade an Anthropic generator). The reconciler must ship with this migration
-- because the judge fails closed on an enabled sql_reconciliation gate with no
-- reconciler — both land together.
--
-- GLOBAL config tables (no customer data, D15 n/a). Idempotent. Review before
-- `supabase db push` (LEARNINGS rule 3); unique timestamp (rule 11).
-- =============================================================================

-- Register the use case (financial + customer-facing → full floor applies).
insert into ai_use_cases (use_case, label, customer_facing, financial) values
  ('penny_categorize', 'Penny categorization', true, true)
on conflict (use_case) do nothing;

-- Attach the eval selection. Gates first (criticality order); consistent sampled.
-- Floor evals (safety, privacy, source_exists, source_correct, math) are locked
-- enabled+gate by trg_ai_uce_floor once financial/customer_facing are set above.
insert into ai_use_case_evals (use_case, eval_key, position, sample_rate) values
  ('penny_categorize', 'safety',         10, 1.0),
  ('penny_categorize', 'privacy',        20, 1.0),
  ('penny_categorize', 'source_exists',  30, 1.0),
  ('penny_categorize', 'source_correct', 40, 1.0),
  ('penny_categorize', 'math',           50, 1.0),
  ('penny_categorize', 'valid_format',   60, 1.0),
  ('penny_categorize', 'consistent',     70, 0.20)
on conflict (use_case, eval_key) do nothing;
