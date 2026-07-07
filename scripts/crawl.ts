import { openDb } from "../src/lib/db";
import { crawlNow } from "../src/lib/crawl-live";
import { topUpKnowledge } from "../src/lib/knowledge-live";

async function main() {
  const db = openDb();
  const result = await crawlNow(db);
  console.log(
    `crawl done: inserted=${result.inserted} skipped=${result.skipped} failed=${result.failed}`
  );
  // Keep a steady supply of backend-knowledge cards in the feed.
  const kn = await topUpKnowledge(db, 10, 3);
  console.log(`knowledge topup: generated=${kn.generated} active=${kn.active}`);
  // TTS pre-generation runs continuously in the dedicated `pregen` service.
  db.close();
}

main().catch((err) => {
  console.error("crawl fatal:", err);
  process.exit(1);
});
