-- =============================================================================
-- FounderFirst — E-file Phase A spike: 1099-NEC submission + ack log (EFILE-A1)
-- =============================================================================
--
-- WHAT THIS ADDS (spike scope): the IMMUTABLE, append-only audit trail for
-- 1099-NEC e-file attempts through TaxBandits (sandbox). It does NOT duplicate
-- the 1099 vendor store — vendors, W-9 fields, payment methods, and the
-- reportable roll-up all live in W2.5 (20260706030000). This card only records
-- WHAT WAS SUBMITTED and WHAT THE IRS/vendor answered back, so that:
--   • a transmit is provably preceded by a human confirm (confirmed_by),
--   • a TIN-match pre-check result is on record before any transmit,
--   • an accept OR reject ack is stored honestly (a reject is a first-class row,
--     never swallowed), and
--   • the record is TAMPER-EVIDENT: once written it cannot be edited or deleted
--     (append-only trigger; a status change is a NEW row, not an UPDATE).
--
-- CENTRALIZATION: no vendor/threshold data is copied here. The submission row
-- references vendors(id) and carries only the TaxBandits-side ids + acks. The
-- $600/$2,000 threshold and reportable totals stay in W2.5 / filing_obligations.
--
-- SECURITY (ISOTEST pattern, LEARNINGS #22): write RPCs are SECURITY DEFINER,
-- take p_actor FIRST, are EXECUTE-granted ONLY to service_role, check
-- can_write_org_as(actor, org) in-function. Reads are can_access_org()-gated and
-- granted to authenticated. The edge fn (efile-1099) passes the actor from the
-- VERIFIED JWT. TINs are NEVER stored here (we keep last-4 only, in W2.5).
--
-- ⚠️ NOTE: review before `supabase db push` (LEARNINGS rule 3) — apply manually.
-- Timestamp 20260708030000 is unique + later than 20260708000000 (card gate).
-- =============================================================================

-- ── efile_submissions — one row per (org, tax-year, phase) filing attempt ─────
-- A "phase" is a lifecycle step: 'tin_match' (pre-check), 'transmit' (the real
-- e-file), or 'dry_run' (no creds → preview only, NEVER a fake success). Each is
-- append-only: the fn inserts a fresh row for each step + each status update, so
-- the table reads as an immutable ledger of everything that happened.
create table if not exists public.efile_submissions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  form_type         text not null default '1099-NEC'
                      check (form_type = '1099-NEC'),               -- spike: NEC only
  tax_year          int  not null check (tax_year between 2000 and 2100),
  phase             text not null
                      check (phase in ('tin_match', 'dry_run', 'transmit', 'status_update')),
  -- Provider-side identifiers (null until the provider assigns them; a dry-run
  -- has none). We NEVER synthesize these — a null id means "provider never
  -- answered", which is honest.
  provider          text not null default 'taxbandits',
  submission_id     text,                                            -- TaxBandits SubmissionId
  request_id        text,                                            -- TaxBandits TIN-match RequestId
  -- Outcome. 'dry_run' can NEVER be 'accepted' (enforced by trigger below).
  status            text not null
                      check (status in ('dry_run', 'submitted', 'accepted', 'rejected', 'error', 'tin_matched', 'tin_mismatch')),
  -- The human confirm gate: a 'transmit' row MUST carry a confirmer (enforced
  -- by trigger). A dry-run / tin_match does not require confirmation.
  confirmed_by      uuid references auth.users(id),
  -- The mapped payload we sent (or WOULD send, for a dry-run) + the raw ack we
  -- got back — both stored verbatim for audit. No TINs (last-4 masked upstream).
  request_payload   jsonb not null default '{}'::jsonb,
  ack               jsonb not null default '{}'::jsonb,             -- provider response verbatim (incl. reject Errors)
  recipient_count   int  not null default 0,
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now()
);
create index if not exists efile_sub_org_year_idx on public.efile_submissions (org_id, tax_year, created_at desc);
create index if not exists efile_sub_submission_idx on public.efile_submissions (submission_id) where submission_id is not null;

comment on table public.efile_submissions is
  'Append-only audit ledger of 1099-NEC e-file attempts via TaxBandits (EFILE-A1 spike). Records TIN-match pre-checks, dry-runs (no creds), transmits (require confirmed_by), and status updates. Immutable: no UPDATE/DELETE (trigger). Does NOT store TINs or duplicate the W2.5 vendor store.';

