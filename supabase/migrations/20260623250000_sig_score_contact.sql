-- LLM-inferred contact details from the worker's scoring pass.
--
-- The local score model already extracts geo/role/competitor; it now also
-- infers the author's name + company (even when not spelled out). We persist
-- those onto the lead via a NEW 11-arg overload of sig_submit_score — added
-- (not replacing the 9-arg) so the worker and this migration can deploy in
-- either order, same rollout pattern as the geo/role overload.
--
-- coalesce() means the worker only FILLS empty contact fields — it never
-- overwrites a value a human has already saved in the drawer.

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
begin
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
