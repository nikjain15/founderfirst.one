-- Learning-loop experiments: record the promoted winner + which page an
-- experiment targets, so "Promote winner" can apply the winning section copy to
-- the live content_pages row (not just mark the experiment done).
-- Applied to prod via the Management API on 29 Jun 2026; this file keeps
-- migrations/ as the source of truth (idempotent).
alter table public.experiments add column if not exists winning_variant_key text;
alter table public.experiments add column if not exists page_slug text not null default '/';
