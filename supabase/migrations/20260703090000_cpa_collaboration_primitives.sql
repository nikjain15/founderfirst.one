-- =============================================================================
-- FounderFirst — CPA collaboration primitives (card W1.5)
-- =============================================================================
--
-- The four ways a CPA collaborates on a client's books WITHOUT unilaterally
-- moving money — every action audit-logged, nothing posting without the required
-- approval (BACKLOG W1.5, APP_PRINCIPLES trust-tier model):
--
--   FLAG        cpa_flag_entry / cpa_resolve_flag   → surfaces in the W1.4
--               practice queue's reserved `flagged` column (rank 4, Journal tab).
--   NOTE        cpa_add_note                        → an annotation thread on an
--               entry; visible to both sides, mutates nothing.
--   ADD TXN     cpa_add_transaction                 → a MEDIUM-tier suggestion the
--               OWNER acknowledges; only on acknowledge does the entry post.
--   RECLASS     cpa_suggest_reclass                 → a MEDIUM-tier suggestion the
--               OWNER approves; on approve → recategorize_entry (which learns a
--               rule) runs. Until approved NOTHING moves.
--
-- Owner side: cpa_suggestions IS the owner's "needs-a-look" trust-tiered surface.
-- A suggestion is status 'pending_review' (medium tier) until the owner approves
-- or rejects. owner_approve_suggestion is the single round-trip that turns an
-- approved reclass into a recategorized entry + a learned rule (proven by test).
--
-- SECURITY (ISOTEST pattern, LEARNINGS #: 22 forged-actor RPCs → service_role):
--   Every write RPC is SECURITY DEFINER, takes p_actor FIRST, and is EXECUTE-
--   granted ONLY to service_role — the edge function passes the actor from the
--   VERIFIED JWT, never the body. Authorization is enforced in-function:
--     · CPA-side writes require can_write_org_as(actor, org) — a read_only CPA
--       (engagement access='read_only') fails this, so cannot flag/note/suggest.
--     · owner-side approve/ack require has_membership_as(actor, org) — a CPA
--       cannot self-approve their own suggestion (mirrors approve_journal_entry).
--   Reads are SECURITY DEFINER gated by can_access_org() and EXECUTE-granted to
--   authenticated (RLS-equivalent), matching list_uncategorized_entries.
--
-- PERIOD-LOCK: nothing posts into a closed period. add_txn posts via
--   post_journal_entry (→ ensure_open_period raises on a closed period); reclass
--   approval delegates to recategorize_entry, which already reposts corrections
--   into an open period. Both respected transitively — no new posting path here.
--
-- NOTE: review before `supabase db push` (LEARNINGS rule 3) — apply manually.
-- Timestamp 20260703060000 is unique in the ledger (rule 11); 060000 range
-- reserved for W1.5 per the loop card.
-- =============================================================================

-- ── enums ────────────────────────────────────────────────────────────────────
-- Suggestion kind (what the owner is being asked to accept) and lifecycle status.
-- 'pending_review' mirrors entry_status so the owner surface reads one vocabulary.
do $$ begin
  create type cpa_suggestion_kind as enum ('reclass', 'add_txn');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cpa_suggestion_status as enum ('pending_review', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ── entry_flags — a CPA's "look at this" on a specific entry ──────────────────
create table if not exists public.entry_flags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entry_id    uuid not null references journal_entries(id) on delete cascade,
  reason      text,
  status      text not null default 'open',   -- open | resolved
  flagged_by  uuid not null references auth.users(id),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists entry_flags_org_open_idx
  on public.entry_flags (org_id) where status = 'open';
-- One OPEN flag per entry — re-flagging an already-flagged entry is a no-op, not
-- a duplicate queue row (keeps the practice-queue `flagged` count honest).
create unique index if not exists entry_flags_one_open_per_entry
  on public.entry_flags (entry_id) where status = 'open';

alter table public.entry_flags enable row level security;
drop policy if exists entry_flags_select on public.entry_flags;
create policy entry_flags_select  on public.entry_flags for select using (can_access_org(org_id));
drop policy if exists entry_flags_nowrite on public.entry_flags;
create policy entry_flags_nowrite on public.entry_flags for all using (false) with check (false);
grant select on public.entry_flags to authenticated;
grant select, insert, update on public.entry_flags to service_role;

-- ── entry_notes — an annotation thread on an entry (no state, just words) ─────
create table if not exists public.entry_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  entry_id   uuid not null references journal_entries(id) on delete cascade,
  body       text not null,
  author     uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists entry_notes_entry_idx on public.entry_notes (entry_id, created_at);

alter table public.entry_notes enable row level security;
drop policy if exists entry_notes_select on public.entry_notes;
create policy entry_notes_select  on public.entry_notes for select using (can_access_org(org_id));
drop policy if exists entry_notes_nowrite on public.entry_notes;
create policy entry_notes_nowrite on public.entry_notes for all using (false) with check (false);
grant select on public.entry_notes to authenticated;
grant select, insert on public.entry_notes to service_role;

-- ── cpa_suggestions — the owner's trust-tiered "needs-a-look" surface ─────────
-- MEDIUM tier: a CPA proposal the owner must accept before anything posts.
--   reclass  → entry_id + from/to account; on approve → recategorize_entry.
--   add_txn  → lines (jsonb, same shape post_journal_entry takes) + entry_date;
--              on approve → post_journal_entry (a brand-new entry).
-- resulting_entry_id records what got posted/reposted so the UI can link through.
create table if not exists public.cpa_suggestions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  kind             cpa_suggestion_kind   not null,
  status           cpa_suggestion_status not null default 'pending_review',
  entry_id         uuid references journal_entries(id) on delete cascade,  -- reclass target
  from_account_id  uuid references ledger_accounts(id),                    -- reclass source
  to_account_id    uuid references ledger_accounts(id),                    -- reclass/target account
  entry_date       date,                                                   -- add_txn
  lines            jsonb,                                                  -- add_txn (post_journal_entry shape)
  memo             text,
  note             text,                                                   -- CPA's rationale to the owner
  suggested_by     uuid not null references auth.users(id),
  decided_by       uuid references auth.users(id),
  decided_at       timestamptz,
  resulting_entry_id uuid references journal_entries(id),
  created_at       timestamptz not null default now()
);
create index if not exists cpa_suggestions_org_pending_idx
  on public.cpa_suggestions (org_id, created_at) where status = 'pending_review';

alter table public.cpa_suggestions enable row level security;
drop policy if exists cpa_suggestions_select on public.cpa_suggestions;
create policy cpa_suggestions_select  on public.cpa_suggestions for select using (can_access_org(org_id));
drop policy if exists cpa_suggestions_nowrite on public.cpa_suggestions;
create policy cpa_suggestions_nowrite on public.cpa_suggestions for all using (false) with check (false);
grant select on public.cpa_suggestions to authenticated;
grant select, insert, update on public.cpa_suggestions to service_role;

-- =============================================================================
-- WRITE RPCs — service_role only, actor-first, tenant + role + period gated.
-- =============================================================================

-- ── cpa_flag_entry ────────────────────────────────────────────────────────────
-- A write-capable CPA (or owner) flags an entry. Idempotent: a second flag on an
-- entry with an open flag returns the existing one (unique partial index).
create or replace function cpa_flag_entry(p_actor uuid, p_org uuid, p_entry_id uuid, p_reason text default null)
returns entry_flags language plpgsql security definer set search_path = public as $$
declare v_f entry_flags;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from journal_entries where id = p_entry_id and org_id = p_org) then
    raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found';
  end if;
  select * into v_f from entry_flags where entry_id = p_entry_id and status = 'open';
  if found then return v_f; end if;              -- idempotent: one open flag per entry
  insert into entry_flags (org_id, entry_id, reason, flagged_by)
    values (p_org, p_entry_id, p_reason, p_actor) returning * into v_f;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'entry.flag', 'journal_entry', p_entry_id,
            jsonb_build_object('flag_id', v_f.id, 'reason', p_reason));
  return v_f;
