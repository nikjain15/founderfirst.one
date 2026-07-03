-- =============================================================================
-- FounderFirst — W3.5 · Receipt capture + match
-- =============================================================================
--
-- An owner snaps or texts a receipt; Penny parses (vendor/amount/date), matches it
-- to an existing transaction on amount+date window (the W1.1 matcher discipline —
-- exact first, fuzzy second), and the match flows through the W3.2 tier pipeline:
--   • HIGH confidence → auto-ATTACH to the matched entry + a "Penny did this" feed
--     row (kind='receipt_matched'); no card.
--   • LOW / unknown → a confirm card in Review (the owner taps to attach), subject
--     to the same ≤5-asks/week budget the tiering already enforces.
--   • no candidate at all → the receipt lands in a short UNMATCHED queue, resolvable
--     without leaving the flow (reuses the W1.1 unmatched pattern).
--
-- This migration reuses everything already built — it invents no new tier model,
-- no new confidence cutoff, no new budget:
--   • Tier cutoffs + the ≤5 asks/week budget stay DATA (platform_config via
--     get_effective_behavior_config, CENTRAL-1). The edge fn bands the match with
--     the SAME tierFor() it uses for categorization — no magic number here.
--   • The feed is penny_activity (W3.2). We extend its `kind` check to allow
--     'receipt_matched' and record the attach as a feed row so W3.1/W3.4 surface it
--     for free.
--   • Audit is ledger_audit (20260630080000), written by the attach RPC via the
--     same actor-carrying helper shape reconciliation uses.
--   • The asset lives in a PRIVATE storage bucket 'receipts' (business financial
--     data — NOT public like content-audio); object access is RLS-scoped to org
--     members via can_access_org, reads are signed URLs minted by the edge fn.
--
-- Apply MANUALLY (LEARNINGS rule 3) — written, NOT deployed by the build loop.
-- Unique timestamp 20260705030000 (main max was 20260705020000).
-- =============================================================================

-- ── PRIVATE storage bucket for receipt assets ───────────────────────────────
-- Unlike content-audio (public, embedded on the blog), receipts are a business's
-- private financial records. The bucket is NOT public; every read/write is gated
-- by an object RLS policy that resolves the owning org from the object path
-- (`<org_id>/<receipt_id>.<ext>`) and checks can_access_org. The edge fn uploads
-- with the service role (bypasses RLS) and hands the app a short-lived signed URL.
-- Bound the asset at the bucket level too (defense-in-depth with the edge fn):
-- 10 MB max, raster image types only — SVG is excluded (it can carry script and
-- would execute when rendered from a signed URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: the first path segment is the org id. can_access_org on that
-- segment gates both read and (defensive) direct writes. Service-role writes in
-- the edge fn bypass these anyway; the policies protect any direct client access.
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and can_access_org((split_part(name, '/', 1))::uuid)
  );

drop policy if exists receipts_no_client_write on storage.objects;
create policy receipts_no_client_write on storage.objects
  for insert to authenticated
  with check (false);   -- writes go only through the edge fn (service role)

