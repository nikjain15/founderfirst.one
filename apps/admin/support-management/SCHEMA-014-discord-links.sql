-- =============================================================================
-- FounderFirst Support — Discord account linking (migration 014)
-- =============================================================================
--
-- Per-user concierge on Discord. A user proves they own the email Penny
-- already knows about, and after that the Discord bot can answer them with
-- full context (their tickets, prior Penny messages) instead of starting
-- from zero every time.
--
-- Safety model — read carefully.
--   - The end user has no Supabase Auth session. Identity = the email they
--     gave Penny. So linking is "prove you own email X" via a one-time token.
--   - The Cloudflare Worker (Penny brain) is the ONLY caller of the
--     get-context RPC. The anon key is used + the Worker passes the
--     Discord user id it just received from Discord. Cross-user leak is
--     prevented by:
--       (a) get_user_context_for_discord requires a valid, non-revoked link
--           row keyed on discord_user_id.
--       (b) The Worker passes Discord's verified user id straight from the
--           gateway/interaction payload — never trusts the user-supplied body.
--   - RLS denies all direct table access. Everything goes through RPCs.
--   - Tokens are single-use, 15-min expiry, stored as a sha256 hash.
--
-- Surfaces:
--   - Cloudflare Worker (site-bubble/worker) — calls mint, redeem, get-context.
--   - Admin UI ("Connected channels") — calls list_discord_links_for_email
--     and revoke_discord_link on the user's behalf via magic-link confirm.
--
-- Safe to re-run.
-- =============================================================================

create extension if not exists "pgcrypto";  -- digest()

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
-- One row per (email, discord_user_id) pair. A row exists in three states:
--   pending   — token minted, user hasn't clicked the link yet
--   confirmed — user clicked the link and proved the email
--   revoked   — user disconnected, or link was killed
--
-- We key on email_normalized (lower-trimmed) because that's the identity
-- Penny tracks. discord_user_id is null until the user side is known.
create table if not exists discord_account_links (
  id                  uuid primary key default gen_random_uuid(),

  -- Identity on each side.
  email_normalized    text not null,
  discord_user_id     text,
  discord_username    text,

  -- Per-user private channel created in the server for this person.
  -- Null until the Worker creates it (on first confirmed message).
  discord_channel_id  text,

  -- Token used to confirm the link. Stored as sha256(token) hex; the
  -- raw token only ever exists in the URL we hand the user.
  link_token_hash     text,
  link_token_expires  timestamptz,

  -- Lifecycle.
  created_at          timestamptz not null default now(),
  confirmed_at        timestamptz,
  revoked_at          timestamptz,

  -- Where the link started — "discord" (bot DM'd a link) or
  -- "web" (user clicked Connect Discord in account settings).
  initiated_from      text not null check (initiated_from in ('discord', 'web')),

  -- Scope of what the bot may read. Today only "penny_history" is used.
  -- Stored as jsonb array so we can add scopes without a migration.
  scopes              jsonb not null default '["penny_history"]'::jsonb
);

-- A user can have multiple link rows over time (revoke + reconnect), but
-- only one active confirmed link per (email, discord_user_id) pair.
create unique index if not exists uniq_discord_links_active
  on discord_account_links (email_normalized, discord_user_id)
  where confirmed_at is not null and revoked_at is null;

create index if not exists idx_discord_links_discord_user
  on discord_account_links (discord_user_id)
  where discord_user_id is not null and revoked_at is null;

create index if not exists idx_discord_links_email
  on discord_account_links (email_normalized)
  where revoked_at is null;

create index if not exists idx_discord_links_token_hash
  on discord_account_links (link_token_hash)
  where link_token_hash is not null;

-- RLS: deny-all. Access via RPCs only.
alter table discord_account_links enable row level security;

-- -----------------------------------------------------------------------------
-- Helper — normalize email
-- -----------------------------------------------------------------------------
create or replace function _normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(trim(p_email));
$$;

-- -----------------------------------------------------------------------------
-- mint_discord_link_token
-- -----------------------------------------------------------------------------
-- Called from two places:
--   - Cloudflare Worker, when a Discord user DMs the bot and isn't linked.
--     Passes discord_user_id + discord_username; email is null until confirm.
--   - Admin/web "Connect Discord" button. Passes email; discord_user_id is
--     null until the user clicks the link from inside Discord.
--
-- Returns the raw token (the only time it exists in the clear) and an
-- expires-at timestamp. The caller embeds the token in the URL it shows
-- the user. We store sha256(token) only.
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
set search_path = public
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
    coalesce(v_email_n, ''),  -- temp placeholder; filled at confirm if started from Discord
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

-- -----------------------------------------------------------------------------
-- confirm_discord_link
-- -----------------------------------------------------------------------------
-- Called when the user clicks the magic link. Verifies the token, fills in
-- whichever side (email or discord_user_id) wasn't known at mint time, and
-- stamps confirmed_at. Returns the link row id so the UI can show it.
--
-- Token is single-use: hash is cleared on confirm so it can't be replayed.
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
set search_path = public
as $$
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

  -- Fill in whichever side was missing. If both sides are provided and
  -- conflict with what was minted, that's an error (someone forwarded a
  -- link to a different account).
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

  -- Kill any prior active link for this same pair (revoke + reconnect).
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

