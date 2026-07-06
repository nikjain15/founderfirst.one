-- Console staff reads — real, read-only data for the penny console's Audience /
-- Analytics / Penny modules so they show live data instead of parallel-run
-- placeholders. Same is_platform_staff gate as the rest of the console;
-- founderfirst.one/admin (is_admin RLS) is untouched and stays authoritative.
-- Additive only — no tables/columns/data changed.

-- ── Audience — the web waitlist (read-only, newest first) ─────────────────────
create or replace function staff_list_waitlist(p_limit int default 200)
returns table (email text, source text, referred_by text, signed_up_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.email, w.source, w.referred_by, w.signed_up_at
  from waitlist w
  where is_platform_staff()
  order by w.signed_up_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function staff_list_waitlist(int) from public;
grant execute on function staff_list_waitlist(int) to authenticated;

-- ── Analytics — platform-wide at-a-glance counts ─────────────────────────────
create or replace function staff_platform_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_platform_staff() then jsonb_build_object(
    'orgs',            (select count(*) from organizations),
    'pending_signups', (select count(*) from organizations where approval_status = 'pending'),
    'waitlist',        (select count(*) from waitlist),
    'open_tickets',    (select count(*) from support_tickets where status = 'open'),
    'live_posts',      (select count(*) from blog_posts where is_live),
    'live_pages',      (select count(*) from content_pages where is_live)
  ) else null end;
$$;
revoke all on function staff_platform_stats() from public;
grant execute on function staff_platform_stats() to authenticated;

-- ── Penny — the live content surfaces (published blog posts + site pages) ─────
create or replace function staff_list_content()
returns table (slug text, surface text, kind text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select b.slug, 'blog'::text as surface, 'post'::text as kind, b.created_at as updated_at
      from blog_posts b where b.is_live and is_platform_staff()
    union all
    select c.slug, c.surface, 'page'::text as kind, c.created_at as updated_at
      from content_pages c where c.is_live and is_platform_staff()
  ) rows
  order by updated_at desc nulls last
  limit 200;
$$;
revoke all on function staff_list_content() from public;
grant execute on function staff_list_content() to authenticated;
