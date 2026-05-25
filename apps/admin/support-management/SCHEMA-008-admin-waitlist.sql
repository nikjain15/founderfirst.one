-- =============================================================================
-- FounderFirst Admin — Waitlist read access (migration 008)
-- =============================================================================
--
-- The anon key has no read access to `waitlist` (see signup_to_waitlist RPC).
-- This migration adds a SECURITY DEFINER RPC that lets admins (per is_admin()
-- from SCHEMA-002) list waitlist rows from the admin app.
--
-- Returns rows as JSONB so admin UI can render whatever columns exist without
-- this migration needing to know the exact schema. Frontend handles display.
--
-- Safe to re-run.
-- =============================================================================

create or replace function admin_list_waitlist(
  p_limit  int default 500,
  p_search text default null
)
returns table (
  row_data    jsonb,
  signed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_list_waitlist: admin access required';
  end if;

  return query
    select
      to_jsonb(w.*)            as row_data,
      w.signed_up_at             as created_at
    from waitlist w
    where p_search is null
       or w.email ilike '%' || p_search || '%'
    order by w.signed_up_at desc
    limit greatest(1, least(p_limit, 5000));
end;
$$;

grant execute on function admin_list_waitlist(int, text) to authenticated;

-- Aggregate: signups per day for the last N days. Used by Analytics > Waitlist.
create or replace function admin_waitlist_daily(p_days int default 30)
returns table (day date, signups bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_waitlist_daily: admin access required';
  end if;

  return query
    select
      (w.signed_up_at at time zone 'UTC')::date as day,
      count(*)                                as signups
    from waitlist w
    where w.signed_up_at >= now() - (greatest(1, least(p_days, 365)) || ' days')::interval
    group by 1
    order by 1;
end;
$$;

grant execute on function admin_waitlist_daily(int) to authenticated;

-- Aggregate: top sources.
create or replace function admin_waitlist_sources()
returns table (source text, signups bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_waitlist_sources: admin access required';
  end if;

  return query
    select
      coalesce(w.source, '(none)') as source,
      count(*)                     as signups
    from waitlist w
    group by 1
    order by 2 desc;
end;
$$;

grant execute on function admin_waitlist_sources() to authenticated;

-- Referral leaderboard: top slugs by people they brought in.
create or replace function admin_waitlist_leaderboard(p_limit int default 10)
returns table (referrer_slug text, referrer_email text, referred_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_waitlist_leaderboard: admin access required';
  end if;

  return query
    select
      r.referred_by                   as referrer_slug,
      max(ref.email)                  as referrer_email,
      count(*)                        as referred_count
    from waitlist r
    left join waitlist ref on ref.slug = r.referred_by
    where r.referred_by is not null
    group by r.referred_by
    order by 3 desc
    limit greatest(1, least(p_limit, 100));
end;
$$;

grant execute on function admin_waitlist_leaderboard(int) to authenticated;

-- =============================================================================
-- End of migration 008.
-- =============================================================================