-- -----------------------------------------------------------------------------
-- attach_discord_channel
-- -----------------------------------------------------------------------------
-- The Worker calls this once per linked user, after it creates the private
-- per-user channel in the Discord server. Idempotent.
create or replace function attach_discord_channel(
  p_discord_user_id    text,
  p_discord_channel_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update discord_account_links
     set discord_channel_id = p_discord_channel_id
   where discord_user_id = p_discord_user_id
     and confirmed_at is not null
     and revoked_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_user_context_for_discord
-- -----------------------------------------------------------------------------
-- The SINGLE choke point for "what does the bot know about this Discord user."
-- Returns null if no confirmed link exists. Returns a jsonb bundle with the
-- email, a list of prior tickets (subject + status + first message + recent
-- replies), and the private channel id if one has been created.
--
-- The bot must pass discord_user_id straight from the Discord interaction
-- payload — never from the message body. Anyone could spoof a body.
create or replace function get_user_context_for_discord(
  p_discord_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link  discord_account_links%rowtype;
  v_ctx   jsonb;
begin
  select * into v_link
  from discord_account_links
  where discord_user_id = p_discord_user_id
    and confirmed_at is not null
    and revoked_at  is null
  order by confirmed_at desc
  limit 1;

  if not found then
    return null;
  end if;

  if not (v_link.scopes ? 'penny_history') then
    return jsonb_build_object(
      'linked', true,
      'email',  v_link.email_normalized,
      'history', '[]'::jsonb
    );
  end if;

  -- Pull tickets keyed off the email, regardless of which channel they came
  -- in on, capped at the 10 most recent. For each ticket, include the last
  -- 6 messages.
  select jsonb_build_object(
    'linked',              true,
    'email',               v_link.email_normalized,
    'discord_channel_id',  v_link.discord_channel_id,
    'scopes',              v_link.scopes,
    'tickets', coalesce((
      select jsonb_agg(t_obj order by t_obj->>'created_at' desc)
      from (
        select jsonb_build_object(
          'id',           t.id,
          'subject',      t.subject,
          'status',       t.status,
          'channel',      t.channel,
          'first_message', t.first_message,
          'created_at',   t.created_at,
          'messages', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'author', m.author,
                'body',   m.body,
                'at',     m.created_at
              ) order by m.created_at desc
            )
            from (
              select author, body, created_at
              from support_messages
              where ticket_id = t.id
              order by created_at desc
              limit 6
            ) m
          ), '[]'::jsonb)
        ) as t_obj
        from support_tickets t
        join support_contacts c on c.id = t.contact_id
        where lower(coalesce(c.email, '')) = v_link.email_normalized
        order by t.created_at desc
        limit 10
      ) ranked
    ), '[]'::jsonb)
  )
  into v_ctx;

  return v_ctx;
end;
$$;

-- -----------------------------------------------------------------------------
-- revoke_discord_link
-- -----------------------------------------------------------------------------
-- User-initiated disconnect. Callable two ways:
--   - From the bot ("disconnect me") — caller passes discord_user_id.
--   - From the admin UI / future settings page — caller passes email and is
--     gated on a magic-link confirmation flow (we re-mint a one-time token
--     with intent='revoke'; that flow ships when the settings page does).
--
-- After revoke, get_user_context returns null — the bot loses access on the
-- very next message.
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
begin
  if p_discord_user_id is null and p_email is null then
    raise exception 'revoke_discord_link: must provide discord_user_id or email';
  end if;

  update discord_account_links
     set revoked_at = now()
   where confirmed_at is not null
     and revoked_at  is null
     and (
       (p_discord_user_id is not null and discord_user_id = p_discord_user_id)
       or
       (p_email is not null and email_normalized = _normalize_email(p_email))
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_list_discord_links
-- -----------------------------------------------------------------------------
-- Admin-only view for support troubleshooting. Never exposes the raw token.
create or replace function admin_list_discord_links(
  p_limit  int default 200,
  p_search text default null
)
returns table (
  id                 uuid,
  email_normalized   text,
  discord_user_id    text,
  discord_username   text,
  discord_channel_id text,
  initiated_from     text,
  status             text,
  scopes             jsonb,
  created_at         timestamptz,
  confirmed_at       timestamptz,
  revoked_at         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_list_discord_links: admin access required';
  end if;

  return query
    select
      l.id,
      l.email_normalized,
      l.discord_user_id,
      l.discord_username,
      l.discord_channel_id,
      l.initiated_from,
      case
        when l.revoked_at is not null   then 'revoked'
        when l.confirmed_at is not null then 'confirmed'
        else 'pending'
      end as status,
      l.scopes,
      l.created_at,
      l.confirmed_at,
      l.revoked_at
    from discord_account_links l
    where p_search is null
       or l.email_normalized ilike '%' || lower(p_search) || '%'
       or l.discord_username  ilike '%' || p_search || '%'
       or l.discord_user_id   = p_search
    order by l.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- The Worker (anon key, server-side) needs mint/confirm/get-context/attach/revoke.
-- Admin UI (authenticated) calls admin_list_discord_links.
grant execute on function mint_discord_link_token(text, text, text, text)            to anon, authenticated;
grant execute on function confirm_discord_link(text, text, text, text)               to anon, authenticated;
grant execute on function attach_discord_channel(text, text)                         to anon, authenticated;
grant execute on function get_user_context_for_discord(text)                         to anon, authenticated;
grant execute on function revoke_discord_link(text, text)                            to anon, authenticated;
grant execute on function admin_list_discord_links(int, text)                        to authenticated;
