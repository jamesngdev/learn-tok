import type { DB } from "./db";
import { runCrawl, type CrawlResult } from "./crawl";
import { fetchFrontPage } from "./rss";
import { fetchArticleBody } from "./article";
import { summarize } from "./deepseek";

/**
 * Run a crawl against the real VnExpress + DeepSeek services.
 * Shared by the hourly cron script and the on-demand /api/refresh route.
 */
export function crawlNow(db: DB): Promise<CrawlResult> {
  return runCrawl(db, {
    fetchFrontPage: () => fetchFrontPage(),
    fetchArticleBody: (url) => fetchArticleBody(url),
    summarize: (input) => summarize(input),
    now: () => new Date().toISOString(),
  });
}
