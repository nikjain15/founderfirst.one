-- =============================================================================
-- FounderFirst — blog: per-post hero cover visual
-- =============================================================================
--
-- Adds a `hero` key to each live blog post's payload so every article carries
-- its own distinct cover visual (PennyGlance = the books card; PennySafe = the
-- read-only / security card) instead of all posts reusing the same hero.
--
-- jsonb `||` overwrites the key in place, so re-running is a no-op. The renderer
-- (apps/web) and the @ff/content Zod schema default missing `hero` to "glance",
-- so this is forward/backward compatible; we still backfill explicitly to keep
-- the stored payload in sync with apps/web/src/blog/posts.ts (LEARNINGS #6).
--
-- NOTE: review before `supabase db push` (rule 3); prefer the dashboard SQL editor.
-- =============================================================================
update blog_posts
   set payload = payload || '{"hero":"safe"}'::jsonb
 where slug = 'is-ai-bookkeeping-safe' and is_live = true;

update blog_posts
   set payload = payload || '{"hero":"glance"}'::jsonb
 where slug = 'what-is-an-autonomous-ai-bookkeeper' and is_live = true;
