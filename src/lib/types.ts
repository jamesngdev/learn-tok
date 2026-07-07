export type Cefr = "A2" | "B1" | "B2" | "C1";

export interface Summary {
  title_en: string;
  summary_en: string;
  summary_vi: string;
  category: string;
  cefr: Cefr;
}

export interface Article extends Summary {
  id: number;
  guid: string;
  source_url: string;
  published_at: string;
  crawled_at: string;
}

export interface NewsCard extends Summary {
  type: "news";
  id: number;
  source_url: string;
  published_at: string;
}

export type KnowledgeCategory = "Database" | "System" | "Security" | "Technique";

export interface KnowledgeGenerated {
  topic: string;
  category: string;
  title_en: string;
  summary_en: string;
  summary_vi: string;
  detail_md: string;
  diagram: string;
  cefr: Cefr;
}

export interface Knowledge extends KnowledgeGenerated {
  id: number;
  created_at: string;
}

/** Feed card for knowledge — front fields only; detail is fetched on demand. */
export interface KnowledgeCard {
  type: "knowledge";
  id: number;
  category: string;
  title_en: string;
  summary_en: string;
  summary_vi: string;
  cefr: Cefr;
  created_at: string;
}

/** Full detail returned by /api/knowledge/[id]. */
export interface KnowledgeDetail {
  id: number;
  category: string;
  title_en: string;
  summary_en: string;
  summary_vi: string;
  detail_md: string;
  diagram: string;
}

export type Card = NewsCard | KnowledgeCard;

export interface WordEntry {
  word: string;
  ipa: string | null;
  audio_url: string | null;
  pos: string | null;
  meaning_vi: string | null;
  example: string | null;
}
