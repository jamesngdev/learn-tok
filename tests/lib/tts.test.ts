import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-cache-"));

async function loadTts() {
  vi.resetModules();
  process.env.TTS_CACHE_DIR = cacheDir;
  process.env.TTS_URL = "http://tts.test";
  return import("@/lib/tts");
}

beforeEach(() => {
  for (const f of fs.readdirSync(cacheDir)) fs.rmSync(path.join(cacheDir, f));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TTS_FORMAT;
});

describe("synthesize", () => {
  it("calls the TTS service once and serves the clip from disk afterwards", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(new Uint8Array([1, 2, 3]))
    );
    vi.stubGlobal("fetch", fetchMock);
    const { synthesize, isCached } = await loadTts();

    expect(isCached("một câu")).toBe(false);
    const first = await synthesize("một câu");
    expect([...first]).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://tts.test/tts");

    expect(isCached("một câu")).toBe(true);
    const second = await synthesize("một câu");
    expect([...second]).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // served from cache
  });

  it("throws when the service errors, and caches nothing", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 502 }));
    const { synthesize, isCached } = await loadTts();
    await expect(synthesize("hỏng")).rejects.toThrow(/502/);
    expect(isCached("hỏng")).toBe(false);
  });

  it("keys the cache by voice so a voice change regenerates", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([9])));
    const { synthesize, isCached, DEFAULT_VOICE } = await loadTts();
    await synthesize("câu", DEFAULT_VOICE);
    expect(isCached("câu", DEFAULT_VOICE)).toBe(true);
    expect(isCached("câu", "giọng-khác")).toBe(false);
  });
});

describe("audio format", () => {
  it("defaults to mp3 (edge-tts)", async () => {
    const { AUDIO_EXT, AUDIO_MIME } = await loadTts();
    expect(AUDIO_EXT).toBe("mp3");
    expect(AUDIO_MIME).toBe("audio/mpeg");
  });

  it("switches to wav when the engine is OmniVoice", async () => {
    process.env.TTS_FORMAT = "wav";
    const { AUDIO_EXT, AUDIO_MIME } = await loadTts();
    expect(AUDIO_EXT).toBe("wav");
    expect(AUDIO_MIME).toBe("audio/wav");
  });
});
