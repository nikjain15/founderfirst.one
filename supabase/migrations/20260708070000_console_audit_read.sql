-- Console audit read — surface the platform audit log inside the penny console
-- (deepening the parallel-run console toward founderfirst.one/admin's Audit tab).
-- Same is_platform_staff gate as the rest of the console; founderfirst.one/admin
-- is untouched and stays authoritative. Additive — read-only, no tables changed.

create or replace function staff_list_admin_audit(p_limit int default 200)
returns table (
  id uuid, actor_email text, action text,
  target_type text, target_id text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.actor_email, a.action, a.target_type, a.target_id, a.created_at
  from admin_audit a
  where is_platform_staff()
  order by a.created_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function staff_list_admin_audit(int) from public;
grant execute on function staff_list_admin_audit(int) to authenticated;