end$$;
revoke all on function cpa_flag_entry(uuid, uuid, uuid, text) from public;
grant execute on function cpa_flag_entry(uuid, uuid, uuid, text) to service_role;

-- ── cpa_resolve_flag ──────────────────────────────────────────────────────────
create or replace function cpa_resolve_flag(p_actor uuid, p_org uuid, p_flag_id uuid)
returns entry_flags language plpgsql security definer set search_path = public as $$
declare v_f entry_flags;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update entry_flags set status = 'resolved', resolved_by = p_actor, resolved_at = now()
   where id = p_flag_id and org_id = p_org and status = 'open'
  returning * into v_f;
  if not found then raise exception 'not_found: no open flag % in org %', p_flag_id, p_org using errcode = 'no_data_found'; end if;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'entry.flag_resolve', 'journal_entry', v_f.entry_id,
            jsonb_build_object('flag_id', v_f.id));
  return v_f;
end$$;
revoke all on function cpa_resolve_flag(uuid, uuid, uuid) from public;
grant execute on function cpa_resolve_flag(uuid, uuid, uuid) to service_role;

-- ── cpa_add_note ──────────────────────────────────────────────────────────────
create or replace function cpa_add_note(p_actor uuid, p_org uuid, p_entry_id uuid, p_body text)
returns entry_notes language plpgsql security definer set search_path = public as $$
declare v_n entry_notes;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'empty_note: a note needs a body' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from journal_entries where id = p_entry_id and org_id = p_org) then
    raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found';
  end if;
  insert into entry_notes (org_id, entry_id, body, author)
    values (p_org, p_entry_id, trim(p_body), p_actor) returning * into v_n;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'entry.note', 'journal_entry', p_entry_id,
            jsonb_build_object('note_id', v_n.id));
  return v_n;
