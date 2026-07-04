-- W4.1-B · PayPal + Square + Amazon payout splitting goes LIVE (file-import first)
--
-- Nik (4 Jul): integrate the remaining major providers NOW. W4.1 shipped the
-- provider-agnostic framework (20260706060000): the split math, the
-- post_ecommerce_payout / reverse_ecommerce_payout RPCs, and connector-registry
-- rows for paypal / square / amazon seeded as status='planned' (disabled
-- "coming soon" tiles — audit finding F11 / PENNY-UX-8).
--
-- This card adds the three report parsers in apps/app/src/ecommerce/payouts.ts
-- (PayPal transaction CSV · Square payout-details CSV · Amazon V2 flat-file
-- settlement report, tab-delimited), so the providers are now genuinely usable
-- via file import. "Adding a provider is config + a parser": this migration is
-- the CONFIG half — flip the three registry rows to 'available'. The upload UI
-- derives tile enablement from the registry status + the parser registry
-- (hasPayoutParser), never a hardcoded provider list (CENTRAL-2 discipline).
--
-- The kernel seed (supabase/seeds/kernel/connectors.json) now carries all five
-- commerce rows as the source of truth for fresh environments; this migration
-- brings the ALREADY-SEEDED prod rows in line. Idempotent; touches only the
-- three W4.1-B rows. No schema or RPC change — post_ecommerce_payout already
-- accepts any registered commerce connector key.
--
-- API-based sync for these providers is an explicit FOLLOW-UP gated on the
-- provider credentials Nik is registering — file import ships regardless.
--
-- Write-don't-deploy (LEARNINGS #3): the integrator applies this from main.

update public.connectors
   set status = 'available',
       updated_at = now()
 where category = 'commerce'
   and key in ('paypal', 'square', 'amazon');
