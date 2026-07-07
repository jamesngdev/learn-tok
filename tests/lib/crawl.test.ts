import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import { runCrawl } from "@/lib/crawl";
import type { RssItem } from "@/lib/rss";
import type { Summary } from "@/lib/types";

const items: RssItem[] = [
  { guid: "g1", link: "https://x/1", title: "Tin 1", isoDate: "2026-07-07T03:00:00Z" },
  { guid: "g2", link: "https://x/2", title: "Tin 2", isoDate: "2026-07-07T02:00:00Z" },
];
const summary: Summary = {
  title_en: "T", summary_en: "S", summary_vi: "V", category: "World", cefr: "B1",
};
const deps = {
  fetchFrontPage: async () => items,
  fetchArticleBody: async () => "body",
  summarize: async () => summary,
  now: () => "2026-07-07T04:00:00Z",
};

describe("runCrawl", () => {
  it("inserts new articles and dedups on re-run", async () => {
    const db = openDb(":memory:");
    const r1 = await runCrawl(db, deps);
    expect(r1.inserted).toBe(2);
    const r2 = await runCrawl(db, deps);
    expect(r2.inserted).toBe(0);
    expect(r2.skipped).toBe(2);
    const count = db.prepare("SELECT COUNT(*) c FROM articles").get() as any;
    expect(count.c).toBe(2);
  });

  it("counts a per-article failure without aborting", async () => {
    const db = openDb(":memory:");
    let calls = 0;
    const r = await runCrawl(db, {
      ...deps,
      summarize: async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return summary;
      },
    });
    expect(r.failed).toBe(1);
    expect(r.inserted).toBe(1);
  });
});
