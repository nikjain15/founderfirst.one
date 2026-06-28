-- Phase 0 follow-up: grant the write-path role CRUD on the backbone tables.
--
-- The Phase 0 migration (20260627150000) enabled RLS and granted only SELECT to
-- `authenticated`. The typed write-path runs as `service_role` (bypasses RLS, holds
-- secrets) and must INSERT/UPDATE/DELETE — but service_role did NOT inherit grants
-- on these freshly-created tables (Supabase default privileges only covered older
-- tables), so org/invite/engagement writes failed with "permission denied for
-- table organizations". Grant explicitly. Additive; no data change.
grant select, insert, update, delete on
  organizations, memberships, engagements, client_assignments,
  platform_staff, invites, subscriptions
to service_role;
