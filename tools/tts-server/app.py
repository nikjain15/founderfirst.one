"""
FounderFirst TTS server — Chatterbox (MIT) brand-voice synthesis on a Fly GPU
machine that scales to zero. Called by the `content-audio` Supabase edge
function. PRIMARY provider in the locked voice strategy (ElevenLabs is the
edge-function fallback).

POST /synthesize
  body: { "script": [{"speaker":"host","text":"..."}, ...],
          "voice_ref_url": "https://.../brand-voice.wav",
          "format": "mp3" }
  returns: audio/mpeg bytes (the assembled read, all lines cloned to the brand voice)

Auth: if TTS_SERVER_SECRET is set, the caller must send a matching `x-tts-secret`
header. Health: GET /health (cheap, keeps deploy checks fast).

This is the assembly point — Podcastfy-style stitching of a multi-line script
through Chatterbox voice-cloning from a single locked reference clip. The voice
clip is the brand's single source of truth (see content_voice_profile).
"""
import io
import os
import tempfile
import urllib.request

from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

app = FastAPI(title="founderfirst-tts")

# Lazy globals — the model loads on first request so cold scale-from-zero only
# pays the load cost when actually synthesizing.
_model = None


def _get_model():
    global _model
    if _model is None:
        # Imported lazily so /health and boot don't require the GPU stack.
        from chatterbox.tts import ChatterboxTTS  # type: ignore
        _model = ChatterboxTTS.from_pretrained(device="cuda")
    return _model


class Line(BaseModel):
    speaker: str
    text: str


class SynthRequest(BaseModel):
    script: list[Line]
    voice_ref_url: str
    format: str = "mp3"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/synthesize")
def synthesize(req: SynthRequest, x_tts_secret: str | None = Header(default=None)):
    secret = os.environ.get("TTS_SERVER_SECRET")
    if secret and x_tts_secret != secret:
        raise HTTPException(status_code=401, detail="bad secret")
    if not req.script:
        raise HTTPException(status_code=400, detail="empty script")

    import torchaudio  # type: ignore
    from pydub import AudioSegment  # type: ignore

    # Pull the brand reference clip once; every line clones from it.
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as ref:
        urllib.request.urlretrieve(req.voice_ref_url, ref.name)
        ref_path = ref.name

    model = _get_model()
    combined = AudioSegment.silent(duration=0)
    for line in req.script:
        wav = model.generate(line.text, audio_prompt_path=ref_path)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as seg:
            torchaudio.save(seg.name, wav, model.sr)
            combined += AudioSegment.from_wav(seg.name)
            combined += AudioSegment.silent(duration=350)  # natural beat between turns

    out = io.BytesIO()
    combined.export(out, format="mp3", bitrate="160k")
    return Response(content=out.getvalue(), media_type="audio/mpeg")
