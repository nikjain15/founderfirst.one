-- Consolidate the two admin allow-lists into one.
--
-- Two tables held admin membership in parallel:
--   * public.admins      — managed by the admin UI (invite/remove), RLS, the
--                          audit trigger, the is_super flag. The canonical one.
--   * public.admin_users — read ONLY by is_admin(), which gates all 44 RPCs.
--
-- Because invite/remove writes to `admins` but is_admin() checked `admin_users`,
-- a newly-invited admin could sign in yet have every RPC reject them. It only
-- worked because both tables happened to hold the same seed rows. Point
-- is_admin() at `admins` and retire `admin_users`.

-- Safety: carry over any admin_users rows that aren't already in admins.
insert into public.admins (email, added_by)
  select lower(email), added_by from public.admin_users
  on conflict (email) do nothing;

-- is_admin() now reads the canonical table.
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.email(), ''))
  );
$$;

-- Retire the redundant table (also removes its stray anon grants).
drop table if exists public.admin_users;
