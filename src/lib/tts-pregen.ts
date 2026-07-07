import type { DB } from "./db";
import { synthesize, isCached } from "./tts";
import { translatePhrase } from "./words";
import { translateToVi } from "./translate";
import { markdownToSpeech, splitSentences } from "./speech-text";

export interface PregenResult {
  audioGenerated: number;
  audioSkipped: number;
  audioFailed: number;
  translated: number;
  total: number;
}

/**
 * Pre-generate everything driving mode needs for ALL non-ignored cards:
 *  - Vietnamese subtitle translation for each sentence (fast, cached in DB)
 *  - TTS audio for each sentence (slow on CPU, cached to disk)
 * Cached items are skipped, so re-runs only do new work. `maxNewAudio` bounds
 * how many fresh audio clips one pass generates.
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
    translated: 0,
    total: uniq.length,
  };

  const deps = { translateToVi, now: () => new Date().toISOString() };

  // Phase 1: Vietnamese subtitles (fast) — warms all subtitles quickly.
  for (const s of uniq) {
    try {
      await translatePhrase(db, s, deps);
      result.translated++;
    } catch {
      /* subtitle best-effort */
    }
  }

  // Phase 2: TTS audio (slow on CPU).
  for (const s of uniq) {
    if (result.audioGenerated >= maxNewAudio) break;
    if (isCached(s)) {
      result.audioSkipped++;
      continue;
    }
    try {
      await synthesize(s);
      result.audioGenerated++;
    } catch (err) {
      result.audioFailed++;
      if (result.audioFailed <= 3) console.error("pregen audio failed:", err);
    }
  }
  return result;
}
