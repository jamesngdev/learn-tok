import type { DB } from "./db";
import { synthesize, isCached } from "./tts";
import { markdownToSpeech, splitSentences } from "./speech-text";

export interface PregenResult {
  generated: number;
  skipped: number;
  failed: number;
  total: number;
}

/**
 * Pre-synthesize TTS audio for the sentences of recent feed cards so driving
 * mode plays with zero wait. Cached sentences are skipped, so re-runs only do
 * new work; `maxNew` bounds how many fresh sentences one run will generate.
 */
export async function pregenerateAudio(
  db: DB,
  opts: { newsLimit?: number; knowledgeLimit?: number; maxNew?: number } = {}
): Promise<PregenResult> {
  const { newsLimit = 40, knowledgeLimit = 40, maxNew = 250 } = opts;

  const texts: string[] = [];

  const news = db
    .prepare(
      `SELECT title_en, summary_en FROM articles a
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='news' AND i.card_id=a.id)
       ORDER BY a.published_at DESC, a.id DESC LIMIT ?`
    )
    .all(newsLimit) as { title_en: string; summary_en: string }[];
  for (const n of news) texts.push(...splitSentences(`${n.title_en}. ${n.summary_en}`));

  const kn = db
    .prepare(
      `SELECT title_en, summary_en, detail_md FROM knowledge k
       WHERE NOT EXISTS (SELECT 1 FROM ignored i WHERE i.card_type='knowledge' AND i.card_id=k.id)
       ORDER BY k.created_at ASC, k.id ASC LIMIT ?`
    )
    .all(knowledgeLimit) as { title_en: string; summary_en: string; detail_md: string }[];
  for (const k of kn) {
    texts.push(
      ...splitSentences(`${k.title_en}. ${k.summary_en}. ${markdownToSpeech(k.detail_md)}`)
    );
  }

  const result: PregenResult = { generated: 0, skipped: 0, failed: 0, total: texts.length };
  for (const t of texts) {
    if (result.generated >= maxNew) break;
    if (isCached(t)) {
      result.skipped++;
      continue;
    }
    try {
      await synthesize(t);
      result.generated++;
    } catch (err) {
      result.failed++;
      if (result.failed <= 3) console.error("pregen failed:", err);
    }
  }
  return result;
}
