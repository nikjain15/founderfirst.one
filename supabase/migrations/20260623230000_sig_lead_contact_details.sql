-- Extend per-lead contact tracking: a dedicated email field (actionable /
-- filterable later) plus one freeform `contact_details` line for anything else
-- (phone, LinkedIn, other handles) so we don't add a column per channel.
--
-- save_sig_lead_notes gains two trailing params; drop the old 5-arg signature
-- first since CREATE OR REPLACE can't widen the argument list in place.

alter table sig_leads
  add column if not exists contact_email   text,
  add column if not exists contact_details text;

drop function if exists save_sig_lead_notes(uuid, text, text, text, text);

create or replace function save_sig_lead_notes(
  p_lead_id         uuid,
  p_notes           text,
  p_contact_name    text default null,
  p_contact_company text default null,
  p_status          text default null,
  p_contact_email   text default null,
  p_contact_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'save_sig_lead_notes: admin access required'; end if;
  if p_status is not null and p_status not in
       ('awaiting','not_contacted','replied','resolved','no_response') then
    raise exception 'save_sig_lead_notes: invalid status %', p_status;
  end if;

  update sig_leads
     set notes           = p_notes,
         contact_name    = p_contact_name,
         contact_company = p_contact_company,
         contact_email   = p_contact_email,
         contact_details = p_contact_details,
         note_status     = p_status,
         updated_at      = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'note_saved',
            jsonb_build_object('notes', p_notes, 'status', p_status,
                               'contact_name', p_contact_name,
                               'contact_company', p_contact_company,
                               'contact_email', p_contact_email,
                               'contact_details', p_contact_details));
  perform log_admin_action('sig_lead_notes', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('status', p_status));
end;
$$;

grant execute on function save_sig_lead_notes(uuid,text,text,text,text,text,text) to authenticated;
