-- =============================================================================
-- FounderFirst — Signals: configurable scoring thresholds + drop competitor kw
-- =============================================================================
--
-- Makes the promotion thresholds editable from the admin (Scoring tab) instead
-- of living only in the worker .env. Stored as a small key/value table the
-- worker reads each cycle (service_role bypasses RLS, like sig_keywords).
--
-- Also removes the competitor keyword list — it was never used by the worker
-- (the LLM extracts the competitor from the post text), so it was dead UI.
--
-- Safe to re-run.
-- =============================================================================

create table if not exists sig_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table sig_settings enable row level security;

-- Defaults match the worker's previous env values.
insert into sig_settings (key, value) values
  ('intent_threshold',    '55'::jsonb),    -- min LLM intent (0-100) to promote
  ('relevance_threshold', '0.55'::jsonb),  -- min cosine relevance (0-1) to promote
  ('relevance_floor',     '0.30'::jsonb)   -- below this AND no keyword hit -> archive pre-LLM
on conflict (key) do nothing;

-- Admin read/write (is_admin gated, audited).
create or replace function list_sig_settings()
returns setof sig_settings
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_settings: admin access required'; end if;
  return query select * from sig_settings order by key;
end;
$$;

create or replace function set_sig_setting(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'set_sig_setting: admin access required'; end if;
  if p_key not in ('intent_threshold','relevance_threshold','relevance_floor') then
    raise exception 'set_sig_setting: unknown key %', p_key;
  end if;
  insert into sig_settings (key, value, updated_at, updated_by)
    values (p_key, p_value, now(), coalesce(auth.email(),'unknown'))
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform log_admin_action('sig_setting', 'sig_settings', p_key, jsonb_build_object('value', p_value));
end;
$$;

grant execute on function list_sig_settings()        to authenticated;
grant execute on function set_sig_setting(text,jsonb) to authenticated;

-- Drop the unused competitor keyword list.
delete from sig_keywords where kind = 'competitor';