end$$;
revoke all on function cpa_add_note(uuid, uuid, uuid, text) from public;
grant execute on function cpa_add_note(uuid, uuid, uuid, text) to service_role;

-- ── cpa_suggest_reclass — MEDIUM tier; NOTHING moves until the owner approves ─
-- Validates the entry has a line on the from-account and the target is a real,
-- non-archived account in the org — so an approve can never fail on stale input.
create or replace function cpa_suggest_reclass(
  p_actor uuid, p_org uuid, p_entry_id uuid,
  p_from_account_id uuid, p_to_account_id uuid, p_note text default null
) returns cpa_suggestions language plpgsql security definer set search_path = public as $$
declare v_s cpa_suggestions;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from journal_entries where id = p_entry_id and org_id = p_org and status = 'posted') then
    raise exception 'not_posted: only a posted entry can be reclassified' using errcode = 'restrict_violation';
  end if;
  if not exists (select 1 from ledger_accounts where id = p_to_account_id and org_id = p_org and is_archived = false) then
    raise exception 'bad_account: target account not in org (or archived)' using errcode = 'foreign_key_violation';
  end if;
  if not exists (
    select 1 from journal_lines where entry_id = p_entry_id and account_id = p_from_account_id
  ) then
    raise exception 'no_match: entry has no line on the from-account' using errcode = 'invalid_parameter_value';
  end if;
  insert into cpa_suggestions (org_id, kind, entry_id, from_account_id, to_account_id, note, suggested_by)
    values (p_org, 'reclass', p_entry_id, p_from_account_id, p_to_account_id, p_note, p_actor)
    returning * into v_s;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'suggestion.reclass', 'journal_entry', p_entry_id,
            jsonb_build_object('suggestion_id', v_s.id, 'from_account_id', p_from_account_id,
                               'to_account_id', p_to_account_id));
  return v_s;
end$$;
revoke all on function cpa_suggest_reclass(uuid, uuid, uuid, uuid, uuid, text) from public;
grant execute on function cpa_suggest_reclass(uuid, uuid, uuid, uuid, uuid, text) to service_role;

