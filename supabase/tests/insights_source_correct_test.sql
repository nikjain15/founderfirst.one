-- Insights SQL-reconciliation rung — proves the `source_correct` eval is now
-- WIRED into the runtime eval config for the `insights` use case, so the judge
-- loads it and (with the reconciler injected at synthesize-insights) the
-- deterministic SQL-reconciliation rung of the ladder fires on a real answer.
--
-- The runtime twin ai_runtime_usecase_evals(use_case) is exactly what the Deno
-- adapter reads (loadEvalDefsDeno → toEvalDefs → judge). Asserting on it proves
-- the production code path picks the gate up. Everything rolls back.

begin;
select plan(6);

-- 1) the runtime config for `insights` now includes source_correct.
select is(
  (select count(*)::int
     from ai_runtime_usecase_evals('insights') r
    where r.eval_key = 'source_correct'),
  1,
  'insights runtime config includes the source_correct eval'
);

-- 2) it is the SQL-reconciliation method (the ladder rung the audit flagged).
select is(
  (select r.method from ai_runtime_usecase_evals('insights') r where r.eval_key = 'source_correct'),
  'sql_reconciliation',
  'source_correct runs via deterministic SQL reconciliation'
);

-- 3) it resolves to a GATE (blocks/records on every answer, not a sampled score).
select is(
  (select r.effective_kind from ai_runtime_usecase_evals('insights') r where r.eval_key = 'source_correct'),
  'gate',
  'source_correct is an effective gate on insights'
);

-- 4) gates are forced to run on EVERY answer (sample_rate = 1.0, D12 invariant).
select is(
  (select r.sample_rate from ai_runtime_usecase_evals('insights') r where r.eval_key = 'source_correct'),
  1.0::numeric,
  'source_correct gate samples every answer (sample_rate = 1.0)'
);

-- 5) the twin only returns ENABLED evals — its presence proves it is enabled.
select is(
  (select r.enabled from ai_runtime_usecase_evals('insights') r where r.eval_key = 'source_correct'),
  true,
  'source_correct is enabled for insights'
);

-- 6) insights is NOT financial, so this gate is an ordinary (detachable) eval,
--    not a locked mandatory floor — admins can still manage it in the UI.
select is(
  ai_eval_is_floor('insights', 'source_correct'),
  false,
  'source_correct is a non-floor gate on insights (detachable by admins)'
);

select finish();
rollback;
