import { synthesize, DEFAULT_VOICE } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const text = url.searchParams.get("text");
  const voice = url.searchParams.get("v") || DEFAULT_VOICE;
  if (!text || !text.trim()) {
    return new Response(JSON.stringify({ error: "missing text" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const wav = await synthesize(text.slice(0, 800), voice);
    return new Response(new Uint8Array(wav), {
      headers: {
        "content-type": "audio/wav",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("tts failed:", err);
    return new Response(JSON.stringify({ error: "tts failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
