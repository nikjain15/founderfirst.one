-- =============================================================================
-- FounderFirst — 1099 contractor tracking (card W2.5)
-- =============================================================================
--
-- What a business needs to file 1099-NEC for its contractors:
--   1. WHO did I pay?          → a per-org VENDOR entity (1099-eligible flag +
--                                W-9 fields as data). journal_entries have no
--                                vendor column today; "vendor" was only memo text
--                                + platform vendor_priors. This card adds the
--                                first-class per-org vendor.
--   2. HOW did I pay them?     → a PAYMENT METHOD on each vendor-attributed
--                                payment. IRS: amounts paid by credit/debit card
--                                or a third-party settlement network (Stripe/
--                                PayPal/Square/Venmo-business) are reported by the
--                                SETTLEMENT ENTITY on 1099-K — the payer EXCLUDES
--                                them from 1099-NEC (Instructions for Form 1099-MISC
--                                and 1099-NEC, "Exceptions"). The reportable-vs-
--                                excluded classification is DATA (payment_methods
--                                .nec_reportable + citation), never an inline list.
--   3. HOW MUCH is reportable?→ the $600 (2025) / $2,000 (2026 OBBBA) threshold is
--                                LAW — it lives in filing_obligations
--                                (obligation_key='1099_nec_issue', threshold_minor)
--                                seeded + effective-dated + cited (CENTRAL-2). This
--                                card READS it via a lookup fn, never hardcodes it.
--
-- The year-end 1099-NEC summary sums NEC-reportable payments per 1099-eligible
-- vendor over a tax year, flags who crosses the kernel threshold, and rides the
-- W1.2 export machinery into the CPA tax package (a `nec` ReportKind).
--
-- SECURITY (ISOTEST pattern, LEARNINGS #22): every write RPC is SECURITY DEFINER,
-- takes p_actor FIRST, is EXECUTE-granted ONLY to service_role, checks
-- can_write_org_as(actor, org) in-function, and writes a ledger_audit row inline
-- (actor from p_actor, never a JWT). The edge fn (nec-tracking) passes the actor
-- from the VERIFIED JWT. Reads are can_access_org()-gated, granted to authenticated.
--
-- APPEND-ONLY LEDGER: this card attributes EXISTING posted entries to a vendor +
-- payment method via a side table (journal_entry_vendor_tag). It never edits
-- journal_entries/journal_lines (immutable; corrections via reversal). Re-tagging
-- an entry updates its tag row, which is a classification annotation, not a
-- financial fact.
--
-- NOTE: review before `supabase db push` (LEARNINGS rule 3) — apply manually.
-- Timestamp 20260706030000 is unique + later than the W2.4 sibling's reserved
-- slot (rule 24 / loop card): W2.4 owns the estimated-tax surfaces, W2.5 owns
-- vendor tagging + payment methods + the NEC summary. No file overlap.
-- =============================================================================

-- ── payment_methods — reference taxonomy with the NEC-reportability rule ──────
-- Kernel-style reference data (like connectors / industries). `nec_reportable`
-- encodes the IRS card/third-party-network EXCLUSION as editable data + citation:
-- adding a method or flipping its reportability is a seed/row edit, not a code
-- change. Cited so a CPA can trust it.
create table if not exists public.payment_methods (
  key            text primary key,               -- STABLE: 'check','ach','cash','wire','card','third_party_network'
  label          text not null,                  -- 'Check', 'Credit/debit card', …
  nec_reportable boolean not null,               -- true = counts toward 1099-NEC; false = reported on 1099-K by the settlement entity
  sort_order     int  not null default 100,
  citation       text not null,                  -- IRS instruction URL for the classification
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
comment on table public.payment_methods is
  'Reference taxonomy of how a vendor was paid. nec_reportable encodes the IRS 1099-NEC card/third-party-network EXCLUSION as editable, cited DATA (Roadmap principle 3 — no inline rule). Card/TPN payments are reported on 1099-K by the settlement entity, so the payer excludes them.';

alter table public.payment_methods enable row level security;
-- Public reference facts (not org data) — readable by anyone, written by service_role only.
drop policy if exists payment_methods_read on public.payment_methods;
create policy payment_methods_read on public.payment_methods for select using (true);
drop policy if exists payment_methods_nowrite on public.payment_methods;
create policy payment_methods_nowrite on public.payment_methods for all using (false) with check (false);
grant select on public.payment_methods to anon, authenticated;
grant select, insert, update on public.payment_methods to service_role;

-- Seed the standard methods. Reportability per Instructions for Form 1099-NEC,
-- "Exceptions — payments made with a credit card or payment card and certain
-- other types of payments … are reportable by the payment settlement entity
-- under section 6050W and are not subject to reporting on Form 1099-NEC."
insert into public.payment_methods (key, label, nec_reportable, sort_order, citation, notes) values
  ('check',                'Check',                         true,  10, 'https://www.irs.gov/instructions/i1099mec', 'Direct payment — counts toward 1099-NEC.'),
  ('ach',                  'ACH / bank transfer',           true,  20, 'https://www.irs.gov/instructions/i1099mec', 'Direct bank-to-bank payment — counts toward 1099-NEC.'),
  ('cash',                 'Cash',                          true,  30, 'https://www.irs.gov/instructions/i1099mec', 'Direct payment — counts toward 1099-NEC.'),
  ('wire',                 'Wire transfer',                 true,  40, 'https://www.irs.gov/instructions/i1099mec', 'Direct payment — counts toward 1099-NEC.'),
  ('card',                 'Credit/debit card',             false, 50, 'https://www.irs.gov/instructions/i1099mec', 'Reported by the card settlement entity on 1099-K (§6050W) — EXCLUDED from the payer''s 1099-NEC.'),
  ('third_party_network',  'Third-party network (Stripe/PayPal/Venmo business)', false, 60, 'https://www.irs.gov/instructions/i1099mec', 'Reported by the TPN on 1099-K (§6050W) — EXCLUDED from the payer''s 1099-NEC.')
on conflict (key) do update set
  label = excluded.label, nec_reportable = excluded.nec_reportable,
  sort_order = excluded.sort_order, citation = excluded.citation, notes = excluded.notes;

-- ── vendors — the per-org first-class payee entity ───────────────────────────
-- W-9 fields stored AS DATA (never validated as advice; TIN handling is sensitive
-- but this is the payer's own record of their contractor). is_1099_eligible marks
-- a vendor whose payments should be tracked for 1099-NEC (a contractor, not e.g.
-- a utility or a corporation — corporations are generally exempt).
create table if not exists public.vendors (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  name              text not null,
  is_1099_eligible  boolean not null default false,
  -- W-9 fields (payer's record of the contractor) — all optional, stored as data:
  legal_name        text,                          -- W-9 line 1 (if different from name)
  tax_id_type       text check (tax_id_type in ('ein','ssn') or tax_id_type is null),
  tax_id_last4      text check (tax_id_last4 ~ '^\d{4}$' or tax_id_last4 is null), -- store only last 4 (minimize sensitive data)
  address           text,
  w9_on_file        boolean not null default false,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists vendors_org_idx on public.vendors (org_id) where not is_archived;
-- One active vendor per (org, lower(name)) — re-adding an existing name is an
-- upsert, not a duplicate payee (keeps the NEC summary from splitting a vendor).
create unique index if not exists vendors_org_name_uniq
  on public.vendors (org_id, lower(name)) where not is_archived;

alter table public.vendors enable row level security;
drop policy if exists vendors_select on public.vendors;
create policy vendors_select  on public.vendors for select using (can_access_org(org_id));
drop policy if exists vendors_nowrite on public.vendors;
create policy vendors_nowrite on public.vendors for all using (false) with check (false);
grant select on public.vendors to authenticated;
grant select, insert, update on public.vendors to service_role;

comment on table public.vendors is
  'Per-org payee (contractor/supplier). is_1099_eligible + W-9 fields (last-4 TIN only) drive the year-end 1099-NEC summary. Not to be confused with platform vendor_priors (category first-guess).';

-- ── journal_entry_vendor_tag — attributes a posted entry to a vendor + method ─
-- A classification annotation on an existing (immutable) journal entry. One tag
-- per entry (an entry is one payment to one vendor). Re-tagging updates in place.
create table if not exists public.journal_entry_vendor_tag (
  entry_id           uuid primary key references journal_entries(id) on delete cascade,
  org_id             uuid not null references organizations(id) on delete cascade,
  vendor_id          uuid not null references public.vendors(id) on delete cascade,
  payment_method_key text not null references public.payment_methods(key),
  tagged_by          uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists jevt_org_vendor_idx on public.journal_entry_vendor_tag (org_id, vendor_id);

alter table public.journal_entry_vendor_tag enable row level security;
drop policy if exists jevt_select on public.journal_entry_vendor_tag;
create policy jevt_select  on public.journal_entry_vendor_tag for select using (can_access_org(org_id));
drop policy if exists jevt_nowrite on public.journal_entry_vendor_tag;
create policy jevt_nowrite on public.journal_entry_vendor_tag for all using (false) with check (false);
grant select on public.journal_entry_vendor_tag to authenticated;
grant select, insert, update, delete on public.journal_entry_vendor_tag to service_role;

-- =============================================================================
-- LAW LOOKUP — the 1099-NEC threshold, read from the kernel (never inlined)
-- =============================================================================
-- The $600/$2,000 threshold is LAW-DERIVED data in filing_obligations
-- (obligation_key='1099_nec_issue', threshold_minor), effective-dated + cited.
-- 1099-NEC is a PAYER obligation independent of the payer's OWN entity type — any
-- business paying a contractor $600+ must issue. The seed keys the row under
-- 'sole_prop' as the canonical federal payer rule; we look up the org's entity
-- first, then fall back to the sole_prop federal rule, so behavior is correct for
-- every entity and adding entity-specific rows later is a pure seed edit.
create or replace function public.ninetynine_nec_threshold_minor(
  p_org      uuid,
  p_tax_year int
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity  text;
  v_thresh  bigint;
  v_as_of   date := make_date(p_tax_year, 12, 31);
begin
  -- entity_type is on org_accounting_settings (CENTRAL-2 org profile), not organizations.
  select entity_type into v_entity from org_accounting_settings where org_id = p_org;

  -- 1) the org's own entity_type, if it has an active 1099 rule for the year
  if v_entity is not null then
    select o.threshold_minor into v_thresh
      from filing_obligations_for('US-FED', v_entity, p_tax_year, v_as_of) o
     where o.obligation_key = '1099_nec_issue'
     limit 1;
  end if;

  -- 2) fall back to the canonical federal payer rule (seeded under sole_prop)
  if v_thresh is null then
    select o.threshold_minor into v_thresh
      from filing_obligations_for('US-FED', 'sole_prop', p_tax_year, v_as_of) o
     where o.obligation_key = '1099_nec_issue'
     limit 1;
  end if;

  return v_thresh;  -- may be null if the kernel has no rule for that year (caller decides)
end$$;
grant execute on function public.ninetynine_nec_threshold_minor(uuid, int) to authenticated, service_role;

comment on function public.ninetynine_nec_threshold_minor is
  'The 1099-NEC issuance threshold (minor units) for an org in a tax year, READ from filing_obligations (LAW; effective-dated + cited). Returns null if the kernel has no rule for that year. Never hardcoded.';

-- =============================================================================
-- WRITE RPCs (service_role only; actor first; audit inline) — see nec-tracking fn
-- =============================================================================

-- ── vendor_upsert — create or update a per-org vendor ────────────────────────
create or replace function public.vendor_upsert(
  p_actor            uuid,
  p_org              uuid,
  p_vendor_id        uuid,        -- null = create
  p_name             text,
  p_is_1099_eligible boolean,
  p_legal_name       text default null,
  p_tax_id_type      text default null,
  p_tax_id_last4     text default null,
  p_address          text default null,
  p_w9_on_file       boolean default false
) returns vendors
language plpgsql security definer set search_path = public as $$
declare v_v vendors;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'empty_name: a vendor needs a name' using errcode = 'invalid_parameter_value';
  end if;

  if p_vendor_id is null then
    -- Lock against a concurrent insert of the same name → upsert instead of dup.
    insert into vendors (org_id, name, is_1099_eligible, legal_name, tax_id_type, tax_id_last4, address, w9_on_file)
      values (p_org, trim(p_name), coalesce(p_is_1099_eligible, false),
              p_legal_name, p_tax_id_type, p_tax_id_last4, p_address, coalesce(p_w9_on_file, false))
    on conflict (org_id, lower(name)) where not is_archived
      do update set
        is_1099_eligible = excluded.is_1099_eligible,
        legal_name = excluded.legal_name, tax_id_type = excluded.tax_id_type,
        tax_id_last4 = excluded.tax_id_last4, address = excluded.address,
        w9_on_file = excluded.w9_on_file, updated_at = now()
    returning * into v_v;
  else
    update vendors set
        name = trim(p_name), is_1099_eligible = coalesce(p_is_1099_eligible, is_1099_eligible),
        legal_name = p_legal_name, tax_id_type = p_tax_id_type, tax_id_last4 = p_tax_id_last4,
        address = p_address, w9_on_file = coalesce(p_w9_on_file, w9_on_file), updated_at = now()
     where id = p_vendor_id and org_id = p_org and not is_archived
    returning * into v_v;
    if not found then
      raise exception 'not_found: vendor % not in org %', p_vendor_id, p_org using errcode = 'no_data_found';
    end if;
  end if;

  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'vendor.upsert', 'vendor', v_v.id,
            jsonb_build_object('name', v_v.name, 'is_1099_eligible', v_v.is_1099_eligible,
                               'w9_on_file', v_v.w9_on_file));
  return v_v;
end$$;
revoke all on function public.vendor_upsert(uuid,uuid,uuid,text,boolean,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.vendor_upsert(uuid,uuid,uuid,text,boolean,text,text,text,text,boolean) to service_role;

-- ── vendor_archive — soft-delete a vendor (LEARNINGS #4: archive, don't delete) ─
create or replace function public.vendor_archive(p_actor uuid, p_org uuid, p_vendor_id uuid)
returns vendors
language plpgsql security definer set search_path = public as $$
declare v_v vendors;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update vendors set is_archived = true, updated_at = now()
   where id = p_vendor_id and org_id = p_org and not is_archived
  returning * into v_v;
  if not found then
    raise exception 'not_found: vendor % not in org %', p_vendor_id, p_org using errcode = 'no_data_found';
  end if;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'vendor.archive', 'vendor', v_v.id, jsonb_build_object('name', v_v.name));
  return v_v;
end$$;
revoke all on function public.vendor_archive(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.vendor_archive(uuid,uuid,uuid) to service_role;

-- ── entry_tag_vendor — attribute a posted entry to a vendor + payment method ──
-- The vendor tag is a classification annotation, not a financial mutation: the
-- immutable journal entry is untouched. Validates the entry, vendor, and method
-- all belong to the org / taxonomy so a later NEC roll-up can't reference stale
-- input. Upserts (one tag per entry).
create or replace function public.entry_tag_vendor(
  p_actor              uuid,
  p_org                uuid,
  p_entry_id           uuid,
  p_vendor_id          uuid,
  p_payment_method_key text
) returns journal_entry_vendor_tag
language plpgsql security definer set search_path = public as $$
declare v_t journal_entry_vendor_tag;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from journal_entries where id = p_entry_id and org_id = p_org) then
    raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from vendors where id = p_vendor_id and org_id = p_org and not is_archived) then
    raise exception 'not_found: vendor % not in org %', p_vendor_id, p_org using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from payment_methods where key = p_payment_method_key and is_active) then
    raise exception 'bad_method: unknown payment method %', p_payment_method_key using errcode = 'invalid_parameter_value';
  end if;

  insert into journal_entry_vendor_tag (entry_id, org_id, vendor_id, payment_method_key, tagged_by)
    values (p_entry_id, p_org, p_vendor_id, p_payment_method_key, p_actor)
  on conflict (entry_id) do update set
    vendor_id = excluded.vendor_id, payment_method_key = excluded.payment_method_key,
    tagged_by = excluded.tagged_by, updated_at = now()
  returning * into v_t;

  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, '1099.tag', 'journal_entry', p_entry_id,
            jsonb_build_object('vendor_id', p_vendor_id, 'payment_method', p_payment_method_key));
  return v_t;
end$$;
revoke all on function public.entry_tag_vendor(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.entry_tag_vendor(uuid,uuid,uuid,uuid,text) to service_role;

-- ── entry_untag_vendor — remove a vendor tag from an entry ────────────────────
create or replace function public.entry_untag_vendor(p_actor uuid, p_org uuid, p_entry_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_deleted int;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  delete from journal_entry_vendor_tag where entry_id = p_entry_id and org_id = p_org;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'not_found: no vendor tag on entry % in org %', p_entry_id, p_org using errcode = 'no_data_found';
  end if;
  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, '1099.untag', 'journal_entry', p_entry_id, '{}'::jsonb);
end$$;
revoke all on function public.entry_untag_vendor(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.entry_untag_vendor(uuid,uuid,uuid) to service_role;

-- =============================================================================
-- READ — the year-end 1099-NEC summary (rides into the export/tax package)
-- =============================================================================
-- Per 1099-eligible vendor, over the tax year: sum of NEC-REPORTABLE payments
-- (payment_methods.nec_reportable = true) minus card/TPN (excluded), plus the
-- excluded total for transparency, and whether the vendor crosses the kernel
-- threshold. "Payment" magnitude = the DEBIT total of the tagged entry's expense
-- side (money out). Reversed entries net to zero via their reversal (both are in
-- the books), so a reversed payment correctly drops out of the total.
--
-- SECURITY DEFINER + can_access_org gate + granted to authenticated: a read a
-- read_only CPA can run (matches list_uncategorized_entries / the export path).
create or replace function public.ninetynine_nec_summary(p_org uuid, p_tax_year int)
returns table (
  vendor_id            uuid,
  vendor_name          text,
  is_1099_eligible     boolean,
  w9_on_file           boolean,
  tax_id_type          text,
  tax_id_last4         text,
  reportable_minor     bigint,   -- Σ NEC-reportable payments (check/ach/cash/wire)
  excluded_minor       bigint,   -- Σ card/TPN payments (reported on 1099-K, not by payer)
  payment_count        bigint,   -- # of reportable payments
  threshold_minor      bigint,   -- the kernel threshold for this org/year (LAW)
  meets_threshold      boolean   -- reportable_minor >= threshold (must issue a 1099-NEC)
)
language plpgsql
security definer
set search_path = public
as $$
declare v_threshold bigint;
begin
  if not can_access_org(p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  v_threshold := ninetynine_nec_threshold_minor(p_org, p_tax_year);

  return query
  with tagged as (
    select
      v.id           as vendor_id,
      v.name         as vendor_name,
      v.is_1099_eligible,
      v.w9_on_file,
      v.tax_id_type,
      v.tax_id_last4,
      pm.nec_reportable,
      -- money OUT for the payment = the entry's expense/debit magnitude: sum the
      -- expense DEBIT lines only (the bank credit that funds it is not a 1099
      -- amount). A reversed payment drops out cleanly: the original goes to
      -- status='reversed' (excluded by the WHERE below) and its reversal entry is
      -- posted-but-UNTAGGED, so neither counts. pending_review (not yet in the
      -- books) is also excluded.
      (select coalesce(sum(jl.amount_minor), 0)
         from journal_lines jl
         join ledger_accounts la on la.id = jl.account_id
        where jl.entry_id = e.id and jl.side = 'D' and la.type = 'expense') as amount_minor
    from journal_entry_vendor_tag t
    join vendors v          on v.id = t.vendor_id
    join journal_entries e  on e.id = t.entry_id
    join payment_methods pm on pm.key = t.payment_method_key
   where t.org_id = p_org
     and e.status = 'posted'                         -- exclude pending_review + reversed
     and extract(year from e.entry_date)::int = p_tax_year
  )
  select
    tg.vendor_id,
    tg.vendor_name,
    tg.is_1099_eligible,
    tg.w9_on_file,
    tg.tax_id_type,
    tg.tax_id_last4,
    coalesce(sum(tg.amount_minor) filter (where tg.nec_reportable), 0)::bigint       as reportable_minor,
    coalesce(sum(tg.amount_minor) filter (where not tg.nec_reportable), 0)::bigint   as excluded_minor,
    count(*) filter (where tg.nec_reportable)::bigint                                 as payment_count,
    v_threshold                                                                       as threshold_minor,
    (v_threshold is not null
      and coalesce(sum(tg.amount_minor) filter (where tg.nec_reportable), 0) >= v_threshold) as meets_threshold
  from tagged tg
  where tg.is_1099_eligible                          -- only 1099-eligible vendors appear
  group by tg.vendor_id, tg.vendor_name, tg.is_1099_eligible, tg.w9_on_file, tg.tax_id_type, tg.tax_id_last4
  order by reportable_minor desc, tg.vendor_name;
end$$;
grant execute on function public.ninetynine_nec_summary(uuid, int) to authenticated, service_role;

comment on function public.ninetynine_nec_summary is
  'Year-end 1099-NEC roll-up per 1099-eligible vendor: NEC-reportable total (excludes card/TPN per payment_methods.nec_reportable), excluded total, and whether the vendor crosses the kernel threshold (ninetynine_nec_threshold_minor). Feeds the export/tax package (nec ReportKind). can_access_org-gated.';
