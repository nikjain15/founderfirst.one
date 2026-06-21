-- Make every revoke path consistent with /disconnect.
--
-- revoke_discord_link is called by BOTH the admin UI (Users → Discord → Revoke)
-- and the bot's /disconnect handler. The bot path also archived DM memory; the
-- admin path didn't — so an admin-revoked user kept live conversation memory.
-- Fold the archival into revoke_discord_link so all callers behave the same:
-- links revoked → that user's turns archived (retained) + summary cache dropped.

create or replace function revoke_discord_link(
  p_discord_user_id text default null,
  p_email           text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_uids  text[];
begin
  if p_discord_user_id is null and p_email is null then
    raise exception 'revoke_discord_link: must provide discord_user_id or email';
  end if;

  with revoked as (
    update discord_account_links
       set revoked_at = now()
     where confirmed_at is not null
       and revoked_at  is null
       and (
         (p_discord_user_id is not null and discord_user_id = p_discord_user_id)
         or
         (p_email is not null and email_normalized = _normalize_email(p_email))
       )
    returning discord_user_id
  )
  select array_agg(distinct discord_user_id), count(*)
    into v_uids, v_count
    from revoked;

  -- Fresh start for the revoked user(s): archive their turns (history retained
  -- as a backend record) and drop the derived summary cache.
  if v_uids is not null then
    update discord_dm_messages
       set archived_at = now()
     where discord_user_id = any(v_uids)
       and archived_at is null;
    delete from discord_dm_memory
     where discord_user_id = any(v_uids);
  end if;

  return v_count;
end;
$$;
