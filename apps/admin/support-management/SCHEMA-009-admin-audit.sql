-- =============================================================================
-- FounderFirst Admin — Audit log (migration 009)
-- =============================================================================
--
-- Records every admin action with full payload. The "rich" version: we keep
-- the actual reply body, topic diff, etc. — not just metadata. This becomes
-- training data later for the learning agent.
--
-- Table: admin_audit
--   id           uuid PK
--   actor_email  text  — auth.email() at write time
--   action       text  — namespaced verb, e.g. "ticket.reply", "auth.sign_in"
--   target_type  text  — "ticket" | "user" | "topic" | "auth" | null
--   target_id    text  — UUID or arbitrary key (text to support both)
--   payload      jsonb — action-specific detail (full body, before/after, etc.)
--   created_at   timestamptz
--
-- RPCs:
--   log_admin_action(action, target_type, target_id, payload) — any signed-in
--     admin can write. Writes their auth.email() automatically.
--   admin_list_audit(p_action?, p_actor?, p_since?, p_limit?) — admin read.
--
-- Safe to re-run.
-- =============================================================================

create table if not exists admin_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_email  text not null,
  action       text not null,
  target_type  text,
  target_id    text,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_admin_audit_created  on admin_audit (created_at desc);
create index if not exists idx_admin_audit_actor    on admin_audit (actor_email, created_at desc);
create index if not exists idx_admin_audit_action   on admin_audit (action, created_at desc);
create index if not exists idx_admin_audit_target   on admin_audit (target_type, target_id);

alter table admin_audit enable row level security;
-- No direct table policies — access via RPCs only.

-- ---- log_admin_action --------------------------------------------------------
create or replace function log_admin_action(
  p_action      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_payload     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_email text;
begin
  if not is_admin() then
    raise exception 'log_admin_action: admin access required';
  end if;

  v_email := coalesce(auth.email(), 'unknown');

  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_email, p_action, p_target_type, p_target_id, coalesce(p_payload, '{}'::jsonb))
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function log_admin_action(text, text, text, jsonb) to authenticated;

-- ---- admin_list_audit --------------------------------------------------------
create or replace function admin_list_audit(
  p_action text  default null,
  p_actor  text  default null,
  p_since  timestamptz default null,
  p_limit  int   default 200
)
returns table (
  id           uuid,
  actor_email  text,
  action       text,
  target_type  text,
  target_id    text,
  payload      jsonb,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_list_audit: admin access required';
  end if;

  return query
    select a.id, a.actor_email, a.action, a.target_type, a.target_id, a.payload, a.created_at
    from admin_audit a
    where (p_action is null or a.action      = p_action)
      and (p_actor  is null or a.actor_email = p_actor)
      and (p_since  is null or a.created_at >= p_since)
    order by a.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

grant execute on function admin_list_audit(text, text, timestamptz, int) to authenticated;

-- ---- Convenience: list distinct actions/actors for filter dropdowns ---------
create or replace function admin_audit_facets()
returns table (actions text[], actors text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_audit_facets: admin access required';
  end if;

  return query
    select
      (select coalesce(array_agg(distinct action      order by action),      '{}') from admin_audit),
      (select coalesce(array_agg(distinct actor_email order by actor_email), '{}') from admin_audit);
end;
$$;

grant execute on function admin_audit_facets() to authenticated;

-- =============================================================================
-- End of migration 009.
-- =============================================================================