-- ── cpa_add_transaction — MEDIUM tier; the entry POSTS only on owner ack ─────
-- Stores the balanced lines (post_journal_entry shape) as a pending suggestion.
-- Nothing hits the ledger here — the owner acknowledges, then owner_approve
-- posts it. We still validate the lines up-front (balanced, ≥2) so an ack can't
-- fail on a malformed suggestion.
create or replace function cpa_add_transaction(
  p_actor uuid, p_org uuid, p_entry_date date, p_lines jsonb,
  p_memo text default null, p_note text default null
) returns cpa_suggestions language plpgsql security definer set search_path = public as $$
declare
  v_s cpa_suggestions; v_line jsonb; v_debits bigint := 0; v_credits bigint := 0;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_entry_date is null then raise exception 'bad_entry_date' using errcode = 'invalid_parameter_value'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'bad_lines: need at least two lines' using errcode = 'invalid_parameter_value';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if (v_line->>'account_id') is null or (v_line->>'side') not in ('D','C')
       or (v_line->>'amount_minor') is null or (v_line->>'amount_minor')::bigint <= 0 then
      raise exception 'bad_line: each line needs account_id, side D|C, positive amount_minor' using errcode = 'invalid_parameter_value';
    end if;
    if not exists (select 1 from ledger_accounts where id = (v_line->>'account_id')::uuid and org_id = p_org and is_archived = false) then
      raise exception 'bad_account: a line references an account not in this org (or archived)' using errcode = 'foreign_key_violation';
    end if;
    if (v_line->>'side') = 'D' then v_debits := v_debits + (v_line->>'amount_minor')::bigint;
    else                            v_credits := v_credits + (v_line->>'amount_minor')::bigint; end if;
  end loop;
  if v_debits <> v_credits then
    raise exception 'unbalanced: debits (%) <> credits (%)', v_debits, v_credits using errcode = 'check_violation';
  end if;
  insert into cpa_suggestions (org_id, kind, entry_date, lines, memo, note, suggested_by)
    values (p_org, 'add_txn', p_entry_date, p_lines, p_memo, p_note, p_actor)
    returning * into v_s;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'suggestion.add_txn', 'suggestion', v_s.id,
            jsonb_build_object('suggestion_id', v_s.id, 'entry_date', p_entry_date));
  return v_s;
end$$;
revoke all on function cpa_add_transaction(uuid, uuid, date, jsonb, text, text) from public;
grant execute on function cpa_add_transaction(uuid, uuid, date, jsonb, text, text) to service_role;

-- ── owner_approve_suggestion — the round-trip's owner half ───────────────────
-- Only a business MEMBER may approve (a CPA cannot self-approve — mirrors
-- approve_journal_entry). Dispatches by kind:
--   reclass → recategorize_entry(..., p_learn := true) → entry recategorized AND a
--             learned rule created (the round-trip's payoff, proven by test).
--   add_txn → post_journal_entry → the entry hits the books (period-lock enforced
--             transitively via ensure_open_period).
-- Idempotent: a re-approve of an already-approved suggestion returns it unchanged.
create or replace function owner_approve_suggestion(p_actor uuid, p_org uuid, p_suggestion_id uuid)
returns cpa_suggestions language plpgsql security definer set search_path = public as $$
declare v_s cpa_suggestions; v_e journal_entries; v_idem text;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may approve' using errcode = 'insufficient_privilege';
  end if;
  select * into v_s from cpa_suggestions where id = p_suggestion_id and org_id = p_org for update;
  if not found then raise exception 'not_found: suggestion % not in org %', p_suggestion_id, p_org using errcode = 'no_data_found'; end if;
  if v_s.status = 'approved' then return v_s; end if;                 -- idempotent replay
  if v_s.status <> 'pending_review' then
    raise exception 'not_pending: suggestion is not awaiting a decision' using errcode = 'restrict_violation';
  end if;

  v_idem := 'suggestion:' || v_s.id::text;
  if v_s.kind = 'reclass' then
    -- p_actor is the OWNER: recategorize_entry runs under owner authority (a
    -- member always passes can_write_org_as) and LEARNS the rule from the memo.
    v_e := recategorize_entry(p_actor, p_org, v_s.entry_id, v_s.from_account_id,
                              v_s.to_account_id, v_idem, true /* learn */);
  else -- add_txn: post the stored lines now (period-lock enforced downstream)
    v_e := post_journal_entry(p_actor, p_org, v_s.entry_date, v_idem,
                              v_s.lines, 'cpa_suggestion', v_s.id::text, v_s.memo);
  end if;

  update cpa_suggestions
     set status = 'approved', decided_by = p_actor, decided_at = now(), resulting_entry_id = v_e.id
   where id = v_s.id returning * into v_s;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'suggestion.approve', 'suggestion', v_s.id,
            jsonb_build_object('kind', v_s.kind, 'resulting_entry_id', v_e.id));
  return v_s;
