-- Invoicing Slice C — business profile for the invoice document's From/branding
-- block. Additive columns on org_invoicing_settings + an owner-gated RPC the
-- frontend can call directly (the table itself is no-write; all writes go through
-- SECURITY DEFINER functions). Logo upload is a later follow-up (needs a bucket).

alter table org_invoicing_settings
  add column if not exists business_name    text,
  add column if not exists business_address text,
  add column if not exists business_email   text,
  add column if not exists payment_terms    text;

-- Save the business profile. Owner-gated (can_write_org_as), callable by the
-- authenticated owner directly — no edge-fn round-trip. NULL args leave a field
-- unchanged (partial save).
create or replace function set_invoicing_profile(
  p_org uuid,
  p_business_name text default null,
  p_business_address text default null,
  p_business_email text default null,
  p_payment_terms text default null
) returns org_invoicing_settings language plpgsql security definer set search_path = public as $$
declare v_row org_invoicing_settings;
begin
  if not can_write_org_as(auth.uid(), p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into org_invoicing_settings (org_id, business_name, business_address, business_email, payment_terms, updated_by)
  values (p_org, p_business_name, p_business_address, p_business_email, p_payment_terms, auth.uid())
  on conflict (org_id) do update set
    business_name    = coalesce(p_business_name, org_invoicing_settings.business_name),
    business_address = coalesce(p_business_address, org_invoicing_settings.business_address),
    business_email   = coalesce(p_business_email, org_invoicing_settings.business_email),
    payment_terms    = coalesce(p_payment_terms, org_invoicing_settings.payment_terms),
    updated_at = now(), updated_by = auth.uid()
  returning * into v_row;
  return v_row;
end$$;
revoke all on function set_invoicing_profile(uuid, text, text, text, text) from public;
grant execute on function set_invoicing_profile(uuid, text, text, text, text) to authenticated;
