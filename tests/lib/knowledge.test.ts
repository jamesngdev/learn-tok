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

const valid = {
  topic: "Database connection pooling",
  category: "Database",
  title_en: "Stop opening a new DB connection per request",
  summary_en: "Connection pooling reuses a fixed set of DB connections.",
  summary_vi: "Connection pool tái sử dụng một tập cố định các kết nối DB.",
  detail_md: "## Problem\nOpening connections is expensive.\n```js\npool.query()\n```",
  diagram: "flowchart LR\n App-->Pool-->DB",
  cefr: "B2",
};

describe("generateKnowledge", () => {
  it("passes topics to avoid and the chosen focus area", async () => {
    let seenPrompt = "";
    const k = await generateKnowledge(["Indexing"], "Chăm con", async (_sys, user) => {
      seenPrompt = user;
      return JSON.stringify(valid);
    });
    expect(k.topic).toBe("Database connection pooling");
    expect(seenPrompt).toContain("Indexing");
    expect(seenPrompt).toContain("Chăm con");
  });

  it("works with no focus area", async () => {
    let seenPrompt = "";
    await generateKnowledge([], null, async (_sys, user) => {
      seenPrompt = user;
      return JSON.stringify(valid);
    });
    expect(seenPrompt).toContain("any genuinely useful");
  });

  it("defaults an invalid cefr to B2", async () => {
    const k = await generateKnowledge([], null, async () =>
      JSON.stringify({ ...valid, cefr: "ZZ" })
    );
    expect(k.cefr).toBe("B2");
  });
});

describe("insert + dedup + detail", () => {
  it("dedups by topic and stores full detail", () => {
    const db = openDb(":memory:");
    expect(insertKnowledge(db, valid as KnowledgeGenerated, "2026-07-07T00:00:00Z")).toBe(true);
    expect(insertKnowledge(db, valid as KnowledgeGenerated, "2026-07-07T01:00:00Z")).toBe(false);
    expect(listKnowledgeTopics(db)).toEqual(["Database connection pooling"]);
    const detail = getKnowledgeDetail(db, 1);
    expect(detail?.detail_md).toContain("Problem");
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
