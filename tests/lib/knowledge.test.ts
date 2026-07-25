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

// What the model returns (Vietnamese lesson).
const raw = {
  topic: "Connection pooling cho database",
  category: "Database",
  title: "Đừng mở kết nối DB mới cho mỗi request",
  summary: "Connection pool tái sử dụng một tập cố định các kết nối DB.",
  detail_md: "## Tổng quan\nMở kết nối rất đắt.\n```js\npool.query()\n```",
  diagram: "flowchart LR\n App-->Pool-->DB",
};

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
      return JSON.stringify(raw);
    });
    expect(k.topic).toBe(raw.topic);
    expect(seenPrompt).toContain("Indexing");
    expect(seenPrompt).toContain("Chăm con");
  });

  it("works with no focus area", async () => {
    let seenPrompt = "";
    await generateKnowledge([], null, async (_sys, user) => {
      seenPrompt = user;
      return JSON.stringify(raw);
    });
    expect(seenPrompt).toContain("chủ đề thực sự hữu ích");
  });

  it("maps the Vietnamese summary into both summary columns", async () => {
    const k = await generateKnowledge([], null, async () => JSON.stringify(raw));
    expect(k.summary_en).toBe(raw.summary);
    expect(k.summary_vi).toBe(raw.summary);
    expect(k.cefr).toBe("B1");
  });

  it("throws when a required field is missing", async () => {
    await expect(
      generateKnowledge([], null, async () =>
        JSON.stringify({ ...raw, detail_md: "" })
      )
    ).rejects.toThrow();
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
