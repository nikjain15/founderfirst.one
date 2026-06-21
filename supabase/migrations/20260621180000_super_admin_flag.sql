-- Make "super admin" a data flag instead of a hardcoded email.
--
-- Previously the only super admin was pinned to 'nikjain1588@gmail.com' in two
-- places: the admins RLS policies (server) and SUPER_ADMIN_EMAIL in the client.
-- Changing it meant editing + redeploying code. Now it's a boolean column on the
-- admins row, so super status can be granted/revoked as data.

alter table public.admins
  add column if not exists is_super boolean not null default false;

-- Preserve the current super admin.
update public.admins set is_super = true where lower(email) = 'nikjain1588@gmail.com';

-- Helper mirrors is_admin(): SECURITY DEFINER so the body bypasses RLS and the
-- policies below can call it without self-referential recursion on admins.
create or replace function public.is_super()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.email(), ''))
      and is_super
  );
$$;

-- Replace the email-pinned insert/delete policies with the flag-based check.
drop policy if exists "admins_insert_super" on public.admins;
create policy "admins_insert_super"
  on public.admins for insert
  to authenticated
  with check (public.is_super());

drop policy if exists "admins_delete_super" on public.admins;
create policy "admins_delete_super"
  on public.admins for delete
  to authenticated
  using (public.is_super());
