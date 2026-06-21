-- =============================================================================
-- Fix: qualify pgcrypto calls in discord-link functions
-- =============================================================================
-- The mint/confirm RPCs use gen_random_bytes() + digest() from pgcrypto.
-- Supabase installs pgcrypto into the `extensions` schema, but the functions
-- have `set search_path = public`, so the unqualified calls fail with
-- `function gen_random_bytes(integer) does not exist` (SQLSTATE 42883).
--
-- Fix: add `extensions` to the search_path so unqualified pgcrypto calls
-- resolve. Re-creates the two affected functions with their original
-- signatures and bodies, unchanged except for the search_path line.
--
-- Safe to re-run.
-- =============================================================================

create or replace function mint_discord_link_token(
  p_email             text default null,
  p_discord_user_id   text default null,
  p_discord_username  text default null,
  p_initiated_from    text default 'discord'
)
returns table (
  link_id      uuid,
  raw_token    text,
  expires_at   timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token   text;
  v_hash    text;
  v_expires timestamptz;
  v_id      uuid;
  v_email_n text;
begin
  if p_email is null and p_discord_user_id is null then
    raise exception 'mint_discord_link_token: must provide email or discord_user_id';
  end if;
  if p_initiated_from not in ('discord', 'web') then
    raise exception 'mint_discord_link_token: invalid initiated_from %', p_initiated_from;
  end if;

  v_email_n := case when p_email is null then null else _normalize_email(p_email) end;
  v_token   := encode(gen_random_bytes(32), 'hex');
  v_hash    := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '15 minutes';

  insert into discord_account_links (
    email_normalized,
    discord_user_id,
    discord_username,
    link_token_hash,
    link_token_expires,
    initiated_from
  )
  values (
    coalesce(v_email_n, ''),
    p_discord_user_id,
    p_discord_username,
    v_hash,
    v_expires,
    p_initiated_from
  )
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

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
  v_hash   text;
  v_row    discord_account_links%rowtype;
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
     set email_normalized  = v_row.email_normalized,
         discord_user_id   = v_row.discord_user_id,
         discord_username  = v_row.discord_username,
         confirmed_at      = now(),
         link_token_hash   = null,
         link_token_expires = null
   where id = v_row.id;

  return query
    select v_row.id, v_row.email_normalized, v_row.discord_user_id;
end;
$$;
