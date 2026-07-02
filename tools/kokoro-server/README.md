# FounderFirst Kokoro TTS server — the LIVE content-audio engine

> Status: **live** (app `founderfirst-kokoro`, Fly CPU, min 1 warm machine) · Last verified: 2026-07-01

Penny's spoken voice for the content pipeline. Kokoro (Apache-2.0) neural TTS,
warm female voices, fast on CPU — no GPU needed. This is the **default engine**
for the `content-audio` edge function (`engine: "kokoro"`); rendering is async
via `POST /render_item` (~285s for a full episode) and the result is stored on
the content item. Voice parameters are tuned live in the admin **Voice Studio**.

- **Endpoints:** `POST /synthesize` (sync), `POST /render_item` (async, used by
  `content-audio`), `GET /health`. Shared secret: `x-kokoro-secret`
  (`KOKORO_SERVER_SECRET`, must match the edge-function secret).
- **Deploy:** `fly deploy` from this dir ([fly.toml](fly.toml), app
  `founderfirst-kokoro`, region `iad`). Verify with `flyctl logs` + `GET /health`.
- **Callers:** `supabase/functions/content-audio` and `content-voice-preview`.
- **Other engines:** Chatterbox on Fly GPU ([tools/tts-server](../tts-server/README.md),
  legacy/alternative) · ElevenLabs API (paid fallback; also the podcast engine —
  see [apps/web/PODCAST_PRINCIPLES.md](../../apps/web/PODCAST_PRINCIPLES.md)).
