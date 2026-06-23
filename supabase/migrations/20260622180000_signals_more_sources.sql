-- =============================================================================
-- FounderFirst — Signals: higher-volume Reddit + X/Twitter sourcing
-- =============================================================================
--
-- Now that the exclude / role / geo filters keep junk out (20260622170000), we
-- can safely open the firehose. This enables the pain-shaped Reddit sources that
-- shipped disabled, tightens their cadence, and adds an X/Twitter set. All are
-- pain-shaped, US-leaning queries (first-person distress, not the service noun)
-- so the inflow already skews toward real buyers.
--
-- Cadence: Reddit 360 min (6h), X/Twitter 180 min (3h, it moves faster).
-- Admin can tune or disable any of these in the Sources tab.
--
-- Safe to re-run (idempotent: enabling is set-state, inserts are guarded).
-- =============================================================================

-- 1. Enable + tighten the Reddit sources seeded (disabled) in 20260622170000.
update sig_sources
   set enabled = true, cadence_minutes = 360, updated_at = now()
 where captured_via = 'api_direct'
   and platform = 'reddit'
   and enabled = false
   and query in (
     'behind on my bookkeeping small business',
     'haven''t filed taxes need a bookkeeper',
     'quickbooks too complicated alternative',
     'catch up bookkeeping months behind',
     'messy books 1099 schedule c help',
     'bench shut down need new bookkeeper'
   );

-- 2. Additional Reddit queries — adjacent US SMB pain (taxes, entity, payments).
insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes) values
  ('reddit', 'first time filing business taxes overwhelmed',   'api_direct', true, 360),
  ('reddit', '1099 contractor taxes need help bookkeeper',     'api_direct', true, 360),
  ('reddit', 's corp election bookkeeping small business',     'api_direct', true, 360),
  ('reddit', 'sales tax nexus help small business',            'api_direct', true, 360),
  ('reddit', 'shopify stripe reconciliation accounting mess',  'api_direct', true, 360),
  ('reddit', 'should i hire a bookkeeper or accountant',       'api_direct', true, 360),
  ('reddit', 'quickbooks alternative for freelancers',         'api_direct', true, 360),
  ('reddit', 'etsy seller taxes bookkeeping help',             'api_direct', true, 360)
on conflict do nothing;

-- 3. X/Twitter — real-time complaints and active searches for help.
insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes) values
  ('twitter', 'hate quickbooks',                       'api_direct', true, 180),
  ('twitter', 'quickbooks too expensive',              'api_direct', true, 180),
  ('twitter', 'need a bookkeeper',                     'api_direct', true, 180),
  ('twitter', 'behind on my books taxes',              'api_direct', true, 180),
  ('twitter', 'bench shutting down bookkeeper',        'api_direct', true, 180),
  ('twitter', 'messed up my bookkeeping help',         'api_direct', true, 180),
  ('twitter', 'looking for a bookkeeper small business','api_direct', true, 180)
on conflict do nothing;

-- 4. Make all api_direct sources due immediately so the next worker cycle polls.
update sig_sources set last_polled_at = null where captured_via = 'api_direct';
