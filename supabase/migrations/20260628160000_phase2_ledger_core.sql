-- Phase 2 — ledger core (ARCHITECTURE.md §6, §C2, §C6). The double-entry ledger
-- the CPA trusts: balanced, immutable, auditable, correct to the cent.
--
-- Invariants enforced HERE (belt) — the posting API re-checks (suspenders):
--   • Money = integer minor units (bigint) + currency. NEVER float.
--   • Every entry balanced: Σ debits = Σ credits per (entry, currency) — deferred
--     constraint trigger, checked at COMMIT.
--   • Append-only: journal_lines fully immutable; journal_entries financial fields
--     immutable (only the status/approval workflow may change). Corrections are
--     reversing entries, never edits/deletes.
--   • Idempotency: unique(org_id, idempotency_key) — replays can't double-post.
--   • Provenance: source + source_ref on every entry.
-- Period close + the balanced/period checks at write time live in the posting
-- function (next slice); this migration lays the schema + structural guards.
--
-- All tenant tables: org_id + RLS (can_access_org read; client writes denied —
-- the service-role write-path posts). authenticated SELECT + service_role CRUD
-- grants (Phase 0 taught us service_role needs explicit grants).

-- ── enums ─────────────────────────────────────────────────────────────────
create type account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');
create type period_status as enum ('open', 'closed');
create type entry_status as enum ('posted', 'pending_review', 'reversed');

-- ── per-org accounting settings ───────────────────────────────────────────
create table org_accounting_settings (
  org_id                     uuid primary key references organizations(id) on delete cascade,
  fiscal_year_start_month    int not null default 1 check (fiscal_year_start_month between 1 and 12),
  home_currency              char(3) not null default 'USD',
  cutover_date               date,
  cpa_posts_require_approval boolean not null default false,
  created_at                 timestamptz not null default now()
);

-- ── chart of accounts ─────────────────────────────────────────────────────
create table ledger_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text,
  name        text not null,
  type        account_type not null,
  parent_id   uuid references ledger_accounts(id),
  currency    char(3) not null default 'USD',
  is_archived boolean not null default false,
  source      text,
  source_ref  text,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);
create index ledger_accounts_org_idx on ledger_accounts (org_id);

-- ── accounting periods ────────────────────────────────────────────────────
create table accounting_periods (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  status        period_status not null default 'open',
  closed_by     uuid references auth.users(id),
  closed_at     timestamptz,
  unique (org_id, period_start, period_end),
  check (period_end >= period_start)
);
create index accounting_periods_org_idx on accounting_periods (org_id);

-- ── journal entries (immutable header) ────────────────────────────────────
create table journal_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  entry_date      date not null,
  period_id       uuid not null references accounting_periods(id),
  memo            text,
  status          entry_status not null default 'posted',
  source          text not null,
  source_ref      text,
  reverses_id     uuid references journal_entries(id),
  idempotency_key text not null,
  posted_by       uuid not null references auth.users(id),
  approved_by     uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (org_id, idempotency_key)
);
create index journal_entries_org_idx    on journal_entries (org_id);
create index journal_entries_period_idx on journal_entries (period_id);

-- ── journal lines (debit/credit rows) ─────────────────────────────────────
create table journal_lines (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references journal_entries(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade, -- denormalized for RLS
  account_id    uuid not null references ledger_accounts(id),
  amount_minor  bigint not null check (amount_minor >= 0), -- magnitude in minor units (cents)
  currency      char(3) not null default 'USD',
  side          char(1) not null check (side in ('D', 'C')),
  memo          text
);
create index journal_lines_entry_idx   on journal_lines (entry_id);
create index journal_lines_org_idx     on journal_lines (org_id);
create index journal_lines_account_idx on journal_lines (account_id);

-- ── balanced invariant: deferred constraint trigger (checked at COMMIT) ─────
-- Per (entry, currency): Σ(side='D') must equal Σ(side='C'). Deferred so a
-- multi-line entry can be inserted line-by-line within a txn and validated once
-- at commit.
create or replace function assert_entry_balanced()
returns trigger language plpgsql as $$
declare
  v_entry uuid := coalesce(NEW.entry_id, OLD.entry_id);
  v_bad int;
begin
  select count(*) into v_bad from (
    select 1
    from journal_lines
    where entry_id = v_entry
    group by currency
    having sum(case when side = 'D' then amount_minor else 0 end)
        <> sum(case when side = 'C' then amount_minor else 0 end)
  ) t;
  if v_bad > 0 then
    raise exception 'journal entry % is not balanced: debits <> credits per currency', v_entry
      using errcode = 'check_violation';
  end if;
  return null;
end$$;

create constraint trigger journal_lines_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function assert_entry_balanced();

-- ── append-only guards ──────────────────────────────────────────────────────
-- journal_lines: fully immutable (financial content never changes).
create or replace function block_line_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'append-only: % on journal_lines is not allowed; post a reversing entry', TG_OP
    using errcode = 'restrict_violation';
end$$;
create trigger journal_lines_immutable
  before update or delete on journal_lines
  for each row execute function block_line_mutation();

-- journal_entries: never delete; on update only the status/approval workflow may
-- change (pending_review → posted via owner approval, or → reversed). All
-- financial fields are immutable.
create or replace function guard_journal_entry_mutation()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'append-only: cannot delete journal entries; post a reversing entry'
      using errcode = 'restrict_violation';
  end if;
  if NEW.org_id          is distinct from OLD.org_id
  or NEW.entry_date      is distinct from OLD.entry_date
  or NEW.period_id       is distinct from OLD.period_id
  or NEW.memo            is distinct from OLD.memo
  or NEW.source          is distinct from OLD.source
  or NEW.source_ref      is distinct from OLD.source_ref
  or NEW.reverses_id     is distinct from OLD.reverses_id
  or NEW.idempotency_key is distinct from OLD.idempotency_key
  or NEW.posted_by       is distinct from OLD.posted_by
  or NEW.created_at      is distinct from OLD.created_at then
    raise exception 'append-only: journal entry financial fields are immutable (only status/approval may change)'
      using errcode = 'restrict_violation';
  end if;
  return NEW;
end$$;
create trigger journal_entries_guard
  before update or delete on journal_entries
  for each row execute function guard_journal_entry_mutation();

-- ── RLS + grants ────────────────────────────────────────────────────────────
alter table org_accounting_settings enable row level security;
alter table ledger_accounts         enable row level security;
alter table accounting_periods      enable row level security;
alter table journal_entries         enable row level security;
alter table journal_lines           enable row level security;

-- reads: anyone who can access the org. writes: service-role API only.
create policy oas_select  on org_accounting_settings for select using ( can_access_org(org_id) );
create policy oas_nowrite on org_accounting_settings for all using (false) with check (false);
create policy la_select    on ledger_accounts for select using ( can_access_org(org_id) );
create policy la_nowrite   on ledger_accounts for all using (false) with check (false);
create policy ap_select    on accounting_periods for select using ( can_access_org(org_id) );
create policy ap_nowrite   on accounting_periods for all using (false) with check (false);
create policy je_select    on journal_entries for select using ( can_access_org(org_id) );
create policy je_nowrite   on journal_entries for all using (false) with check (false);
create policy jl_select    on journal_lines for select using ( can_access_org(org_id) );
create policy jl_nowrite   on journal_lines for all using (false) with check (false);

grant select on
  org_accounting_settings, ledger_accounts, accounting_periods,
  journal_entries, journal_lines
to authenticated;
grant select, insert, update, delete on
  org_accounting_settings, ledger_accounts, accounting_periods,
  journal_entries, journal_lines
to service_role;
