import io
import os
import wave

import numpy as np
import torch
from fastapi import FastAPI, Response
from pydantic import BaseModel
from omnivoice import OmniVoice
from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

SR = 24000
# Only OmniVoice's fixed instruct vocabulary is allowed (comma + space).
VOICE_INSTRUCT = os.environ.get("OMNIVOICE_INSTRUCT", "female, american accent, young adult")
NUM_STEP = int(os.environ.get("OMNIVOICE_NUM_STEP", "16"))

app = FastAPI()
_model = None


def get_model():
    global _model
    if _model is None:
        _model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cpu", dtype=torch.float32)
    return _model


@app.on_event("startup")
def _warmup():
    # Load the model once at boot (~30s) so requests don't pay for it.
    get_model()


class Req(BaseModel):
    text: str
    instruct: str | None = None


def to_wav_bytes(audio: np.ndarray) -> bytes:
    a = np.clip(audio, -1.0, 1.0)
    pcm = (a * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


@app.get("/health")
def health():
    return {"ok": _model is not None}


@app.post("/tts")
def tts(req: Req):
    model = get_model()
    cfg = OmniVoiceGenerationConfig(num_step=NUM_STEP)
    out = model.generate(
        text=req.text,
        instruct=req.instruct or VOICE_INSTRUCT,
        generation_config=cfg,
    )
    if isinstance(out, list):
        parts = [np.asarray(x, dtype=np.float32).reshape(-1) for x in out]
        audio = np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)
    else:
        audio = np.asarray(out, dtype=np.float32).reshape(-1)
    return Response(content=to_wav_bytes(audio), media_type="audio/wav")
