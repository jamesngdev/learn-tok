import { openDb } from "../src/lib/db";
import { pregenerateAudio } from "../src/lib/tts-pregen";

// One pre-generation pass over all non-ignored cards (news + knowledge detail).
// Run in a loop by the `pregen` service so the TTS cache stays warm.
async function main() {
  const db = openDb();
  const r = await pregenerateAudio(db, {
    newsLimit: 60,
    knowledgeLimit: 60,
    maxNew: 100000,
  });
  console.log(
    `pregen pass: generated=${r.generated} skipped=${r.skipped} failed=${r.failed} total=${r.total}`
  );
  db.close();
}

main().catch((err) => {
  console.error("pregen fatal:", err);
  process.exit(1);
});
