-- content_pipeline.judge — editorial quality-gate verdict attached at draft time.
-- Written by the content-draft edge function (see _shared/content_judge.ts): an
-- Opus judge scores the Sonnet draft for brand-voice fidelity, grounding (no
-- fabricated facts), SEO, structure, and the audio script. A clean 'ship' verdict
-- auto-advances the item to 'review'; anything else stays in 'drafting' with the
-- judge's issues visible to a human. RLS is unchanged — reads stay RPC-gated.
alter table public.content_pipeline
  add column if not exists judge jsonb;

comment on column public.content_pipeline.judge is
  'Editorial AI-judge verdict for the current draft: {brand_voice, grounding{fabricated_claims}, seo, structure, audio_script, overall, verdict, issues}. Null until drafted.';
