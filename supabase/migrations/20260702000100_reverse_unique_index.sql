-- Defense-in-depth for the double-reversal P0 (PR #139): at most one reversal
-- per original at the storage layer, independent of the function-level lock.
--
-- INTEGRATOR (prod apply): errors if duplicate reversals already exist. Real
-- pilot orgs verified clean; only throw-away stress namespaces ([JETEST]/
-- [CATTEST]) carry dups — purge those first (dup scan:
--   select org_id, reverses_id, count(*) from journal_entries
--   where reverses_id is not null group by 1,2 having count(*) > 1;
-- ), then apply.
create unique index if not exists journal_entries_one_reversal_per_original
  on journal_entries (org_id, reverses_id)
  where reverses_id is not null;
