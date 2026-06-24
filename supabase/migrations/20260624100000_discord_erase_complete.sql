-- =============================================================================
-- FounderFirst — complete right-to-erasure for Discord users
-- =============================================================================
--
-- The existing discord_dm_erase() removed a user's DM transcript + rolling
-- summary, but LEFT the discord_account_links row — which holds their email
-- and Discord username/id. A genuine "delete my data" request must remove all
-- three. This migration:
--
--   1. Rewrites discord_dm_erase() to also delete the account-link row(s), and
--      to return deletion counts (was void). Called by the Worker's self-service
--      /forgetme path.
--   2. Adds admin_discord_erase() — an is_admin()-gated wrapper for the admin
--      "Erase all data" action, resolvable by email OR discord_user_id.
--
-- Both are SECURITY DEFINER. All deletes are hard (this is erasure, not the
-- soft-delete /disconnect path). Idempotent / safe to re-run.
-- =============================================================================

-- Return type changes void -> jsonb, so drop the old signature first.
drop function if exists public.discord_dm_erase(text);

create or replace function public.discord_dm_erase(p_discord_user_id text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_msgs  int;
  v_mem   int;
  v_links int;
begin
  delete from discord_dm_messages where discord_user_id = p_discord_user_id;
  get diagnostics v_msgs = row_count;

  delete from discord_dm_memory where discord_user_id = p_discord_user_id;
  get diagnostics v_mem = row_count;

  delete from discord_account_links where discord_user_id = p_discord_user_id;
  get diagnostics v_links = row_count;

  return jsonb_build_object('messages', v_msgs, 'memory', v_mem, 'links', v_links);
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_discord_erase — admin-triggered full erasure (by email or discord id).
-- -----------------------------------------------------------------------------
create or replace function public.admin_discord_erase(
  p_discord_user_id text default null,
  p_email           text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_uid   text := p_discord_user_id;
  v_msgs  int  := 0;
  v_mem   int  := 0;
  v_links int  := 0;
begin
  if not is_admin() then
    raise exception 'admin_discord_erase: admin access required';
  end if;
  if p_discord_user_id is null and p_email is null then
    raise exception 'admin_discord_erase: must provide discord_user_id or email';
  end if;

  -- The message/memory tables key on discord_user_id; resolve it from email
  -- when the admin only has the email.
  if v_uid is null and p_email is not null then
    select discord_user_id into v_uid
      from discord_account_links
     where email_normalized = _normalize_email(p_email)
       and discord_user_id is not null
     limit 1;
  end if;

  if v_uid is not null then
    delete from discord_dm_messages where discord_user_id = v_uid;
    get diagnostics v_msgs = row_count;

    delete from discord_dm_memory where discord_user_id = v_uid;
    get diagnostics v_mem = row_count;
  end if;

  -- Remove every link row for this person (all states, by id and/or email).
  delete from discord_account_links
   where (v_uid is not null and discord_user_id = v_uid)
      or (p_email is not null and email_normalized = _normalize_email(p_email));
  get diagnostics v_links = row_count;

  return jsonb_build_object(
    'discord_user_id', v_uid,
    'messages', v_msgs,
    'memory', v_mem,
    'links', v_links
  );
end;
$$;
