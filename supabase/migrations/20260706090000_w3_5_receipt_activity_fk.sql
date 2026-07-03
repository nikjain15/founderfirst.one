-- W5.2 · F5 fix — key the receipt feed row's dedup/undo off a REAL foreign key,
-- not a `summary LIKE '%uuid%'` substring over free-text owner copy.
--
-- Audit Program 4, F5: `autoattach_receipt` (dedup) and `detach_receipt` (undo)
-- located the penny_activity feed row with `summary like '%'||p_receipt_id||'%'`.
-- That couples correctness to the owner-facing copy: a future copy change that
-- drops the `[uuid]` suffix would silently break both dedup (double feed rows on
-- retry) and undo (a detached receipt's feed row never marked undone). W3.2's
-- sibling (`autopost_categorization`) already keys off a real column (`entry_id`);
-- this brings receipts to the same discipline.
--
-- Fix: add a nullable `receipt_id uuid` FK column to penny_activity, backfill it
-- from the existing `[uuid]` suffix on receipt_matched rows, and CREATE OR REPLACE
-- both RPCs to dedup/undo off `receipt_id =` instead of the substring match.
-- Write-don't-deploy: the deployed 20260705030000 migration is untouched.

-- 1. The real key. Nullable (only receipt_matched rows carry it; categorization
--    feed rows leave it null). ON DELETE SET NULL — the feed row survives a receipt
--    row being purged (audit history), it just loses the back-reference.
alter table public.penny_activity
  add column if not exists receipt_id uuid references public.receipts(id) on delete set null;

-- Fast, tenant-scoped lookup for dedup/undo (the same shape as entry_id lookups).
create index if not exists penny_activity_receipt
  on public.penny_activity (org_id, receipt_id)
  where receipt_id is not null;

-- 2. Backfill existing receipt_matched rows from the trailing `[uuid]` suffix that
--    the old code appended to `summary`. Parse the LAST bracketed UUID and set the
--    key; only when it resolves to a real receipt in the same org (safety).
update public.penny_activity a
   set receipt_id = r.id
  from public.receipts r
 where a.kind = 'receipt_matched'
   and a.receipt_id is null
   and r.org_id = a.org_id
   and a.summary ~ '\[[0-9a-fA-F-]{36}\]\s*$'
   and r.id = (substring(a.summary from '\[([0-9a-fA-F-]{36})\]\s*$'))::uuid;

-- 3. autoattach_receipt — dedup off receipt_id, and stamp it on the new feed row.
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

  -- One feed row per attached receipt; a retry (same receipt) is a no-op. Keyed
  -- off the real receipt_id FK (F5) — NOT a summary substring.
  select * into v_row from penny_activity
   where org_id = p_org and kind = 'receipt_matched' and receipt_id = p_receipt_id;
  if found then return v_row; end if;

  -- Best-effort: surface the account the entry sits on for the feed line (nullable).
  select account_id into v_acct from journal_lines where entry_id = p_entry_id limit 1;

  insert into penny_activity (org_id, kind, entry_id, account_id, source, confidence, summary, actor, receipt_id)
  values (p_org, 'receipt_matched', p_entry_id, v_acct, 'penny',
          coalesce(round(greatest(0, least(1, p_confidence))::numeric, 3), 0),
          p_summary || ' [' || p_receipt_id::text || ']', p_actor, p_receipt_id)
  returning * into v_row;

  return v_row;
end$$;

-- 4. detach_receipt — mark the feed row undone off receipt_id (F5).
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

  -- Mark the matching feed row undone (soft) — keyed off receipt_id (F5), not a
  -- summary substring, so a copy change can never orphan the undo.
  update penny_activity
     set undone_at = now(), undone_by = p_actor
   where org_id = p_org and kind = 'receipt_matched' and receipt_id = p_receipt_id
     and undone_at is null;

  perform receipt_audit(p_org, p_actor, 'receipt.detach', v_r.id,
    jsonb_build_object('was_entry_id', v_prev));
  return v_r;
end$$;
