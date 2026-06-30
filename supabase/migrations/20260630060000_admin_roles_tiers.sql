-- #4 — Admin permission tiers (Super / Editor / Viewer) + fix the roster leak.
--
-- TWO problems this fixes:
--  (a) ROSTER LEAK (audit P1, proven live): `admins` had SELECT `using (true)` →
--      every authenticated tenant user could read the full staff list + is_super.
--      Now scoped to admins only.
--  (b) FLAT ACCESS: every admin could make changes. Now each admin is super /
--      editor / viewer. Viewers can SEE everything (read) but make NO changes;
--      editors can change operational data; supers also manage the admin list.
--
-- Supers: nikjain1588@gmail.com + nik@founderfirst.one. Supers grant editor/viewer
-- to others; a NEW super can only be created by an existing super (admins writes
-- stay is_super()-gated). Existing non-super admins default to VIEWER (least
-- privilege — promote intentionally), matching "not every admin can do changes".

-- ── 1. role column ──────────────────────────────────────────────────────────
do $$ begin
  create type admin_role as enum ('viewer', 'editor', 'super');
exception when duplicate_object then null; end $$;

alter table public.admins
  add column if not exists role admin_role not null default 'viewer';

-- Backfill from the existing is_super flag; everyone else starts as viewer
-- (least privilege — promote intentionally).
update public.admins set role = 'super'  where is_super and role <> 'super';
update public.admins set role = 'viewer' where not is_super and role not in ('editor','super');
-- Explicit grants chosen during the pre-onboarding review:
update public.admins set role = 'editor' where lower(email) = 'lindsaymorin33@gmail.com';

-- nik@founderfirst.one is a super admin (add if missing, else promote).
insert into public.admins (email, added_by, is_super, role)
  values ('nik@founderfirst.one', 'seed:admin-tiers', true, 'super')
  on conflict (email) do update set is_super = true, role = 'super';

-- Keep the is_super column as a synced mirror of role='super' so existing readers
-- (client SUPER gate, is_super()) stay correct no matter which is set.
create or replace function public.admins_sync_is_super() returns trigger
  language plpgsql as $$
begin
  new.is_super := (new.role = 'super');
  return new;
end $$;
drop trigger if exists admins_sync_is_super on public.admins;
create trigger admins_sync_is_super before insert or update on public.admins
  for each row execute function public.admins_sync_is_super();
update public.admins set is_super = (role = 'super');   -- reconcile once

-- ── 2. capability helpers (SECURITY DEFINER → bypass RLS, no recursion) ───────
-- is_super() already exists; redefine it to read the role enum (authoritative).
create or replace function public.is_super() returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.admins
                 where lower(email) = lower(coalesce(auth.email(), '')) and role = 'super');
$$;

-- May this admin make changes? (editor or super). Viewers are read-only.
create or replace function public.is_admin_editor() returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.admins
                 where lower(email) = lower(coalesce(auth.email(), '')) and role in ('editor','super'));
$$;
revoke all on function public.is_admin_editor() from public;
grant execute on function public.is_admin_editor() to authenticated, service_role;

-- ── 3. fix the roster leak: only admins may read the admin list ───────────────
drop policy if exists "admins_select_authenticated" on public.admins;
create policy "admins_select_admins"
  on public.admins for select to authenticated
  using (public.is_admin());
-- Make the table-level read grant explicit (the early admins table relied on
-- Supabase default privileges; be self-contained so a fresh replay matches prod).
-- RLS (admins_select_admins) still restricts the visible rows to admins only.
grant select on public.admins to authenticated;

-- Role changes (incl. promoting to super) are super-only. insert/delete already
-- require is_super(); add the missing UPDATE policy so editors/viewers can't
-- escalate themselves or anyone else.
drop policy if exists "admins_update_super" on public.admins;
create policy "admins_update_super"
  on public.admins for update to authenticated
  using (public.is_super()) with check (public.is_super());

-- ── 4. tier every EXISTING admin WRITE policy: writes need editor, reads don't ─
-- Generic, one-shot transform over the live policy set:
--   • insert/update/delete policies → AND-in is_admin_editor()
--   • FOR ALL policies → split into a SELECT (any admin) + insert/update/delete
--     (editor) so viewers keep read but lose write.
-- Skips `admins` (super-gated above) and any policy that also references a
-- user-self predicate (none today; guarded for safety). NOTE: future admin write
-- policies should reference public.is_admin_editor() directly, not is_admin().
do $$
declare r record; roles text;
begin
  for r in
    select c.relname tbl, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) q,
           pg_get_expr(p.polwithcheck, p.polrelid) w,
           coalesce(nullif(array_to_string(array(
             select rolname from pg_roles where oid = any(p.polroles)), ', '), ''), 'authenticated') roles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname <> 'admins'
      and p.polcmd in ('a','w','d','*')
      and ( pg_get_expr(p.polqual,p.polrelid)     ilike '%is_admin()%'
         or pg_get_expr(p.polwithcheck,p.polrelid) ilike '%is_admin()%')
      and coalesce(pg_get_expr(p.polqual,p.polrelid),'')      not ilike '%auth.uid%'
      and coalesce(pg_get_expr(p.polqual,p.polrelid),'')      not ilike '%auth.email%'
      and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') not ilike '%auth.uid%'
      and coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') not ilike '%auth.email%'
  loop
    roles := r.roles;
    if r.polcmd = 'a' then          -- INSERT (with check only)
      execute format('drop policy %I on public.%I', r.polname, r.tbl);
      execute format('create policy %I on public.%I for insert to %s with check ((%s) and public.is_admin_editor())',
                     r.polname, r.tbl, roles, coalesce(r.w, r.q, 'true'));
    elsif r.polcmd = 'w' then       -- UPDATE (using + check)
      execute format('drop policy %I on public.%I', r.polname, r.tbl);
      execute format('create policy %I on public.%I for update to %s using ((%s) and public.is_admin_editor()) with check ((%s) and public.is_admin_editor())',
                     r.polname, r.tbl, roles, coalesce(r.q,'true'), coalesce(r.w, r.q, 'true'));
    elsif r.polcmd = 'd' then       -- DELETE (using only)
      execute format('drop policy %I on public.%I', r.polname, r.tbl);
      execute format('create policy %I on public.%I for delete to %s using ((%s) and public.is_admin_editor())',
                     r.polname, r.tbl, roles, coalesce(r.q,'true'));
    else                            -- FOR ALL → split: read (any admin) + write (editor)
      execute format('drop policy %I on public.%I', r.polname, r.tbl);
      execute format('create policy %I on public.%I for select to %s using (%s)',
                     r.polname, r.tbl, roles, coalesce(r.q,'true'));
      execute format('create policy %I on public.%I for insert to %s with check ((%s) and public.is_admin_editor())',
                     left(r.polname,55)||'_wins', r.tbl, roles, coalesce(r.w, r.q, 'true'));
      execute format('create policy %I on public.%I for update to %s using ((%s) and public.is_admin_editor()) with check ((%s) and public.is_admin_editor())',
                     left(r.polname,55)||'_wupd', r.tbl, roles, coalesce(r.q,'true'), coalesce(r.w, r.q, 'true'));
      execute format('create policy %I on public.%I for delete to %s using ((%s) and public.is_admin_editor())',
                     left(r.polname,55)||'_wdel', r.tbl, roles, coalesce(r.q,'true'));
    end if;
  end loop;
end $$;
