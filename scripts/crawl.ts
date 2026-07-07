import { openDb } from "../src/lib/db";
import { crawlNow } from "../src/lib/crawl-live";

async function main() {
  const db = openDb();
  const result = await crawlNow(db);
  console.log(
    `crawl done: inserted=${result.inserted} skipped=${result.skipped} failed=${result.failed}`
  );
  db.close();
}

main().catch((err) => {
  console.error("crawl fatal:", err);
  process.exit(1);
});
