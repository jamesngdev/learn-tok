import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { lookupWord, saveMyWord, listMyWords } from "@/lib/words";

const deps = {
  lookupDictionary: async () => ({ ipa: "/ˈɡæləksi/", audio_url: "https://a.mp3", pos: "noun" }),
  translateToVi: async () => "thiên hà",
  now: () => "2026-07-07T00:00:00Z",
};

describe("lookupWord", () => {
  it("performs a live lookup, caches, and reuses the cache", async () => {
    const db = openDb(":memory:");
    let dictCalls = 0;
    const countingDeps = {
      ...deps,
      lookupDictionary: async () => {
        dictCalls++;
        return { ipa: "/x/", audio_url: null, pos: "noun" };
      },
    };
    const first = await lookupWord(db, "Galaxy", countingDeps);
    expect(first.word).toBe("galaxy");
    expect(first.meaning_vi).toBe("thiên hà");
    const second = await lookupWord(db, "galaxy", countingDeps);
    expect(second.meaning_vi).toBe("thiên hà");
    expect(dictCalls).toBe(1); // second call served from cache
  });
});

describe("my_words", () => {
  it("saves and lists saved words joined with their cached data", async () => {
    const db = openDb(":memory:");
    await lookupWord(db, "galaxy", deps);
    saveMyWord(db, "galaxy", "2026-07-07T01:00:00Z", 5);
    const list = listMyWords(db);
    expect(list).toHaveLength(1);
    expect(list[0].word).toBe("galaxy");
    expect(list[0].ipa).toBe("/ˈɡæləksi/");
  });
});
