import { describe, it, expect } from "vitest";
import { buildChatMessages, MAX_TURNS, MAX_MESSAGE_CHARS, type ChatMessage } from "@/lib/chat";

const lesson = {
  title_en: "Đừng mở kết nối DB mới cho mỗi request",
  category: "Backend",
  summary_en: "Connection pool tái sử dụng một tập cố định các kết nối DB.",
  detail_md: "## Dàn ý\n- Tổng quan\n\n## Tổng quan\nMở kết nối rất đắt.",
};

describe("buildChatMessages", () => {
  it("puts the lesson in the system context ahead of the conversation", () => {
    const msgs = buildChatMessages(lesson, [{ role: "user", content: "Vì sao đắt?" }]);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("system");
    expect(msgs[1].content).toContain(lesson.title_en);
    expect(msgs[1].content).toContain("Mở kết nối rất đắt.");
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "Vì sao đắt?" });
  });

  it("keeps only the last MAX_TURNS messages", () => {
    const history: ChatMessage[] = Array.from({ length: MAX_TURNS + 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `câu ${i}`,
    }));
    const msgs = buildChatMessages(lesson, history);
    expect(msgs).toHaveLength(MAX_TURNS + 2); // + 2 system messages
    expect(msgs[2].content).toBe(`câu ${6}`);
  });

  it("drops blank turns and clips overly long ones", () => {
    const msgs = buildChatMessages(lesson, [
      { role: "user", content: "   " },
      { role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 500) },
    ]);
    expect(msgs).toHaveLength(3);
    expect(msgs[2].content.length).toBeLessThan(MAX_MESSAGE_CHARS + 40);
    expect(msgs[2].content).toContain("đã lược bớt");
  });

  it("clips a very long lesson instead of sending it whole", () => {
    const msgs = buildChatMessages(
      { ...lesson, detail_md: "dài ".repeat(20000) },
      [{ role: "user", content: "hỏi" }]
    );
    expect(msgs[1].content.length).toBeLessThan(13000);
    expect(msgs[1].content).toContain("đã lược bớt");
  });
});
