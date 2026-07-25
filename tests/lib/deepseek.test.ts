import { describe, it, expect } from "vitest";
import { summarize } from "@/lib/deepseek";

const fakeComplete = async () =>
  JSON.stringify({
    title: "Tin số một hôm nay",
    summary: "Đây là bản tóm tắt tiếng Việt. Nó có hai câu.",
    category: "World",
  });

describe("summarize", () => {
  it("parses a valid DeepSeek JSON response", async () => {
    const s = await summarize({ title: "Tin", body: "Nội dung" }, fakeComplete);
    expect(s.title_en).toBe("Tin số một hôm nay");
    expect(s.category).toBe("World");
  });

  it("stores the Vietnamese summary in both summary columns", async () => {
    const s = await summarize({ title: "Tin", body: "Nội dung" }, fakeComplete);
    expect(s.summary_en).toBe("Đây là bản tóm tắt tiếng Việt. Nó có hai câu.");
    expect(s.summary_vi).toBe(s.summary_en);
    expect(s.cefr).toBe("B1");
  });

  it("throws when a required text field is missing", async () => {
    await expect(
      summarize({ title: "t", body: "b" }, async () =>
        JSON.stringify({ title: "a", category: "Life" })
      )
    ).rejects.toThrow();
  });
});
