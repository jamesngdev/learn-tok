import gc
import hashlib
import io
import logging
import os
import urllib.request
import wave

import numpy as np
import torch
from fastapi import FastAPI, Response
from pydantic import BaseModel
from omnivoice import OmniVoice
from omnivoice.models.omnivoice import OmniVoiceGenerationConfig, VoiceClonePrompt

log = logging.getLogger("omnivoice-svc")

SR = 24000
# Fallback voice-design instruct, used only when no reference voice is available.
# Only OmniVoice's fixed instruct vocabulary is allowed (comma + space), and the
# cards are Vietnamese so there is no English accent tag here.
VOICE_INSTRUCT = os.environ.get("OMNIVOICE_INSTRUCT", "male, young adult")
# ISO code / language name resolved by OmniVoice (646 languages); "vi" = Vietnamese.
LANGUAGE = os.environ.get("OMNIVOICE_LANG", "vi")
NUM_STEP = int(os.environ.get("OMNIVOICE_NUM_STEP", "16"))

# Voice cloning: everything is read in the voice of this reference clip.
REF_AUDIO_URL = os.environ.get(
    "OMNIVOICE_REF_AUDIO_URL",
    "https://raw.githubusercontent.com/jamesngdev/public/refs/heads/main/spiderum-voices/spiderum_voice.wav",
).strip()
# Transcript of the reference clip. Left empty, Whisper transcribes it once.
REF_TEXT = (os.environ.get("OMNIVOICE_REF_TEXT") or "").strip() or None
REF_DIR = os.environ.get("OMNIVOICE_REF_DIR", "/data/ref-voice")
# OmniVoice defaults to whisper-large-v3-turbo (~3GB in fp32) — too heavy for
# this box, and it only ever transcribes one 11s clip.
ASR_MODEL = os.environ.get("OMNIVOICE_ASR_MODEL", "openai/whisper-small")

app = FastAPI()
_model = None
_clone_prompt = None
_clone_error = None


def get_model():
    global _model
    if _model is None:
        _model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cpu", dtype=torch.float32)
    return _model


def get_clone_prompt():
    """
    The reference-voice prompt, built once and cached on disk. Encoding the
    reference clip (and transcribing it with Whisper when no transcript is
    given) is slow, and the result is reusable for every request — so it is
    saved next to the downloaded clip in the data volume.

    Returns None if no reference voice is configured or it could not be built;
    the service then falls back to voice-design mode instead of failing.
    """
    global _clone_prompt, _clone_error
    if _clone_prompt is not None or not REF_AUDIO_URL:
        return _clone_prompt
    key = hashlib.sha256(f"{REF_AUDIO_URL}|{REF_TEXT or ''}".encode()).hexdigest()[:16]
    prompt_path = os.path.join(REF_DIR, f"{key}.prompt.pt")
    wav_path = os.path.join(REF_DIR, f"{key}.wav")
    try:
        os.makedirs(REF_DIR, exist_ok=True)
        if os.path.exists(prompt_path):
            _clone_prompt = VoiceClonePrompt.load(prompt_path)
            log.info("Loaded cached voice clone prompt: %s", prompt_path)
        else:
            if not os.path.exists(wav_path):
                log.info("Downloading reference voice %s", REF_AUDIO_URL)
                urllib.request.urlretrieve(REF_AUDIO_URL, wav_path)
            model = get_model()
            if REF_TEXT is None:
                model.load_asr_model(ASR_MODEL)
            _clone_prompt = model.create_voice_clone_prompt(wav_path, ref_text=REF_TEXT)
            _clone_prompt.save(prompt_path)
            log.info("Built voice clone prompt, ref_text=%r", _clone_prompt.ref_text)
            # The transcript is baked into the cached prompt now — drop the ASR
            # model so it stops holding memory for the rest of the process.
            model._asr_pipe = None
            gc.collect()
        _clone_error = None
    except Exception as exc:  # noqa: BLE001 - never take the service down for this
        _clone_error = repr(exc)
        log.exception("Voice clone prompt unavailable, falling back to voice design")
    return _clone_prompt


@app.on_event("startup")
def _warmup():
    # Load the model once at boot (~30s) so requests don't pay for it, then
    # build the reference-voice prompt (first run also pulls a Whisper model).
    get_model()
    get_clone_prompt()


class Req(BaseModel):
    text: str
    instruct: str | None = None
    language: str | None = None


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
    prompt = _clone_prompt
    return {
        "ok": _model is not None,
        "voice": "clone" if prompt is not None else "design",
        "ref_audio_url": REF_AUDIO_URL or None,
        "ref_text": prompt.ref_text if prompt is not None else None,
        "clone_error": _clone_error,
    }


@app.post("/tts")
def tts(req: Req):
    model = get_model()
    cfg = OmniVoiceGenerationConfig(num_step=NUM_STEP)
    # An explicit instruct forces voice-design mode; otherwise clone the
    # reference voice when we have it.
    prompt = None if req.instruct else get_clone_prompt()
    if prompt is not None:
        out = model.generate(
            text=req.text,
            language=req.language or LANGUAGE,
            voice_clone_prompt=prompt,
            generation_config=cfg,
        )
    else:
        out = model.generate(
            text=req.text,
            language=req.language or LANGUAGE,
            instruct=req.instruct or VOICE_INSTRUCT,
            generation_config=cfg,
        )
    if isinstance(out, list):
        parts = [np.asarray(x, dtype=np.float32).reshape(-1) for x in out]
        audio = np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)
    else:
        audio = np.asarray(out, dtype=np.float32).reshape(-1)
    return Response(content=to_wav_bytes(audio), media_type="audio/wav")
