-- =============================================================================
-- Fix: column reference ambiguity in confirm_discord_link
-- =============================================================================
-- The previous version of this function had RETURNS TABLE columns named
-- `link_id`, `email_normalized`, `discord_user_id` — which collide with the
-- table columns of the same name inside the function body. PostgreSQL raised
-- `column reference "email_normalized" is ambiguous` on the UPDATE.
--
-- Fix: add `#variable_conflict use_column` so unqualified identifiers inside
-- the function resolve to table columns (the intent in every UPDATE here).
-- Variables and OUT params are still accessible via their prefix (v_row.x).
--
-- Safe to re-run.
-- =============================================================================

create or replace function confirm_discord_link(
  p_raw_token         text,
  p_email             text default null,
  p_discord_user_id   text default null,
  p_discord_username  text default null
)
returns table (
  link_id            uuid,
  email_normalized   text,
  discord_user_id    text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_hash    text;
  v_row     discord_account_links%rowtype;
  v_email_n text;
begin
  if p_raw_token is null or length(p_raw_token) < 32 then
    raise exception 'confirm_discord_link: token missing';
  end if;

  v_hash    := encode(digest(p_raw_token, 'sha256'), 'hex');
  v_email_n := case when p_email is null then null else _normalize_email(p_email) end;

  select * into v_row
  from discord_account_links
  where link_token_hash = v_hash
  for update;

  if not found then
    raise exception 'confirm_discord_link: token not found';
  end if;
  if v_row.link_token_expires < now() then
    raise exception 'confirm_discord_link: token expired';
  end if;
  if v_row.confirmed_at is not null then
    raise exception 'confirm_discord_link: already confirmed';
  end if;
  if v_row.revoked_at is not null then
    raise exception 'confirm_discord_link: link revoked';
  end if;

  if v_row.initiated_from = 'discord' then
    if v_email_n is null then
      raise exception 'confirm_discord_link: email required when initiated from Discord';
    end if;
    v_row.email_normalized := v_email_n;
  else
    if p_discord_user_id is null then
      raise exception 'confirm_discord_link: discord_user_id required when initiated from web';
    end if;
    if v_row.discord_user_id is not null and v_row.discord_user_id <> p_discord_user_id then
      raise exception 'confirm_discord_link: discord_user_id mismatch';
    end if;
    v_row.discord_user_id  := p_discord_user_id;
    v_row.discord_username := coalesce(p_discord_username, v_row.discord_username);
  end if;

  update discord_account_links
     set revoked_at = now()
   where email_normalized = v_row.email_normalized
     and discord_user_id  = v_row.discord_user_id
     and confirmed_at is not null
     and revoked_at  is null
     and id <> v_row.id;

  update discord_account_links
     set email_normalized   = v_row.email_normalized,
         discord_user_id    = v_row.discord_user_id,
         discord_username   = v_row.discord_username,
         confirmed_at       = now(),
         link_token_hash    = null,
         link_token_expires = null
   where id = v_row.id;

  return query
    select v_row.id, v_row.email_normalized, v_row.discord_user_id;
end;
$$;
