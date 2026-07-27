-- =============================================================================
-- FounderFirst — price the difficulty router's "hardest" escalation tier.
-- =============================================================================
--
-- The categorize/investigation path now routes by DIFFICULTY: the cheap tier
-- (Haiku) for confident/straightforward transactions, escalating to a reasoning
-- tier (Sonnet) or, for the hardest signals (step-cap hit / no grounded draft), an
-- Opus tier. Sonnet and Haiku are already priced (see 20260628180000); this seeds
-- the Opus id so its spend is metered and cap-aware instead of counting as $0.
--
-- Cost is CONFIG and never changes an answer (D22). GLOBAL config, no customer
-- data (D15 n/a). Mirrors DEFAULT_PRICES in @ff/inference core.ts. Unique
-- timestamp (LEARNINGS rule 11); review before `supabase db push` (rule 3).
-- =============================================================================
insert into ai_model_prices (model, provider, input_per_mtok, output_per_mtok) values
  ('claude-opus-4-8', 'anthropic', 15.0, 75.0)
on conflict (model) do nothing;
