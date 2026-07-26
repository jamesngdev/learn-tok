import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Bump this when the voice changes so cached audio regenerates in the new voice.
// vi-edge-nam-v2: Vietnamese, Microsoft Edge voice vi-VN-NamMinhNeural, with
// the padding silence trimmed off each clip (v1 clips had ~1.1s gaps).
export const DEFAULT_VOICE = process.env.TTS_VOICE_KEY || "vi-edge-nam-v2";
const CACHE_DIR = process.env.TTS_CACHE_DIR || "/data/tts-cache";
// Any service speaking the same POST /tts contract: edge-tts (default, remote
// voices, no local compute) or the heavyweight OmniVoice container.
const TTS_URL = process.env.TTS_URL || process.env.OMNIVOICE_URL || "http://edgetts:8000";

/** Container format the TTS service returns: edge-tts gives mp3, OmniVoice wav. */
export const AUDIO_EXT =
  (process.env.TTS_FORMAT || "mp3").toLowerCase() === "wav" ? "wav" : "mp3";
export const AUDIO_MIME = AUDIO_EXT === "wav" ? "audio/wav" : "audio/mpeg";

function cacheFile(voice: string, text: string): string {
  const key = crypto.createHash("sha256").update(`${voice}|${text}`).digest("hex");
  return path.join(CACHE_DIR, `${key}.${AUDIO_EXT}`);
}

/** Whether this exact text+voice is already synthesized on disk. */
export function isCached(text: string, voice = DEFAULT_VOICE): boolean {
  try {
    return fs.existsSync(cacheFile(voice, text));
  } catch {
    return false;
  }
}

/**
 * Return an audio buffer for the text, from disk cache or by calling the TTS
 * service. The cache also means driving mode and the in-card player never wait
 * twice for the same sentence.
 */
export async function synthesize(text: string, voice = DEFAULT_VOICE): Promise<Buffer> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = cacheFile(voice, text);
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch {
    /* regenerate */
  }
  const res = await fetch(`${TTS_URL}/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`tts service ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    fs.writeFileSync(file, buf);
  } catch {
    /* cache best-effort */
  }
  return buf;
}
