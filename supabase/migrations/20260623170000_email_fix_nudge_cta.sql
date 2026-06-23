-- =============================================================================
-- FounderFirst — fix double-escaped nudge CTA label
-- =============================================================================
--
-- The changelog_nudge CTA was seeded pre-encoded as "Review &amp; send", but the
-- shell's emailButton() already HTML-escapes the label — so it rendered as the
-- literal "Review &amp; send". Store the plain text and let the shell escape once.
--
-- Conditional on the old value so an admin's own edit is never clobbered.
-- Safe to re-run.
-- =============================================================================

update public.email_templates
   set cta_label = 'Review & send'
 where email_key = 'changelog_nudge'
   and cta_label = 'Review &amp; send';
