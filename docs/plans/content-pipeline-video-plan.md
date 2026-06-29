# Content Pipeline — Phase C: Video (scoping, PARKED)

> Status: **Parked / scoping only** · 29 Jun 2026 · Owner: Nik
> Companion to [content-pipeline-plan.html](content-pipeline-plan.html). Blog + audio
> are live (`content-draft` → editorial gate → `content-audio` Chatterbox/ElevenLabs).
> Video is **not built**. This doc fixes the v1 shape so we can pick it up cleanly.

## Why video is a separate phase
The locked content plan covered **blog + audio** only. Video adds a render surface
(frames + encode), licensing/likeness questions (any avatar/face), and heavier compute.
None of that should block the blog/audio loop that already works. So video is staged,
not retrofitted.

## The asset we already have
Every published item carries a finished **brand-voice MP3** (`content_pipeline.audio_url`)
and structured metadata (`seo`: title, description, takeaways). Video v1 is an
**enrichment of that MP3**, not a new generation path — no new model, no new voice asset.

## v1 — Audiogram (recommended first build)
Audio + branded motion, rendered headlessly. Fully automatable, zero likeness/licensing risk.

**Inputs (all already produced):** `audio_url`, `seo.title`, `seo.takeaways`, brand tokens
(`packages/design-system/tokens.css`), the FounderFirst/Penny wordmark.

**Output:** a 1080×1080 (social) + 1920×1080 (YouTube) MP4 with:
- branded title card (title + Penny mark on brand-gradient background),
- an animated waveform / progress bar driven by the audio amplitude,
- burned-in captions from the audio script (we already have the exact text — no STT needed),
- a closing card with `founderfirst.one` + `founder@founderfirst.one`.

**How:** `ffmpeg` only (`showwaves`/`showspectrum` filter + `drawtext`/`subtitles` + `concat`).
Run it where the audio is rendered — extend the **Fly GPU TTS server** (ffmpeg already in
that image) with a `POST /audiogram` endpoint, or a sibling CPU Fly app. A new
`content-video` edge function orchestrates: pull `audio_url` + script → call render → upload
MP4 to a `content-video` bucket → write `content_pipeline.video_url`.

**Pipeline fit:** new stage after `content-audio`, gated the same way — a video judge can
check caption/audio sync, brand-token usage, and that no banned copy slipped into a card.

**Cost/risk:** low. ffmpeg is deterministic; re-runs are cheap; no faces, no third-party
likeness, no model licensing.

## v2 — Slides + voiceover (later)
Generate slide frames from `seo.takeaways` (one card per takeaway, brand-templated, via the
same SVG/HTML→PNG path the email covers use), then sync each card to its segment of the
narration. More work (timing/segmentation, layout templating) and closer to a real explainer.
Build only after v1 proves the render path and the audiogram clears the judge.

## Explicitly out of scope (for now)
- Talking-head / avatar video (likeness + licensing + cost; revisit only with a clear need).
- Live B-roll / stock footage compositing.
- Per-platform aspect-ratio matrix beyond 1:1 and 16:9.

## Open decisions before building
1. Render host: extend `founderfirst-tts` (GPU, already has ffmpeg) vs. a cheap CPU Fly app.
2. Captions: full script burn-in vs. condensed key-line captions.
3. Schema: add `content_pipeline.video_url` + a `content-video` bucket (one migration), mirroring
   the audio path.

## Build checklist (when un-parked)
- [ ] `content_pipeline.video_url` column + `content-video` storage bucket (one migration).
- [ ] Render endpoint (`/audiogram`) on the chosen Fly host.
- [ ] `content-video` edge function (orchestrate + upload + write `video_url`), admin-gated.
- [ ] Video judge gate (sync, brand tokens, banned-copy check on cards).
- [ ] Admin board: video preview + render button alongside the audio controls.
