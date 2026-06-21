-- =============================================================================
-- FounderFirst — Signals: source management (Sources tab)
-- =============================================================================
--
-- The Sources tab needs to delete a source and show how many posts each one
-- has pulled. list_sig_sources + upsert_sig_source already exist (admin RPCs in
-- 20260622100000_signals.sql); this adds delete + a per-source item count.
-- Same conventions: security definer, is_admin() gated, audited.
--
-- Safe to re-run.
-- =============================================================================

create or replace function delete_sig_source(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'delete_sig_source: admin access required'; end if;
  delete from sig_sources where id = p_id;
  perform log_admin_action('sig_source_delete', 'sig_source', p_id::text, '{}'::jsonb);
end;
$$;

-- How many items each source has produced (for the "found" column).
create or replace function sig_source_counts()
returns table (source_id uuid, n bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'sig_source_counts: admin access required'; end if;
  return query
    select i.source_id, count(*)::bigint
    from sig_items i
    where i.source_id is not null
    group by i.source_id;
end;
$$;

grant execute on function delete_sig_source(uuid) to authenticated;
grant execute on function sig_source_counts()     to authenticated;
