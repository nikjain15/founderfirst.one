-- W1.3-B — tax mapping engine functions (resolution, CPA overrides, M-1 draft/
-- approve, law supersede). STACKED ON CENTRAL-2 (#177).
--
-- SECURITY (ISOTEST pattern): every WRITE fn takes p_actor as its FIRST arg,
-- is SECURITY DEFINER, checks authorization against p_actor, and is EXECUTE-
-- granted ONLY to service_role (the thin write-API forwards the real caller).
-- No p_actor-first SECDEF write fn is ever granted to anon/authenticated (the
-- forged-actor P0). READ fns (resolution, lookups) are safe for authenticated.
--
-- CPA-LENS GATE (research decision 3): mapping EDITS require CPA-role access —
-- an active FULL engagement (firm member acting on the client's books). A plain
-- owner-member can READ their mappings (RLS) but not edit — "ask your CPA". This
-- is can_edit_tax_map_as() below.

-- ── CPA-edit gate: firm member with an active FULL engagement on this org ─────
-- Distinct from can_write_org_as (which also lets owners write): mapping edits
-- are CPA-only, so this requires the engagement path specifically.
create or replace function public.can_edit_tax_map_as(p_actor uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from engagements e
      join memberships m
        on m.org_id = e.firm_org_id and m.user_id = p_actor and m.status = 'active'
     where e.client_org_id = target_org
       and e.status = 'active'
       and e.access = 'full'
       and ( m.role = 'firm_admin'
             or exists (select 1 from client_assignments ca
                        where ca.engagement_id = e.id and ca.user_id = p_actor) )
  );
$$;
comment on function public.can_edit_tax_map_as is
  'CPA-lens gate for tax-mapping edits (research decision 3): true only for a firm member with an active FULL engagement on target_org. Owners read (RLS) but cannot edit.';

-- ── the form-in-force lookup (law-derived, effective-dated) ──────────────────
-- The ONLY sanctioned way to resolve which form row applies: returns the tax_form
-- in force as of a date for (jurisdiction, form_code, tax_year). Old periods -> old
-- law (Roadmap 3c). Never hardcode a form/line in app code.
create or replace function public.tax_form_in_force(
  p_jurisdiction_code text,
  p_form_code         text,
  p_tax_year          int,
  p_as_of             date default current_date
) returns public.tax_forms
  language sql stable security definer set search_path = public as $$
  select *
    from public.tax_forms
   where jurisdiction_code = p_jurisdiction_code
     and form_code         = p_form_code
     and tax_year          = p_tax_year
     and is_active
     and effective_from <= p_as_of
     and (effective_to is null or effective_to >= p_as_of)
   order by effective_from desc
   limit 1;
$$;
grant execute on function public.tax_form_in_force(text,text,int,date) to authenticated, anon, service_role;

-- ── supersede a form (law lifecycle) — service_role only ─────────────────────
-- Close the current active form row (set effective_to) and open a new one in ONE
-- txn. The one-active partial unique + no-overlap EXCLUDE make a half-done
-- supersede impossible. Returns the NEW form id (caller re-seeds its lines/rules).
create or replace function public.supersede_tax_form(
  p_jurisdiction_code text,
  p_form_code         text,
  p_entity_type       text,
  p_tax_year          int,
  p_effective_from    date,
  p_name              text,
  p_params            jsonb,
  p_citation          text,
  p_source            text default 'seed'
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_new uuid;
begin
  update public.tax_forms
     set effective_to = p_effective_from - 1
   where jurisdiction_code = p_jurisdiction_code
     and form_code         = p_form_code
     and tax_year          = p_tax_year
     and effective_to is null
     and is_active;

  insert into public.tax_forms (
    jurisdiction_code, form_code, entity_type, tax_year, name, params,
    status, effective_from, effective_to, citation, source
  ) values (
    p_jurisdiction_code, p_form_code, p_entity_type, p_tax_year,
    coalesce(p_name, p_form_code), coalesce(p_params, '{}'::jsonb),
    'active', p_effective_from, null, p_citation, coalesce(p_source,'seed')
  ) returning id into v_new;

  return v_new;
end $$;
revoke all on function public.supersede_tax_form(text,text,text,int,date,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.supersede_tax_form(text,text,text,int,date,text,jsonb,text,text) to service_role;

-- ── resolution: an org's accounts -> tax lines for a form@year ────────────────
-- The engine's heart (research §B.2). Deterministic + explainable. For each
-- account: CPA override wins; else lowest-priority matching seed rule; else
-- UNMAPPED. Returns WHY (source + rule detail) for the explainability requirement.
-- Pure read — safe for authenticated (RLS on ledger_accounts already scopes it).
create or replace function public.resolve_account_tax_lines(
  p_org_id            uuid,
  p_jurisdiction_code text,
  p_form_code         text,
  p_tax_year          int,
  p_as_of             date default current_date
) returns table (
  account_id   uuid,
  account_code text,
  account_name text,
  account_type text,
  line_key     text,
  resolved_by  text,      -- 'override' | 'rule' | 'unmapped'
  match_detail text       -- explainability: which override/rule matched
)
  language sql stable security definer set search_path = public as $$
  with frm as (
    select id from public.tax_form_in_force(p_jurisdiction_code, p_form_code, p_tax_year, p_as_of)
  ),
  acct as (
    select a.id, a.code, a.name, a.type::text as type, a.tags
      from public.ledger_accounts a
     where a.org_id = p_org_id and not a.is_archived
  ),
  -- 1. CPA override (research §B.2.1): keyed by form_code + line_key, effective by
  -- year. An override applies if tax_year_from is null (all years) or <= the year.
  -- The MOST-SPECIFIC applicable override wins per account: a year-specific row
  -- (higher tax_year_from) beats the all-years row (null, sorted last).
  ovr1 as (
    select distinct on (o.account_id)
           o.account_id, o.line_key,
           'set by CPA' || coalesce(' on ' || o.created_at::date::text, '') as detail
      from public.org_account_tax_map o
     where o.org_id = p_org_id
       and o.form_code = p_form_code
       and (o.tax_year_from is null or o.tax_year_from <= p_tax_year)
     order by o.account_id, o.tax_year_from desc nulls last
  ),
  -- 2. lowest-priority matching seed rule (research §B.2.2).
  ruled as (
    select a.id as account_id,
           (select r.line_key
              from public.tax_mapping_rules r
              join frm on r.form_id = frm.id
             where (
                 (r.match_kind = 'account_code_range'
                    and a.code is not null
                    and split_part(r.match_value,'-',1) <= a.code
                    and a.code <= split_part(r.match_value,'-',2))
              or (r.match_kind = 'account_tag'          and r.match_value = any(a.tags))
              or (r.match_kind = 'account_name_pattern' and a.name ilike r.match_value)
              or (r.match_kind = 'account_type'         and r.match_value = a.type)
             )
             order by r.priority asc, r.id asc
             limit 1) as line_key,
           (select 'matched seed rule: ' || r.match_kind || ' ~ ' || r.match_value
              from public.tax_mapping_rules r
              join frm on r.form_id = frm.id
             where (
                 (r.match_kind = 'account_code_range'
                    and a.code is not null
                    and split_part(r.match_value,'-',1) <= a.code
                    and a.code <= split_part(r.match_value,'-',2))
              or (r.match_kind = 'account_tag'          and r.match_value = any(a.tags))
              or (r.match_kind = 'account_name_pattern' and a.name ilike r.match_value)
              or (r.match_kind = 'account_type'         and r.match_value = a.type)
             )
             order by r.priority asc, r.id asc
             limit 1) as detail
      from acct a
  )
  select a.id, a.code, a.name, a.type,
         coalesce(o.line_key, ru.line_key)                                    as line_key,
         case when o.line_key is not null then 'override'
              when ru.line_key is not null then 'rule'
              else 'unmapped' end                                             as resolved_by,
         coalesce(o.detail, ru.detail, 'no matching rule — needs a CPA mapping') as match_detail
    from acct a
    left join ovr1 o  on o.account_id = a.id
    left join ruled ru on ru.account_id = a.id
   order by a.type, a.code nulls last;
$$;
grant execute on function public.resolve_account_tax_lines(uuid,text,text,int,date) to authenticated, service_role;
comment on function public.resolve_account_tax_lines is
  'Research §B.2 resolution: per account -> tax line, CPA override wins, else lowest-priority seed rule, else UNMAPPED. Returns resolved_by + match_detail for explainability (Signals #5). The mapping computation (per-line amounts) tallies these against the trial balance.';

-- ── UNMAPPED preflight: the package-ready gate (research §B.2) ────────────────
create or replace function public.tax_unmapped_accounts(
  p_org_id uuid, p_jurisdiction_code text, p_form_code text, p_tax_year int,
  p_as_of date default current_date
) returns setof public.ledger_accounts
  language sql stable security definer set search_path = public as $$
  select a.*
    from public.ledger_accounts a
    join public.resolve_account_tax_lines(p_org_id, p_jurisdiction_code, p_form_code, p_tax_year, p_as_of) r
      on r.account_id = a.id
   where r.resolved_by = 'unmapped';
$$;
grant execute on function public.tax_unmapped_accounts(uuid,text,text,int,date) to authenticated, service_role;

-- ── CPA-edit RPC: set an account's tax-line override (audit-logged) ──────────
-- Owners READ (RLS); only a CPA (can_edit_tax_map_as) may write. Audit-logged to
-- ledger_audit. p_actor-first SECDEF, service_role EXECUTE only (ISOTEST).
create or replace function public.set_account_tax_line(
  p_actor       uuid,
  p_org         uuid,
  p_account_id  uuid,
  p_form_code   text,
  p_line_key    text,
  p_tax_year_from int default null,
  p_note        text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not can_edit_tax_map_as(p_actor, p_org) then
    raise exception 'not authorized: tax-mapping edits require CPA-role access' using errcode = '42501';
  end if;
  -- account must belong to the org (no cross-tenant write)
  if not exists (select 1 from ledger_accounts where id = p_account_id and org_id = p_org) then
    raise exception 'account % is not in org %', p_account_id, p_org using errcode = '42501';
  end if;

  insert into public.org_account_tax_map (org_id, account_id, form_code, line_key, tax_year_from, set_by, note)
  values (p_org, p_account_id, p_form_code, p_line_key, p_tax_year_from, p_actor, p_note)
  on conflict (org_id, account_id, form_code, coalesce(tax_year_from, 0))
    do update set line_key = excluded.line_key, set_by = excluded.set_by,
                  note = excluded.note, created_at = now()
  returning id into v_id;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'tax.map_line', 'account', p_account_id,
          jsonb_build_object('form_code', p_form_code, 'line_key', p_line_key, 'tax_year_from', p_tax_year_from));
  return v_id;
end $$;
revoke all on function public.set_account_tax_line(uuid,uuid,uuid,text,text,int,text) from public, anon, authenticated;
grant execute on function public.set_account_tax_line(uuid,uuid,uuid,text,text,int,text) to service_role;

-- clear a CPA override (fall back to seed rules) — CPA-gated, audit-logged.
create or replace function public.clear_account_tax_line(
  p_actor uuid, p_org uuid, p_account_id uuid, p_form_code text, p_tax_year_from int default null
) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_tax_map_as(p_actor, p_org) then
    raise exception 'not authorized: tax-mapping edits require CPA-role access' using errcode = '42501';
  end if;
  delete from public.org_account_tax_map
   where org_id = p_org and account_id = p_account_id and form_code = p_form_code
     and coalesce(tax_year_from, 0) = coalesce(p_tax_year_from, 0);
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'tax.unmap_line', 'account', p_account_id,
          jsonb_build_object('form_code', p_form_code, 'tax_year_from', p_tax_year_from));
end $$;
revoke all on function public.clear_account_tax_line(uuid,uuid,uuid,text,int) from public, anon, authenticated;
grant execute on function public.clear_account_tax_line(uuid,uuid,uuid,text,int) to service_role;

-- ── M-1: Penny DRAFTS an adjustment (status='proposed') — NEVER auto-posts ────
-- Idempotent on (org, year, origin_ref): a re-draft updates the pending row.
-- Any actor with write access may draft (Penny runs as a firm/service actor);
-- APPROVAL is the human gate below. Audit-logged.
create or replace function public.draft_tax_adjustment(
  p_actor      uuid,
  p_org        uuid,
  p_tax_year   int,
  p_m1_bucket  text,
  p_amount_minor bigint,
  p_kind       text default 'permanent',
  p_line_key   text default null,
  p_memo       text default null,
  p_origin_kind text default null,
  p_origin_ref  text default null,
  p_source     text default 'penny_proposed'
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'not authorized to draft tax adjustment for org %', p_org using errcode = '42501';
  end if;
  if p_amount_minor <= 0 then
    raise exception 'adjustment amount must be positive (bucket carries direction)';
  end if;

  if p_origin_ref is not null then
    -- idempotent Penny draft: refresh the pending proposal, never duplicate
    update public.tax_adjustments
       set m1_bucket = p_m1_bucket, amount_minor = p_amount_minor, kind = coalesce(p_kind,'permanent'),
           line_key = p_line_key, memo = p_memo, origin_kind = p_origin_kind, source = p_source,
           created_by = p_actor
     where org_id = p_org and tax_year = p_tax_year and origin_ref = p_origin_ref
       and status = 'proposed'
    returning id into v_id;
  end if;

  if v_id is null then
    insert into public.tax_adjustments (
      org_id, tax_year, line_key, m1_bucket, kind, amount_minor, memo,
      source, status, origin_kind, origin_ref, created_by
    ) values (
      p_org, p_tax_year, p_line_key, p_m1_bucket, coalesce(p_kind,'permanent'),
      p_amount_minor, p_memo, p_source, 'proposed', p_origin_kind, p_origin_ref, p_actor
    ) returning id into v_id;
  end if;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'tax.m1_draft', 'tax_adjustment', v_id,
          jsonb_build_object('bucket', p_m1_bucket, 'amount_minor', p_amount_minor, 'source', p_source, 'origin', p_origin_kind));
  return v_id;
end $$;
revoke all on function public.draft_tax_adjustment(uuid,uuid,int,text,bigint,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.draft_tax_adjustment(uuid,uuid,int,text,bigint,text,text,text,text,text,text) to service_role;

-- ── M-1: a HUMAN approves (or rejects) a drafted adjustment ───────────────────
-- The gate that makes "Penny never auto-files" true (research §B.0.5). Approval
-- requires CPA-role (the same gate as mapping edits — a tax number is a CPA call).
-- Audit-logged with the approver.
create or replace function public.approve_tax_adjustment(
  p_actor uuid, p_org uuid, p_adjustment_id uuid, p_approve boolean default true
) returns void
  language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not can_edit_tax_map_as(p_actor, p_org) then
    raise exception 'not authorized: approving a tax adjustment requires CPA-role access' using errcode = '42501';
  end if;
  if not exists (select 1 from tax_adjustments where id = p_adjustment_id and org_id = p_org) then
    raise exception 'adjustment % is not in org %', p_adjustment_id, p_org using errcode = '42501';
  end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  update public.tax_adjustments
     set status = v_status, approved_by = p_actor, approved_at = now()
   where id = p_adjustment_id and org_id = p_org and status = 'proposed';
  if not found then
    raise exception 'adjustment % is not in proposed state (already decided)', p_adjustment_id;
  end if;
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'tax.m1_' || v_status, 'tax_adjustment', p_adjustment_id, '{}'::jsonb);
end $$;
revoke all on function public.approve_tax_adjustment(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.approve_tax_adjustment(uuid,uuid,uuid,boolean) to service_role;

-- ── the M-1 draft (approved adjustments only), bucketed ──────────────────────
-- Read: returns approved adjustments grouped into the four M-1 directions for a
-- (org, year). The book net income is added in the TS engine (from profitAndLoss).
-- Only APPROVED rows count — proposals never affect the return (research §B.0.5).
create or replace function public.tax_m1_summary(p_org_id uuid, p_tax_year int)
returns table (m1_bucket text, kind text, total_minor bigint, line_count int)
  language sql stable security definer set search_path = public as $$
  select m1_bucket, kind, sum(amount_minor)::bigint, count(*)::int
    from public.tax_adjustments
   where org_id = p_org_id and tax_year = p_tax_year and status = 'approved'
   group by m1_bucket, kind
   order by m1_bucket, kind;
$$;
grant execute on function public.tax_m1_summary(uuid,int) to authenticated, service_role;
