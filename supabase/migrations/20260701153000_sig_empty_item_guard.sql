-- =============================================================================
-- FounderFirst — Signals: never score/promote items with no title AND no body
-- =============================================================================
--
-- Some sources (facebook via API Direct) return posts whose title and snippet
-- are both empty. The worker scored those on metadata alone: the local model
-- hallucinated stock pain tags (catch_up_bookkeeping, hates_quickbooks) at
-- intent 85, the items were promoted, and the draft model — given no post text
-- to reference — replied with a literal refusal, which was saved as the lead's
-- outreach draft. 59 such facebook leads reached the Leads view this way, and
-- the hallucinated tags inflate pain-tag analytics.
--
-- The worker now archives empty items before any model call (index.mjs) and
-- draft() refuses an empty post (brain.mjs). This migration is the backstop at
-- the DB layer plus the one-time cleanup:
--
--   1. sig_submit_score: when the item has no title and no body, clamp the
--      score (intent 0, no tags, no competitor) and force-archive — an empty
--      item can never become a lead, whatever a (buggy or stale) worker sends.
--   2. Cleanup: archive the existing empty-body promoted items; their leads
--      (all still machine-drafted — none human-touched) go to 'dead' with an
--      audit event, and their hallucinated scores are zeroed so tag counts in
--      analytics are no longer inflated.
--
-- Idempotent. sig_submit_score stays service_role-only.
-- =============================================================================

create or replace function sig_submit_score(
  p_item_id         uuid,
  p_relevance       real,
  p_intent          int,
  p_pain_tags       text[] default '{}',
  p_competitor      text default null,
  p_model           text default null,
  p_promote         boolean default false,
  p_geo             text default null,
  p_role            text default null,
  p_contact_name    text default null,
  p_contact_company text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_empty   boolean;
begin
  -- Guard: an item with no title AND no body has no content to score. Whatever
  -- the caller sent, record it as a zero (so the hallucinated tags/intent never
  -- enter analytics) and never promote it.
  select coalesce(btrim(title), '') = '' and coalesce(btrim(body), '') = ''
    into v_empty
    from sig_items where id = p_item_id;
  if v_empty then
    p_intent     := 0;
    p_pain_tags  := '{}';
    p_competitor := null;
    p_promote    := false;
  end if;

  insert into sig_scores (item_id, relevance, intent, pain_tags, competitor, model, geo, role, scored_at)
  values (p_item_id, p_relevance, p_intent, coalesce(p_pain_tags, '{}'), p_competitor, p_model, p_geo, p_role, now())
  on conflict (item_id) do update
    set relevance = excluded.relevance,
        intent    = excluded.intent,
        pain_tags = excluded.pain_tags,
        competitor = excluded.competitor,
        model     = excluded.model,
        geo       = excluded.geo,
        role      = excluded.role,
        scored_at = now();

  if p_promote then
    update sig_items set status = 'promoted' where id = p_item_id;
    insert into sig_leads (item_id) values (p_item_id)
      on conflict (item_id) do nothing
      returning id into v_lead_id;
    if v_lead_id is null then
      select id into v_lead_id from sig_leads where item_id = p_item_id;
    end if;

    -- Fill only when empty; never clobber a human-saved value.
    update sig_leads
       set contact_name    = coalesce(contact_name, nullif(btrim(p_contact_name), '')),
           contact_company = coalesce(contact_company, nullif(btrim(p_contact_company), ''))
     where id = v_lead_id;

    return v_lead_id;
  else
    update sig_items set status = 'archived' where id = p_item_id;
    return null;
  end if;
end;
$$;

revoke execute on function
  sig_submit_score(uuid,real,int,text[],text,text,boolean,text,text,text,text) from public;
grant execute on function
  sig_submit_score(uuid,real,int,text[],text,text,boolean,text,text,text,text) to service_role;

-- -----------------------------------------------------------------------------
-- One-time cleanup of the already-promoted empty-body items.
-- Only machine-stage leads (new/reviewing/drafted) are touched — anything a
-- human already sent/replied/won stays put.
-- -----------------------------------------------------------------------------

do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(i.id), '{}')
    into v_ids
    from sig_items i
   where i.status = 'promoted'
     and coalesce(btrim(i.title), '') = ''
     and coalesce(btrim(i.body), '') = '';

  if array_length(v_ids, 1) is null then
    return;
  end if;

  -- Audit trail on each lead before we bury it.
  insert into sig_lead_events (lead_id, actor_email, kind, detail)
  select l.id, 'worker', 'stage_changed',
         jsonb_build_object('stage', 'dead', 'reason', 'empty_item_cleanup')
    from sig_leads l
   where l.item_id = any (v_ids)
     and l.stage in ('new', 'reviewing', 'drafted');

  update sig_leads l
     set stage = 'dead', updated_at = now()
   where l.item_id = any (v_ids)
     and l.stage in ('new', 'reviewing', 'drafted');

  -- Archive the items — except any whose lead a human already worked
  -- (sent/replied/won), which keep their promoted status.
  update sig_items i
     set status = 'archived'
   where i.id = any (v_ids)
     and not exists (
       select 1 from sig_leads l
        where l.item_id = i.id and l.stage in ('sent', 'replied', 'won')
     );

  -- Zero the hallucinated scores so tag/intent analytics stop counting them.
  update sig_scores
     set intent = 0, pain_tags = '{}', competitor = null, scored_at = now()
   where item_id = any (v_ids);

  raise notice 'sig empty-item cleanup: archived % item(s)', array_length(v_ids, 1);
end;
$$;
