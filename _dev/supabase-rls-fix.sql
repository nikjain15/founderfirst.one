-- Supabase RLS hardening for the `waitlist` table.
-- Run this in Supabase Dashboard → SQL Editor.
--
-- Problem: the public anon key allows SELECT on every row of `waitlist`,
-- which lets anyone with the key (it's in client HTML) dump every signup
-- email. We replace direct table access with two SECURITY DEFINER RPCs
-- that only return what the site actually needs.

begin;

-- 1. Clean up the audit probe row left behind by the RLS test.
delete from public.waitlist
 where email = 'rls-audit-1777258818@founderfirst.test';

-- 2. Make sure RLS is on.
alter table public.waitlist enable row level security;

-- 3. Drop ALL existing policies on waitlist so we start from a known state.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'waitlist'
  loop
    execute format('drop policy if exists %I on public.waitlist', p.policyname);
  end loop;
end $$;

-- 4. Revoke direct table privileges from anon and authenticated.
--    All access goes through the RPCs below.
revoke all on public.waitlist from anon, authenticated;

-- 5. RPC: sign up. Inserts the row and returns the slug. Handles slug
--    collisions by retrying with a random suffix. If the email already
--    exists, returns the existing slug (mirrors the current client logic).
create or replace function public.signup_to_waitlist(
  p_email        text,
  p_source       text default 'waitlist',
  p_referred_by  text default null,
  p_slug_seed    text default null
) returns table (slug text, already_on_list boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := lower(trim(p_email));
  v_slug    text;
  v_existing text;
  v_attempt int := 0;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  select w.slug into v_existing from public.waitlist w where w.email = v_email;
  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  while v_attempt < 5 loop
    v_slug := coalesce(nullif(p_slug_seed, ''), regexp_replace(split_part(v_email, '@', 1), '[^a-z0-9]', '', 'g'))
              || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    begin
      insert into public.waitlist (email, source, slug, referred_by)
      values (v_email, coalesce(p_source, 'waitlist'), v_slug, p_referred_by);
      return query select v_slug, false;
      return;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
    end;
  end loop;

  raise exception 'could not allocate slug' using errcode = 'P0001';
end;
$$;

revoke all on function public.signup_to_waitlist(text, text, text, text) from public;
grant execute on function public.signup_to_waitlist(text, text, text, text) to anon, authenticated;

-- 6. The existing referral_count RPC should already be SECURITY DEFINER.
--    Confirm anon can execute it (no-op if grant already exists):
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'referral_count'
  ) then
    execute 'grant execute on function public.referral_count(text) to anon, authenticated';
  end if;
end $$;

commit;

-- Verify after running:
--   select * from pg_policies where tablename = 'waitlist';     -- should be empty
--   select has_table_privilege('anon', 'public.waitlist', 'SELECT');  -- false
--   select * from public.signup_to_waitlist('test@example.com'); -- returns slug
