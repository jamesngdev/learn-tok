import type { DB } from "./db";
import type { RssItem } from "./rss";
import type { Summary } from "./types";

export interface CrawlDeps {
  fetchFrontPage: () => Promise<RssItem[]>;
  fetchArticleBody: (url: string) => Promise<string>;
  summarize: (input: { title: string; body: string }) => Promise<Summary>;
  now: () => string;
}

export interface CrawlResult {
  inserted: number;
  skipped: number;
  failed: number;
}

export async function runCrawl(db: DB, deps: CrawlDeps): Promise<CrawlResult> {
  const result: CrawlResult = { inserted: 0, skipped: 0, failed: 0 };
  const items = await deps.fetchFrontPage();
  const exists = db.prepare("SELECT 1 FROM articles WHERE guid = ?");
  const insert = db.prepare(
    `INSERT INTO articles
       (guid, source_url, title_en, summary_en, summary_vi, category, cefr, published_at, crawled_at)
     VALUES (@guid, @source_url, @title_en, @summary_en, @summary_vi, @category, @cefr, @published_at, @crawled_at)`
  );

  for (const item of items) {
    if (exists.get(item.guid)) {
      result.skipped++;
      continue;
    }
    try {
      const body = await deps.fetchArticleBody(item.link);
      const s = await deps.summarize({ title: item.title, body });
      insert.run({
        guid: item.guid,
        source_url: item.link,
        title_en: s.title_en,
        summary_en: s.summary_en,
        summary_vi: s.summary_vi,
        category: s.category,
        cefr: s.cefr,
        published_at: item.isoDate,
        crawled_at: deps.now(),
      });
      result.inserted++;
    } catch (err) {
      console.error(`crawl failed for ${item.link}:`, err);
      result.failed++;
    }
  }
  return result;
}
