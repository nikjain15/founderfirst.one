-- =============================================================================
-- FounderFirst — Signals: admin list/delete for ICP pain examples
-- =============================================================================
--
-- The Keywords tab could add ICP examples but not show existing ones. These two
-- admin RPCs let the UI list them (with embedding status) and remove bad ones.
-- Same conventions as the other admin RPCs in 20260622100000_signals.sql:
-- security definer, is_admin() gated, audited.
--
-- Safe to re-run.
-- =============================================================================

create or replace function list_sig_icp_examples()
returns table (
  id            uuid,
  body          text,
  has_embedding boolean,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_icp_examples: admin access required'; end if;
  return query
    select e.id, e.body, (e.embedding is not null) as has_embedding, e.created_at
    from sig_icp_examples e
    order by e.created_at desc;
end;
$$;

create or replace function delete_sig_icp_example(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'delete_sig_icp_example: admin access required'; end if;
  delete from sig_icp_examples where id = p_id;
  perform log_admin_action('sig_icp_example_delete', 'sig_icp_example', p_id::text, '{}'::jsonb);
end;
$$;

grant execute on function list_sig_icp_examples()       to authenticated;
grant execute on function delete_sig_icp_example(uuid)  to authenticated;
