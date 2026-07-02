-- W3.3 — Minimal 3-step onboarding: the CoA-template seeding path.
--
-- CENTRAL-2 gave us the "what am I?" (entity_types) and "what sector?"
-- (industries) knowledge, and every industry row already carries a
-- `coa_template_ref` (e.g. 'svc_professional', 'trades_construction'). What was
-- missing: the templates those refs POINT AT, and the path that turns "owner
-- picked their industry" into a real, seeded chart of accounts.
--
-- This migration adds:
--   1. coa_account_templates — a KERNEL table (platform knowledge, public-read,
--      seed-loader-writes-only, exactly like entity_types/industries). One row per
--      (template_ref, code) account. The 10 demo personas' charts live here as
--      SEED DATA (supabase/seeds/kernel/coa_account_templates.json) — adding a
--      sector's chart is a seed edit, never a code change (Roadmap principle 3b).
--   2. seed_org_coa(actor, org, industry_key) — resolves industry → coa_template_ref
--      → inserts the template's accounts into ledger_accounts for the org. Purely
--      kernel-driven: there is NO hardcoded industry→accounts map anywhere in code.
--      Idempotent (skips if the org already has accounts). Falls back to the
--      'general_business' template if the industry has no ref.
--   3. complete_onboarding(actor, org, entity_type, industry_key) — the one atomic
--      write the onboarding wizard's final step calls: it stamps the org's
--      entity_type + industry_key on org_accounting_settings (the kernel consumer
--      from 20260703000200 reads these for the filing calendar) AND seeds the CoA.
--      SECURITY DEFINER, actor-checked via can_write_org_as, service_role-only —
--      same write-path discipline as post_journal_entry / upsert_ledger_account.
--
-- WRITE-DON'T-DEPLOY: committed, not applied. Unique timestamp 20260705020000
-- (main max was 20260704040000; avoids W3.2's 010000 range).

-- ── coa_account_templates (kernel) ──────────────────────────────────────────
-- No enum for template_ref: templates are rows, so a new sector's chart is a seed
-- insert. account type reuses the ledger's account_type enum so a template row can
-- only be a valid account kind.
create table if not exists public.coa_account_templates (
  template_ref text        not null,   -- 'svc_professional' — matches industries.coa_template_ref
  code         text        not null,   -- '4000','6100' — stable account code within the template
  name         text        not null,   -- 'Consulting income','Software'
  type         account_type not null,  -- asset|liability|equity|income|expense
  sort_order   int         not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (template_ref, code)
);
comment on table public.coa_account_templates is
  'Platform knowledge: chart-of-accounts templates keyed by industries.coa_template_ref. Seed data (supabase/seeds/kernel/coa_account_templates.json). Consumed by seed_org_coa at onboarding. Adding a sector chart = seed rows, no code change.';

-- Knowledge is public-read; only the seed loader (service_role, bypasses RLS)
-- writes — identical policy to the other kernel tables (20260703000000).
alter table public.coa_account_templates enable row level security;
drop policy if exists coa_account_templates_read on public.coa_account_templates;
create policy coa_account_templates_read on public.coa_account_templates
  for select to authenticated, anon using (true);
grant select on public.coa_account_templates to authenticated, anon;

-- ── seed_org_coa: industry → template → org's ledger_accounts ────────────────
-- KERNEL-DRIVEN: the industry→template→accounts chain is all data. Idempotent:
-- if the org already has ANY account, it does nothing (re-running onboarding, or a
-- catch-up import that created accounts first, must not double-seed). Falls back to
-- 'general_business' when the industry has no coa_template_ref, so every org lands
-- with a usable chart. Actor is checked by the caller (complete_onboarding); this
-- helper trusts its inputs and is service_role-only.
create or replace function public.seed_org_coa(
  p_org uuid,
  p_industry_key text
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ref   text;
  v_count int;
begin
  if p_org is null then
    raise exception 'bad_org' using errcode = 'invalid_parameter_value';
  end if;

  -- Idempotency: never seed over an existing chart.
  select count(*) into v_count from ledger_accounts where org_id = p_org;
  if v_count > 0 then
    return 0;
  end if;

  -- Resolve the template ref from the kernel. Unknown/absent industry → the
  -- general_business template (there is no code-side default account list).
  select coa_template_ref into v_ref
    from industries
   where key = p_industry_key and is_active
   limit 1;
  if v_ref is null then
    v_ref := 'general_business';
  end if;

  insert into ledger_accounts (org_id, code, name, type, source, source_ref)
  select p_org, t.code, t.name, t.type, 'onboarding', t.template_ref
    from coa_account_templates t
   where t.template_ref = v_ref
  on conflict (org_id, code) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end$$;

revoke all on function public.seed_org_coa(uuid, text) from public;
grant execute on function public.seed_org_coa(uuid, text) to service_role;

-- ── complete_onboarding: the wizard's final atomic write ─────────────────────
-- Stamps entity_type + industry_key on the org's accounting settings (the kernel
-- consumer for the filing calendar reads these) and seeds the CoA — one txn, so an
-- org never ends up with a stamped profile but no chart, or vice-versa. Validates
-- entity/industry against the kernel (a forged key can't be written). Actor-checked
-- with the JWT-verified actor via can_write_org_as (same pattern as the ledger
-- write-path), service_role-only.
create or replace function public.complete_onboarding(
  p_actor uuid,
  p_org uuid,
  p_entity_type text,
  p_industry_key text
) returns int
language plpgsql security definer set search_path = public as $$
declare v_seeded int;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  -- Validate against the kernel so only real entity/industry keys are stored.
  if p_entity_type is not null
     and not exists (select 1 from entity_types where key = p_entity_type and is_active) then
    raise exception 'bad_entity_type' using errcode = 'invalid_parameter_value';
  end if;
  if p_industry_key is not null
     and not exists (select 1 from industries where key = p_industry_key and is_active) then
    raise exception 'bad_industry' using errcode = 'invalid_parameter_value';
  end if;

  -- org_accounting_settings row exists (seeded by the AFTER INSERT trigger on the
  -- org). Stamp the profile; leave jurisdiction at its default.
  update org_accounting_settings
     set entity_type  = coalesce(p_entity_type, entity_type),
         industry_key = coalesce(p_industry_key, industry_key)
   where org_id = p_org;

  v_seeded := seed_org_coa(p_org, p_industry_key);
  return v_seeded;
end$$;

revoke all on function public.complete_onboarding(uuid, uuid, text, text) from public;
grant execute on function public.complete_onboarding(uuid, uuid, text, text) to service_role;
