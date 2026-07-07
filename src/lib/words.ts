import type { DB } from "./db";
import type { WordEntry } from "./types";
import type { DictResult } from "./dictionary";

export interface WordDeps {
  lookupDictionary: (w: string) => Promise<DictResult>;
  translateToVi: (t: string) => Promise<string | null>;
  now: () => string;
}

function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

export async function lookupWord(
  db: DB,
  rawWord: string,
  deps: WordDeps
): Promise<WordEntry> {
  const word = normalize(rawWord);
  const cached = db.prepare("SELECT * FROM words WHERE word = ?").get(word) as
    | WordEntry
    | undefined;
  if (cached) return cached;

  const [dict, meaning_vi] = await Promise.all([
    deps.lookupDictionary(word),
    deps.translateToVi(word),
  ]);
  const entry: WordEntry = {
    word,
    ipa: dict.ipa,
    audio_url: dict.audio_url,
    pos: dict.pos,
    meaning_vi,
    example: null,
  };
  db.prepare(
    `INSERT OR REPLACE INTO words (word, ipa, audio_url, pos, meaning_vi, example, created_at)
     VALUES (@word, @ipa, @audio_url, @pos, @meaning_vi, @example, @created_at)`
  ).run({ ...entry, created_at: deps.now() });
  return entry;
}

export function saveMyWord(
  db: DB,
  rawWord: string,
  now: string,
  articleId?: number
): void {
  db.prepare(
    `INSERT OR IGNORE INTO my_words (word, saved_at, source_article_id) VALUES (?, ?, ?)`
  ).run(normalize(rawWord), now, articleId ?? null);
}

export function listMyWords(db: DB): WordEntry[] {
  return db
    .prepare(
      `SELECT w.word, w.ipa, w.audio_url, w.pos, w.meaning_vi, w.example
       FROM my_words m JOIN words w ON w.word = m.word
       ORDER BY m.saved_at DESC`
    )
    .all() as WordEntry[];
}
