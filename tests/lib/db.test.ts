import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";

describe("openDb", () => {
  it("creates the articles, words, and my_words tables", () => {
    const db = openDb(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("articles");
    expect(tables).toContain("words");
    expect(tables).toContain("my_words");
  });

  it("enforces unique guid on articles", () => {
    const db = openDb(":memory:");
    const ins = db.prepare(
      "INSERT INTO articles (guid, source_url, title_en, summary_en, summary_vi, category, cefr, published_at, crawled_at) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    ins.run("g1", "u", "t", "s", "v", "World", "B1", "2026-07-07T00:00:00Z", "2026-07-07T00:00:00Z");
    expect(() =>
      ins.run("g1", "u", "t", "s", "v", "World", "B1", "2026-07-07T00:00:00Z", "2026-07-07T00:00:00Z")
    ).toThrow();
  });
});
