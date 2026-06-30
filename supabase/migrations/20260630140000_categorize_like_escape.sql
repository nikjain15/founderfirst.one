-- Fix (audit: like-wildcard-rule-poison, P1): the learned-rule matcher did an
-- UNESCAPED LIKE on the transaction description, so a stored description_contains
-- rule whose match_value contained % or _ acted as a wildcard — a value of '%'
-- matched EVERY future transaction, letting one auto-learned/poisoned rule hijack
-- all subsequent categorization.
--
-- Escape the stored match_value's LIKE metacharacters (\ % _) at MATCH time with
-- an explicit ESCAPE clause. This neutralises existing and future rule values with
-- no data backfill, and leaves the description_exact path (which uses "=") intact.

create or replace function match_categorization_rule(p_org uuid, p_description text)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from categorization_rules
   where org_id = p_org and is_active and p_description is not null
     and ( (match_type = 'description_exact'    and lower(trim(p_description)) = match_value)
        or (match_type = 'description_contains' and lower(p_description) like
              '%' || replace(replace(replace(match_value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
              escape '\') )
   order by (match_type = 'description_exact') desc, times_applied desc, created_at asc
   limit 1;
$$;

revoke all on function match_categorization_rule(uuid, text) from public;
grant execute on function match_categorization_rule(uuid, text) to service_role;
