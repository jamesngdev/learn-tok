import { openDb } from "../src/lib/db";
import { runCrawl } from "../src/lib/crawl";
import { fetchFrontPage } from "../src/lib/rss";
import { fetchArticleBody } from "../src/lib/article";
import { summarize } from "../src/lib/deepseek";

async function main() {
  const db = openDb();
  const result = await runCrawl(db, {
    fetchFrontPage: () => fetchFrontPage(),
    fetchArticleBody: (url) => fetchArticleBody(url),
    summarize: (input) => summarize(input),
    now: () => new Date().toISOString(),
  });
  console.log(
    `crawl done: inserted=${result.inserted} skipped=${result.skipped} failed=${result.failed}`
  );
  db.close();
}

main().catch((err) => {
  console.error("crawl fatal:", err);
  process.exit(1);
});