end$$;
revoke all on function owner_approve_suggestion(uuid, uuid, uuid) from public;
grant execute on function owner_approve_suggestion(uuid, uuid, uuid) to service_role;

-- ── owner_reject_suggestion — the owner declines; nothing posts ──────────────
create or replace function owner_reject_suggestion(p_actor uuid, p_org uuid, p_suggestion_id uuid, p_note text default null)
returns cpa_suggestions language plpgsql security definer set search_path = public as $$
declare v_s cpa_suggestions;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may decide' using errcode = 'insufficient_privilege';
  end if;
  update cpa_suggestions
     set status = 'rejected', decided_by = p_actor, decided_at = now()
   where id = p_suggestion_id and org_id = p_org and status = 'pending_review'
  returning * into v_s;
  if not found then raise exception 'not_found: no pending suggestion % in org %', p_suggestion_id, p_org using errcode = 'no_data_found'; end if;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'suggestion.reject', 'suggestion', v_s.id,
            jsonb_build_object('kind', v_s.kind, 'note', p_note));
  return v_s;
end$$;
revoke all on function owner_reject_suggestion(uuid, uuid, uuid, text) from public;
grant execute on function owner_reject_suggestion(uuid, uuid, uuid, text) to service_role;

-- =============================================================================
-- READ RPCs — SECURITY DEFINER gated by can_access_org, granted to authenticated.
-- =============================================================================

