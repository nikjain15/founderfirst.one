-- W1.1 · Bank reconciliation — per-account, per-period statement-vs-ledger match.
--
-- ⚠️ NO reconciliation schema exists today (prod has import_batches / import_rows /
-- ai_reconcile_runs only). This migration CREATES it; it does not extend one.
--
-- Model (the #1 CPA trust surface):
--   reconciliation_sessions  one per (org, bank account, period_end statement).
--     Holds the statement's opening + closing balance and a lock (reconciled ✓).
--   reconciliation_matches   one row per (statement line ⇄ ledger entry) match.
--     The statement line is an import_rows row (bank_transactions is Plaid-fed,
--     arrives W2.3 — until then we reconcile against import_rows, per the card).
--     kind = 'exact' | 'fuzzy' | 'manual'. A match points at ONE ledger entry.
--
-- Trust invariants baked in here (not in the client):
--   • RLS: members + engaged CPAs READ (can_access_org); NO client writes.
--   • Match/unmatch/lock go through SECURITY DEFINER RPCs, service_role-EXECUTE
--     only (ISOTEST pattern — no p_actor forgery from anon/authenticated), gated
--     by can_write_org_as (a read-only CPA is access!='full' → refused server-side).
--   • Every match / unmatch / lock writes a ledger_audit row (actor from the fn).
--   • A locked (reconciled) session refuses new matches/unmatches until reopened.
--   • A REVERSAL of a matched entry REOPENS its match (a hook in
--     reverse_journal_entry) — a reconciled month can't silently drift when an
--     entry it cleared is later reversed. This is the acceptance-critical rule.
--   • Reconciliation math ties to the cent: closing = opening + Σ cleared matches.
--
-- Companion: the matcher engine (exact+fuzzy candidate proposal) is pure TS in
-- apps/app/src/ledger/reconcile.ts and unit-tested; the DB stores only confirmed
-- matches. pgTAP: supabase/tests/w1_1_reconciliation_test.sql.

-- ── enums ─────────────────────────────────────────────────────────────────────
do $$ begin
  create type reconciliation_status as enum ('open', 'locked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reconciliation_match_kind as enum ('exact', 'fuzzy', 'manual');
exception when duplicate_object then null; end $$;

-- ── tables ────────────────────────────────────────────────────────────────────
create table if not exists public.reconciliation_sessions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  account_id       uuid not null references ledger_accounts(id) on delete cascade, -- the bank/cash account
  period_id        uuid references accounting_periods(id) on delete set null,       -- the month reconciled
  statement_end    date not null,                                                    -- statement closing date
  opening_minor    bigint not null default 0,   -- statement opening balance (minor units)
  closing_minor    bigint not null default 0,   -- statement closing balance (minor units)
  status           reconciliation_status not null default 'open',
  locked_by        uuid references auth.users(id),
  locked_at        timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  -- one live session per account per statement date
  unique (org_id, account_id, statement_end)
);
create index if not exists reconciliation_sessions_org on public.reconciliation_sessions (org_id, account_id, statement_end desc);

create table if not exists public.reconciliation_matches (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references reconciliation_sessions(id) on delete cascade,
  org_id           uuid not null references organizations(id) on delete cascade,   -- denormalized for RLS
  import_row_id    uuid not null references import_rows(id) on delete cascade,     -- the statement line
  entry_id         uuid not null references journal_entries(id) on delete cascade, -- the ledger entry it clears
  kind             reconciliation_match_kind not null,
  amount_minor     bigint not null,          -- the cleared amount (statement line, signed +in/−out)
  matched_by       uuid references auth.users(id),
  matched_at       timestamptz not null default now(),
  reopened_at      timestamptz,              -- set when a reversal reopens this match (soft, keeps trail)
  reopened_reason  text,
  -- a statement line clears at most one entry, and an entry clears at most one
  -- line, within a session; the partial indexes exclude reopened rows so a line
  -- can be re-matched after a reversal reopens it.
  constraint reconciliation_matches_amount_nonzero check (amount_minor <> 0)
);
create unique index if not exists reconciliation_matches_row_live
  on public.reconciliation_matches (session_id, import_row_id) where reopened_at is null;
create unique index if not exists reconciliation_matches_entry_live
  on public.reconciliation_matches (session_id, entry_id) where reopened_at is null;
create index if not exists reconciliation_matches_entry on public.reconciliation_matches (entry_id) where reopened_at is null;
create index if not exists reconciliation_matches_session on public.reconciliation_matches (session_id);

-- ── RLS: read-only to org members + engaged CPAs; no client writes ────────────
alter table public.reconciliation_sessions enable row level security;
alter table public.reconciliation_matches  enable row level security;

drop policy if exists reconciliation_sessions_select on public.reconciliation_sessions;
create policy reconciliation_sessions_select on public.reconciliation_sessions for select using (can_access_org(org_id));
drop policy if exists reconciliation_sessions_nowrite on public.reconciliation_sessions;
create policy reconciliation_sessions_nowrite on public.reconciliation_sessions for all using (false) with check (false);

drop policy if exists reconciliation_matches_select on public.reconciliation_matches;
create policy reconciliation_matches_select on public.reconciliation_matches for select using (can_access_org(org_id));
drop policy if exists reconciliation_matches_nowrite on public.reconciliation_matches;
create policy reconciliation_matches_nowrite on public.reconciliation_matches for all using (false) with check (false);

grant select on public.reconciliation_sessions to authenticated;
grant select on public.reconciliation_matches  to authenticated;
grant select, insert, update, delete on public.reconciliation_sessions to service_role;
grant select, insert, update, delete on public.reconciliation_matches  to service_role;

-- ── helper: audit one reconciliation action (actor-carrying, tenant-scoped) ────
create or replace function public.reconciliation_audit(
  p_org uuid, p_actor uuid, p_action text, p_target uuid, p_detail jsonb
) returns void language sql security definer set search_path to 'public' as $$
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, p_action, 'reconciliation', p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- ── RPC: open (or fetch) a session for an account + statement ─────────────────
create or replace function public.reconcile_open_session(
  p_actor uuid, p_org uuid, p_account_id uuid, p_statement_end date,
  p_opening_minor bigint default 0, p_closing_minor bigint default 0, p_period_id uuid default null
) returns reconciliation_sessions
  language plpgsql security definer set search_path to 'public' as $$
declare v_s reconciliation_sessions;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not reconcile org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from ledger_accounts where id = p_account_id and org_id = p_org) then
    raise exception 'not_found: account % not in org %', p_account_id, p_org using errcode = 'no_data_found';
  end if;

  insert into reconciliation_sessions
    (org_id, account_id, period_id, statement_end, opening_minor, closing_minor, created_by)
  values (p_org, p_account_id, p_period_id, p_statement_end, p_opening_minor, p_closing_minor, p_actor)
  on conflict (org_id, account_id, statement_end) do update
    set opening_minor = case when reconciliation_sessions.status = 'locked'
                             then reconciliation_sessions.opening_minor else excluded.opening_minor end,
        closing_minor = case when reconciliation_sessions.status = 'locked'
                             then reconciliation_sessions.closing_minor else excluded.closing_minor end,
        period_id     = coalesce(excluded.period_id, reconciliation_sessions.period_id)
  returning * into v_s;
  return v_s;
