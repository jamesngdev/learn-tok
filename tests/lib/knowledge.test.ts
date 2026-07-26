import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import {
  generateKnowledge,
  generateKnowledgeBatch,
  insertKnowledge,
  countActiveKnowledge,
  getKnowledgeDetail,
  listKnowledgeTopics,
} from "@/lib/knowledge";
import { ignoreCard } from "@/lib/ignore";
import type { KnowledgeGenerated } from "@/lib/types";

// What the model returns (Vietnamese lesson in `===LABEL===` blocks).
const raw = {
  topic: "Connection pooling cho database",
  category: "Database",
  title: "Đừng mở kết nối DB mới cho mỗi request",
  summary: "Connection pool tái sử dụng một tập cố định các kết nối DB.",
  detail_md: '## Tổng quan\nMở kết nối rất đắt, kể cả khi pool "ấm".\n```js\npool.query()\n```',
  diagram: 'flowchart LR\n A["Ứng dụng"]-->B["Pool"]-->C["DB"]',
};

/** A lesson body that satisfies every required heading and the length floor. */
function fullLesson(): string {
  const headings = [
    "## Dàn ý",
    "## Tổng quan",
    "## Vì sao quan trọng",
    "## Kiến thức cốt lõi",
    "## Hướng dẫn từng bước",
    "## Ví dụ thực tế",
    "## Sai lầm thường gặp",
    "## Checklist áp dụng",
    "## Câu hỏi thường gặp",
    "## Chốt lại",
  ];
  return headings.map((h) => `${h}\n${"nội dung ".repeat(60)}`).join("\n\n");
}

function rawResponse(over: Partial<typeof raw> = {}): string {
  const k = { ...raw, ...over };
  return [
    `===TOPIC===\n${k.topic}`,
    `===CATEGORY===\n${k.category}`,
    `===TITLE===\n${k.title}`,
    `===SUMMARY===\n${k.summary}`,
    `===DIAGRAM===\n${k.diagram}`,
    `===DETAIL===\n${k.detail_md}`,
  ].join("\n");
}

// The same lesson as stored in the DB (legacy column names).
const valid = {
  topic: raw.topic,
  category: raw.category,
  title_en: raw.title,
  summary_en: raw.summary,
  summary_vi: raw.summary,
  detail_md: raw.detail_md,
  diagram: raw.diagram,
  cefr: "B1",
};

describe("generateKnowledge", () => {
  it("passes topics to avoid and the chosen focus area", async () => {
    let seenPrompt = "";
    const k = await generateKnowledge(["Indexing"], "Chăm con", async (_sys, user) => {
      seenPrompt = user;
      return rawResponse();
    });
    expect(k.topic).toBe(raw.topic);
    expect(seenPrompt).toContain("Indexing");
    expect(seenPrompt).toContain("Chăm con");
  });

  it("works with no focus area", async () => {
    let seenPrompt = "";
    await generateKnowledge([], null, async (_sys, user) => {
      seenPrompt = user;
      return rawResponse();
    });
    expect(seenPrompt).toContain("chủ đề thực sự hữu ích");
  });

  it("maps the Vietnamese summary into both summary columns", async () => {
    const k = await generateKnowledge([], null, async () => rawResponse());
    expect(k.summary_en).toBe(raw.summary);
    expect(k.summary_vi).toBe(raw.summary);
    expect(k.cefr).toBe("B1");
  });

  it("throws when a required section is missing", async () => {
    await expect(
      generateKnowledge([], null, async () => "===TOPIC===\nchỉ có topic")
    ).rejects.toThrow(/missing section/);
  });

  it("keeps quotes in the Markdown body intact (why we left JSON mode)", async () => {
    const k = await generateKnowledge([], null, async () => rawResponse());
    expect(k.detail_md).toContain('pool "ấm"');
    expect(k.diagram).toContain('A["Ứng dụng"]');
  });

  it("unwraps a fenced detail/diagram block the model adds anyway", async () => {
    const k = await generateKnowledge([], null, async () =>
      rawResponse({
        detail_md: "```markdown\n## Tổng quan\nNội dung bài.\n```",
        diagram: "```mermaid\nflowchart LR\n A-->B\n```",
      })
    );
    expect(k.detail_md).toBe("## Tổng quan\nNội dung bài.");
    expect(k.diagram).toBe("flowchart LR\n A-->B");
  });

  it("does not retry when the lesson already meets the outline", async () => {
    let calls = 0;
    await generateKnowledge([], null, async () => {
      calls++;
      return rawResponse({ detail_md: fullLesson() });
    });
    expect(calls).toBe(1);
  });

  it("retries once with the shortcomings when the lesson is thin, and keeps the better one", async () => {
    const prompts: string[] = [];
    let calls = 0;
    const k = await generateKnowledge([], null, async (_sys, user) => {
      prompts.push(user);
      calls++;
      return rawResponse({ detail_md: calls === 1 ? "## Tổng quan\nQuá ngắn." : fullLesson() });
    });
    expect(calls).toBe(2);
    expect(prompts[1]).toContain("BÀI VIẾT LẦN TRƯỚC BỊ LOẠI");
    expect(prompts[1]).toContain("## Checklist áp dụng");
    expect(k.detail_md).toContain("## Chốt lại");
  });

  it("falls back to the first attempt when the retry is no better", async () => {
    let calls = 0;
    const k = await generateKnowledge([], null, async () => {
      calls++;
      if (calls === 2) throw new Error("deepseek down");
      return rawResponse({ detail_md: "## Tổng quan\nNgắn nhưng có." });
    });
    expect(calls).toBe(2);
    expect(k.detail_md).toContain("Ngắn nhưng có.");
  });

  it("tolerates a missing diagram block", async () => {
    const k = await generateKnowledge([], null, async () =>
      rawResponse({ diagram: "" })
    );
    expect(k.diagram).toBe("");
  });
});

describe("insert + dedup + detail", () => {
  it("dedups by topic and stores full detail", () => {
    const db = openDb(":memory:");
    expect(insertKnowledge(db, valid as KnowledgeGenerated, "2026-07-07T00:00:00Z")).toBe(true);
    expect(insertKnowledge(db, valid as KnowledgeGenerated, "2026-07-07T01:00:00Z")).toBe(false);
    expect(listKnowledgeTopics(db)).toEqual([raw.topic]);
    const detail = getKnowledgeDetail(db, 1);
    expect(detail?.detail_md).toContain("Tổng quan");
    expect(detail?.diagram).toContain("flowchart");
  });
});

describe("generateKnowledgeBatch", () => {
  it("inserts unique cards and skips duplicates", async () => {
    const db = openDb(":memory:");
    const topics = ["Topic A", "Topic B", "Topic A"];
    let i = 0;
    const inserted = await generateKnowledgeBatch(db, 3, {
      generate: async () => ({ ...valid, topic: topics[i++] } as KnowledgeGenerated),
      now: () => "2026-07-07T00:00:00Z",
    });
    expect(inserted).toBe(2); // "Topic A" only once
  });
});

describe("countActiveKnowledge", () => {
  it("excludes ignored cards", () => {
    const db = openDb(":memory:");
    insertKnowledge(db, { ...valid, topic: "A" } as KnowledgeGenerated, "t");
    insertKnowledge(db, { ...valid, topic: "B" } as KnowledgeGenerated, "t");
    expect(countActiveKnowledge(db)).toBe(2);
    ignoreCard(db, "knowledge", 1, "t");
    expect(countActiveKnowledge(db)).toBe(1);
  });
});
