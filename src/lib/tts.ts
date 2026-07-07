import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_VOICE = "af_heart";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const CACHE_DIR = process.env.TTS_CACHE_DIR || "/data/tts-cache";

// Lazily-loaded singleton Kokoro model (native ONNX on the server CPU).
let ttsPromise: Promise<any> | null = null;
function getTTS(): Promise<any> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      return KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" });
    })();
  }
  return ttsPromise;
}

function cacheFile(voice: string, text: string): string {
  const key = crypto.createHash("sha256").update(`${voice}|${text}`).digest("hex");
  return path.join(CACHE_DIR, `${key}.wav`);
}

/** Return true if this exact text+voice is already synthesized on disk. */
export function isCached(text: string, voice = DEFAULT_VOICE): boolean {
  try {
    return fs.existsSync(cacheFile(voice, text));
  } catch {
    return false;
  }
}

/** Generate (or read from cache) a WAV buffer for the given text. */
export async function synthesize(text: string, voice = DEFAULT_VOICE): Promise<Buffer> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = cacheFile(voice, text);
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file);
  } catch {
    /* fall through to generate */
  }
  const tts = await getTTS();
  const audio = await tts.generate(text, { voice });
  const buf = Buffer.from(audio.toWav());
  try {
    fs.writeFileSync(file, buf);
  } catch {
    /* cache best-effort */
  }
  return buf;
}
