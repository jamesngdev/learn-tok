import { describe, it, expect } from "vitest";
import { lookupDictionary } from "@/lib/dictionary";

const PAYLOAD = [
  {
    word: "galaxy",
    phonetic: "/ˈɡæləksi/",
    phonetics: [{ text: "/ˈɡæləksi/", audio: "https://audio/galaxy.mp3" }],
    meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "a system of stars" }] }],
  },
];

function okFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify(PAYLOAD))) as unknown as typeof fetch;
}
function notFoundFetch(): typeof fetch {
  return (async () => new Response("Not Found", { status: 404 })) as unknown as typeof fetch;
}

describe("lookupDictionary", () => {
  it("extracts ipa, audio, and part of speech", async () => {
    const r = await lookupDictionary("galaxy", okFetch());
    expect(r.ipa).toBe("/ˈɡæləksi/");
    expect(r.audio_url).toBe("https://audio/galaxy.mp3");
    expect(r.pos).toBe("noun");
  });

  it("returns nulls on 404 without throwing", async () => {
    const r = await lookupDictionary("zzzz", notFoundFetch());
    expect(r).toEqual({ ipa: null, audio_url: null, pos: null });
  });
});
