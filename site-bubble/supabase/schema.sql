-- Penny site bubble — Supabase schema
--
-- Two tables:
--   penny_site_chats   one row per turn (user OR penny)
--   penny_site_leads   email + phone captures, dedup'd by (session_id, value)
--
-- Run order: enable extensions → tables → indexes → RLS → policies.
-- Re-run-safe: every statement uses IF NOT EXISTS.

create extension if not exists "pgcrypto";

-- ── chats ──────────────────────────────────────────────────────────────────
create table if not exists public.penny_site_chats (
  id            uuid primary key default gen_random_uuid(),
  session_id    text  not null,
  turn_index    integer not null,
  role          text  not null check (role in ('user', 'penny')),
  message       text  not null,
  cta_emitted   boolean not null default false,
  tone          text  check (tone in ('fyi', 'action', 'celebration', 'flag') or tone is null),
  on_waitlist   boolean not null default false,
  soft_decline  boolean not null default false,
  buying_signal boolean not null default false,
  user_agent    text,
  referrer      text,
  page_url      text,
  created_at    timestamptz not null default now()
);

create index if not exists penny_site_chats_session_idx
  on public.penny_site_chats (session_id, turn_index);
create index if not exists penny_site_chats_created_idx
  on public.penny_site_chats (created_at desc);

-- ── leads ──────────────────────────────────────────────────────────────────
create table if not exists public.penny_site_leads (
  id           uuid primary key default gen_random_uuid(),
  session_id   text not null,
  kind         text not null check (kind in ('email', 'phone')),
  value        text not null,
  source       text not null check (source in ('waitlist', 'follow_up', 'volunteered')),
  user_agent   text,
  referrer     text,
  page_url     text,
  created_at   timestamptz not null default now(),
  unique (session_id, kind, value)
);

create index if not exists penny_site_leads_value_idx on public.penny_site_leads (value);
create index if not exists penny_site_leads_created_idx on public.penny_site_leads (created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Anon and authenticated cannot read or write. Only the service role (used by
-- the Cloudflare Worker) bypasses RLS. This keeps PII unreadable from the
-- browser and from any leaked anon key.
alter table public.penny_site_chats enable row level security;
alter table public.penny_site_leads enable row level security;

-- No policies are created — without policies, RLS denies all access for
-- anon/authenticated. Service role bypasses RLS by design.

-- ── Retention helper ───────────────────────────────────────────────────────
-- 90-day retention on chats unless the session produced a waitlist lead.
-- Wire this into a scheduled Supabase Edge Function or pg_cron job.
create or replace function public.penny_site_chats_purge()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.penny_site_chats c
  where c.created_at < now() - interval '90 days'
    and not exists (
      select 1 from public.penny_site_leads l
      where l.session_id = c.session_id
        and l.source = 'waitlist'
    );
end;
$$;
