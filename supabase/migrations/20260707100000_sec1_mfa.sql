-- SEC-1 — MFA for owner + CPA login: per-org "require MFA" policy + a
-- server-verified recovery-code path for a lost authenticator.
--
-- WHY: penny.founderfirst.one auth today is single-factor (Supabase signInWithOtp
-- email code) — the Intuit app-review questionnaire (5 Jul) flagged this as a gap.
-- Supabase Auth's own TOTP-factor enrol/challenge/verify (client-side, via
-- supabase.auth.mfa.*) elevates a session to aal2 on its own — no schema needed for
-- that half. What Supabase does NOT provide is recovery codes, and (by design) a
-- verified factor cannot be removed by its own owner without completing a challenge
-- first. So a lost-device recovery path needs its own server-verified one-time
-- codes that, once redeemed, use the Admin API (service role, from the mfa edge fn)
-- to clear the user's factors so they can sign back in and re-enrol. Codes are
-- stored hashed only (same discipline as discord_account_links.link_token_hash);
-- the plaintext is returned exactly once, at generation time.

create extension if not exists "pgcrypto";

alter table org_accounting_settings
  add column if not exists mfa_required boolean not null default false;

-- Extend the owner accounting-settings write-path (one write RPC per setting
-- group, not a new one per field) with the new per-org MFA policy flag.
-- INTEGRATION (Wave-3): W5.4 (migration 070000) already extended this RPC with
-- p_multi_currency_enabled (signature uuid,uuid,boolean,char,int,boolean). Since
-- this migration runs AFTER it, we must drop BOTH the original 5-arg signature
-- AND W5.4's 6-arg signature, then recreate carrying BOTH new fields — otherwise
-- create-or-replace on the identical 6-arg type-signature would silently clobber
-- W5.4's multi_currency_enabled param and break the org-settings write-path.
drop function if exists set_org_accounting_settings(uuid, uuid, boolean, char, int);
drop function if exists set_org_accounting_settings(uuid, uuid, boolean, char, int, boolean);

create or replace function set_org_accounting_settings(
  p_actor                      uuid,
  p_org                        uuid,
  p_cpa_posts_require_approval boolean default null,
  p_home_currency              char(3) default null,
  p_fiscal_year_start_month    int     default null,
  p_multi_currency_enabled     boolean default null,
  p_mfa_required               boolean default null
) returns org_accounting_settings
language plpgsql security definer set search_path = public as $$
declare v_s org_accounting_settings;
begin
  -- owner-only: same gate as every other field this RPC writes.
  if not exists (
    select 1 from memberships m
    where m.user_id = p_actor and m.org_id = p_org
      and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'forbidden: only the business owner may change accounting settings'
      using errcode = 'insufficient_privilege';
  end if;

  if p_fiscal_year_start_month is not null
     and (p_fiscal_year_start_month < 1 or p_fiscal_year_start_month > 12) then
    raise exception 'bad_fiscal_month: must be 1-12' using errcode = 'invalid_parameter_value';
  end if;

  insert into org_accounting_settings (org_id) values (p_org)
    on conflict (org_id) do nothing;

  update org_accounting_settings
     set cpa_posts_require_approval = coalesce(p_cpa_posts_require_approval, cpa_posts_require_approval),
         home_currency              = coalesce(p_home_currency, home_currency),
         fiscal_year_start_month    = coalesce(p_fiscal_year_start_month, fiscal_year_start_month),
         multi_currency_enabled     = coalesce(p_multi_currency_enabled, multi_currency_enabled),
         mfa_required               = coalesce(p_mfa_required, mfa_required)
   where org_id = p_org
  returning * into v_s;
  return v_s;
end$$;

revoke all on function set_org_accounting_settings(uuid, uuid, boolean, char, int, boolean, boolean) from public;
grant execute on function set_org_accounting_settings(uuid, uuid, boolean, char, int, boolean, boolean) to service_role;

-- ── MFA recovery codes ────────────────────────────────────────────────────────
-- One-time, hashed, per-user codes. Never client-readable — the mfa edge fn is the
-- only caller (p_actor comes from the JWT-verified user there, never trusted from
-- the request body, matching the isolation discipline in
-- 20260701000000_isolation_revoke_rpc_execute.sql).
create table if not exists mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mfa_recovery_codes_user on mfa_recovery_codes (user_id) where used_at is null;

alter table mfa_recovery_codes enable row level security;
drop policy if exists mfa_recovery_codes_nowrite on mfa_recovery_codes;
create policy mfa_recovery_codes_nowrite on mfa_recovery_codes for all using (false) with check (false);
revoke all on mfa_recovery_codes from anon, authenticated;
grant select, insert, update on mfa_recovery_codes to service_role;

-- A minimal, user-scoped security event log — distinct from ledger_audit (org-
-- scoped) and admin_audit (platform-staff scoped); MFA enrol/disable/recovery
-- events belong to the user, not a single org.
create table if not exists security_audit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint security_audit_action_check check (action in (
    'mfa.enrolled', 'mfa.disabled', 'mfa.challenge_failed',
    'mfa.recovery_codes_generated', 'mfa.recovery_used'
  ))
);
alter table security_audit enable row level security;
drop policy if exists security_audit_select on security_audit;
create policy security_audit_select on security_audit for select using (user_id = auth.uid());
drop policy if exists security_audit_nowrite on security_audit;
create policy security_audit_nowrite on security_audit for all using (false) with check (false);
grant select on security_audit to authenticated;
grant select, insert on security_audit to service_role;

