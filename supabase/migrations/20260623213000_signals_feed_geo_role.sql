-- =============================================================================
-- FounderFirst — Signals: expose geo + role in the Feed (list_sig_items)
-- =============================================================================
--
-- The scorer records geo (us/non_us/unknown) and role (needs_help/
-- offering_services/hiring/other) on sig_scores, but list_sig_items never
-- returned them, so the Feed tab couldn't filter by them. Add both to the
-- return set (params unchanged — the Feed filters client-side). Drop+recreate
-- because the return signature changes.
--
-- Idempotent. Same is_admin() gate.
-- =============================================================================

drop function if exists list_sig_items(text,text,int,int);

create or replace function list_sig_items(
  p_status     text default null,
  p_platform   text default null,
  p_min_intent int default null,
  p_limit      int default 200
)
returns table (
  id            uuid,
  platform      text,
  external_url  text,
  author_handle text,
  title         text,
  body          text,
  posted_at     timestamptz,
  captured_via  text,
  status        text,
  captured_at   timestamptz,
  relevance     real,
  intent        int,
  pain_tags     text[],
  competitor    text,
  geo           text,
  role          text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_items: admin access required'; end if;
  return query
    select i.id, i.platform, i.external_url, i.author_handle, i.title, i.body,
           i.posted_at, i.captured_via, i.status, i.captured_at,
           s.relevance, s.intent, s.pain_tags, s.competitor, s.geo, s.role
    from sig_items i
    left join sig_scores s on s.item_id = i.id
    where (p_status is null or i.status = p_status)
      and (p_platform is null or i.platform = p_platform)
      and (p_min_intent is null or coalesce(s.intent, 0) >= p_min_intent)
    order by i.captured_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

grant execute on function list_sig_items(text,text,int,int) to authenticated;
