"""
FounderFirst Kokoro TTS server — Penny's spoken (podcast) voice.

Open (Apache-2.0) neural TTS with warm female voices that runs fast on CPU, so
no GPU is needed. Called by the `content-audio` and `content-voice-preview`
Supabase edge functions, which pass the script plus the live voice-studio
settings (voice blend, speed, pause, accent). Stateless: all tuning comes in the
request body, sourced from content_voice_profile by the caller.

POST /synthesize
  { "script": [{"speaker":"host","text":"…"}, …]  OR  "text": "…",
    "voice_a":"af_heart", "voice_b":"af_nova", "blend":0.6,
    "speed":0.88, "gap_ms":260, "lang":"a", "bitrate":"160k" }
  → audio/mpeg

Auth: if KOKORO_SERVER_SECRET is set, callers must send x-kokoro-secret.
Health: GET /health.
"""
import io
import json
import os
import urllib.request

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

app = FastAPI(title="founderfirst-kokoro")

# Lazy singletons — load on first synth so /health and boot stay cheap, and a
# scale-from-zero cold start only pays the model cost when actually rendering.
_pipelines: dict = {}
_voice_cache: dict = {}


def _pipeline(lang: str):
    from kokoro import KPipeline  # imported lazily
    if lang not in _pipelines:
        _pipelines[lang] = KPipeline(lang_code=lang)
    return _pipelines[lang]


def _voice(pipe, name: str):
    if name not in _voice_cache:
        _voice_cache[name] = pipe.load_voice(name)
    return _voice_cache[name]


class Line(BaseModel):
    speaker: str = "host"
    text: str


class SynthRequest(BaseModel):
    script: list[Line] | None = None
    text: str | None = None
    voice_a: str = "af_heart"
    voice_b: str | None = "af_nova"
    blend: float = 0.6
    speed: float = 0.88
    gap_ms: int = 260
    lang: str = "a"
    bitrate: str = "160k"


@app.get("/health")
def health():
    return {"ok": True}


# Core render — no auth, reused by /synthesize and the async /render_item job.
def _render_mp3(req: SynthRequest) -> bytes:
    lines = [l.text for l in req.script] if req.script else ([req.text] if req.text else [])
    lines = [t.strip() for t in lines if t and t.strip()]
    if not lines:
        raise HTTPException(status_code=400, detail="empty script")

    import numpy as np
    import soundfile as sf
    from pydub import AudioSegment

    pipe = _pipeline(req.lang)
    va = _voice(pipe, req.voice_a)
    voice = va
    if req.voice_b:
        vb = _voice(pipe, req.voice_b)
        b = max(0.0, min(1.0, req.blend))
        voice = b * va + (1 - b) * vb

    combined = AudioSegment.silent(duration=200)
    for text in lines:
        chunks = [a for _, _, a in pipe(text, voice=voice, speed=req.speed)]
        full = np.concatenate(chunks)
        buf = io.BytesIO()
        sf.write(buf, full, 24000, format="WAV")
        buf.seek(0)
        combined += AudioSegment.from_wav(buf) + AudioSegment.silent(duration=req.gap_ms)

    out = io.BytesIO()
    combined.export(out, format="mp3", bitrate=req.bitrate)
    return out.getvalue()


@app.post("/synthesize")
def synthesize(req: SynthRequest, x_kokoro_secret: str | None = Header(default=None)):
    secret = os.environ.get("KOKORO_SERVER_SECRET")
    if secret and x_kokoro_secret != secret:
        raise HTTPException(status_code=401, detail="bad secret")
    return Response(content=_render_mp3(req), media_type="audio/mpeg")


# ── Async item render — owns the long job so the edge function never blocks ──
# content-audio POSTs {item_id}; this returns 202 immediately and renders +
# uploads + writes content_pipeline.audio_url on this machine (no 150s limit).

class RenderItemRequest(BaseModel):
    item_id: str


def _supa(path: str, method: str = "GET", body: bytes | None = None, ctype: str | None = None):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(f"{base}{path}", data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def _render_and_store(item_id: str):
    try:
        item = json.loads(_supa(f"/rest/v1/content_pipeline?id=eq.{item_id}&select=script"))[0]
        script = (item.get("script") or {}).get("audio") or []
        prof = json.loads(_supa("/rest/v1/content_voice_profile?is_active=eq.true&select=voice_a,voice_b,blend,speed,gap_ms,lang,bitrate"))[0]
        sr = SynthRequest(script=[Line(**l) for l in script], **prof)
        mp3 = _render_mp3(sr)  # secret-free core render
        path = f"{item_id}/episode.mp3"
        _supa(f"/storage/v1/object/content-audio/{path}", method="PUT", body=mp3, ctype="audio/mpeg")
        url = f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1/object/public/content-audio/{path}"
        _supa(f"/rest/v1/content_pipeline?id=eq.{item_id}", method="PATCH",
              body=json.dumps({"audio_url": url}).encode(), ctype="application/json")
    except Exception as e:  # best-effort; the admin board shows audio_url is still null on failure
        print(f"render_item {item_id} failed: {e}", flush=True)


@app.post("/render_item", status_code=202)
def render_item(req: RenderItemRequest, bg: BackgroundTasks, x_kokoro_secret: str | None = Header(default=None)):
    secret = os.environ.get("KOKORO_SERVER_SECRET")
    if secret and x_kokoro_secret != secret:
        raise HTTPException(status_code=401, detail="bad secret")
    bg.add_task(_render_and_store, req.item_id)
    return {"status": "rendering", "item_id": req.item_id}
