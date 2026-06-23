-- =============================================================================
-- FounderFirst — Signals: relevance tuning (quoted queries + more ICP examples)
-- =============================================================================
--
-- Empirical finding: API Direct treats UNQUOTED multi-word queries as loose
-- OR-matching, so "need a bookkeeper small business" returned ~50% off-topic
-- posts (it matched "small"/"business"/"need"). QUOTING the phrase yields ~100%
-- topical results ("need a bookkeeper" -> 20/20). Phrases anchored by
-- bookkeeper/bookkeeping/quickbooks/accountant score highest; bare "books"
-- phrases match literal reading-books and were dropped.
--
-- This migration:
--   1. Replaces ALL api_direct sources with a validated, quoted-phrase set
--      (Reddit + X only; LinkedIn keyword search dropped — it inverts the ICP).
--   2. Adds 16 ICP reference examples (5 -> 21) so the relevance gate has a
--      richer target. The worker embeds new examples on its next cycle.
--
-- Deleting a source nulls its items' source_id (on delete set null); items keep.
-- Safe to re-run (delete + guarded inserts).
-- =============================================================================

-- 1. Clean slate for automated sources, then insert the validated set.
delete from sig_sources where captured_via = 'api_direct';

-- Reddit — quoted phrases, all measured >=15/20 topical. cadence 360 (6h).
insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes) values
  ('reddit', '"need a bookkeeper"',                'api_direct', true, 360),
  ('reddit', '"hire a bookkeeper"',                'api_direct', true, 360),
  ('reddit', '"find a bookkeeper"',                'api_direct', true, 360),
  ('reddit', '"looking for a bookkeeper"',         'api_direct', true, 360),
  ('reddit', '"recommend a bookkeeper"',           'api_direct', true, 360),
  ('reddit', '"need help with bookkeeping"',       'api_direct', true, 360),
  ('reddit', '"behind on bookkeeping"',            'api_direct', true, 360),
  ('reddit', '"catch up bookkeeping"',             'api_direct', true, 360),
  ('reddit', '"year end bookkeeping"',             'api_direct', true, 360),
  ('reddit', '"bookkeeping software"',             'api_direct', true, 360),
  ('reddit', '"hate quickbooks"',                  'api_direct', true, 360),
  ('reddit', '"quickbooks alternative"',           'api_direct', true, 360),
  ('reddit', '"switch from quickbooks"',           'api_direct', true, 360),
  ('reddit', '"need an accountant"',               'api_direct', true, 360),
  ('reddit', '"hire an accountant"',               'api_direct', true, 360),
  ('reddit', '"small business accountant"',        'api_direct', true, 360),
  ('reddit', '"first time filing business taxes"', 'api_direct', true, 360),
  ('reddit', '"need help with taxes"',             'api_direct', true, 360),
  ('reddit', '"1099 contractor"',                  'api_direct', true, 360),
  ('reddit', '"bench shut down"',                  'api_direct', true, 360)
on conflict do nothing;

-- X/Twitter — quoted phrases, measured >=18/20 topical. cadence 180 (3h).
insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes) values
  ('twitter', '"hate quickbooks"',          'api_direct', true, 180),
  ('twitter', '"need a bookkeeper"',        'api_direct', true, 180),
  ('twitter', '"looking for a bookkeeper"', 'api_direct', true, 180),
  ('twitter', '"quickbooks alternative"',   'api_direct', true, 180),
  ('twitter', '"switch from quickbooks"',   'api_direct', true, 180)
on conflict do nothing;

-- 2. More ICP reference examples (varied, US-flavored first-person pain).
-- Insert only bodies not already present (idempotent — no unique index on body).
insert into sig_icp_examples (body)
select v.body from (values
  ('I''m 9 months behind on my bookkeeping and tax season is coming. I have a shoebox of receipts and a Stripe account and no idea where to start.'),
  ('It''s almost year-end and my books are a disaster. My CPA needs clean financials and I''m panicking about getting everything categorized in time.'),
  ('QuickBooks is driving me insane. Every month I spend hours trying to reconcile and it still doesn''t match my bank. There has to be a better way for a small business.'),
  ('QuickBooks keeps raising prices and I''m paying for features I never use. I''m a solo consultant — I just need someone to keep my books straight without the bloat.'),
  ('First year running my LLC and I have no clue how to file business taxes. I mixed personal and business expenses all year and now I''m terrified of the IRS.'),
  ('I''m a 1099 contractor and made way more this year than expected. I haven''t set anything aside for taxes and don''t understand quarterly estimated payments.'),
  ('Just elected S-corp status and realized I need real bookkeeping and payroll now. It''s way over my head — looking for someone to handle the monthly books.'),
  ('We started selling in multiple states on Shopify and now I''m getting sales tax notices. I have no system for tracking nexus and it''s becoming a nightmare.'),
  ('Revenue is growing and I can''t keep doing the books myself at 11pm anymore. When is the right time to hire a bookkeeper and what should it cost?'),
  ('I own 4 rental properties and track everything in a messy spreadsheet. Come tax time it''s chaos figuring out deductions and depreciation per property.'),
  ('I sell on Etsy and Amazon and the fees, refunds, and inventory make bookkeeping impossible. I just want accurate numbers without losing a weekend every month.'),
  ('Running a small marketing agency and our finances are a black box. I don''t know our real profit margins because the books are months out of date.'),
  ('Bootstrapped SaaS founder here. Stripe MRR, refunds, and annual plans make revenue recognition confusing. I need books a future investor would actually trust.'),
  ('I run a small cafe with a lot of cash and card sales. Reconciling the POS with my bank every month is a mess and I''m always behind.'),
  ('I''ve been doing my own books in spreadsheets for two years and it''s gotten out of control. I want to hand this off before it bites me at tax time.'),
  ('My bookkeeping is a complete nightmare — uncategorized transactions going back months and no idea what I actually owe in taxes. I need help digging out.')
) as v(body)
where not exists (select 1 from sig_icp_examples e where e.body = v.body);