end$$;

-- ── RPC: record a match (statement line ⇄ ledger entry) ───────────────────────
create or replace function public.reconcile_match(
  p_actor uuid, p_org uuid, p_session_id uuid, p_import_row_id uuid, p_entry_id uuid,
  p_kind reconciliation_match_kind default 'manual'
) returns reconciliation_matches
  language plpgsql security definer set search_path to 'public' as $$
declare v_s reconciliation_sessions; v_row import_rows; v_entry journal_entries; v_m reconciliation_matches;
        v_net bigint;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not reconcile org %', p_org using errcode = 'insufficient_privilege';
  end if;

  -- lock the session so a concurrent lock() serializes with an in-flight match.
  select * into v_s from reconciliation_sessions where id = p_session_id and org_id = p_org for update;
  if not found then raise exception 'not_found: session % not in org %', p_session_id, p_org using errcode = 'no_data_found'; end if;
  if v_s.status = 'locked' then
    raise exception 'reconciliation_locked: session is reconciled; reopen it before matching'
      using errcode = 'restrict_violation';
  end if;

  select * into v_row from import_rows where id = p_import_row_id and org_id = p_org;
  if not found then raise exception 'not_found: statement line % not in org %', p_import_row_id, p_org using errcode = 'no_data_found'; end if;
  select * into v_entry from journal_entries where id = p_entry_id and org_id = p_org;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_entry.status = 'reversed' then
    raise exception 'entry_reversed: a reversed entry cannot clear a statement line' using errcode = 'restrict_violation';
  end if;
  if v_row.amount_minor is null or v_row.amount_minor = 0 then
    raise exception 'bad_amount: statement line has no amount to clear' using errcode = 'restrict_violation';
  end if;

  -- TIE-OUT INTEGRITY (financial crown jewel): a match is only meaningful if the
  -- ledger entry actually moves the reconciled bank account by the statement line's
  -- amount. Compute the entry's debit-positive net on session.account_id and require
  -- it to equal the line. Without this, lock() would sum statement amounts only and
  -- a session could "tie" while clearing lines against unrelated/zero-movement
  -- entries — a reconciled month silently wrong. Enforced in the RPC, not the UI.
  select coalesce(sum(case when side = 'D' then amount_minor else -amount_minor end), 0)
    into v_net
    from journal_lines
   where entry_id = p_entry_id and account_id = v_s.account_id;
  if v_net = 0 then
    raise exception 'entry_off_account: entry % has no net movement on the reconciled account %', p_entry_id, v_s.account_id
      using errcode = 'restrict_violation';
  end if;
  if v_net <> v_row.amount_minor then
    raise exception 'amount_mismatch: entry net % on the account ≠ statement line % — cannot clear', v_net, v_row.amount_minor
      using errcode = 'restrict_violation';
  end if;

  insert into reconciliation_matches
    (session_id, org_id, import_row_id, entry_id, kind, amount_minor, matched_by)
  values (p_session_id, p_org, p_import_row_id, p_entry_id, p_kind, v_row.amount_minor, p_actor)
  returning * into v_m;

  perform reconciliation_audit(p_org, p_actor, 'reconcile.match', v_m.id,
    jsonb_build_object('session_id', p_session_id, 'import_row_id', p_import_row_id,
                       'entry_id', p_entry_id, 'kind', p_kind, 'amount_minor', v_row.amount_minor));
  return v_m;
