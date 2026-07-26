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

app = FastAPI()


class Req(BaseModel):
    text: str
    voice: str | None = None
    rate: str | None = None
    pitch: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "engine": "edge-tts", "voice": VOICE, "rate": RATE, "pitch": PITCH}


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
                return Response(content=audio, media_type="audio/mpeg")
            last = RuntimeError("empty audio")
        except Exception as exc:  # noqa: BLE001 - report as 502 below
            last = exc
        await asyncio.sleep(0.5 * (attempt + 1))
    raise HTTPException(status_code=502, detail=f"edge-tts failed: {last!r}")