-- ── receipts: one row per captured receipt ──────────────────────────────────
-- Lifecycle: 'unmatched' (parsed, no candidate / awaiting confirm) →
-- 'attached' (linked to a ledger entry) → 'dismissed' (owner discarded it).
do $$ begin
  create type receipt_status as enum ('unmatched', 'attached', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.receipts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  -- capture source: a photo upload or pasted/forwarded text. (Voice + email-in are
  -- explicitly OUT of W3.5 — a later card, per the roadmap.)
  capture_kind   text not null default 'photo' check (capture_kind in ('photo', 'text')),
  storage_path   text,                         -- object path in the 'receipts' bucket (null for text-only)
  -- parsed fields (from the AI layer; recorded to ai_decisions by the edge fn).
  vendor         text,
  amount_minor   bigint,                       -- signed like a statement line: −out / +in (receipts are usually −out)
  receipt_date   date,
  raw_text       text,                         -- OCR/pasted text kept for the confirm card + re-match
  -- match result.
  status         receipt_status not null default 'unmatched',
  entry_id       uuid references journal_entries(id) on delete set null,  -- the transaction it attaches to
  match_kind     text check (match_kind in ('exact', 'fuzzy', 'manual')),
  confidence     numeric(4,3),                 -- the tiering confidence for the match (from the matcher)
  attached_by    uuid references auth.users(id) on delete set null,
  attached_at    timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists receipts_org_status on public.receipts (org_id, status, created_at desc);
create index if not exists receipts_entry on public.receipts (entry_id) where entry_id is not null;
-- A ledger entry carries at most ONE live (attached) receipt.
create unique index if not exists receipts_entry_live on public.receipts (entry_id) where status = 'attached';

alter table public.receipts enable row level security;

-- Read-only to anyone who can access the org; writes go through the RPCs only.
drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts for select using (can_access_org(org_id));
drop policy if exists receipts_nowrite on public.receipts;
create policy receipts_nowrite on public.receipts for all using (false) with check (false);

grant select on public.receipts to authenticated;
grant select, insert, update, delete on public.receipts to service_role;

-- Allow the receipt-matched kind on the W3.2 feed (was 'autopost_category' only).
alter table public.penny_activity drop constraint if exists penny_activity_kind_check;
alter table public.penny_activity
  add constraint penny_activity_kind_check
  check (kind in ('autopost_category', 'receipt_matched'));

-- ── helper: audit one receipt action (actor-carrying, tenant-scoped) ─────────
create or replace function public.receipt_audit(
  p_org uuid, p_actor uuid, p_action text, p_target uuid, p_detail jsonb
) returns void language sql security definer set search_path to 'public' as $$
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, p_action, 'receipt', p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- =============================================================================
-- record_receipt — persist a captured + parsed receipt (pre-match)
-- =============================================================================
-- The edge fn calls this after uploading the asset + parsing it. It returns the
-- new row so the fn can run the matcher and then attach/queue. Audit-logged as
-- receipt.capture.
create or replace function public.record_receipt(
  p_actor        uuid,
  p_org          uuid,
  p_capture_kind text,
  p_storage_path text,
  p_vendor       text,
  p_amount_minor bigint,
  p_receipt_date date,
  p_raw_text     text
) returns receipts
  language plpgsql security definer set search_path to 'public' as $$
declare v_r receipts;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not add a receipt to org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_capture_kind not in ('photo', 'text') then
    raise exception 'bad_capture_kind: %', p_capture_kind using errcode = 'invalid_parameter_value';
  end if;

  insert into receipts (org_id, capture_kind, storage_path, vendor, amount_minor, receipt_date, raw_text, created_by)
  values (p_org, p_capture_kind, p_storage_path, p_vendor, p_amount_minor, p_receipt_date, p_raw_text, p_actor)
  returning * into v_r;

  perform receipt_audit(p_org, p_actor, 'receipt.capture', v_r.id,
    jsonb_build_object('capture_kind', p_capture_kind, 'vendor', p_vendor,
                       'amount_minor', p_amount_minor, 'receipt_date', p_receipt_date,
                       'has_asset', p_storage_path is not null));
  return v_r;
end$$;

-- =============================================================================
-- attach_receipt — link a receipt to a ledger entry (the "did this" moment)
-- =============================================================================
-- Idempotent per (receipt): re-attaching to the SAME entry returns the row; the
-- unique index blocks two live receipts on one entry. HIGH-tier auto-attach and
-- the owner's confirm-card tap both call this — the difference is only whether the
-- edge fn records a feed row (high) vs. leaves it silent (owner-initiated).
-- Every attach writes ledger_audit (receipt.attach), so the audit trail shows the
-- receipt beside the transaction it documents.
create or replace function public.attach_receipt(
  p_actor      uuid,
  p_org        uuid,
  p_receipt_id uuid,
  p_entry_id   uuid,
  p_match_kind text,
  p_confidence numeric
) returns receipts
  language plpgsql security definer set search_path to 'public' as $$
declare v_r receipts; v_entry journal_entries;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not attach a receipt in org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_match_kind is not null and p_match_kind not in ('exact', 'fuzzy', 'manual') then
    raise exception 'bad_match_kind: %', p_match_kind using errcode = 'invalid_parameter_value';
  end if;

  select * into v_r from receipts where id = p_receipt_id and org_id = p_org for update;
  if not found then raise exception 'not_found: receipt % not in org %', p_receipt_id, p_org using errcode = 'no_data_found'; end if;

  -- Idempotent: already attached to this same entry → return unchanged.
  if v_r.status = 'attached' and v_r.entry_id = p_entry_id then
    return v_r;
  end if;
  if v_r.status = 'attached' then
    raise exception 'already_attached: receipt % is attached to entry %', p_receipt_id, v_r.entry_id using errcode = 'restrict_violation';
  end if;

  select * into v_entry from journal_entries where id = p_entry_id and org_id = p_org;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_entry.status = 'reversed' then
    raise exception 'entry_reversed: cannot attach a receipt to a reversed entry' using errcode = 'restrict_violation';
  end if;

  update receipts
     set status = 'attached', entry_id = p_entry_id, match_kind = p_match_kind,
         confidence = case when p_confidence is null then null else round(greatest(0, least(1, p_confidence))::numeric, 3) end,
         attached_by = p_actor, attached_at = now()
   where id = p_receipt_id
  returning * into v_r;

  perform receipt_audit(p_org, p_actor, 'receipt.attach', v_r.id,
    jsonb_build_object('entry_id', p_entry_id, 'match_kind', p_match_kind, 'confidence', v_r.confidence));
  return v_r;
exception
  when unique_violation then
    raise exception 'entry_has_receipt: entry % already has a receipt attached', p_entry_id using errcode = 'unique_violation';
end$$;

-- =============================================================================
-- autoattach_receipt — HIGH tier: attach + record a "Penny did this" feed row
-- =============================================================================
-- The receipt analogue of autopost_categorization: on a HIGH-confidence match the
-- edge fn calls this so the attach shows in the feed with the same look as an
-- auto-categorization. The feed row references the matched ENTRY (so undo/detach
-- can find it) and the receipt id lives in the summary/detail. No separate undo
-- RPC is needed — detach_receipt (below) covers the 1-tap reversal of the link.
create or replace function public.autoattach_receipt(
  p_actor      uuid,
  p_org        uuid,
  p_receipt_id uuid,
  p_entry_id   uuid,
  p_match_kind text,
  p_confidence numeric,
  p_summary    text
) returns penny_activity
  language plpgsql security definer set search_path to 'public' as $$
declare v_r receipts; v_row penny_activity; v_acct uuid;
begin
  -- attach_receipt enforces auth + all guards; we add only the feed row.
  v_r := attach_receipt(p_actor, p_org, p_receipt_id, p_entry_id, p_match_kind, p_confidence);

  -- One feed row per attached receipt; a retry (same receipt) is a no-op.
  select * into v_row from penny_activity
   where org_id = p_org and kind = 'receipt_matched' and entry_id = p_entry_id
     and summary like '%' || p_receipt_id::text || '%';
  if found then return v_row; end if;

  -- Best-effort: surface the account the entry sits on for the feed line (nullable).
  select account_id into v_acct from journal_lines where entry_id = p_entry_id limit 1;

  insert into penny_activity (org_id, kind, entry_id, account_id, source, confidence, summary, actor)
  values (p_org, 'receipt_matched', p_entry_id, v_acct, 'penny',
          coalesce(round(greatest(0, least(1, p_confidence))::numeric, 3), 0), p_summary || ' [' || p_receipt_id::text || ']', p_actor)
  returning * into v_row;

  return v_row;
end$$;

-- =============================================================================
-- detach_receipt — undo the link (does NOT touch the ledger entry)
-- =============================================================================
-- A receipt attach is metadata, not a posting, so undoing it just unlinks — the
-- entry is untouched (contrast W3.2's undo, which REVERSES a posting). The receipt
-- returns to the unmatched queue so the owner can re-point it. Audit-logged.
create or replace function public.detach_receipt(
  p_actor uuid, p_org uuid, p_receipt_id uuid
) returns receipts
  language plpgsql security definer set search_path to 'public' as $$
declare v_r receipts; v_prev uuid;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not detach a receipt in org %', p_org using errcode = 'insufficient_privilege';
  end if;
  select * into v_r from receipts where id = p_receipt_id and org_id = p_org for update;
  if not found then raise exception 'not_found: receipt % not in org %', p_receipt_id, p_org using errcode = 'no_data_found'; end if;
  if v_r.status <> 'attached' then return v_r; end if;   -- nothing to undo (idempotent)

  v_prev := v_r.entry_id;
  update receipts
     set status = 'unmatched', entry_id = null, match_kind = null, confidence = null,
         attached_by = null, attached_at = null
   where id = p_receipt_id
  returning * into v_r;

  -- Mark any matching feed row undone (soft) so the "Penny did this" list reflects it.
  update penny_activity
     set undone_at = now(), undone_by = p_actor
   where org_id = p_org and kind = 'receipt_matched' and entry_id = v_prev
     and summary like '%' || p_receipt_id::text || '%' and undone_at is null;

  perform receipt_audit(p_org, p_actor, 'receipt.detach', v_r.id,
    jsonb_build_object('was_entry_id', v_prev));
  return v_r;
end$$;

-- =============================================================================
-- dismiss_receipt — owner discards a receipt that matches nothing
-- =============================================================================
create or replace function public.dismiss_receipt(
  p_actor uuid, p_org uuid, p_receipt_id uuid
) returns receipts
  language plpgsql security definer set search_path to 'public' as $$
declare v_r receipts;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not dismiss a receipt in org %', p_org using errcode = 'insufficient_privilege';
  end if;
  update receipts set status = 'dismissed', entry_id = null, match_kind = null, confidence = null
   where id = p_receipt_id and org_id = p_org and status <> 'attached'
  returning * into v_r;
  if not found then
    select * into v_r from receipts where id = p_receipt_id and org_id = p_org;
    if not found then raise exception 'not_found: receipt % not in org %', p_receipt_id, p_org using errcode = 'no_data_found'; end if;
    if v_r.status = 'attached' then raise exception 'attached: detach the receipt before dismissing it' using errcode = 'restrict_violation'; end if;
    return v_r;  -- already dismissed
  end if;
  perform receipt_audit(p_org, p_actor, 'receipt.dismiss', v_r.id, '{}'::jsonb);
  return v_r;
end$$;

-- =============================================================================
-- Readers (RLS-scoped, direct client reads)
-- =============================================================================
-- The short unmatched queue (status='unmatched'), newest first.
create or replace function public.list_unmatched_receipts(p_org uuid, p_limit int default 50)
returns setof receipts
language sql stable security definer set search_path = public as $$
  select * from receipts
   where org_id = p_org and status = 'unmatched' and can_access_org(p_org)
   order by created_at desc
   limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;
grant execute on function public.list_unmatched_receipts(uuid, int) to authenticated;

-- The receipt (if any) attached to a given ledger entry — for the transaction row.
create or replace function public.receipt_for_entry(p_org uuid, p_entry_id uuid)
returns setof receipts
language sql stable security definer set search_path = public as $$
  select * from receipts
   where org_id = p_org and entry_id = p_entry_id and status = 'attached' and can_access_org(p_org)
   limit 1;
$$;
grant execute on function public.receipt_for_entry(uuid, uuid) to authenticated;

-- All attached receipts for an org keyed by entry — the app hydrates the row
-- indicator in one query instead of N.
create or replace function public.list_attached_receipts(p_org uuid)
returns setof receipts
language sql stable security definer set search_path = public as $$
  select * from receipts
   where org_id = p_org and status = 'attached' and can_access_org(p_org);
$$;
grant execute on function public.list_attached_receipts(uuid) to authenticated;

-- ── ISOTEST lockdown: SECDEF, service_role-EXECUTE only (no p_actor forgery) ──
revoke all on function public.receipt_audit(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.record_receipt(uuid, uuid, text, text, text, bigint, date, text) from public;
revoke all on function public.attach_receipt(uuid, uuid, uuid, uuid, text, numeric) from public;
revoke all on function public.autoattach_receipt(uuid, uuid, uuid, uuid, text, numeric, text) from public;
revoke all on function public.detach_receipt(uuid, uuid, uuid) from public;
revoke all on function public.dismiss_receipt(uuid, uuid, uuid) from public;
grant execute on function public.receipt_audit(uuid, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.record_receipt(uuid, uuid, text, text, text, bigint, date, text) to service_role;
grant execute on function public.attach_receipt(uuid, uuid, uuid, uuid, text, numeric) to service_role;
grant execute on function public.autoattach_receipt(uuid, uuid, uuid, uuid, text, numeric, text) to service_role;
grant execute on function public.detach_receipt(uuid, uuid, uuid) to service_role;
grant execute on function public.dismiss_receipt(uuid, uuid, uuid) to service_role;

-- =============================================================================
-- End of migration.
-- =============================================================================
