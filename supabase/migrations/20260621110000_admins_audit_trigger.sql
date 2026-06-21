-- Audit-logging for the admins allow-list, enforced in the database.
--
-- Previously the client called log_admin_action() separately after each
-- insert/delete on `admins`. That is bypassable: any code path (or future
-- write) that forgets the call, or whose call silently fails, leaves a gap
-- in the audit trail. Moving it into an AFTER trigger makes an audit row a
-- guaranteed side-effect of the mutation itself — it cannot be skipped.

create or replace function public.admins_audit()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_actor text := coalesce(auth.email(), 'system');
begin
  if tg_op = 'INSERT' then
    insert into admin_audit (actor_email, action, target_type, target_id, payload)
      values (v_actor, 'admin.invite', 'admin', new.email,
              jsonb_build_object('added_by', new.added_by));
    return new;
  elsif tg_op = 'DELETE' then
    insert into admin_audit (actor_email, action, target_type, target_id, payload)
      values (v_actor, 'admin.remove', 'admin', old.email, '{}'::jsonb);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_admins_audit on public.admins;
create trigger trg_admins_audit
  after insert or delete on public.admins
  for each row execute function public.admins_audit();
