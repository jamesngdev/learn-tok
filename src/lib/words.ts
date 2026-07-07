import type { DB } from "./db";
import type { WordEntry } from "./types";
import type { DictResult } from "./dictionary";

export interface WordDeps {
  lookupDictionary: (w: string) => Promise<DictResult>;
  translateToVi: (t: string) => Promise<string | null>;
  now: () => string;
}

// Keep letters, digits, spaces, apostrophes and hyphens so multi-word phrases
// survive (a single tapped word has no spaces and normalizes as before).
function normalize(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * Translate arbitrary text to Vietnamese, cached in the words table so each
 * unique sentence is only translated once (used for driving-mode subtitles).
 */
export async function translatePhrase(
  db: DB,
  rawText: string,
  deps: { translateToVi: (t: string) => Promise<string | null>; now: () => string }
): Promise<string | null> {
  const key = normalize(rawText);
  if (!key) return null;
  const cached = db.prepare("SELECT meaning_vi FROM words WHERE word = ?").get(key) as
    | { meaning_vi: string | null }
    | undefined;
  if (cached && cached.meaning_vi) return cached.meaning_vi;
  const vi = await deps.translateToVi(rawText);
  db.prepare(
    `INSERT OR IGNORE INTO words (word, ipa, audio_url, pos, meaning_vi, example, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(key, null, null, null, vi, null, deps.now());
  if (vi) {
    db.prepare(
      "UPDATE words SET meaning_vi = ? WHERE word = ? AND (meaning_vi IS NULL OR meaning_vi = '')"
    ).run(vi, key);
  }
  return vi;
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
