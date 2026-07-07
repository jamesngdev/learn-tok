import { describe, it, expect } from "vitest";
import { summarize } from "@/lib/deepseek";

const fakeComplete = async () =>
  JSON.stringify({
    title_en: "Number One News",
    summary_en: "This is the English summary. It has two sentences.",
    summary_vi: "Đây là bản tóm tắt tiếng Việt.",
    category: "World",
    cefr: "B2",
  });

describe("summarize", () => {
  it("parses a valid DeepSeek JSON response", async () => {
    const s = await summarize({ title: "Tin", body: "Nội dung" }, fakeComplete);
    expect(s.title_en).toBe("Number One News");
    expect(s.cefr).toBe("B2");
    expect(s.category).toBe("World");
  });

  it("defaults an invalid cefr to B1", async () => {
    const s = await summarize(
      { title: "t", body: "b" },
      async () =>
        JSON.stringify({
          title_en: "a",
          summary_en: "b",
          summary_vi: "c",
          category: "Life",
          cefr: "Z9",
        })
    );
    expect(s.cefr).toBe("B1");
  });

  it("throws when a required text field is missing", async () => {
    await expect(
      summarize({ title: "t", body: "b" }, async () =>
        JSON.stringify({ title_en: "a", summary_en: "b", category: "Life", cefr: "B1" })
      )
    ).rejects.toThrow();
  });
});
