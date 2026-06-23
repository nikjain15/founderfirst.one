-- Collapse sig_submit_score to a single signature.
--
-- Earlier rollouts added overloads (7-arg → 9-arg → 11-arg) so the worker and
-- DB could deploy in any order. With three overloads live, PostgREST can no
-- longer resolve the call ("could not choose the best candidate function").
-- The worker now always calls the 11-arg version; drop the older two. Extra
-- params default to null, so any historical arg count still resolves cleanly.
--
-- sig_submit_score is worker-only (service_role grant, revoked from public) —
-- nothing else calls it, so dropping the old signatures is safe.

drop function if exists sig_submit_score(uuid,real,int,text[],text,text,boolean);
drop function if exists sig_submit_score(uuid,real,int,text[],text,text,boolean,text,text);
