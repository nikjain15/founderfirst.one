-- Categorization is now GATED — proves the `penny_categorize` use case (the
-- string the categorize edge function records under) is registered with its
-- financial floor, so the judge grades every proposal instead of shipping the
-- model's pick ungated. Asserts on ai_runtime_usecase_evals(), exactly what the
-- Deno adapter reads at runtime. Everything rolls back.

begin;
select plan(8);

-- 1) the use case is registered as financial + customer-facing (drives the floor).
select is(
  (select customer_facing::text || ',' || financial::text
     from ai_use_cases where use_case = 'penny_categorize'),
  'true,true',
  'penny_categorize is registered financial + customer-facing'
);

-- 2) the runtime config now returns a floor of gates for it.
select ok(
  (select count(*)::int from ai_runtime_usecase_evals('penny_categorize')) >= 5,
  'penny_categorize has a floor of >=5 evals wired at runtime'
);

-- 3) the SQL-reconciliation "source correct" rung is present …
select is(
  (select method from ai_runtime_usecase_evals('penny_categorize') where eval_key = 'source_correct'),
  'sql_reconciliation',
  'source_correct runs via deterministic SQL reconciliation'
);

-- 4) … as an effective gate …
select is(
  (select effective_kind from ai_runtime_usecase_evals('penny_categorize') where eval_key = 'source_correct'),
  'gate',
  'source_correct is an effective gate on categorization'
);

-- 5) … on every answer (sample_rate 1.0).
select is(
  (select sample_rate from ai_runtime_usecase_evals('penny_categorize') where eval_key = 'source_correct'),
  1.0::numeric,
  'source_correct gates every categorization (sample_rate = 1.0)'
);

-- 6) it is a LOCKED mandatory floor (financial) — cannot be silently detached.
select is(
  ai_eval_is_floor('penny_categorize', 'source_correct'),
  true,
  'source_correct is a locked financial floor on categorization'
);

-- 7) the floor guard actually refuses disabling a floor gate (D8).
select throws_ok(
  $$ update ai_use_case_evals set enabled = false
       where use_case = 'penny_categorize' and eval_key = 'source_correct' $$,
  null,
  null,
  'the floor guard refuses disabling source_correct on categorization'
);

-- 8) valid_format (structural completeness) is also wired for categorization.
select is(
  (select count(*)::int from ai_runtime_usecase_evals('penny_categorize') where eval_key = 'valid_format'),
  1,
  'valid_format gate is wired for categorization'
);

select finish();
rollback;
