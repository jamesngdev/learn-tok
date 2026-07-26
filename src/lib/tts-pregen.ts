import type { DB } from "./db";
import { synthesize, isCached } from "./tts";
import { markdownToSpeech, splitSentences } from "./speech-text";

/** Gap between two freshly generated clips (the TTS service is remote). */
const PACE_MS = Number(process.env.TTS_PACE_MS ?? 200);

export interface PregenResult {
  audioGenerated: number;
  audioSkipped: number;
  audioFailed: number;
  total: number;
}

/**
 * Pre-generate the TTS audio driving mode needs for ALL non-ignored cards
 * (slow on CPU, cached to disk). Cached clips are skipped, so re-runs only do
 * new work. `maxNewAudio` bounds how many fresh clips one pass generates.
 */
export async function pregenerateAudio(
  db: DB,
  opts: { limit?: number; maxNewAudio?: number } = {}
): Promise<PregenResult> {
  const { limit = 1000, maxNewAudio = 100000 } = opts;

  const sentences: string[] = [];

  const news = db
    .prepare(
      `SELECT title_en, summary_en FROM articles a
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
       ORDER BY a.published_at DESC, a.id DESC LIMIT ?`
    )
    .all(limit) as { title_en: string; summary_en: string }[];
  for (const n of news) sentences.push(...splitSentences(`${n.title_en}. ${n.summary_en}`));

  const kn = db
    .prepare(
      `SELECT title_en, summary_en, detail_md FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
       ORDER BY k.created_at ASC, k.id ASC LIMIT ?`
    )
    .all(limit) as { title_en: string; summary_en: string; detail_md: string }[];
  for (const k of kn) {
    sentences.push(
      ...splitSentences(`${k.title_en}. ${k.summary_en}. ${markdownToSpeech(k.detail_md)}`)
    );
  }

  // Dedup identical sentences across cards.
  const uniq = [...new Set(sentences)];
  const result: PregenResult = {
    audioGenerated: 0,
    audioSkipped: 0,
    audioFailed: 0,
    total: uniq.length,
  };

  // TTS audio. Cached sentences cost nothing; new ones are paced a little so a
  // full warm-up doesn't hammer the TTS service with hundreds of requests.
  for (const s of uniq) {
    if (result.audioGenerated >= maxNewAudio) break;
    if (isCached(s)) {
      result.audioSkipped++;
      continue;
    }
    try {
      await synthesize(s);
      result.audioGenerated++;
      await new Promise((r) => setTimeout(r, PACE_MS));
    } catch (err) {
      result.audioFailed++;
      if (result.audioFailed <= 3) console.error("pregen audio failed:", err);
    }
  }
  return result;
}
