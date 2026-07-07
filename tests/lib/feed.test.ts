import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { getFeed } from "@/lib/feed";
import { ignoreCard } from "@/lib/ignore";

function seed(db: ReturnType<typeof openDb>, n: number) {
  const ins = db.prepare(
    `INSERT INTO articles (guid, source_url, title_en, summary_en, summary_vi, category, cefr, published_at, crawled_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (let i = 1; i <= n; i++) {
    const ts = i < 10 ? `2026-07-07T0${i}:00:00Z` : `2026-07-07T${i}:00:00Z`;
    ins.run(`g${i}`, `https://x/${i}`, `T${i}`, "S", "V", "World", "B1", ts, ts);
  }
}

function seedKnowledge(db: ReturnType<typeof openDb>, n: number) {
  const ins = db.prepare(
    `INSERT INTO knowledge (topic, category, title_en, summary_en, summary_vi, detail_md, diagram, cefr, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (let i = 1; i <= n; i++) {
    ins.run(`topic${i}`, "Health", `K${i}`, "S", "V", "md", "", "B2", `2026-07-0${i}T00:00:00Z`);
  }
}

describe("getFeed news mode", () => {
  it("returns only news, newest-first, with a cursor", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    seedKnowledge(db, 2);
    const page = getFeed(db, "news", null, 2);
    expect(page.cards.every((c) => c.type === "news")).toBe(true);
    expect(page.cards.map((c) => c.title_en)).toEqual(["T3", "T2"]);
    expect(page.nextCursor).not.toBeNull();
  });

  it("pages through news and ends with null", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    const p1 = getFeed(db, "news", null, 2);
    const p2 = getFeed(db, "news", p1.nextCursor, 2);
    expect(p2.cards.map((c) => c.title_en)).toEqual(["T1"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("excludes ignored news", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    ignoreCard(db, "news", 3, "t");
    const page = getFeed(db, "news", null, 10);
    expect(page.cards.map((c) => c.title_en)).not.toContain("T3");
  });
});

describe("getFeed knowledge mode", () => {
  it("returns only knowledge, oldest-first", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    seedKnowledge(db, 3);
    const page = getFeed(db, "knowledge", null, 10);
    expect(page.cards.every((c) => c.type === "knowledge")).toBe(true);
    expect(page.cards.map((c) => c.title_en)).toEqual(["K1", "K2", "K3"]);
  });

  it("paginates knowledge with the cursor", () => {
    const db = openDb(":memory:");
    seedKnowledge(db, 3);
    const p1 = getFeed(db, "knowledge", null, 2);
    expect(p1.cards.map((c) => c.title_en)).toEqual(["K1", "K2"]);
    const p2 = getFeed(db, "knowledge", p1.nextCursor, 2);
    expect(p2.cards.map((c) => c.title_en)).toEqual(["K3"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("excludes ignored knowledge", () => {
    const db = openDb(":memory:");
    seedKnowledge(db, 2);
    ignoreCard(db, "knowledge", 1, "t");
    const page = getFeed(db, "knowledge", null, 10);
    expect(page.cards.map((c) => c.title_en)).toEqual(["K2"]);
  });
});
