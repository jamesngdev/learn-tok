import { openDb } from "../src/lib/db";
import { pregenerateAudio } from "../src/lib/tts-pregen";

// One pre-generation pass over all non-ignored cards (news + knowledge detail).
// Run in a loop by the `pregen` service so the TTS cache stays warm.
async function main() {
  const db = openDb();
  const r = await pregenerateAudio(db);
  console.log(
    `pregen pass: audio_gen=${r.audioGenerated} audio_skip=${r.audioSkipped} ` +
      `audio_fail=${r.audioFailed} translated=${r.translated} total=${r.total}`
  );
  db.close();
}

main().catch((err) => {
  console.error("pregen fatal:", err);
  process.exit(1);
});
