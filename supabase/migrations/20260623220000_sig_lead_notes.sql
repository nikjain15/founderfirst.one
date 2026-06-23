-- Per-lead notes & light contact tracking for Signals leads.
--
-- The drawer gets a single freeform `notes` field as the working surface plus
-- three light structured fields (contact name, company, status). Each save also
-- snapshots into the existing sig_lead_events audit trail (kind='note_saved'),
-- so the drawer can render an expandable history with no separate table — one
-- source of truth for the per-lead event log.

alter table sig_leads
  add column if not exists contact_name    text,
  add column if not exists contact_company text,
  add column if not exists note_status     text
    check (note_status is null or note_status in
           ('awaiting','not_contacted','replied','resolved','no_response')),
  add column if not exists notes           text;

create or replace function save_sig_lead_notes(
  p_lead_id         uuid,
  p_notes           text,
  p_contact_name    text default null,
  p_contact_company text default null,
  p_status          text default null
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
         note_status     = p_status,
         updated_at      = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'note_saved',
            jsonb_build_object('notes', p_notes, 'status', p_status,
                               'contact_name', p_contact_name,
                               'contact_company', p_contact_company));
  perform log_admin_action('sig_lead_notes', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('status', p_status));
end;
$$;

grant execute on function save_sig_lead_notes(uuid,text,text,text,text) to authenticated;
