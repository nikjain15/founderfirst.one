-- Podcast episode metadata — duration + byte size for each rendered audio.
--
-- A podcast RSS feed needs <itunes:duration> and an <enclosure length="bytes">.
-- The Kokoro renderer knows both when it produces the mp3, so it writes them
-- here; content-publish carries them into the published post's audio block, and
-- the /podcast feed reads them. Episodes are just published posts with audio —
-- no separate table (single source of truth).
alter table public.content_pipeline
  add column if not exists audio_seconds int,
  add column if not exists audio_bytes   bigint;
