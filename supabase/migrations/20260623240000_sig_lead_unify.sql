-- Unify the lead drawer into one record: `stage` is the single status (the
-- separate note_status duplicated it), and one RPC saves the whole card —
-- stage + outreach draft + contact fields + notes — in a single write.
--
-- One concept = one source of truth: drop note_status and the notes-only RPC.

drop function if exists save_sig_lead_notes(uuid, text, text, text, text, text, text);

alter table sig_leads drop column if exists note_status;

create or replace function save_sig_lead_card(
  p_lead_id         uuid,
  p_stage           text,
  p_draft           text,
  p_contact_name    text default null,
  p_contact_company text default null,
  p_contact_email   text default null,
  p_contact_details text default null,
  p_notes           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'save_sig_lead_card: admin access required'; end if;
  if p_stage not in ('new','reviewing','drafted','sent','replied','won','dead') then
    raise exception 'save_sig_lead_card: invalid stage %', p_stage;
  end if;

  update sig_leads
     set stage           = p_stage,
         draft           = p_draft,
         contact_name    = p_contact_name,
         contact_company = p_contact_company,
         contact_email   = p_contact_email,
         contact_details = p_contact_details,
         notes           = p_notes,
         sent_at         = case when p_stage = 'sent' and sent_at is null then now() else sent_at end,
         updated_at      = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'card_saved',
            jsonb_build_object('stage', p_stage, 'notes', p_notes,
                               'contact_name', p_contact_name,
                               'contact_company', p_contact_company,
                               'contact_email', p_contact_email,
                               'contact_details', p_contact_details));
  perform log_admin_action('sig_lead_card', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('stage', p_stage));
end;
$$;

grant execute on function save_sig_lead_card(uuid,text,text,text,text,text,text,text) to authenticated;
