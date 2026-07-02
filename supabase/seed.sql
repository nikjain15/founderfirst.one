-- supabase/seed.sql — applied by `supabase db reset` after all migrations.
--
-- This file is intentionally thin: it \i-includes generated seed files so the
-- source of truth stays the per-domain seed dirs, not one giant hand-edited dump
-- (LEARNINGS #2). Each section is clearly delimited; APPEND new includes, do not
-- rewrite existing ones (multiple loop cards share this file).

-- ─────────────────────────────────────────────────────────────────────────────
-- CENTRAL-2 · Knowledge kernel (entity_types · industries · filing_obligations ·
-- vendor_priors · connectors). Regenerate with `pnpm seed:kernel`; the CI job
-- kernel-seed.yml asserts the generated file is fresh + idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
\i supabase/seeds/kernel/_generated.sql
