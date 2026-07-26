-- =============================================================================
-- FounderFirst — AI quality & cost layer: wire the SQL-reconciliation rung on the
-- Insights use case (closes the "reconcile gate never fires in prod" gap).
-- =============================================================================
--
-- The eval library already ships a `source_correct` eval (method
-- sql_reconciliation, check_ref source_correct.v1) — see 20260628140000_ai_evals.
-- Until now it was ONLY attached to `bookkeeping_categorization`, which has no
-- wired reconciler at any call site, so the deterministic SQL-reconciliation rung
-- of the eval ladder never actually ran against a production answer.
--
-- Insights is the first place we can run it for real: synthesize-insights hands
-- the model a FIXED snapshot of {metric,value} datapoints and forbids it from
-- citing anything else. That snapshot IS the underlying record set, so a
-- deterministic reconciler can confirm every cited figure's VALUE matches the
-- snapshot (not merely that the metric label exists — the existing grounding guard
-- only checks the label). This migration attaches `source_correct` to the
-- `insights` use case as an enabled gate; the reconciler is wired in the same
-- change at supabase/functions/synthesize-insights/index.ts. Because the judge
-- fails closed when a sql_reconciliation gate is enabled but no reconciler is
-- supplied (judge.ts), the config change and the call-site wiring MUST ship
-- together — they do.
--
-- `insights` is not flagged `financial`, so `source_correct` is NOT a locked
-- mandatory floor here (ai_eval_is_floor stays false); it is an ordinary enabled
-- gate that an admin can still detach from the "AI · Evals" UI. Effective gates
-- are forced to sample_rate = 1.0 by trg_ai_uce_floor, so it runs on every answer.
--
-- These are GLOBAL config tables (no customer data, D15 does not apply). Idempotent
-- (on conflict do nothing). Review before `supabase db push` (LEARNINGS rule 3);
-- unique timestamp (rule 11).
-- =============================================================================

insert into ai_use_case_evals (use_case, eval_key, position, sample_rate) values
  ('insights', 'source_correct', 15, 1.0)
on conflict (use_case, eval_key) do nothing;
