-- [reconcile:cattest] Captured from LIVE prod — repo/prod parity, NOT re-applied here.
-- Idempotent CREATE OR REPLACE reflecting the exact deployed state after the
-- categorization + import stress-test fixes. Control tower backfills schema_migrations.

CREATE OR REPLACE FUNCTION public.merchant_key(p_memo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with norm as (select lower(trim(coalesce(p_memo, ''))) as m),
       toks as (
         select string_agg(t, ' ') filter (where ok) as key
         from (
           select t,
                  bool_and(t !~ '[0-9*]') over (order by ord) and t <> '' as ok
           from norm, regexp_split_to_table(norm.m, '\s+') with ordinality as x(t, ord)
         ) s
       )
  select case
           when key is null or length(key) < 4 then nullif((select m from norm), '')
           else key
         end
  from toks;
$function$;
revoke all on function merchant_key(text) from public;
grant execute on function merchant_key(text) to service_role;
