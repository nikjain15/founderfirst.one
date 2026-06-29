-- =============================================================================
-- FounderFirst — "What's new" digest: group entries into themed AREAS
-- =============================================================================
--
-- The weekly digest moved from a flat New/Improved/Fixed list to a sectioned,
-- image-rich email. Each entry now belongs to an `area` (the site, the product,
-- smarter Penny, reach + care, under the hood). The changelog-digest Edge
-- Function owns the area registry (labels, section titles, cover images) and
-- groups entries by area at render time.
--
-- This migration is ADDITIVE and re-runnable:
--   1. add changelog_entries.area  (default 'general' — older rows are valid)
--   2. changelog_digest() returns `area` per entry
--   3. refresh the changelog_digest template copy for the new layout
--
-- Apply via the dashboard SQL editor (one migration, no CI) per LEARNINGS rule.
-- =============================================================================

-- 1. area column ------------------------------------------------------------
alter table public.changelog_entries
  add column if not exists area text not null default 'general';

comment on column public.changelog_entries.area is
  'Section bucket for the weekly digest. Keys map to the AREA registry in the '
  'changelog-digest Edge Function (e.g. site, product, penny, reach, infra). '
  'Free-text; unknown/empty areas fall into the catch-all section.';

-- 2. digest RPC — now returns area per entry --------------------------------
create or replace function changelog_digest(p_days int default 7)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'since_days', p_days,
    'count', (
      select count(*) from changelog_entries
      where created_at > now() - make_interval(days => p_days)
    ),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         e.id,
        'kind',       e.kind,
        'area',       coalesce(e.area, 'general'),
        'title',      e.title,
        'body',       e.body,
        'created_at', e.created_at,
        'created_by', e.created_by
      ) order by e.created_at desc)
      from changelog_entries e
      where e.created_at > now() - make_interval(days => p_days)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function changelog_digest(int) from public;
grant  execute on function changelog_digest(int) to service_role;

-- 3. refresh the digest template copy for the sectioned layout --------------
-- Heading stays token-driven (works every week); the energy lives in the
-- stat strip + section covers the function renders.
update public.email_templates
   set heading   = '{n} {thingword} shipped this week.',
       intro     = 'Everything that moved this week, grouped by what it touches — the site, the product, and Penny. Skim the sections, dive where you like.',
       preheader = 'Starting with: {topShipped}.',
       cta_label = 'See it all in the admin'
 where email_key = 'changelog_digest';