exception
  when unique_violation then
    raise exception 'already_matched: this line or entry is already matched in the session'
      using errcode = 'unique_violation';
end$$;

-- ── RPC: remove a match (unmatch) ─────────────────────────────────────────────
create or replace function public.reconcile_unmatch(
  p_actor uuid, p_org uuid, p_match_id uuid
) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare v_m reconciliation_matches; v_status reconciliation_status;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not reconcile org %', p_org using errcode = 'insufficient_privilege';
  end if;
  select m.*, s.status into v_m, v_status
  from reconciliation_matches m
  join reconciliation_sessions s on s.id = m.session_id
  where m.id = p_match_id and m.org_id = p_org
  for update of m, s;
  if not found then raise exception 'not_found: match % not in org %', p_match_id, p_org using errcode = 'no_data_found'; end if;
  if v_status = 'locked' then
    raise exception 'reconciliation_locked: session is reconciled; reopen it before unmatching'
      using errcode = 'restrict_violation';
  end if;

  delete from reconciliation_matches where id = p_match_id;
  perform reconciliation_audit(p_org, p_actor, 'reconcile.unmatch', p_match_id,
    jsonb_build_object('session_id', v_m.session_id, 'entry_id', v_m.entry_id, 'import_row_id', v_m.import_row_id));
end$$;

-- ── RPC: lock a reconciled session (Reconciled ✓) ─────────────────────────────
-- Refuses to lock unless the report ties to the cent: closing = opening + Σ cleared.
create or replace function public.reconcile_lock(
  p_actor uuid, p_org uuid, p_session_id uuid
) returns reconciliation_sessions
  language plpgsql security definer set search_path to 'public' as $$
declare v_s reconciliation_sessions; v_cleared bigint;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not reconcile org %', p_org using errcode = 'insufficient_privilege';
  end if;
  select * into v_s from reconciliation_sessions where id = p_session_id and org_id = p_org for update;
  if not found then raise exception 'not_found: session % not in org %', p_session_id, p_org using errcode = 'no_data_found'; end if;
  if v_s.status = 'locked' then return v_s; end if;

  select coalesce(sum(amount_minor), 0) into v_cleared
  from reconciliation_matches where session_id = p_session_id and reopened_at is null;

  if v_s.opening_minor + v_cleared <> v_s.closing_minor then
    raise exception 'not_reconciled: opening % + cleared % ≠ closing % — resolve the difference before locking',
      v_s.opening_minor, v_cleared, v_s.closing_minor using errcode = 'restrict_violation';
  end if;

  update reconciliation_sessions set status = 'locked', locked_by = p_actor, locked_at = now()
   where id = p_session_id returning * into v_s;
  perform reconciliation_audit(p_org, p_actor, 'reconcile.lock', p_session_id,
    jsonb_build_object('opening_minor', v_s.opening_minor, 'closing_minor', v_s.closing_minor, 'cleared_minor', v_cleared));
  return v_s;
