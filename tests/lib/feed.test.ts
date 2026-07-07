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
    ins.run(`topic${i}`, "Database", `K${i}`, "S", "V", "md", "", "B2", `2026-07-0${i}T00:00:00Z`);
  }
}

describe("getFeed", () => {
  it("returns newest-first cards with a cursor", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    const page = getFeed(db, null, 2);
    expect(page.cards.map((c) => c.title_en)).toEqual(["T3", "T2"]);
    expect(page.cards[0].type).toBe("news");
    expect(page.nextCursor).not.toBeNull();
  });

  it("pages through with the cursor and ends with null", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    const p1 = getFeed(db, null, 2);
    const p2 = getFeed(db, p1.nextCursor, 2);
    expect(p2.cards.map((c) => c.title_en)).toEqual(["T1"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("alternates 1 news : 1 knowledge (news even, knowledge odd)", () => {
    const db = openDb(":memory:");
    seed(db, 5);
    seedKnowledge(db, 5);
    const page = getFeed(db, null, 10);
    expect(page.cards.map((c) => c.type)).toEqual([
      "news", "knowledge", "news", "knowledge", "news",
      "knowledge", "news", "knowledge", "news", "knowledge",
    ]);
    // Knowledge is oldest-first.
    expect(page.cards[1].title_en).toBe("K1");
  });

  it("keeps the alternation across pages via the cursor", () => {
    const db = openDb(":memory:");
    seed(db, 5);
    seedKnowledge(db, 5);
    const p1 = getFeed(db, null, 4); // N K N K
    expect(p1.cards.map((c) => c.type)).toEqual(["news", "knowledge", "news", "knowledge"]);
    const p2 = getFeed(db, p1.nextCursor, 4); // continues N K N K
    expect(p2.cards.map((c) => c.type)).toEqual(["news", "knowledge", "news", "knowledge"]);
    expect(p2.cards[1].title_en).toBe("K3");
  });

  it("excludes ignored news and knowledge", () => {
    const db = openDb(":memory:");
    seed(db, 3);
    seedKnowledge(db, 1);
    ignoreCard(db, "news", 3, "t"); // T3
    ignoreCard(db, "knowledge", 1, "t");
    const page = getFeed(db, null, 10);
    const titles = page.cards.map((c) => c.title_en);
    expect(titles).not.toContain("T3");
    expect(titles).not.toContain("K1");
  });
});
