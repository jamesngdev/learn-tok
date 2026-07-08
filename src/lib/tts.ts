import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Bump this when the voice changes so cached audio regenerates in the new voice.
export const DEFAULT_VOICE = "us-male-v1";
const CACHE_DIR = process.env.TTS_CACHE_DIR || "/data/tts-cache";
const OMNIVOICE_URL = process.env.OMNIVOICE_URL || "http://omnivoice:8000";

function cacheFile(voice: string, text: string): string {
  const key = crypto.createHash("sha256").update(`${voice}|${text}`).digest("hex");
  return path.join(CACHE_DIR, `${key}.wav`);
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
 * Return a WAV buffer for the text, from disk cache or by calling the
 * OmniVoice service. Generation is slow on CPU, so the background pre-gen
 * worker keeps the cache warm; this serves cached audio instantly.
 */
export async function synthesize(text: string, voice = DEFAULT_VOICE): Promise<Buffer> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = cacheFile(voice, text);
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch {
    /* regenerate */
  }
  const res = await fetch(`${OMNIVOICE_URL}/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`omnivoice ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    fs.writeFileSync(file, buf);
  } catch {
    /* cache best-effort */
  }
  return buf;
}