end$$;

-- ── RPC: reopen a locked session (undo Reconciled ✓ to fix something) ──────────
create or replace function public.reconcile_reopen(
  p_actor uuid, p_org uuid, p_session_id uuid
) returns reconciliation_sessions
  language plpgsql security definer set search_path to 'public' as $$
declare v_s reconciliation_sessions;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not reconcile org %', p_org using errcode = 'insufficient_privilege';
  end if;
  update reconciliation_sessions set status = 'open', locked_by = null, locked_at = null
   where id = p_session_id and org_id = p_org and status = 'locked'
  returning * into v_s;
  if not found then
    -- either not found or already open
    select * into v_s from reconciliation_sessions where id = p_session_id and org_id = p_org;
    if not found then raise exception 'not_found: session % not in org %', p_session_id, p_org using errcode = 'no_data_found'; end if;
    return v_s;
  end if;
  perform reconciliation_audit(p_org, p_actor, 'reconcile.reopen', p_session_id, '{}'::jsonb);
  return v_s;
end$$;

-- ── ISOTEST lockdown: SECDEF, service_role-EXECUTE only (no p_actor forgery) ───
revoke all on function public.reconcile_open_session(uuid, uuid, uuid, date, bigint, bigint, uuid) from public;
revoke all on function public.reconcile_match(uuid, uuid, uuid, uuid, uuid, reconciliation_match_kind) from public;
revoke all on function public.reconcile_unmatch(uuid, uuid, uuid) from public;
revoke all on function public.reconcile_lock(uuid, uuid, uuid) from public;
revoke all on function public.reconcile_reopen(uuid, uuid, uuid) from public;
revoke all on function public.reconciliation_audit(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.reconcile_open_session(uuid, uuid, uuid, date, bigint, bigint, uuid) to service_role;
grant execute on function public.reconcile_match(uuid, uuid, uuid, uuid, uuid, reconciliation_match_kind) to service_role;
grant execute on function public.reconcile_unmatch(uuid, uuid, uuid) to service_role;
grant execute on function public.reconcile_lock(uuid, uuid, uuid) to service_role;
grant execute on function public.reconcile_reopen(uuid, uuid, uuid) to service_role;
grant execute on function public.reconciliation_audit(uuid, uuid, text, uuid, jsonb) to service_role;

-- ── reversal-reopens-match hook (acceptance-critical) ─────────────────────────
-- When an entry is reversed, any LIVE reconciliation match that cleared it is
-- reopened (soft: reopened_at set, keeping the audit trail) so a reconciled month
-- can't silently drift. If the containing session was locked, unlock it — the
-- books no longer tie to the statement and a CPA must re-resolve. A trigger on
-- journal_entries.status → 'reversed' does this uniformly, whether the reversal
-- comes from reverse_journal_entry, categorize repost, or any future path.
create or replace function public.reconciliation_reopen_on_reversal() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'reversed' and old.status <> 'reversed' then
    -- reopen every live match on this entry, and unlock its session.
    update reconciliation_sessions s
       set status = 'open', locked_by = null, locked_at = null
     from reconciliation_matches m
     where m.entry_id = new.id and m.reopened_at is null
       and s.id = m.session_id and s.status = 'locked';

    update reconciliation_matches
       set reopened_at = now(), reopened_reason = 'entry_reversed'
     where entry_id = new.id and reopened_at is null;

    insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    select new.org_id, new.posted_by, 'reconcile.reopen_on_reversal', 'reconciliation', m.id,
           jsonb_build_object('entry_id', new.id, 'session_id', m.session_id)
    from reconciliation_matches m
    where m.entry_id = new.id and m.reopened_reason = 'entry_reversed' and m.reopened_at >= now() - interval '1 second';
  end if;
  return new;
end$$;

drop trigger if exists journal_entries_reconcile_reopen on public.journal_entries;
create trigger journal_entries_reconcile_reopen
  after update of status on public.journal_entries
  for each row execute function public.reconciliation_reopen_on_reversal();
