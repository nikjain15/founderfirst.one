-- CENTRAL-2 — filing_obligations law-lifecycle helpers (Roadmap principle 3c).
--
-- Two functions the loader + the LOOP-2 regulatory watcher use so a law change is
-- always a NEW superseding row, never an overwrite:
--
--   supersede_filing_obligation(...)  — close the current active row (set its
--     effective_to) and insert the new rule with a later effective_from, in ONE
--     transaction. The one-active partial unique index (schema migration) makes a
--     half-done supersede impossible: you cannot leave two open rows.
--
--   filing_obligations_for(jurisdiction, entity, tax_year, as_of)  — the ONLY way
--     apps look up a due date: returns the row in force AS OF a date. OLD periods
--     (as_of inside the old window) get old law; NEW periods get the superseding
--     row. Apps never read a literal — they call this (principle 3c step 2).
--
-- SECURITY: supersede is service_role only (seed loader / watcher). The lookup is
-- a pure read, safe for authenticated.

create or replace function public.supersede_filing_obligation(
  p_jurisdiction_code text,
  p_entity_type       text,
  p_tax_year          int,
  p_obligation_key    text,
  p_effective_from    date,        -- when the NEW rule takes effect (old row's effective_to = this - 1 day)
  p_new               jsonb,       -- {kind, form_code, label, due_month, due_day, due_year_offset, threshold_minor, notes}
  p_citation          text,
  p_source            text default 'seed'
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  -- close the current active row (if any) the day before the new rule starts.
  update public.filing_obligations
     set effective_to = p_effective_from - 1
   where jurisdiction_code = p_jurisdiction_code
     and entity_type       = p_entity_type
     and tax_year          = p_tax_year
     and obligation_key    = p_obligation_key
     and effective_to is null
     and is_active
  returning id into v_old_id;

  insert into public.filing_obligations (
    jurisdiction_code, entity_type, tax_year, obligation_key,
    kind, form_code, label, due_month, due_day, due_year_offset, threshold_minor, notes,
    effective_from, effective_to, citation, source
  ) values (
    p_jurisdiction_code, p_entity_type, p_tax_year, p_obligation_key,
    coalesce(p_new->>'kind', 'other'),
    p_new->>'form_code',
    coalesce(p_new->>'label', p_obligation_key),
    (p_new->>'due_month')::int,
    (p_new->>'due_day')::int,
    coalesce((p_new->>'due_year_offset')::int, 1),
    nullif(p_new->>'threshold_minor','')::bigint,
    p_new->>'notes',
    p_effective_from, null, p_citation, p_source
  ) returning id into v_new_id;

  return v_new_id;
end $$;

revoke all on function public.supersede_filing_obligation(text,text,int,text,date,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.supersede_filing_obligation(text,text,int,text,date,jsonb,text,text) to service_role;

-- The lookup apps MUST use — never a hardcoded date. Returns the obligation in
-- force as of a given date (defaults to today). This is what makes "old periods
-- compute under old law" true: pass an as_of inside the old window → old row.
create or replace function public.filing_obligations_for(
  p_jurisdiction_code text,
  p_entity_type       text,
  p_tax_year          int,
  p_as_of             date default current_date
) returns setof public.filing_obligations
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select distinct on (obligation_key) *
    from public.filing_obligations
   where jurisdiction_code = p_jurisdiction_code
     and entity_type       = p_entity_type
     and tax_year          = p_tax_year
     and is_active
     and effective_from <= p_as_of
     and (effective_to is null or effective_to >= p_as_of)
   order by obligation_key, effective_from desc;
$$;

grant execute on function public.filing_obligations_for(text,text,int,date) to authenticated, anon, service_role;

comment on function public.filing_obligations_for is
  'The ONLY sanctioned way apps read a filing due date/threshold: returns the law-row in force as of a date. Old periods -> old law, new periods -> superseding row (Roadmap 3c). Never hardcode a deadline in app code.';