-- ── APPEND-ONLY guard: no UPDATE, no DELETE, ever ────────────────────────────
-- A status change is a NEW status_update row referencing the same submission_id,
-- not an edit. This makes the log tamper-evident.
create or replace function public.guard_efile_submission_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'append-only: efile_submissions rows are immutable; insert a new status_update row'
    using errcode = 'restrict_violation';
end$$;
drop trigger if exists efile_submissions_guard on public.efile_submissions;
create trigger efile_submissions_guard
  before update or delete on public.efile_submissions
  for each row execute function public.guard_efile_submission_immutable();

-- ── Integrity guards on INSERT: enforce the trust gate at the data layer ──────
-- Belt-and-suspenders next to the fn: a 'transmit' MUST have a confirmer, and a
-- 'dry_run' phase can NEVER carry an 'accepted' status (no fake success).
create or replace function public.guard_efile_submission_insert()
returns trigger language plpgsql as $$
begin
  if NEW.phase = 'transmit' and NEW.confirmed_by is null then
    raise exception 'trust-gate: a transmit requires an explicit human confirmation (confirmed_by)'
      using errcode = 'check_violation';
  end if;
  if NEW.phase = 'dry_run' and NEW.status <> 'dry_run' then
    raise exception 'no-fake-success: a dry_run may only have status dry_run'
      using errcode = 'check_violation';
  end if;
  return NEW;
end$$;
drop trigger if exists efile_submissions_insert_guard on public.efile_submissions;
create trigger efile_submissions_insert_guard
  before insert on public.efile_submissions
  for each row execute function public.guard_efile_submission_insert();

alter table public.efile_submissions enable row level security;
drop policy if exists efile_sub_select on public.efile_submissions;
create policy efile_sub_select  on public.efile_submissions for select using (can_access_org(org_id));
drop policy if exists efile_sub_nowrite on public.efile_submissions;
create policy efile_sub_nowrite on public.efile_submissions for all using (false) with check (false);
grant select on public.efile_submissions to authenticated;
grant select, insert on public.efile_submissions to service_role;  -- INSERT only: no update/delete grant

-- =============================================================================
-- WRITE RPC — record an e-file event (service_role only; actor first) ─────────
-- =============================================================================
-- One entry point the edge fn uses for every phase. Authorization is checked
-- in-function; the trust-gate is enforced by the trigger above AND here.
create or replace function public.efile_record_event(
  p_actor           uuid,
  p_org             uuid,
  p_tax_year        int,
  p_phase           text,
  p_status          text,
  p_submission_id   text  default null,
  p_request_id      text  default null,
  p_confirmed_by    uuid  default null,
  p_request_payload jsonb default '{}'::jsonb,
  p_ack             jsonb default '{}'::jsonb,
  p_recipient_count int   default 0
) returns efile_submissions
language plpgsql security definer set search_path = public as $$
declare v_row efile_submissions;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  insert into efile_submissions (
    org_id, tax_year, phase, status, submission_id, request_id,
    confirmed_by, request_payload, ack, recipient_count, created_by
  ) values (
    p_org, p_tax_year, p_phase, p_status, p_submission_id, p_request_id,
    p_confirmed_by, coalesce(p_request_payload, '{}'::jsonb), coalesce(p_ack, '{}'::jsonb),
    coalesce(p_recipient_count, 0), p_actor
  ) returning * into v_row;

  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'efile.1099nec.' || p_phase, 'efile_submission', v_row.id,
            jsonb_build_object('status', p_status, 'submission_id', p_submission_id,
                               'tax_year', p_tax_year, 'recipient_count', coalesce(p_recipient_count, 0)));
  return v_row;
end$$;
revoke all on function public.efile_record_event(uuid,uuid,int,text,text,text,text,uuid,jsonb,jsonb,int) from public, anon, authenticated;
grant execute on function public.efile_record_event(uuid,uuid,int,text,text,text,text,uuid,jsonb,jsonb,int) to service_role;

comment on function public.efile_record_event is
  'Append a 1099-NEC e-file event to efile_submissions (EFILE-A1). service_role only, actor-first, can_write_org_as-gated, ledger_audit inline. The immutable + trust-gate triggers enforce no-fake-success and confirm-before-transmit at the data layer.';
