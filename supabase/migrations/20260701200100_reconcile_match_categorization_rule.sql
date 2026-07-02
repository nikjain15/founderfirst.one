-- [reconcile:cattest] Captured from LIVE prod — repo/prod parity, NOT re-applied here.
-- Idempotent CREATE OR REPLACE reflecting the exact deployed state after the
-- categorization + import stress-test fixes. Control tower backfills schema_migrations.

CREATE OR REPLACE FUNCTION public.match_categorization_rule(p_org uuid, p_description text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select account_id from categorization_rules
   where org_id = p_org and is_active and p_description is not null
     and ( (match_type = 'description_exact'    and lower(trim(p_description)) = match_value)
        or (match_type = 'description_contains' and lower(p_description) like
              '%' || replace(replace(replace(match_value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
              escape '\') )
   order by (match_type = 'description_exact') desc, length(match_value) desc, times_applied desc, created_at asc
   limit 1;
$function$;
revoke all on function match_categorization_rule(uuid,text) from public;
grant execute on function match_categorization_rule(uuid,text) to service_role;
