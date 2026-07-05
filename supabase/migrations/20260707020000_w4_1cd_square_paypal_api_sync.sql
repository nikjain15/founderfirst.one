-- W4.1-C/D · Square + PayPal API payout sync goes live (SANDBOX, READ-ONLY)
--
-- W4.1-B made PayPal + Square usable via file import. This card adds the LIVE
-- API pull path (read-only settlements/payouts → the SAME split machinery →
-- post_ecommerce_payout), sandbox only. "Adding a capability is config + a
-- parser, not a rewrite": the parser/mapping lives in
-- apps/app/src/ecommerce/apiSync.ts + supabase/functions/_shared/commerceApi.ts;
-- this migration is the CONFIG half — declare the `api_sync` capability (and the
-- read-only scope requested) on the two registry rows so the Connections surface
-- can offer a "Sync now" action derived from the registry, never a hardcoded
-- provider list (CENTRAL-2 discipline).
--
-- READ-ONLY + SANDBOX: no schema/RPC change. post_ecommerce_payout already
-- accepts any registered commerce connector key and its idempotency key
-- (ext:<provider>:payout:<id>) makes an API-pulled payout and the same payout
-- uploaded via CSV collapse to ONE posted entry (exactly-once).
--
-- Production OAuth (a prod app + owner consent) is a separate, human-gated step
-- and is intentionally NOT enabled here.
--
-- The kernel seed (supabase/seeds/kernel/connectors.json) now carries these
-- capabilities/scopes as the source of truth for fresh environments; this
-- migration brings already-seeded prod rows in line. Idempotent; touches only
-- the paypal + square commerce rows. Write-don't-deploy (LEARNINGS #3): the
-- integrator applies this from main.

-- PayPal — add api_sync capability + the read-only reporting scope.
update public.connectors
   set capabilities = '["payout_split", "report_import", "api_sync"]'::jsonb,
       scopes       = '["https://uri.paypal.com/services/reporting/search/read"]'::jsonb,
       updated_at   = now()
 where category = 'commerce'
   and key = 'paypal';

-- Square — add api_sync capability + the read-only payouts scope.
update public.connectors
   set capabilities = '["payout_split", "report_import", "api_sync"]'::jsonb,
       scopes       = '["PAYOUTS_READ"]'::jsonb,
       updated_at   = now()
 where category = 'commerce'
   and key = 'square';
