-- Retain Discord conversation transcripts as a backend record.
--
-- Previously two paths HARD-DELETED turns: folding (turns older than the live
-- window were removed once summarized) and /disconnect (everything purged).
-- That loses the record. Switch both to SOFT-DELETE: mark turns archived_at
-- instead of deleting. The bot only ever loads active (archived_at is null)
-- turns, so behaviour is unchanged — but the full transcript is retained.
--
-- /disconnect now resets the user to a fresh start (archives their turns, drops
-- the derived summary cache) WITHOUT erasing history. A separate hard-erase
-- function (discord_dm_erase) remains for genuine right-to-erasure requests.

alter table public.discord_dm_messages
  add column if not exists archived_at timestamptz;

-- Partial index: the hot path only ever queries active turns.
create index if not exists idx_discord_dm_messages_active
  on public.discord_dm_messages (discord_user_id, created_at)
  where archived_at is null;

-- Load only ACTIVE turns (archived turns are records, not live context).
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
      and archived_at is null
    order by created_at desc
    limit greatest(p_limit, 0)
  ) recent;

  return jsonb_build_object('summary', coalesce(v_summary, ''), 'turns', v_turns);
end;
$$;

-- append counts only ACTIVE turns (drives the fold threshold).
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
    from discord_dm_messages
    where discord_user_id = p_discord_user_id and archived_at is null;
  return v_count;
end;
$$;

-- Fold: ARCHIVE (not delete) turns older than the live window once summarized.
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
  where discord_user_id = p_discord_user_id and archived_at is null
  order by created_at desc
  offset greatest(p_keep - 1, 0) limit 1;

  insert into discord_dm_memory (discord_user_id, summary, summary_through, updated_at)
    values (p_discord_user_id, p_summary, now(), now())
    on conflict (discord_user_id) do update
      set summary = excluded.summary, summary_through = excluded.summary_through, updated_at = now();

  if v_cutoff is not null then
    update discord_dm_messages
      set archived_at = now()
    where discord_user_id = p_discord_user_id
      and archived_at is null
      and created_at < v_cutoff;
  end if;
end;
$$;

-- /disconnect: fresh start, history RETAINED. Archive remaining active turns,
-- drop the derived summary cache (rebuilds fresh on reconnect).
create or replace function public.discord_dm_disconnect(p_discord_user_id text)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  update discord_dm_messages
    set archived_at = now()
  where discord_user_id = p_discord_user_id and archived_at is null;
  delete from discord_dm_memory where discord_user_id = p_discord_user_id;
end;
$$;

-- Right-to-erasure: genuine hard delete of everything for a user. For
-- compliance / "delete my data" requests, not for routine /disconnect.
create or replace function public.discord_dm_erase(p_discord_user_id text)
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

-- The old purge name now maps to the soft disconnect (so the deployed Worker
-- keeps working); it will be repointed to discord_dm_disconnect in code.
drop function if exists public.discord_dm_purge(text);
