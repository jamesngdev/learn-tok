import { openDb } from "../src/lib/db";
import { crawlNow } from "../src/lib/crawl-live";
import { topUpKnowledge } from "../src/lib/knowledge-live";
import { pregenerateAudio } from "../src/lib/tts-pregen";

async function main() {
  const db = openDb();
  const result = await crawlNow(db);
  console.log(
    `crawl done: inserted=${result.inserted} skipped=${result.skipped} failed=${result.failed}`
  );
  // Keep a steady supply of backend-knowledge cards in the feed.
  const kn = await topUpKnowledge(db, 10, 3);
  console.log(`knowledge topup: generated=${kn.generated} active=${kn.active}`);
  // Pre-synthesize TTS so driving mode plays with zero wait (cached-aware).
  const tts = await pregenerateAudio(db, { maxNew: 250 });
  console.log(
    `tts pregen: generated=${tts.generated} skipped=${tts.skipped} failed=${tts.failed} total=${tts.total}`
  );
  db.close();
}

main().catch((err) => {
  console.error("crawl fatal:", err);
  process.exit(1);
});
