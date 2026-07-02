# FounderFirst TTS server (Chatterbox, Fly GPU, scale-to-zero) — LEGACY

> ⚠️ **Not the live engine.** Content audio now renders on **Kokoro (Fly CPU,
> app `founderfirst-kokoro`)** — see [tools/kokoro-server/README.md](../kokoro-server/README.md).
> `content-audio` defaults to `engine: "kokoro"`; this Chatterbox GPU server is the
> earlier build, kept as an alternative engine. ElevenLabs remains the paid fallback
> (and is the podcast engine — see apps/web/PODCAST_PRINCIPLES.md).

Brand-voice synthesis for the content pipeline. Runs Chatterbox (MIT) on a Fly GPU
machine that scales to zero — it boots on the first request and stops when idle,
so you only pay GPU while rendering.

Called by the `content-audio` Supabase edge function, which POSTs the audio
script + the brand voice reference clip and gets back one finished MP3.

## Endpoints

- `GET /health` → `{ "ok": true }`
- `POST /synthesize` → `audio/mpeg`
  ```json
  { "script": [{ "speaker": "host", "text": "…" }, { "speaker": "guest", "text": "…" }],
    "voice_ref_url": "https://…/brand-voice.wav",
    "format": "mp3" }
  ```
  If `TTS_SERVER_SECRET` is set, send it as the `x-tts-secret` header.

## Deploy (manual — needs a Fly GPU + the brand voice clip)

```bash
cd tools/tts-server
fly apps create founderfirst-tts          # once
fly secrets set TTS_SERVER_SECRET=<random> # must match the edge function secret
fly deploy
```

Then point the edge functions at it:

```bash
supabase secrets set TTS_SERVER_URL=https://founderfirst-tts.fly.dev/synthesize
supabase secrets set TTS_SERVER_SECRET=<same random>
# fallback provider:
supabase secrets set ELEVENLABS_API_KEY=<key> ELEVENLABS_VOICE_ID=<brand-voice-id>
```

## Blocked until

A **brand voice reference clip** exists (`content_voice_profile.reference_clip_url`).
Chatterbox and ElevenLabs both clone from that single locked clip, so the brand
voice is identical across primary and fallback. No clip → `content-audio` returns
`409 no_voice_clip` and never renders.
