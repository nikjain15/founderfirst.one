-- Penny thread memory — server-side, per-(org, user) conversation history so
-- Penny "remembers" across tabs AND devices (owner-calm redesign follow-up; the
-- memory substrate for the operating-agent direction). Replaces the device-only
-- localStorage store (ff.penny.thread.<orgId>). Additive: one new table + two
-- RPCs, nothing existing is changed.
--
-- RLS: a user sees and writes ONLY their own messages, and only for orgs they
-- belong to (has_membership). The thread is personal — a CPA and an owner on the
-- same books each keep their own conversation with Penny.

create table if not exists penny_thread_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('you', 'penny')),
  body        text not null check (length(body) between 1 and 8000),
  created_at  timestamptz not null default now()
);

create index if not exists penny_thread_messages_org_user_idx
  on penny_thread_messages (org_id, user_id, created_at);

alter table penny_thread_messages enable row level security;

-- Direct-table access: own rows, member orgs only (defence in depth; the RPCs
-- below are the app's path and re-check membership themselves).
drop policy if exists penny_thread_own_select on penny_thread_messages;
create policy penny_thread_own_select on penny_thread_messages
  for select using (user_id = auth.uid() and has_membership(org_id));

drop policy if exists penny_thread_own_insert on penny_thread_messages;
create policy penny_thread_own_insert on penny_thread_messages
  for insert with check (user_id = auth.uid() and has_membership(org_id));

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- History: this user's messages for an org, oldest→newest (chat order). Capped.
create or replace function penny_thread_history(p_org uuid, p_limit int default 200)
returns table (id uuid, role text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.role, m.body, m.created_at
  from penny_thread_messages m
  where m.org_id = p_org
    and m.user_id = auth.uid()
    and has_membership(p_org)
  order by m.created_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;
revoke all on function penny_thread_history(uuid, int) from public;
grant execute on function penny_thread_history(uuid, int) to authenticated;

-- Append one settled turn; returns the new row id. Membership + role + non-empty
-- body enforced here so a forged actor or a bad payload is refused.
create or replace function penny_thread_append(p_org uuid, p_role text, p_body text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_membership(p_org) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('you', 'penny') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'empty message' using errcode = '22023';
  end if;
  insert into penny_thread_messages (org_id, user_id, role, body)
  values (p_org, auth.uid(), p_role, left(p_body, 8000))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function penny_thread_append(uuid, text, text) from public;
grant execute on function penny_thread_append(uuid, text, text) to authenticated;
