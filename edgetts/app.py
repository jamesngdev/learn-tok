import asyncio
import os

import edge_tts
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel

# Microsoft Edge's neural voices, reached over the network — no model, no GPU,
# barely any RAM. vi-VN-NamMinhNeural (nam) / vi-VN-HoaiMyNeural (nữ).
VOICE = os.environ.get("EDGE_TTS_VOICE", "vi-VN-NamMinhNeural")
RATE = os.environ.get("EDGE_TTS_RATE", "+0%")
PITCH = os.environ.get("EDGE_TTS_PITCH", "+0Hz")
RETRIES = int(os.environ.get("EDGE_TTS_RETRIES", "3"))

# Every edge-tts clip ships with ~250ms of leading and ~850ms of trailing
# silence, so playing sentence clips back to back leaves ~1.1s of dead air.
# Trim both ends down to a natural-sounding gap (~0.5s between sentences).
TRIM = os.environ.get("EDGE_TTS_TRIM", "1") not in ("0", "false", "no")
LEAD_MS = int(os.environ.get("EDGE_TTS_LEAD_MS", "100"))
TAIL_MS = int(os.environ.get("EDGE_TTS_TAIL_MS", "400"))
SILENCE_DB = os.environ.get("EDGE_TTS_SILENCE_DB", "-45dB")

app = FastAPI()


class Req(BaseModel):
    text: str
    voice: str | None = None
    rate: str | None = None
    pitch: str | None = None


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "edge-tts",
        "voice": VOICE,
        "rate": RATE,
        "pitch": PITCH,
        "trim": TRIM,
        "lead_ms": LEAD_MS,
        "tail_ms": TAIL_MS,
    }


async def trim_silence(audio: bytes) -> bytes:
    """
    Cut the padding edge-tts leaves around the speech, keeping LEAD_MS at the
    front and TAIL_MS at the end. Pauses inside the sentence are untouched.
    Returns the original audio if ffmpeg is unavailable or fails.
    """
    keep_lead = max(LEAD_MS, 0) / 1000
    keep_tail = max(TAIL_MS, 0) / 1000
    one = f"silenceremove=start_periods=1:start_silence=%.3f:start_threshold={SILENCE_DB}:detection=peak"
    # Reverse to reach the tail with the same "trim from the start" filter.
    filters = ",".join(
        [one % keep_lead, "areverse", one % keep_tail, "areverse"]
    )
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0", "-af", filters,
            "-c:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", "-ac", "1",
            "-f", "mp3", "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate(audio)
        if proc.returncode != 0 or not out:
            print(f"trim failed (rc={proc.returncode}): {err[-200:]!r}", flush=True)
            return audio
        return out
    except FileNotFoundError:
        print("ffmpeg not installed — serving untrimmed audio", flush=True)
        return audio


async def synthesize(text: str, voice: str, rate: str, pitch: str) -> bytes:
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    audio = bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    return bytes(audio)


@app.post("/tts")
async def tts(req: Req):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="missing text")
    voice = req.voice or VOICE
    last: Exception | None = None
    # The service is a remote endpoint, so a transient failure is normal;
    # a couple of quick retries keeps the pre-generation loop moving.
    for attempt in range(RETRIES):
        try:
            audio = await synthesize(text, voice, req.rate or RATE, req.pitch or PITCH)
            if audio:
                if TRIM:
                    audio = await trim_silence(audio)
                return Response(content=audio, media_type="audio/mpeg")
            last = RuntimeError("empty audio")
        except Exception as exc:  # noqa: BLE001 - report as 502 below
            last = exc
        await asyncio.sleep(0.5 * (attempt + 1))
    raise HTTPException(status_code=502, detail=f"edge-tts failed: {last!r}")
