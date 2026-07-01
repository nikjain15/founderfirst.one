-- =============================================================================
-- FounderFirst — Signals: sig_set_lead_draft rejects empty / refusal drafts
-- =============================================================================
--
-- Companion to 20260701153000_sig_empty_item_guard: the worker now validates
-- drafts before saving (validateDraft in brain.mjs — refusal patterns, length
-- bounds, must reference the post). This is the DB backstop for the two
-- unambiguous failure shapes, so no caller — buggy worker, stale deploy, ad-hoc
-- script — can ever persist an empty draft or a model refusal ("I don't have
-- the actual post text…") as a lead's outreach draft again. The richer
-- heuristics stay in the worker, where they're cheap to tune.
--
-- On rejection the function raises, the worker logs it, and the lead simply
-- stays at 'new' — the manual-drafting queue.
--
-- Idempotent. Stays service_role-only.
-- =============================================================================

create or replace function sig_set_lead_draft(
  p_lead_id uuid,
  p_draft   text,
  p_model   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_draft is null or btrim(p_draft) = '' then
    raise exception 'sig_set_lead_draft: empty draft';
  end if;
  if p_draft ~* '^\s*(i (don''t|do not|can''t|cannot) (have|see|find|access)|(could|can) you (share|paste|provide)|please (share|paste|provide)|there(''s| is) no (post|text|content)|i need (the|more) )' then
    raise exception 'sig_set_lead_draft: draft reads like a model refusal, not outreach';
  end if;

  update sig_leads
     set draft = p_draft,
         draft_model = p_model,
         stage = case when stage = 'new' then 'drafted' else stage end,
         updated_at = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, 'worker', 'draft_generated', jsonb_build_object('model', p_model));
end;
$$;

revoke execute on function sig_set_lead_draft(uuid,text,text) from public;
grant execute on function sig_set_lead_draft(uuid,text,text) to service_role;
