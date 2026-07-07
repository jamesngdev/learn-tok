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
});
