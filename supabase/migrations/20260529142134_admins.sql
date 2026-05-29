-- Admin allow-list. Membership in this table grants sign-in to the admin app.
-- Only the super admin (nikjain1588@gmail.com) may add or remove rows.

create table if not exists public.admins (
  email      text primary key,
  added_at   timestamptz not null default now(),
  added_by   text
);

alter table public.admins enable row level security;

-- Any authenticated user may read the table. The list of admins is not secret;
-- the client uses this to gate the post-login redirect, and the management UI
-- needs to display existing rows.
drop policy if exists "admins_select_authenticated" on public.admins;
create policy "admins_select_authenticated"
  on public.admins for select
  to authenticated
  using (true);

-- Only the super admin can insert.
drop policy if exists "admins_insert_super" on public.admins;
create policy "admins_insert_super"
  on public.admins for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'nikjain1588@gmail.com');

-- Only the super admin can delete. (No update policy — rows are immutable.)
drop policy if exists "admins_delete_super" on public.admins;
create policy "admins_delete_super"
  on public.admins for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'nikjain1588@gmail.com');

-- Seed.
insert into public.admins (email, added_by) values
  ('nikjain1588@gmail.com', 'seed'),
  ('lindsaymorin33@gmail.com', 'nikjain1588@gmail.com')
on conflict (email) do nothing;