-- ── list_cpa_suggestions — the owner's needs-a-look feed for one org ─────────
create or replace function list_cpa_suggestions(p_org uuid, p_status cpa_suggestion_status default 'pending_review')
returns setof cpa_suggestions language plpgsql stable security definer set search_path = public as $$
begin
  if not can_access_org(p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return query
    select * from cpa_suggestions
     where org_id = p_org and status = p_status
     order by created_at desc;
end$$;
revoke all on function list_cpa_suggestions(uuid, cpa_suggestion_status) from public;
grant execute on function list_cpa_suggestions(uuid, cpa_suggestion_status) to authenticated, service_role;

-- ── list_entry_activity — flags + notes on one entry (the collaboration thread) ─
create or replace function list_entry_activity(p_org uuid, p_entry_id uuid)
returns table (
  kind       text,          -- 'flag' | 'note'
  id         uuid,
  body       text,          -- note body / flag reason
  status     text,          -- flag status (null for notes)
  actor      uuid,
  created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not can_access_org(p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return query
    select 'flag'::text, f.id, f.reason, f.status, f.flagged_by, f.created_at
      from entry_flags f where f.org_id = p_org and f.entry_id = p_entry_id
    union all
    select 'note'::text, n.id, n.body, null::text, n.author, n.created_at
      from entry_notes n where n.org_id = p_org and n.entry_id = p_entry_id
    order by created_at asc;
end$$;
revoke all on function list_entry_activity(uuid, uuid) from public;
grant execute on function list_entry_activity(uuid, uuid) to authenticated, service_role;

-- =============================================================================
-- Wire FLAGS into the W1.4 practice queue — populate the reserved `flagged`
-- column (rank 4) rather than rebuilding the queue. Both functions are re-created
-- identically to 20260703030000 EXCEPT for the added flagged leg.
-- =============================================================================

create or replace function cpa_client_counts(p_firm uuid)
returns table (
  client_org_id  uuid, client_name text, access access_level,
  pending_review bigint, uncategorized bigint, unreconciled bigint,
  flagged bigint, upcoming_close bigint, total bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  with clients as ( select * from cpa_firm_clients(p_firm) ),
  pr as (
    select je.org_id, count(*) n from journal_entries je
      join clients c on c.client_org_id = je.org_id
     where je.status = 'pending_review' group by je.org_id
  ),
  uncat as (
    select je.org_id, count(distinct je.id) n from journal_entries je
      join journal_lines jl on jl.entry_id = je.id
      join ledger_accounts la on la.id = jl.account_id and la.is_archived = false
       and (la.code = '9999' or lower(la.name) = 'uncategorized')
      join clients c on c.client_org_id = je.org_id
     where je.status = 'posted' and je.source <> 'reversal' group by je.org_id
  ),
  unrec as (
    select ib.org_id, count(*) n from import_batches ib
      join clients c on c.client_org_id = ib.org_id
     where ib.status = 'previewed' group by ib.org_id
  ),
  flg as (
    select ef.org_id, count(*) n from entry_flags ef
      join clients c on c.client_org_id = ef.org_id
     where ef.status = 'open' group by ef.org_id
  ),
  closes as (
    select ap.org_id, count(*) n from accounting_periods ap
      join clients c on c.client_org_id = ap.org_id
     where ap.status = 'open' and ap.period_end < current_date group by ap.org_id
  )
  select
    c.client_org_id, c.client_name, c.access,
    coalesce(pr.n, 0), coalesce(uncat.n, 0), coalesce(unrec.n, 0),
    coalesce(flg.n, 0), coalesce(closes.n, 0),
    coalesce(pr.n,0)+coalesce(uncat.n,0)+coalesce(unrec.n,0)+coalesce(flg.n,0)+coalesce(closes.n,0)
  from clients c
  left join pr     on pr.org_id     = c.client_org_id
  left join uncat  on uncat.org_id  = c.client_org_id
  left join unrec  on unrec.org_id  = c.client_org_id
  left join flg    on flg.org_id    = c.client_org_id
  left join closes on closes.org_id = c.client_org_id
  order by
    (coalesce(pr.n,0)+coalesce(uncat.n,0)+coalesce(unrec.n,0)+coalesce(flg.n,0)+coalesce(closes.n,0)) desc,
    c.client_name;
end$$;
revoke all on function cpa_client_counts(uuid) from public;
grant execute on function cpa_client_counts(uuid) to authenticated, service_role;

create or replace function cpa_practice_queue(p_firm uuid, p_limit int default 200)
returns table (
  client_org_id uuid, client_name text, access access_level,
  kind text, rank int, surface text, ref_id uuid, title text, occurred_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare v_lim int := greatest(1, least(coalesce(p_limit, 200), 1000));
begin
  return query
  with clients as ( select * from cpa_firm_clients(p_firm) ),
  items as (
    select je.org_id, 'pending_review'::text kind, 1 rnk, 'journal'::text surface,
           je.id ref_id, coalesce(je.memo, je.source) title, je.created_at occurred_at
      from journal_entries je join clients c on c.client_org_id = je.org_id
     where je.status = 'pending_review'
    union all
    select je.org_id, 'uncategorized', 2, 'review',
           je.id, coalesce(je.memo, je.source_ref, je.source), je.created_at
      from journal_entries je join clients c on c.client_org_id = je.org_id
     where je.status = 'posted' and je.source <> 'reversal'
       and exists (
         select 1 from journal_lines jl
         join ledger_accounts la on la.id = jl.account_id and la.is_archived = false
          and (la.code = '9999' or lower(la.name) = 'uncategorized')
         where jl.entry_id = je.id )
    union all
    select ib.org_id, 'unreconciled', 3, 'import',
           ib.id, coalesce(ib.filename, ib.source::text), ib.created_at
      from import_batches ib join clients c on c.client_org_id = ib.org_id
     where ib.status = 'previewed'
    union all
    -- 4 · flagged (W1.5) — an open CPA flag; resolves on the Journal tab.
    select ef.org_id, 'flagged', 4, 'journal',
           ef.entry_id, coalesce(ef.reason, je.memo, je.source), ef.created_at
      from entry_flags ef
      join journal_entries je on je.id = ef.entry_id
      join clients c on c.client_org_id = ef.org_id
     where ef.status = 'open'
    union all
    select ap.org_id, 'upcoming_close', 5, 'periods',
           ap.id, (ap.period_start::text || ' → ' || ap.period_end::text),
           ap.period_end::timestamptz
      from accounting_periods ap join clients c on c.client_org_id = ap.org_id
     where ap.status = 'open' and ap.period_end < current_date
  )
  select i.org_id, c.client_name, c.access, i.kind, i.rnk, i.surface,
         i.ref_id, i.title, i.occurred_at
    from items i join clients c on c.client_org_id = i.org_id
   order by i.rnk, i.occurred_at asc
   limit v_lim;
end$$;
revoke all on function cpa_practice_queue(uuid, int) from public;
grant execute on function cpa_practice_queue(uuid, int) to authenticated, service_role;
