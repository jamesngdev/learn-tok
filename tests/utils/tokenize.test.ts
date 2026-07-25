import { describe, it, expect } from "vitest";
import { tokenize } from "@/utils/tokenize";

describe("tokenize", () => {
  it("splits words from whitespace and keeps originals", () => {
    const toks = tokenize("Hello world");
    expect(toks.map((t) => t.text).join("")).toBe("Hello world");
    expect(toks.filter((t) => t.word).map((t) => t.word)).toEqual(["hello", "world"]);
  });

  it("strips punctuation into the word core but preserves display text", () => {
    const toks = tokenize("heat-wave, ok.");
    const words = toks.filter((t) => t.word);
    expect(words[0].text).toBe("heat-wave,");
    expect(words[0].word).toBe("heatwave");
    expect(words[1].word).toBe("ok");
  });

  it("marks pure punctuation/whitespace tokens as null", () => {
    const toks = tokenize("a — b");
    expect(toks.some((t) => t.text === "—" && t.word === null)).toBe(true);
  });

  it("leaves Vietnamese words untappable but keeps English terms tappable", () => {
    const toks = tokenize("Dùng connection pooling để tránh quá tải");
    const byText = (s: string) => toks.find((t) => t.text === s)!;
    expect(byText("Dùng").word).toBeNull();
    expect(byText("tránh").word).toBeNull();
    expect(byText("connection").word).toBe("connection");
    expect(byText("pooling").word).toBe("pooling");
    // Note: diacritic-free Vietnamese words ("cho", "cam") are
    // indistinguishable from English and stay tappable — harmless.
  });
});