-- Record an MFA event whose source of truth is Supabase's own factor API (enrol/
-- disable happen client-side against GoTrue directly — there is no DB trigger to
-- hook), so the client reports success through the mfa edge fn, which calls this.
create or replace function log_security_event(p_actor uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into security_audit (user_id, action, detail) values (p_actor, p_action, p_detail);
$$;

revoke all on function log_security_event(uuid, text, jsonb) from public;
grant execute on function log_security_event(uuid, text, jsonb) to service_role;

-- Generate (replacing any unused) recovery codes for a user. Returns the plaintext
-- codes exactly once — the caller must show + discard them; only the hash persists.
create or replace function generate_mfa_recovery_codes(p_actor uuid, p_count int default 10)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_codes text[] := '{}';
  v_code  text;
  i       int;
begin
  if p_count < 1 or p_count > 20 then
    raise exception 'bad_count: must be 1-20' using errcode = 'invalid_parameter_value';
  end if;

  -- Replace-all semantics: a fresh enrol/regenerate invalidates any codes handed
  -- out previously so an old leaked sheet can't be replayed.
  delete from mfa_recovery_codes where user_id = p_actor and used_at is null;

  for i in 1..p_count loop
    v_code := upper(
      substr(encode(gen_random_bytes(5), 'hex'), 1, 5) || '-' ||
      substr(encode(gen_random_bytes(5), 'hex'), 1, 5)
    );
    v_codes := array_append(v_codes, v_code);
    insert into mfa_recovery_codes (user_id, code_hash)
      values (p_actor, encode(digest(v_code, 'sha256'), 'hex'));
  end loop;

  insert into security_audit (user_id, action, detail)
    values (p_actor, 'mfa.recovery_codes_generated', jsonb_build_object('count', p_count));

  return v_codes;
end$$;

revoke all on function generate_mfa_recovery_codes(uuid, int) from public;
grant execute on function generate_mfa_recovery_codes(uuid, int) to service_role;

-- Count of unused recovery codes remaining (drives the "N codes left" UI nudge).
create or replace function mfa_recovery_codes_remaining(p_actor uuid)
returns int
language sql security definer set search_path = public as $$
  select count(*)::int from mfa_recovery_codes where user_id = p_actor and used_at is null;
$$;

revoke all on function mfa_recovery_codes_remaining(uuid) from public;
grant execute on function mfa_recovery_codes_remaining(uuid) to service_role;

-- Redeem a recovery code. On match: marks it used (one-time) and returns true —
-- the mfa edge fn then uses the Admin API to clear the user's MFA factors so they
-- can sign back in and re-enrol. On no match: false; whether the code was wrong vs.
-- already-used is indistinguishable to the caller, so a stolen sheet can't be
-- probed for which codes are still live. No lockout: this path never depends on
-- completing a challenge (that's the entire point of a recovery code).
create or replace function consume_mfa_recovery_code(p_actor uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_id uuid;
begin
  v_hash := encode(digest(upper(trim(p_code)), 'sha256'), 'hex');
  select id into v_id from mfa_recovery_codes
   where user_id = p_actor and code_hash = v_hash and used_at is null
   limit 1;
  if v_id is null then
    return false;
  end if;
  update mfa_recovery_codes set used_at = now() where id = v_id;
  insert into security_audit (user_id, action, detail)
    values (p_actor, 'mfa.recovery_used', '{}'::jsonb);
  return true;
end$$;

revoke all on function consume_mfa_recovery_code(uuid, text) from public;
grant execute on function consume_mfa_recovery_code(uuid, text) to service_role;
