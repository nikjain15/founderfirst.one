-- W2.2 — QBO one-click migration with history (BACKLOG §W2.2, FULL_BOOKKEEPING_ROADMAP).
--
-- "I'd love historic data in the new system." A connected QuickBooks company
-- migrates FULLY: pull the chart of accounts + full transaction history →
-- per-year import batches → account-mapping review → trial-balance comparison
-- vs QBO's own TB (the trust moment) → cutover date set.
--
-- This migration adds only the STATE + RPCs the migration needs; the actual
-- posting still flows through the verified, deduped commit_import_batch(4-arg)
-- (source 'qbo' → bank branch, ext:qbo:<external_id> idempotency), so a re-pull
-- NEVER double-posts and every posted entry balances. Nothing here forks the
-- ledger write-path.
--
-- Two new pieces:
--   1. provider_migrations — one row per migration run. Records the connection,
--      the per-year batch ids, the cutover date, and a SNAPSHOT of QBO's own
--      trial balance (jsonb) so the app can diff QBO's TB against the ledger TB
--      to the cent and explain any variance (never silent).
--   2. set_import_batch_cutover — set a batch's cutover date post-hoc (the qbo
--      pull creates batches with a null cutover; the owner confirms the cutover
--      after reviewing the TB comparison). Audit-logged, pre-commit only.
--
-- RLS: provider_migrations is can_access_org read, service_role write — the same
-- wall as import_batches / external_connections. Tokens never involved here.

-- ── provider migration record ───────────────────────────────────────────────
create type provider_migration_status as enum ('pulling', 'review', 'committed', 'discarded');

create table provider_migrations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  connection_id  uuid not null references external_connections(id) on delete cascade,
  provider       external_provider not null,
  status         provider_migration_status not null default 'pulling',
  cutover_date   date,                                   -- confirmed after TB review
  batch_ids      uuid[] not null default '{}',           -- the per-year import_batches
  accounts       int not null default 0,                 -- CoA accounts upserted
  txn_count      int not null default 0,                 -- transactions staged across batches
  provider_tb    jsonb not null default '[]'::jsonb,     -- QBO's own trial balance snapshot
  provider_tb_as_of date,                                -- the report date of provider_tb
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index provider_migrations_org_idx on provider_migrations (org_id);
-- one active migration record per connection: a re-pull updates the SAME row (upsert target)
create unique index provider_migrations_conn_uidx on provider_migrations (connection_id);

alter table provider_migrations enable row level security;
create policy pm_select  on provider_migrations for select using ( can_access_org(org_id) );
create policy pm_nowrite on provider_migrations for all using (false) with check (false);
grant select on provider_migrations to authenticated;
grant select, insert, update, delete on provider_migrations to service_role;

-- ── record_provider_migration — upsert the run record (service-role, from *-import) ─
-- Called by the qbo-import edge fn after it stages the per-year batches. Idempotent
-- on (org, connection): a re-pull updates the SAME row rather than piling up records,
-- so the migration is one durable object the UI drives to completion.
create or replace function record_provider_migration(
  p_actor            uuid,
  p_org              uuid,
  p_connection       uuid,
  p_provider         external_provider,
  p_batch_ids        uuid[],
  p_accounts         int,
  p_txn_count        int,
  p_provider_tb      jsonb,
  p_provider_tb_as_of date default null
) returns provider_migrations
language plpgsql security definer set search_path = public as $$
declare v_m provider_migrations;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from external_connections where id = p_connection and org_id = p_org) then
    raise exception 'bad_connection: connection not in this org' using errcode = 'foreign_key_violation';
  end if;

  insert into provider_migrations (
    org_id, connection_id, provider, status, batch_ids, accounts, txn_count,
    provider_tb, provider_tb_as_of, created_by, updated_at)
  values (
    p_org, p_connection, p_provider, 'review',
    coalesce(p_batch_ids, '{}'), coalesce(p_accounts, 0), coalesce(p_txn_count, 0),
    coalesce(p_provider_tb, '[]'::jsonb), p_provider_tb_as_of, p_actor, now())
  on conflict (connection_id)
    do update set
      batch_ids = excluded.batch_ids,
      accounts = excluded.accounts,
      txn_count = excluded.txn_count,
      provider_tb = excluded.provider_tb,
      provider_tb_as_of = excluded.provider_tb_as_of,
      status = case when provider_migrations.status = 'committed'
                    then provider_migrations.status else 'review' end,
      updated_at = now()
  returning * into v_m;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'migration.pull', 'provider_migration', v_m.id,
          jsonb_build_object('provider', p_provider, 'accounts', coalesce(p_accounts,0),
                             'txn_count', coalesce(p_txn_count,0),
                             'batches', coalesce(array_length(p_batch_ids,1), 0)));
  return v_m;
end$$;

-- ── set_import_batch_cutover — confirm a batch's cutover date (pre-commit) ────
-- The QBO pull stages per-year batches with cutover null (bank rows don't need a
-- cutover). After reviewing the TB comparison the owner confirms the migration's
-- cutover date; we stamp it on each batch for provenance. Audit-logged; a committed
-- batch is frozen (the import_batches guard already blocks a committed→ mutation).
create or replace function set_import_batch_cutover(
  p_actor uuid, p_org uuid, p_batch uuid, p_cutover date
) returns import_batches
language plpgsql security definer set search_path = public as $$
declare v_b import_batches;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_b from import_batches where id = p_batch and org_id = p_org for update;
  if not found then raise exception 'not_found: batch % not in org %', p_batch, p_org using errcode = 'no_data_found'; end if;
  if v_b.status = 'committed' then
    raise exception 'batch is committed — cutover is frozen' using errcode = 'restrict_violation';
  end if;
  update import_batches set cutover_date = p_cutover where id = p_batch returning * into v_b;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'migration.cutover', 'import_batch', p_batch,
          jsonb_build_object('cutover_date', p_cutover));
  return v_b;
end$$;

-- ── set_provider_migration_cutover — stamp the migration record + mark committed ─
create or replace function set_provider_migration_cutover(
  p_actor uuid, p_org uuid, p_migration uuid, p_cutover date
) returns provider_migrations
language plpgsql security definer set search_path = public as $$
declare v_m provider_migrations;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_m from provider_migrations where id = p_migration and org_id = p_org for update;
  if not found then raise exception 'not_found: migration % not in org %', p_migration, p_org using errcode = 'no_data_found'; end if;
  update provider_migrations
     set cutover_date = p_cutover, status = 'committed', updated_at = now()
   where id = p_migration returning * into v_m;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, 'migration.commit', 'provider_migration', p_migration,
          jsonb_build_object('cutover_date', p_cutover));
  return v_m;
end$$;

-- ── grants: write-path functions locked to service_role ─────────────────────
revoke all on function record_provider_migration(uuid, uuid, uuid, external_provider, uuid[], int, int, jsonb, date) from public;
revoke all on function set_import_batch_cutover(uuid, uuid, uuid, date)          from public;
revoke all on function set_provider_migration_cutover(uuid, uuid, uuid, date)    from public;

grant execute on function record_provider_migration(uuid, uuid, uuid, external_provider, uuid[], int, int, jsonb, date) to service_role;
grant execute on function set_import_batch_cutover(uuid, uuid, uuid, date)          to service_role;
grant execute on function set_provider_migration_cutover(uuid, uuid, uuid, date)    to service_role;
