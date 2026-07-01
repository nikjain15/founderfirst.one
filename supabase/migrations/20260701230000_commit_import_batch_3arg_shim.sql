-- [reconcile] Recreate the 3-arg commit_import_batch wrapper.
-- 20260701200400 drops the 3-arg; the imports edge fn still calls it (no-limit path),
-- and prod has it live. Recreate so a clean rebuild matches prod. Runs after the 4-arg fold.
create or replace function public.commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid)
 returns import_batches language plpgsql security definer set search_path to 'public'
as $function$
begin
  return commit_import_batch(p_actor, p_org, p_batch, 2147483647);
end$function$;
revoke all on function commit_import_batch(uuid,uuid,uuid) from public;
grant execute on function commit_import_batch(uuid,uuid,uuid) to service_role;
