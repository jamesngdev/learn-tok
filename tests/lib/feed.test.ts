import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { getFeed } from "@/lib/feed";

function seed(db: ReturnType<typeof openDb>, n: number) {
  const ins = db.prepare(
    `INSERT INTO articles (guid, source_url, title_en, summary_en, summary_vi, category, cefr, published_at, crawled_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (let i = 1; i <= n; i++) {
    const ts = `2026-07-07T0${i}:00:00Z`;
    ins.run(`g${i}`, `https://x/${i}`, `T${i}`, "S", "V", "World", "B1", ts, ts);
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
});
