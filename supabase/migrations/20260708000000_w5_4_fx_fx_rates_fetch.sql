-- W5.4-FX — ECB fx-rate feed: the piece W5.4 shipped a resolver for but never
-- populated. `fx_rates` ships empty in prod; the resolver correctly raises on
-- any foreign-currency post for an opted-in org (D3: fail loud, never default
-- to 1) — but there is nothing to resolve against yet. This migration adds:
--
--   1. A manual-override entry path (D3's "manual = override only"): an admin
--      RPC that inserts/updates a `source='manual'` row, for a date the ECB
--      feed never had (holiday/weekend gap) or to correct a bad snapshot.
--   2. The resolver preferring an exact-date manual override over whatever the
--      ECB snapshot says for that date, while still falling back to the most
--      recent ECB rate on or before the requested date otherwise.
--   3. The pg_cron + pg_net trigger that calls the fx-rates-fetch Edge
--      Function daily (mirrors changelog_trigger_digest exactly — same
--      shared-secret-from-Vault idiom, same fail-silent-if-unset guard so a
--      missing secret can never turn into a cron error spam).
--
-- One-time setup (safe to re-run this migration once secrets exist):
--   1. supabase functions deploy fx-rates-fetch
--   2. supabase secrets set FX_RATES_FETCH_SECRET=<random>
--      select vault.create_secret('<same value>', 'fx_rates_fetch_secret');
--   3. One manual call to seed a starting snapshot:
--      curl -X POST '<SUPABASE_URL>/functions/v1/fx-rates-fetch' \
--        -H 'x-fx-rates-secret: <same value>' -H 'content-type: application/json' \
--        -d '{"mode":"backfill"}'
--      (or trigger it from the admin console with an admin session instead of the secret)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. Manual-override entry (D3) — admin-gated, global (fx_rates has no
-- org_id; one override serves every org, matching the ECB snapshot's own
-- global shape). Reuses the RLS-bypassing SECURITY DEFINER + is_admin() gate
-- already used by admin_list_discord_links et al.
create or replace function set_manual_fx_rate(
  p_quote_ccy char(3),
  p_as_of     date,
  p_rate      numeric,
  p_base_ccy  char(3) default 'EUR'
) returns fx_rates
language plpgsql security definer set search_path = public as $$
declare v_row fx_rates;
begin
  if not is_admin() then
    raise exception 'forbidden: admin access required' using errcode = 'insufficient_privilege';
  end if;
  if p_rate <= 0 then
    raise exception 'bad_rate: rate must be > 0' using errcode = 'invalid_parameter_value';
  end if;
  if p_quote_ccy !~ '^[A-Z]{3}$' or p_base_ccy !~ '^[A-Z]{3}$' then
    raise exception 'bad_currency: must be a 3-letter ISO code' using errcode = 'invalid_parameter_value';
  end if;

  insert into fx_rates (base_currency, quote_currency, rate, as_of, source)
  values (p_base_ccy, p_quote_ccy, p_rate, p_as_of, 'manual')
  on conflict (base_currency, quote_currency, as_of, source)
  do update set rate = excluded.rate
  returning * into v_row;
  return v_row;
end$$;

revoke all on function set_manual_fx_rate(char, date, numeric, char) from public;
grant execute on function set_manual_fx_rate(char, date, numeric, char) to authenticated;

-- ── 2. Resolver: an exact-date manual override wins; otherwise most recent
-- rate on or before the date, regardless of source (so a manual entry can
-- also fill a genuine ECB gap — e.g. a bank holiday the feed never published
-- — not just correct an existing one).
create or replace function fx_rate_vs_snapshot_base(p_ccy char(3), p_date date, p_source text default 'ECB', p_snapshot_base char(3) default 'EUR')
returns numeric language sql stable as $$
  select case when p_ccy = p_snapshot_base then 1
    else (
      select rate from fx_rates
       where quote_currency = p_ccy and base_currency = p_snapshot_base
         and source in (p_source, 'manual')
         and as_of <= p_date
       order by (source = 'manual' and as_of = p_date) desc, as_of desc
       limit 1
    )
  end;
$$;

-- ── 3. Daily cron trigger — POSTs to fx-rates-fetch. Mirrors
-- changelog_trigger_digest() (20260623120000): Vault secret, silent no-op if
-- unset (a digest/fetch must never error the cron scheduler), same net.http_post
-- shape. Reads the project URL from the same convention as that trigger.
create or replace function fx_rates_trigger_fetch(p_mode text default 'daily')
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/fx-rates-fetch';
  secret text;
begin
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'fx_rates_fetch_secret'
    limit 1;
  exception when others then
    secret := null;
  end;

  if secret is null then
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-fx-rates-secret', secret
    ),
    body    := jsonb_build_object('mode', p_mode)
  );
end;
$$;

-- Schedule — daily, 16:30 UTC (safely after the ECB's ~16:00 CET/CEST daily
-- publish year-round). Idempotent re-schedule, same guard as changelog's.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fx-rates-daily-fetch') then
    perform cron.unschedule('fx-rates-daily-fetch');
  end if;
  perform cron.schedule('fx-rates-daily-fetch', '30 16 * * *', 'select fx_rates_trigger_fetch(''daily'');');
end;
$$;
