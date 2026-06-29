-- Add 'content' as a surface for penny_outreach_persona.
--
-- The content pipeline (content-draft) now follows the same single-voice +
-- surface-task-note pattern as signals/email/discord: it composes the live
-- penny_voice guide + the 'content' task note + a code-held output contract,
-- instead of hard-coding voice rules in the edge function. This widens the
-- surface discriminator so a 'content' task note can be versioned and set live.
alter table public.penny_outreach_persona
  drop constraint if exists penny_outreach_persona_surface_check;
alter table public.penny_outreach_persona
  add constraint penny_outreach_persona_surface_check
  check (surface in ('signals', 'email', 'content'));

-- The create RPC carries its own surface allow-list (defense-in-depth); widen it too.
create or replace function create_outreach_persona_version(
  p_surface text,
  p_body    text,
  p_notes   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not is_admin() then
    raise exception 'create_outreach_persona_version: admin access required';
  end if;

  if p_surface not in ('signals', 'email', 'content') then
    raise exception 'create_outreach_persona_version: unknown surface %', p_surface;
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_outreach_persona_version: body cannot be empty';
  end if;

  insert into penny_outreach_persona (surface, body, notes, created_by, is_live)
  values (p_surface, p_body, p_notes, auth.uid(), false)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_outreach_persona_version(text, text, text) to authenticated;
