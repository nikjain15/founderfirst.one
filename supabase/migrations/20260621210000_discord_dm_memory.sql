-- Short-term conversation memory for Penny on Discord.
--
-- The Discord DM handler was stateless: each message was answered with only
-- the long-term ticket context + the single new message, so Penny forgot what
-- was said two messages ago. This adds rolling memory at bounded token cost:
--   * discord_dm_messages — every turn (user + bot), kept verbatim until folded
--   * discord_dm_memory   — one rolling summary per user of older, folded turns
-- The Worker sends: system prompt + summary (cached prefix) + last N verbatim
-- turns + the new message. When the verbatim window overflows, older turns are
-- summarized into discord_dm_memory and deleted, so per-reply size stays flat.
--
-- Only the Worker (service key, bypasses RLS) reads/writes these. RLS is on with
-- no policies so nothing else can touch them.

create table if not exists public.discord_dm_messages (
  id              bigint generated always as identity primary key,
  discord_user_id text not null,
  author          text not null check (author in ('user', 'bot')),
  body            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_discord_dm_messages_user_time
  on public.discord_dm_messages (discord_user_id, created_at);
alter table public.discord_dm_messages enable row level security;

create table if not exists public.discord_dm_memory (
  discord_user_id text primary key,
  summary         text not null default '',
  summary_through timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.discord_dm_memory enable row level security;

-- Load the rolling summary + the last p_limit verbatim turns (chronological).
create or replace function public.discord_dm_load(p_discord_user_id text, p_limit int default 10)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare
  v_summary text;
  v_turns   jsonb;
begin
  select summary into v_summary
    from discord_dm_memory where discord_user_id = p_discord_user_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('author', author, 'body', body) order by created_at),
    '[]'::jsonb
  )
    into v_turns
  from (
    select author, body, created_at
    from discord_dm_messages
    where discord_user_id = p_discord_user_id
    order by created_at desc
    limit greatest(p_limit, 0)
  ) recent;

  return jsonb_build_object('summary', coalesce(v_summary, ''), 'turns', v_turns);
end;
$$;

-- Persist one exchange (user + bot). Returns the new total verbatim count so the
-- Worker knows whether the fold-into-summary threshold was crossed.
create or replace function public.discord_dm_append(
  p_discord_user_id text, p_user_msg text, p_bot_msg text)
  returns int
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_count int;
begin
  insert into discord_dm_messages (discord_user_id, author, body)
    values (p_discord_user_id, 'user', p_user_msg);
  insert into discord_dm_messages (discord_user_id, author, body)
    values (p_discord_user_id, 'bot', p_bot_msg);
  select count(*) into v_count
    from discord_dm_messages where discord_user_id = p_discord_user_id;
  return v_count;
end;
$$;

-- Store the recomputed rolling summary and drop all but the most recent p_keep
-- verbatim turns (they're now captured in the summary).
create or replace function public.discord_dm_set_summary(
  p_discord_user_id text, p_summary text, p_keep int default 10)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_cutoff timestamptz;
begin
  select created_at into v_cutoff
  from discord_dm_messages
  where discord_user_id = p_discord_user_id
  order by created_at desc
  offset greatest(p_keep - 1, 0) limit 1;

  insert into discord_dm_memory (discord_user_id, summary, summary_through, updated_at)
    values (p_discord_user_id, p_summary, now(), now())
    on conflict (discord_user_id) do update
      set summary = excluded.summary, summary_through = excluded.summary_through, updated_at = now();

  if v_cutoff is not null then
    delete from discord_dm_messages
    where discord_user_id = p_discord_user_id and created_at < v_cutoff;
  end if;
end;
$$;

-- Privacy: purge a user's conversation memory on disconnect.
create or replace function public.discord_dm_purge(p_discord_user_id text)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  delete from discord_dm_messages where discord_user_id = p_discord_user_id;
  delete from discord_dm_memory  where discord_user_id = p_discord_user_id;
end;
$$;
